# Guías citables — borradores (Grupo ASegura)

Estado: BORRADOR, sin publicar. Los revisa Alberto. Ninguno está en `apps/asegura-web/lib/articulos.ts`.

| Fichero | slug | CTA (landing existente) |
|---|---|---|
| `01-revisar-poliza-antes-de-renovar.md` | `revisar-poliza-antes-de-renovar` | `/gestor-de-seguros` |
| `02-franquicia-limite-sublimite-diferencias.md` | `franquicia-limite-sublimite-diferencias` | `/seguros/hogar` |
| `03-comparar-dos-seguros-de-hogar.md` | `como-comparar-dos-seguros-de-hogar` | `/seguros/hogar` |
| `04-regla-proporcional-que-es-y-como-te-afecta.md` | `regla-proporcional-seguro-que-es` | `/seguros/hogar` |

**Tema 4 sustituido:** la baja ya está cubierta por `dar-de-baja-seguro-coche`, `como-dar-de-baja-un-seguro-a-tiempo`
y `preaviso-un-mes-no-renovar-seguro` (más `/carta-baja-seguro`). Se escribió «regla proporcional» en su lugar.
Solapes a vigilar: `que-cubre-de-verdad-el-seguro-de-hogar` ya toca continente/contenido, sublímite e infraseguro;
las guías 2-4 deben enlazarlo y no repetirlo (riesgo de canibalización, ver GSC antes de publicar).

## Artículos de la LCS usados (leídos en `docs/normativa/LCS-...2025-07-25.txt`)
3, 8, 11, 22 (apdos. 1-3), 26, 27, 28, 29, 30, 31, 32. Confirmado: la LCS no contiene «franquicia» ni «sublímite».
Los ya presentes en `NORMAS_CITABLES`: 3, 22. **Faltan por añadir** (con `verificado` = fecha de hoy): 8, 11, 26, 27, 28, 29, 30, 31, 32.

## [VERIFICAR] (revisados el 17/10/2026)
Resueltos contra la copia consolidada del BOE de la LCS (25/07/2025, `docs/normativa/`; boe.es sigue bloqueado desde la sesión): art. 30 (regla proporcional y exclusión por pacto), art. 22.2 (un mes tomador / dos meses asegurador), 22.3, 3, 8, 11, 26-29, 31, 32. Sin cifras ni plazos inventados.
Resueltos por reformulación (la frase ya no afirma nada no contrastado): orden franquicia/sublímite/proporción, sentencia del TS (retirada), pólizas sin regla proporcional, valor a nuevo vs. art. 26, información precontractual (no se afirma), método de valoración (no se da), ministerio y enlace de la DGSFP (no se citan; la web ya enlaza la DGSFP en contacto).
Quedan 0 marcas [VERIFICAR]. **Montadas (17/10/2026)** en `apps/asegura-web/lib/articulos.ts` (slugs `revisar-poliza-antes-de-renovar`, `franquicia-limite-sublimite-diferencias`, `como-comparar-dos-seguros-de-hogar`, `regla-proporcional-seguro-que-es`) con las normas `lcs-8`, `lcs-11`, `lcs-26`..`lcs-32` añadidas a `NORMAS_CITABLES`. Se publican al mergear el PR, tras la revisión de Alberto.

## Cómo se publicarían
1. Alberto aprueba y resuelve los [VERIFICAR] (o se eliminan esas frases).
2. Añadir las normas nuevas a `packages/module-seguros/src/normas.ts` (`NORMAS_CITABLES`) leyendo el artículo en `docs/normativa/`.
3. Añadir cada guía a `ARTICULOS` en `apps/asegura-web/lib/articulos.ts`: `slug`, `h1`, `title` (≤60), `description` (≤155), `fecha`, `resumen` (respuesta corta), `consulta` (palabra clave), `secciones` (cada `##` = una sección con sus párrafos; las tablas y citas de ejemplo van como párrafos), `faq`, `base` (ids de `NORMAS_CITABLES`), `ramos: ['hogar']` y `cta` (`href` interno).
4. En `apps/asegura-web`: `node --test lib/*.test.ts` y `pnpm exec tsc --noEmit`; el bloque «Fuentes» se pinta solo desde `base`.
5. Un solo commit/PR por el flujo habitual; sin `[preview]`.
