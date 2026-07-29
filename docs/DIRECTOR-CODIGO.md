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
**Response:** `{ "contenido": "<archivo reescrito>", "modelo": "qwen/qwen-2.5-coder-32b-instruct", "ruta": "lib/x.ts", "escalado": false }`

**🛡️ Guardia antidestructiva + escalado (17/07/2026).** El coder barato NO es fiable ni en tareas triviales
(en la 1ª prueba real, `qwen-2.5-coder-32b` **truncó el archivo y borró una función** que la orden prohibía
tocar). Por eso el ejecutor valida su salida con **`lib/reescritura-guardia.ts::validarReescritura`** (pura,
testeada): rechaza salida vacía, truncamiento (<50 % del original) y **desaparición de exports que existían**.
Si la salida del barato NO pasa la guardia, el ejecutor **reintenta UNA vez con el modelo FUERTE**
(`categoria:'plan'` = Opus) y devuelve `escalado:true`; si tampoco pasa, responde **HTTP 422** (`{error,motivo}`)
y el orquestador **salta ese archivo** (nunca aplica código roto). Coste alto solo en el fallo raro; la vía
normal sigue barata. En `ai_usos` verás DOS filas `ejecutar` cuando hubo escalado (qwen 0€ + Opus).

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
  repo: `PLATAFORMA_URL`, `AI_GATEWAY_SECRET` (+ `ALERTA_TOKEN` opcional para el aviso). El paso "Abrir PR
  draft" **no falla el run** si el ajuste de repo está apagado: pushea la rama e imprime el enlace.
  **Cierre — mecanismo construido el 19/07/2026, pero con un FALSO POSITIVO real detectado en la prueba
  end-to-end del 29/07/2026 (PR #1139):** el PR ya no se queda con la disculpa genérica "sin verificar" — el
  workflow espera el veredicto (`gh pr checks --watch`, tope 15 min, `continue-on-error`) y lo **comenta en
  el PR** (✅ compila / ❌ roto / ⏳ sin confirmar a tiempo) + lo refleja en el aviso Telegram. **PERO**: el
  paso "Abrir PR draft" usa `GH_TOKEN: ${{ github.token }}` (el `GITHUB_TOKEN` automático del run) para
  pushear la rama y abrir el PR — y GitHub **NO dispara workflows `pull_request`/`push` a partir de eventos
  hechos con el `GITHUB_TOKEN` por defecto** (anti-recursión, comportamiento documentado de GitHub Actions).
  Resultado real observado: `tests.yml`/`ci.yml`/`qa.yml`/`gitleaks` **nunca se ejecutaron** en el PR #1139
  (solo corrió el check de Vercel, que en un cambio de una sola app aparece "Skipped"/pass trivial para el
  resto) — y aun así el paso "Anotar veredicto" comentó **"✅ CI en verde"**, porque `gh pr checks` solo vio
  ESE check (pass) y ninguno más. Es decir: el aviso verde puede ser mentira — exactamente el problema que
  este cambio quería resolver, reintroducido por otra vía. **Fix pendiente (necesita algo que Alberto tiene
  que crear, no código):** sustituir `github.token` por un **Personal Access Token** (o un GitHub App
  token) con permisos de repo, guardado como secret nuevo (p.ej. `GH_PAT_TRIGGER`), en el paso que hace
  `git push`/`gh pr create` de `ai-programar.yml` — un push/PR-open con un token "externo" al run SÍ dispara
  `pull_request` normalmente (así lo hacen las sesiones de Claude Code, que abren PRs con su propio token y
  a esos SÍ les corre `tests.yml` automático, verificado en los PR #1137/#1020). Hasta que exista ese PAT,
  **no confíes en el "✅ CI en verde" de un PR abierto por `ai-programar.yml`** — revisa a mano en la pestaña
  Checks del PR si `tests.yml` corrió de verdad antes de mergear.

> **✅ PROBADO end-to-end el 17/07/2026** (PR autogenerado #966): acota (qwen) → **plan Opus 4.1** → ejecuta
> qwen (falló) → **guardia lo rechazó → escaló a Opus** → diff sano → **PR draft abierto solo**. Nada roto se
> aplicó; nada se auto-mergeó. Coste del run ~0,13 € (Opus plan + Opus escalado).
>
> **Requisitos de activación (ya cumplidos, dejados como checklist):**
> 1. **Categoría `plan` en el catálogo** (Opus): la puebla el cron `ia-director-refresh` (semanal/manual). Hasta
>    entonces `elegirPorCategoria('plan')` degrada al modelo por defecto. **Hecho** (catálogo v3, `anthropic/claude-opus-4.1`).
> 2. **🚨 GRANT de BD:** el rol de la app (vía pooler Supabase) necesita **`USAGE` sobre el schema `extensions`**
>    para que `word_similarity` (pg_trgm) del acotado funcione. Sin él, `/api/ai/codigo` devuelve 0 filas con
>    `permission denied for schema extensions (42501)` **solo en runtime**. Aplicado:
>    `GRANT USAGE ON SCHEMA extensions TO public;`. (No basta con `authenticator`: la app conecta con otro rol.)
> 3. **Secrets de repo GitHub:** `PLATAFORMA_URL` + **`AI_GATEWAY_SECRET`** (Settings → Secrets → Actions). **Hecho.**
> 4. **Ajuste de repo:** *"Allow GitHub Actions to create and approve pull requests"* (Settings → Actions →
>    General → Workflow permissions) para que abra el PR solo. **Hecho.** Sin él, la rama se pushea igual.
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
