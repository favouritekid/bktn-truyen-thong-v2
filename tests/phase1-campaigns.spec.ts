import { test, expect } from '@playwright/test';

test.describe('Campaign Management', () => {
  test('loads campaign page', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2:has-text("Quản lý Chiến dịch")')).toBeVisible({ timeout: 10000 });
  });

  test('has create campaign button and show archived toggle', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2:has-text("Quản lý Chiến dịch")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Tạo chiến dịch")')).toBeVisible();
    await expect(page.locator('text=Hiện đã lưu trữ')).toBeVisible();
  });

  test('opens create campaign modal with all fields', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("Tạo chiến dịch")').click({ timeout: 10000 });
    await expect(page.locator('text=Tạo chiến dịch mới')).toBeVisible();
    await expect(page.locator('input[placeholder="Nhập tên chiến dịch..."]')).toBeVisible();
    await expect(page.locator('textarea[placeholder="Mô tả chiến dịch..."]')).toBeVisible();
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.locator('text=Kênh triển khai')).toBeVisible();
  });

  test('channel multi-select shows available channels', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("Tạo chiến dịch")').click({ timeout: 10000 });
    await expect(page.locator('text=Tạo chiến dịch mới')).toBeVisible();
    const checkboxes = page.locator('label:has(input[type="checkbox"])');
    expect(await checkboxes.count()).toBeGreaterThan(0);
  });

  test('create campaign with channels and verify', async ({ page }) => {
    const campaignName = `Test CD ${Date.now()}`;
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("Tạo chiến dịch")').click({ timeout: 10000 });
    await expect(page.locator('text=Tạo chiến dịch mới')).toBeVisible();
    await page.fill('input[placeholder="Nhập tên chiến dịch..."]', campaignName);
    // Click checkbox inside the modal
    const modal = page.locator('.fixed.inset-0.z-\\[90\\]');
    await modal.locator('input[type="checkbox"]').first().check({ force: true });
    await modal.locator('button[type="submit"]').click();
    await expect(page.locator('text=Tạo chiến dịch mới')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`td:has-text("${campaignName}")`)).toBeVisible({ timeout: 5000 });
  });

  test('campaign table has correct columns', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    const headers = page.locator('thead th');
    await expect(headers.nth(0)).toContainText('Mã');
    await expect(headers.nth(1)).toContainText('Tên');
    await expect(headers.nth(2)).toContainText('Trạng thái');
    await expect(headers.nth(5)).toContainText('Kênh');
  });

  test('campaign code format C-YYYYMMDD-XXXX', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('table', { timeout: 10000 });
    const codeCell = page.locator('td.font-mono').first();
    const code = await codeCell.textContent();
    expect(code).toMatch(/^C-\d{8}-\d{4}$/);
  });
});
