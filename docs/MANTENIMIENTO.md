# Mantenimiento

## Independencia y paridad

`pcge-peru-ts` y `pcge-peru-js` son repositorios independientes. El primero mantiene fuentes TypeScript y genera sus propios archivos de distribución; el segundo mantiene fuentes JavaScript con JSDoc. Ninguno importa código del otro ni requiere el paquete Python original.

Se comparten únicamente los datos fijados, los esquemas y las referencias de pruebas. Cualquier cambio semántico debe revisarse en ambos proyectos y ejecutar sus pruebas por separado. No se debe publicar la salida compilada TypeScript como sustituto del código fuente JavaScript de su repositorio hermano.

## Actualizar una edición

1. Seleccionar y documentar una revisión explícita del proyecto de referencia.
2. Leer las diferencias de datos, esquema, API y anomalías. No corregir cuentas por inferencia.
3. Copiar los JSON como bytes, preservando codificación y saltos de línea. `.gitattributes` evita conversiones de estos archivos.
4. Verificar los objetos Git y SHA-256; actualizar `data/integrity.json`, la procedencia y las referencias de pruebas en ambos puertos mediante revisión.
5. Comparar orden completo, jerarquía, búsquedas, niveles, errores y anomalías. Para nuevas referencias, usar una implementación independiente de la semántica original, no derivarlas del puerto sometido a prueba.
6. Ejecutar `npm ci`, `npm run check` y revisar `npm pack --dry-run`. Ajustar versión y registro de cambios cuando corresponda.

Las revisiones futuras no se descargan automáticamente. Un cambio de datos, algoritmo de búsqueda o contrato público requiere revisión; el número de paquete no reemplaza la edición documental.

## Reproducir Unicode 16.0.0

La generación es opcional para mantenimiento. Construir, probar y consumir el paquete utiliza la tabla ya incluida y no necesita descargar fuentes Unicode.

Descargue estos archivos oficiales en un directorio local; el generador exige sus SHA-256 exactos registrados en la tabla:

```sh
mkdir unicode-16
curl --fail --location https://www.unicode.org/Public/16.0.0/ucd/UnicodeData.txt -o unicode-16/UnicodeData-16.0.0.txt
curl --fail --location https://www.unicode.org/Public/16.0.0/ucd/CaseFolding.txt -o unicode-16/CaseFolding-16.0.0.txt
node scripts/generate-unicode.mjs unicode-16
```

El generador no usa red ni modifica la tabla: reconstruye los bytes en memoria, verifica igualdad total y muestra su SHA-256. La licencia Unicode ya está incluida como `LICENSE-UNICODE`. Si una descarga tiene otra huella, se rechaza; no se acepta una versión nueva de forma implícita.

El algoritmo expande descomposiciones de compatibilidad y Hangul, elimina clases combinantes no nulas y aplica las entradas de *casefold* completo (`C` y `F`, sin modo turco). Se omite la reordenación canónica porque todos los caracteres de clase no nula se eliminan antes del plegado; los de clase cero supervivientes conservan su orden. La composición por escalares permite reproducir el resultado sin depender de ICU ni de `toLowerCase()`.

## Distribución y comprobaciones

El paquete declara Node.js 24 o posterior; la verificación de esta versión se realizó con Node.js 24.19.0 y npm 11.9.0. No se verificaron versiones posteriores, otros sistemas operativos ni navegadores. El formato distribuido es ESM.

No se incorporan flujos de CI ni publicación en registros. Los comandos son locales. `npm test` incluye una instalación temporal del archivo `.tgz`, una importación desde fuera del repositorio y pruebas de alteración de los recursos; no publica nada ni necesita credenciales.

La publicación en npm requerirá una decisión separada sobre nombre, propietario y permisos. No dé por hecho que el nombre del paquete está disponible.
