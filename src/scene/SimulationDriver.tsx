import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'
import { isReducedMotion } from '../a11y/preferences'
import { RIDE_HEIGHT_MM, SUSPENSION, TERRAIN, VEHICLE, WADE, WHEELS } from '../config'
import { sim } from '../sim/simState'
import { contactHeight, terrainHeight } from '../sim/terrain'
import { computeHealth, stepDamperTemp } from '../sim/health'
import { cloneTrip, emptyTrip, type Quad } from '../sim/types'
import {
  selectTargetHeight,
  selectWadeStatus,
  useTelemetryStore,
  type TelemetryState,
  type WadeStatus,
} from '../store/useTelemetryStore'

const PUBLISH_INTERVAL_S = 1 / 12
const HAZARD_RANGE_M = 26
const TRACK_X = [WHEELS[0].x, WHEELS[1].x]
const { damp } = MathUtils

function targetSpeedKmh(s: TelemetryState, wade: WadeStatus): number {
  if (s.phase !== 'ON_RIDE') return 0
  switch (s.rideMode) {
    case 'HIGHWAY':
      return 110
    case 'ROUGH':
      return 26 - 14 * s.roughness
    case 'FLOOD':
      return wade === 'EXCEEDED' ? 0 : wade === 'WARNING' ? 4 : 7
  }
}

/** Scan both wheel tracks ahead for the nearest obstacle above the amber threshold and find its peak. */
function detectHazard(enabled: boolean) {
  const hz = sim.hazard
  hz.active = false
  if (!enabled || sim.amplitude < 0.1) return

  let firstZ = 0
  for (let z = VEHICLE.frontZ - 0.4; z > -HAZARD_RANGE_M; z -= 0.25) {
    for (const x of TRACK_X) {
      const h = terrainHeight(x, z - sim.travel, sim.amplitude)
      if (h <= TERRAIN.AMBER_M) continue
      if (!hz.active) {
        hz.active = true
        firstZ = z
        hz.h = 0
      }
      if (h > hz.h) {
        hz.h = h
        hz.x = x
        hz.z = z
      }
    }
    if (hz.active && z < firstZ - 1.5) break
  }
}

/**
 * The single per-frame writer of `sim`. Every animated quantity is eased toward a target
 * derived from the store, so state changes from the dev panel always animate smoothly.
 */
export function SimulationDriver() {
  const acc = useRef({
    publishT: 0,
    tripId: -1,
    trip: emptyTrip(),
    lastHazardS: Infinity,
    prevTravel: [0, 0, 0, 0],
    atStop: [false, false, false, false],
  })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) // avoid a jump after the tab was in the background
    const s = useTelemetryStore.getState()
    const onRide = s.phase === 'ON_RIDE'
    const mode = onRide ? s.rideMode : null
    const wade = selectWadeStatus(s)
    sim.time += dt
    sim.reducedMotion = isReducedMotion()
    sim.xray = damp(sim.xray, s.cameraView === 'suspension' ? 0.2 : s.phase === 'PRE_DRIVE' ? 0.55 : s.phase === 'POST_DRIVE' ? 0.4 : 1, 3, dt)

    // Ride height: critically damped spring, so lifts ease in and out like a real air system.
    const targetHeight = RIDE_HEIGHT_MM[selectTargetHeight(s)] / 1000
    const k = 6
    sim.rideVelocity += ((targetHeight - sim.rideHeight) * k - sim.rideVelocity * 2 * Math.sqrt(k)) * dt
    sim.rideHeight += sim.rideVelocity * dt

    sim.speed = damp(sim.speed, targetSpeedKmh(s, wade) / 3.6, 0.9, dt)
    sim.travel += sim.speed * dt
    sim.amplitude = damp(sim.amplitude, mode === 'ROUGH' ? 0.2 + s.roughness : mode === 'FLOOD' ? 0.12 : 0, 1.2, dt)
    sim.roadness = damp(sim.roadness, mode === 'HIGHWAY' ? 1 : 0, 2, dt)
    sim.intensity = damp(sim.intensity, mode === 'ROUGH' ? 1 : mode === 'FLOOD' ? 0.7 : mode ? 0.55 : 0.35, 2, dt)
    sim.scan = damp(sim.scan, mode === 'ROUGH' ? 1 : mode ? 0.35 : s.phase === 'PRE_DRIVE' ? 0.6 : 0, 2, dt)
    sim.water = damp(sim.water, mode === 'FLOOD' ? s.waterDepthMm / 1000 : 0, 2.5, dt)
    sim.floodCue = damp(sim.floodCue, mode === 'FLOOD' ? 1 : 0, 3, dt)
    sim.alert = damp(sim.alert, wade === 'EXCEEDED' ? 2 : wade === 'WARNING' ? 1 : 0, 4, dt)
    sim.reverseCue = damp(sim.reverseCue, wade === 'EXCEEDED' ? 1 : 0, 3, dt)

    // Wheels track the terrain exactly; the chassis only follows the slow mean (no pitch, no roll).
    let mean = 0
    let hMin = Infinity
    let hMax = -Infinity
    for (let i = 0; i < 4; i++) {
      const h = contactHeight(WHEELS[i].x, WHEELS[i].z - sim.travel, sim.amplitude)
      sim.wheelY[i] = VEHICLE.wheelRadius + h
      mean += h
      hMin = Math.min(hMin, h)
      hMax = Math.max(hMax, h)
    }
    sim.heave = damp(sim.heave, mean / 4, 1, dt)
    // Bump and droop stops: stroke is measured from the standard-height design position, so the
    // allowed wheel travel shifts with the air-suspension ride height (more bump room when lowered).
    const rideOffset = sim.rideHeight - VEHICLE.standardClearance
    const lowest = hMax - rideOffset - SUSPENSION.BUMP_M
    const highest = hMin - rideOffset + SUSPENSION.DROOP_M
    if (lowest <= highest) sim.heave = Math.min(highest, Math.max(lowest, sim.heave))
    for (let i = 0; i < 4; i++) sim.wheelTravel[i] = sim.wheelY[i] - VEHICLE.wheelRadius - sim.heave
    sim.wheelSpin -= (sim.speed * dt) / VEHICLE.wheelRadius

    detectHazard(mode === 'ROUGH')

    // Trip accumulation.
    const a = acc.current
    if (a.tripId !== s.tripId) {
      a.tripId = s.tripId
      a.trip = emptyTrip()
      a.lastHazardS = Infinity
      a.atStop.fill(false)
    }

    // Per-corner damper velocity drives heat (always, so dampers cool while parked) and, while
    // driving, the wear inputs the health model uses.
    for (let i = 0; i < 4; i++) {
      const travel = sim.wheelTravel[i]
      const v = (travel - a.prevTravel[i]) / dt
      a.prevTravel[i] = travel
      sim.damperTemp[i] = stepDamperTemp(sim.damperTemp[i], v, sim.speed, dt)
      if (!onRide) continue
      const t = a.trip
      t.strokeM[i] += Math.abs(v) * dt
      t.peakStrokeMm[i] = Math.max(t.peakStrokeMm[i], Math.abs(travel) * 1000)
      t.peakTempC[i] = Math.max(t.peakTempC[i], sim.damperTemp[i])
      const stroke = travel - rideOffset
      const limit = stroke > 0 ? SUSPENSION.BUMP_M : SUSPENSION.DROOP_M
      if (Math.abs(stroke) >= limit - 0.003) {
        if (!a.atStop[i]) t.bumpStops[i]++
        a.atStop[i] = true
      } else if (Math.abs(stroke) < limit * 0.8) {
        a.atStop[i] = false
      }
    }

    if (onRide) {
      const t = a.trip
      t.durationS += dt
      t.distanceM += sim.speed * dt
      t.maxWaterMm = Math.max(t.maxWaterMm, s.waterDepthMm)
      if (s.waterDepthMm >= WADE.AUTO_RAISE_MM) t.wadeSeconds += dt
      if (sim.rideVelocity > 0.003) t.compressorS += dt // air is being added while the body rises
      for (const travel of sim.wheelTravel) t.maxWheelTravelMm = Math.max(t.maxWheelTravelMm, Math.abs(travel) * 1000)
      if (sim.hazard.active) {
        const hazardS = sim.hazard.z - sim.travel // ground-fixed coordinate of the obstacle
        if (Math.abs(hazardS - a.lastHazardS) > 1.5) t.predictiveAdjustments++
        a.lastHazardS = hazardS
      }
    }

    a.publishT += dt
    if (a.publishT < PUBLISH_INTERVAL_S) return

    if (s.autoWade && mode === 'FLOOD') {
      // Slow enough to read the explanations on screen, and slower again past 750 mm for the amber band.
      const next = s.waterDepthMm + (s.waterDepthMm < 750 ? 70 : 40) * a.publishT
      s.setWaterDepth(next)
      if (next >= WADE.SENSOR_MAX_MM) s.setAutoWade(false)
    }

    const hz = sim.hazard
    s.publish(
      {
        rideHeightMm: Math.round(sim.rideHeight * 1000),
        speedKmh: Math.round(sim.speed * 3.6),
        wheelTravelMm: [0, 1, 2, 3].map((i) => Math.round(sim.wheelTravel[i] * 1000)) as [number, number, number, number],
        hazard: hz.active
          ? { distanceM: Math.max(0, VEHICLE.frontZ - hz.z), heightMm: Math.round(hz.h * 1000) }
          : null,
        damperTempC: [0, 1, 2, 3].map((i) => sim.damperTemp[i]) as Quad,
        health:
          s.phase === 'POST_DRIVE'
            ? computeHealth({ trip: a.trip, tempsC: sim.damperTemp, rideHeightMm: sim.rideHeight * 1000, fault: s.suspensionFault })
            : null,
      },
      onRide ? cloneTrip(a.trip) : undefined,
    )
    a.publishT = 0
  })

  return null
}
