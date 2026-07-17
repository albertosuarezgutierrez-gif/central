# Director de código — flujo de ahorro de tokens

> Cómo un agente programador resuelve una orden de desarrollo SIN leer el repo entero.
> Implementación: `apps/plataforma/lib/ia-director-codigo.ts` + endpoint `app/api/ai/codigo`.
> Índice que consulta: tabla Supabase `mapa_arquitectura` (poblada por `scripts/auditar-estructura.mjs`
> → `docs/mapa-funciones.generated.json` → `app/api/internal/mapa-arquitectura`, auto en cada push a `main`).

## Protocolo (pégalo en el prompt/lógica del Agente Director)

Cuando recibas una orden de desarrollo (ej. "arregla el bug del login", "añade validación de IBAN"),
NO leas el repositorio entero. Sigue estos pasos:

- **Paso A — ACOTAR (0 tokens de contexto):** llama a `POST /api/ai/codigo` con `{ "tarea": "<la orden>" }`.
  Devuelve los archivos candidatos (ruta + firmas de funciones + tablas que tocan) y el modelo recomendado,
  ya elegido según presupuesto y complejidad.
- **Paso B — DECIDIR:**
  - `sinMapa: true` o `archivos` vacío → cae al método clásico (grep/lectura); el mapa no cubre esta petición.
  - `stale: true` → el mapa está algo viejo; usa los candidatos pero amplía la búsqueda si no cuadran.
  - Con candidatos → usa el PRIMERO (mayor `score`); los siguientes solo si el primero no basta.
- **Paso C — CARGAR SOLO ESE ARCHIVO:** lee el contenido COMPLETO del/los archivo(s) candidato(s). Nada más.
  (El ahorro está aquí: mandas 1 archivo, no el repositorio.)
- **Paso D — EJECUTAR (Model Routing):** envía `{ tarea + archivo completo }` al `modelo` devuelto, por
  OpenRouter. Pide un DIFF unificado o el archivo reescrito completo. NUNCA "solo el fragmento".
- **Paso E — APLICAR:** aplica el diff (`git apply`) o reescribe el archivo entero; verifica (tsc/tests)
  antes de darlo por bueno. Los archivos reales quedan intactos salvo por el cambio pedido.

## Contrato de la API — `POST /api/ai/codigo`

Auth: `Authorization: Bearer <AI_GATEWAY_SECRET>` (mismo env que la pasarela IA).

**Request:** `{ "tarea": "Arregla el bug del login", "topN": 6, "cliente": "opcional-refacturación" }`

**Response:**
```json
{
  "archivos": [
    { "ruta": "apps/rrhh/app/login/page.tsx", "resumen": "...",
      "funciones": [{ "nombre": "...", "params": "...", "retorno": "..." }],
      "tablas": ["..."], "score": 1.0 }
  ],
  "modelo": "anthropic/claude-sonnet-4.5",
  "fallbacks": ["..."],
  "sinMapa": false, "stale": false, "sha": "e7f6c66...", "tokensIndice": 320
}
```

**Snippet de orquestador (Node/TS):**
```ts
async function acotar(tarea: string) {
  const r = await fetch(`${process.env.PLATAFORMA_URL}/api/ai/codigo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tarea }),
  })
  if (!r.ok) return { sinMapa: true, archivos: [] as { ruta: string }[] } // degrada al método clásico
  return r.json() as Promise<{
    archivos: { ruta: string; funciones: unknown; tablas: string[]; score: number }[]
    modelo: string; fallbacks: string[]; sinMapa: boolean; stale: boolean
  }>
}

// Uso:
const { archivos, modelo, sinMapa } = await acotar('arregla el bug del login')
if (sinMapa || !archivos.length) { /* grep/read clásico */ }
else {
  const contenido = await fs.readFile(archivos[0].ruta, 'utf8')  // solo ESE archivo
  // → { tarea + contenido } al `modelo` por OpenRouter → recibe diff → git apply
}
```

## Notas
- El endpoint **acota + elige modelo**; la llamada que EDITA el código (Paso D) la hace el orquestador con
  el `modelo` devuelto. Alternativa: enrutar esa edición por `/api/ai/chat` (que ya pasa por el Director de
  modelos vía `lib/pasarela.ts::chatConDirector`) en vez de OpenRouter directo.
- Envs del orquestador: `PLATAFORMA_URL` + `AI_GATEWAY_SECRET` (los de Vercel).
- Enrutado por complejidad: categoría `codigo` del catálogo (`ia-director-refresh`) — barato (deepseek/
  qwen-coder) para lo mecánico, premium (claude-sonnet/opus) para lo complejo, dentro del presupuesto.
- Nunca bloquea: cualquier fallo del mapa degrada al camino clásico.

## Los 3 roles — "caro planifica / barato ejecuta" (Fase 1, 16/07/2026)

El acotado de arriba es el paso A. El ciclo completo separa TRES roles para que los tokens caros solo
se gasten en pensar:

1. **DECISOR** (¿qué modelo?) — barato (`deepseek/deepseek-chat`), ya existente en el Director de modelos.
2. **PLANIFICADOR** (¿qué tocar y con qué instrucción por archivo?) — **Claude alto**. En una sesión de
   Claude Code es la propia sesión; como servicio autónomo (Fase 2) es la categoría **`plan`** del catálogo
   (`ia-director-refresh`), con techo de precio propio `DIRECTOR_PLAN_PRECIO_OUT` (default 100 USD/M) para
   que Opus/lo más alto no quede capado por el techo global `DIRECTOR_MAX_PRECIO_OUT`.
3. **EJECUTOR** (escribe el código de UN archivo) — coder **barato** de la categoría `codigo`, servido por
   el endpoint **`POST /api/ai/ejecutar`** (sin hop al decisor: `chatConDirector` con `categoria:'codigo'`).

### `POST /api/ai/ejecutar` (el ejecutor barato)
Auth `Authorization: Bearer <AI_GATEWAY_SECRET>`. Respeta presupuesto y registra en `ai_usos`
(`endpoint='ejecutar'`).

**Request:** `{ "ruta": "lib/x.ts", "contenido": "<archivo actual>", "instruccion": "<qué hacer>", "criterio": "<aceptación>", "maxTokens": 8000 }`
**Response:** `{ "contenido": "<archivo reescrito>", "modelo": "qwen/qwen-2.5-coder-32b-instruct", "ruta": "lib/x.ts" }`

El ejecutor NO escribe disco ni git: devuelve el contenido; el orquestador (la sesión Claude) lo aplica,
lo REVISA y lo VERIFICA (tsc/tests). En sesión, el atajo es la skill **`.claude/skills/delegar-codigo`**.
El **CLI `scripts/ai-ejecutar.mjs`** (Node puro, sin deps) envuelve el endpoint: reescribe un archivo en sitio
(`--ruta`/`--instruccion`/`--criterio`, `--dry` para no escribir) y trae un modo **`--smoke`** que sirve de
healthcheck del endpoint tras un deploy. Envs: `PLATAFORMA_URL` + `AI_GATEWAY_SECRET`.

### Fase 2 — orquestador autónomo (16/07/2026)
El ciclo completo, encadenado, con el planificador Claude alto de verdad:
- **`POST /api/ai/programar`** (`lib/programador.ts::planificarTarea`) — el PLANIFICADOR: dada la orden + los
  archivos candidatos (con contenido), el modelo ALTO (categoría **`plan`**) devuelve un plan estructurado
  `[{ruta, instruccion, criterio}]`. No edita. Registra en `ai_usos` (`endpoint='programar'`). Degrada a plan
  vacío si no parsea (el orquestador cae al método clásico).
- **`scripts/ai-programar.mjs`** — el ORQUESTADOR por CLI: **acota** (`/api/ai/codigo`) → **planifica**
  (`/api/ai/programar`, Claude alto) → **ejecuta** cada archivo (`/api/ai/ejecutar`, coder barato) → **aplica**
  en disco. `--dry` para simular. El humano revisa el diff + verifica (tsc/tests) + commitea; nada se
  auto-commitea.
- **`.github/workflows/ai-programar.yml`** — la versión plenamente autónoma, SOLO por disparo **manual**
  (`workflow_dispatch`, nunca en push): corre el orquestador y, si hubo cambios, abre un **PR draft** + avisa
  por Telegram. NUNCA mergea. El código del coder barato **no llega a `main` sin revisión humana**. Secrets de
  repo: `PLATAFORMA_URL`, `AI_GATEWAY_SECRET` (+ `ALERTA_TOKEN` opcional para el aviso).

> **Nota de activación:** para que el PLAN lo haga Claude alto de verdad, la categoría `plan` debe estar en el
> catálogo del Director → requiere una corrida del cron `ia-director-refresh` (semanal o manual). Hasta entonces
> `elegirPorCategoria('plan')` degrada al modelo por defecto (barato): el plan sale, pero no del modelo premium.
**Regla de oro:** delega SOLO lo mecánico/voluminoso; la lógica sutil se queda en el planificador (Claude),
porque el coste de revisar el diff del barato se come el ahorro. Ver `docs/ESTUDIO-DIRECTOR-CODIGO-TOKENS.md`.

## Medir el ahorro (tabla `ai_usos`, `endpoint='codigo'`)

Cada acotado registra una fila en `ai_usos` con `endpoint='codigo'` (modelo elegido, ms, tokens del
índice devuelto, coste, `cliente_ref`). Consultas útiles (Supabase `wswbehlcuxqxyinousql`):

```sql
-- Volumen y coste del Director de código (últimos 30 días)
SELECT count(*) AS tareas,
       count(*) FILTER (WHERE ok) AS ok,
       round(avg(ms))::int AS ms_medio,
       sum(tokens) AS tokens_indice,
       round(sum(coste_eur)::numeric, 4) AS coste_eur
FROM ai_usos
WHERE endpoint = 'codigo' AND creada_at >= now() - interval '30 days';

-- Reparto por modelo (¿cuánto va a barato vs premium?)
SELECT split_part(modelo, ':', 1) AS modelo, count(*) AS tareas,
       round(sum(coste_eur)::numeric, 4) AS coste_eur
FROM ai_usos
WHERE endpoint = 'codigo' AND creada_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY tareas DESC;
```

**El ahorro real** = tokens que NO se leyeron. `ai_usos.tokens` en las filas `codigo` es el tamaño del
ÍNDICE devuelto (unos cientos de tokens); compáralo con lo que costaría leer el repo/varios archivos
enteros por tarea (decenas de miles). Regla de oro: cada tarea acotada evita leer todo menos 1 archivo.
El panel `/operador/ia` ya lista `endpoint` en los usos recientes; filtrando por `codigo` ves el detalle.
