import { test, expect, type Locator, type Page } from '@playwright/test';

async function clickCanvas(canvas: Locator, page: Page, x: number, y: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.click(box.x + x, box.y + y);
}

async function drawLine(canvas: Locator, page: Page, x1: number, y1: number, x2: number, y2: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2);
  await page.mouse.up();
}

test.describe('ReferenzMaß – 3D Plane Calibration and Measurements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('vollständiger 3D-Ablauf: Testbild laden → Kalibrierungsmodus wechseln → 4 Punkte setzen → Referenz kalibrieren → Messen in Perspektive', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    // 1. Testbild laden
    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    // 2. Kalibrierungsmodus auf "3D Plane" wechseln
    await page.locator('#calib-type').selectOption('plane');
    await expect(page.getByText('Keine Referenzfläche (0/4)')).toBeVisible();

    // 3. 4 Punkte auf dem Canvas anklicken (ein Viereck simulieren)
    // Oben-Links: x=100, y=100
    await clickCanvas(canvas, page, 100, 100);
    await expect(page.getByText('Keine Referenzfläche (1/4)')).toBeVisible();

    // Oben-Rechts: x=200, y=100
    await clickCanvas(canvas, page, 200, 100);
    await expect(page.getByText('Keine Referenzfläche (2/4)')).toBeVisible();

    // Unten-Rechts: x=200, y=200
    await clickCanvas(canvas, page, 200, 200);
    await expect(page.getByText('Keine Referenzfläche (3/4)')).toBeVisible();

    // Unten-Links: x=100, y=200
    await clickCanvas(canvas, page, 100, 200);

    // Jetzt sollte es kalibriert sein!
    await expect(page.getByText('✓ Referenzfläche kalibriert')).toBeVisible();
    await expect(page.getByText('Modus: 3D-Ebene (Homographie)')).toBeVisible();

    // 4. Referenz-Breite und -Höhe festlegen
    await page.locator('#ref-width').fill('10');
    await page.locator('#ref-height').fill('10');

    // 5. In den Messmodus wechseln
    const addBtn = page.getByRole('button', { name: /Messung hinzufügen/ });
    await addBtn.click();
    await expect(page.getByRole('button', { name: /Messungen abschließen/ })).toBeVisible();
    await page.waitForTimeout(200);

    // 6. Eine Messlinie innerhalb des kalibrierten Quadrats zeichnen (z. B. von x=100, y=150 bis x=200, y=150)
    // In der Perspektive sollte dies genau die halbe Höhe/Breite schneiden. Da das Quadrat von 100-200 geht,
    // sollte eine horizontale Linie von 100 bis 200 genau 10 cm lang sein.
    await drawLine(canvas, page, 100, 150, 200, 150);

    await expect(page.locator('.measurement-card')).toHaveCount(1);
    // Erwarteter Messwert sollte 10.00 cm sein, da wir genau die volle Breite der Fläche messen
    await expect(page.locator('.measurement-card .card-length').first()).toHaveText('10.00 cm');
  });
});
