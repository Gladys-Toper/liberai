'use client'

import { useEffect, useState } from 'react'

interface Axiom {
  id: string
  label: string
  hp_current: number
  is_destroyed: boolean
  side: 'a' | 'b'
  axiom_index: number
}

interface AttackLine {
  fromId: string
  toId: string
  side: 'a' | 'b'
  timestamp: number
}

interface BattlefieldGraphProps {
  axiomsA: Axiom[]
  axiomsB: Axiom[]
  latestAttack?: { attackerSide: 'a' | 'b'; targetAxiomId: string } | null
  collapsible?: boolean
  defaultCollapsed?: boolean
}

const NODE_RADIUS_BASE = 22
const PADDING_X = 60
const PADDING_Y = 40
const SVG_WIDTH = 400
const NODE_SPACING_Y = 70

export function BattlefieldGraph({ axiomsA, axiomsB, latestAttack, collapsible, defaultCollapsed }: BattlefieldGraphProps) {
  const [attackLines, setAttackLines] = useState<AttackLine[]>([])
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false)

  const maxNodes = Math.max(axiomsA.length, axiomsB.length, 1)
  const svgHeight = PADDING_Y * 2 + (maxNodes - 1) * NODE_SPACING_Y + NODE_RADIUS_BASE * 2

  // Add new attack line when latestAttack changes
  useEffect(() => {
    if (!latestAttack) return

    const fromSide = latestAttack.attackerSide
    const fromAxioms = fromSide === 'a' ? axiomsA : axiomsB
    // Pick the first non-destroyed attacker axiom as the source
    const sourceAxiom = fromAxioms.find((a) => !a.is_destroyed)
    if (!sourceAxiom) return

    const line: AttackLine = {
      fromId: sourceAxiom.id,
      toId: latestAttack.targetAxiomId,
      side: fromSide,
      timestamp: Date.now(),
    }

    setAttackLines((prev) => [...prev.slice(-5), line]) // Keep last 5 lines
  }, [latestAttack, axiomsA, axiomsB])

  // Remove old attack lines after animation
  useEffect(() => {
    const timer = setInterval(() => {
      setAttackLines((prev) => prev.filter((l) => Date.now() - l.timestamp < 2000))
    }, 500)
    return () => clearInterval(timer)
  }, [])

  function getNodePos(side: 'a' | 'b', index: number, total: number) {
    const x = side === 'a' ? PADDING_X : SVG_WIDTH - PADDING_X
    const totalHeight = (total - 1) * NODE_SPACING_Y
    const startY = (svgHeight - totalHeight) / 2
    const y = startY + index * NODE_SPACING_Y
    return { x, y }
  }

  function getNodeRadius(hp: number) {
    return NODE_RADIUS_BASE * (0.3 + (hp / 100) * 0.7)
  }

  const allAxiomPositions = new Map<string, { x: number; y: number }>()
  axiomsA.forEach((a, i) => allAxiomPositions.set(a.id, getNodePos('a', i, axiomsA.length)))
  axiomsB.forEach((a, i) => allAxiomPositions.set(a.id, getNodePos('b', i, axiomsB.length)))

  if (collapsible && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full py-3 flex items-center justify-center gap-2 rounded-lg border border-[#27272a] bg-[#0a0a0a] hover:bg-[#111] transition-colors"
      >
        <span className="text-xs text-zinc-600 font-bold uppercase tracking-widest">Show Battlefield Graph</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    )
  }

  return (
    <div className="relative">
      {collapsible && (
        <button
          onClick={() => setCollapsed(true)}
          className="absolute top-1 right-1 z-10 p-1 rounded hover:bg-zinc-800 transition-colors"
          title="Collapse"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 7l3-3 3 3" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      )}
    <svg
      viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Attack line gradient */}
        <linearGradient id="attackGradientA" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="attackGradientB" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
        </linearGradient>

        {/* Glow filters */}
        <filter id="glowRed">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glowBlue">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <style>{`
          @keyframes dash {
            to { stroke-dashoffset: 0; }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes nodeShake {
            0%, 100% { transform: translate(0, 0); }
            25% { transform: translate(-2px, 1px); }
            50% { transform: translate(2px, -1px); }
            75% { transform: translate(-1px, 2px); }
          }
          .attack-line {
            stroke-dasharray: 300;
            stroke-dashoffset: 300;
            animation: dash 1.2s ease-out forwards;
          }
          .node-damaged {
            animation: nodeShake 0.3s ease-in-out 3;
          }
        `}</style>
      </defs>

      {/* Center divider */}
      <line
        x1={SVG_WIDTH / 2}
        y1={10}
        x2={SVG_WIDTH / 2}
        y2={svgHeight - 10}
        stroke="#27272a"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {/* Attack lines */}
      {attackLines.map((line) => {
        const from = allAxiomPositions.get(line.fromId)
        const to = allAxiomPositions.get(line.toId)
        if (!from || !to) return null

        return (
          <line
            key={`${line.fromId}-${line.toId}-${line.timestamp}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={line.side === 'a' ? '#ef4444' : '#3b82f6'}
            strokeWidth="2"
            className="attack-line"
            opacity="0.7"
          />
        )
      })}

      {/* Side A Nodes */}
      {axiomsA.map((axiom, i) => {
        const pos = getNodePos('a', i, axiomsA.length)
        const radius = getNodeRadius(axiom.hp_current)
        const isDamaged = attackLines.some((l) => l.toId === axiom.id && Date.now() - l.timestamp < 1500)

        return (
          <g key={axiom.id} className={isDamaged ? 'node-damaged' : ''}>
            {/* Outer glow for active nodes */}
            {!axiom.is_destroyed && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius + 4}
                fill="none"
                stroke="#ef4444"
                strokeWidth="1"
                opacity="0.2"
              />
            )}
            {/* Main node */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={axiom.is_destroyed ? 3 : radius}
              fill={axiom.is_destroyed ? '#27272a' : `rgba(239, 68, 68, ${0.2 + (axiom.hp_current / 100) * 0.5})`}
              stroke={axiom.is_destroyed ? '#3f3f46' : '#ef4444'}
              strokeWidth={axiom.is_destroyed ? 0.5 : 1.5}
              style={{ transition: 'all 0.7s ease-out' }}
            />
            {/* HP text */}
            {!axiom.is_destroyed && (
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[9px] font-mono"
                fill="#fca5a5"
              >
                {axiom.hp_current}
              </text>
            )}
            {/* Label */}
            <text
              x={pos.x}
              y={pos.y + radius + 12}
              textAnchor="middle"
              className="text-[7px]"
              fill={axiom.is_destroyed ? '#3f3f46' : '#a1a1aa'}
            >
              {axiom.label.length > 20 ? axiom.label.slice(0, 20) + '...' : axiom.label}
            </text>
          </g>
        )
      })}

      {/* Side B Nodes */}
      {axiomsB.map((axiom, i) => {
        const pos = getNodePos('b', i, axiomsB.length)
        const radius = getNodeRadius(axiom.hp_current)
        const isDamaged = attackLines.some((l) => l.toId === axiom.id && Date.now() - l.timestamp < 1500)

        return (
          <g key={axiom.id} className={isDamaged ? 'node-damaged' : ''}>
            {!axiom.is_destroyed && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius + 4}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1"
                opacity="0.2"
              />
            )}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={axiom.is_destroyed ? 3 : radius}
              fill={axiom.is_destroyed ? '#27272a' : `rgba(59, 130, 246, ${0.2 + (axiom.hp_current / 100) * 0.5})`}
              stroke={axiom.is_destroyed ? '#3f3f46' : '#3b82f6'}
              strokeWidth={axiom.is_destroyed ? 0.5 : 1.5}
              style={{ transition: 'all 0.7s ease-out' }}
            />
            {!axiom.is_destroyed && (
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[9px] font-mono"
                fill="#93c5fd"
              >
                {axiom.hp_current}
              </text>
            )}
            <text
              x={pos.x}
              y={pos.y + radius + 12}
              textAnchor="middle"
              className="text-[7px]"
              fill={axiom.is_destroyed ? '#3f3f46' : '#a1a1aa'}
            >
              {axiom.label.length > 20 ? axiom.label.slice(0, 20) + '...' : axiom.label}
            </text>
          </g>
        )
      })}

      {/* Side labels */}
      <text x={PADDING_X} y={18} textAnchor="middle" className="text-[10px] font-bold" fill="#ef4444">
        SIDE A
      </text>
      <text x={SVG_WIDTH - PADDING_X} y={18} textAnchor="middle" className="text-[10px] font-bold" fill="#3b82f6">
        SIDE B
      </text>
    </svg>
    </div>
  )
}
