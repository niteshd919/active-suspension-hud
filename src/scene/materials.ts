import * as THREE from 'three'
import { COLOR } from '../theme/palette'

export { COLOR }

/** 0 → cyan, 1 → amber, 2 → red. */
export function alertColor(level: number, out: THREE.Color): THREE.Color {
  return level <= 1
    ? out.lerpColors(COLOR.cyan, COLOR.amber, Math.max(0, level))
    : out.lerpColors(COLOR.amber, COLOR.red, Math.min(1, level - 1))
}

/** 0 → green, ~0.6 → amber, 1 → red. Used for suspension strain. */
export function strainColor(t: number, out: THREE.Color): THREE.Color {
  return t <= 0.6
    ? out.lerpColors(COLOR.green, COLOR.amber, Math.max(0, t) / 0.6)
    : out.lerpColors(COLOR.amber, COLOR.red, Math.min(1, (t - 0.6) / 0.4))
}

/**
 * Fresnel rim + horizontal scan lines + a rising sweep: reads as a projected hologram on black.
 * `uMotion` (0..1) fades the travelling sweep out for reduced-motion users; the static rim and
 * scan lines stay so the shape remains readable.
 */
export function createHologramMaterial(opacity = 0.32) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: COLOR.cyan.clone() },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uMotion: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uMotion;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 2.5);
        float lines = smoothstep(0.86, 1.0, fract(vWorld.y * 14.0));
        float sweepY = fract(uTime * 0.3) * 3.0 - 0.3;
        float sweep = uMotion * exp(-pow((vWorld.y - sweepY) * 9.0, 2.0));
        float alpha = uOpacity * (0.02 + 0.45 * fresnel + 0.14 * lines + 0.3 * sweep);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
}
