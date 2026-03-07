'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface SynthesisResult {
  framework_name: string
  thesis_summary: string
  antithesis_summary: string
  synthesis: string
  principles: string[]
  crucible_resolution: string
}

interface SynthesisPanelProps {
  sessionId: string
  synthesis: SynthesisResult | null
  bookATitle: string
  bookBTitle: string
  winner: string | null
}

export function SynthesisPanel({ sessionId, synthesis: initialSynthesis, bookATitle, bookBTitle, winner }: SynthesisPanelProps) {
  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(initialSynthesis)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/arena/${sessionId}/synthesis`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setSynthesis(data.synthesis)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  if (!synthesis) {
    return (
      <div className="rounded-xl border border-violet-500/20 bg-[#141414] p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-violet-400 mb-3" />
        <h3 className="text-lg font-bold text-white mb-2">Generate Hegelian Synthesis</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Combine the surviving insights from both books into a novel philosophical framework.
        </p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-gradient-to-r from-violet-600 to-purple-600 text-white"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Synthesizing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Synthesis
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-[#141414] p-6">
      {/* Framework Name */}
      <div className="mb-6 text-center">
        <p className="text-xs uppercase tracking-widest text-violet-400 mb-1">Synthesis Framework</p>
        <h3 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
          {synthesis.framework_name}
        </h3>
      </div>

      {/* Thesis / Antithesis / Synthesis */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-4">
          <p className="text-xs font-bold text-red-400 mb-2 uppercase tracking-wider">Thesis</p>
          <p className="text-xs text-zinc-400 mb-1 italic">{bookATitle}</p>
          <p className="text-sm text-zinc-300">{synthesis.thesis_summary}</p>
        </div>
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-4">
          <p className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">Antithesis</p>
          <p className="text-xs text-zinc-400 mb-1 italic">{bookBTitle}</p>
          <p className="text-sm text-zinc-300">{synthesis.antithesis_summary}</p>
        </div>
        <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 p-4">
          <p className="text-xs font-bold text-violet-400 mb-2 uppercase tracking-wider">Synthesis</p>
          <p className="text-sm text-zinc-300">{synthesis.synthesis}</p>
        </div>
      </div>

      {/* Principles */}
      <div className="mb-6">
        <p className="text-sm font-bold text-white mb-3">Derived Principles</p>
        <ol className="space-y-2">
          {synthesis.principles.map((p, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-400">
                {i + 1}
              </span>
              <span className="text-zinc-300">{p}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Crucible Resolution */}
      <div className="rounded-lg bg-[#0a0a0a] p-4">
        <p className="text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider">Crucible Resolution</p>
        <p className="text-sm text-zinc-300 leading-relaxed">{synthesis.crucible_resolution}</p>
      </div>
    </div>
  )
}
