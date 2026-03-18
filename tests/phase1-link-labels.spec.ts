import { test, expect } from '@playwright/test';

test.describe('Link Label Management', () => {
  test('loads with pre-populated labels', async ({ page }) => {
    await page.goto('/link-labels');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2:has-text("Quản lý Nhãn Link")')).toBeVisible({ timeout: 10000 });
    await page.waitForSelector('table', { timeout: 10000 });
    const rows = page.locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('shows correct table columns', async ({ page }) => {
    await page.goto('/link-labels');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    const headers = page.locator('thead th');
    await expect(headers.nth(0)).toContainText('Tên nhãn');
    await expect(headers.nth(1)).toContainText('Trạng thái');
    await expect(headers.nth(2)).toContainText('Ngày tạo');
    await expect(headers.nth(3)).toContainText('Thao tác');
  });

  test('create label and verify', async ({ page }) => {
    const name = `Test Label ${Date.now()}`;
    await page.goto('/link-labels');
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("Thêm nhãn")').click({ timeout: 10000 });
    await expect(page.locator('text=Thêm nhãn mới')).toBeVisible();
    await page.fill('input[placeholder="Nhập tên nhãn..."]', name);
    await page.locator('button[type="submit"]:has-text("Tạo nhãn")').click();
    await expect(page.locator('text=Thêm nhãn mới')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`td:has-text("${name}")`)).toBeVisible({ timeout: 5000 });
  });

  test('can edit label', async ({ page }) => {
    await page.goto('/link-labels');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.locator('button:has-text("Sửa")').first().click();
    await expect(page.locator('text=Chỉnh sửa nhãn')).toBeVisible();
    await page.locator('button:has-text("Hủy")').click();
  });

  test('shows active status toggles', async ({ page }) => {
    await page.goto('/link-labels');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    const statusButtons = page.locator('td button:has-text("Hoạt động"), td button:has-text("Đã tắt")');
    expect(await statusButtons.count()).toBeGreaterThan(0);
  });

  test('can toggle label active status', async ({ page }) => {
    await page.goto('/link-labels');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    // Deactivate
    const activeBtn = page.locator('td button:has-text("Hoạt động")').first();
    await activeBtn.click();
    await page.waitForTimeout(1500);
    // Reactivate
    const inactiveBtn = page.locator('td button:has-text("Đã tắt")').first();
    if (await inactiveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inactiveBtn.click();
      await page.waitForTimeout(1500);
    }
  });
});
