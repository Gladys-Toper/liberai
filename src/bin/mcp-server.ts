#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createLiberAiMcpServer } from '../lib/mcp/server.js'

const args = process.argv.slice(2)

let apiKey = ''
let scope: 'author' | 'admin' = 'author'
let baseUrl = 'https://liberai.com'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-key' && args[i + 1]) {
    apiKey = args[++i]
  } else if (args[i] === '--scope' && args[i + 1]) {
    scope = args[++i] as 'author' | 'admin'
  } else if (args[i] === '--base-url' && args[i + 1]) {
    baseUrl = args[++i]
  }
}

if (!apiKey) {
  console.error('Usage: liberai-mcp --api-key lbr_live_xxx [--scope author|admin] [--base-url https://liberai.com]')
  process.exit(1)
}

async function main() {
  const server = createLiberAiMcpServer({ apiKey, baseUrl, scope })
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`LiberAi MCP server started (scope: ${scope})`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
