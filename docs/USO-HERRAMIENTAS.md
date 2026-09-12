# Uso de herramientas — qué se usa, cuánto cuesta y cuánto evita

> **Para qué.** Graphify (MCP externo, cuota gratis agotándose), el **grafo propio** (`grafo_*` en
> Supabase, 12/09/2026), el índice `mapa_arquitectura` (skill `code-map`), los subagentes
> (`agente-mecanico`) y la lectura directa de archivos compiten por lo mismo: el contexto de la sesión.
> Alberto (12/09/2026): *«se debería controlar el ahorro que tenemos con cada cosa que tenemos»*.
> Hasta ese día el único registro era una bitácora a mano (`docs/AGENTE-MECANICO-BITACORA.md`), que
> depende de que la sesión se acuerde y no tiene denominador.

## Cómo se mide (automático, sin que la sesión haga nada)

- Hook **`PostToolUse`** con matcher vacío → `scripts/uso-herramientas.mjs` (Node puro, fail-open).
  Por cada llamada a cualquier tool acumula en **un JSON por sesión y mes**
  (`docs/uso-herramientas/AAAA-MM/<sesión>.json`): llamadas, chars de entrada, chars de respuesta,
  errores y **archivos del repo citados** en la respuesta (con su tamaño en disco).
- El hook `Stop` (`persist-memoria.sh`) lo commitea junto a la memoria. Para el guardián de cierre
  NO cuenta como «trabajo real».
- Agregado: `node scripts/ahorro-herramientas.mjs [--mes AAAA-MM] [--md docs/USO-HERRAMIENTAS.md]`
  reescribe el bloque de abajo. La auditoría mensual lo corre al rotar la memoria.

## Qué significa cada columna (y qué NO)

| Columna | Es | No es |
|---|---|---|
| **Tokens pagados** | ≈ chars de las respuestas ÷ 4: lo que cuesta USAR la herramienta | el coste de la sesión entera |
| **Tokens citados** | ≈ tamaño de los archivos del repo que la respuesta menciona ÷ 4: lo que se habría LEÍDO entero sin ella | **el ahorro**. Es una **cota superior**: a veces se lee igualmente el archivo (y se debe, el grafo localiza, no sustituye leer) |
| **Errores** | respuestas con `is_error` o que empiezan por `Error` | respuestas inútiles: eso no se mide |

**Lo que sigue siendo manual:** si la respuesta fue ÚTIL. Para `agente-mecanico`/`delegar-codigo`
sigue la bitácora (`docs/AGENTE-MECANICO-BITACORA.md`); el hook aporta ahora el denominador real de
invocaciones (`agente:agente-mecanico`).

**Límite conocido:** una sesión que no abre PR deja su JSON en su rama (el `Stop` lo commitea y empuja
ahí) y no llega a `main` hasta que algo se mergee. Las sesiones de rutinas sí abren PR de registro, y
esos se auto-mergean.

## Grafo propio frente a Graphify — medición del 12/09/2026

Mismo símbolo, mismas preguntas, el día que se construyó (HEAD `f85f137`):

| Pregunta | Graphify | Grafo propio (`scripts/grafo-codigo.mjs`) |
|---|---|---|
| `callers(esCarteraViva)` | 6 (fichaCliente, origenRetarificacion, fichaPoliza, sincronizarObligacionesDeIdentidad, polizaGeneraObligacion, esVolcadoHistorico) | **los mismos 6** + `cartera-viva.test.ts` (Graphify no cuenta el test como caller) |
| Vecinos de `cartera-viva.ts` | 15 archivos (por símbolo, atraviesa el barril `index.ts`) | vista `grafo_deps_archivo`: importa/reexporta **+ archivo donde vive cada símbolo usado** → mismos archivos |
| Coste de generar | reindexado remoto | 4.124 archivos → 17.215 nodos / 61.925 aristas en **1,8 s**, sin dependencias |

Lo que el grafo propio **NO da** y Graphify sí: `query_graph` semántico (embeddings), `remember`/`recall`
(la memoria vive en `docs/CONTEXTO-SESIONES.md`), y resolución de llamadas por variable intermedia o
imports dinámicos con cadena calculada. Antes de afirmar «nadie llama a X», leer el código — regla que ya
valía con Graphify.

## Agregado

<!-- ahorro:inicio -->
**Uso de herramientas · todo lo medido (generado 2026-09-12)** — 1 sesión(es) medida(s).

| Herramienta | Sesiones | Llamadas | Tokens pagados (≈) | Tokens citados (cota sup.) | Errores |
|---|---:|---:|---:|---:|---:|
| `bash` | 1 | 26 | 42.058 | 0 | 0 |
| `escritura` | 1 | 4 | 34.635 | 0 | 0 |
| `mcp:github` | 1 | 4 | 134 | 0 | 0 |
| `otro` | 1 | 2 | 1.584 | 14.545 | 0 |
<!-- ahorro:fin -->
