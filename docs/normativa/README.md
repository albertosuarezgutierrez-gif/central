# Normativa en el repo — la fuente para citar leyes sin red

Desde las sesiones de Claude `boe.es` está **bloqueado por el proxy**, y citar un artículo de memoria
está prohibido (`packages/module-seguros/src/normas.ts`). Por eso el texto consolidado se guarda aquí.

| Fichero | Norma | Versión | Cómo llegó |
|---|---|---|---|
| `LCS-ley-50-1980-consolidado-2025-07-25.txt` | Ley 50/1980, de Contrato de Seguro | consolidado BOE, última modificación 25/07/2025 | PDF del BOE subido por Alberto el 23/09/2026, texto extraído con `pdf-parse` |

**Cómo se usa:** busca el artículo aquí (`grep -n "Artículo setenta y tres" …`; el BOE numera en
letra), léelo entero, y añádelo a `NORMAS_CITABLES` con `verificado` = fecha de hoy.

**Cómo se añade otra norma:** Alberto descarga el PDF «texto consolidado» desde boe.es y lo sube a la
sesión; se extrae el texto y se guarda aquí con la fecha de su «Última modificación» en el nombre.
Nunca se acepta el texto de una norma dictado por otro asistente: el 23/09/2026 uno inventó el art. 73.

⚠️ Una norma se modifica. Si la versión de aquí tiene más de un año, pide el PDF nuevo antes de citar.
