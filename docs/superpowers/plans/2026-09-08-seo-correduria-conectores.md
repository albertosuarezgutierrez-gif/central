# SEO correduría: conectores + cron semanal — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el agente SEO de Grupo ASegura reciba cada lunes, sin que nadie pegue nada, posiciones reales (Search Console), quién ocupa el top-10 de cada consulta objetivo (Serper) y visitas medidas (PostHog), con una acción propuesta.

**Architecture:** un cron de plataforma (`/api/cron/seo-correduria`) llama a tres clientes HTTP con `fetch` inyectable, guarda una fila por fuente en `seo_correduria_semana` con tri-estado (`ok | error | no_configurado`), y manda por `tgAviso` un informe redactado por funciones puras. Spec: `docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md`.

**Tech Stack:** Next.js route handler (plataforma), Prisma + SQL idempotente, `jose` (`SignJWT` RS256) + `node:crypto` (`createPrivateKey`), `node --test`.

**Reparto:** las tareas 1-5 (módulos en `lib/seo-correduria/`) son de agentes, por ficheros disjuntos. Las tareas 6-9 (ficheros compartidos, ruta, docs) las hace la sesión principal. Ningún agente commitea.

---

## Contratos (los usan todas las tareas; no se cambian sin cambiar el plan)

```ts
// lib/seo-correduria/tipos.ts  (Task 1)
export type Fuente = 'gsc' | 'serp' | 'posthog'
export type Estado = 'ok' | 'error' | 'no_configurado'

export type ResultadoFuente<T> =
  | { estado: 'ok'; datos: T }
  | { estado: 'error'; detalle: string }
  | { estado: 'no_configurado'; detalle: string }   // detalle = qué secreto falta

export type FilaGsc = { clave: string; clics: number; impresiones: number; ctr: number; posicion: number }
export type VentanaGsc = { desde: string; hasta: string }            // 'YYYY-MM-DD', ambos inclusive
export type TotalGsc = { clics: number; impresiones: number; ctr: number; posicion: number | null } // posicion null si 0 impresiones
export type DatosGsc = {
  actual: { ventana: VentanaGsc; total: TotalGsc; consultas: FilaGsc[]; paginas: FilaGsc[] }
  anterior: { ventana: VentanaGsc; total: TotalGsc } | null   // null = no se pudo leer; NO es «cero»
}

export type ResultadoSerp = { posicion: number; dominio: string; url: string; titulo: string }
export type ConsultaSerp = { consulta: string; pagina: string | null; top: ResultadoSerp[]; propia: number | null }
export type DatosSerp = { dominio: string; consultas: ConsultaSerp[] }

export type DatosPosthog = {
  dias: number
  visitantes: number
  paginasVistas: number
  topPaginas: { ruta: string; vistas: number }[]
  origenes: { dominio: string; sesiones: number }[]
}

export type Resultados = {
  gsc: ResultadoFuente<DatosGsc>
  serp: ResultadoFuente<DatosSerp>
  posthog: ResultadoFuente<DatosPosthog>
}

export type Accion = { tipo: 'arreglar_fuente' | 'mejorar_pagina' | 'escribir_pagina' | 'enlazado_interno'; texto: string }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
```

Constantes (en `tipos.ts`): `DOMINIO_PROPIO = 'grupoasegura.es'`, `PROPIEDAD_GSC = 'sc-domain:grupoasegura.es'`, `POSTHOG_PROJECT_ID_DEFECTO = '266897'`, `POSTHOG_API_HOST_DEFECTO = 'https://eu.posthog.com'`.

---

### Task 1: `tipos.ts` + `consultas.ts` (+ cepo contra `keywords.md`)

**Files:** Create `apps/plataforma/lib/seo-correduria/tipos.ts`, `apps/plataforma/lib/seo-correduria/consultas.ts`, `apps/plataforma/lib/seo-correduria/consultas.test.ts`.

- [ ] `tipos.ts` con los contratos de arriba, tal cual.
- [ ] `consultas.ts`: `export const CONSULTAS: { consulta: string; pagina: string | null; grupo: 'ramo' | 'problema' }[]` con las **14** filas de `.claude/skills/seo-asegura/references/keywords.md` (§1: 8 de ramo; §2: 6 de intención de problema). `pagina` = la ruta de la tabla (`/`, `/seguros/hogar`…) o `null` cuando la tabla dice «—» o «sin página»; «parcialmente /seguros/hogar» y «parcial» → la ruta que cita. Texto de la consulta **idéntico** al de la tabla (es lo que compara el cepo).
- [ ] `consultas.test.ts` (node --test): lee `keywords.md` desde `../../../../.claude/skills/seo-asegura/references/keywords.md` (resuelve con `import.meta.url`), extrae la primera celda de cada fila de tabla de §1 y §2 (líneas que empiezan por `| ` y cuya primera celda no es `Consulta` ni `---`), y **asserta igualdad de conjuntos** con `CONSULTAS.map(c => c.consulta)`. Mensaje de fallo: «el cron vigila unas consultas y la skill otras». Segundo test: `pagina` es `null` o empieza por `/`.
- [ ] Verlo en ROJO: quitar una fila de `CONSULTAS` → falla; restaurar → pasa. Pegar la salida en el informe.

### Task 2: `google-sa.ts` (token de cuenta de servicio)

**Files:** Create `apps/plataforma/lib/seo-correduria/google-sa.ts`, `google-sa.test.ts`.

- [ ] `export function cargarClavePrivada(raw: string): KeyObject` — copia adaptada de `apps/plataforma/lib/enablebanking.ts:32-62` (tolera comillas, `\n` escapados, PEM en una línea, base64 suelto). No importar de enablebanking (no está exportada y acopla dos dominios).
- [ ] `export async function tokenCuentaServicio(cfg: { clientEmail: string; privateKey: string; scope: string }, fetch: FetchLike, ahora = Date.now()): Promise<string>`: JWT con `new SignJWT({ scope: cfg.scope }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(cfg.clientEmail).setAudience('https://oauth2.googleapis.com/token').setIssuedAt(Math.floor(ahora/1000)).setExpirationTime(Math.floor(ahora/1000) + 3600).sign(key)`; POST `https://oauth2.googleapis.com/token` con `application/x-www-form-urlencoded`: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>`; devuelve `access_token`. Si `!res.ok` → `throw new Error(\`google token ${res.status}: ${cuerpo.slice(0,200)}\`)`.
- [ ] Tests: (a) genera un par RSA de test con `generateKeyPairSync('rsa', { modulusLength: 2048 })` exportado a PEM pkcs8; con un `fetch` falso que captura el body, comprueba que la `assertion` es un JWT cuyo payload (decodificado base64url) tiene `iss`, `aud`, `scope`, `exp - iat === 3600`, y que el resultado es el `access_token` del fake. (b) `cargarClavePrivada` acepta el PEM con `\n` escapados (`pem.replace(/\n/g,'\\n')`) y con comillas envolventes. (c) `!res.ok` lanza con el status.

### Task 3: `gsc.ts` (Search Console)

**Files:** Create `apps/plataforma/lib/seo-correduria/gsc.ts`, `gsc.test.ts`.

- [ ] `export function ventanas(hoy: Date): { actual: VentanaGsc; anterior: VentanaGsc }` — pura: `hasta` = hoy − 3 días; `desde` = hasta − 6 días (7 días inclusive); `anterior` = los 7 días justo antes. Formato `YYYY-MM-DD` en UTC.
- [ ] `export async function consultarGsc(token: string, propiedad: string, ventana: VentanaGsc, dimension: 'query' | 'page', fetch: FetchLike): Promise<FilaGsc[]>` — POST `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propiedad)}/searchAnalytics/query` con `Authorization: Bearer`, body `{ startDate, endDate, dimensions: [dimension], rowLimit: 250 }`; mapea `rows[].keys[0]` → `clave`, `clicks`→`clics`, `impressions`→`impresiones`, `ctr`, `position`→`posicion`. Sin `rows` → `[]`. `!res.ok` → throw con status y cuerpo recortado.
- [ ] `export function totalizar(filas: FilaGsc[]): TotalGsc` — pura: suma clics e impresiones; `ctr = clics/impresiones` (0 si 0 impresiones); `posicion` = media ponderada por impresiones, **`null` si 0 impresiones**.
- [ ] `export async function leerGsc(cfg: { token: string; propiedad: string; hoy?: Date }, fetch: FetchLike): Promise<DatosGsc>` — consultas + páginas de la ventana actual, y solo el total de la anterior; si la lectura de la anterior falla, `anterior: null` (no se tira todo por el delta).
- [ ] Tests: `ventanas(new Date('2026-09-08T08:30:00Z'))` → actual `2026-08-30..2026-09-05`, anterior `2026-08-23..2026-08-29`; `totalizar([])` → posicion `null` (no 0) — **verlo en rojo** cambiando a 0; `totalizar` pondera bien con dos filas; `consultarGsc` mapea un JSON de ejemplo y devuelve `[]` sin `rows`.

### Task 4: `serp.ts` (Serper) y `posthog.ts` (HogQL)

**Files:** Create `apps/plataforma/lib/seo-correduria/serp.ts`, `serp.test.ts`, `posthog.ts`, `posthog.test.ts`.

- [ ] `serp.ts`: `export function dominioDe(url: string): string` (hostname sin `www.`); `export function posicionPropia(top: ResultadoSerp[], dominio: string): number | null` — la posición del primer resultado cuyo dominio es el propio o acaba en `.${dominio}`; **`null` si no está**. `export async function consultarSerp(apiKey: string, consulta: string, fetch: FetchLike): Promise<ResultadoSerp[]>` — POST `https://google.serper.dev/search`, header `X-API-KEY`, body `{ q: consulta, gl: 'es', hl: 'es', num: 10 }`, `AbortSignal.timeout(10_000)`; mapea `organic[]` (`position`, `link`, `title`) → `{ posicion, dominio: dominioDe(link), url: link, titulo }`, máximo 10. `!res.ok` → throw con status y cuerpo recortado (Serper devuelve el motivo «créditos» en el cuerpo). `export async function leerSerp(cfg: { apiKey: string; dominio: string; consultas: { consulta: string; pagina: string | null }[] }, fetch: FetchLike): Promise<DatosSerp>` — **secuencial** (no `Promise.all`: 14 llamadas en ráfaga contra una cuenta con pocos créditos), y si UNA consulta falla se propaga (mejor `error` entero que un top-10 a medias que parezca completo).
- [ ] `posthog.ts`: `export async function hogql(cfg: { apiKey: string; projectId: string; host: string }, query: string, fetch: FetchLike): Promise<unknown[][]>` — POST `${host}/api/projects/${projectId}/query` con `Authorization: Bearer`, body `{ query: { kind: 'HogQLQuery', query } }`, devuelve `results`. `export async function leerPosthog(cfg, fetch, dias = 7): Promise<DatosPosthog>` con tres consultas: (1) `SELECT count(), count(DISTINCT person_id) FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${dias} DAY` → `paginasVistas`, `visitantes`; (2) `SELECT properties.$pathname, count() FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${dias} DAY GROUP BY 1 ORDER BY 2 DESC LIMIT 5` → `topPaginas`; (3) `SELECT properties.$referring_domain, count(DISTINCT $session_id) FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${dias} DAY AND properties.$referring_domain IS NOT NULL AND properties.$referring_domain != '$direct' GROUP BY 1 ORDER BY 2 DESC LIMIT 5` → `origenes`. Filas con ruta/dominio `null` se descartan.
- [ ] Tests: `posicionPropia` devuelve `null` con el dominio ausente (**verlo en rojo** devolviendo 0), acierta con `www.grupoasegura.es`, no confunde `grupoasegura.es.otro.com`; `consultarSerp` mapea `organic` y recorta a 10; `leerSerp` llama en orden y propaga el fallo; `hogql` manda el body correcto; `leerPosthog` mapea las tres respuestas.

### Task 5: `informe.ts` (redacción + acción propuesta, puras)

**Files:** Create `apps/plataforma/lib/seo-correduria/informe.ts`, `informe.test.ts`.

- [ ] `export function accionPropuesta(r: Resultados, consultas: typeof CONSULTAS): Accion` con las cuatro reglas de la spec §5.4 en ese orden: (1) alguna fuente ≠ `ok` → `arreglar_fuente` nombrando la fuente y el `detalle`; (2) en `gsc.actual.consultas`, la de más impresiones con `posicion` entre 8 y 30 cuya consulta coincida (normalizada: minúsculas, sin tildes, trim) con una de `consultas` con `pagina` no nula → `mejorar_pagina`; (3) una de `consultas` con `pagina === null` → `escribir_pagina` (la primera del grupo `problema`); (4) `enlazado_interno` hacia `/seguros/hogar`.
- [ ] `export function redactarInforme(semana: string, r: Resultados, accion: Accion, dominio: string): string` — HTML de Telegram (`<b>`, `escapeHtml` de `@central/core-telegram` para todo texto externo: títulos de SERP, consultas de GSC). Bloques: cabecera `🔎 <b>SEO grupoasegura.es</b> · semana ${semana}`; GSC (ok: clics/impresiones/posición con delta contra `anterior` — «(sin semana anterior)» si es `null` —, top 5 consultas por impresiones con posición a 1 decimal; error/no_configurado: una línea con el detalle, **nunca un 0**); SERP (por consulta: `posición N` o `fuera del top-10`, y los 3 primeros dominios); visitas medidas (etiqueta literal «visitas medidas, sobre quien consintió»); `➡️ <b>Acción</b>: ${accion.texto}`. Números en formato español (`toLocaleString('es-ES')`). Longitud < 3.500 caracteres (Telegram corta en 4.096): si el bloque SERP se pasa, recortar a las 8 primeras consultas y decir «(+N consultas en BD)».
- [ ] Tests: con las tres fuentes `ok` sale `mejorar_pagina` cuando hay una consulta en posición 12 con página; con `gsc` en `error` sale `arreglar_fuente` **aunque haya datos de SERP** (**verlo en rojo** quitando la regla 1); con `anterior: null` el informe contiene «sin semana anterior» y no contiene «+100»; con `serp` en `error` el informe no contiene «fuera del top-10» ni «0»; `escapeHtml` aplicado (un título con `<script>` sale escapado); longitud < 3.500 con 14 consultas.

### Task 6: BD — modelo Prisma + SQL idempotente (sesión principal)

**Files:** Modify `apps/plataforma/prisma/schema.prisma` (añadir al final); Create `apps/plataforma/prisma/sql/2026-09-08_seo_correduria_semana.sql`.

```prisma
model SeoCorreduriaSemana {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  semana    DateTime @db.Date
  fuente    String
  estado    String
  detalle   String?
  datos     Json?
  creadoEn  DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  @@unique([semana, fuente])
  @@index([fuente, semana(sort: Desc)])
  @@map("seo_correduria_semana")
}
```

SQL: `CREATE TABLE IF NOT EXISTS public.seo_correduria_semana (...)`, `CREATE UNIQUE INDEX IF NOT EXISTS`, `GRANT SELECT, INSERT, UPDATE ON public.seo_correduria_semana TO prisma_plataforma;` y la cabecera «Aplicar como postgres por el Supabase MCP (NO por el rol de la app). Idempotente.» ⚠️ Antes de escribir `CREATE TABLE IF NOT EXISTS`, comprobar que no existe una tabla homónima (landmine de `2026-09-05_agente_veredicto.sql:1-12`).

### Task 7: altas en ficheros compartidos (sesión principal)

- [ ] `lib/cron-dispatch.ts`: `{ path: '/api/cron/seo-correduria', schedule: '30 8 * * 1' }` junto a los semanales, con comentario de una línea.
- [ ] `lib/monitoring/latidos.ts` → `AGENTES_VIGILADOS`: `{ id: 'seo_correduria', vigiladoDesde: '2026-09-08', etiqueta: '🔎 SEO correduría (cron semanal, lunes 08:30 UTC)', maxHoras: 192, nota: '…Huella: agente_latidos.seo_correduria.' }`.
- [ ] `app/api/cron/agentes-latido/route.ts` → `PROBES.seo_correduria` con la misma `Prisma.sql` que `psd2_health_check`, cambiando el id.
- [ ] `lib/telegram/catalogo.ts` → `{ id: 'correduria.seo-semana', categoria: 'correduria', titulo: 'Informe SEO semanal de grupoasegura.es', que: 'Posiciones reales en Google (Search Console), quién ocupa el top-10 de cada consulta objetivo y visitas medidas, con una acción propuesta.', cuando: 'Lunes 08:30 UTC' }`.
- [ ] `lib/secrets-registry.ts` → tres entradas `tipo: 'api-externa'`, `verticales: ['plataforma']`, `dondeVive: 'vercel-proyecto'`, `proyecto: 'plataforma'`, `editable: true`, `vercelProject: 'plataforma'`: `GSC_SA_CLIENT_EMAIL`, `GSC_SA_PRIVATE_KEY`, `POSTHOG_PERSONAL_API_KEY`. Actualizar el `proposito` de `SERPER_API_KEY` (vuelve a tener un consumidor: el cron SEO, 14 consultas/semana).
- [ ] Correr los guardianes: `node --test lib/cron-dispatch.test.ts lib/monitoring/latidos.test.ts` desde `apps/plataforma` y `node --test test/regression-telegram-avisos.test.ts` desde la raíz.

### Task 8: la ruta del cron (sesión principal)

**Files:** Create `apps/plataforma/app/api/cron/seo-correduria/route.ts`.

- [ ] `export const dynamic = 'force-dynamic'`, `export const maxDuration = 60`, `export { handler as GET, handler as POST }`, `isCronAuthorized(req)` → 401.
- [ ] Construir cada fuente con tri-estado: `GSC_SA_CLIENT_EMAIL`/`GSC_SA_PRIVATE_KEY` ausentes → `no_configurado` con el nombre que falta; idem `SERPER_API_KEY` y `POSTHOG_PERSONAL_API_KEY`. Las tres en `Promise.allSettled`; un `rejected` → `{ estado: 'error', detalle: mensaje.slice(0, 300) }`.
- [ ] `semana` = lunes (UTC) de la semana en curso. Upsert de las tres filas en `seoCorreduriaSemana` por `(semana, fuente)`.
- [ ] `accionPropuesta` + `redactarInforme` → `tgAviso('correduria.seo-semana', texto, { html: true })`.
- [ ] `registrarLatido('seo_correduria', todasOk, detalle)` donde `todasOk` = las tres en `ok`; si alguna no, `ok: false` con la lista de fuentes y su estado — así el vigía avisa mientras falte un secreto, que es lo que se quiere.
- [ ] Respuesta `NextResponse.json({ ok: todasOk, semana, estados: { gsc, serp, posthog } })`.

### Task 9: skill, docs y memoria (sesión principal)

- [ ] `.claude/skills/seo-asegura/SKILL.md` §1 «Mide antes de opinar»: las tres filas pasan a leerse de `seo_correduria_semana` (Supabase MCP `execute_sql`: `SELECT fuente, estado, detalle, datos FROM seo_correduria_semana WHERE semana = (SELECT max(semana) FROM seo_correduria_semana)`); desaparece «hay que pegarlos a mano»; se mantiene la advertencia de que PostHog mide solo a quien consiente, y se añade: un `estado ≠ ok` se dice como tal.
- [ ] `references/keywords.md`: nota en cabecera de que `CONSULTAS` de plataforma es el espejo y un cepo los compara; corregir §4 («Somos una correduría local… Sevilla + Andalucía» contradice el ámbito nacional del 07/09).
- [ ] `docs/ASEGURA-SEO-REDES-IDEAS.md`: corregir «Not live» de PostHog (líneas ~381-384) y cerrar en §J el «conector de Search Console del lado del agente» con este PR.
- [ ] `docs/RUTINAS-PROGRAMADAS.md`: fila del cron nuevo, si la tabla de crons de plataforma vive ahí.
- [ ] `docs/CONTEXTO-SESIONES.md`: entrada ≤ 8 líneas.

### Task 10: verificación y PR

- [ ] `cd apps/plataforma && pnpm exec prisma generate && pnpm exec tsc --noEmit -p tsconfig.json` → 0 errores.
- [ ] `node --test lib/seo-correduria/*.test.ts lib/cron-dispatch.test.ts lib/monitoring/latidos.test.ts` → 0 fallos; desde la raíz `node --test test/regression-telegram-avisos.test.ts`.
- [ ] Commit, push, PR draft con las salidas en rojo de los cepos pegadas.
