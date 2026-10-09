import { stripWhitespace } from './normalization.js';

/** @param {unknown} value @param {string} field */
export function string(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} debe ser una cadena`);
}
/** @param {unknown} value @param {string} field */
export function nonempty(value, field) {
  string(value, field);
  if (!stripWhitespace(value)) throw new RangeError(`${field} no puede estar vacío`);
}
/** @param {unknown} value @param {string} field */
export function codeText(value, field) {
  nonempty(value, field);
  if (stripWhitespace(value) !== value) throw new RangeError(`${field} no admite espacios exteriores`);
}
/** @param {unknown} value @param {string} field @param {number} [minimum] */
function integer(value, field, minimum = 1) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${field} debe ser un entero seguro`);
  if (value < minimum) throw new RangeError(`${field} debe ser mayor o igual que ${minimum}`);
}
/** @param {unknown} value @param {string[]} fields @param {string} label */
export function shape(value, fields, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} debe ser un objeto`);
  if (Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value, field))) {
    throw new RangeError(`${label} contiene campos faltantes o desconocidos`);
  }
}
/** Copia defensiva profunda de los modelos JSON. @template T @param {T} value @returns {T} */
export function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)])));
  }
  return value;
}
/** @param {import('./index.js').PCGEMetadata} value */
export function metadata(value) {
  shape(value, ['pcge_version', 'schema_version', 'dataset_revision', 'entry_count'], 'metadata');
  string(value.pcge_version, 'pcge_version');
  if (!/^[0-9]+(?![\s\S])/.test(value.pcge_version)) throw new RangeError('pcge_version debe contener dígitos ASCII');
  integer(value.schema_version, 'schema_version');
  integer(value.dataset_revision, 'dataset_revision');
  integer(value.entry_count, 'entry_count', 0);
}
/** @param {import('./index.js').PCGEProvenance} value */
export function provenance(value) {
  const textFields = ['title', 'authority', 'resolution', 'resolution_url', 'source_filename', 'catalog_chapter'];
  const dateFields = ['resolution_date', 'publication_date', 'mandatory_effective_date'];
  const hashFields = ['source_sha256', 'dataset_sha256'];
  const pageFields = ['catalog_pdf_pages', 'catalog_printed_pages'];
  shape(value, [...textFields, ...dateFields, ...hashFields, ...pageFields], 'provenance');
  for (const field of textFields) nonempty(value[field], field);
  for (const field of dateFields) {
    const date = value[field];
    string(date, field);
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\s\S])/.test(date) || date.startsWith('0000-')) throw new RangeError(`${field} debe ser una fecha ISO válida`);
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new RangeError(`${field} debe ser una fecha ISO válida`);
  }
  for (const field of hashFields) {
    string(value[field], field);
    if (!/^[0-9A-F]{64}(?![\s\S])/.test(value[field])) throw new RangeError(`${field} debe ser un SHA-256 hexadecimal en mayúsculas`);
  }
  for (const field of pageFields) {
    const pair = value[field];
    if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError(`${field} debe contener dos páginas`);
    integer(pair[0], `${field}[0]`); integer(pair[1], `${field}[1]`);
    if (pair[0] > pair[1]) throw new RangeError(`${field} está invertido`);
  }
}
/** @param {import('./index.js').PCGEAnomaly} value */
export function anomaly(value) {
  const texts = ['id', 'type', 'status', 'description', 'decision', 'confirmation_no_invented_code'];
  shape(value, [...texts, 'codes', 'occurrences'], 'anomaly');
  for (const field of texts) nonempty(value[field], field);
  if (!Array.isArray(value.codes) || !value.codes.length) throw new RangeError('codes debe ser una lista no vacía');
  for (const code of value.codes) codeText(code, 'codes');
  if (new Set(value.codes).size !== value.codes.length) throw new RangeError('codes contiene duplicados');
  if (!Array.isArray(value.occurrences) || !value.occurrences.length) throw new RangeError('occurrences debe ser una lista no vacía');
  const seen = new Set();
  for (const occurrence of value.occurrences) {
    shape(occurrence, ['occurrence_index', 'pdf_page', 'printed_page', 'printed_code', 'printed_name', 'printed_parent_code', 'disposition'], 'occurrence');
    for (const field of ['occurrence_index', 'pdf_page', 'printed_page']) integer(occurrence[field], field);
    if (seen.has(occurrence.occurrence_index)) throw new RangeError('occurrence_index contiene duplicados');
    seen.add(occurrence.occurrence_index);
    for (const field of ['printed_code', 'printed_parent_code']) codeText(occurrence[field], field);
    for (const field of ['printed_name', 'disposition']) nonempty(occurrence[field], field);
  }
}
