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

### 4.4 El agente no llega ni a llamar a la IA 🔴

La IA del monorepo **funciona** — OpenRouter sirve a ia-rest a diario. Registro de `ai_usos` (BD compartida
`wswbehlcuxqxyinousql`), últimos 30 días:

| app / endpoint | proveedor | ok | nº | última |
|---|---|---|---|---|
| `ia-rest` / `search` | openrouter | ✅ | 25 | 01/08/2026 04:00 |
| `ia-rest` / `chat` | openrouter | ✅ | 251 | 31/07/2026 08:02 |
| `ia-rest` / `director` | openrouter | ✅ | 275 | 29/07/2026 08:00 |

Pero el endpoint **`tools` de la pasarela — la única vía de IA del agente SEO (`callAITools`) — tiene CERO
registros en toda la historia de la tabla.** No pocos: ninguno, de ninguna app, nunca.

Como la pasarela sí registra el `chat` y el `search` de ia-rest con el mismo `AI_GATEWAY_SECRET`, si
`callAITools` se hubiera ejecutado alguna vez habría fila (de éxito **o de error** — `registrarUso` se llama
en ambos caminos). No la hay → **el agente SEO nunca alcanza la llamada de IA**.

Encaja con el kill switch: `agenteHabilitado()` se evalúa **antes** de tocar GSC y antes de la IA, así que
con `SEO_AGENT_ENABLED != true` el agente sale limpio y sin dejar rastro. La hipótesis alternativa (que el
cron no dispare) produce exactamente el mismo observable; desde fuera de Vercel no se pueden distinguir,
pero ambas significan lo mismo: **no corre**.

### 4.5 Problemas de IA reales, tapados por el fallback 🟠

- **Gemini a 429 permanente** (cuota agotada): 20 fallos en 14 días, el último el 01/08 a las 04:00. Cada
  `callAISearch` quema un intento fallido antes de caer a OpenRouter.
- **29 timeouts de OpenRouter** en 14 días (aborta a 25 s) y un *breaker abierto* el 31/07.

No rompen nada hoy porque la cadena de fallback aguanta, pero son latencia y coste por una key muerta.

### 4.6 Datos NO comprobados ⚠️

- **`SEO_AGENT_ENABLED`**: vive en las env vars de Vercel, no en el repo. No verificado (ver 4.4: la
  evidencia de `ai_usos` lo señala con fuerza, pero no lo demuestra).
- **Search Console y GA4**: requieren el `GOOGLE_OAUTH_REFRESH_TOKEN` de Vercel. **No sé cuántas impresiones
  reales tiene el sitio ni si está indexado.** Sigue siendo lo primero que hay que mirar.

---

## 4-bis. Hallazgos al inspeccionar la web en vivo (01/08/2026)

Fetch real de `https://www.iarest.es/` → **HTTP 200**, HTML servido en servidor (no shell JS).

**El on-page de la home está bien**, y esto reordena las prioridades del informe:

| Elemento | Estado |
|---|---|
| `<title>` | ✅ «Software de Gestión para Restaurantes, Catering y Espacios de Eventos \| ia.rest» |
| `<meta description>` | ✅ presente, 149 caracteres |
| `<link canonical>` | ✅ `https://www.iarest.es` |
| `og:title` / `og:description` | ✅ ambos |
| `<meta robots>` | ✅ `index, follow` |
| JSON-LD | ✅ 8 bloques (`Organization`, `WebSite`+`SearchAction`, `SoftwareApplication`+`Offer`…) |
| Encabezados | ✅ 1 `<h1>`, 7 `<h2>` |
| GA4 | ✅ tag `G-EN2YQLRLEX` presente |

**Implicación:** el agente SEO reescribiendo metadatos no iba a mover la aguja aunque funcionase — el
on-page ya está resuelto. El cuello de botella es **autoridad, indexación y demanda**, no etiquetas.

Dos defectos concretos detectados de paso:

1. **`solicitarIndexacion()` es casi con seguridad un no-op.** La Indexing API de Google solo soporta
   oficialmente `JobPosting` y `BroadcastEvent`; para páginas normales ignora los `URL_UPDATED`. El agente
   cree que está pidiendo indexación y no la está pidiendo. La vía real es el sitemap en Search Console.
2. **El precio del prompt está desfasado.** El `SYSTEM` del agente dice «59€/mes»; la web dice «Desde
   89€/mes». Si el agente llegara a escribir copy, publicaría un precio falso. Corregir antes de ampliarle
   el alcance.

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
| 6 | **Cambiar el aviso de Telegram**: que «sin cambios» N pasadas seguidas escale a alerta (patrón `agente_latidos`, PR #1184) | `api/cron/seo-agent` | Hoy el silencio del agente es indistinguible del buen funcionamiento |
| 7 | **Corregir el precio del `SYSTEM`** (59€ → 89€) y quitar o marcar `solicitarIndexacion()` | `api/cron/seo-agent` | Evita publicar un precio falso y una falsa sensación de estar indexando |
| 8 | **Renovar o retirar la key de Gemini** (429 permanente) | Vercel env | Latencia y coste por un proveedor muerto en la cadena |

> Nota de método: los puntos 2–4 son cambios de configuración/alcance, reversibles y trazados en
> `seo_cambios`. El punto 1 es el único que exige acceso a Vercel/Google y debe ir primero.

---

## 6-bis. Lo que NO va a arreglar el agente (aunque lo arreglemos)

El on-page ya está bien (§4-bis). Por tanto el agente, incluso desbloqueado y con alcance total, tiene un
techo bajo. Los frenos reales al tráfico, por orden:

1. **Autoridad de dominio ≈ 0.** No hay en todo el sistema **ninguna** acción orientada a conseguir enlaces
   entrantes. 8 artículos generados por IA en una sola tanda y sin backlinks es el perfil exacto que el
   *Helpful Content* de Google descarta.
2. **Las keywords elegidas son head terms imposibles.** «TPV restaurante», «software TPV bares España»:
   Agora, ICG, Numier y Glop llevan años y pagan Ads. Un dominio nuevo no entra ahí en meses. Donde sí se
   puede: long-tail y local — «TPV por voz Sevilla», «comanda por voz sin comisión», «alternativa a X».
3. **VeriFactu 2027 es LA oportunidad regulatoria** y está infraexplotada: la obligación se aplazó a 2027
   (RD-ley 15/2025), la demanda de búsqueda va a crecer, y la competencia aún no ha consolidado ese
   contenido. Hoy hay **un** artículo.
4. **El SEO no es la palanca de este trimestre.** Es un canal a 6–12 meses. El Lead Hunter / CRM de ia-rest
   (prospección, WhatsApp, emails) ya corre a diario y es el que puede traer clientes ahora. Si la pregunta
   de fondo es «no entran clientes», la respuesta no está en el agente SEO.

---

## 6-ter. Lo IMPLEMENTADO en este PR (01/08/2026)

Decisión de Alberto: **ia.rest no publica precio.** El único camino de conversión es el **formulario
de contacto** y el **WhatsApp directo** (`wa.me/34637349990`).

### A. El precio sale de toda la superficie pública

| Sitio | Qué llevaba | Qué queda |
|---|---|---|
| `layout.tsx` | meta/OG/Twitter «Desde 59 €/mes», **3 `Offer` con `price` en JSON-LD**, FAQ con la tarifa desglosada, keyword `tpv desde 59 euros` | Sin `offers`; FAQ remite a presupuesto por formulario/WhatsApp |
| `page.tsx` (home) | meta/OG/Twitter «Desde 89 €/mes», calculadora de precio (JS + sección), comparativa con «ia.rest 139 €/mes», contador «59 €» | Todo eliminado (no ocultado: **borrado del DOM**) |
| `/hosteleria` | meta/OG, `Offer price 59`, FAQ «59€/mes… 99€/mes», strip oculto | Limpio |
| `/catering` · `/espacios` | metas, strips, sección de precio completa con ejemplo 59€+20€=79€ | Limpio (las cifras del **evento del cliente** se mantienen: son la demo del producto, no nuestra tarifa) |
| `/tapas-bar` · `/grupo-multilocal` · `/restaurante-indio` · `/restaurante-mediterraneo` | rejilla «59€/mes · +20€ · +15€» | Rejilla de valor: «Sin comisión · Sin permanencia · Presupuesto a medida» |
| 4 artículos del blog | tarifa en cuerpo, CTA y tabla comparativa | Modelo sin cifra; en la comparativa con la competencia nuestra fila pasa a «Consultar» |

> Criterio aplicado: se borra **la tarifa de ia.rest**. Se mantienen los precios de **terceros**
> (competencia, hardware Android ~180 €, router ~120 €) y las cifras del **negocio del cliente** en las
> demos de catering — no son nuestro precio y sostienen el argumento.
>
> Las secciones de precio que estaban en `display:none` se han **eliminado**, no re-ocultado: un bloque
> oculto sigue en el HTML y Google lo lee.

### B. CTA unificado

Las 4 landings que solo tenían `mailto:` pasan a **WhatsApp** como CTA principal (con mensaje
preescrito por vertical y `data-ga="click_whatsapp"`) y **formulario** (`/#contacto`) como secundario.
El email se mantiene solo donde es obligatorio (texto RGPD y pie).

### C. El agente SEO, desbloqueado

1. **Allowlist ampliada** — de `['/restaurantes','/restaurantes/*']` a la home, `/comanda-por-voz` y
   las 8 landings de sector (`src/lib/seo/targets.ts`).
2. **`SEO_DEFAULTS` para las 11 rutas**, sin una sola cifra de precio.
3. **Regla inviolable en el `SYSTEM`**: nunca publicar precio de ia.rest — ni en title, ni en
   description, ni en bloque, ni en artículo, ni en JSON-LD. Ante keyword de precio, cubre la
   intención sin cifra y remata en formulario/WhatsApp. Elimina de paso el «59€/mes» obsoleto.
4. **`solicitarIndexacion()` eliminado** (§4-bis.1) y documentado por qué, para que nadie lo restaure.
5. **El silencio pasa a ser alerta**: si no aplica NADA en 21 días, el Telegram deja de decir «sin
   cambios» y avisa de que hay que revisar indexación y umbral.

### D. Verificación ejecutada

- `npx tsc --noEmit` → **0 errores**.
- `npx next build` → **build completo correcto** (todas las rutas generadas).
- `npx tsx scripts/seo/test-guardrails.ts` → **14/14 checks OK**.

### E. Lo que sigue pendiente y NO puedo tocar desde aquí

Vive en las env vars de Vercel, no en el repo:

- **`SEO_AGENT_ENABLED`** — hay que ponerlo a `true` o el agente sigue saliendo en el primer `if`.
- **`SEO_MIN_IMPR`** — bajarlo a 3–5 mientras no haya volumen (hoy 30, inalcanzable).
- **Key de Gemini** — en 429 permanente (§4.5).

Y una decisión de producto que este PR **no** toca: `/registro` sigue existiendo como alta
self-service con Stripe. Si la venta pasa a ser 100 % conversada, hay que decidir si esa puerta se
cierra o se deja como acceso para clientes ya cerrados.

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
