import type { ReactNode } from 'react'

export function StatTile({
  label,
  value,
  icon,
  accent,
  bg,
}: {
  label: string
  value: string
  icon: ReactNode
  accent: string
  bg: string
}) {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#111] px-4 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${bg} ${accent}`}>
          {icon}
        </div>
        <span className="text-[11px] font-medium text-zinc-600">{label}</span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
    </div>
  )
}
