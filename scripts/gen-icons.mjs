/**
 * Genera le icone PWA (PNG) da public/favicon.svg. Eseguito manualmente:
 *   node scripts/gen-icons.mjs
 * I PNG risultanti sono committati (nessuna dipendenza a runtime).
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'favicon.svg'));
const bg = '#080b14'; // ink-950, full-bleed per icone maskable

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const t of targets) {
  await sharp(svg, { density: 384 })
    .resize(t.size, t.size, { fit: 'contain', background: bg })
    .flatten({ background: bg })
    .png()
    .toFile(join(root, 'public', t.file));
  console.log('✓', t.file, `${t.size}×${t.size}`);
}
console.log('Icone generate.');
