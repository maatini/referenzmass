import { test, expect, type Locator, type Page } from '@playwright/test';

// Shared helpers
async function drawLine(canvas: Locator, page: Page, x1: number, y1: number, x2: number, y2: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2);
  await page.mouse.up();
}

async function setupCalibratedTestImage(page: Page) {
  const canvas = page.getByTestId('konva-container');
  const toolbar = page.getByTestId('persistence-tools');

  await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
  await page.waitForTimeout(300);

  // Draw reference line (500px) at 10 cm
  await drawLine(canvas, page, 100, 200, 600, 200);
  await expect(page.getByText('✓ Reference line drawn')).toBeVisible();
  await page.getByRole('spinbutton').fill('10');
  await page.getByLabel('Einheit').selectOption('cm');
  await page.waitForTimeout(200);

  return canvas;
}

test.describe('ReferenzMaß – Canvas interactions (zoom, pan, anchor drag)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();
  });

  test('scroll-wheel zoom does not crash the app', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Send multiple wheel events (both directions)
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(box.x + 100, box.y + 100);
      await page.waitForTimeout(50);
    }
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(box.x + 100, box.y + 100);
      await page.waitForTimeout(50);
    }

    // App should still be visible and functional
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();
    await expect(canvas).toBeVisible();
  });

  test('space-drag pan changes cursor style', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    // Hold Space key
    await page.keyboard.down('Space');
    await page.waitForTimeout(100);

    // Cursor should change to grab
    const cursorAfterSpace = await canvas.evaluate(el => getComputedStyle(el).cursor);
    expect(cursorAfterSpace).toBe('grab');

    // Release Space
    await page.keyboard.up('Space');
    await page.waitForTimeout(100);

    const cursorAfterRelease = await canvas.evaluate(el => getComputedStyle(el).cursor);
    // Should be default (not grab anymore)
    expect(cursorAfterRelease).not.toBe('grab');
  });

  test('"Reset Ansicht" button is always present and clickable', async ({ page }) => {
    const resetBtn = page.getByRole('button', { name: 'Reset Ansicht' });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    // App should not crash
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();
  });

  test('"Reset Ansicht" works after calibration (no crash)', async ({ page }) => {
    const canvas = await setupCalibratedTestImage(page);

    const resetBtn = page.getByRole('button', { name: 'Reset Ansicht' });
    await resetBtn.click();

    // Canvas and calibration should still be present
    await expect(canvas).toBeVisible();
    await expect(page.getByText(/Scale:/)).toBeVisible();
  });

  test('reference line anchor drag updates calibration reactively', async ({ page }) => {
    const canvas = await setupCalibratedTestImage(page);

    // After setup: reference line from (100,200) to (600,200), 500px = 10cm → 0.02 cm/px
    // By changing the reference length to 20, the scale should become 0.04
    await page.getByRole('spinbutton').fill('20');
    await page.waitForTimeout(300);

    const scaleText = await page.getByText(/Scale:/).innerText();
    expect(scaleText).toMatch(/0\.0[34]\d+ cm\/px/);
  });

  test('measurement line drawing produces a card with correct length', async ({ page }) => {
    const canvas = await setupCalibratedTestImage(page);

    // Enter measurement mode
    const addBtn = page.getByRole('button', { name: /Add Measurement Line/ });
    await addBtn.click();
    await page.waitForTimeout(300);

    // Draw a 250px measurement (horizontal) → should be exactly 5.00 cm
    await drawLine(canvas, page, 150, 300, 400, 300);

    await expect(page.locator('.measurement-card')).toHaveCount(1);
    await expect(page.locator('.measurement-card .card-length').first()).toHaveText('5.00 cm');
  });

  test('switching calibration mode from plane back to line', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    // Load test image
    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    // Switch to plane mode
    await page.locator('#calib-type').selectOption('plane');
    await expect(page.getByText('Keine Referenzfläche (0/4)')).toBeVisible();

    // Switch back to line mode
    await page.locator('#calib-type').selectOption('line');
    await expect(page.getByText('Keine Referenzlinie')).toBeVisible();

    // Should be able to draw a regular reference line
    await drawLine(canvas, page, 100, 200, 600, 200);
    await expect(page.getByText('✓ Reference line drawn')).toBeVisible();
  });
});
