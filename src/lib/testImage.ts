/**
 * Deterministic test image for calibration development and testing.
 * Returns an SVG data URL containing a ruler-like pattern.
 */
export function createTestCalibrationImage(width = 800, height = 600): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#f4f4f4"/>
      
      <!-- Grid -->
      ${Array.from({ length: Math.floor(width / 50) }, (_, i) => 
        `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${height}" stroke="#ddd" stroke-width="1"/>`
      ).join('')}
      ${Array.from({ length: Math.floor(height / 50) }, (_, i) => 
        `<line x1="0" y1="${i * 50}" x2="${width}" y2="${i * 50}" stroke="#ddd" stroke-width="1"/>`
      ).join('')}
      
      <!-- Major ruler marks (simulating a 10cm reference object) -->
      <rect x="100" y="200" width="500" height="8" fill="#333" rx="2"/>
      
      <!-- Tick marks every 50px (representing 1cm if 500px = 10cm) -->
      ${Array.from({ length: 11 }, (_, i) => {
        const x = 100 + i * 50;
        const h = i % 5 === 0 ? 24 : 14;
        return `
          <line x1="${x}" y1="180" x2="${x}" y2="${180 + h}" stroke="#c00" stroke-width="2"/>
          <text x="${x}" y="172" font-size="11" fill="#c00" text-anchor="middle">${i}</text>
        `;
      }).join('')}
      
      <text x="350" y="260" font-size="14" fill="#444" text-anchor="middle">Reference: 10 cm (500 px)</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
