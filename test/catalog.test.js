import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { PCGEEntry, PCGECatalog, PCGECodeError, PCGEDataError, PCGELevel, availableVersions, available_versions, loadCatalog, load_catalog, normalizeForSearch } from '../src/index.js';
import { stripWhitespace } from '../src/normalization.js';

const readJSON = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const golden = readJSON('./fixtures/golden-fixtures.json');
const manifest = readJSON('./fixtures/manifest.json');
const codes = entries => [...entries].map(entry => entry.code);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });

function navigation(catalog, reference) {
  for (const item of reference) {
    assert.equal(catalog.parent(item.code)?.code ?? null, item.parent, `padre ${item.code}`);
    for (const method of ['children', 'ancestors', 'descendants']) {
      assert.deepEqual(codes(catalog[method](item.code)), item[method], `${method} ${item.code}`);
    }
  }
}

test('ediciones explícitas y aliases compatibles', () => {
  assert.deepEqual(availableVersions(), ['2019', '2026']);
  assert.equal(available_versions, availableVersions);
  assert.equal(load_catalog, loadCatalog);
  assert.equal(Object.isFrozen(availableVersions()), true);
  assert.throws(() => loadCatalog(), TypeError);
  for (const version of golden.invalid_versions) assert.throws(() => loadCatalog(version));
});

for (const version of availableVersions()) {
  const catalog = loadCatalog(version);
  const expected = golden.editions[version];
  test(`${version}: catálogo completo, orden y bytes fijados`, () => {
    assert.equal(catalog.size, expected.entry_count);
    assert.equal(catalog.length, expected.entry_count);
    assert.deepEqual(codes(catalog), expected.ordered_codes);
    const counts = {};
    for (const entry of catalog) {
      counts[entry.code_length] = (counts[entry.code_length] ?? 0) + 1;
      assert.equal(catalog.get(entry.code), entry);
      assert.equal(catalog.has(entry.code), true);
      assert.equal(Object.isFrozen(entry), true);
    }
    assert.deepEqual(counts, expected.code_length_counts);
    assert.deepEqual(codes([...catalog].filter(entry => entry.parent_code === null)), expected.roots);
    const bytes = readFileSync(new URL(`../data/${version}/entries.json`, import.meta.url));
    assert.equal(sha256(bytes), expected.dataset_sha256);
    assert.equal(catalog.provenance.dataset_sha256, expected.dataset_sha256);
    assert.equal(catalog.metadata.entry_count, catalog.size);
    assert.equal(catalog.metadata.pcge_version, version);
    assert.equal(catalog.anomalies.length, expected.anomaly_count);
  });
  test(`${version}: toda la navegación coincide con el original`, () => navigation(catalog, expected.navigation));
  test(`${version}: búsquedas y anomalías coinciden con las referencias`, () => {
    for (const item of expected.search) assert.deepEqual(codes(catalog.search(item.query)), item.codes, item.query);
    for (const item of expected.anomalies_for) {
      assert.deepEqual(catalog.anomaliesFor(item.code).map(anomaly => anomaly.id), item.ids, item.code);
      assert.deepEqual(catalog.anomalies_for(item.code), catalog.anomaliesFor(item.code));
    }
  });
  test(`${version}: los cuatro recursos cumplen los esquemas originales`, () => {
    for (const name of ['entries', 'metadata', 'source', 'anomalies']) {
      const validator = ajv.compile(readJSON(`../schemas/${name}.schema.json`));
      assert.equal(validator(readJSON(`../data/${version}/${name}.json`)), true, JSON.stringify(validator.errors));
    }
  });
  test(`${version}: no se expone estado mutable`, () => {
    assert.equal(Object.isFrozen(catalog), true);
    assert.throws(() => { catalog.metadata.entry_count = 0; }, TypeError);
    assert.throws(() => { catalog.get('10').name = 'Modificado'; }, TypeError);
    assert.throws(() => catalog.children('10').pop(), TypeError);
    assert.throws(() => catalog.ancestors('101').push(catalog.get('1')), TypeError);
    assert.throws(() => catalog.descendants('1').pop(), TypeError);
    assert.throws(() => catalog.search('caja').pop(), TypeError);
    assert.throws(() => catalog.anomalies.pop(), TypeError);
    assert.throws(() => { catalog.anomalies[0].occurrences[0].printed_name = 'Cambio'; }, TypeError);
    assert.throws(() => catalog.provenance.catalog_pdf_pages.pop(), TypeError);
  });
}

test('los recursos, licencia, esquemas y Unicode conservan las huellas de procedencia', () => {
  for (const file of manifest.files) {
    let path;
    if (file.path.startsWith('src/pcge/data/') && file.path.endsWith('.json')) path = file.path.replace('src/pcge/data/', '../data/');
    else if (file.path.startsWith('schemas/')) path = `../${file.path}`;
    else if (file.path === 'LICENSE') path = '../LICENSE';
    else continue;
    const bytes = readFileSync(new URL(path, import.meta.url));
    assert.equal(sha256(bytes), file.sha256, file.path);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), file.git_blob_sha, file.path);
  }
  assert.equal(sha256(readFileSync(new URL('../data/unicode-normalization.json', import.meta.url))), '8BB1A8BB61DC74470EEFD96FC71B5F85D7FB4ABBC35401D9ED8E5AAD9E7E13CA');
});

test('normalización Unicode 16 completa y espacios equivalentes a Python', () => {
  for (const item of golden.normalization) assert.equal(normalizeForSearch(item.input), item.output, JSON.stringify(item.input));
  for (const item of golden.trim) assert.equal(stripWhitespace(item.input), item.output, JSON.stringify(item.input));
  const table = readJSON('../data/unicode-normalization.json');
  for (const [scalar, expected] of table.mappings) assert.equal(normalizeForSearch(String.fromCodePoint(scalar)), expected, scalar.toString(16));
  assert.throws(() => normalizeForSearch(1), TypeError);
});

test('catálogo sintético conserva orden no numérico, niveles y búsqueda especial', () => {
  const catalog = new PCGECatalog(golden.synthetic.entries.map(entry => new PCGEEntry(entry.code, entry.name, entry.parent_code)));
  navigation(catalog, golden.synthetic.navigation);
  assert.deepEqual(codes(catalog), golden.synthetic.entries.map(entry => entry.code));
  for (const [code, level] of Object.entries(golden.synthetic.levels)) assert.equal(catalog.get(code).pcge_level, level);
  for (const item of golden.synthetic.search) assert.deepEqual(codes(catalog.search(item.query)), item.codes);
  assert.equal(catalog.metadata, null);
  assert.equal(catalog.provenance, null);
});

test('ausencia, tipos y búsquedas inválidas tienen contratos explícitos', () => {
  const catalog = loadCatalog('2019');
  assert.equal(catalog.get('999999'), null);
  assert.equal(catalog.has(10), false);
  assert.equal(catalog.has(null), false);
  assert.equal(catalog.has('999999'), false);
  for (const method of ['get', 'require', 'parent', 'children', 'ancestors', 'descendants', 'anomaliesFor']) assert.throws(() => catalog[method](10), TypeError);
  for (const method of ['require', 'parent', 'children', 'ancestors', 'descendants']) assert.throws(() => catalog[method]('999999'), PCGECodeError);
  for (const query of golden.invalid_search_queries) assert.throws(() => catalog.search(query), RangeError);
  assert.throws(() => catalog.search(null), TypeError);
  for (const code of ['', ' ', '10 ', ' 10', '\x1c10']) assert.throws(() => catalog.anomaliesFor(code), RangeError);
  assert.deepEqual(catalog.anomaliesFor('999999'), []);
  assert.equal(PCGELevel.ACCOUNT, 'account');
});

test('entradas rechazan códigos y nombres inválidos sin coerción', () => {
  for (const code of ['', '١', '１', '1\n', ' 1', '1 ', '1a', '-1']) assert.throws(() => new PCGEEntry(code, 'Nombre'));
  for (const code of [1, null, false]) assert.throws(() => new PCGEEntry(code, 'Nombre'), TypeError);
  for (const name of ['', ' ', '\x1c', '\x85']) assert.throws(() => new PCGEEntry('1', name), RangeError);
  assert.throws(() => new PCGEEntry('1', 1), TypeError);
  assert.throws(() => new PCGEEntry('1', 'Raíz', '1'));
  assert.throws(() => new PCGEEntry('10', 'Cuenta'));
  assert.throws(() => new PCGEEntry('10', 'Cuenta', '1\n'));
});

test('catálogo rechaza duplicados, padres inexistentes, prefijos inválidos y exceso de longitud', () => {
  const root = new PCGEEntry('1', 'Raíz');
  assert.throws(() => new PCGECatalog([{}]), TypeError);
  assert.throws(() => new PCGECatalog([root, root]), RangeError);
  assert.throws(() => new PCGECatalog([new PCGEEntry('10', 'Cuenta', '1')]), RangeError);
  assert.throws(() => new PCGECatalog([root, new PCGEEntry('20', 'Cuenta', '1')]), RangeError);
  assert.throws(() => new PCGECatalog([new PCGEEntry('1234567', 'Largo', '123456')]), RangeError);
  assert.throws(() => new PCGECatalog([root], { metadata: { pcge_version: '2019', schema_version: 1, dataset_revision: 1, entry_count: 2 } }), RangeError);
  assert.throws(() => new PCGECatalog([root], { metadata: { pcge_version: '2019', schema_version: true, dataset_revision: 1, entry_count: 1 } }), TypeError);
});

test('modelos de procedencia y anomalías se validan y copian defensivamente', () => {
  const source = loadCatalog('2026');
  const metadata = { ...source.metadata };
  const provenance = structuredClone(source.provenance);
  const anomalies = structuredClone(source.anomalies);
  const catalog = new PCGECatalog(source, { metadata, provenance, anomalies });
  metadata.entry_count = 0;
  provenance.catalog_pdf_pages[0] = 999;
  anomalies[0].codes[0] = '999';
  assert.equal(catalog.metadata.entry_count, 1636);
  assert.equal(catalog.provenance.catalog_pdf_pages[0], 19);
  assert.deepEqual(catalog.anomalies[0].codes, ['70992']);
  for (const bad of ['2026-02-30', '0000-01-01', '01-01-2026']) {
    assert.throws(() => new PCGECatalog(source, { provenance: { ...source.provenance, resolution_date: bad } }), RangeError);
  }
  assert.throws(() => new PCGECatalog(source, { provenance: { ...source.provenance, source_sha256: 'x' } }), RangeError);
  assert.throws(() => new PCGECatalog(source, { anomalies: [source.anomalies[0], source.anomalies[0]] }), RangeError);
  assert.throws(() => new PCGECatalog(source, { anomalies: [{ ...source.anomalies[0], codes: [] }] }), RangeError);
  assert.throws(() => new PCGECatalog(source, { anomalies: [{ ...source.anomalies[0], codes: ['70992', '70992'] }] }), RangeError);
  assert.throws(() => new PCGECatalog(source, { anomalies: [{ ...source.anomalies[0], occurrences: [source.anomalies[0].occurrences[0], source.anomalies[0].occurrences[0]] }] }), RangeError);
});

test('anomalías no generan códigos corregidos o cuentas artificiales', () => {
  const old = loadCatalog('2019');
  for (const code of ['36404', '36472', '36473', '36474', '39352', '63422', '683151', '6881', '70121', '70122']) assert.equal(old.has(code), false, code);
  assert.equal(old.anomaliesFor('33404').length, 1);
  assert.equal(old.has('33404'), false);
  const current = loadCatalog('2026');
  assert.equal(current.has('70902'), false);
  assert.equal(current.get('70992').name, 'Contrato de consultoría TI');
  assert.equal(current.anomaliesFor('70992').length, 1);
});
