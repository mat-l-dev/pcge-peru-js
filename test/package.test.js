import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;
const entryDirectory = 'src';

test('el paquete instalado se importa fuera del repositorio sin dependencias de ejecución', () => {
  const temp = mkdtempSync(join(tmpdir(), `${packageName}-consumo-`));
  try {
    const env = { ...process.env, npm_config_cache: join(temp, 'npm-cache') };
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const packed = JSON.parse(execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', temp], { cwd: root, env, encoding: 'utf8' }))[0];
    assert.ok(packed.files.some(item => item.path === 'LICENSE-UNICODE'));
    assert.ok(packed.files.some(item => item.path === 'docs/MANTENIMIENTO.md'));
    assert.ok(packed.files.some(item => item.path === 'scripts/generate-unicode.mjs'));
    assert.ok(packed.files.some(item => item.path === 'CHANGELOG.md'));
    assert.ok(packed.files.some(item => item.path === 'data/2019/entries.json'));
    assert.ok(!packed.files.some(item => /node_modules|AGENTS|\.github/.test(item.path)));
    writeFileSync(join(temp, 'package.json'), '{"private":true,"type":"module"}\n');
    execFileSync(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, packed.filename)], { cwd: temp, env, encoding: 'utf8' });
    const consumer = `import assert from 'node:assert/strict'; import { loadCatalog } from '${packageName}'; assert.equal(loadCatalog('2019').size,1757); assert.equal(loadCatalog('2026').size,1636); console.log('consumo correcto');`;
    writeFileSync(join(temp, 'consumer.mjs'), consumer);
    assert.match(execFileSync(process.execPath, [join(temp, 'consumer.mjs')], { cwd: tmpdir(), encoding: 'utf8' }), /consumo correcto/);
    const snippet = readFileSync(join(root, 'README.md'), 'utf8').match(/```(?:typescript|javascript)\n([\s\S]*?)```/)[1];
    writeFileSync(join(temp, 'readme.mjs'), snippet);
    assert.match(execFileSync(process.execPath, [join(temp, 'readme.mjs')], { cwd: tmpdir(), encoding: 'utf8' }), /ANOMALY-2026-70992/);
    const installed = JSON.parse(readFileSync(join(temp, 'node_modules', packageName, 'package.json'), 'utf8'));
    assert.equal(installed.dependencies, undefined);
    if (packageName.endsWith('-ts')) {
      writeFileSync(join(temp, 'readme.ts'), snippet);
      writeFileSync(join(temp, 'consumer.ts'), `import {loadCatalog, type PCGEEntry, type PCGEVersion} from '${packageName}'; const version: PCGEVersion = '2026'; const entry: PCGEEntry | null = loadCatalog(version).get('10'); console.log(entry?.name);\n// @ts-expect-error La edición debe ser explícita.\nloadCatalog();\n// @ts-expect-error Las ediciones ajenas al catálogo no forman parte del tipo.\nloadCatalog('2025');\n// @ts-expect-error Las entradas son inmutables.\nif (entry) entry.name = 'Cambio';\n`);
      execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', join(temp, 'consumer.ts'), join(temp, 'readme.ts')], { cwd: temp, encoding: 'utf8' });
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('la carga detecta cualquier alteración de los ocho recursos', () => {
  const temp = mkdtempSync(join(tmpdir(), `${packageName}-integridad-`));
  try {
    cpSync(join(root, entryDirectory), join(temp, entryDirectory), { recursive: true });
    cpSync(join(root, 'data'), join(temp, 'data'), { recursive: true });
    writeFileSync(join(temp, 'package.json'), '{"type":"module"}\n');
    const moduleUrl = pathToFileURL(join(temp, entryDirectory, 'index.js')).href;
    for (const version of ['2019', '2026']) {
      for (const name of ['entries', 'metadata', 'source', 'anomalies']) {
        const path = join(temp, 'data', version, `${name}.json`);
        const original = readFileSync(path);
        writeFileSync(path, Buffer.concat([original, Buffer.from(' ')]));
        const assertion = `import assert from 'node:assert/strict'; import {loadCatalog,PCGEDataError} from ${JSON.stringify(moduleUrl)}; assert.throws(()=>loadCatalog('${version}'), error => error instanceof PCGEDataError && /SHA-256/.test(error.message));`;
        execFileSync(process.execPath, ['--input-type=module', '--eval', assertion], { cwd: temp, encoding: 'utf8' });
        writeFileSync(path, original);
      }
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
