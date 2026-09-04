import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function drawLine(canvas: Locator, page: Page, x1: number, y1: number, x2: number, y2: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found');
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2);
  await page.mouse.up();
}

test.describe('ReferenzMaß – basic UI and calibration workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();
  });

  test('loads the main screen with title, reference controls and canvas', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'ReferenzMaß' })).toBeVisible();

    const lengthInput = page.getByRole('spinbutton');
    await expect(lengthInput).toBeVisible();
    await expect(lengthInput).toHaveValue('10');

    const unitSelect = page.getByLabel('Einheit');
    await expect(unitSelect).toBeVisible();
    await expect(unitSelect).toHaveValue('cm');

    await expect(page.getByTestId('konva-container')).toBeVisible();

    const toolbar = page.getByTestId('persistence-tools');
    await expect(toolbar.getByRole('button', { name: 'Bild laden', exact: true })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Testbild laden' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Projekt speichern' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Projekt laden' })).toBeVisible();

    // Empty state in sidebar
    await expect(page.getByText('Zeichne zuerst die Referenzlinie, um Messungen durchzuführen.')).toBeVisible();
  });

  test('drawing a reference line shows calibration feedback', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    await drawLine(canvas, page, 150, 200, 650, 200);

    await expect(page.getByText('✓ Referenzlinie gezeichnet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Linie löschen' })).toBeVisible();
    await expect(page.getByText(/Maßstab:/)).toBeVisible({ timeout: 2000 });
  });

  test('shows calibration hint after reference line is drawn', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    await drawLine(canvas, page, 150, 200, 650, 200);
    await page.getByRole('spinbutton').fill('10');
    await page.getByLabel('Einheit').selectOption('cm');
    await page.waitForTimeout(200);

    await expect(page.getByText('Klicke oben auf "Messung hinzufügen" und ziehe Linien auf dem Bild, um Abstände zu messen.')).toBeVisible();
  });

  test('changing reference length and unit updates the calibration', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    await drawLine(canvas, page, 150, 200, 650, 200);
    await expect(page.getByText('✓ Referenzlinie gezeichnet')).toBeVisible();

    await page.getByRole('spinbutton').fill('50');
    await page.getByLabel('Einheit').selectOption('mm');

    await expect(page.getByText(/Maßstab:/)).toBeVisible();
  });

  test('can enter measurement mode after calibration', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    await drawLine(canvas, page, 150, 200, 650, 200);
    await expect(page.getByText(/Maßstab:/)).toBeVisible();

    const addBtn = page.getByRole('button', { name: /Messung hinzufügen/ });
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await expect(page.getByRole('button', { name: /Messungen abschließen/ })).toBeVisible();
  });

  test('can toggle into measurement mode and see measurement tools', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    await drawLine(canvas, page, 150, 200, 650, 200);
    await expect(page.getByText(/Maßstab:/)).toBeVisible();

    const addBtn = page.getByRole('button', { name: /Messung hinzufügen/ });
    await addBtn.click();
    await expect(page.getByRole('button', { name: /Messungen abschließen/ })).toBeVisible();
    await expect(page.locator('.measurement-tools')).toBeVisible();
  });

  test('Bild laden / Save / Projekt laden buttons are always present', async ({ page }) => {
    const toolbar = page.getByTestId('persistence-tools');

    await expect(toolbar.getByRole('button', { name: 'Bild laden', exact: true })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Testbild laden' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Projekt speichern' })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Projekt laden' })).toBeVisible();
  });

  test('vollständiger Ablauf: Testbild laden → Referenz kalibrieren → Messungen durchführen', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');
    const toolbar = page.getByTestId('persistence-tools');

    await toolbar.getByRole('button', { name: 'Testbild laden' }).click();
    await page.waitForTimeout(300);

    await drawLine(canvas, page, 110, 205, 610, 205);

    await expect(page.getByText('✓ Referenzlinie gezeichnet')).toBeVisible();
    await expect(page.getByText(/Maßstab:/)).toBeVisible({ timeout: 2000 });

    await page.getByRole('spinbutton').fill('10');
    await page.getByLabel('Einheit').selectOption('cm');

    const scaleText = await page.getByText(/Maßstab:/).innerText();
    expect(scaleText).toMatch(/0\.0[12]\d+ cm\/px/);

    await page.getByRole('button', { name: /Messung hinzufügen/ }).click();
    await expect(page.getByRole('button', { name: /Messungen abschließen/ })).toBeVisible();
    await expect(page.locator('.measurement-tools')).toBeVisible();
  });

  test('lädt pforte-fuersthof.jpg aus dem Projekt-Root (Data-URL + E2E-Hook)', async ({ page }) => {
    const canvas = page.getByTestId('konva-container');

    const imageAbsPath = path.resolve(process.cwd(), 'pforte-fuersthof.jpg');
    const imageBuffer = fs.readFileSync(imageAbsPath);
    const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

    await page.evaluate((url) => {
      const api = (window as any).__e2e;
      if (api && typeof api.loadImage === 'function') {
        api.loadImage(url);
      } else {
        throw new Error('E2E loadImage hook (__e2e.loadImage) nicht verfügbar');
      }
    }, dataUrl);

    await page.waitForTimeout(600);

    await expect(canvas).toHaveAttribute('data-has-bg-image', 'true');

    await drawLine(canvas, page, 280, 320, 580, 380);
    await expect(page.getByText('✓ Referenzlinie gezeichnet')).toBeVisible();
  });
});
