import { NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/auth/api-key'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

interface A2ARequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface A2ATask {
  id: string
  status: 'completed' | 'failed' | 'cancelled'
  artifacts?: Array<{
    parts: Array<{ type: string; text: string }>
  }>
  error?: { code: number; message: string }
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

function jsonRpcResult(id: string | number, result: unknown) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    result,
  })
}

export async function POST(request: Request) {
  // Authenticate via API key
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonRpcError(null, -32000, 'Missing or invalid Authorization header')
  }

  const key = await validateApiKey(authHeader.slice(7))
  if (!key) {
    return jsonRpcError(null, -32000, 'Invalid or revoked API key')
  }

  let body: A2ARequest
  try {
    body = await request.json()
  } catch {
    return jsonRpcError(null, -32700, 'Parse error')
  }

  if (body.jsonrpc !== '2.0' || !body.method || !body.id) {
    return jsonRpcError(body?.id ?? null, -32600, 'Invalid JSON-RPC request')
  }

  switch (body.method) {
    case 'tasks/send':
      return handleTaskSend(body, key)
    case 'tasks/get':
      return handleTaskGet(body)
    case 'tasks/cancel':
      return handleTaskCancel(body)
    default:
      return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`)
  }
}

async function handleTaskSend(
  req: A2ARequest,
  key: { scope: string; name: string },
) {
  const params = req.params as {
    id?: string
    message?: { role: string; parts: Array<{ type: string; text?: string }> }
  } | undefined

  if (!params?.message) {
    return jsonRpcError(req.id, -32602, 'Missing message parameter')
  }

  const textParts = params.message.parts
    ?.filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)

  if (!textParts?.length) {
    return jsonRpcError(req.id, -32602, 'No text content in message')
  }

  const userMessage = textParts.join('\n')
  const taskId = params.id || crypto.randomUUID()

  try {
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      system: `You are LiberAi's A2A agent assistant. You help other agents interact with the LiberAi platform.
Scope: ${key.scope}. Agent: ${key.name}.
Respond concisely with structured data when possible.`,
      prompt: userMessage,
    })

    const task: A2ATask = {
      id: taskId,
      status: 'completed',
      artifacts: [
        {
          parts: [{ type: 'text', text }],
        },
      ],
    }

    return jsonRpcResult(req.id, task)
  } catch (err) {
    const task: A2ATask = {
      id: taskId,
      status: 'failed',
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    }
    return jsonRpcResult(req.id, task)
  }
}

function handleTaskGet(req: A2ARequest) {
  // Stateless — tasks are not persisted. Return not found.
  return jsonRpcError(req.id, -32602, 'Task not found (stateless mode — tasks are not persisted)')
}

function handleTaskCancel(req: A2ARequest) {
  // Stateless — nothing to cancel.
  return jsonRpcResult(req.id, { id: (req.params as { id?: string })?.id, status: 'cancelled' })
}
