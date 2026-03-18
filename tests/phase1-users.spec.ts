import { test, expect } from '@playwright/test';

test.describe('User Management', () => {
  test('loads user list', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('text=Quản lý Nhân viên')).toBeVisible();
    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 });
    await expect(page.locator('table')).toBeVisible();
  });

  test('shows correct table columns', async ({ page }) => {
    await page.goto('/users');
    await page.waitForSelector('table', { timeout: 10000 });
    const headers = page.locator('thead th');
    await expect(headers.nth(0)).toContainText('Tên');
    await expect(headers.nth(1)).toContainText('Email');
    await expect(headers.nth(2)).toContainText('Vai trò');
    await expect(headers.nth(3)).toContainText('Trạng thái');
    await expect(headers.nth(4)).toContainText('Đăng nhập cuối');
    await expect(headers.nth(5)).toContainText('Hoạt động cuối');
    await expect(headers.nth(6)).toContainText('Thao tác');
  });

  test('shows role badges with correct styling', async ({ page }) => {
    await page.goto('/users');
    await page.waitForSelector('table', { timeout: 10000 });
    // Should have at least one role badge
    const badges = page.locator('td span.rounded-full.uppercase');
    expect(await badges.count()).toBeGreaterThan(0);
  });

  test('has add user button', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('button:has-text("Thêm nhân viên")')).toBeVisible();
  });

  test('opens create user modal', async ({ page }) => {
    await page.goto('/users');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.click('button:has-text("Thêm nhân viên")');
    // Modal should appear
    await expect(page.locator('text=Thêm nhân viên mới')).toBeVisible();
    await expect(page.locator('input[placeholder="Nhập họ tên..."]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Role select should be visible
    await expect(page.locator('select')).toBeVisible();
  });

  test('create modal has correct role options for super_admin', async ({ page }) => {
    await page.goto('/users');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.click('button:has-text("Thêm nhân viên")');
    await expect(page.locator('text=Thêm nhân viên mới')).toBeVisible();

    const roleSelect = page.locator('select');
    const options = roleSelect.locator('option');
    const optionTexts = await options.allTextContents();
    // Super admin should see both admin and editor options
    expect(optionTexts.some(t => t.includes('Admin'))).toBeTruthy();
    expect(optionTexts.some(t => t.includes('Editor'))).toBeTruthy();
  });

  test('can close create modal', async ({ page }) => {
    await page.goto('/users');
    await page.waitForSelector('table', { timeout: 10000 });
    await page.click('button:has-text("Thêm nhân viên")');
    await expect(page.locator('text=Thêm nhân viên mới')).toBeVisible();
    await page.click('button:has-text("Hủy")');
    await expect(page.locator('text=Thêm nhân viên mới')).not.toBeVisible();
  });

  test('shows active/inactive status toggle', async ({ page }) => {
    await page.goto('/users');
    await page.waitForSelector('table', { timeout: 10000 });
    // Should have status toggles (Hoạt động or Đã khóa)
    const statusButtons = page.locator('td button:has-text("Hoạt động"), td button:has-text("Đã khóa")');
    expect(await statusButtons.count()).toBeGreaterThan(0);
  });
});
