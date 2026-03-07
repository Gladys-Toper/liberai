'use client'

import { motion } from 'framer-motion'

// ── Types ──────────────────────────────────────────────────────────────
interface Sponsor {
  id: string
  name: string
  tagline: string
  logo_url?: string | null
  tier: string // 'gold' | 'silver' | 'bronze'
}

interface SponsorChyronProps {
  sponsors: Array<{
    chyron_text?: string | null
    sponsor?: Sponsor | null
  }>
  modelAttribution?: {
    referee: string
    commentator: string
  }
}

const TIER_STYLES: Record<string, { accent: string; glow: string }> = {
  gold: { accent: '#d4a017', glow: 'rgba(212,160,23,0.15)' },
  silver: { accent: '#94a3b8', glow: 'rgba(148,163,184,0.1)' },
  bronze: { accent: '#b87333', glow: 'rgba(184,115,51,0.1)' },
}

// ── Main Component ─────────────────────────────────────────────────────
export function SponsorChyron({ sponsors, modelAttribution }: SponsorChyronProps) {
  const activeSponsors = sponsors?.filter((s) => s.sponsor) || []

  if (activeSponsors.length === 0 && !modelAttribution) return null

  // Build ticker items
  const tickerItems: Array<{ key: string; content: React.ReactNode }> = []

  // Model attribution
  if (modelAttribution) {
    tickerItems.push({
      key: 'model-attr',
      content: (
        <span className="flex items-center gap-3">
          <span className="text-zinc-600">⚖</span>
          <span>
            <span className="text-zinc-600">Judged by </span>
            <span className="font-bold text-blue-400">{modelAttribution.referee}</span>
          </span>
          <span className="text-zinc-700">•</span>
          <span>
            <span className="text-zinc-600">Commentary by </span>
            <span className="font-bold text-red-400">{modelAttribution.commentator}</span>
          </span>
        </span>
      ),
    })
  }

  // Sponsor items
  activeSponsors.forEach((assignment, i) => {
    const sponsor = assignment.sponsor!
    const tier = TIER_STYLES[sponsor.tier] || TIER_STYLES.bronze
    const text = assignment.chyron_text || sponsor.tagline || sponsor.name

    tickerItems.push({
      key: `sponsor-${sponsor.id}-${i}`,
      content: (
        <span className="flex items-center gap-2.5">
          {sponsor.logo_url && (
            <img
              src={sponsor.logo_url}
              alt=""
              className="h-3.5 w-auto object-contain opacity-70"
            />
          )}
          <span className="font-bold" style={{ color: tier.accent }}>
            {sponsor.name}
          </span>
          <span className="text-zinc-500">—</span>
          <span className="text-zinc-400">{text}</span>
        </span>
      ),
    })
  })

  // Duplicate for seamless loop
  const doubled = [...tickerItems, ...tickerItems]

  return (
    <div
      className="relative overflow-hidden rounded-sm"
      style={{
        background: 'linear-gradient(90deg, rgba(10,10,10,0.95), rgba(20,20,20,0.9), rgba(10,10,10,0.95))',
        borderTop: '1px solid rgba(212,160,23,0.15)',
        borderBottom: '1px solid rgba(212,160,23,0.08)',
      }}
    >
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, #0a0a0a, transparent)' }}
      />
      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, #0a0a0a)' }}
      />

      {/* Scrolling content */}
      <div className="relative py-2 px-4">
        <motion.div
          className="flex items-center gap-10 whitespace-nowrap text-[11px]"
          animate={{ x: ['0%', '-50%'] }}
          transition={{
            x: {
              duration: tickerItems.length * 12,
              repeat: Infinity,
              ease: 'linear',
            },
          }}
        >
          {doubled.map((item, i) => (
            <div key={`${item.key}-${i}`} className="flex items-center gap-3 shrink-0">
              {item.content}
              <span className="text-amber-900/40 ml-4">◆</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Subtle gold accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(212,160,23,0.2), transparent)',
        }}
      />
    </div>
  )
}
