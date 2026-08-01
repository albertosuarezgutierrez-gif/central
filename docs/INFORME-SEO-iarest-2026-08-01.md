# Informe — Por qué iarest.es no recibe visitas y qué hace (o no hace) el agente SEO

**Fecha:** 01/08/2026 · **Alcance:** `apps/ia-rest` (dominio `www.iarest.es`)
**Fuentes consultadas:** código del repo, BD de producción de ia-rest (Supabase `efncqyvhniaxsirhdxaa`), `vercel.json`.

---

## 1. Conclusión en una línea

El agente SEO **está construido y programado, pero no ha aplicado ni un solo cambio desde que se creó**:
su lista de rutas editables (`/restaurantes`) excluye la home y todas las landings comerciales, y su umbral
de actuación (30 impresiones en Search Console) es inalcanzable justo cuando no hay tráfico. Es un agente
diseñado para **optimizar** un sitio que ya posiciona, no para **arrancar** uno que no lo hace.

---

## 2. Qué hace el agente por diseño

### 2.1 Agente SEO autónomo — `src/app/api/cron/seo-agent/route.ts`

| Aspecto | Valor real en el código |
|---|---|
| Disparo | Cron Vercel: **martes y viernes a las 07:00** (`vercel.json`) |
| Cerebro | `callAITools` (NVIDIA NIM, function-calling) + `callAISearch` (Gemini, para `web_search`) |
| Lectura de datos | Search Console y GA4 vía OAuth (`src/lib/seo/gsc-ga4.ts`, propiedad GA4 `536881804`) |
| Escritura | `set_metadata`, `set_schema`, `set_content_block`, `create_article` (`/blog/{slug}`) |
| Trazabilidad | Snapshot antes/después en `seo_cambios`; revert desde `/super → SEO` |
| Post-acción | Pide indexación a la Indexing API de Google y avisa por Telegram en **cada** pasada |

**Metodología que le marca el prompt:** impresiones altas + CTR bajo → reescribir metadatos; posición 5–20 →
insertar bloque de contenido; bounce alto → bloque de contenido; keyword sin cubrir → crear artículo.

### 2.2 Guardarraíles — `src/lib/seo/guardrails.ts`

- Kill switch: solo corre si `SEO_AGENT_ENABLED === 'true'`.
- Máximo **5 cambios por pasada** (`SEO_MAX_CAMBIOS`).
- **Cooldown de 7 días** por ruta (anti-oscilación).
- Umbral: solo actúa sobre queries con **≥ 30 impresiones** (`SEO_MIN_IMPR`).
- Allowlist de rutas editables (`src/lib/seo/targets.ts`): **`['/restaurantes', '/restaurantes/*']`**.

### 2.3 Segundo cron relacionado — `src/app/api/cron/blog-seo/route.ts`

Lunes 08:00. Saca keywords de GSC (90 días), descarta las branded, elige una sin artículo y genera el post
con el modelo rápido (8B, porque el 70B se pasaba de los 60 s de Vercel). Escribe en `blog_borradores`.

---

## 3. Qué está haciendo en realidad — nada

Estado de las tablas en la BD de producción de ia-rest, a 01/08/2026:

| Tabla | Filas | Última escritura |
|---|---|---|
| `seo_cambios` | **0** | — |
| `seo_articulos` | **0** | — |
| `seo_overrides` | **0** | — |
| `seo_content_blocks` | **0** | — |
| `blog_borradores` | 8 (todos `publicado`) | **25/05/2026** |

Lectura: el agente autónomo (creado en junio, según `docs/superpowers/specs/2026-06-13-agente-seo-autonomo-iarest-design.md`)
**nunca ha escrito nada**. El generador de blog produjo 8 artículos en una sola tanda el 25/05 y no ha vuelto
a producir en **más de dos meses**.

---

## 4. Diagnóstico — tres causas, por orden de impacto

### 4.1 La allowlist deja fuera todas las páginas que importan 🔴

`RUTAS_SEO_EDITABLES = ['/restaurantes', '/restaurantes/*']`.

El agente **no puede tocar**:

- `/` (home) — prioridad 1.0 en el sitemap.
- `/comanda-por-voz` — la página de producto.
- `/hosteleria`, `/catering`, `/tapas-bar`, `/grupo-multilocal`, `/restaurante-indio`,
  `/restaurante-mediterraneo`, `/eventos`, `/espacios` — **las 8 landings de sector**.
- `/blog` y los 8 posts existentes.

Y lo único que sí puede tocar, `/restaurantes`, es un directorio que hoy tiene **2 restaurantes en BD y 1 web
activa**. Es decir: el agente tiene permiso de escritura sobre la página con menos potencial de tráfico del
sitio entero, y ninguno sobre las demás.

### 4.2 Pescadilla que se muerde la cola: el umbral 🔴

Solo actúa sobre queries con **≥ 30 impresiones** en GSC. Sin tráfico no hay impresiones → nada supera el
umbral → el agente no hace nada → sigue sin tráfico. El umbral es razonable para no optimizar ruido en un
sitio con volumen; en un sitio a cero es un candado.

Consecuencia visible: el agente manda cada martes y viernes un Telegram con *«sin cambios esta pasada (sin
oportunidades con datos suficientes)»*, que **parece funcionamiento normal** y no una alarma.

### 4.3 Producción de contenido parada desde mayo 🟠

`create_article` (agente) y el cron `blog-seo` son las dos únicas vías de contenido nuevo, y las dos llevan
paradas. 8 artículos publicados hace dos meses no sostienen un crecimiento orgánico.

### 4.4 Dato NO comprobado ⚠️

**No he podido verificar si `SEO_AGENT_ENABLED` está a `'true'` en Vercel** (vive en las env vars del
proyecto, no en el repo). Si no lo está, el agente devuelve `{ok:false, msg:'SEO_AGENT_ENABLED != true'}` en
el primer `if` y ni siquiera llega a consultar GSC. Sería una causa **adicional**, no alternativa: aunque
estuviera activo, 4.1 y 4.2 lo dejarían igualmente sin actuar.

Tampoco he podido consultar Search Console ni GA4 directamente desde esta sesión (requieren el
`GOOGLE_OAUTH_REFRESH_TOKEN` de Vercel), así que **no sé cuántas impresiones reales tiene el sitio ni si está
indexado**. Es lo primero que hay que mirar.

---

## 5. Lo que sí está bien (no tocar)

- `robots.ts` y `sitemap.ts` están correctos: allowlist explícita, privado bien bloqueado (`/api/`, `/kds`,
  `/super`, `/q/`…), sitemap con las landings, el blog y las webs de restaurante dinámicas.
- El circuito de reversión (`seo_cambios` con valor_antes/después + `/super → SEO`) es sólido: se puede
  ampliar el alcance del agente sin miedo, porque cada cambio es reversible y queda trazado.
- Los guardarraíles de límite y cooldown son correctos y no hace falta tocarlos.

---

## 6. Recomendaciones, por orden

| # | Acción | Dónde | Por qué |
|---|---|---|---|
| 1 | **Comprobar `SEO_AGENT_ENABLED` y mirar GSC/GA4 reales** — ¿está el sitio indexado? ¿cuántas impresiones? | Vercel env + `/super` | Sin esto, todo lo demás es a ciegas |
| 2 | **Ampliar la allowlist** a `/`, `/comanda-por-voz` y las 8 landings de sector | `src/lib/seo/targets.ts` | Es el cambio de 1 línea con más impacto del informe |
| 3 | **Añadir los defaults de SEO** de esas rutas a `SEO_DEFAULTS` | `src/lib/seo/targets.ts` | Hoy solo está `/restaurantes`; sin defaults el agente no ve el «estado actual» |
| 4 | **Bajar `SEO_MIN_IMPR`** a 3–5 mientras no haya volumen | Vercel env | Desbloquea el candado del punto 4.2 |
| 5 | **Reactivar la producción de contenido**: revisar por qué `blog-seo` no escribe desde el 25/05 | `api/cron/blog-seo` | Sin contenido nuevo no hay crecimiento orgánico |
| 6 | **Cambiar el aviso de Telegram**: que «sin cambios» N pasadas seguidas escale a alerta | `api/cron/seo-agent` | Hoy el silencio del agente es indistinguible del buen funcionamiento |

> Nota de método: los puntos 2–4 son cambios de configuración/alcance, reversibles y trazados en
> `seo_cambios`. El punto 1 es el único que exige acceso a Vercel/Google y debe ir primero.

---

## 7. Referencias de código

```
apps/ia-rest/src/app/api/cron/seo-agent/route.ts    Agente autónomo (bucle NIM + tools)
apps/ia-rest/src/app/api/cron/blog-seo/route.ts     Generador de artículos (lunes 08:00)
apps/ia-rest/src/lib/seo/targets.ts                 Allowlist de rutas + defaults  ← cuello de botella
apps/ia-rest/src/lib/seo/guardrails.ts              Kill switch, límites, cooldown, umbral
apps/ia-rest/src/lib/seo/gsc-ga4.ts                 Lectura Search Console + GA4 (OAuth)
apps/ia-rest/src/lib/seo/store.ts                   Persistencia (overrides, bloques, artículos, cambios)
apps/ia-rest/src/app/sitemap.ts · robots.ts         Correctos, no tocar
apps/ia-rest/vercel.json                            Crons: seo-agent mar+vie 07:00, blog-seo lun 08:00
```
