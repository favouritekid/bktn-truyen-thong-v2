import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads and shows pipeline', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Pipeline tiến độ')).toBeVisible({ timeout: 15000 });
  });

  test('shows status stat cards', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Pipeline tiến độ')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Bản nháp').first()).toBeVisible();
  });
});

test.describe('Kanban', () => {
  test('loads kanban board with columns', async ({ page }) => {
    await page.goto('/kanban');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Bản nháp').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Chờ duyệt KH').first()).toBeVisible();
  });

  test('has filters and create button', async ({ page }) => {
    await page.goto('/kanban');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Bản nháp').first()).toBeVisible({ timeout: 15000 });
    // Channel filter
    await expect(page.locator('select').first()).toBeVisible();
    // Assignee filter (admin)
    expect(await page.locator('select').count()).toBeGreaterThanOrEqual(2);
    // Create button
    await expect(page.locator('button:has-text("Tạo Task mới")')).toBeVisible();
  });
});
