import { test, expect } from '@playwright/test'

// These tests use the authenticated storage state from auth.setup.ts
// If the user isn't admin, they'll be redirected — tests handle both cases

test.describe('Admin Dashboard', () => {
  test('admin page loads or redirects non-admin', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    const url = new URL(page.url())
    // Either we're on admin (admin user) or redirected (non-admin or unauthed)
    if (url.pathname === '/admin') {
      // Admin page loaded — verify key elements
      await expect(page.getByText('Platform Overview')).toBeVisible({ timeout: 10_000 })
    } else {
      // Redirected — either to login (unauthed) or home (non-admin)
      expect(['/', '/login']).toContain(url.pathname)
    }
  })

  test('admin agents page loads or redirects', async ({ page }) => {
    await page.goto('/admin/agents')
    await page.waitForLoadState('networkidle')

    const url = new URL(page.url())
    if (url.pathname.startsWith('/admin')) {
      // Should have Agent Registry heading
      await expect(page.getByText('Agent Registry')).toBeVisible({ timeout: 10_000 })
      // Should have filter controls
      await expect(page.getByText('All types')).toBeVisible()
      await expect(page.getByText('All statuses')).toBeVisible()
      // Should have table headers
      await expect(page.getByText('Agent')).toBeVisible()
      await expect(page.getByText('Trust')).toBeVisible()
    } else {
      expect(['/', '/login']).toContain(url.pathname)
    }
  })

  test('admin observatory page loads or redirects', async ({ page }) => {
    await page.goto('/admin/observatory')
    await page.waitForLoadState('networkidle')

    const url = new URL(page.url())
    if (url.pathname.startsWith('/admin')) {
      // Should have Agent Observatory heading
      await expect(page.getByText('Agent Observatory')).toBeVisible({ timeout: 10_000 })
      // Should have section headings
      await expect(page.getByText('Event Stream')).toBeVisible()
      await expect(page.getByText('Trust Leaderboard')).toBeVisible()
    } else {
      expect(['/', '/login']).toContain(url.pathname)
    }
  })

  test('admin agents page filters work', async ({ page }) => {
    await page.goto('/admin/agents')
    await page.waitForLoadState('networkidle')

    const url = new URL(page.url())
    if (!url.pathname.startsWith('/admin')) {
      test.skip()
      return
    }

    // Select a type filter
    const typeSelect = page.locator('select[name="type"]')
    await typeSelect.selectOption('reader')

    // Click filter button
    await page.getByRole('button', { name: 'Filter' }).click()
    await page.waitForLoadState('networkidle')

    // URL should have type param
    const newUrl = new URL(page.url())
    expect(newUrl.searchParams.get('type')).toBe('reader')
  })
})
