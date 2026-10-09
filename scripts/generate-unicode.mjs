import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regenera en memoria la tabla fijada y exige igualdad byte a byte, sin red.
const directory = process.argv[2];
if (!directory) throw new Error('Uso: node scripts/generate-unicode.mjs <directorio-de-fuentes-unicode>');
const expectedBytes = readFileSync(new URL('../data/unicode-normalization.json', import.meta.url));
const expected = JSON.parse(expectedBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sourceText = filename => {
  const source = expected.sources.find(item => item.filename === filename);
  const bytes = readFileSync(resolve(directory, filename));
  assert.equal(digest(bytes), source.sha256, `Huella de ${filename}`);
  return bytes.toString('utf8');
};
const decompositions = new Map();
const combining = new Set();
const whitespace = new Set();
for (const line of sourceText('UnicodeData-16.0.0.txt').split(/\r?\n/)) {
  if (!line) continue;
  const row = line.split(';');
  const scalar = parseInt(row[0], 16);
  if (Number(row[3]) !== 0) combining.add(scalar);
  if (row[2] === 'Zs' || ['WS', 'B', 'S'].includes(row[4])) whitespace.add(scalar);
  if (row[5]) decompositions.set(scalar, row[5].split(' ').filter(value => !value.startsWith('<')).map(value => parseInt(value, 16)));
}
const folds = new Map();
for (const line of sourceText('CaseFolding-16.0.0.txt').split(/\r?\n/)) {
  const body = line.split('#')[0].trim();
  if (!body) continue;
  const [code, status, mapped] = body.split(';').map(value => value.trim());
  if (status === 'C' || status === 'F') folds.set(parseInt(code, 16), mapped.split(' ').map(value => String.fromCodePoint(parseInt(value, 16))).join(''));
}
const cache = new Map();
function decompose(scalar) {
  if (cache.has(scalar)) return cache.get(scalar);
  let result;
  if (scalar >= 0xAC00 && scalar < 0xAC00 + 11172) {
    const syllable = scalar - 0xAC00;
    result = [0x1100 + Math.floor(syllable / 588), 0x1161 + Math.floor((syllable % 588) / 28)];
    if (syllable % 28) result.push(0x11A7 + syllable % 28);
  } else if (decompositions.has(scalar)) result = decompositions.get(scalar).flatMap(decompose);
  else result = [scalar];
  cache.set(scalar, result);
  return result;
}
const mappings = [];
for (let scalar = 0; scalar < 0x110000; scalar++) {
  if (scalar >= 0xD800 && scalar <= 0xDFFF) continue;
  // Reordenar clases combinantes no afecta a los supervivientes de clase cero.
  const normalized = decompose(scalar).filter(point => !combining.has(point)).map(point => folds.get(point) ?? String.fromCodePoint(point)).join('');
  if (normalized !== String.fromCodePoint(scalar)) mappings.push([scalar, normalized]);
}
const actual = {
  unicode_version: expected.unicode_version,
  algorithm: expected.algorithm,
  whitespace_codepoints: [...whitespace].sort((a, b) => a - b),
  mappings,
  sources: expected.sources,
};
const actualBytes = Buffer.from(JSON.stringify(actual) + '\n');
assert.deepEqual(actualBytes, expectedBytes, 'La tabla regenerada debe coincidir exactamente');
console.log(`Unicode ${actual.unicode_version}: ${mappings.length} transformaciones; SHA-256 ${digest(actualBytes)}`);
