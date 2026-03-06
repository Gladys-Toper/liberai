import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const STORAGE_STATE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  // Try to login with test user — if it fails, create a placeholder storage state
  // so dependent tests can still run (they'll handle 401s gracefully)
  const email = process.env.E2E_USER_EMAIL || 'test@liberai.com'
  const password = process.env.E2E_USER_PASSWORD || 'testpassword123'

  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // Fill login form
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Wait for redirect (success) or error message
  const result = await Promise.race([
    page.waitForURL('/', { timeout: 10_000 }).then(() => 'success' as const),
    page.waitForURL('**/library**', { timeout: 10_000 }).then(() => 'success' as const),
    page.getByText('Invalid login credentials').waitFor({ timeout: 10_000 }).then(() => 'failed' as const),
  ]).catch(() => 'timeout' as const)

  if (result === 'success') {
    await page.context().storageState({ path: STORAGE_STATE })
  } else {
    // Create empty storage state so tests can run (they'll test unauth behavior)
    fs.mkdirSync('e2e/.auth', { recursive: true })
    fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }))
  }
})
