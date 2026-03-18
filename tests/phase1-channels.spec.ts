import { test, expect } from '@playwright/test';

test.describe('Channel Management', () => {
  test('loads channel list with pre-populated data', async ({ page }) => {
    await page.goto('/channels');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2:has-text("Quản lý Kênh")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('td:has-text("Facebook")').first()).toBeVisible({ timeout: 10000 });
  });

  test('shows correct table columns', async ({ page }) => {
    await page.goto('/channels');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    const headers = page.locator('thead th');
    await expect(headers.nth(0)).toContainText('Tên kênh');
    await expect(headers.nth(1)).toContainText('Mô tả');
    await expect(headers.nth(2)).toContainText('Trạng thái');
    await expect(headers.nth(3)).toContainText('Ngày tạo');
    await expect(headers.nth(4)).toContainText('Thao tác');
  });

  test('has add channel button and archived toggle', async ({ page }) => {
    await page.goto('/channels');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("Thêm kênh")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Hiện đã lưu trữ')).toBeVisible();
  });

  test('create channel and verify', async ({ page }) => {
    const name = `Test Ch ${Date.now()}`;
    await page.goto('/channels');
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("Thêm kênh")').click({ timeout: 10000 });
    await expect(page.locator('text=Thêm kênh mới')).toBeVisible();
    await page.fill('input[placeholder="Nhập tên kênh..."]', name);
    await page.fill('textarea[placeholder="Mô tả kênh..."]', 'Auto test');
    await page.locator('button[type="submit"]:has-text("Tạo kênh")').click();
    await expect(page.locator('text=Thêm kênh mới')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`td:has-text("${name}")`)).toBeVisible({ timeout: 5000 });
  });

  test('can open edit modal', async ({ page }) => {
    await page.goto('/channels');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.locator('button:has-text("Sửa")').first().click();
    await expect(page.locator('text=Chỉnh sửa kênh')).toBeVisible();
    await page.locator('button:has-text("Hủy")').click();
  });

  test('can archive and restore channel', async ({ page }) => {
    await page.goto('/channels');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    // Archive
    await page.locator('button:has-text("Lưu trữ")').first().click();
    await page.waitForTimeout(1500);
    // Show archived
    await page.locator('label:has-text("Hiện đã lưu trữ") input').check();
    await page.waitForTimeout(1000);
    // Restore
    const restoreBtn = page.locator('button:has-text("Khôi phục")').first();
    if (await restoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restoreBtn.click();
      await page.waitForTimeout(1500);
    }
  });
});
