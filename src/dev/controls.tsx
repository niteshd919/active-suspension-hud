import { useId, type ReactNode } from 'react'

/** Small accessible control kit for the dev panel: native inputs underneath, so keyboard and AT support come for free. */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 border-t border-white/15 pt-4">
      <h3 id={id} className="text-xs font-bold tracking-[0.14em] text-zinc-300 uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

interface Option<T> {
  id: T
  label: string
  hint?: string
}

/** Radio group styled as a segmented control. Arrow keys move the selection; Tab enters and leaves the group. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns = options.length,
}: {
  label: string
  options: Option<T>[]
  /** `null` shows no selection (for example, scenario buttons while parked). */
  value: T | null
  onChange: (value: T) => void
  columns?: number
}) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-lg bg-white/10 p-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <label key={String(o.id)} className="relative block">
          <input
            type="radio"
            name={name}
            value={String(o.id)}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            className="peer sr-only"
          />
          <span className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md px-1 py-1 text-center text-sm font-semibold text-zinc-100 transition-colors peer-checked:bg-cyan-300 peer-checked:text-zinc-950 peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white hover:bg-white/15 peer-checked:hover:bg-cyan-300">
            {o.label}
            {o.hint && <kbd className="font-sans text-xs font-normal opacity-80">{o.hint}</kbd>}
          </span>
        </label>
      ))}
    </div>
  )
}

/** On/off switch (checkbox with role="switch"). The thumb position, not just the colour, shows the state. */
export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-1 hover:bg-white/5">
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-zinc-100">{label}</span>
        {hint && <span className="text-xs text-zinc-400">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-cyan-300 peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-5 peer-checked:after:bg-zinc-950"
      />
    </label>
  )
}

export function Slider({
  label,
  value,
  display,
  valueText,
  min,
  max,
  step,
  onChange,
  marks,
}: {
  label: string
  value: number
  display: string
  /** Spoken form of the value, e.g. "620 millimetres". */
  valueText?: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  marks?: { value: number; label: string; className: string }[]
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="flex justify-between text-sm font-semibold text-zinc-100">
        <span>{label}</span>
        <output htmlFor={id} className="text-cyan-200 tabular-nums">
          {display}
        </output>
      </label>
      <input
        id={id}
        type="range"
        className="dev-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText ?? display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {marks && (
        <div aria-hidden="true" className="relative mx-3 h-5">
          {marks.map((m) => (
            <span
              key={m.value}
              className={`absolute top-0 flex -translate-x-1/2 flex-col items-center text-xs font-bold ${m.className}`}
              style={{ left: `${((m.value - min) / (max - min)) * 100}%` }}
            >
              <span className="h-1.5 w-0.5 bg-current" />
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function Readout({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-zinc-400">{label}</dt>
      <dd className={`text-right font-semibold text-zinc-100 tabular-nums ${className}`}>{value}</dd>
    </div>
  )
}
