# pcge-peru-js

Biblioteca en JavaScript para consultar los catálogos PCGE 2019 y 2026 en Node.js, con edición explícita, navegación jerárquica, búsqueda y procedencia documental.

## Alcance y estado

- Versión inicial del paquete: `0.1.0`; la API puede cambiar antes de `1.0.0`.
- Entorno soportado y probado: Node.js 24, módulos ESM. Usa `node:fs` y `node:crypto`; no ofrece una distribución para navegador.
- Sin dependencias de ejecución, llamadas de red ni dependencia del paquete Python.
- Implementación escrita en JavaScript con JSDoc; no necesita compilación ni el repositorio TypeScript.
- Los datos provienen de una revisión fija de [pcge-peru](https://github.com/mat-l-dev/pcge-peru/tree/e9e69ed9075c09e8d1e5475760e5b691aa73b251), sin alterar cuentas, nombres, anomalías o decisiones de canonicalización.

El alcance es el catálogo del Capítulo II. No calcula impuestos, no registra asientos y no reemplaza un ERP ni el análisis de la norma aplicable. La selección de edición corresponde al consumidor. La denominación «2026» identifica el conjunto de datos y no significa que deba seleccionarse automáticamente para cualquier ejercicio.

## Instalación desde este repositorio

Este proyecto no afirma estar publicado en npm ni que el nombre esté reservado en ese registro. Para usar una copia revisada, genere e instale su archivo de paquete:

```sh
npm ci
npm run check
npm pack
```

En el proyecto consumidor:

```sh
npm install /ruta/pcge-peru-js-0.1.0.tgz
```

`npm ci` instala únicamente herramientas de desarrollo fijadas en `package-lock.json`. `npm pack` incluye el código JavaScript y los datos directamente. No se necesita un repositorio hermano para construir, probar o consumir el paquete. No se incluyen flujos de GitHub Actions ni publicación automática.

## Uso

```javascript
import { availableVersions, loadCatalog } from 'pcge-peru-js';

console.log(availableVersions()); // ['2019', '2026']
const catalog = loadCatalog('2026');
console.log(catalog.size); // 1636
console.log(catalog.get('101')?.name); // Caja
console.log(catalog.has('10')); // true
console.log(catalog.parent('101')?.code); // 10
console.log(catalog.children('10').map(entry => entry.code));
console.log(catalog.ancestors('1041').map(entry => entry.code)); // ['104', '10', '1']
console.log(catalog.descendants('9').map(entry => entry.code)); // ['91', '92', '93']
console.log(catalog.search('consultoria').map(entry => entry.code)); // ['4942', '632', '70992']

for (const entry of catalog) {
  console.log(entry.code, entry.name);
}

console.log(catalog.metadata?.pcge_version); // 2026
console.log(catalog.provenance?.dataset_sha256);
console.log(catalog.anomaliesFor('70992')[0]?.id); // ANOMALY-2026-70992
```

Para una consulta que deba existir, use `catalog.require('10')`. Lanza `PCGECodeError` si falta el código; `get` devuelve `null`. Los códigos siempre son cadenas. `loadCatalog()` sin edición o con una edición no disponible falla.

## API

- `availableVersions()`: arreglo congelado de ediciones disponibles.
- `loadCatalog('2019' | '2026')`: valida y carga una nueva instancia local en cada llamada.
- `PCGEEntry(code, name, parent_code = null)`: entrada inmutable; propiedades `code`, `name`, `parent_code`, `code_length` y `pcge_level`.
- `PCGECatalog(entries, options = {})`: catálogo de entradas `PCGEEntry`; acepta metadatos, procedencia y anomalías opcionales, validados y copiados defensivamente.
- `size`, `length`, iteración con `for...of`: cantidad y orden documental.
- `get(code)`, `require(code)`, `has(code)`: consulta segura, obligatoria y pertenencia. `has` devuelve `false` para valores que no sean cadenas; las otras consultas rechazan tipos incorrectos.
- `parent(code)`: padre inmediato o `null` para una raíz.
- `children(code)`: hijos directos en orden documental.
- `ancestors(code)`: desde el padre inmediato hasta la raíz.
- `descendants(code)`: recorrido en profundidad, conservando el orden de los hijos.
- `search(query)`: coincidencia de subcadena en código o nombre normalizado, en orden documental; rechaza consultas vacías o solo espacios.
- `metadata`, `provenance`, `anomalies`: modelos profundamente congelados; las consultas también devuelven arreglos congelados.
- `anomaliesFor(code)`: incluye coincidencias en `codes` o en los códigos impresos de las apariciones. Puede consultar códigos excluidos del catálogo; una ausencia devuelve `[]`.
- `normalizeForSearch(text)`: normalización utilizada por la búsqueda.
- `PCGEDataError`: problema de carga, formato o integridad; `PCGECodeError`: código requerido ausente. Entradas o argumentos inválidos usan `TypeError` o `RangeError`.

Se conservan los alias `load_catalog`, `available_versions` y `anomalies_for` para facilitar migraciones. Las propiedades documentales mantienen sus nombres originales con guiones bajos.

`PCGELevel` expone `ELEMENT`, `ACCOUNT`, `SUBACCOUNT`, `DIVISIONARY` y `SUBDIVISIONARY`. Los códigos de seis dígitos se preservan y tienen `pcge_level === null`; no se inventa un sexto nivel. Los padres se validan como prefijos inmediatos, lo que también impide ciclos.

En la procedencia, las fechas son cadenas ISO `AAAA-MM-DD` y los rangos de páginas son pares congelados `[primera, última]`. Se evita convertir fechas documentales en instantes con zona horaria. Las anomalías exponen siempre `codes` como arreglo, aunque el JSON fuente use `code` para una sola cuenta. Los modelos de metadatos, procedencia y anomalías se describen con tipos JSDoc y se consumen como objetos, no como clases constructoras.

## Búsqueda Unicode

La búsqueda reproduce la secuencia del proyecto de referencia: NFKD, eliminación de caracteres cuya clase combinante canónica es distinta de cero y *casefold* completo. La tabla está fijada a Unicode 16.0.0, correspondiente al entorno Python 3.14 declarado por el proyecto original. No depende de la versión Unicode del Node.js instalado.

Por ejemplo, `Straße` se transforma en `strasse`, `Σσς` en `σσσ` y `MERCADERÍAS` en `mercaderias`. Se conservan las marcas de clase cero: eliminar toda la categoría Unicode de marcas produciría resultados distintos. El recorte de espacios reproduce `str.strip` de Python, incluidos U+001C y U+0085; U+FEFF no se recorta.

Una consulta formada solo por una marca combinante no vacía se normaliza a la cadena vacía y coincide con todas las entradas, tal como en la API original. Consulte [mantenimiento](docs/MANTENIMIENTO.md) para reproducir la tabla sin depender de Python.

## Datos e integridad

- Edición 2019: 1.757 entradas, 10 anomalías registradas y 20 códigos de seis dígitos.
- Edición 2026: 1.636 entradas, 1 anomalía registrada y 12 códigos de seis dígitos.
- Los ocho archivos `entries.json`, `metadata.json`, `source.json` y `anomalies.json` se copian byte a byte de la revisión fijada.
- La carga verifica los cuatro archivos de cada edición mediante SHA-256, además del hash de entradas declarado en `source.json`, el esquema de versión, el conteo y la jerarquía.
- Las pruebas verifican los esquemas originales, las huellas SHA-256 y los identificadores Git de los archivos importados.

Las huellas detectan alteraciones de los recursos frente a la referencia empaquetada. No son firmas digitales ni garantizan autenticidad frente a una modificación conjunta del código y las huellas. El PDF oficial no se distribuye ni se vuelve a auditar aquí: su huella se conserva como dato de procedencia heredado. Detalles en [PROVENANCE.md](PROVENANCE.md).

## Verificación local

```sh
npm ci
npm run check
```

Las pruebas usan `node:test` y cubren los 3.393 códigos, toda su navegación, consultas de búsqueda, anomalías, errores, inmutabilidad, esquemas, corrupción de los ocho recursos y consumo de un paquete instalado fuera del repositorio. El consumidor de prueba ejecuta el JavaScript instalado sin herramientas de compilación. Las pruebas de referencia son compartidas con los otros puertos; no ejecutan la suite Python original.

## Licencias

El código de esta adaptación y el proyecto original se distribuyen bajo Apache License 2.0: [LICENSE](LICENSE) y [NOTICE](NOTICE). Las tablas Unicode se distribuyen bajo Unicode License v3: [LICENSE-UNICODE](LICENSE-UNICODE).

Los textos normativos del PCGE corresponden a disposiciones del Estado Peruano, emitidas a través del CNC y el MEF. Se conserva separada su procedencia y no se les atribuye la licencia Apache 2.0.
