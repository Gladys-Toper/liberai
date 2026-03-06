import { test, expect } from '@playwright/test'

test.describe('Agent API routes', () => {
  const BASE = 'http://localhost:3000'

  test('GET /api/agents without auth returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/agents`)
    expect(res.status()).toBe(401)
  })

  test('POST /api/agents without auth returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents`, {
      data: {
        name: 'Test Agent',
        agentType: 'reader',
        capabilities: ['summarization'],
      },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/agents/match with query returns results', async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents/match`, {
      data: { query: 'summarize books', limit: 5 },
    })
    // 200 with results or 401 if auth required
    expect([200, 401]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      expect(Array.isArray(body.agents || body)).toBe(true)
    }
  })

  test('GET /api/agents/swarms returns swarm list', async ({ request }) => {
    const res = await request.get(`${BASE}/api/agents/swarms`)
    expect([200, 401]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      expect(body).toBeDefined()
    }
  })

  test('POST /api/agents/swarms without auth returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/agents/swarms`, {
      data: {
        name: 'Test Swarm',
        purpose: 'Testing',
        taskType: 'research',
      },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe('Social API routes with agent dispatch', () => {
  const BASE = 'http://localhost:3000'

  test('GET /api/social/follow requires userId param', async ({ request }) => {
    const res = await request.get(`${BASE}/api/social/follow`)
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('userId required')
  })

  test('GET /api/social/follow with userId returns status', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/social/follow?userId=00000000-0000-4000-8000-000000000001`
    )
    expect(res.status()).toBe(200)
  })

  test('POST /api/social/follow without auth returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/social/follow`, {
      data: { followingId: '00000000-0000-4000-8000-000000000001' },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/social/comments requires bookId param', async ({ request }) => {
    const res = await request.get(`${BASE}/api/social/comments`)
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('bookId required')
  })

  test('POST /api/social/comments without auth returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/social/comments`, {
      data: { bookId: 'test', content: 'Hello' },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/social/ratings requires bookId param', async ({ request }) => {
    const res = await request.get(`${BASE}/api/social/ratings`)
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('bookId required')
  })

  test('POST /api/social/ratings without auth returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/social/ratings`, {
      data: { bookId: 'test', rating: 5 },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe('A2A Protocol', () => {
  const BASE = 'http://localhost:3000'

  test('A2A endpoint responds to JSON-RPC', async ({ request }) => {
    const res = await request.post(`${BASE}/api/a2a`, {
      data: {
        jsonrpc: '2.0',
        id: '1',
        method: 'agents/discover',
        params: { query: 'summarization' },
      },
    })
    // Should respond (may be 401 if auth required, or 200 with result)
    expect([200, 401]).toContain(res.status())
  })

  test('A2A invalid method returns error', async ({ request }) => {
    const res = await request.post(`${BASE}/api/a2a`, {
      data: {
        jsonrpc: '2.0',
        id: '2',
        method: 'invalid/method',
        params: {},
      },
    })
    // Should return error response (either HTTP error or JSON-RPC error)
    if (res.status() === 200) {
      const body = await res.json()
      expect(body.error).toBeDefined()
    }
  })
})
