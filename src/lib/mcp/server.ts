import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * Creates a configured MCP server that exposes LiberAi REST API v1 as tools.
 * Uses HTTP transport — each tool calls the REST API with the provided API key.
 */
export function createLiberAiMcpServer(opts: {
  apiKey: string
  baseUrl: string
  scope: 'author' | 'admin' | 'agent'
}) {
  const { apiKey, baseUrl, scope } = opts

  const server = new McpServer({
    name: 'liberai',
    version: '1.0.0',
  })

  async function apiFetch(path: string, init?: RequestInit) {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API ${res.status}: ${body}`)
    }
    return res.json()
  }

  // Helper for non-v1 routes (agents, a2a)
  async function rawFetch(path: string, init?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API ${res.status}: ${body}`)
    }
    return res.json()
  }

  // Helper for A2A JSON-RPC calls
  async function a2aCall(method: string, params: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}/api/a2a`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method,
        params,
      }),
    })
    const data = await res.json()
    if (data.error) {
      throw new Error(`A2A ${data.error.code}: ${data.error.message}`)
    }
    return data.result
  }

  // -- Author tools --

  server.tool(
    'get_author_overview',
    'Get author dashboard overview (books, revenue, conversations)',
    { days: z.number().optional().describe('Number of days to look back (default: 30)') },
    async ({ days }) => {
      const data = await apiFetch(`/author/overview?days=${days || 30}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'list_books',
    'List all books for the authenticated author',
    {},
    async () => {
      const data = await apiFetch('/author/books')
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'create_book',
    'Create a new book with optional chapters',
    {
      title: z.string().describe('Book title'),
      description: z.string().optional().describe('Book description'),
      category: z.string().optional().describe('Book category'),
      price: z.number().optional().describe('Price in USD'),
      tags: z.array(z.string()).optional().describe('Tags'),
      chapters: z.array(z.object({
        title: z.string(),
        content: z.string(),
      })).optional().describe('Book chapters'),
    },
    async (args) => {
      const data = await apiFetch('/author/books', {
        method: 'POST',
        body: JSON.stringify(args),
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'get_book',
    'Get a specific book with its chapters',
    { id: z.string().describe('Book ID') },
    async ({ id }) => {
      const data = await apiFetch(`/author/books/${id}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'update_book',
    'Update a book\'s metadata and/or chapters. Updating chapters triggers re-embedding.',
    {
      id: z.string().describe('Book ID'),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      price: z.number().optional(),
      tags: z.array(z.string()).optional(),
      chapters: z.array(z.object({
        title: z.string(),
        content: z.string(),
      })).optional().describe('Full chapter replacement — all chapters must be provided'),
    },
    async ({ id, ...updates }) => {
      const data = await apiFetch(`/author/books/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'get_revenue',
    'Get revenue summary and per-book breakdown',
    { days: z.number().optional() },
    async ({ days }) => {
      const data = await apiFetch(`/author/revenue?days=${days || 30}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'get_author_pnl',
    'Get author profit & loss breakdown',
    { days: z.number().optional() },
    async ({ days }) => {
      const data = await apiFetch(`/author/pnl?days=${days || 30}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'author_chat',
    'Send a message to the author AI assistant',
    { message: z.string().describe('Message to send') },
    async ({ message }) => {
      const data = await apiFetch('/author/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      })
      return { content: [{ type: 'text' as const, text: data.response }] }
    },
  )

  // -- Social tools --

  server.tool(
    'follow_user',
    'Follow or unfollow a user',
    {
      followingId: z.string().describe('User ID to follow/unfollow'),
      action: z.enum(['follow', 'unfollow']).describe('Action to perform'),
    },
    async ({ followingId, action }) => {
      const data = await apiFetch('/social/follow', {
        method: action === 'follow' ? 'POST' : 'DELETE',
        body: JSON.stringify({ followingId }),
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'get_feed',
    'Get activity feed from followed users',
    {
      page: z.number().optional().describe('Page number (default: 1)'),
      limit: z.number().optional().describe('Items per page (default: 20)'),
    },
    async ({ page, limit }) => {
      const params = new URLSearchParams()
      if (page) params.set('page', String(page))
      if (limit) params.set('limit', String(limit))
      const data = await apiFetch(`/social/feed?${params}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'get_notifications',
    'Get user notifications',
    {
      unreadOnly: z.boolean().optional().describe('Only show unread notifications'),
      limit: z.number().optional(),
    },
    async ({ unreadOnly, limit }) => {
      const params = new URLSearchParams()
      if (unreadOnly) params.set('unreadOnly', 'true')
      if (limit) params.set('limit', String(limit))
      const data = await apiFetch(`/social/notifications?${params}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'rate_book',
    'Rate a book (1-5 stars) with optional review text',
    {
      bookId: z.string().describe('Book ID to rate'),
      rating: z.number().min(1).max(5).describe('Rating from 1 to 5'),
      reviewText: z.string().optional().describe('Optional review text'),
    },
    async (args) => {
      const data = await apiFetch('/social/ratings', {
        method: 'POST',
        body: JSON.stringify(args),
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'get_book_ratings',
    'Get ratings and reviews for a book',
    {
      bookId: z.string().describe('Book ID'),
      page: z.number().optional(),
      limit: z.number().optional(),
    },
    async ({ bookId, page, limit }) => {
      const params = new URLSearchParams({ bookId })
      if (page) params.set('page', String(page))
      if (limit) params.set('limit', String(limit))
      const data = await apiFetch(`/social/ratings?${params}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'add_comment',
    'Add a comment to a book',
    {
      bookId: z.string().describe('Book ID'),
      content: z.string().describe('Comment text (max 2000 chars)'),
      parentId: z.string().optional().describe('Parent comment ID for replies'),
    },
    async (args) => {
      const data = await apiFetch('/social/comments', {
        method: 'POST',
        body: JSON.stringify(args),
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  server.tool(
    'get_book_comments',
    'Get comments for a book',
    {
      bookId: z.string().describe('Book ID'),
      page: z.number().optional(),
      limit: z.number().optional(),
    },
    async ({ bookId, page, limit }) => {
      const params = new URLSearchParams({ bookId })
      if (page) params.set('page', String(page))
      if (limit) params.set('limit', String(limit))
      const data = await apiFetch(`/social/comments?${params}`)
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    },
  )

  // -- Admin tools (only if scope is admin) --

  if (scope === 'admin') {
    server.tool(
      'get_platform_overview',
      'Get platform-wide metrics (users, revenue, costs)',
      { days: z.number().optional() },
      async ({ days }) => {
        const data = await apiFetch(`/admin/overview?days=${days || 30}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )

    server.tool(
      'get_top_books',
      'Get top books by revenue',
      {
        limit: z.number().optional(),
        days: z.number().optional(),
      },
      async ({ limit, days }) => {
        const params = new URLSearchParams()
        if (limit) params.set('limit', String(limit))
        if (days) params.set('days', String(days))
        const data = await apiFetch(`/admin/books?${params}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )

    server.tool(
      'get_top_authors',
      'Get author leaderboard',
      {
        limit: z.number().optional(),
        days: z.number().optional(),
      },
      async ({ limit, days }) => {
        const params = new URLSearchParams()
        if (limit) params.set('limit', String(limit))
        if (days) params.set('days', String(days))
        const data = await apiFetch(`/admin/authors?${params}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )

    server.tool(
      'get_users',
      'Get paginated user list with optional search and role filter',
      {
        search: z.string().optional(),
        role: z.string().optional(),
        page: z.number().optional(),
        perPage: z.number().optional(),
      },
      async ({ search, role, page, perPage }) => {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (role) params.set('role', role)
        if (page) params.set('page', String(page))
        if (perPage) params.set('perPage', String(perPage))
        const data = await apiFetch(`/admin/users?${params}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )

    server.tool(
      'get_orders',
      'Get recent orders',
      { limit: z.number().optional() },
      async ({ limit }) => {
        const data = await apiFetch(`/admin/orders?limit=${limit || 20}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )

    server.tool(
      'get_platform_pnl',
      'Get platform profit & loss',
      { days: z.number().optional() },
      async ({ days }) => {
        const data = await apiFetch(`/admin/pnl?days=${days || 30}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )

    server.tool(
      'admin_chat',
      'Send a message to the admin AI assistant',
      { message: z.string().describe('Message to send') },
      async ({ message }) => {
        const data = await apiFetch('/admin/chat', {
          method: 'POST',
          body: JSON.stringify({ message }),
        })
        return { content: [{ type: 'text' as const, text: data.response }] }
      },
    )
  }

  // -- Agent tools (only if scope is agent) --

  if (scope === 'agent') {
    server.tool(
      'discover_agents',
      'Semantic search for agents by capability description. Returns ranked matches with trust scores.',
      {
        query: z.string().describe('Natural language description of desired capabilities (e.g. "summarize books", "translate to Spanish")'),
        limit: z.number().optional().describe('Max results (default: 5)'),
        minTrust: z.number().optional().describe('Minimum trust score 0-1 (default: none)'),
      },
      async (args) => {
        const result = await a2aCall('agents/discover', args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'get_agent_card',
      'Get an agent\'s full capability card including trust score, capabilities, and economics',
      { id: z.string().describe('Agent ID') },
      async ({ id }) => {
        const result = await a2aCall('agents/card', { id })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'send_task',
      'Send a task to another agent via A2A protocol. Optionally specify responder or use semantic matchmaking.',
      {
        message: z.string().describe('Task message text'),
        responderAgentId: z.string().optional().describe('Specific agent ID to handle the task'),
        query: z.string().optional().describe('If no responderAgentId, match an agent by this capability query'),
        taskId: z.string().optional().describe('Custom task ID (auto-generated if omitted)'),
      },
      async ({ message, responderAgentId, query, taskId }) => {
        const params: Record<string, unknown> = {
          message: {
            role: 'user',
            parts: [{ type: 'text', text: message }],
          },
        }
        if (responderAgentId) params.responderAgentId = responderAgentId
        if (query) params.query = query
        if (taskId) params.id = taskId
        const result = await a2aCall('tasks/send', params)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'get_task_status',
      'Check the status and result of a previously sent A2A task',
      { id: z.string().describe('Task ID') },
      async ({ id }) => {
        const result = await a2aCall('tasks/get', { id })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'create_swarm',
      'Create an ephemeral agent swarm for collaborative tasks. Optionally auto-match agents by capabilities.',
      {
        name: z.string().describe('Swarm name'),
        purpose: z.string().describe('What this swarm aims to accomplish'),
        taskType: z.string().optional().describe('Task category (e.g. "book_review", "translation")'),
        maxMembers: z.number().optional().describe('Maximum members (default: 10)'),
        ttlMinutes: z.number().optional().describe('Time to live in minutes (default: 60)'),
        requiredCapabilities: z.array(z.string()).optional().describe('Auto-match agents with these capabilities'),
      },
      async (args) => {
        const result = await a2aCall('swarms/create', args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'join_swarm',
      'Join an existing swarm as a participant',
      { swarmId: z.string().describe('Swarm ID to join') },
      async ({ swarmId }) => {
        const result = await a2aCall('swarms/join', { swarmId })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'contribute_to_swarm',
      'Submit a contribution (output/result) to a swarm you\'re a member of',
      {
        swarmId: z.string().describe('Swarm ID'),
        contribution: z.record(z.unknown()).describe('Contribution data (structured output)'),
      },
      async (args) => {
        const result = await a2aCall('swarms/contribute', args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'subscribe_events',
      'Subscribe to platform events (e.g. new_book, new_rating, swarm_formed). Delivery via webhook or A2A.',
      {
        eventPattern: z.string().describe('Event pattern to match (e.g. "new_book", "swarm.*", "*")'),
        filter: z.record(z.unknown()).optional().describe('Filter criteria (e.g. { category: "fiction" })'),
        delivery: z.enum(['webhook', 'a2a', 'poll']).optional().describe('Delivery method (default: webhook)'),
      },
      async (args) => {
        const result = await a2aCall('events/subscribe', args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      },
    )

    server.tool(
      'get_trust_history',
      'Get trust score history and interaction breakdown for an agent',
      {
        agentId: z.string().describe('Agent ID'),
        days: z.number().optional().describe('Lookback period in days (default: 30)'),
      },
      async ({ agentId, days }) => {
        const data = await rawFetch(`/api/agents/${agentId}/trust?days=${days || 30}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )

    server.tool(
      'get_economics',
      'Get agent economics: earnings, spending, cost breakdown, top counterparties',
      {
        agentId: z.string().describe('Agent ID'),
        days: z.number().optional().describe('Lookback period in days (default: 30)'),
      },
      async ({ agentId, days }) => {
        const data = await rawFetch(`/api/agents/${agentId}/economics?days=${days || 30}`)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      },
    )
  }

  return server
}
