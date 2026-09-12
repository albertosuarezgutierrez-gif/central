---
name: code-map
description: Úsala al EMPEZAR cualquier tarea de CÓDIGO cuando haya que localizar QUÉ archivo/función maneja algo, ANTES de Grep/Read a ciegas — consulta la tabla Supabase `mapa_arquitectura` (índice de firmas del repo) para acotar candidatos a coste ~0 y leer SOLO esos. No reemplaza a Grep/Read: los enfoca. Sin tabla o sin candidatos, método clásico.
---

# code-map — acota archivos antes de leer (ahorro de tokens)

**Para qué.** Evitar leer archivos enteros a ciegas. `mapa_arquitectura` es un índice de firmas de
función (ruta, funciones+params+retorno, resumen de cabecera, tablas SQL que toca) de TODO el repo
(~2000 archivos). Consultarlo cuesta ~0 tokens y te dice el/los archivo(s) exactos a abrir.

## Cuándo
Al recibir una orden de código ("arregla el bug del login", "añade validación de IBAN", "¿qué archivo
escribe en `movimientos_bancarios`?") y NO sepas ya el archivo. Salta este paso si ya lo sabes.

## Cómo (Supabase MCP, proyecto `wswbehlcuxqxyinousql`)

1. **Extrae 1-4 palabras clave** discriminantes de la orden (nombres, dominios, tablas). Ignora
   "arregla/bug/error/añade/el/la…".

2. **Acota por nombre/resumen/función** (trigram `word_similarity`):
   ```sql
   SELECT ruta, resumen, funciones,
          round(GREATEST(word_similarity('<keywords>', busqueda), 0)::numeric, 3) AS score
   FROM mapa_arquitectura
   WHERE busqueda ILIKE ANY (ARRAY['%<kw1>%','%<kw2>%']::text[])
   ORDER BY score DESC, length(ruta) ASC
   LIMIT 6;
   ```
   Usa `mcp__Supabase__execute_sql` con `project_id='wswbehlcuxqxyinousql'`.

3. **¿Es una tarea sobre una TABLA concreta?** ("qué toca `movimientos_bancarios`") → usa el índice GIN:
   ```sql
   SELECT ruta, jsonb_array_length(funciones) AS n_funcs
   FROM mapa_arquitectura
   WHERE 'movimientos_bancarios' = ANY(tablas)
   ORDER BY n_funcs DESC LIMIT 8;
   ```

4. **Lee SOLO** el/los archivo(s) del top del resultado (el de mayor `score`; los siguientes si el
   primero no basta). Ahí ya tienes las firmas en `funciones` para orientarte antes de abrir.

## Reglas
- **Nunca bloquea.** Si el MCP de Supabase no está, la tabla está vacía, o no hay candidatos con score
  útil → cae al método clásico (Grep/Glob/Read). El mapa acelera, no es obligatorio.
- **Frescura:** el mapa se regenera en cada push a `main` (workflow `auditoria.yml`). Un archivo recién
  creado en esta rama puede no estar aún → si no aparece lo que esperas, usa Grep.
- **No confíes ciegamente en las firmas** del índice (regex, aproximadas): son para SEÑALAR el archivo;
  la verdad es el archivo real, que sí lees entero.
- El coste real que ahorras se registra: el endpoint equivalente escribe en `ai_usos` (`endpoint='codigo'`).

## Grafo propio — callers, impacto, vecinos, tests (12/09/2026)

Lo que Graphify servía como tools vive ahora en dos tablas de la MISMA Supabase (`grafo_nodos`,
`grafo_aristas`; lo genera `scripts/grafo-codigo.mjs` en cada push a `main`) y se consulta por
`mcp__Supabase__execute_sql` (`project_id='wswbehlcuxqxyinousql'`). Una llamada, filas planas:

| Pregunta | SQL |
|---|---|
| ¿Quién llama/usa a `X`? (prof 2 = quién llama a quien lo llama) | `SELECT * FROM grafo_callers('X', 2)` |
| ¿A qué llama `X` (o un archivo entero)? | `SELECT * FROM grafo_callees('apps/asegura/lib/cartera-ficha.ts')` |
| Radio de impacto de un archivo (quién depende de él, 2 saltos, sin tests) | `SELECT * FROM grafo_impacto('packages/module-seguros/src/cartera-viva.ts')` |
| Vecinos directos (de quién depende / quién depende de él, con símbolos) | `SELECT * FROM grafo_vecinos('<ruta>')` |
| ¿Qué tests cubren un archivo? | `SELECT * FROM grafo_tests_de('<ruta>')` |
| Buscar símbolo por subcadena | `SELECT * FROM grafo_find('cartera', 20)` |
| Camino de dependencias entre dos archivos | `SELECT * FROM grafo_camino('apps/x/route.ts', 'packages/y/lib.ts')` |
| Quién referencia un símbolo (llamadas + imports) | `SELECT * FROM grafo_referencias('esCarteraViva')` |
| Imports/exports de un archivo | `SELECT * FROM grafo_imports_exports('<ruta>')` |
| Ficha de un nodo (tipo, línea, exportado) | `SELECT * FROM grafo_nodo('esCarteraViva')` |
| Pregunta en lenguaje natural → símbolos parecidos (semántico, embeddings) | `SELECT id, ruta, similitud FROM grafo_buscar('¿dónde se decide la cartera viva?', 15)` |
| Pregunta en lenguaje natural → archivos relevantes para una tarea | `SELECT * FROM grafo_rank_files('¿dónde se decide la cartera viva?', 10)` |
| Frescura | `SELECT sha, max(updated_at) FROM grafo_nodos GROUP BY 1` — compáralo con `git rev-parse origin/main` |

- `X` puede ser el nombre (`esCarteraViva`) o el id completo (`ruta#nombre`). Los ids de símbolo son
  siempre `ruta#nombre`; los de archivo, la ruta.
- **Consciente de barriles:** `grafo_impacto`/`grafo_vecinos` cuentan como dependiente a quien importó el
  símbolo desde `@central/<pkg>` (el `index.ts`), no solo a quien importó el archivo literal.
- **Lo que NO ve** (regex, sin compilador): llamadas por variable intermedia, imports dinámicos con cadena
  calculada, alias encadenados raros. Un «0 callers» aquí es «no encontré ninguno», no «nadie lo llama»:
  antes de borrar algo, `Grep`.
- **`grafo_buscar`/`grafo_nodo` dan línea y tipo, no el cuerpo** — a propósito, para no saltarse el paso
  de leer el código real. Precisión (12 categorías de Graphify, incluida la búsqueda semántica) medida
  contra un símbolo real y ambiguo el 12/09/2026: `docs/USO-HERRAMIENTAS.md` — el grafo propio igualó o
  superó a Graphify en 10 de 12 categorías (2 con forma distinta, ninguna perdida).
- **Graphify ya NO se usa para código** (ni estructural ni semántico) — solo sigue conectado para
  `memories_about`/`recall`/`remember` (memoria durable), mientras dure la cuota. Para
  callers/impacto/vecinos/tests/camino/referencias/búsqueda semántica, usa siempre esto.

## Relación con el resto
- Mismo índice que consume el **Director de código** (`apps/plataforma/lib/ia-director-codigo.ts`,
  endpoint `/api/ai/codigo`) para orquestadores externos. Ver `docs/DIRECTOR-CODIGO.md`.
- El índice legible del repo también está en `docs/ARQUITECTURA.generated.md` (mapa grueso: apps,
  módulos, capacidades, rutas, tablas) por si quieres el panorama sin consultar la BD.
