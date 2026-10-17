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

## [VERIFICAR] pendientes
- Todas: enlace oficial a la sede de la DGSFP (boe.es y la web quedan fuera de alcance desde la sesión) y nombre vigente de su ministerio (guía 1).
- Guía 2: orden de aplicación franquicia/sublímite/límite (depende de la póliza); sentencia del TS sobre cláusulas delimitadoras vs. limitativas, si se cita.
- Guía 3: relación entre «valor a nuevo» pactado y el art. 26; existencia de pólizas sin regla proporcional por producto; base normativa de la información precontractual comparable.
- Guía 4: orden franquicia/regla proporcional; fuente oficial para valorar la reconstrucción.
- Texto de copy: pasar `lib/ramos.test.ts` (sin promesas de precio) y revisar que ningún «en Sevilla» entre en los h1.

## Cómo se publicarían
1. Alberto aprueba y resuelve los [VERIFICAR] (o se eliminan esas frases).
2. Añadir las normas nuevas a `packages/module-seguros/src/normas.ts` (`NORMAS_CITABLES`) leyendo el artículo en `docs/normativa/`.
3. Añadir cada guía a `ARTICULOS` en `apps/asegura-web/lib/articulos.ts`: `slug`, `h1`, `title` (≤60), `description` (≤155), `fecha`, `resumen` (respuesta corta), `consulta` (palabra clave), `secciones` (cada `##` = una sección con sus párrafos; las tablas y citas de ejemplo van como párrafos), `faq`, `base` (ids de `NORMAS_CITABLES`), `ramos: ['hogar']` y `cta` (`href` interno).
4. En `apps/asegura-web`: `node --test lib/*.test.ts` y `pnpm exec tsc --noEmit`; el bloque «Fuentes» se pinta solo desde `base`.
5. Un solo commit/PR por el flujo habitual; sin `[preview]`.
