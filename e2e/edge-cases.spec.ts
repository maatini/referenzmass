import { test, expect, type Locator, type Page } from '@playwright/test';

async function drawLine(canvas: Locator, page: Page, x1: number, y1: number, x2: number, y2: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2);
  await page.mouse.up();
}

async function clickCanvas(canvas: Locator, page: Page, x: number, y: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.click(box.x + x, box.y + y);
}

test.describe('ReferenzMaß – Edge cases and error handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();
  });

  // ── Zero / short lines ──────────────────────────────────────

  test('very short drag (< 5px) does NOT create a reference line', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    // Draw a very short line (< 5px) — should be ignored by useKonva
    await drawLine(canvas, page, 200, 200, 203, 201);

    await page.waitForTimeout(200);
    // Should still show "Keine Referenzlinie"
    await expect(page.getByText('Keine Referenzlinie')).toBeVisible();
  });

  // ── realWorldLength = 0 ──────────────────────────────────────

  test('setting real-world length to 0 removes calibration', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    // Draw a reference line first
    await drawLine(canvas, page, 150, 200, 650, 200);
    await expect(page.getByText('✓ Referenzlinie gezeichnet')).toBeVisible();

    // Set length to 0
    await page.getByRole('spinbutton').fill('0');
    await page.waitForTimeout(200);

    // Scale display should disappear (calibration invalidated)
    await expect(page.getByText(/Maßstab:/)).not.toBeVisible();
  });

  // ── "Linie löschen" button ──────────────────────────────────────

  test('"Linie löschen" resets calibration state completely', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    // Draw reference line
    await drawLine(canvas, page, 150, 200, 650, 200);
    await expect(page.getByText('✓ Referenzlinie gezeichnet')).toBeVisible();

    // Click clear
    const clearBtn = page.getByRole('button', { name: 'Linie löschen' });
    await clearBtn.click();
    await page.waitForTimeout(200);

    // State should be reset
    await expect(page.getByText('Keine Referenzlinie')).toBeVisible();
    await expect(page.getByText(/Maßstab:/)).not.toBeVisible();
  });

  // ── "Fläche löschen" button ────────────────────────────────────

  test('"Fläche löschen" resets plane calibration', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    // Switch to plane mode
    await page.locator('#calib-type').selectOption('plane');

    // Click 4 points
    await clickCanvas(canvas, page, 100, 100);
    await clickCanvas(canvas, page, 200, 100);
    await clickCanvas(canvas, page, 200, 200);
    await clickCanvas(canvas, page, 100, 200);

    await expect(page.getByText('✓ Referenzfläche kalibriert')).toBeVisible();

    // Click clear
    await page.getByRole('button', { name: 'Fläche löschen' }).click();
    await page.waitForTimeout(200);

    await expect(page.getByText('Keine Referenzfläche (0/4)')).toBeVisible();
  });

  // ── Measurement mode without calibration ────────────────────

  test('"Messung hinzufügen" is NOT visible without calibration', async ({ page }) => {
    // No calibration exists
    await expect(page.getByRole('button', { name: /Messung hinzufügen/ })).not.toBeVisible();
  });

  // ── Export button visibility ─────────────────────────────────

  test('"CSV exportieren" button only appears when measurements exist', async ({ page }) => {
    // No measurements → no export button
    await expect(page.getByRole('button', { name: 'CSV exportieren' })).not.toBeVisible();
  });

  test('"CSV exportieren" button appears after adding measurements', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    await drawLine(canvas, page, 100, 200, 600, 200);
    await page.getByRole('spinbutton').fill('10');
    await page.getByLabel('Einheit').selectOption('cm');

    await page.getByRole('button', { name: /Messung hinzufügen/ }).click();
    await page.waitForTimeout(200);

    // No measurements yet → no export button
    await expect(page.getByRole('button', { name: 'CSV exportieren' })).not.toBeVisible();

    // Draw a measurement
    await drawLine(canvas, page, 150, 300, 400, 300);
    await page.waitForTimeout(200);

    // Now export button should be visible
    await expect(page.getByRole('button', { name: 'CSV exportieren' })).toBeVisible();
  });

  // ── Keyboard delete without selection ───────────────────────

  test('pressing Delete with no measurement selected does nothing', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    await drawLine(canvas, page, 100, 200, 600, 200);
    await page.getByRole('spinbutton').fill('10');
    await page.getByLabel('Einheit').selectOption('cm');

    await page.getByRole('button', { name: /Messung hinzufügen/ }).click();
    await page.waitForTimeout(200);

    // Draw a measurement
    await drawLine(canvas, page, 150, 300, 400, 300);
    await page.waitForTimeout(200);

    // Deselect by clicking outside
    await page.getByRole('heading', { name: 'ReferenzMaß' }).click();
    await page.waitForTimeout(100);

    // Press Delete — nothing should happen
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);

    await expect(page.locator('.measurement-card')).toHaveCount(1);
  });

  // ── Sidebar empty states ────────────────────────────────────

  test('shows hint to draw reference line when no calibration exists', async ({ page }) => {
    await expect(page.getByText('Zeichne zuerst die Referenzlinie, um Messungen durchzuführen.')).toBeVisible();
  });

  test('shows hint to add measurements after calibration', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    await drawLine(canvas, page, 100, 200, 600, 200);
    await page.getByRole('spinbutton').fill('10');
    await page.getByLabel('Einheit').selectOption('cm');
    await page.waitForTimeout(300);

    // After calibration but before measurements
    await expect(page.getByText('Klicke oben auf "Messung hinzufügen" und ziehe Linien auf dem Bild, um Abstände zu messen.')).toBeVisible();
  });

  // ── Toast/status messages ────────────────────────────────────

  test('test image loads and shows status toast', async ({ page }) => {
    const toolbar = page.getByTestId('persistence-tools');
    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();

    // Status toast should appear briefly
    await expect(page.locator('.toast-message')).toBeVisible();
    await expect(page.locator('.toast-message')).toHaveText('Testbild geladen');
  });
});
