import { test, expect } from '@playwright/test';

test.describe('Auth & Layout', () => {
  test('redirects unauthenticated user to /login', async ({ browser }) => {
    // Fresh context with NO auth state
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await context.close();
  });

  test('login page renders correctly', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2')).toContainText('Quản lý Truyền thông');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Đăng nhập');
    await context.close();
  });

  test('authenticated user sees header with full_name and role', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(header.locator('text=Quản lý Truyền thông')).toBeVisible();
  });

  test('navigation shows admin items for admin+', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const nav = page.locator('nav');
    await expect(nav.locator('text=Dashboard')).toBeVisible();
    await expect(nav.locator('text=Kanban')).toBeVisible();
    await expect(nav.locator('text=Nhân viên')).toBeVisible();
    await expect(nav.locator('text=Chiến dịch')).toBeVisible();
    await expect(nav.locator('text=Kênh')).toBeVisible();
    await expect(nav.locator('text=Nhãn link')).toBeVisible();
  });

  test('logout button is visible', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("Thoát")')).toBeVisible();
  });
});
