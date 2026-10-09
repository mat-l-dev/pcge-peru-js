import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as validate from './validation.js';
import { normalizeForSearch, stripWhitespace } from './normalization.js';

/** @typedef {'2019'|'2026'} PCGEVersion */
/** @typedef {'element'|'account'|'subaccount'|'divisionary'|'subdivisionary'} PCGELevelValue */
/**
 * @typedef {object} PCGEMetadata
 * @property {string} pcge_version
 * @property {number} schema_version
 * @property {number} dataset_revision
 * @property {number} entry_count
 */
/**
 * @typedef {object} PCGEProvenance
 * @property {string} title
 * @property {string} authority
 * @property {string} resolution
 * @property {string} resolution_date Fecha ISO sin zona horaria.
 * @property {string} publication_date
 * @property {string} mandatory_effective_date
 * @property {string} resolution_url
 * @property {string} source_filename
 * @property {string} source_sha256
 * @property {string} catalog_chapter
 * @property {readonly [number, number]} catalog_pdf_pages
 * @property {readonly [number, number]} catalog_printed_pages
 * @property {string} dataset_sha256
 */
/**
 * @typedef {object} PCGEAnomalyOccurrence
 * @property {number} occurrence_index
 * @property {number} pdf_page
 * @property {number} printed_page
 * @property {string} printed_code
 * @property {string} printed_name
 * @property {string} printed_parent_code
 * @property {string} disposition
 */
/**
 * @typedef {object} PCGEAnomaly
 * @property {string} id
 * @property {string} type
 * @property {readonly string[]} codes
 * @property {string} status
 * @property {string} description
 * @property {string} decision
 * @property {string} confirmation_no_invented_code
 * @property {readonly PCGEAnomalyOccurrence[]} occurrences
 */
/**
 * @typedef {object} CatalogOptions
 * @property {PCGEMetadata|null} [metadata]
 * @property {PCGEProvenance|null} [provenance]
 * @property {Iterable<PCGEAnomaly>} [anomalies]
 */

export const PCGELevel = Object.freeze({
  ELEMENT: 'element', ACCOUNT: 'account', SUBACCOUNT: 'subaccount',
  DIVISIONARY: 'divisionary', SUBDIVISIONARY: 'subdivisionary',
});

/** Error de lectura, formato o integridad de los recursos empaquetados. */
export class PCGEDataError extends Error {
  /** @param {string} message @param {ErrorOptions} [options] */
  constructor(message, options) {
    super(message, options);
    this.name = 'PCGEDataError';
  }
}
/** Error emitido por una consulta obligatoria de un código ausente. */
export class PCGECodeError extends RangeError {
  /** @param {string} code */
  constructor(code) {
    super(`El código no existe en el catálogo: ${code}`);
    this.name = 'PCGECodeError';
    this.code = code;
  }
}

/** Entrada inmutable del catálogo. */
export class PCGEEntry {
  /** @param {string} code @param {string} name @param {string|null} [parent_code] */
  constructor(code, name, parent_code = null) {
    validate.string(code, 'code');
    if (!/^[0-9]+(?![\s\S])/.test(code)) throw new RangeError('code debe contener únicamente dígitos ASCII');
    validate.nonempty(name, 'name');
    if (parent_code !== null) {
      validate.string(parent_code, 'parent_code');
      if (!/^[0-9]+(?![\s\S])/.test(parent_code)) throw new RangeError('parent_code debe contener únicamente dígitos ASCII');
    }
    if ((code.length === 1) !== (parent_code === null)) throw new RangeError('La raíz no tiene padre; las demás entradas requieren padre');
    this.code = code;
    this.name = name;
    this.parent_code = parent_code;
    Object.freeze(this);
  }
  /** @returns {number} */
  get code_length() { return this.code.length; }
  /** @returns {PCGELevelValue|null} */
  get pcge_level() {
    return [PCGELevel.ELEMENT, PCGELevel.ACCOUNT, PCGELevel.SUBACCOUNT, PCGELevel.DIVISIONARY, PCGELevel.SUBDIVISIONARY][this.code_length - 1] ?? null;
  }
}

/** Catálogo inmutable, indexado por código y en orden documental. */
export class PCGECatalog {
  #entries = new Map();
  #ordered;
  #children = new Map();
  #names;
  /** @param {Iterable<PCGEEntry>} entries @param {CatalogOptions} [options] */
  constructor(entries, options = {}) {
    const ordered = [];
    const children = new Map();
    for (const entry of entries) {
      if (!(entry instanceof PCGEEntry)) throw new TypeError('Cada entrada debe ser PCGEEntry');
      if (entry.code_length > 6) throw new RangeError('La longitud del código debe estar entre uno y seis');
      if (this.#entries.has(entry.code)) throw new RangeError(`Código duplicado: ${entry.code}`);
      ordered.push(entry);
      this.#entries.set(entry.code, entry);
      children.set(entry.code, []);
    }
    for (const entry of ordered) {
      if (entry.parent_code === null) continue;
      if (!children.has(entry.parent_code)) throw new RangeError(`Padre inexistente: ${entry.parent_code}`);
      if (entry.parent_code !== entry.code.slice(0, -1)) throw new RangeError(`El padre debe ser el prefijo de ${entry.code}`);
      children.get(entry.parent_code).push(entry);
    }
    const metadata = options.metadata ?? null;
    if (metadata !== null) {
      validate.metadata(metadata);
      if (metadata.entry_count !== ordered.length) throw new RangeError('entry_count no coincide con las entradas');
    }
    const provenance = options.provenance ?? null;
    if (provenance !== null) validate.provenance(provenance);
    const anomalies = [...(options.anomalies ?? [])];
    const identifiers = new Set();
    for (const anomaly of anomalies) {
      validate.anomaly(anomaly);
      if (identifiers.has(anomaly.id)) throw new RangeError(`Anomalía duplicada: ${anomaly.id}`);
      identifiers.add(anomaly.id);
    }
    /** @type {PCGEMetadata|null} */
    this.metadata = validate.frozenCopy(metadata);
    /** @type {PCGEProvenance|null} */
    this.provenance = validate.frozenCopy(provenance);
    /** @type {readonly PCGEAnomaly[]} */
    this.anomalies = validate.frozenCopy(anomalies);
    this.#ordered = Object.freeze(ordered);
    this.#names = Object.freeze(ordered.map(entry => normalizeForSearch(entry.name)));
    for (const [code, list] of children) this.#children.set(code, Object.freeze(list));
    Object.freeze(this);
  }
  /** @returns {number} */
  get size() { return this.#ordered.length; }
  /** @returns {number} */
  get length() { return this.size; }
  /** @returns {Iterator<PCGEEntry>} */
  [Symbol.iterator]() { return this.#ordered[Symbol.iterator](); }
  /** @param {unknown} code @returns {boolean} */
  has(code) { return typeof code === 'string' && this.#entries.has(code); }
  /** @param {string} code @returns {PCGEEntry|null} */
  get(code) {
    validate.string(code, 'code');
    return this.#entries.get(code) ?? null;
  }
  /** @param {string} code @returns {PCGEEntry} */
  require(code) {
    const entry = this.get(code);
    if (entry === null) throw new PCGECodeError(code);
    return entry;
  }
  /** @param {string} code @returns {PCGEEntry|null} */
  parent(code) {
    const entry = this.require(code);
    return entry.parent_code === null ? null : this.require(entry.parent_code);
  }
  /** @param {string} code @returns {readonly PCGEEntry[]} */
  children(code) {
    this.require(code);
    return this.#children.get(code);
  }
  /** @param {string} code @returns {readonly PCGEEntry[]} */
  ancestors(code) {
    const result = [];
    let current = this.parent(code);
    while (current !== null) {
      result.push(current);
      current = this.parent(current.code);
    }
    return Object.freeze(result);
  }
  /** @param {string} code @returns {readonly PCGEEntry[]} */
  descendants(code) {
    const result = [];
    const pending = [...this.children(code)].reverse();
    while (pending.length) {
      const current = pending.pop();
      result.push(current);
      pending.push(...[...this.children(current.code)].reverse());
    }
    return Object.freeze(result);
  }
  /** @param {string} query @returns {readonly PCGEEntry[]} */
  search(query) {
    validate.string(query, 'query');
    const cleaned = stripWhitespace(query);
    if (!cleaned) throw new RangeError('query no puede estar vacío');
    const normalized = normalizeForSearch(cleaned);
    return Object.freeze(this.#ordered.filter((entry, index) => entry.code.includes(normalized) || this.#names[index].includes(normalized)));
  }
  /** @param {string} code @returns {readonly PCGEAnomaly[]} */
  anomaliesFor(code) {
    validate.codeText(code, 'code');
    return Object.freeze(this.anomalies.filter(anomaly => anomaly.codes.includes(code) || anomaly.occurrences.some(item => item.printed_code === code)));
  }
  /** @param {string} code @returns {readonly PCGEAnomaly[]} */
  anomalies_for(code) { return this.anomaliesFor(code); }
}

const versions = Object.freeze(['2019', '2026']);
/** @returns {readonly PCGEVersion[]} */
export function availableVersions() { return versions; }
const integrity = JSON.parse(readFileSync(new URL('../data/integrity.json', import.meta.url), 'utf8'));
/** @param {PCGEVersion} version @param {string} filename @returns {unknown} */
function resource(version, filename) {
  const relative = `${version}/${filename}`;
  const bytes = readFileSync(new URL(`../data/${relative}`, import.meta.url));
  const actual = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (actual !== integrity[relative]) throw new PCGEDataError(`Integridad SHA-256 inválida: ${relative}`);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
/** Carga local, sin red, con edición explícita. @param {PCGEVersion} version @returns {PCGECatalog} */
export function loadCatalog(version) {
  validate.string(version, 'version');
  if (!versions.includes(version)) throw new PCGEDataError(`Edición no disponible: ${version}. Disponibles: ${versions.join(', ')}`);
  try {
    const metadata = resource(version, 'metadata.json');
    validate.metadata(metadata);
    if (metadata.pcge_version !== version || metadata.schema_version !== 1) throw new PCGEDataError('Edición o schema_version incompatible');
    const source = resource(version, 'source.json');
    const provenance = { ...source };
    for (const field of ['catalog_pdf_pages', 'catalog_printed_pages']) {
      validate.shape(source[field], ['first', 'last'], field);
      provenance[field] = [source[field].first, source[field].last];
    }
    validate.provenance(provenance);
    if (provenance.dataset_sha256 !== integrity[`${version}/entries.json`]) throw new PCGEDataError('dataset_sha256 no coincide con la huella canónica');
    const rawEntries = resource(version, 'entries.json');
    if (!Array.isArray(rawEntries)) throw new PCGEDataError('entries debe ser una lista');
    const entries = rawEntries.map(raw => {
      validate.shape(raw, ['code', 'name', 'parent_code'], 'entry');
      return new PCGEEntry(raw.code, raw.name, raw.parent_code);
    });
    const rawAnomalies = resource(version, 'anomalies.json');
    if (!Array.isArray(rawAnomalies)) throw new PCGEDataError('anomalies debe ser una lista');
    const anomalies = rawAnomalies.map(raw => {
      const anomaly = { ...raw };
      if (Object.hasOwn(raw, 'code')) {
        if (Object.hasOwn(raw, 'codes')) throw new PCGEDataError('Una anomalía no puede tener code y codes');
        anomaly.codes = [anomaly.code];
        delete anomaly.code;
      }
      validate.anomaly(anomaly);
      return anomaly;
    });
    return new PCGECatalog(entries, { metadata, provenance, anomalies });
  } catch (cause) {
    if (cause instanceof PCGEDataError) throw cause;
    throw new PCGEDataError(`No se pudo cargar la edición ${version}`, { cause });
  }
}
export { normalizeForSearch };
export const available_versions = availableVersions;
export const load_catalog = loadCatalog;
