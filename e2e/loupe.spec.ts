import { test, expect, type Locator, type Page } from '@playwright/test';

async function drawLine(canvas: Locator, page: Page, x1: number, y1: number, x2: number, y2: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2);
  await page.mouse.up();
}

test.describe('ReferenzMaß – MagnifierLoupe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();
  });

  test('loupe does NOT appear when no image is loaded', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Move mouse over canvas — loupe should NOT appear (no image loaded)
    await page.mouse.move(box.x + 400, box.y + 300);
    await page.waitForTimeout(200);

    await expect(page.locator('.loupe')).not.toBeVisible();
  });

  test('loupe appears while drawing a reference line on a loaded image', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    // Load test image
    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Start drawing — loupe should appear
    await page.mouse.move(box.x + 150, box.y + 200);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Loupe should be visible while drawing
    await expect(page.locator('.loupe')).toBeVisible();

    // Finish the line
    await page.mouse.move(box.x + 650, box.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Loupe should disappear after finishing
    await expect(page.locator('.loupe')).not.toBeVisible();
  });

  test('loupe has proper structure (crosshair inside)', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Start drawing
    await page.mouse.move(box.x + 400, box.y + 300);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Loupe visible with crosshair
    const loupe = page.locator('.loupe');
    await expect(loupe).toBeVisible();
    await expect(loupe.locator('.crosshair')).toBeVisible();

    // Loupe has circular shape
    const borderRadius = await loupe.evaluate(el => getComputedStyle(el).borderRadius);
    expect(borderRadius).toBe('50%');

    await page.mouse.up();
    await page.waitForTimeout(100);
  });

  test('loupe disappears when mouse leaves canvas', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Start drawing
    await page.mouse.move(box.x + 400, box.y + 300);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);

    await expect(page.locator('.loupe')).toBeVisible();

    // Move mouse far away from canvas
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    // Mouseleave handler cancels drawing → loupe disappears
    await expect(page.locator('.loupe')).not.toBeVisible();
  });
});
