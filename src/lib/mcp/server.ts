import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * Creates a configured MCP server that exposes LiberAi REST API v1 as tools.
 * Uses HTTP transport — each tool calls the REST API with the provided API key.
 */
export function createLiberAiMcpServer(opts: {
  apiKey: string
  baseUrl: string
  scope: 'author' | 'admin'
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

  return server
}
