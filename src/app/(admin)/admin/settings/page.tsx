'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Shield,
} from 'lucide-react'
import { formatRelativeDate } from '@/lib/utils'

interface ApiKey {
  id: string
  key_prefix: string
  name: string
  scope: string
  permissions: string[]
  rate_limit_rpm: number
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export default function AdminSettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScope, setNewKeyScope] = useState<'admin' | 'author'>('admin')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    const res = await fetch('/api/v1/keys')
    if (res.ok) {
      const data = await res.json()
      setKeys(data.keys)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) return

    setCreating(true)
    const res = await fetch('/api/v1/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName.trim(), scope: newKeyScope }),
    })

    if (res.ok) {
      const data = await res.json()
      setNewlyCreatedKey(data.key)
      setNewKeyName('')
      setShowCreateForm(false)
      await fetchKeys()
    }
    setCreating(false)
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId)
    const res = await fetch(`/api/v1/keys?id=${keyId}`, { method: 'DELETE' })
    if (res.ok) {
      await fetchKeys()
    }
    setRevoking(null)
  }

  const activeKeys = keys.filter((k) => !k.revoked_at)
  const revokedKeys = keys.filter((k) => k.revoked_at)

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Settings</h1>
          <p className="mt-1 text-xs text-zinc-600">
            Manage admin API keys and platform configuration.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" />
          New Key
        </button>
      </div>

      {/* Newly created key banner */}
      {newlyCreatedKey && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">
              Copy your API key now — it won&apos;t be shown again.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-[#0a0a0a] px-3 py-2 font-mono text-xs text-emerald-400">
              {newlyCreatedKey}
            </code>
            <button
              onClick={() => handleCopy(newlyCreatedKey)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#27272a] bg-[#111] text-zinc-400 transition-colors hover:bg-[#1a1a1a] hover:text-white"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <button
            onClick={() => setNewlyCreatedKey(null)}
            className="mt-3 text-xs text-amber-500/60 hover:text-amber-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-xl border border-[#1e1e1e] bg-[#111] p-4"
        >
          <div className="mb-3">
            <label className="mb-2 block text-xs font-medium text-zinc-400">
              Key Name
            </label>
            <input
              type="text"
              placeholder="e.g. Platform monitoring agent"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="w-full rounded-lg border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-zinc-700 focus:border-violet-500/50 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-zinc-400">
              Scope
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewKeyScope('admin')}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  newKeyScope === 'admin'
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                    : 'border-[#27272a] text-zinc-500 hover:bg-[#1a1a1a]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                Admin
              </button>
              <button
                type="button"
                onClick={() => setNewKeyScope('author')}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  newKeyScope === 'author'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : 'border-[#27272a] text-zinc-500 hover:bg-[#1a1a1a]'
                }`}
              >
                <Key className="h-3.5 w-3.5" />
                Author
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newKeyName.trim()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
            >
              {creating ? 'Creating...' : 'Create Key'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false)
                setNewKeyName('')
              }}
              className="rounded-lg border border-[#27272a] px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-[#1a1a1a]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-600">Loading...</div>
      ) : activeKeys.length === 0 && revokedKeys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#27272a] bg-[#0e0e0e] px-6 py-12 text-center">
          <Key className="mx-auto mb-3 h-8 w-8 text-zinc-800" />
          <p className="text-sm text-zinc-500">No API keys yet</p>
          <p className="mt-1 text-xs text-zinc-700">
            Create keys for admin or author-level API access.
          </p>
        </div>
      ) : (
        <>
          {activeKeys.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Active Keys ({activeKeys.length})
              </h2>
              <div className="space-y-2">
                {activeKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center gap-4 rounded-xl border border-[#1e1e1e] bg-[#111] p-4"
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        key.scope === 'admin'
                          ? 'bg-violet-500/10'
                          : 'bg-emerald-500/10'
                      }`}
                    >
                      {key.scope === 'admin' ? (
                        <Shield className="h-4 w-4 text-violet-400" />
                      ) : (
                        <Key className="h-4 w-4 text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-200">
                          {key.name}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            key.scope === 'admin'
                              ? 'bg-violet-500/10 text-violet-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {key.scope}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-600">
                        <code className="font-mono">{key.key_prefix}...</code>
                        <span>
                          Created{' '}
                          {formatRelativeDate(key.created_at)}
                        </span>
                        {key.last_used_at && (
                          <span>
                            Last used{' '}
                            {formatRelativeDate(key.last_used_at)}
                          </span>
                        )}
                        <span>{key.rate_limit_rpm} rpm</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="Revoke key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {revokedKeys.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Revoked Keys ({revokedKeys.length})
              </h2>
              <div className="space-y-2">
                {revokedKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center gap-4 rounded-xl border border-[#1e1e1e] bg-[#0e0e0e] p-4 opacity-50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800/50">
                      <Key className="h-4 w-4 text-zinc-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-500 line-through">
                        {key.name}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-700">
                        <code className="font-mono">{key.key_prefix}...</code>
                        <span className="text-red-500/50">
                          Revoked{' '}
                          {formatRelativeDate(key.revoked_at!)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Usage hint */}
      <div className="mt-8 rounded-xl border border-[#1e1e1e] bg-[#0e0e0e] p-4">
        <h3 className="mb-2 text-xs font-semibold text-zinc-400">Usage</h3>
        <code className="block rounded-lg bg-[#0a0a0a] px-3 py-2 font-mono text-xs text-zinc-500">
          curl -H &quot;Authorization: Bearer lbr_live_...&quot; \<br />
          &nbsp;&nbsp;https://liberai.com/api/v1/admin/overview
        </code>
      </div>
    </div>
  )
}
