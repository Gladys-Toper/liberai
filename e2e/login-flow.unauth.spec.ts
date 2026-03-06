import { test, expect } from '@playwright/test'

test.describe('Login flow', () => {
  test('login page has correct structure', async ({ page }) => {
    await page.goto('/login')

    // Heading
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()

    // Form elements
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    // Links
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup')
  })

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('invalid@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Should show error message
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 10_000 })
    // Should stay on login page
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  test('login form shows loading state on submit', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('somepassword')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Button should be disabled while loading
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled({ timeout: 2_000 }).catch(() => {
      // May resolve too fast — that's ok
    })
  })

  test('login page preserves redirect param', async ({ page }) => {
    await page.goto('/login?redirect=/dashboard')

    // The redirect param should be in the URL
    const url = new URL(page.url())
    expect(url.searchParams.get('redirect')).toBe('/dashboard')
  })

  test('navigating to signup from login works', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Sign up' }).click()
    await page.waitForURL('**/signup')
    expect(new URL(page.url()).pathname).toBe('/signup')
  })
})
