import { test, expect, type Locator, type Page } from '@playwright/test';

// Helper function to draw a line on the Konva canvas by dragging the mouse
async function drawLine(canvas: Locator, page: Page, x1: number, y1: number, x2: number, y2: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2);
  await page.mouse.up();
}

test.describe('ReferenzMaß – Measurements workflow & lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();
  });

  test('vollständiger Messungs-Lebenszyklus: Zeichnen, Editieren, Auswählen, Reaktivität und Löschen', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    // 1. Testbild laden & Kalibrierung einrichten
    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300); // Wait for Konva image load

    // Draw reference line (500px wide: from x=100 to x=600 at y=200)
    await drawLine(canvas, page, 100, 200, 600, 200);
    await expect(page.getByText('✓ Referenzlinie gezeichnet')).toBeVisible();

    // Set reference to 10 cm (0.02 cm/px)
    await page.getByRole('spinbutton').fill('10');
    await page.getByLabel('Einheit').selectOption('cm');

    // 2. Switch to measurement mode
    const addBtn = page.getByRole('button', { name: /Messung hinzufügen/ });
    await addBtn.click();
    await expect(page.getByRole('button', { name: /Messungen abschließen/ })).toBeVisible();
    await page.waitForTimeout(300); // Wait for mode switch and UI stability

    // 3. Draw first measurement line (250px wide -> 5.00 cm)
    await drawLine(canvas, page, 150, 300, 400, 300);
    await expect(page.locator('.measurement-card')).toHaveCount(1);
    await expect(page.locator('.measurement-card .card-length').first()).toHaveText('5.00 cm');
    await page.waitForTimeout(300); // Wait for canvas update and Svelte state to settle

    // 4. Draw second measurement line (250px wide -> 5.00 cm)
    await drawLine(canvas, page, 200, 400, 450, 400);
    await expect(page.locator('.measurement-card')).toHaveCount(2);
    await expect(page.locator('.measurement-card .card-length').nth(1)).toHaveText('5.00 cm');

    // 5. Edit label and notes for the first measurement
    const firstCard = page.locator('.measurement-card').first();
    const labelInput = firstCard.getByRole('textbox', { name: 'Bezeichnung' });
    const notesInput = firstCard.getByRole('textbox', { name: 'Notizen' });

    await labelInput.fill('Breite');
    await notesInput.fill('Fensterbank');

    await expect(labelInput).toHaveValue('Breite');
    await expect(notesInput).toHaveValue('Fensterbank');

    // 6. Test selection
    const secondCard = page.locator('.measurement-card').nth(1);
    await secondCard.locator('.card-index').click();
    await page.waitForTimeout(100);
    await expect(secondCard).toHaveClass(/selected/);
    await expect(firstCard).not.toHaveClass(/selected/);

    await firstCard.locator('.card-index').click();
    await page.waitForTimeout(100);
    await expect(firstCard).toHaveClass(/selected/);
    await expect(secondCard).not.toHaveClass(/selected/);

    // 7. Test reactivity to calibration changes
    // Double reference length from 10 cm to 20 cm -> measurements should double (5.00 cm -> 10.00 cm)
    await page.getByRole('spinbutton').fill('20');
    await expect(page.locator('.measurement-card .card-length').first()).toHaveText('10.00 cm');
    await expect(page.locator('.measurement-card .card-length').nth(1)).toHaveText('10.00 cm');

    // Change unit to mm and update reference length to 200 to keep the same scale (20 cm -> 200 mm)
    await page.getByRole('spinbutton').fill('200');
    await page.getByLabel('Einheit').selectOption('mm');
    await expect(page.locator('.measurement-card .card-length').first()).toHaveText('100.00 mm');
    await expect(page.locator('.measurement-card .card-length').nth(1)).toHaveText('100.00 mm');

    // 8. Test deletion via UI button (✕)
    await firstCard.getByRole('button', { name: 'Löschen' }).click();
    await page.waitForTimeout(100);
    await expect(page.locator('.measurement-card')).toHaveCount(1);
    // The remaining card should now show index #1
    await expect(page.locator('.measurement-card .card-index').first()).toHaveText('#1');

    // 9. Test deletion via keyboard (Delete)
    const remainingCard = page.locator('.measurement-card').first();
    await remainingCard.locator('.card-index').click(); // Make sure it's selected
    await page.waitForTimeout(100);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    await expect(page.locator('.measurement-card')).toHaveCount(0);
  });
});
