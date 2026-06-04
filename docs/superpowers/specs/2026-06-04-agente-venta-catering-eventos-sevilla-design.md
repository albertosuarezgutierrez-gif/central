# Agente de venta — Catering + Haciendas de eventos (Sevilla)

> Spec de diseño. Fecha: 2026-06-04. Estado: aprobado para plan de implementación.
> Origen: extender el pipeline de captación existente para vender ia.rest a
> empresas de **catering** y **haciendas/espacios de eventos**, empezando por
> **Sevilla**, sin perder el negocio core de **restaurantes**.
>
> **Alcance real (no solo el email):** se replica el flujo completo que ya existe
> para restaurantes — **sourcing → research (análisis IA) → presentación/propuesta
> personalizada → borradores email+WhatsApp → contacto** — haciéndolo consciente
> del vertical en cada etapa. El email frío es solo la última pieza.

## 1. Objetivo

Hoy el pipeline de leads (prospección + email de venta) está afinado para
restaurantes/bares con un único mensaje genérico de "comandas por voz". Se quiere:

1. **Detectar bien** dos verticales nuevos — catering y haciendas/espacios de
   eventos — además de restaurantes.
2. **Conseguir contacto fiable** (email + teléfono) de leads fríos en Sevilla.
3. **Vender con el mensaje adecuado a cada vertical**, apuntando a la landing
   correcta.

Decisión de alcance: **extender** los agentes actuales (no crear uno nuevo).

## 2. Decisiones fijadas (de la fase de brainstorming)

| Decisión | Elegido |
|---|---|
| Alcance | Extender el agente actual |
| Verticales | **Dos separados**: catering → `/catering`; eventos (haciendas/fincas/espacios) → `/espacios` |
| Restaurantes | Se mantienen (email de voz + `web_search` nacional intactos) |
| Contacto | Capturar **email + teléfono**. Email ahora (gratis); teléfono guardado para acción WhatsApp futura |
| Geografía | Sevilla prioritaria, España de fondo |
| Sourcing Apify | Async resuelto en **dos fases con tabla de estado** |
| Verticales Apify | Los **3** en Sevilla: catering + haciendas + restaurantes |
| Presentación haciendas | **Mismo layout** sala/cocina/gestión con un `MODULOS_TIPO.eventos` propio (no una sección a medida) |

## 3. Verticales y mapeo

| Vertical | `tipo_negocio` | Landing | Dolor / pitch |
|---|---|---|---|
| Catering | `catering` | `/catering` | Escandallos, márgenes, presupuestos con coste real |
| Haciendas / espacios | `eventos` | `/espacios` | Gestión de espacios, solicitudes (tipo bodas.net), calendario, contratos |
| Restaurante / bar | `restaurante` / `bar` | `/` | Comandas por voz + IA en procesos (pitch actual, sin cambios) |

`banquete` se trata como sinónimo de `eventos` allá donde ya aparece en la RPC.

## 4. Arquitectura — sourcing con dos motores

### Motor A — Apify Google Places (nuevo, primario para Sevilla)

Da datos estructurados y fiables (nombre, dirección, ciudad, teléfono, web) y,
con el *scrape de contactos* del actor, email desde la web del negocio. Es el
mejor encaje para "email primero, teléfono guardado para WhatsApp".

**`src/lib/apify.ts`** (helper nuevo):
- `startPlacesRun(query: string, max: number, vertical: 'catering'|'eventos'|'restaurante'): Promise<{ runId: string } | null>`
  - `POST {APIFY}/acts/compass~crawler-google-places/runs?token=APIFY_TOKEN`
  - body: `{ searchStringsArray: [query], maxCrawledPlacesPerSearch: max, language: 'es', countryCode: 'es', scrapeContacts: true }`
  - Devuelve `data.id` (runId). `null` si no hay `APIFY_TOKEN` o falla.
- `getRunResults(runId: string): Promise<{ status: string; datasetId?: string; items?: ApifyPlace[] }>`
  - `GET {APIFY}/actor-runs/{runId}?token=...` → si `status==='SUCCEEDED'`, baja
    `GET {APIFY}/datasets/{defaultDatasetId}/items?token=...&clean=true&format=json`.
  - Si no, devuelve solo `{ status }`.
- `APIFY = 'https://api.apify.com/v2'`, `TOKEN = process.env.APIFY_TOKEN`.

**Tabla nueva `prospeccion_apify_runs`** (estado entre invocaciones del cron):
```
id              UUID PK
vertical        TEXT      -- 'catering' | 'eventos' | 'restaurante'
query           TEXT
run_id          TEXT
dataset_id      TEXT
status          TEXT DEFAULT 'pending'  -- 'pending' | 'ingested' | 'failed'
items_total     INT DEFAULT 0
items_ingestados INT DEFAULT 0
started_at      TIMESTAMPTZ DEFAULT now()
finished_at     TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
```
- RLS habilitado + policy `service_role_all` (tabla CRM global, sin `restaurante_id`).
- Índice por `status`.

**Cron nuevo `/api/cron/prospeccion-apify`** (`vercel.json`, `*/30 * * * *`),
idempotente, dos fases por ejecución:
- **Guard:** si no hay `APIFY_TOKEN` → no-op `{ ok: true, skipped: 'sin APIFY_TOKEN' }`.
- **Fase B (collect) primero:** si hay una fila `status='pending'`, sondear su run
  con `getRunResults`. Si `SUCCEEDED` → normalizar items → upsert en `leads` →
  marcar `ingested` + `finished_at` + contadores + `tgAlert` resumen. Si `FAILED`/
  `ABORTED`/`TIMED-OUT` → marcar `failed`. Si sigue corriendo → no hacer nada más
  esta vuelta.
- **Fase A (start):** solo si **no** quedó ningún run `pending`. Coger la siguiente
  query de la lista rotativa de Sevilla (abajo), lanzar run con `max≈15-20`,
  insertar fila `pending`.
- Cap de coste: **1 run por ciclo**, ~15-20 sitios/run.

**Queries rotativas Sevilla (Motor A):**
- catering: `"empresas de catering Sevilla"`, `"catering bodas y eventos Sevilla"`
- eventos: `"haciendas para bodas Sevilla"`, `"fincas para eventos Sevilla provincia"`
- restaurante: `"restaurantes Sevilla centro"`, `"bares y restaurantes Sevilla"`

La rotación recorre los 3 verticales (no agota un vertical antes de pasar a otro).
El `vertical` de la query fija el `tipo_negocio` del lead resultante.

**Normalización item Apify → `leads`:**
```
nombre/empresa/restaurante ← title
ciudad                     ← city || (parse de address) || 'Sevilla'
web                        ← website || null
telefono                   ← phone || phoneUnformatted || null
email                      ← emails?.[0] || null
tipo_negocio               ← vertical de la query
estado                     ← 'nuevo'
estado_pipeline            ← 'prospecto_ia'
origen                     ← 'apify_google_places'
notas                      ← categoryName + totalScore si vienen
eventos                    ← [{ tipo:'🤖', texto:'Encontrado por Apify Google Places (Sevilla)', fecha }]
```
- **Dedup** antes de insertar: descartar si ya existe un lead con misma `web`
  (normalizada) o mismo `nombre`+`ciudad` (case-insensitive), comparando contra
  los `leads` existentes (mismo criterio que usa `prospeccion-leads`).

### Motor B — Claude `web_search` (existente, ampliado)

`/api/cron/prospeccion-leads` se mantiene para cobertura **nacional** y, sobre
todo, **grupos multi-local** que Google Places no agrupa. Cambios mínimos:
- Ampliar la taxonomía del prompt `tipo` a `restaurante|bar|catering|eventos`
  (hoy no existe `eventos`; las haciendas caían mal clasificadas).
- Pedir en el JSON `email` y `telefono` públicos (null si no se ven con certeza,
  sin inventar) y guardarlos en el lead.
- Añadir de fondo 1-2 queries de Sevilla catering/haciendas a la rotación.

## 5. Pipeline vertical-aware: research + presentación + borradores

El núcleo del flujo de restaurantes es `/api/cron/lead-onboarding` (Lead Hunter
v3): coge leads nuevos (`research_at IS NULL`, <72h), hace research con Gemini
Search, redacta email + WhatsApp, genera el slug de la **propuesta personalizada**
(`/propuesta/[slug]`, renderizada por `src/app/p/[slug]/page.tsx`) y lo manda a
Telegram con botones. Hay que hacer **cada etapa** consciente del vertical.

### 5.1 Research — `lead-onboarding` (prompt + taxonomía por vertical)

- Ampliar la taxonomía `tipo_negocio` del prompt a `restaurante|bar|catering|eventos|grupo|mixto` (hoy no existe `eventos` → las haciendas caían en `catering`/`grupo`).
- Respetar el `tipo_negocio` que ya trae el lead (el de Apify/web_search): pasarlo
  al prompt como pista fuerte y pedir a la IA que **lo confirme o corrija**, sin
  degradar una hacienda a restaurante.
- Pedir señales propias de cada vertical en el JSON de research:
  - **catering:** nº de eventos/bodas al año (estimado), si hace bodas/empresa,
    aforo máximo servido, si publica menús/precios, escandallos/coste por comensal.
  - **eventos (hacienda/espacio):** nº de espacios, aforo, si aparece en bodas.net /
    zankyou, si gestiona calendario/disponibilidad online, paquetes, exclusividad
    de catering propio o externo.
- `pain_points_detectados` y `modulos_criticos` deben salir alineados al vertical
  (catering → `eventos`, `almacen`, `analytics`; hacienda → `eventos`,
  `multi_local`/agenda, captación de solicitudes, cobros de grupo).
- Mantener el resto del flujo igual (slug, `estado_pipeline: 'propuesta_lista'`,
  Telegram con botones, fallback si el JSON no parsea).

### 5.2 Presentación — `src/app/p/[slug]/page.tsx` (separar catering vs eventos)

- **Separar el bucket único actual** `MODULOS_TIPO.catering` en dos:
  - `catering` (se mantiene/afina): voz en servicio, KDS por pases, rentabilidad
    por evento, portal cliente de menú, coste por comensal, captación leads.
  - **`eventos` (nuevo)** para haciendas/espacios — tarjetas de **gestión de
    espacios**: `espacios` (calendario y disponibilidad por finca), `solicitudes`
    (embudo de bodas.net/zankyou centralizado), `presupuestos` (con márgenes),
    `contratos` (firma y seguimiento), `cobros de grupo` (portal `/cobro/[slug]`),
    `barra libre`/tiers, check-in QR. Mismo formato de 3 columnas
    (sala/cocina/gestión) reusando la maqueta, con copy propio del vertical.
- **`getModulos(tipo)`** enruta:
  - `cater` → `catering`
  - `event` / `hacienda` / `finca` / `espacio` / `bod` (boda/banquete) → `eventos`
  - resto igual que hoy.
- **Subheadline por vertical** (sustituye el genérico "Sala, cocina, almacén…"):
  - catering → presupuestos que cuadran y coste real por evento.
  - eventos → llena el calendario de la finca y no se te escapa ninguna solicitud.
  - (si `datos_operativos.subheadline` viene del research, tiene prioridad).
- No se rehace la estructura de la página (decisión: mismo layout). Solo datos +
  un bucket nuevo + ruteo + subheadline.

### 5.3 Borradores email + WhatsApp — `lead-onboarding` (copy por vertical)

- Los prompts de generación de email/WhatsApp reciben el `tipo_negocio` y el
  ángulo del vertical, y enlazan a la propuesta + a la landing correcta
  (`/catering` o `/espacios`) en vez del genérico.
- Mantener tono Alberto, ≤100 palabras, objetivo reunión, `__PROPUESTA_URL__`.

## 6. Cambio en la RPC `search_leads_sevilla_nuevos` (migración)

Nueva versión de la función (la actual excluiría estos leads):
- **Bug actual:** exige `num_locales >= 2` o `1 local con >60 mesas`. Un catering
  o una hacienda es **1 sitio sin mesas** → quedaría fuera.
- **Regla nueva** (un lead de Sevilla es elegible para email si):
  - `ciudad ILIKE '%Sevilla%'` y `tipo_negocio <> 'hotel'`, y
  - **tiene email** (`l.email IS NOT NULL AND l.email <> ''`) — los de solo
    teléfono esperan a la fase WhatsApp, y
  - sin contacto/baja/tracking previos (`leads_contactos`, `leads_unsubscribes`,
    `leads_web_tracking` → todos NULL, igual que hoy), y
  - pasa el **gate de tamaño relajado**:
    `num_locales >= 2`
    `OR (num_locales = 1 AND MAX(num_mesas) > 60)`
    `OR tipo_negocio IN ('catering','eventos','banquete')`
    `OR origen = 'apify_google_places'`  ← restaurantes individuales de Apify entran
- **Orden de prioridad:** mantener el actual (catering con muchos locales primero,
  luego catering 2+, luego eventos/banquete, luego resto), con `RANDOM()` de
  desempate. Devuelve `tipo_negocio` (ya lo hace).
- Nota de implementación: confirmar que `leads.origen` existe como columna; si el
  origen vive en `estudio_completo->>'origen'`, ajustar el filtro a ese JSON.

## 7. Cambio en el email frío — `crm-lead-hunter-sevilla` (3 plantillas por vertical)

Ramificar por `lead.tipo_negocio` antes de construir el email; cada rama define
`subject`, `html`, `landingPath` y `utmSource`:

- **`catering`** → asunto y cuerpo sobre coste real/escandallos/márgenes y
  presupuestos que se calculan solos. Link `https://www.iarest.es/catering`,
  `utm_source=crm_catering`.
- **`eventos` / `banquete`** → cuerpo sobre gestión de espacios, captación de
  solicitudes (tipo bodas.net), calendario y contratos automáticos. Link
  `https://www.iarest.es/espacios`, `utm_source=crm_eventos`.
- **resto (`restaurante`/`bar`/null)** → el email de voz actual, **sin cambios**.
  Link `https://www.iarest.es`, `utm_source=crm_lead`.

Se conservan: tracking en `leads_web_tracking`, enlace de baja (`unsubscribe`),
límite de 3/día, `tgAlert` de resumen (añadiendo el vertical en el texto). El
`telefono` del lead **no se usa todavía** (queda para WhatsApp).

Reglas de marca respetadas: nunca nombrar competidores; titular = el QUÉ, no el
CÓMO; el dolor en beneficio.

## 8. Variables de entorno

- **`APIFY_TOKEN`** (nuevo) → Vercel env (encrypted, production+preview). Lo añade
  Alberto; el valor no va al repo. Sin él, `prospeccion-apify` hace no-op y nada
  más se rompe. Documentar el nombre en `.env.example` y en el maestro (Sección 7).

## 9. Fuera de alcance (YAGNI)

- Envío real por WhatsApp (solo se **guarda** el teléfono; el wa.me / plantillas
  Meta son fase futura).
- UI nueva en `/super` (los leads ya se ven en el panel CRM existente).
- Enriquecimiento de leads ya existentes sin email (se trabajan los nuevos de
  Apify; un backfill puede ser una mejora posterior).

## 10. Verificación

- `npx tsc --noEmit` con 0 errores.
- `next build` con dependencias instaladas (no solo `tsc`: el build de Vercel es
  la verdad — lección de la PR #17).
- Migración aplicada en Supabase (tabla `prospeccion_apify_runs` + nueva versión
  de la RPC) vía MCP.
- Prueba en seco del helper Apify documentada (la red del contenedor puede
  bloquear `api.apify.com`; si es así, se valida lógica + tipos y se deja el run
  real para Alberto/prod).

## 11. Resumen de archivos tocados

| Archivo | Acción |
|---|---|
| `src/lib/apify.ts` | **nuevo** — helper start/results Google Places |
| `src/app/api/cron/prospeccion-apify/route.ts` | **nuevo** — cron dos fases (sourcing) |
| `supabase/migrations/20260604_prospeccion_apify_runs.sql` | **nuevo** — tabla estado |
| `supabase/migrations/20260604_search_leads_sevilla_v2.sql` | **nuevo** — RPC v2 |
| `src/app/api/cron/prospeccion-leads/route.ts` | editar — taxonomía `eventos` + email/telefono + queries Sevilla |
| `src/app/api/cron/lead-onboarding/route.ts` | editar — research + borradores por vertical |
| `src/app/p/[slug]/page.tsx` | editar — split `MODULOS_TIPO.eventos`, `getModulos`, subheadline por vertical |
| `src/app/api/cron/crm-lead-hunter-sevilla/route.ts` | editar — 3 plantillas email frío por vertical |
| `vercel.json` | editar — cron `prospeccion-apify` `*/30 * * * *` |
| `.env.example` | editar — `APIFY_TOKEN` |
| `docs/CONTEXTO-SESIONES.md` | editar al cierre — registro de sesión |

> Tamaño: sigue siendo **un único plan de implementación** (un pipeline coherente),
> pero más amplio que "solo el email" — toca sourcing, research, presentación,
> borradores y email frío. Se puede implementar por etapas en ese orden.
