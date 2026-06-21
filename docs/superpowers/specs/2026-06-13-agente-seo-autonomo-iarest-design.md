# Agente SEO autónomo — iarest.es (Fase 1)

> Estado: diseño aprobado (2026-06-13). Pendiente plan de implementación.
> Vertical: `apps/ia-rest`. Schema BD: `iarest`.

## 1. Objetivo

Un agente que, **un par de veces por semana**, analice los resultados de búsqueda
reales (Google Search Console + GA4) de **iarest.es** y **adapte el SEO de forma
autónoma**: titles, meta descriptions, datos estructurados (JSON-LD), bloques de
contenido en páginas existentes y artículos nuevos.

Autónomo = aplica y publica solo, **sin revisión humana previa**, pero con una
**red de seguridad** que lo hace auditable y reversible.

**Fuera de alcance (fases posteriores):** ialimp.es (no tiene GSC/GA4 conectado;
requiere trabajo previo de OAuth) y la extracción de la lógica a un módulo
compartido `@central/core-seo`. Esta fase entrega valor end-to-end solo sobre
iarest.es.

## 2. Principio rector: los cambios son DATOS, no código

Toda mutación autónoma se persiste en **BD** y las páginas la leen en render.
El agente **nunca** edita ficheros `.tsx` ni hace `git commit` a `main`.

**Motivo:** un LLM autónomo editando código y desplegando a `main` puede romper
el build y tirar toda la web de marketing, sin revisión que lo frene. Si los
cambios son datos, una mala salida del modelo como mucho introduce texto pobre en
una ruta concreta — nunca tumba el sitio — y revertir es borrar/restaurar una fila.

| Mutación | Mecanismo | Reversión |
|---|---|---|
| title / meta / canonical / OG | `seo_overrides` (por ruta), leída en `generateMetadata()` | borrar fila |
| JSON-LD / schema | campo `jsonld` en `seo_overrides` | borrar fila |
| Bloque de contenido en página existente | `seo_content_blocks` → slot `<SeoBlocks path=… />` | borrar/desactivar fila |
| Artículo nuevo | `seo_articulos` renderizado por ruta dinámica `/blog/[slug]` | desactivar fila |

> Nota: el cron de blog actual (`/api/cron/blog-seo`) seguirá generando borradores
> `.tsx` con revisión humana. El agente autónomo es un camino **separado** y
> basado en datos; no se toca el flujo de blog existente.

## 3. Arquitectura

### 3.1 Endpoint / cron

`apps/ia-rest/src/app/api/cron/seo-agent/route.ts` (GET).

- Auth: `Bearer ${CRON_SECRET}` (cron de Vercel) **o** sesión `super_admin`
  (para dispararlo a mano), igual que `blog-seo`.
- `maxDuration = 60`, `dynamic = 'force-dynamic'`.
- Schedule en `apps/ia-rest/vercel.json`: `0 7 * * 2` y `0 7 * * 5`
  (martes y viernes, 07:00 UTC).

### 3.2 Bucle agéntico

Mismo patrón que `/api/super/agentes-seo`: bucle de hasta ~10 iteraciones contra
la API de Anthropic con `web_search` + tools personalizadas. Modelo igual que el
agente actual (`claude-haiku-4-5-20251001`).

**Tools de lectura** (extraídas de `agentes-seo` a un helper reutilizable
`src/lib/seo/gsc-ga4.ts` para no duplicar):
- `get_gsc_data` (queries / pages / countries / devices)
- `get_ga4_data` (overview / pages / sources / conversions / landing)
- `web_search` (competencia, keywords, noticias)

**Tool de inventario:**
- `list_seo_targets` → devuelve las rutas editables (allowlist) con su SEO actual
  (title/meta/jsonld resultantes = default del código + override vigente en BD) y
  un resumen de los bloques de contenido existentes. Da al agente el "estado actual"
  sobre el que decidir.

**Tools de escritura** (cada una pasa por la red de seguridad §4):
- `set_metadata(path, title?, description?, canonical?, og?)`
- `set_schema(path, jsonld)`
- `set_content_block(path, posicion, titulo, html)` (upsert por `path`+`posicion`)
- `create_article(slug, titulo, meta, keyword, bloques[])`

### 3.3 Metodología (system prompt)

1. Pedir datos reales antes de decidir (GSC + GA4).
2. Cruzar señales:
   - Impresiones altas + CTR bajo → reescribir title/meta.
   - Posición 5–20 ("casi página 1") → reforzar contenido/keyword.
   - Tráfico alto + bounce alto → mejorar contenido/intención.
   - Keyword sin cubrir → artículo nuevo.
3. Aplicar cambios vía tools de escritura (respetando límites §4).
4. Tras aplicar: pedir indexación (Indexing API + ping sitemap GSC, reusa
   `solicitarIndexacion` de `blog-publicar`) y enviar informe Telegram.

Reglas de copy heredadas del proyecto: español; sin "innovador/revolucionario/
disruptivo/potente"; sin inventar cifras/testimonios; comparativas solo con datos
verificables.

### 3.4 Render en las páginas

- **Metadata**: cada página de la allowlist usa `generateMetadata()` que parte de
  su default y **mergea** el override vigente de `seo_overrides` (si existe).
  Páginas a adaptar: `/` (`page.tsx`), `/restaurantes`, `/restaurantes/[ciudad]`,
  `/espacios`.
- **Bloques de contenido**: componente `<SeoBlocks path={…} />` que lee
  `seo_content_blocks` activos para esa ruta y los renderiza ordenados por
  `posicion`. Se inserta en un punto fijo de cada página de la allowlist.
- **Artículos**: ruta dinámica `/blog/[slug]/page.tsx` que renderiza desde
  `seo_articulos` (con `generateMetadata` + `generateStaticParams`/ISR). Convive
  con los artículos `.tsx` estáticos ya existentes (estos tienen prioridad si
  hubiera colisión de slug; el agente no puede crear un slug que ya existe como
  fichero — `list_seo_targets` los expone para evitar colisiones).
- Revalidación: las rutas afectadas usan ISR con `revalidate` corto (p.ej. 300s) o
  `revalidateTag`/`revalidatePath` invocado por las tools de escritura, para que el
  cambio sea visible sin redeploy. (Decisión fina en el plan.)

## 4. Red de seguridad

- **`seo_cambios`** (auditoría + snapshot): `id, run_id, ruta, tipo, valor_antes
  (jsonb), valor_despues (jsonb), motivo, created_at`. Toda tool de escritura
  inserta aquí ANTES/al aplicar.
- **Kill switch**: env var `SEO_AGENT_ENABLED`. Si `!== 'true'`, el cron responde
  `{ ok:false, msg:'deshabilitado' }` y no toca nada.
- **Allowlist de rutas**: constante `RUTAS_SEO_EDITABLES` (marketing + blog). Las
  tools rechazan cualquier ruta fuera de ella. Nunca `/registro`, `/super`, áreas
  privadas, legales ni checkout.
- **Límites por pasada**: máx. `SEO_MAX_CAMBIOS` (default 5) mutaciones por run;
  no tocar la misma ruta si se modificó en los últimos 7 días (anti-oscilación,
  consultando `seo_cambios`).
- **Umbral de datos**: solo actuar sobre queries con impresiones ≥ `SEO_MIN_IMPR`
  (default a fijar en el plan) — no optimizar ruido.
- **Informe Telegram** al final de cada run: nº de cambios, ruta, tipo, antes→después
  resumido, y nota de cómo revertir.
- **Reversión**: acción en el panel `/super` (tab SEO) que lista `seo_cambios`
  recientes y permite restaurar `valor_antes` / borrar el override.

## 5. Modelo de datos (schema `iarest`)

```
seo_overrides(
  id uuid pk, ruta text unique, title text, description text,
  canonical text, og jsonb, jsonld jsonb, activo bool default true,
  updated_at timestamptz, updated_by text default 'seo-agent')

seo_content_blocks(
  id uuid pk, ruta text, posicion int, titulo text, html text,
  activo bool default true, updated_at timestamptz,
  unique(ruta, posicion))

seo_articulos(
  id uuid pk, slug text unique, titulo text, meta_description text,
  keyword text, bloques jsonb, activo bool default true,
  published_at timestamptz, created_at timestamptz)

seo_cambios(
  id uuid pk, run_id uuid, ruta text, tipo text,
  valor_antes jsonb, valor_despues jsonb, motivo text,
  created_at timestamptz default now())
```

(Tipos/índices definitivos en la migración del plan.)

## 6. Variables de entorno (todas ya existentes salvo las nuevas marcadas)

- `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (GSC/GA4 + Indexing)
- `ANTHROPIC_API_KEY` (bucle agéntico + web_search)
- `CRON_SECRET` (auth del cron)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (informe)
- **`SEO_AGENT_ENABLED`** (nueva — kill switch)
- **`SEO_MAX_CAMBIOS`**, **`SEO_MIN_IMPR`** (nuevas — límites, con defaults en código)

Sin secretos en el repo: valores en Vercel env.

## 7. Componentes y límites (para el plan)

| Unidad | Qué hace | Depende de |
|---|---|---|
| `src/lib/seo/gsc-ga4.ts` | Lectura GSC + GA4 (extraído de `agentes-seo`) | OAuth Google |
| `src/lib/seo/store.ts` | CRUD de overrides/blocks/articulos + snapshot en `seo_cambios` | Supabase `iarest` |
| `src/lib/seo/targets.ts` | Allowlist + resolución de SEO actual por ruta | store, defaults de páginas |
| `src/app/api/cron/seo-agent/route.ts` | Bucle agéntico + tools + indexación + Telegram | todo lo anterior |
| `src/components/seo/SeoBlocks.tsx` | Render de bloques por ruta | store (server) |
| `generateMetadata` en páginas marketing | Merge default + override | store |
| `src/app/blog/[slug]/page.tsx` | Render de artículos en BD | store |
| Tab SEO en `/super` (reversión) | Listar `seo_cambios` y revertir | store |
| Migración SQL | 4 tablas en `iarest` | — |

## 8. Criterios de éxito

- El cron corre martes y viernes 07:00 UTC y, con datos GSC/GA4 reales, aplica
  cambios de SEO sin intervención humana.
- Ningún cambio del agente puede romper el build ni dejar la web caída.
- Cada cambio queda en `seo_cambios` con antes/después y es reversible desde `/super`.
- `SEO_AGENT_ENABLED=false` detiene por completo al agente.
- El flujo de blog `.tsx` con revisión humana sigue intacto.

## 9. Riesgos asumidos

- **Autonomía en producción**: el agente publica SEO sin revisión previa. Mitigado
  por snapshot + informe Telegram + kill switch + límites por pasada + allowlist.
- **Calidad del LLM**: puede proponer copy mediocre. Mitigado por umbral de datos,
  anti-oscilación (7 días) y reversión rápida.
- **Coste Anthropic**: 2 runs/semana con web_search. Acotado por máx. iteraciones.
```
