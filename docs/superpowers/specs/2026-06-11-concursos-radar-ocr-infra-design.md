# Concursos — Infraestructura F7: Radar PLACSP en vivo + OCR de pliegos · Design

> Fecha: 2026-06-11 · Estado: aprobado por Alberto ("ok a todo, lo que veas mejor").
> Cierra la parte de infraestructura de F7. El núcleo puro ya existe en
> `@iarest/module-concursos` (`filtrarRadar`, `coincideRadar`, `necesitaOcr`).

## Objetivo

Que el agente de concursos:
1. **Avise solo** de licitaciones de PLACSP que encajan con la empresa (radar en vivo por cron; aviso in-app de no vistos).
2. **Lea pliegos escaneados** (PDF imagen) reutilizando la visión IA que ya tiene ialimp (`nimVision`), sin Tesseract ni servicios/llaves nuevas.

Reutiliza al máximo lo existente: módulo puro (`filtrarRadar`/`necesitaOcr`), visión IA (`nimVision` de core-ai), patrón de crons multi-tenant (`vercel.json` + bucle `SELECT id FROM empresas`, como `informes/cron`) y el patrón multi-tenant de ialimp (`requireEmpresaId`, Prisma `$queryRaw` con casts).

## Arquitectura

Dos flujos nuevos en `apps/ialimp`, ambos apoyados en el módulo puro:

- **Radar:** `cron → fetch ATOM PLACSP (paginado) → parsear a AnuncioRadar[] → filtrarRadar(criterios de cada empresa) → guardar matches nuevos (dedupe)`. El **aviso es in-app**: la UI muestra el contador de matches **no vistos**.
- **OCR:** dentro del análisis del pliego: si `necesitaOcr(textoExtraído)` → rasterizar páginas del PDF a imágenes → `nimVision` por página (transcripción literal) → texto → seguir el análisis normal con `analizarPliego`.

El **parseo de ATOM** (XML → `AnuncioRadar[]`) y la **dedupe_key** se implementan como funciones **puras y testeables** en `apps/ialimp/lib/concursos-radar.ts` (sin red ni BD), con tests `node --test` contra un fixture XML recortado real.

**Nota sobre el aviso:** en ialimp `push_subscriptions` es **solo de limpiadoras**, no de admins; avisar al admin por web-push exigiría infra de suscripción nueva (sobredimensionado). Por eso el aviso del radar es **in-app** (contador de no vistos + lista). El email al `empresas.email` (ya usado por `informes/generar`) queda como mejora futura trivial.

## Fuente del radar (decisión)

**Sindicación ATOM paginada de PLACSP** (open data de `contrataciondelestado.es`), pública y **sin clave**, con páginas pequeñas (`<link rel="next">`). El cron lee la(s) primera(s) página(s) (las más recientes) hasta un tope de páginas/tiempo y procesa lo nuevo desde la última ejecución (la dedupe evita reprocesar).

- URL configurable en `PLACSP_FEED_URL` (default: el feed de licitaciones de la sindicación oficial). Afinable por CPV/región para menos ruido.
- Descartada la **descarga del ZIP nacional diario completo** (cientos de MB): no es viable/fiable en una función serverless de Vercel; requeriría un worker externo. La sindicación paginada es lo más automático que funciona aquí.
- **Import manual** (pegar/subir un ATOM) como camino adicional para usar y probar desde el minuto cero.

## Datos (migraciones — las aplica Alberto en Supabase)

**1. Ampliar `concursos_perfil_empresa`** (ya existe, 1 fila por empresa) con los criterios del radar:
```sql
alter table concursos_perfil_empresa
  add column if not exists radar_activo boolean not null default false,
  add column if not exists radar_cpv text[] not null default '{}',
  add column if not exists radar_palabras_clave text[] not null default '{}',
  add column if not exists radar_presupuesto_min numeric,
  add column if not exists radar_presupuesto_max numeric;
```

**2. Tabla nueva `concursos_radar_anuncios`** (matches captados, con dedupe e idempotencia):
```sql
create table if not exists concursos_radar_anuncios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  dedupe_key text not null,
  anuncio jsonb not null,           -- AnuncioRadar normalizado
  puntuacion int not null default 0,
  motivos jsonb not null default '[]',
  visto boolean not null default false,
  created_at timestamptz not null default now(),
  unique (empresa_id, dedupe_key)
);
create index if not exists idx_radar_anuncios_empresa on concursos_radar_anuncios (empresa_id, created_at desc);
```
La `dedupe_key` se deriva del identificador estable del anuncio (id ATOM / nº expediente + órgano); evita duplicar y re-notificar.

## Radar — endpoints

- `GET/PUT /api/admin/concursos/radar/criterios` — lee/guarda los criterios de la empresa (auth `requireEmpresaId`). Mapea a las columnas `radar_*` de `concursos_perfil_empresa`.
- `GET /api/admin/concursos/radar` — lista los matches de la empresa (orden por `created_at desc`); soporta `?no_vistos=1`.
- `POST /api/admin/concursos/radar/visto` — marca un match como visto.
- `POST /api/admin/concursos/radar/importar` — import manual: recibe un ATOM (texto/fichero), lo parsea, filtra y guarda como el cron pero solo para la empresa actual.
- `GET /api/cron/concursos-radar` — el cron. Descarga el ATOM una vez (paginado, con tope de páginas/tiempo) → `parsearAtomPlacsp`. Por cada empresa con `radar_activo`: arma `CriteriosRadar` desde sus columnas, `filtrarRadar`, inserta matches nuevos (`insert … on conflict (empresa_id, dedupe_key) do nothing`). Sin auth de cron (lo invoca Vercel cron, como `informes/cron`). `export const dynamic = 'force-dynamic'`, `maxDuration` holgado.
- `vercel.json`: cron `/api/cron/concursos-radar` cada 6 h (`0 */6 * * *`).

## OCR — integración

En `app/api/admin/concursos/analizar/route.ts`, tras `extraerTextoPdf(buffer)`:
```
if (necesitaOcr(texto)) {
  const imagenes = await rasterizarPdf(buffer)      // PDF → PNG por página
  const partes = []
  for (const img of imagenes) partes.push(await nimVision(prompt_transcribe, img))
  texto = partes.join('\n\n')
  ocrAplicado = true
}
// … analizarPliego(aiRunner, texto) como hasta ahora
```
- `rasterizarPdf` en `lib/concursos-ocr.ts`: **`pdfjs-dist` (legacy build) + `@napi-rs/canvas`** (binarios prebuilt aptos para Vercel serverless). Tope de páginas (p.ej. 15) para no dispararse.
- Prompt de visión: "Transcribe literalmente todo el texto de esta página de un pliego, sin resumir ni interpretar."
- **Riesgo señalado:** la rasterización PDF→imagen en serverless es el punto a validar en la preview de Vercel. Si `@napi-rs/canvas`/`pdfjs` diera guerra en el runtime, fallback: permitir subir las páginas como imágenes directamente y mandarlas a `nimVision` (misma función aguas abajo). La elección concreta del rasterizador se confirma al implementar, probando el build.
- La respuesta del `analizar` añade `ocr_aplicado: boolean` para que la UI lo muestre.

## UI (`/admin/concursos`)

- **Radar de oportunidades** (panel o sub-página, white-label con `var(--brand-*)`/`FONT`):
  - Form de criterios: CPV (lista), palabras clave (lista), presupuesto min/max, toggle "Radar activo".
  - Lista de matches: título, órgano, presupuesto, puntuación, motivos (chips), enlace al anuncio, botón "Visto". Filtro "solo no vistos".
- En el análisis de pliego: aviso "📄 Documento escaneado — texto extraído con OCR (visión IA)" cuando `ocr_aplicado`.

## Tests

- **Puro/testeable (`node --test`):**
  - `parsearAtomPlacsp(xml): AnuncioRadar[]` — fixture XML recortado (real) → anuncios esperados (título, objeto, cpv, presupuesto, órgano, url, id estable).
  - `dedupeKey(anuncio): string` — estable y determinista; mismo anuncio → misma clave.
- **No unitario (build + preview):** cron, push, OCR/rasterización, endpoints. Build de `apps/ialimp` en verde; validación funcional en la preview de Vercel.

## Aislamiento / límites

- El **módulo `@iarest/module-concursos` no se toca** (ya expone `filtrarRadar`/`necesitaOcr`). Toda la infra vive en la app (red, BD, secretos, visión, push).
- Sin claves nuevas: el feed es público; la visión y el push ya están configurados en ialimp.

## Pendiente de Alberto (ops)

- Aplicar las 2 migraciones en Supabase (`concursos_perfil_empresa` ampliada + `concursos_radar_anuncios`).
- (Opcional) Ajustar `PLACSP_FEED_URL` por CPV/región para reducir ruido. Sin tocar nada, usa el default público.
- El cron no necesita secreto (lo invoca Vercel cron, como `informes/cron`).

## Fuera de alcance (futuro)

- Descarga/parseo del ZIP nacional completo (worker externo).
- Inteligencia competitiva (adjudicaciones/precios históricos), RAG sobre el pliego, UTE/consorcios — fases posteriores del roadmap de concursos.
