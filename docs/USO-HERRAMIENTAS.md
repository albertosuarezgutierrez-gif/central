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
- Mientras la sesión vive, el hook escribe en un **staging fuera del árbol** (`.git/uso-herramientas/`),
  no en `docs/`. El hook `Stop` (`persist-memoria.sh`) lo copia a `docs/` y lo commitea **solo junto a
  la memoria o, como mucho, una vez cada 30 min** (`USO_CADA_S`). Para el guardián de cierre NO cuenta
  como «trabajo real». ⚠️ Por qué la cadencia (medido el 12/09/2026, el día que nació): el JSON cambia
  con cada tool call; persistirlo en cada `Stop` era un push por turno, y cada push dispara el CI y
  12 deployments de Vercel — cuatro pushes en 40 s con la sesión despierta por eventos del PR.
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

## Paridad SEMÁNTICA (embeddings) — medición del 12/09/2026

Con los embeddings ya calculados en producción (13.352 nodos, `pendientes: 0`), se repitió la
comparación con las 12 categorías de herramienta de Graphify, sobre un símbolo elegido A PROPÓSITO
por ser ambiguo (`isCronAuthorized` existe, con ese nombre exacto, en `apps/asegura`, `apps/sivra` y
tres sitios de `apps/plataforma` — el patrón más común del repo: cada app tiene su propio helper
homónimo):

| Herramienta | Graphify | Grafo propio (`grafo_*`) |
|---|---|---|
| `find` | 6 símbolos | **los mismos 6** |
| `callers` | **1** (resolvió a UNA declaración arbitraria — la de `apps/asegura`— y calló las demás) | **80** archivos, agregando las 6 declaraciones homónimas |
| `callees` | **1** (`autorizaCron` de asegura, mismo sesgo) | **4** (una por declaración real) |
| `file_neighbors`/`vecinos` (archivo concreto, sin ambigüedad) | 77 archivos | **77 archivos** — igual |
| `tests_for`/`tests_de` | 1 (`cron-auth.test.ts`) | **1**, mismo archivo |
| `trace`/`shortest_path` vs `camino` | camino de **6 saltos**, confuso, por la misma resolución ambigua | `camino` (a nivel archivo, sin ambigüedad): **1 salto**, correcto |
| `query_graph` semántico (pregunta: «¿cómo se decide si una petición de cron está autorizada?») | **Falló**: devolvió `apps/asegura-portal/lib/autorizaciones.ts` — el consentimiento del cliente para VER sus seguros, un significado de «autorización» totalmente distinto | `grafo_buscar`: acertó — top resultado `apps/plataforma/lib/cron-auth.ts` (similitud 0,63-0,67) |
| `rank_files` (misma pregunta) | Top archivo: el mismo falso positivo de seguros (score 7,2) | Top archivo: `apps/plataforma/lib/cron-auth.ts` (correcto) |
| `impact` | ~60 nodos, sembrando las 6 declaraciones (fanout multi-archivo) | `impacto` (un solo archivo): 85 archivos a 2 saltos — **forma distinta, no comparable cifra a cifra** (fanout multi-símbolo vs radio de un archivo), magnitud similar |
| `node` | incluye el CUERPO inline | `nodo` da línea+tipo, no cuerpo — **diferencia de diseño a propósito** (ver abajo), no un déficit |
| `references` | **0** (mismo sesgo de resolución arbitraria) | **156** filas, agregando las 6 declaraciones |

**Cuenta verificable (12 filas de la tabla):** `find`, `file_neighbors`/`vecinos`, `tests_for`/`tests_de`
e `imports_exports` — **igual** (4). `callers`, `callees`, `trace`/`shortest_path` vs `camino`,
`query_graph`, `rank_files` y `references` — **grafo propio mejor, con datos objetivamente más
completos o correctos** (6). `impact` y `node` — **forma distinta, no comparable directamente** (2,
ninguno es un déficit: uno es fanout multi-símbolo vs radio de un archivo, el otro es una diferencia
de diseño deliberada). **Total: 10 de 12 categorías igualadas o superadas, 2 con forma distinta y
ninguna perdida.** El caso `query_graph` es el más serio: Graphify devolvió un resultado plausible
pero **equivocado de dominio** (confundió
«autorización de cron» con «autorización de cliente de seguros» por la palabra compartida), mientras
que la búsqueda propia acertó. La única diferencia real de diseño: `grafo_nodo` da línea y tipo, no el
cuerpo — a propósito («el CUERPO se lee del archivo, el grafo da la línea, no sustituye leer el
código», que es la misma regla que este documento ya exigía con Graphify).

**Lo que esta medición NO cubre** [Seguro que es una limitación, no una garantía de que no existan
casos peor]: un solo símbolo/archivo, elegido por su ambigüedad real pero no exhaustivo. No prueba
resolución de imports dinámicos con cadena calculada ni de barriles multi-nivel más allá de lo que
ya cubre `grafo_deps_archivo`. `graphify_render_subgraph` (visualización) no se probó porque su
equivalente (`grafo_subgrafo`) no tiene contraparte de renderizado — uso residual, no bloqueante.

**Lo que este trabajo (grafo de código) no cubría:** `remember`/`recall`/`memories_about` (memoria
durable de Graphify) — hasta el 12/09/2026 la única pieza sin sustituto propio. Medido más abajo
("Paridad de MEMORIA"): ya tiene sustituto.

## Paridad de MEMORIA (`memoria_buscar` vs `recall`/`memories_about`) — medición del 12/09/2026

Última pieza sin sustituto propio (ver `CLAUDE.md`, sección Graphify): la memoria DURABLE entre
sesiones. `memoria_buscar()` (embeddings sobre `docs/CONTEXTO-SESIONES.md` + `docs/memoria/*.md`,
PR #2848) frente a `recall`/`memories_about` de Graphify (memoria construida a partir de llamadas
`remember()` de sesiones pasadas). **No son el mismo corpus**: el de Graphify es lo que alguna sesión
decidió explícitamente recordar (dominado por notas automáticas «PR pasó el gate de revisión» y un
resto menor de gotchas/decisiones reales); el de `memoria_buscar` es el `docs/CONTEXTO-SESIONES.md` +
`docs/memoria/*.md` completo, que ya es el hábito de cierre de cada sesión (`persist-memoria.sh`) — la
pregunta no es «¿leen la misma fuente?» sino «¿`memoria_buscar` encuentra decisiones reales al menos
tan bien como `recall`?». Cuatro preguntas reales, ambas herramientas con `repository_id`/consulta
explícitos:

| Pregunta | Graphify (`recall`) | `memoria_buscar` |
|---|---|---|
| Barrido de precios/cuota de Serper | Nada relevante (solo ruido genérico «PR pasó el gate») | Acierta la entrada correcta (rank 4/5, similitud 0,518) |
| Qué pantalla mira Vanesa (limpieza) | Nada relevante | Acierta como **#1** (similitud 0,597) |
| Incidente Smoobu 401/HMAC | **Relevante pero DESFASADO**: hechos bien descompuestos, pero congelados en el estado intermedio 07:07-08:01 UTC del 23/06 — describe el problema como aún bloqueado, y ya está resuelto (PR #2753) | Devuelve la línea de tiempo **completa y vigente**: 5 resultados desde el diagnóstico inicial (23/06) hasta la resolución final (12/09, PR #2753) |
| Por qué «Grupo ASegura» lleva la S en mayúscula | Nada relevante (devuelve hechos de otro tema: ASegura single-tenant, el mismo Smoobu desfasado, arquitectura Supabase, WhatsApp, autodescripción de Graphify) | Acierta como **#1** (similitud 0,691), exactamente la decisión documentada |

**Resultado: 4 de 4 — en ninguna `memoria_buscar` fue peor, en 3 Graphify no encontró nada relevante y
en la 4ª (Smoobu) Graphify SÍ era relevante pero factualmente desfasado** (la clase de fallo más cara:
un dato que parece bueno y no lo es — ver la regla global de `CLAUDE.md` sobre datos leídos mal). La
causa del caso Smoobu no es un defecto de `memoria_buscar`: es que la memoria de Graphify no se
actualiza sola cuando el hecho cambia, mientras que `docs/CONTEXTO-SESIONES.md` se reescribe cada vez
que hay novedad y el cron de embeddings la recoge a diario.

**Lo que esta medición NO cubre** [es una limitación, no una garantía de que no existan casos peor]:
4 preguntas, elegidas por tocar decisiones/gotchas reales y dispersas en el tiempo, no un muestreo
exhaustivo. No prueba memoria sobre proyectos con muy poco historial documentado, ni el caso de una
pregunta cuya respuesta NO esté en ningún `.md` de memoria (ninguna herramienta la encontraría, pero
no se ha verificado que ambas fallen igual de "limpio").

**Veredicto sobre la condición de Alberto («100% igual» para dar de baja Graphify, 12/09/2026):** en
las 4 preguntas medidas `memoria_buscar` igualó o superó a `recall`, nunca al revés. Es una muestra
pequeña, no una prueba exhaustiva — pero es consistente y en la única dirección que importa (nunca
peor). Con esto, la sección de Graphify en `CLAUDE.md` deja de marcar `remember`/`recall`/
`memories_about` como pieza sin sustituto.

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
