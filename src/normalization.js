import { readFileSync } from 'node:fs';

const table = JSON.parse(readFileSync(new URL('../data/unicode-normalization.json', import.meta.url), 'utf8'));
const replacements = new Map(table.mappings);
const whitespace = new Set(table.whitespace_codepoints);

/**
 * Normaliza con Unicode 16.0: NFKD, eliminación de clase combinante no nula y casefold.
 * @param {string} text
 * @returns {string}
 */
export function normalizeForSearch(text) {
  if (typeof text !== 'string') throw new TypeError('text debe ser una cadena');
  let result = '';
  for (const character of text) result += replacements.get(character.codePointAt(0)) ?? character;
  return result;
}

/** @param {string} text @returns {string} */
export function stripWhitespace(text) {
  const characters = [...text];
  let start = 0;
  let end = characters.length;
  while (start < end && whitespace.has(characters[start].codePointAt(0))) start++;
  while (end > start && whitespace.has(characters[end - 1].codePointAt(0))) end--;
  return characters.slice(start, end).join('');
}
