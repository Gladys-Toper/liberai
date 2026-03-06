import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const PREFIX = 'lbr_live_'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Generate a new API key.
 * Returns the raw key (show once) and the record to insert.
 */
export function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const hex = crypto.randomBytes(32).toString('hex')
  const rawKey = `${PREFIX}${hex}`
  const keyPrefix = rawKey.slice(0, 12)
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
  return { rawKey, keyPrefix, keyHash }
}

/**
 * Validate a Bearer token and return the associated key record.
 * Returns null if invalid or revoked.
 */
export async function validateApiKey(bearerToken: string) {
  if (!bearerToken.startsWith(PREFIX)) return null

  const keyHash = crypto.createHash('sha256').update(bearerToken).digest('hex')
  const db = getServiceClient()

  const { data: key } = await db
    .from('api_keys')
    .select('id, owner_id, scope, author_id, agent_id, name, permissions, rate_limit_rpm')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .single()

  if (!key) return null

  // Update last_used_at (fire and forget)
  db.from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {})

  return key
}

/**
 * Create and store a new API key.
 */
export async function createApiKey(opts: {
  ownerId: string
  scope: 'author' | 'admin' | 'agent'
  name: string
  authorId?: string
  agentId?: string
  permissions?: string[]
  rateLimitRpm?: number
}): Promise<{ rawKey: string; id: string }> {
  const { rawKey, keyPrefix, keyHash } = generateApiKey()
  const db = getServiceClient()

  const { data, error } = await db
    .from('api_keys')
    .insert({
      key_prefix: keyPrefix,
      key_hash: keyHash,
      owner_id: opts.ownerId,
      scope: opts.scope,
      name: opts.name,
      author_id: opts.authorId || null,
      agent_id: opts.agentId || null,
      permissions: opts.permissions || [],
      rate_limit_rpm: opts.rateLimitRpm || 60,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create API key: ${error.message}`)

  return { rawKey, id: data.id }
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(keyId: string, ownerId: string): Promise<boolean> {
  const db = getServiceClient()
  const { error } = await db
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('owner_id', ownerId)

  return !error
}

/**
 * List API keys for an owner (does not expose hashes).
 */
export async function listApiKeys(ownerId: string) {
  const db = getServiceClient()
  const { data } = await db
    .from('api_keys')
    .select('id, key_prefix, scope, name, permissions, rate_limit_rpm, last_used_at, revoked_at, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  return data || []
}
