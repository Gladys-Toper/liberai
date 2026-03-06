import { test, expect } from '@playwright/test'

test.describe('Unauthenticated navigation', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/')
    // Page should render without errors
    await expect(page.locator('body')).toBeVisible()
  })

  test('login page renders form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText("Don't have an account?")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible()
  })

  test('signup page renders form', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('body')).toBeVisible()
    // Should have signup-related content
    const heading = page.getByRole('heading')
    await expect(heading).toBeVisible()
  })

  test('protected routes redirect to login', async ({ page }) => {
    const protectedRoutes = ['/library', '/dashboard', '/settings', '/admin', '/feed']

    for (const route of protectedRoutes) {
      await page.goto(route)
      await page.waitForURL('**/login**')
      const url = new URL(page.url())
      expect(url.pathname).toBe('/login')
      expect(url.searchParams.get('redirect')).toBe(route)
    }
  })

  test('admin routes redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/admin/agents')
    await page.waitForURL('**/login**')
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  test('admin/observatory redirects to login', async ({ page }) => {
    await page.goto('/admin/observatory')
    await page.waitForURL('**/login**')
    expect(new URL(page.url()).pathname).toBe('/login')
  })
})
