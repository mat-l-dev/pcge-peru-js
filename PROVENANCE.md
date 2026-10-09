# Procedencia

## Referencia del catálogo

- Repositorio: [mat-l-dev/pcge-peru](https://github.com/mat-l-dev/pcge-peru).
- Revisión fijada: [`e9e69ed9075c09e8d1e5475760e5b691aa73b251`](https://github.com/mat-l-dev/pcge-peru/tree/e9e69ed9075c09e8d1e5475760e5b691aa73b251).
- Árbol Git: `ff2667ab08a0a1d934791199f1b44e3422182cba`.
- Versión del proyecto de referencia: `0.2.1`; distinta de la versión de este paquete.
- Se importan los ocho JSON de `src/pcge/data/{2019,2026}/`, los cuatro esquemas y la licencia sin cambiar sus bytes.
- `test/fixtures/manifest.json` conserva las huellas de la referencia y los resúmenes de ambas ediciones. `data/integrity.json` contiene las huellas usadas durante la carga.

El manifiesto identifica también archivos del proyecto de referencia que no se redistribuyen en este paquete. No implica que estén incluidos ni que se haya ejecutado su suite de pruebas. La documentación, implementación, empaquetado y pruebas de este puerto son nuevos; los datos y esquemas importados permanecen sin modificación.

## Huellas de las entradas

- 2019: `FC70E43B94D0718373AB3B9F81202731E5295EDEDF0DF75231A2FFB3C2BEEC04`.
- 2026: `70D6CB7DFC501A1306A0E934DF48409F70E83FFAE033676B49F297D9CBEAF43A`.

Cada `data/<edición>/source.json` conserva las referencias a resolución, fechas, documento, páginas y SHA-256 del PDF registradas en el original. Son metadatos heredados, no una revisión legal independiente. Los PDF no se distribuyen. `anomalies.json` conserva los casos y decisiones originales; este puerto no agrega correcciones supuestas.

## Unicode

La tabla de búsqueda se deriva de Unicode Character Database 16.0.0. `data/unicode-normalization.json` registra cada fuente, URL, SHA-256 e identificador de objeto Git. Contiene 19.026 transformaciones escalares y la lista de espacios usada por Python.

Huella SHA-256 de la tabla: `8BB1A8BB61DC74470EEFD96FC71B5F85D7FB4ABBC35401D9ED8E5AAD9E7E13CA`.

La tabla se generó desde los datos oficiales de Unicode y se contrastó con todos los escalares asignados en la base Unicode 15.0 del entorno de generación, sin diferencias para esos caracteres. Los caracteres nuevos de Unicode 16 y los casos límite tienen referencias explícitas. El generador incluido permite reproducir toda la tabla con Node.js y los mismos archivos de entrada.

## Licencias separadas

Se conserva la licencia Apache 2.0 original sin traducirla ni modificarla. Las tablas Unicode están sujetas a Unicode License v3 y su aviso de copyright. La licencia del software no se atribuye a los textos oficiales del Estado Peruano. Consulte `LICENSE`, `LICENSE-UNICODE` y `NOTICE`.
