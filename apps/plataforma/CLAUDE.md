# CLAUDE.md — apps/plataforma

## Qué es
`apps/plataforma` es el **cuadro de mando consolidado** de la casa de marcas.  
Un dueño con varios negocios de sectores distintos inicia sesión aquí y ve **todos sus negocios en un vistazo**.

Jerarquía: `Cuenta → Sociedad (CIF) → Negocio (sector)`.

> **🌐 URL producción (web principal):** **`https://plataforma-ten-flame.vercel.app`** (login en `/login`).
> Es el dashboard + el **chat 🤖 Agente IA** (`/agente`). OJO: **sivra** (motor de pricing dinámico y sus
> endpoints `/api/pricing/*`) es **otra app**, en `housesevillana.vercel.app` — no confundir dominios.

## Stack
Next.js 15 · React 19 · Prisma 5 · jose/bcryptjs (JWT, cookie `plataforma_session`) · sin Tailwind (CSS variables).

## BD
Misma Supabase compartida que sivra + ialimp: **`wswbehlcuxqxyinousql`**.  
Tablas propias: `cuentas`, `sociedades`, `negocios` (migración `2026-06-09_cuentas_sociedades_negocios.sql`, ya aplicada).

### 📉 `reservas_canceladas` — lo que se perdió, separado de lo que se cobra (12/08/2026)
`incomes` = lo que SÍ entra. **`reservas_canceladas`** = lo que se canceló. Están separadas a
propósito para que nadie sume una cancelación al ingreso por descuido, y el `DELETE FROM incomes`
del sync **sigue existiendo**: una reserva cancelada no se cobra. Lo que cambia es que ahora, antes
de borrar, `smoobu-sync.ts` deja constancia (helper puro y testeado `lib/sivra/cancelaciones.ts`).
- **`cancelacion_vista_at` NO es la fecha de la cancelación**, es cuándo la vio nuestro sync. El
  listado de Smoobu marca `type:'cancellation'` pero no publica el momento del acto; el payload
  íntegro se guarda en `datos` por si algún día se confirma que sí lo trae.
- **`estaba_en_incomes`** separa la cancelación de una reserva que llegamos a contar como ingreso
  de la de una que se hizo y deshizo entre dos pasadas. Mezclarlas inflaría «noches perdidas».
- `nights` y `amount_gross` pueden ser **NULL** (sin fechas o sin precio no se escribe 0).
- 🚨 **La tabla arrancó VACÍA**: todo lo cancelado antes del 12/08/2026 ya estaba borrado. Un «0
  cancelaciones» en un periodo anterior significa **«no se sabe»**, no «no hubo». Rellenarlo exige
  un backfill deliberado contra Smoobu con `modifiedFrom` atrás — nunca el cron diario.

### 🧭 LANDMINE — DÓNDE VIVE CADA INGRESO (lee esto ANTES de tocar ingresos/contabilidad)
> Punto ciego real (11/07/2026): se buscó "ingreso por piso" por nombres de tabla en **español**
> (`%ingres%`, `%propiedad%`, `%reserv%`), no aparecieron las tablas de SIVRA (que están en **inglés**),
> se concluyó en falso que "no existe" y se creó una **tabla duplicada** (`ingresos_negocio_mensual`, ya
> borrada). Para que NO se repita:

- **Ingreso turístico POR PISO/RESERVA = tabla `incomes`** (INGLÉS). Es la fuente REAL y canónica:
  `propertyId, date (≈check-in), amount (NETO), amount_gross (BRUTO), portal (BOOKING/AIRBNB/EXPEDIA/AGODA/OTRO),
  nights, checkIn, checkOut, guestName`. Histórico 2020→hoy. **Es lo que ya pinta el dashboard** por negocio.
  Gastos por piso: **`expenses`** / **`gastos`** (`propiedad`=propertyId). Pisos: **`properties`** (INGLÉS).
- **Enlace negocio → piso:** `negocios.ref_ext` (`prop_duplex_center`, `prop_luxury_busto`, `prop_house_sevillana`,
  `prop_busto_reform`) **=** `incomes.propertyId`. Los negocios turísticos son `app='sivra'`.
- **Helper YA existente — reutilízalo, NO recalcules:** `lib/financiero.ts::getResumenSivra(anio, propertyId)`
  (year completo + "a día de hoy" por `checkOut<=CURRENT_DATE`). Adapter en `lib/adapters/sivra.ts`.
- **El BANCO (`movimientos_bancarios`) NO separa los pisos:** los payouts de Booking entran agregados y todos
  caen en `destino='turistico_pisos'` (salvo el Dúplex, que además se etiqueta `turistico_duplex` SOLO en gastos).
  Por eso "ingresos del Dúplex" por banco daba 0 — el banco es caja agregada, `incomes` es el detalle por piso.
- **TRAMPA — tablas DEMO, NO usar para la contabilidad de Alberto:** `propiedades` (español), `propietario_ingresos`,
  y los `negocios "[seed-demo]"` son datos de prueba/otro tenant (`empresa_id` SIVRA-SaaS). El ingreso real de
  Alberto NO está ahí. `negocios.ingresos_manual` es un override plano (solo puesto en los demos), no fuente por mes.
- **Regla:** antes de una investigación de ingresos/contabilidad, carga `plataforma-maestro`/`sivra-maestro` y
  busca los nombres de tabla en **inglés Y español**. La verdad por piso está en `incomes`, no en el banco.

## Envs de Vercel (proyecto `plataforma`)
| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL de conexión pooled de Supabase (`wswbehlcuxqxyinousql`) |
| `DIRECT_URL` | URL de conexión directa de Supabase (para migraciones Prisma) |
| `JWT_SECRET` | Secret para firmar `plataforma_session` |
| `IAREST_URL` | `https://iarest.es` |
| `IALIMP_URL` | `https://app.ialimp.es` |
| `SIVRA_URL` | URL de sivra — **ya NO se usa en runtime** (Fase 1 retirada de sivra, 21/06/2026). Env muerta; se conserva porque `apps/sivra` sigue viva como web pública. |
| `OPERADOR_SHARED_SECRET` | Secreto compartido para el puerto del god-panel ↔ ia-rest (MISMO valor en el proyecto Vercel `ia-rest`). Sin él, el panel no ve los clientes de ia-rest (ialimp+sivra sí). |
| `RRHH_URL` | URL de producción de central-rrhh (`https://central-rrhh.vercel.app`) — para `lib/adapters/rrhh.ts`. |
| `RRHH_OPERADOR_SECRET` | Secreto del puerto god-panel ↔ **iarrhh** (MISMO valor en el proyecto Vercel `central-rrhh`). **PROPIO de iarrhh, distinto del `OPERADOR_SHARED_SECRET` de ia-rest — NO reutilizar el mismo env (rompería ia-rest).** |
| `GMAIL_USER` | Email de la cuenta Gmail donde llegan las facturas de proveedores (necesario para `lib/agente-facturas/pagos.ts`). |
| `GMAIL_APP_PASSWORD` | App password de Gmail para IMAP (no la contraseña de la cuenta). |
| `FACTURAS_CUENTA_ID` | (Opcional) Cuenta dueña del buzón `GMAIL_USER` para el cron `facturas-scan`. El buzón es de UNA cuenta; sin esto se resuelve por `email==GMAIL_USER` y, si no, por la única cuenta real. Evita que las facturas del Gmail se dupliquen en otros tenants (bug 14/07/2026: la suscripción de Claude de Alberto caía en la cuenta seed-demo). Ver `lib/agente-facturas/cuenta-buzon.ts`. |
| `EB_PIS_ENABLED` | `true` activa el flujo Enable Banking PIS. Dejar vacío/omitido para usar el fallback SEPA XML pain.001. **Pendiente confirmar tier gratuito Enable Banking.** |
| `EB_DEBTOR_IBAN` | IBAN de Kutxabank desde el que se debitan los pagos PIS. |
| `NVIDIA_API_KEY` | LLM primario de la pasarela de IA (`/api/ai/*`) y de concursos (NIM, gratis). |
| `GEMINI_API_KEY` | **🚨 GEMINI APAGADO POR DEFECTO EN TODO (01-02/08/2026)** — la key lleva desde el 16/06 con **429 de cuota permanente** (544 llamadas/30 días, 0 éxitos; Check 12 del health-check) y solo pagaba timeouts antes de caer a OpenRouter. Decisión de Alberto: «usa OpenRouter». Dos gates para reactivar cuando haya key con cuota: **`GEMINI_WEBSEARCH=1`** reengancha el grounding como primario en `lib/websearch.ts::buscarWeb` (si no, la búsqueda — `/api/ai/search`, cron `eventos/websearch`, `seo-refresh` — va directa al **plugin `web` de OpenRouter**, ~0,02€/llamada, respeta presupuesto diario, tarifa override `AI_PRECIO_WEBPLUGIN_EUR`); **`GEMINI_TEXTO=1`** reengancha el eslabón de texto en la cadena clásica de `aiComplete` (`@central/core-ai`) y el último intento de `lib/pasarela.ts`. La key sigue usada por los embeddings de la caché semántica (`IA_CACHE_SEMANTICA`, best-effort). Override de modelo texto: `GEMINI_BRAIN_MODEL`. |
| `GROQ_API_KEY` | **Fallback de texto gratis de la pasarela** (NIM → **Groq** `openai/gpt-oss-120b`, gratis rate-limited) en `aiComplete`/`aiTools`. Sin ella el fallback queda inactivo (no rompe). Override de modelo: `GROQ_BRAIN_MODEL`. |
| `CEREBRAS_API_KEY` | **4º fallback de texto gratis** (27/07/2026, entre Groq y Gemini en `aiComplete`): **Cerebras** `gpt-oss-120b`, infra WSE independiente de NIM/Groq (1M tok/día gratis, contexto 8192 tok en tier gratis). Sin ella queda inactivo (no rompe) — hoy INACTIVA, pendiente de que Alberto decida activarla. Override de modelo: `CEREBRAS_MODEL`. |
| `MOONSHOT_API_KEY` | **Último fallback de texto** (… → **Kimi**/Moonshot, de pago) en `aiComplete`. Sin ella queda inactivo (no rompe). Opcionales: `MOONSHOT_MODEL` (default `kimi-k2.6`), `MOONSHOT_BASE_URL` (usa `.cn` si aplica). |
| `OPENROUTER_API_KEY` | **Camino PRIMARIO de la pasarela** (09/07/2026): agregador OpenRouter con el **Agente Director** eligiendo modelo por petición + fallback nativo entre modelos. Sin ella todo queda como antes (cadena gratis NIM→Groq→Cerebras→Gemini→Kimi). Opcionales: `OPENROUTER_MODEL` (default `deepseek/deepseek-chat`), `OPENROUTER_FALLBACK_MODELS` (csv de suplentes), `OPENROUTER_BASE_URL`, `OPENROUTER_REFERER`/`OPENROUTER_TITLE` (atribución). |
| `DIRECTOR_MODO` | **🟢 En producción `activo` desde el 10/07/2026** (la semana de sombra se acortó a 1 día por decisión de Alberto). `sombra` (el Director decide y se REGISTRA en `ai_usos` pero se sirve con el modelo por defecto) · `activo` (enruta de verdad). Opcionales: `DIRECTOR_MODEL` (modelo barato que decide, default `deepseek/deepseek-chat`), `DIRECTOR_USAR_FLOOR` (`false` desactiva el sufijo `:floor` = proveedor más barato), `DIRECTOR_MAX_PRECIO_OUT` (techo USD/M del cron, default 20). **Guardas en memoria (12/07/2026):** `DIRECTOR_BREAKER_FALLOS` (default 3) fallos SEGUIDOS del hop → se sirve default directo durante `DIRECTOR_BREAKER_PAUSA_MIN` (default 5) min sin pagar el timeout de 4s por petición (se marca `[breaker abierto]` en `ai_usos.error`); `DIRECTOR_DECISION_TTL_MIN` (default 5, `0`=off) memoiza la decisión por forma de petición (app+system+tamaño+versión de catálogo+degradado) — el tráfico repetitivo no paga el hop cada vez. |
| `DIRECTOR_PRESUPUESTO_UMBRAL` | Degradación GRADUAL del Director por presupuesto (09/07/2026): al superar este ratio del límite diario (gasto de hoy/límite, máx entre global/app/cliente) el Director elige SOLO modelos baratos ANTES del bloqueo duro al 100%. Default `0.8`. Techo de "barato" en `DIRECTOR_PRESUPUESTO_PRECIO_OUT` (USD/M salida, default `1.0`). El filtro (`lib/director-modelos.ts::modelosPermitidos`) también enruta por contexto real de la petición y, si el caller marca datos sensibles, prefiere modelos `eu` (RGPD) cuando el catálogo los ofrece. |
| `DIRECTOR_APRENDIZAJE_DIAS` | Bucle de aprendizaje del cron `ia-director-refresh` (F4): ventana en días del rendimiento real por modelo desde `ai_usos` (default `7`). Un modelo con mala racha se PENALIZA (se descarta del catálogo nuevo) si `error_rate ≥ DIRECTOR_MAX_ERROR_RATE` (default `0.3`) o `ms_medio ≥ DIRECTOR_MAX_MS` (default `20000`), con muestra `≥ DIRECTOR_MIN_LLAMADAS` (default `20`). Snapshot histórico en la tabla `ia_director_aprendizaje`. Determinista; avisa por Telegram si penaliza un preferido. |
| `AI_GATEWAY_LIMITE_DIARIO_EUR` | Presupuesto DIARIO en € de la pasarela (default **1**; `0` = sin límite). Al cruzarlo se bloquea SOLO el camino de pago (OpenRouter/Kimi) — la cadena gratis sigue sirviendo — y avisa por Telegram 1x/día. Límites específicos por vertical/cliente en la tabla `ia_presupuestos` (`ambito` `app`/`cliente`); atribución por cliente vía `cliente` en el body → `ai_usos.cliente_ref` (base de refacturación, panel `/operador/ia`). `AI_USD_EUR` (default 0.9) convierte el coste real del catálogo. |
| `AI_CREDITOS_UMBRAL` | Umbral en $ de créditos OpenRouter restantes bajo el cual el cron semanal `ia-director-refresh` avisa por Telegram (default 5). |
| `IA_CACHE_SEMANTICA` | `1` activa la caché semántica pgvector de la pasarela (default APAGADA). Además el caller debe mandar `cache:{ambito,ttlHoras?}` (opt-in doble; nunca cachear datos vivos). Umbral `IA_CACHE_UMBRAL` (default 0.97). Embeddings con `GEMINI_API_KEY` (text-embedding-004). |
| `CONTABLE_MODEL` | Modelo que RAZONA en el **agente contable** cuando no hay respuesta determinista (`lib/contable/cerebro.ts`). Default `deepseek-ai/deepseek-v4-flash-0731` (NIM, gratis con `NVIDIA_API_KEY`; el anterior `deepseek-v3` fue retirado del API de NIM — verificado 17/08/2026 contra `/v1/models`). Vacío `''` = default de la pasarela. Un id erróneo NO rompe (cae a Groq→Kimi). Para el chat, usar modelo RÁPIDO (no R1) para no agotar el timeout. |
| `TELEGRAM_BOT_TOKEN` | Bot único del monorepo (`@central/core-telegram`). Avisos automáticos, agente huéspedes SIVRA, agente pago de facturas. **Fuente única del token para todo el monorepo** — las rutinas de Claude Code no lo duplican; llaman a `/api/internal/alerta` con `ALERTA_TOKEN` (token dedicado; el endpoint acepta `CRON_SECRET` solo por compat). |
| `TELEGRAM_CHAT_ID` | Chat ID de Alberto donde llegan los avisos del bot. Par obligatorio de `TELEGRAM_BOT_TOKEN`. |
| `TELEGRAM_WEBHOOK_SECRET` | Valida que los callbacks de Telegram llegan del servidor de Telegram (no de terceros). |
| `CRON_SECRET` | **Llave maestra** que autentica los crons de Vercel y las llamadas servidor→servidor. **NO ponerla en prompts de rutinas** (ver `ALERTA_TOKEN`). El endpoint `/api/internal/alerta` la sigue aceptando solo por compatibilidad. |
| `ALERTA_TOKEN` | Token **dedicado** de bajo privilegio: SOLO abre `/api/internal/alerta` (aviso Telegram de las rutinas de Claude Code). Es el que va en el prompt de las rutinas — si se filtra, solo permite mandar un Telegram. Si no está definido, el endpoint acepta `CRON_SECRET` (compat). |
| `EINFORMA_CLIENT_ID` / `EINFORMA_CLIENT_SECRET` | **PENDIENTE (Alberto contrata eInforma).** Credenciales OAuth2 client_credentials de la API de eInforma para el **enriquecimiento de «Empresas en dificultad»** (`lib/empresas-einforma.ts`: informe financiero → patrimonio neto, EBITDA, fondo de maniobra, deuda, CNAE, facturación, incidencias RAI/ASNEF). Sin ellas el enriquecimiento degrada con aviso «pendiente de contratar», no rompe. Opcional `EINFORMA_BASE_URL` (default `https://api.einforma.com`). ⚠️ Al activar, CONFIRMAR las rutas/campos del payload marcados en `empresas-einforma.ts` contra la doc/sandbox. |
| `IDEALISTA_API_KEY` / `IDEALISTA_API_SECRET` | **PENDIENTE (Idealista debe aprobar el alta — solicitada el 30/07/2026).** Credenciales OAuth2 client_credentials de la **API oficial de Idealista** (developers.idealista.com, tramo gratuito ~100 búsquedas/mes) para la ingesta directa de comparables por zona vigilada (`lib/subastas/idealista-api.ts`, paso del cron `subastas-mercado`). Sin ellas la ingesta API queda **inerte** (el corpus sigue nutriéndose de las alertas de correo). Editables desde el god-panel → 🔑 Secretos. Presupuesto vigilado en la tabla `idealista_api_usos` (margen mensual 15, caché 30 días/zona). |
| `EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR` | Tope de gasto mensual € del enriquecimiento de empresas (default `50`; `0` = sin límite). Se compara contra la suma del ledger `empresas_enriquecimiento_coste` del mes. `EMPRESAS_ENRIQUECER_COSTE_EUR` = coste estimado por empresa (default `12`, ~precio del informe financiero en pack). |
| _(Acceso invitado «Empresas»)_ | **NO es una env.** El token de acceso invitado (Pablo prueba el módulo sin cuenta) vive en la **tabla BD `empresas_acceso_token`** (fila única `id=1`, `token`/`activo`), para poder **rotarlo/revocarlo sin redeploy** (el conector de Vercel no deja escribir envs desde las sesiones de Claude). Enlace: `…/invitado/empresas?token=<valor>` → la página lo canjea en `/api/empresas/invitado` (fija cookie httpOnly `empresas_invitado`) → `lib/empresas-acceso.ts::accesoEmpresas` valida la cookie contra la BD (runtime Node; el middleware edge solo enruta por presencia de cookie). Acepta sesión O token en `/api/empresas/*` **salvo enriquecimiento (POST) e ingesta-manual, que son SOLO sesión**. El invitado no ve «Enriquecer» ni «Actualizar BORME». **Revocar/rotar:** `UPDATE empresas_acceso_token SET token='…'` o `activo=false` (por Supabase MCP). |
| _(Acceso invitado «Laboratorio de inversión» — 20/07/2026)_ | **NO es una env**, mismo patrón que el de Empresas. Token en la tabla BD **`trading_acceso_token`** (fila única `id=1`, `prisma/sql/2026-07-20_trading_acceso_token.sql`). Enlace: `…/invitado/trading?token=<valor>` → lo canjea `/api/trading/invitado` (fija cookie httpOnly `trading_invitado`, 30 días) → `lib/trading-acceso.ts::accesoTrading` valida contra la BD. `/trading` es 100% LECTURA (sin ninguna acción que escriba), así que la vista de invitado reutiliza tal cual `app/(usuario)/trading/TradingDashboard.tsx` (extraído de `page.tsx` para no duplicar) — el invitado ve exactamente lo mismo que Alberto, sin acceso al resto de la plataforma (banca, fiscal, etc. — fuera del grupo `(usuario)`, sin sidebar). `/invitado/*` y `/api/trading/*` ya estaban exentos del gate de sesión en `middleware.ts` (no requirió tocarlo). **Revocar/rotar:** `UPDATE trading_acceso_token SET token='…'` o `activo=false` (por Supabase MCP). |
| _(Acceso invitado «Intranet de limpieza» — 29/08/2026)_ | **NO es una env**, mismo patrón que Empresas/Trading. Token en la tabla BD **`limpieza_acceso_token`** (fila única `id=1`, `prisma/sql/2026-08-29_limpieza_intranet.sql`, aplicada + token sembrado). Es la pantalla de **Vanesa** (Vanessa Cruz = **Sique Brilla SL**; son la MISMA, no dos actores) y
desde el 01/09/2026 es su **ÚNICO** acceso: se le retiró el de ialimp, que se queda como producto a
vender, no como su herramienta. 🚨 **Todo lo que ella tenga que hacer aparece AQUÍ o no existe** —
el email a `limpiezascruzz@gmail.com` y la ficha de `/sivra/mensajes` no los abre (ver
`sivra_ordenes_limpieza.tarea_id`). Cómo funciona: `…/invitado/limpieza?token=<valor>` → lo canjea `/api/sivra/limpieza-intranet/invitado` (cookie httpOnly `limpieza_invitado`, 180 días) → `lib/limpieza-acceso.ts::accesoLimpieza` valida contra BD (acepta también sesión = preview de Alberto). Ve calendario de reservas de los 4 slugs (`incomes`: ocupación + aforo `adults+children`, **NULL = «no se sabe», no 0**; SIN nombres ni importes), limpiezas (`cleaning_sessions` de los 4 slugs, con `nota_propietario` 📌) y **tareas sueltas** (`limpieza_tareas`; solo puede marcar `hecha`). El CRUD de tareas y el enlace con token viven en la pestaña **«Tareas»** de `/sivra/limpiadoras` (sesión). **Revocar/rotar:** `UPDATE limpieza_acceso_token SET token='…'` o `activo=false` (por Supabase MCP). |

> **Sobre la "BD unificada" de ia-rest:** la unificación quedó **a medias**. El schema
> El schema `iarest` de la BD compartida ES la producción de ia-rest (runtime POS, Edge Functions
> y crons) desde el cierre del 19/08/2026; el proyecto Supabase viejo (`efncqyvhniaxsirhdxaa`)
> fue borrado ese mismo día. Aun así, plataforma **NO** lee ia-rest por Prisma sobre `iarest.*`,
> sino por el **puerto HTTP** (ver abajo) — patrón de aislamiento entre apps.
> `IAREST_SUPABASE_URL` / `IAREST_SUPABASE_SERVICE_KEY` ya no se usan en plataforma.

## 💶 Un solo hub financiero (02/09/2026, PR #2083)
`/finanzas` **ya no es un hub**: es un redirect a `/banca?tab=ingresos`. Los dos coexistían y su pestaña
«Categorías» montaba `finanzas/CategoriasTab.tsx`, **el mismo fichero** que el segmento Personal de `/banca`.
Lo que NO era duplicado —los banners de salud de extracción, ayudas y novedad fiscal, y los KPIs propios— se
trajo entero: `FinanzasClient` se monta en `/banca` con el prop `embebido` (sin su `<main>`, que ya lo pone
`<Pagina>`) y perdió su sistema de pestañas.

Segmentos de `/banca`: **Dinero · Ingresos · Negocios · Fiscal · Personal** (`banca/SegTabs.tsx`).

⚠️ Las páginas hijas **siguen donde estaban**: `/finanzas/gastos`, `/finanzas/fiscal`, `/finanzas/pilar` y
`/finanzas/tarjeta-credito` son rutas vivas, solo que ya no cuelgan de un hub. No las borres al ver que su
padre redirige.

## Root Directory en Vercel
`apps/plataforma` — install `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.

### 👁 Ver una preview de ESTA app antes de mergear (02/09/2026)
El `ignoreCommand` de esta app lleva `--sin-previews`, así que **una rama de PR NO construye nada**: el CI
dice que compila, no cómo queda. Para un cambio que altera el ASPECTO —y aquí eso pasa a menudo: la
migración de las 43 cabeceras a `PageHeader` cambió el tamaño del título en toda la app— hay que forzarla,
o esas pantallas se ven por primera vez en producción.

Se fuerza con `[preview]` en el asunto del commit, pero **el marcador solo no basta: hacen falta DOS cosas
a la vez** (fallaron las dos, una detrás de otra, en el PR #2054):
1. Va en el asunto del **ÚLTIMO** commit del push (el script lee `VERCEL_GIT_COMMIT_MESSAGE`, que es el HEAD
   empujado). Si después añades commits, el marcador se pierde.
2. **Ese mismo commit tiene que tocar `apps/plataforma/`** (o un `packages/*` que esta app declare, o un
   manifiesto raíz). `[preview]` levanta el veto de `--sin-previews`, pero el filtro por rutas del script
   salta el build igual. Un commit que solo toca un `.md` de la raíz NO construye, lleve marcador o no.

Y **compruébalo**: el fallo se ve idéntico a un build legítimamente ignorado
(`Vercel – plataforma: Canceled by Ignored Build Step` en los statuses del PR). Detalle completo en el
`CLAUDE.md` de la raíz, sección del `ignoreCommand`.

## ⏰ Crons — dispatcher único (30/07/2026)
**Vercel Pro admite 40 crons/proyecto y este llegó a 60 → el scheduler omitía disparos en silencio**
(29/07/2026: `psd2-sync` de las 06:00 sin log alguno; auditoría PR #1162). Desde entonces `vercel.json`
declara **UN solo cron**: `/api/cron/dispatch` cada minuto.
- **Fuente de verdad de qué corre y cuándo: `lib/cron-dispatch.ts` (`CRON_JOBS`, horarios UTC).**
  🚨 Un cron nuevo se añade AHÍ, **nunca** a `vercel.json` (volvería a acercarnos al límite). Las menciones
  históricas "cron X en `vercel.json`" de este doc y de las skills se leen ahora como "job X en el manifiesto".
- El dispatcher (`app/api/cron/dispatch/route.ts`) dispara los jobs del minuto por HTTP con
  `Authorization: Bearer CRON_SECRET` — el MISMO header que adjuntaba Vercel, así que los handlers
  (`isCronAuthorized`) y el pass-through del middleware funcionan sin cambios.
- **Catch-up:** cursor `cron_dispatch_cursor` (fila única; `prisma/sql/2026-07-30_cron_dispatch_cursor.sql`,
  aplicada) — si el scheduler se salta un minuto, la pasada siguiente procesa la ventana pendiente (tope
  15 min) y un claim `FOR UPDATE` evita el doble disparo. Sin la tabla degrada al minuto actual.
- Envs: base URL = `VERCEL_PROJECT_PRODUCTION_URL` (auto de Vercel); override opcional `CRON_DISPATCH_BASE_URL`.
- Trade-off asumido: el dispatcher es un punto único — si muere, TODOS los crons enmudecen. Red de
  seguridad: el heartbeat de `/auditoria-diaria` (paso 2-bis) lo cazaría en la primera pasada (frescura en BD).

## Estado (15/06/2026) — PANEL UNIFICADO (PR #249 MERGED)
- [x] Tablas `cuentas/sociedades/negocios` aplicadas en Supabase.
- [x] Shell: login + dashboard con tarjetas por negocio.
- [x] **Registro de cuenta por UI** (`/register` → `POST /api/auth/register`, auto-login).
- [x] **CRUD sociedad/negocio por UI** (crear/editar/eliminar, scoped por `cuenta_id`).
- [x] **Resumen financiero real** por negocio (HITO 3): ialimp (`v_contab_pyg`) + sivra (`incomes`/`gastos`).
- [x] **ia-rest financiero (HITO 3)**: se lee **en vivo por el puerto HTTP** de ia-rest.
- [x] **Panel unificado (PR #249):** un solo shell `app/(usuario)/` con sidebar condicional:
  - *Mi negocio* (siempre): Resumen · Banca · 🏨 Apartamentos (`/apartamentos`) · 🧹 Limpiezas (`/limpiezas`) · 💬 Comunicación
  - *Operador* (solo superadmin): 🏢 Clientes (`/operador/clientes`) · 🍽️ ia-rest (`/operador/iarest`) · 🗺️ Estructura (`/operador/estructura`)
- [x] **Auth unificado:** un login emite ambas cookies. `findActiveAdminByEmail()` en `lib/superadmin.ts`.
- [x] **Conciliación corregida:** `candidatosSivra()` lee `gastos` (71 filas) en vez de `expenses` (34, congelada). Recupera €5.670.
- [x] **PWA:** `public/manifest.json` + `public/icon.svg`.
- [x] **Command palette Cmd/Ctrl+K:** `CommandPalette.tsx`.
- [x] **Strip "Hoy" en dashboard.**
- [x] **Detalle apartamento (PR #255):** `lib/propiedades.ts` enriquecida (ocupación %, ADR, top portal) + nueva `getApartamentoDetalle(id)`. Ruta `/apartamentos/[id]` con 8 KPIs, gap detector, break-even, mix portales, histórico 12 meses, gastos por categoría (incl. SEGURO) + gastos compartidos + últimas 20 reservas.
- [x] **`/admin` → redirect `/operador/clientes`** (PR #332, merged).
- [x] **Panel ia-rest/super (Fase 5 COMPLETA — PR #333–#336):** `/operador/iarest/cobros` · `/operador/iarest/soporte` · `/operador/iarest/sugerencias` · `/operador/iarest/suscripciones` · `/operador/iarest/restaurantes` · `/operador/iarest/crecimiento` · `/operador/iarest/sistema` · `/operador/iarest/crm`. `iarest.es/super` absorbido al 100% en modo read-only. Escrituras siguen en el panel legacy.
- [x] **Módulo `/finanzas` (PR #341):** Hub financiero consolidado. Correduría (BBVA, persona física) + 4 pisos turísticos (propios: amortización 3%; subarrendados: alquiler deducible) + gastos personales BBVA (Alberto solo) / Kutxa (familiar compartida). Base imponible IRPF 2025 con tramos, declaración conjunta, reducción €3.400. Export CSV gestoría. Filtros año/trimestre. (El tracker Modelo 179 se eliminó el 03/07/2026, PR #698: el 179 lo presentan las plataformas intermediarias, no el propietario.) Sidebar: "💶 Finanzas" 2º ítem Mi negocio.
- [x] **Segmentación de gasto personal — pestaña `📊 Categorías` (05/07/2026):** vive en `/finanzas?tab=categorias` (`CategoriasTab.tsx`) y ahora tiene **acceso propio en la sidebar** (📊 Categorías, entre Gastos y Fiscal — antes solo se llegaba escribiendo la URL). Segmenta el gasto personal por `subcategoria` (columna de `movimientos_bancarios`, eje distinto de `categoria`/PGC): dona + tabla + drill-down por comercio + alertas de presupuesto mensual (`categoria_alertas`, avisos Telegram) + insights IA + resumen semanal. **Editable en sitio:** desplegable por comercio que reasigna TODOS sus movimientos y **aprende regla** (`banca_destino_reglas`), drill-down a movimientos sueltos con override por movimiento, y panel clicable de "sin categoría" para asignar a mano. `POST /api/finanzas/categorias/asignar` (comerciante|movId, scoped `cuenta_id`) + `GET .../movimientos`. **Fuente ÚNICA de subcategorías: `lib/categorias-personales.ts`** (puro, testeado) — antes había 3 listas divergentes y la auto-clasificación no podía poner `seguro`/`suministros_piso` ni emitía `otros_gasto`; ahora la consumen la IA (`categoria-ia.ts`), la auto-clasificación (`auto-tag`) y la UI. **Auto-clasificar = DETERMINISTA primero, IA después (06/07/2026):** `auto-tag/route.ts` clasifica los gastos obvios por palabra clave con `lib/subcategoria-keywords.ts` (puro, testeado: Mercadona/DIA/bares/gasolineras/farmacias/Netflix/Iberdrola/DIGI…) SIN llamar a la IA —así funciona aunque la pasarela esté saturada (429/timeout)— y aprende regla en `banca_destino_reglas`; solo los ambiguos van a la IA en lotes (`maxDuration=60`, presupuesto de tiempo, éxito parcial 200 si el determinista etiquetó algo, 502 solo si nada se pudo). **El auto-tag coge `(subcategoria IS NULL OR ='otros_gasto')`** (no solo NULL): el paso determinista RECLASIFICA lo que quedó en el cajón `otros_gasto` de pasadas antiguas y en realidad era super/bar/etc (sin reescrituras no-op; regla solo en descubrimientos NULL). **El gráfico/tabla (`/api/finanzas/categorias`) filtra `destino='personal' AND importe<0`** — es análisis de gasto PERSONAL de consumo, NO negocio: sin ese filtro se colaban traspasos internos (`TARJ.CRDTO`), turistico_*/seguros e ingresos. (Actualizado 06/07/2026: ver bullet siguiente — la categorización pasó a ser AUTOMÁTICA, `categoria-ia.ts` se eliminó y las alertas ya filtran por `cuenta_id`.)

- [x] **Categorización AUTOMÁTICA de gasto personal (06/07/2026, rama `claude/ia-categorization-issue-6a534b`):** Alberto "la IA no categoriza" — casi todo caía en "Otros gasto". **Causa raíz:** la ingesta no ponía subcategoría (todo NULL) y el `auto-tag` mandaba a la IA **solo los NULL**, así que un `otros_gasto` ambiguo se quedaba en el cajón para siempre (y su botón estaba escondido). **Fix:** función ÚNICA **`lib/subcategoria-barrido.ts`** `barrerSubcategoriasPersonal(cuentaId?)` — keyword primero (gratis) + IA de la **pasarela GRATIS** (`@central/core-ai`, NIM→Groq→Gemini→Kimi) solo para lo ambiguo, cogiendo `subcategoria IS NULL OR ='otros_gasto'` (**rescata el cajón**, la diferencia clave). La consumen: la **ingesta** (`analizarMovimientos` reparte por keyword al importar, sin pisar reglas/Pilar por COALESCE), el **cron diario** `categorizar-movimientos` (`0 7 * * *`) y el botón `auto-tag` (wrapper). **Se retiró la vía Anthropic de pago:** `lib/categoria-ia.ts` ELIMINADO; `normalizarContraparte` vive en `lib/normalizar-contraparte.ts` (puro). **Baja confianza → nueva columna `movimientos_bancarios.subcategoria_revisar`** (NO reutilizar `requiere_revision`, que es del *destino*) → panel "🔎 Por revisar" en la pestaña (`?revisar=1`). **Taxonomía Vivienda (Montecarmelo):** nuevas subcategorías `comunidad`/`ibi` + `GRUPO_VIVIENDA` (hipoteca+comunidad+ibi+suministros) agrupadas bajo "🏠 Vivienda". **Extras:** panel "sin clasificar más grandes" (`?orden=importe`), badge ±% mes vs media 6m (`comparativa` en `/api/finanzas/categorias`), y presupuestos con aviso Telegram **scoped por `cuenta_id`** (`categoria_alertas(_log).cuenta_id`, migración `2026-07-06_subcategoria_control.sql`; dedup mensual; aviso proactivo desde el barrido). Prueba real: de 720 gastos atascados, keyword rescata 358 (50%) gratis; el resto a la IA.

- [x] **Reestructura "💸 En qué gasto" + 2 bugs del drill-down (07/07/2026, misma rama):** revisión de
  arquitectura (agente) con el norte "ver dónde gasto en el día a día". **Bug #1:** el drill-down de un comercio
  no filtraba por subcategoría → `movimientos/route.ts` acepta `?categoria=` y `fetchMovsComercio` lo pasa
  (cuadra el "N ops"). **Bug #2:** 'Sin identificar' colapsaba comercios distintos → nuevo `lib/comercio.ts::comercioDe`
  (quita el prefijo "COMPRA EN…"; **fusiona filas con y sin contraparte** del mismo comercio; en prod la
  contraparte trae el texto completo, no un nombre limpio, y `claveComercio` lo partía + elegía mal 'SEVILLA'
  para DIA). `getMerchantsForCategoria` agrupa en JS por `comercioDe`; `movimientos`/`asignar` casan igual.
  **UI (`CategoriasTab.tsx`):** titular del mes (total + ±% vs media 6m, nuevo `comparativaTotal`); **UNA** cola
  "🔎 Necesitan tu atención" (`?atencion=1`: NULL/otros_gasto O `subcategoria_revisar`, backlog por importe,
  plegada) que fusiona los 3 paneles antiguos; orden período→titular→cola→dona→categorías(Vivienda)→comercios;
  insights/alertas al fondo; **quitada la tabla de Ingresos**. **Sidebar:** 📊 Categorías → 💸 "En qué gasto"
  (tras Banca); 🧾 Gastos → "Deducciones". Tests 97/97, tsc 0, build OK.
- [x] **📊 Radiografía financiera unificada (`/finanzas/radiografia`) — PRs #809/#813 (10/07/2026):** UNA
  pantalla para ver la foto financiera completa de un periodo, contra la dispersión de ~10 pantallas de dinero.
  **Selector de intervalo ÚNICO compartido** (`app/(usuario)/finanzas/IntervaloSelector.tsx`: mes/trimestre/rango
  libre, estado en la URL `?year=&quarter=` o `?desde=&hasta=`; por defecto el MES EN CURSO). **Cabecera fija**
  (Ingresos · Gasto total con Δ vs año anterior · Resultado · reparto Negocio/Personal) + **bandeja "🔎 sin
  identificar"** arriba (enlaza a `/finanzas/gastos`). **3 lentes** sobre el mismo intervalo:
  - **🏠 Personal** — separa **BBVA (100% de Alberto) vs Kutxabank (familiar)**; cada bloque enlaza a su detalle
    filtrado `/finanzas?tab=categorias&banco=bbva|familiar`. El filtro por cuenta llega al detalle vía el helper
    puro **`bancoCond(banco)`** de `lib/finanzas.ts`, inyectado en las 3 rutas `/api/finanzas/categorias{,/comerciantes,/movimientos}`.
  - **🏢 Negocios** — resumen correduría + pisos con enlaces a `/correduria` y `/apartamentos`. *(P&L por piso +
    reclasificación inline = PENDIENTE, Fase 2.)*
  - **🧾 Fiscal** — **«Mi declaración» embebida** (fusiona Fiscal + Proyección, #813): 📍 Hoy / 🔮 Fin de año ·
    👤 Solo yo / 🤝 Conjunta con Pilar + palanca de gasto + barra de tramos IRPF. Reutiliza
    `lib/comparativa-declaracion.ts::calcularEstadoDeclaracion` (mismo motor que `/finanzas/fiscal`), calculado en
    SSR y en `try/catch` (degrada sin romper). **El bloque fiscal es SIEMPRE del año completo** (la declaración es
    anual): si el intervalo ya es el año fiscal reutiliza el `resumen`, si no calcula un `resumenAnual` aparte —
    corrige el bug de mostrar la base imponible del mes.
  - **Capa de datos:** `getResumenFinanciero`/`getResumenPilar` aceptan `desde?/hasta?` (rango libre corta
    `mesRange`); helper `shiftYearStr` para la comparativa del año anterior. **Aprendizaje sin cambios** (reusa
    `banca_destino_reglas` vía `/api/banca/destino` y `/api/finanzas/categorias/asignar`).
  - **Menú (des-duplicación, Fase 4 iniciada):** `UserSidebar.tsx` retiró las 4 entradas fiscales sueltas (En qué
    gasto / Deducciones / Fiscal / Proyección) → la Radiografía es la puerta única; el detalle cuelga de sus lentes.
    Páginas antiguas NO borradas (reversible). **⚠️ ACTUALIZADO 18/07/2026:** la Radiografía pasó a REDIRIGIR a
    `/banca` (#900) y `/banca` no tenía lente fiscal → la previsión de renta quedó sin acceso. Restaurada como
    **tercer segmento `🧾 Fiscal`** del Inicio (`banca/SegTabs.tsx` + `banca/FiscalResumen.tsx`, `tab==='fiscal'`
    en `banca/page.tsx`, PR #975). La puerta fiscal ES el segmento 🧾 Fiscal de `/banca` (no la Radiografía, que
    solo redirige). **PENDIENTE:** eliminar `TRAMOS_IRPF` hardcodeados de
    `proyeccion/ProyeccionClient.tsx` y retirar la página `proyeccion` (ya duplicada por la lente Fiscal); absorber
    `/finanzas/tarjeta-credito` en Personal; deltas de ingresos/resultado (hoy solo el gasto total lleva Δ).
- [x] **Fases 1–3 sivra COMPLETAS:** `/sivra/income` · `/sivra/expenses` · `/sivra/gastos-fijos` · `/sivra/fiscal` · `/sivra/calendario` · `/sivra/inversion` · `/sivra/seo` · `/sivra/mensajes` (Smoobu+AI) · `/sivra/mercado` · `/sivra/pricing` · `/sivra/pricing-auto` + todos sus APIs. Todas ya existían en plataforma.
- [x] **Fase 6 — RR.HH. admin (17/06/2026):** `/operador/rrhh/empleados` + `/operador/rrhh/solicitudes`. Read-only desde `rrhh.*` schema (BD compartida, raw SQL). Sidebar: sección "RR.HH." en NAV_OPERADOR con sub-items Empleados/Solicitudes. `lib/rrhh-operador.ts` con `getEmpleadosRrhh()` + `getSolicitudesRrhh()`.
- [x] **Fase 4 — Admin limpiadoras (17/06/2026):** `/sivra/limpiadoras` (10 tabs: Hoy, Semana, Limpiadoras, Disponibilidad, Proveedores, Stock, Lencería, Checklists, Informes, Facturación). 13 API routes en `/api/sivra/limpiadoras/*`. Auth `getSession()`. BD raw SQL vía prisma.$queryRaw sin tocar RLS ni ialimp.
- [x] **Migración crons sivra → plataforma (17/06/2026):** 7 crons migrados a `vercel.json`. Smoobu sync (`/api/sivra/updates/sync`), auto-sessions limpiadoras, auto-assign, alerta-ventana, rates/snapshot, mensajes/auto-reply, resumen-semanal. Libs añadidas: `@central/core-email` (package.json + transpilePackages), `lib/cron-auth.ts`, `lib/pricing-calendar.ts`.
- [x] **Fix banca — ingresos correduría (PR #384, 18/06/2026):** Nuevo `lib/destino.ts` (puro, testeable): en ABONOS recibidos el banco rotula la contraparte con el TITULAR (Norma 43), así que la regla anterior 'titular ⇒ traspaso_interno' ocultaba ~€10.026 de comisiones de seguros del P&L. Ahora los ABONOS se clasifican por CONCEPTO (`LIQ.COMISIONES`/aseguradoras ⇒ `seguros`; pensión/nómina/Bizum ⇒ `personal`). CARGOS sin cambio. `lib/categorizar.ts` reexporta. 7 tests `node --test` en `lib/destino.test.ts`. SQL de reclasificación aplicado a BD compartida.
- [x] **Control de facturas (PR #385, 18/06/2026):** Página `/sivra/facturas-control` (🗂️ Facturas en sidebar Mis pisos). Estado por proveedor/mes: ✅ En Drive / ⏳ En plazo / ❌ Falta. 17 proveedores recurrentes (mensual/bimestral_impar/anual_marzo) en `lib/sivra/facturas-control.ts`. API `GET/POST /api/sivra/facturas-control` (sube PDF vía Apps Script → Drive → `facturas_drive`). Alerta `facturasFaltantes` del mes anterior inyectada en `getAlertas(lib/banca.ts)` → banner en `/dashboard`.
- [x] **Correduría + aprendizaje de clasificación (PRs #435/#437/#439/#441/#444, 22/06/2026):** Página `/correduria` (matriz comisiones por compañía×mes desde `movimientos_bancarios` `destino='seguros'`). `lib/correduria.ts` puro (`detectarCompania`, `motivoSeguros`, `claveReferencia`, `COMPANIAS_CONOCIDAS`). Importe `1.543€`, celdas clicables → desglose (`/api/correduria/detalle`) con confirmar/reclasificar. **Aprendizaje por "clave de referencia"** (código del concepto: M1454, M00171, DNI…): tablas `correduria_reglas (cuenta_id,clave,compania)` y `banca_destino_reglas (cuenta_id,clave,destino)` en BD compartida — al asignar compañía o sacar de seguros se aprende y se aplica a los iguales (pasados/futuros); `lib/categorizar.ts` consulta `banca_destino_reglas` al ingestar. Override por movimiento: `movimientos_bancarios.compania_seguros`. **La correduría (`destino='seguros'`) es SIEMPRE BBVA (23/06/2026):** `lib/destino.ts` solo asigna `seguros` en BBVA. Un recibo de aseguradora (Generali/Occident/Liberty…) en Kutxa/otros es el seguro PROPIO (coche/hogar) → `personal` (o `turistico_pisos` si es de un piso). SQL `prisma/sql/2026-06-23_seguros_solo_bbva.sql`.

- [x] **🚨 LANDMINE — reglas aprendidas `banca_destino_reglas` NUNCA con clave genérica (12/07/2026, PR #840):** las reglas clave→destino se aplican **por SUBSTRING del concepto y con PRIORIDAD sobre `lib/destino.ts`** (`categorizar.ts::analizarMovimientos`). Una clave genérica es catastrófica: la regla-trampa **`"TRANSF" → turistico_pisos`** (6 chars) era substring de todo `"TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // …"` → **secuestraba TODAS las transferencias entrantes de BBVA**, incluidas las comisiones de la correduría, que dejaron de contar como `seguros` → la correduría cobraba **0€ en silencio** (y el agente contable, que lee `destino='seguros'`, tampoco las veía). **Guardia obligatoria: `lib/correduria.ts::claveReglaValida()`** — rechaza claves de <4 chars o compuestas solo de términos genéricos del banco (TRANSF/TOTAL/PAGO/SALDO/ABONO/RECIBO/MODA/RESTAURANTES…). Se aplica en TODOS los puntos que insertan regla (`/api/banca/destino`, `/api/finanzas/categorias/asignar`, `agente-movimientos::aprenderReglaMovimiento`) **y como filtro al leerlas** en `categorizar.ts` (las viejas malas dejan de surtir efecto sin migración). Si Alberto quiere reclasificar algo cuya clave sería genérica, la vía correcta es afinar el concepto o borrar la regla desde el panel **«🧠 Reglas aprendidas»** de `/banca` (`GET/DELETE /api/banca/reglas`). **Sincronía de marcadores:** `RE_LIQUID_SEGUROS` de `destino.ts` debe conocer los mismos códigos de agente que `detectarCompania` de `correduria.ts` (`M00171`/`M1454`/`8/92361`/`SALDO. <código>`) — si divergen, un abono con solo el código cae a `personal+revisar` en vez de `seguros`. Migración de saneo: `prisma/sql/2026-07-12_limpiar_reglas_destino.sql`.

- [x] **Libro completo de movimientos en `/banca` (12/07/2026, PR #840):** «ver TODOS los movimientos» (antes solo los 300 últimos). `lib/banca.ts::listarMovimientosLedger(cuentaId, {cuentaBancariaId?,desde?,hasta?,signo?,q?}, limite, offset)` (paginado servidor + `total`/`hayMas`) → `GET /api/banca/movimientos`. `MovimientosTabla` (`BancaClient.tsx`) filtra por cuenta/fechas/signo/texto, «Ver más» por offset, y **reclasifica el negocio EN LÍNEA** por fila (`POST /api/banca/destino`). Primera página por SSR (sin spinner). Sigue la regla de rendimiento (≈50 filas + «Ver más», sin montar miles). Bandeja **«🔎 Ingresos por revisar»** (`listarIngresosPorRevisar`): abonos con negocio sin confirmar — antes un INGRESO mal clasificado no tenía dónde aparecer (la revisión de `/finanzas/gastos` es solo `importe<0`). Health-check **Check 10**: correduría 0€ + abonos BBVA sin identificar en el mes → Telegram (autolimpiable).

- [x] **Tema CLARO por defecto — el oscuro SOLO a mano (PR #707, 03/07/2026):** el ahorro de energía del
  móvil ponía el sistema en oscuro y el panel se oscurecía solo (queja de Alberto con captura). `globals.css`
  ya NO tiene `@media (prefers-color-scheme: dark)`: el claro es la base con `color-scheme: only light` en
  `:root` (el `only` además VETA el oscurecimiento forzado de Chrome/Samsung Internet con batería baja);
  el bloque oscuro vive solo en `[data-theme="dark"]` (elección manual, botón ☀️/🌙 del sidebar, binario,
  persiste en `localStorage('theme')`). `layout.tsx`: meta `color-scheme` = `only light` de serie y
  `themeColor` fijo `#4f46e5`; el script anti-parpadeo solo actúa con `theme='dark'` guardado (y repinta
  `theme-color` a `#0b1220`). ⚠️ NO reintroducir un modo "auto" que siga al sistema ni media queries de
  `prefers-color-scheme` — fue la causa del bug. Componentes: colores SIEMPRE por tokens (`--warning-bg`,
  `--positive`…), nunca hex fijos mezclados con `var(--text)` (así quedó ilegible el AlertasBanner en oscuro).
- [x] **🧾 Auditoría fiscal «100% OK» — correcciones de cálculo (18/07/2026):** auditoría a fondo del
  módulo fiscal (4 dimensiones). Hallazgos y fixes:
  - **🔴 Proyección «Fin de año» inflaba ~11.800€ de base** (`lib/proyeccion-fiscal.ts` + `lib/gastos-recurrentes.ts`):
    doble conteo del ingreso turístico futuro (tabla `incomes` + patrones de payouts Booking del banco) y
    coste deducible variable de las reservas futuras sin restar. Fix: turístico futuro SOLO desde `incomes`
    y en NETO (`ingresosFuturos × (1−margen)`, margen `pisos.total.gastos/ingresos` cap [0,0.6]); patrones
    proyectados SOLO `seguros`; run-rate `SUM/COUNT(DISTINCT mes)` (antes `AVG` por transacción).
  - **🔴 FN autonómica Andalucía sin límite de renta** (`lib/fiscal-deducciones.ts`): 200/400€ se aplicaban
    siempre pese al tope suma-de-bases ≤ 25.000/30.000€. Gateada (`andaluciaFamiliaNumerosaLimite*` nuevos en
    `IMPORTES_POR_ANIO`, vigilados por `fiscal-novedades`). Con base ~46k Alberto no tiene derecho. La de
    nacimiento NO lleva límite (Ley 8/2025) y ya se aplicaba solo el año del nacimiento (correcto).
  - **Maternidad prorrateada** por meses en el año de nacimiento (antes €1.200 plenos → sobreestimaba).
  - **`tipoEfectivo`** ahora = `cuotaIntegra/base` (método español, tras mínimo) — antes sobre toda la base
    sin restar el mínimo (salía ~26% vs ~19% real).
  - **Tramos IRPF fuente ÚNICA** `importesDe(year).tramos` (antes 3 copias: `finanzas.ts`, `fiscal-deducciones.ts`,
    `proyeccion/ProyeccionClient.tsx`).
  - **Transparencia UI:** línea de ingreso `exento` en `/finanzas/fiscal` (base < caja explicada), nota de
    maternidad, disclaimer completo en el segmento 🧾 Fiscal, tope 10% de base en mecenazgo, formato con `eurSinDecimales`.
  - Verificado: `tsc` 0 · 178 tests `node --test` (3 nuevos: proración maternidad, gate FN, tope mecenazgo) · `next build` OK.
- [x] **🏠 Cuarto segmento PERSONAL en el Inicio unificado + fix 1.314,95€ de cuota RETA mal clasificada
  (18/07/2026):** Alberto pidió ver el gasto personal desglosado desde `/banca` → nuevo segmento
  **`🏠 Personal`** en `banca/SegTabs.tsx` que monta **tal cual** `finanzas/CategoriasTab.tsx` (dona +
  tabla por subcategoría + drill-down por comercio, ya probado; sin reimplementar). Al verlo, Alberto vio
  "Cuota autonomos" ahí y preguntó por qué — auditoría reveló que **4 movimientos de su cuota TGSS en BBVA
  (1.314,95€, marzo-junio) tenían `destino='personal'` con `destino_confirmado=true`**, pese a que
  `lib/destino.ts` ya clasifica esas cuotas como `destino='seguros'` (deducible): quedaron fijados así
  antes de que existiera esa regla y el flag `confirmado` los sacó para siempre del camino de reclasificación
  automática y de la bandeja «por revisar» — mismo patrón zombie que el landmine `requiere_revision` del
  PR #906, pero en `destino_confirmado`. Backfill `prisma/sql/2026-07-18_fix_cuota_autonomos_personal.sql`
  (aplicado por Supabase MCP). Detalle+landmine completo en skill `plataforma-maestro`.
- [x] **🧾 Tercer segmento FISCAL en el Inicio unificado (18/07/2026):** al fusionar Resumen+Banca la
  fiscalidad quedó sin acceso (la radiografía —que tenía la lente fiscal— pasó a redirigir a `/banca`, y
  `/banca` solo traía `💶 Dinero | 🏢 Negocios`). Se añade **`🧾 Fiscal`** a `banca/SegTabs.tsx` +
  `banca/FiscalResumen.tsx` (server component): «Mi declaración» Hoy/Fin de año · Solo yo/Conjunta con Pilar
  + palanca de gasto + barra de tramos IRPF, enlace a `/finanzas/fiscal` para el detalle+deducciones.
  `banca/page.tsx` ramifica `tab==='fiscal'` con carga perezosa (año completo, respeta `?year=`), reusando
  `getResumenFinanciero` + `calcularEstadoDeclaracion` (mismo motor que `/finanzas/fiscal`). Es la previsión
  de la declaración de la renta que Alberto echaba en falta. Réplica fiel de la lente fiscal de la radiografía
  (fusión Fiscal+Proyección); `/finanzas/fiscal|proyeccion` intactas (reversible).
- [x] **🏠 Resumen + Banca FUSIONADOS → Inicio único `💶 Dinero | 🏢 Negocios | 🧾 Fiscal` (16/07/2026, Fase 2; segmento Fiscal añadido 18/07/2026):**
  `/banca` es ahora la home unificada con un control segmentado por navegación (`banca/SegTabs.tsx`):
  **💶 Dinero** = el cuerpo de banca (saldos + movimientos + IA, por defecto) · **🏢 Negocios** = la foto del
  holding (negocios con resultado + intercompany + Modelo 130 + alertas), **movida** desde el antiguo dashboard a
  **`banca/NegociosResumen.tsx`** (server component, `safe()`) · **🧾 Fiscal** = previsión de la declaración de
  la renta (`banca/FiscalResumen.tsx`, ver bullet anterior). **`dashboard/page.tsx` ahora REDIRIGE** a
  `/banca?tab=negocios` (se conserva por ser destino de login/register y de los `redirect('/dashboard')` de
  operador). Aterrizajes (`app/page.tsx`/login/register/CommandPalette) → `/banca`. Sidebar: una sola entrada
  **🏠 Inicio** (`UserSidebar.tsx`, fusiona Resumen+Banca). **Ficha de movimiento (PR2):** tocar el concepto de
  una fila del libro abre un bottom-sheet (negocio/deducible/factura + 🤖 ¿Qué es?) en `MovimientosTabla`.
  **Conmutador PEREZOSO por navegación** (`banca/SegTabs.tsx`, dos `next/link` con prefetch): `page.tsx`
  ramifica por `?tab` → cada pestaña computa SOLO sus datos (`tab=negocios` no toca saldos/movimientos/IA y
  viceversa). No hay render-both. Trade-off: cambiar de pestaña es navegación (no conserva filtros del libro).
  ⚠️ **La sección de abajo "Home `/dashboard` = RESUMEN" describe el estado ANTERIOR** (dashboard ya no
  renderiza nada, solo redirige); su lógica de widgets vive ahora en `NegociosResumen`.
- [x] **Home `/dashboard` = RESUMEN (02/07/2026; sustituye al "de un vistazo" del PR #523):** *(⚠️ SUPERADO por la
  fusión del 16/07/2026 — ver bullet anterior; el dashboard ya solo redirige a `/banca?tab=negocios`.)* decisión de Alberto — la home es solo un resumen de **negocios + saldos bancarios + alertas**: consolidado intercompany (condicional), aviso Modelo 130, AlertasBanner, **Saldo por cuenta con últimos movimientos** y tarjetas Sociedades+Negocios. **(03/07/2026, 2ª pasada de Alberto):** la **KPI bar se ELIMINÓ** (Ingresos año/Resultado/Negocios/Saldo del grupo — `getSaldoConsolidado` ya no se llama desde la home) y cada tarjeta de Saldo por cuenta muestra sus **últimos 5 movimientos** (fecha · contraparte/concepto · importe): `getCuentasConMovimientos(cuentaId, maxMovs=5)` pasó de "días" a "nº de movimientos" (ROW_NUMBER por cuenta, ventana de 90 días para acotar). **Todo lo demás se ELIMINÓ por duplicar páginas dedicadas** (strip Hoy, widgets Correduría/Apartamentos/Pendiente-OTA/Top gastos, gráficas CobrosPisosChart/EvolucionChart —archivos borrados—, Reservas ±7d, Comparativa mensual, Gastos por categoría). ⚠️ NO volver a añadir widgets de detalle a la home: enlazar a la página dedicada. Funciones lib sin consumidor (`getCobradoPisos`, `getSerieCobrosPisos`, `getTopGastosMes`, `getEvolucionMensual`, `getComparativaMensual`, `getGastosPorCategoria`) quedan en `lib/banca.ts` pendientes de la Fase 2 de des-duplicación.
- [x] **Control de gastos / deducibilidad (23/06/2026):** `/finanzas` reorganizado en 3 pestañas (`?tab=ingresos|gastos|fiscal`, default fiscal; KPIs de cabecera fijos). **Pestaña Gastos** (`GastosTab.tsx`): triage de cargos del periodo: bandeja «Por revisar» (`requiere_revision OR NOT destino_confirmado`, sin traspasos) + buckets por deducibilidad derivada de `destino` (negocio=`seguros`, renta=`turistico_*`, no deducible=`personal`, fuera=`traspaso_interno`). Por fila: reclasificar (aprende regla y reaplica a los iguales), confirmar, toggle **amortizable**, **🤖 sugerir** (IA `aiComplete`), badge 📎 con factura / ❗ sin justificante + «buscar factura» (Gmail). Nueva columna `movimientos_bancarios.amortizable` (`prisma/sql/2026-06-23_mov_amortizable.sql`): los amortizables (mobiliario/obra) se EXCLUYEN del gasto deducible del año (`getResumenFinanciero` + trimestres) y se listan aparte (CSV `/api/finanzas/gastos/export`). Nuevos: `lib/finanzas.ts` `getGastosControl()`, `POST /api/banca/amortizable`, `GET /api/finanzas/gastos`, `POST /api/finanzas/gastos/sugerir`. **`/api/banca/destino` generalizado:** la regla por clave ya se reaplica a cualquier destino (antes solo dentro de `seguros`). v1 NO calcula el % de amortización (3%/10%) ni hace split por línea.

**`lib/destino.ts` (23/06/2026):** el cobro de Booking del Dúplex en BBVA se reconoce por el marcador **fiable `LIQ. OP. Nº`** (lo trae el feed PSD2). Los abonos de BBVA que **no casan ningún patrón** van a `personal` + **`requiere_revision`** (`clasificarDestinoDetalle` → `{destino,revisar}`), NO a Dúplex por descarte. `RE_LIQUID_SEGUROS` (saldo agente/remsaldo/saldo cuenta/pago saldo cta/PD005) mantiene en seguros las liquidaciones de agente; `RECIBIDO:` → personal. **Cerrado "capturar el ordenante":** BBVA NUNCA lo da (ni Excel ni PSD2, que devuelve el titular en `debtor.name`); el discriminante es `LIQ. OP.`, no el ordenante. Excel↔PSD2 se solapaban → se depuró el doble conteo (22 cobros, 8.459€; `prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql`). El cuadre `/cuadre-booking` cuenta por `destino`, no por el texto del concepto.

**Backfill Dúplex pre-marcador (15/07/2026):** los cobros OTA del Dúplex **anteriores a ~mar-2026** llegaban a BBVA (…1175) como «Transferencia recibida» **sin** `LIQ. OP. Nº`, así que no se auto-clasificaban y caían a la bandeja «Ingresos por revisar» (`destino='turistico_pisos'`+`requiere_revision`). Se reclasificaron a mano **64 abonos → `turistico_duplex`+confirmados** (22.924,58€, 2025-01→2026-03) tras verificar que **en BBVA el único negocio turístico es el Dúplex** (los 3 pisos de Kutxa …0855 = `turistico_pisos`) y que el agregado mensual sigue al ingreso Smoobu de `incomes/prop_duplex_center`. **NO casan reserva a reserva** porque Booking agrupa varias reservas por pago (solo 1/65 por importe exacto) → verifica por AGREGADO mensual, no 1:1. **NO crear una regla `banca_destino_reglas` para «Transferencia recibida»** (clave genérica prohibida por `claveReglaValida`, landmine PR #840); los nuevos ya se cazan por `LIQ. OP. Nº`. El 0,01€ (verificación de cuenta) y envíos personales (p.ej. de Pilar) → `personal`, no ingreso.

**LANDMINE — dedupe PSD2 (PR #524, 25/06/2026):** `lib/psd2.ts::hashMov` deduplica los movimientos de Enable Banking con `dedupe_hash` = `cuenta_bancaria_id|fecha|importe(2dec)|upper(trim(concepto))` (por CONTENIDO). **NUNCA usar el `entry_reference` ni el `accountUid` del banco como clave de dedupe:** BBVA/Kutxa los ROTAN entre sesiones, así que el mismo movimiento reaparece con otro hash y burla el `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)` → se duplica (pasó con la cuota del préstamo `CUOTA PTMO`, recibos `TARJ.CRDTO`, seguros de vida, etc.; 15 filas el 24/06). El hash de JS debe coincidir **byte a byte** con el backfill SQL `prisma/sql/2026-06-25_psd2_dedupe_contenido.sql` (verificado node↔postgres); si cambias el esquema, cambia ambos y re-backfillea TODAS las filas `origen='psd2'` antes del siguiente cron `psd2-sync`. Matiz aceptado: dos movimientos PSD2 idénticos el mismo día (misma cuenta/importe/concepto) se colapsan en uno.

**LANDMINE — dedupe CROSS-ORIGEN Excel↔PSD2 (26/06/2026):** el `dedupe_hash` (tanto el de `lib/norma43.ts` como el de `lib/psd2.ts`) es **por contenido e incluye el CONCEPTO**, así que **NO** colapsa el MISMO movimiento cuando llega por dos vías con el concepto distinto: el feed del banco lo trae **verboso** (`RECIBO DIGI SPAIN TELECO  FACTURA DIGI`) y el Excel **truncado** (`RECIBO DIGI SPAIN TELECO`). Si se importa un Excel **encima** de lo que el banco (`origen='psd2'`) ya trajo, **se duplica todo el periodo solapado** (pasó el 21/06: 138 movimientos duplicados → **+41.762,85€ de ingreso fantasma y +11.872,60€ de gasto fantasma**; saneado en `prisma/sql/2026-06-26_dedupe_cross_origen.sql`, soft vía `duplicado_estado='ignorado'`). **Prevención automática:** `lib/banca.ts::importarExtracto` ejecuta, tras cada import de Excel, una guarda que marca `duplicado_estado='ignorado'` (reversible) en las filas recién importadas que ya tienen gemelo PSD2 por `(cuenta, fecha, importe)`, **conservando siempre el feed del banco** y sin pasarse del nº de gemelos PSD2 (no toca repeticiones legítimas mismo día/importe). OJO: `getDuplicadosSospechosos` **excluye a propósito** los pares cross-origen del banner (líneas "Idea A"), así que estos duplicados **no salen** en la alerta de la home — dependen de esta guarda de ingesta, no del banner. **Vista canónica `v_movimientos_activos`** (`prisma/sql/2026-06-26_v_movimientos_activos.sql`): centraliza el filtro `duplicado_estado <> 'ignorado'`; **toda lectura nueva de saldo/P&L debe leer de esta vista**, no de `movimientos_bancarios` directo (así ninguna consulta "olvida" excluir duplicados — la causa raíz de que el doble conteo no se viera).

- [x] **Agente Telegram revisión movimientos tarjeta (01/07/2026, PR #638 mergeado):**
  - **`lib/agente-movimientos.ts`** (nuevo): `getMovimientosDudosos(cuentaBancariaIds, mes)` — hasta 15 movimientos `requiere_revision=true` O (`destino='seguros'` AND no confirmado AND no BBVA), ordenados por importe DESC. `sugerirDestinoConContexto(mov, movsMes)` — contexto ±10 días, >20€, llama `aiComplete([{role:'user',content}])`, devuelve `{destino,confianza,explicacion}`. `enviarMensajeDudoso(mov,sug)` — si confianza≥0.8: `[✅ Sí,{label}] [✏️ Cambiar] [⏭️ Saltar]`; si no: `[✅ Pisos] [✅ Correduría] [❌ Personal] [⏭️ Saltar]`. `aprenderReglaMovimiento(cuentaId,concepto,destino)` — upsert `banca_destino_reglas`. `getMovParaCallback(movId)` — JOIN `cuentas_bancarias`.
  - **`PROP_LABELS`**: `{ prop_house_sevillana:'House Sevillana', prop_busto_reform:'Busto Reform', prop_luxury_busto:'Luxury Busto', prop_duplex_center:'Dúplex Center' }`.
  - **`lib/banca.ts`**: `enviarResumenTarjeta()` extendida — totales deducible/no deducible + un mensaje Telegram por movimiento dudoso con sugerencia IA.
  - **Webhook Telegram** (`app/api/sivra/mensajes/telegram-webhook/route.ts`): bloque `mov_*` ANTES de `hsp_`. Handlers: `mov_saltar`, `mov_cambiar`, `mov_confirmar_ia:<id>:<destino>`, `mov_pisos:<id>`, `mov_prop:<id>:<propId>` (UPDATE `propiedad_id`), `mov_correduria:<id>`, `mov_personal:<id>`. Todos aprenden la regla tras confirmar.
  - **`lib/sivra/pl-mensual.ts`**: 5ª query en Promise.all — suma gastos de tarjeta con `propiedad_id IS NOT NULL AND destino_confirmado=true AND importe < 0` → `mGastos[propiedad_id].otros`. Permite P&L exacto por piso.
  - **`prisma/sql/2026-07-01_mov_propiedad_id.sql`**: `ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS propiedad_id TEXT;` — aplicada en prod.
  - **Flujo**: import tarjeta → `analizarMovimientos` → `enviarResumenTarjeta` → Telegram por movimiento dudoso → clasificación interactiva → regla aprendida.

- [x] **Cierre ciclo tarjetas/facturas (02/07/2026):** `/api/banca/importar` acepta **PDF de tarjeta Kutxabank** (`lib/extracto-tarjeta-pdf.ts`, parser puro + pdf-parse por subpath, `origen='pdf'`; el `ccc` sale del PAN → `TARJETA-KUTXA-<últ.4>` y el dedupe_hash es idéntico al de Excel/manual → reimportar no duplica). `health-check` +2 checks: **Check 7 cuadre tarjetas** (liquidación `TARJ.CRDTO` en corriente sin desglose importado → 🔴 Telegram; **desde 17/08/2026** la prueba ya NO es solo el espejo `PAGO RECIBO` del mismo día — esa línea ABRE el extracto del mes SIGUIENTE, así que exigirla ponía en 🔴 durante ~un mes liquidaciones cuyo desglose SÍ estaba: si no hay espejo, vale que la cuenta de la tarjeta tenga compras del mes del CICLO —el del día anterior a la liquidación—, y el mensaje pide el extracto de ESE mes, no el de la fecha del cargo; veredicto en `lib/cuadre-tarjetas.ts`, puro y testeado, con tres estados: desglose importado ✅ · falta 🔴 · sin PAN en el concepto = «no puedo comprobarlo», nunca «no lo has subido») y **Check 8 justificantes** (últimos 10 días del trimestre: deducibles sin `conciliado`/`factura_ref` → aviso con total y link a `/finanzas?tab=gastos`).
  - **Subir el extracto al AGENTE (📎), no solo en /banca (13/07/2026, Fase 1):** el 📎 del chat contable (y Telegram) detecta un extracto de tarjeta (`esExtractoTarjeta`, ≥3 movimientos) en `lib/contable/documentos.ts::procesarDocumento` y lo enruta a `lib/contable/extracto-tarjeta.ts::procesarExtractoTarjeta` (variante `DocProcesado.tipo='extracto_tarjeta'`) — NO al lector de factura suelta. Ese flujo: parse → resuelve sociedad/titular por el ccc de la tarjeta (reutiliza la `cuentas_bancarias` existente; **NO** filtra `cuentas` por `estado`) → `importarExtracto(...,'pdf',titular,'tarjeta')` → `analizarMovimientos` → **empareja DEVOLUCIONES** (`lib/devoluciones-tarjeta.ts::casarDevolucion`: abono que no es `PAGO RECIBO` ↔ compra misma comercio+importe, ventana 120d → copia `destino`/`propiedad_id` para que se ANULEN; sin casar → `requiere_revision` + botones `mov_*` propios, porque `getMovimientosDudosos` solo mira cargos) → **cuadre** (`cuadrarExtractoTarjeta`: Σcompras−Σdevoluciones = liquidación; si no cuadra, avisa) → `enviarResumenTarjeta` (dudosas por Telegram) → **archiva el PDF en Drive** (`subir`, año/mes). Check 7 ahora pide "súbeme el PDF en el chat (📎)" en vez de "/banca". Restricción de Alberto: sube en el PC (web), revisa dudosas en el móvil (Telegram). **Fase 2 (vigilantes, mismo PR):** `lib/vigilantes-tarjeta.ts` (puro: `esCargoFinanciero`/`dobleCobro`/`subioPrecio`) + `vigilantesTarjeta()` en `extracto-tarjeta.ts` manda UN mensaje Telegram tras importar con lo que aplique: intereses/comisiones, posible cobro doble (mismo comercio+importe), cargos de comercio nunca visto (>80€, solo si hay histórico), subidas de precio de recurrentes, y justificantes pendientes de deducibles >100€ sin factura (enlaza Check 8). **Fase 3 (comodidades, 13/07/2026):** (a) **extracto consultable por el chat** — al archivar en Drive se persiste el enlace por tarjeta+mes en `contable_memoria` (clave `extracto_tarjeta:<PAN4>:<YYYY-MM>`, excluida del contexto del LLM como los `sinonimo_negocio:`), y una intención nueva `extracto_drive` (detector puro en `intencion.ts`, respuesta en `respuestas-directas.ts`, también enrutable por la IA) devuelve el link a demanda ("enséñame el extracto de junio de la ****0302"); (b) **auto-factura del correo** — tras importar, `procesarExtractoTarjeta` dispara `conciliarFacturasDesdeGmail` (acotado `maxAdjuntos:8/mesesAtras:2`, best-effort) para enganchar YA los justificantes de las compras deducibles recién importadas (mismo motor conservador que el cron diario `facturas-conciliar-gmail`, que sigue de red de seguridad).
  - **🚨 El extracto de tarjeta llevaba MESES sin poder leerse + 5 trampas más (08/08/2026, PRs #1295 y
    #1300).** Alberto: «el agente falla mucho»; en `contable_log`, el mismo PDF subido TRES veces con «no
    distingo el importe». No era el OCR: **`parseTarjetaPdfTexto` devolvía CERO** porque Kutxabank ya no
    separa los campos (`01/07/2026******2019750300COMPRA EN…-8,00 €`) y `RE_LINEA` exigía `\s+` — y el
    fixture del test se había escrito a mano CON espacios, así que la suite en verde no probaba nada
    (**regla: el fixture de un parser de documento externo se copia de un documento real**). Al arreglarlo
    aparecieron cinco trampas más, todas con su test: (a) leer el importe antes de recortar el PAN hace que
    el grupo de millar se trague dígitos del nº de tarjeta (`…20196503021.355,24 €` → 21.355,24€ en la
    …0302; invisible en la …0300 porque acaba en ceros) → los dígitos enmascarados se delimitan PRIMERO y,
    si no se puede, la línea no se importa; (b) el **Excel** del mismo listado ya entra por el 📎
    (`lib/extracto-tarjeta-excel.ts`: el nº de tarjeta sale del `PAGO RECIBO <16>` porque no está en
    cabecera) pero **hay que normalizar `fechaValor`/saldo** o los dos ficheros del mismo mes duplican 63
    de 109 compras (~1.990€) — el `dedupe_hash` incluye la fecha valor; (c) el cuadre solo se afirma si es
    **verificable**: en el extracto real el `PAGO RECIBO` ABRE el mes (paga el ciclo anterior), así que
    contrastarlo con esas compras gritaba «no cuadra» siempre; (d) el cruce factura↔movimiento pasa a
    **`CruceDoc` de cinco desenlaces** (match · ya_conciliado · fuera_de_ventana ±60d · **sin_cobertura** ·
    sin_match): Kutxabank va 1-3 días por detrás POR DISEÑO, y decir «no encuentro el cargo» de lo que aún
    no ha llegado es afirmar una ausencia sin mirar (dos facturas reales dadas por no pagadas); (e)
    `maxDuration` 60 → **300 + presupuesto de tiempo** (`lib/contable/presupuesto-extracto.ts`): con 60 s
    la ruta importaba los 109 movimientos y moría antes de contestar → «Sin respuesta.» sobre un extracto
    que sí había entrado. Detalle completo en la skill `plataforma-maestro` (`agentes-banca-landmines.md`).
  - **🚨 LANDMINE — un vigilante que compara STRINGS no puede decir «no lo reconozco» (14/08/2026).**
    Alberto, sobre la «🔎 Revisión de la tarjeta»: «¿por qué no lo reconoce el agente contable con IA?».
    Primera respuesta: **ese bloque no llama a ninguna IA** (`vigilantesTarjeta` + `lib/vigilantes-tarjeta.ts`,
    reglas puras). El fallo real: «no reconozco» significaba *este rótulo literal no aparece en el histórico
    de ESTA tarjeta*, así que **«MERCADONA COLMENA SEVILLA» salía como comercio nuevo con decenas de compras
    previas en Mercadona** (otra sucursal = otra cadena de texto), y una compra hecha con otra tarjeta/cuenta
    tampoco contaba como histórico. Es el patrón de siempre: un «no lo he mirado» servido como afirmación.
    - **Identidad ≠ etiqueta:** nuevo módulo PURO **`lib/comercio-canonico.ts`** (`claveComercio`/`cadenaDe`/
      `mismoComercio`, testeado). `lib/comercio.ts::comercioDe` sigue dando la ETIQUETA que se PINTA
      ("DIA SEVILLA 2260"); `claveComercio` da la IDENTIDAD con la que se compara ("DIA"): quita nº de
      tienda/terminal, forma jurídica y ciudad, y mapea las **cadenas** (solo MARCAS reales — meter
      'BAR'/'FARMACIA' fundiría comercios independientes distintos, que es el error simétrico y peor).
    - **El histórico es el de la CUENTA**, no el de la tarjeta: 24 meses sobre `v_movimientos_activos`
      (vista canónica). Si la lectura falla o toca el techo de filas, **no se emite el aviso y se dice
      por qué** — un histórico truncado no autoriza a llamar nuevo a nada.
    - **Cobro doble** exige ahora **mismo día** + ≥`DOBLE_MIN_EUR` (10€): repetir importe en días distintos
      es rutina (2×40,00€ de gasolina al mes), y 2×0,99€ en el súper son dos compras.
    - **Subida de precio** solo en recurrentes de **importe estable** (`baseRecurrente`: ≥3 cargos, ≥3 meses
      distintos, todos ±10% de la mediana). Comparar dos tickets de súper o de restaurante y llamarlo subida
      (DIA 3,25€→7,52€, un restaurante 33€→87€) es comparar cosas no comparables. Sin base → se calla.
    - Mismo criterio aplicado a **`POST /api/banca/antifraude`** (comparte los helpers) + su UI: sin
      movimientos anteriores al periodo no se afirma «comercio nuevo», se declara el hueco (`nota`, que
      ahora convive con los avisos en vez de ocultarlos).
    - Regla que deja el caso: **un vigilante solo habla cuando la señal DISTINGUE el aviso del
      comportamiento normal.** El ruido no es un aviso conservador — entrena a ignorar el mensaje entero.
- [x] **`/banca` = cuadro financiero UNIFICADO + IA GRATIS (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, PRs #882/#886-893):** sustituye a la vista suelta de movimientos. **Core (F1-F3):** period-driven (`?year/quarter/desde/hasta`, default mes en curso, mismo `IntervaloSelector` que la radiografía) — `ResumenPeriodo.tsx` reusa `getResumenFinanciero`; gráficas Recharts (evolución + dona); P&L de pisos (`getPLMensual`); libro completo paginado con reclasificación en línea (`MovimientosTabla`, PR #840, ver bullet de arriba). **Extras de IA GRATIS bajo demanda (todos: la IA solo SUGIERE/CLASIFICA/NARRA, los importes SIEMPRE salen de `lib/banca.ts`/`lib/finanzas.ts`, nunca los inventa):** 🧾 **Cazador de deducciones** (`lib/cazador-deducciones.ts`, `POST /api/banca/cazador-deducciones`) — gasto personal que probablemente es deducible + ahorro fiscal estimado; 💬 **Mini-chat** (`MiniChatContable.tsx` → `POST /api/contable/chat`, embebe el agente contable existente); 🤖 **Sugerir por fila** en cargos del libro (reusa `POST /api/finanzas/gastos/sugerir`); 📈 **Benchmark entre pisos** (`BenchmarkPisos.tsx`, lectura IA bajo demanda vía `POST /api/banca/benchmark-pisos`); ✂️ **Fugas en recurrentes** (`POST /api/banca/fugas`, anualiza los recurrentes que ya detecta la tesorería y marca cancelar/renegociar); 🚨 **Antifraude** (`POST /api/banca/antifraude`, **reglas DETERMINISTAS sin IA** — cobro doble/comercio nuevo/subida de precio/cargo financiero, reusa `lib/vigilantes-tarjeta.ts` + `lib/comercio.ts`); 📤 **Cierre de mes narrado** (`lib/resumen-mensual.ts::enviarResumenMensual`, cron día 1 08:00 `/api/cron/resumen-mensual`, por cuenta: cifras del mes anterior + narración IA de 1-2 frases que degrada sin romper). Todo verificado `tsc` 0 + `next build` exit 0. Pendiente (F4 cola): desviación explicada, aviso fiscal proactivo, adjuntar/conciliar factura por foto en banca; F5: módulo 🛒 tickets de súper + comparador de precios.
- [x] **🚨 LANDMINE — un criterio que decide si algo está roto vive en UN sitio y lo aplican TODOS sus
  consumidores (21/08/2026, PR #1575):** el 17/08 se decidió que un aviso del sync PSD2 con prefijo
  **`ℹ️` es INFORMATIVO** (el banco impone una limitación pero el feed SIGUE entregando: Kutxabank
  rechaza la ventana de 89 días y se cae a la de 30). El corte se implementó en `lib/psd2-semaforo.ts`
  y **nunca llegó al cron**, que seguía disparando con `if (sync.avisos.length)` → cada mañana un
  Telegram «⚠️ el banco no está entregando movimientos» cuyo único contenido era esa nota, mientras
  `/banca` pintaba verde **con razón**. Alarma y panel afirmando lo contrario sobre el MISMO hecho: el
  usuario deja de creerse los dos. El corte es ahora el helper puro **`partirAvisos()`** (con
  `esNota`, testeado) y lo consumen el semáforo Y el cron.
  - **Y el desenlace, un escalón más allá (26/08/2026, PR #1739): una nota ℹ️ SOLA no manda Telegram,
    ni siquiera la primera vez.** El PR #1575 dejó un dedupe por clave estable (`claveAviso` neutralizaba
    las fechas ISO, que se corren solas cada día con la ventana `hoy − 30 días`) para que la misma
    incidencia no se contase cada mañana. Alberto, al recibirla igualmente: «¿algo que hacer? no me
    avises entonces». Y tenía razón — el dedupe atacaba la REPETICIÓN, no el problema: la limitación de
    Kutxabank es PERMANENTE y no hay ninguna acción posible, así que el aviso era ruido aunque llegara
    una sola vez (el propio texto terminaba en «no hay que hacer nada»). El cron avisa ahora SOLO por
    avisos críticos; las notas viajan como contexto dentro de esa alerta y viven en `/banca`. Se
    retiraron `claveAviso`/`avisosNuevos` y el helper `avisosPersistidos()` del cron, ya sin consumidor.
    **Regla que deja: antes de silenciar la repetición de un aviso, pregunta si el aviso debía existir.**
    Un aviso que se cuenta «solo una vez» sigue siendo ruido si su lector no puede hacer nada con él;
    lo que hay que conservar es el sitio donde el dato SÍ hace falta (aquí, el panel), no el mensaje.
  - **Hermano en la UI:** `banca/page.tsx` renderizaba `estado.detalles` solo cuando el nivel ≠ `ok`,
    y las notas ℹ️ iban dentro de `detalles` → bajo el 🟢 eran **invisibles** y el panel decía «todo
    ok» sin declarar que del feed PSD2 de Kutxabank solo hay datos **desde el 22/07**. Un hueco no
    declarado se lee como «no hubo movimientos» (regla raíz «dato que NO hay ≠ dato que NO se ha
    mirado»). Las notas viven ahora en **`EstadoFeed.notas`**, aparte de `detalles`, y se pintan
    SIEMPRE, también en verde. Al añadir un estado «esto no es un fallo pero condiciona el dato»,
    la UI tiene que poder decirlo con el semáforo en verde.
  - **Pendiente conocido, NO olvido:** `getEstadoFeedPsd2` decide la frescura con el **MAX** entre
    todas las cuentas, así que una rezagada queda tapada por otra fresca. No se pasó a por-cuenta
    porque los umbrales (3/6 días) se calibraron sobre «nunca más de 1 día de hueco» y el histórico
    real de 120 días de la BBVA ****1175 da **hueco máximo de 10 días** (media 1,06): por cuenta sería
    una fábrica de falsos positivos. El pie del panel sí lista el último movimiento de cada cuenta.
- [x] **🚨 LANDMINE — flag `requiere_revision` zombie: confirmar destino DEBE limpiarlo (PR #906, 15/07/2026):**
  `requiere_revision` es el flag del **destino** (negocio dudoso), NO de la categoría contable ni de la
  subcategoría personal (esa es `subcategoria_revisar`). **Invariante doble:** (a) TODO endpoint/acción que
  ponga `destino_confirmado=true` DEBE poner también `requiere_revision=false` en el MISMO UPDATE, y (b) TODA
  bandeja/consulta «por revisar» DEBE filtrar `COALESCE(destino_confirmado,false)=false`. El saneo del
  2026-07-10 (`2026-07-10_limpiar_requiere_revision_confirmados.sql`) arregló `/api/banca/confirmar` y limpió
  ~1.200 zombies, pero **quedó `/api/banca/destino` (reclasificar el negocio) sin tapar** → cada
  reclasificación creaba un zombie nuevo. Y `lib/banca.ts::listarPorRevisar` (la bandeja «🏷️ Gastos por
  revisar · categoría» de `/banca`) era el ÚNICO read-path SIN el filtro canónico (que ya tenían `getAlertas`,
  health-check Check 2 y `/finanzas/gastos`) → un cargo ya clasificado y confirmado (CORTEFIEL: `tarjeta`+`ropa`
  +`personal`+confirmado) seguía saliendo ahí. **Fix:** `/api/banca/destino` limpia el flag en sus 2 UPDATEs
  (fila única + regla por comercio); `listarPorRevisar` filtra `destino_confirmado=false`; backfill idempotente
  `2026-07-15_limpiar_requiere_revision_destino.sql` (aplicado). Verificado con `next build` OK. Al añadir un
  camino nuevo que confirme destino (Telegram, agente contable, endpoint…), replica el invariante (a)+(b).
- [x] **🏷️ Compra de tarjeta nunca cae en palabra-trampa + bandeja «Gastos por revisar» pregunta el
  NEGOCIO (30/07/2026):** un pago en el restaurante "LA HACIENDA GOLF" caía a `categoria='impuestos'`
  porque `categorizarPorReglas` usaba `'HACIENDA'` a secas y la regla de compra con tarjeta iba DESPUÉS
  de las reglas de comercio (el nombre del comercio puede contener cualquier trampa: 'BAR LA MUTUA'…).
  Fix: reglas extraídas a **`lib/categoria-reglas.ts`** (módulo PURO, testeado con `node --test`;
  `categorizar.ts` reexporta) — la liquidación de tarjeta y la COMPRA con tarjeta se detectan PRIMERO
  (compra → siempre `tarjeta`; el consumo vive en `subcategoria` y la deducibilidad en `destino`) y
  `'HACIENDA'` suelto se retiró (solo frases del fisco: AEAT/HACIENDA PUBLICA/TRIBUT HACIENDA…, misma
  lección que `subcategoria-keywords` del 07/07). Además la **RevisarBandeja de `/banca` ya no pide la
  categoría contable** (taxonomía PGC que descolocaba a Alberto — "no es nada de estas categorías"):
  pregunta lo realmente dudoso, el **negocio**, con botones 🛡️ Correduría / 👨‍👩‍👧 Personal + «Otro…»
  (Dúplex/Pisos/Traspaso) contra `/api/banca/destino` (confirma, limpia flag e aprende regla del
  comercio — invariante PR #906). `/api/banca/revisar` (asignar categoría) queda vivo pero sin UI.
  Backfill `prisma/sql/2026-07-30_categoria_compra_tarjeta.sql` (aplicado: 3 filas → `tarjeta`).
- [x] **Health-check: Check 6 (alertas) RETIRADO (11/07/2026):** contaba filas de la tabla `alertas` (de **IALIMP**, operativa de limpiezas de Si que Brilla) con >30 días **sin filtrar por empresa** → metía el backlog de Vanessa al Telegram de Alberto (saltó con `🟡 152 alertas`). Esas alertas no son de plataforma; ialimp ya las gestiona (panel 🔔 + cron semanal `alertas-pendientes` que avisa a `empresas.email`). **No reintroducir ningún conteo de `alertas` en el health-check de plataforma** (es de otro tenant). Raíz del atasco: el log `asignacion_auto` de ialimp se insertaba sin leer y no se purgaba (corregido en ese repo). Diseño: `docs/superpowers/specs/2026-07-11-health-check-alertas-limpiezas-design.md`.
- [x] **Fiscal — «Mi declaración» ya no se cuelga en «Calculando…» (03/07/2026, PR #721 mergeado):**
  La IA salió del camino crítico: `/api/finanzas/comparativa` ya NO llama al LLM (antes `enriquecerConIA`
  vía `aiComplete`→`nimChat` **sin timeout** colgaba la petición). Los números de la proyección salen de
  SQL (`detectarPatronesSQL`, todos proyectables); las etiquetas legibles se leen de la nueva tabla
  `patrones_recurrentes_cache`, que rellena el cron `/api/cron/patrones-fiscal-refresh` (`30 5 * * *`).
  La comparativa se calcula en **SSR** (`fiscal/page.tsx` reutilizando el `resumen`; helper
  `lib/comparativa-declaracion.ts::calcularEstadoDeclaracion` compartido con el endpoint) → primera carga
  sin spinner. `aiComplete` lleva `AbortSignal.timeout`. El escenario «🔮 Fin de año» **anualiza**
  retenciones + datos de Pilar (antes a fecha de hoy → sesgo a «a pagar»). ⚠️ LANDMINE detectada: la
  tabla `cuentas` NO tiene columna `estado` (los crons `facturas-scan`/`facturas-resumen-semanal` la
  usan → fallan en runtime; pendiente de arreglar aparte).
- [x] **Fiscal — comparativa IRPF corregida + «🧾 Mi declaración» (02/07/2026, PR #686 mergeado):**
  `compararDeclaracion()` recibe ahora `retencionesTitular` (reales; antes estimaba 15% de TODA la
  base → miles de € de retenciones fantasma que hacían salir "a devolver" ambas modalidades) y
  `baseTitular` SIN la reducción por conjunta (la aplica la función; antes se duplicaba). Nuevo
  campo `fiscal.baseImponibleSinReduccion` en `getResumenFinanciero`. `/finanzas/fiscal` sustituye
  la card «Conjunta vs Separada» (tras botón) por **«🧾 Mi declaración»** (auto-carga): cards
  📍 Hoy y 🔮 Fin de año (estimación), cada una con filas 👤 Solo yo / 🤝 Conjunta con Pilar +
  palanca de gasto (ahorro por 1.000 € deducibles, gasto para bajar de tramo, sin efecto acantilado).
  `GET /api/finanzas/comparativa` → contrato NUEVO `{hoy, finAnio, bases, palanca, mesesRestantes}`.
  `lib/proyeccion-fiscal.ts` (nuevo): `getProyeccionFiscal()` extraído del route de proyección.
  **Hotfix posterior (misma fecha):** `lib/gastos-recurrentes.ts::detectarPatronesSQL` usaba
  `m.fecha` — la columna real de `movimientos_bancarios`/`v_movimientos_activos` es
  **`fecha_operacion`** → 500 en `/api/finanzas/comparativa` Y en `/api/finanzas/proyeccion`
  (roto en silencio desde PR #646). ⚠️ Al escribir SQL contra movimientos: NO existe `fecha`.
  Gmail → OCR → Telegram → Enable Banking PIS / SEPA XML → auto-conciliación bancaria.
  - **`@central/module-pagos`** (`packages/module-pagos`): módulo puro portable (tipos, SEPA XML pain.001, validador IBAN).
  - **`prisma/sql/2026-06-30_facturas_proveedor.sql`**: tabla `facturas_proveedor` (estados, dedupe único por `(cuenta_id,proveedor,numero_factura)`). **Aplicada en prod.**
  - **`prisma/sql/2026-06-30_presupuesto_proveedores.sql`**: tabla `presupuesto_proveedores`. **Aplicada en prod.**
  - **`lib/enablebanking.ts`**: añadidas `iniciarPago()`, `estadoPago()`, `disponiblePis()` (flag `EB_PIS_ENABLED`).
  - **`lib/agente-facturas/pagos.ts`**: orquestador completo (scan, aprobar, aplazar, rechazar, verificar, conciliar, pagarTodo, resumenSemanal, alertarFacturasAusentes).
  - **Crons**: `facturas-scan` `15 6 * * *` + `facturas-resumen-semanal` `15 9 * * 1` en `vercel.json`.
  - **Telegram webhook** extendido: prefijo `pago_` → aprobar/rechazar/aplazar/pagartodo/revisarunauna/vincular/novinc.
  - **`lib/finanzas.ts`**: trimestres incluyen `ivaSoportado` (suma `cuota_iva` de `facturas_proveedor WHERE estado='pagada'`).
  - **`middleware.ts`**: `/api/banca/pago/callback` exento (redirect banco tras SCA).
  - **Fase 3 backlog**: foto ticket, aplazar con email, scoring proveedores, pago fraccionado.
  - **Envs pendientes** (Alberto): `EB_PIS_ENABLED=true`, `EB_DEBTOR_IBAN`.

- [x] **Agente de triaje de correo (03/07/2026):** cron de Vercel que separa el ruido de lo importante
  en el Gmail de Alberto. `lib/correo/` (`rutas.ts` = tabla de rutas FUENTE ÚNICA `categoria→etiqueta+
  archivar+aviso`; `imap.ts` lector incremental por UID que etiqueta con `messageCopy` y archiva con
  `messageDelete` de INBOX —nunca Papelera—; `clasificador.ts` orden `correo_reglas`→regex OTP→IA
  (Groq primero, `aiComplete`/NIM de respaldo — PRs #743/#744/#745, 04/07/2026), duda→`dudoso` sin
  tocar; `huespedes.ts` resuelve nº confirmación Booking→bookingId Smoobu
  y delega en `procesarMensajeHuesped`; `triaje.ts` orquesta). Crons `correo-triaje` `*/10 * * * *`,
  `correo-digest` `30 20 * * *`, `correo-resumen-semanal` `0 9 * * 1` (auth `CRON_SECRET`). Categorías v1:
  ruido→`Triaje/Ruido`+archivar · contabilidad→`Triaje/Contabilidad` (buzón puente de `facturas-correo`,
  que ya incluye `OR label:Triaje/Contabilidad`) · correduria→digest · personal-importante/huespedes/
  leads-negocio→Telegram inmediato (con acción+fecha límite) · seguridad-sospechosa→marcar con cautela
  (nunca actúa) · codigos-verificacion/dudoso→sin tocar · **reservas-booking→`Triaje/Reservas-Booking`+archivar
  (30/08/2026): avisos de Booking AL PROPIETARIO sobre una reserva (⚠️ «reserva/cancelación no registrada» por
  el channel manager, y las confirmaciones ordinarias si Booking las reactiva — dejaron de llegar en 2020).
  Detección DETERMINISTA antes que `correo_reglas`** (el mismo `noreply@booking.com` manda facturas y podría
  tener regla hacia contabilidad); parser puro `lib/correo/reserva-booking.ts` (fixtures de correos reales).
  Alimenta el **vigía Booking↔Smoobu** (`reservas_correo_booking`, cron cada 15 min
  `/api/sivra/reservas-booking/verificar`, lógica `lib/sivra/reservas-booking-vigia.ts`): contrasta contra
  Smoobu (`listarReservasVentana`), sync forzado de la ventana si Smoobu la tiene, Telegram 🚨 si NO
  (huérfana, pintada ⚠️ en la intranet de limpieza de Vanesa hasta que Smoobu se cure). **Leg B:** un mensaje
  de huésped cuyo nº de confirmación Smoobu no resuelve también entra como pendiente — el caso fundacional
  (James Ascott, Luxury 27→29/08/2026: Smoobu caído, reserva jamás sincronizada) NO generó ningún correo ⚠️
  de Booking, así que el correo de aviso solo no basta. Latido `reservas_booking_vigia` (3 h). Tablas `correo_triaje`/`correo_cursor`/
  `correo_reglas` (`prisma/sql/2026-07-03_correo_triaje.sql`, con semilla VIP; **tablas ya aplicadas en
  Supabase 03/07/2026**). **🟢 EN VIVO desde el 10/07/2026** (`TRIAJE_DRY_RUN=false` en Production: etiqueta/
  archiva en Gmail y avisa por Telegram). El **modo sombra** queda como salvaguarda (`TRIAJE_DRY_RUN` sin poner
  o `=true` = clasifica y anota pero NO toca Gmail — útil para validar un cambio de rutas antes de soltarlo).
  Sin envs nuevas (reutiliza `GMAIL_*`/`TELEGRAM_*`/`NVIDIA_API_KEY`/`CRON_SECRET`). Skill router
  `.claude/skills/correo-triaje`; `/auditoria-diaria` vigila la frescura de `correo_triaje` y reconcilia
  `rutas.ts` contra las skills. ⚠️ Vercel NO puede disparar la rutina Claude `facturas-correo`: la
  contabilidad etiquetada se recoge en su pasada de las 08:00.

- [x] **Domótica Tuya — ventilador de techo Socorro (03/07/2026, PR #714):** regla de Alberto: día de
  LLEGADA a las 15:00 hora Madrid, si en Sevilla hace >30°C, ENCIENDE solo el ventilador (nunca la luz);
  día de SALIDA a las 11:30, APAGA siempre (idempotente, cubre el desfase del mando RF). Cron
  `/api/sivra/domotica/programador` (`25,55 8-15 * * *`); decisión pura en `lib/domotica/programador.ts`
  (testeada), meteo en `lib/domotica/meteo.ts`, cliente API en `lib/domotica/tuya.ts`. UI `/sivra/domotica`
  (`DomoticaClient.tsx`). Tablas `domotica_dispositivos` + `domotica_log` (dedupe por
  `${accion}:${reservaRef}`).

- [x] **Agente conversacional de finanzas (`/contable` + Telegram; `lib/contable/`):** chat que responde
  sobre TODAS las cuentas/actividades de Alberto y propone acciones (que él confirma en pantalla). **Dos
  caminos:** (1) DETERMINISTA — `intencion.ts` (puro, sin BD) detecta preguntas estructuradas (gasto del
  mes/año, por concepto, por subcategoría de consumo, **por segmento de negocio nombrado en solitario**
  —`gasto_destino`: "gastos de la correduría/los pisos", suma por `destino`—, comparativa `por_destino`,
  facturas pendientes, **`tramo_fiscal`**) y `respuestas-directas.ts`
  las contesta por SQL SIN LLM (instantáneo, no inventa cifras, funciona con la IA saturada); (1-bis)
  **IA ENRUTA, SQL CALCULA (10/07/2026)** — si el router determinista NO reconoce una pregunta de datos,
  `clasificar-ia.ts::clasificarIntencionIA` pide a la IA que la mapee a una **intención estructurada**
  (mismos tipos que `intencion.ts`) y el **SQL de `respuestas-directas.ts` hace la cuenta EXACTA** (la IA
  aporta comprensión del lenguaje, NUNCA cifras). Menos incidencias con frases nuevas ("ingresos del piso
  de Busto") **sin** riesgo de cifras alucinadas. Dos salvaguardas: el router deja de contestar el "total
  del año" a ciegas cuando hay una **entidad sin resolver** (`entidadesResiduales`, la lección del
  incidente del Dúplex — un comodín tapaba el filtro), y el clasificador solo se dispara en preguntas de
  datos (no en charla libre). **APRENDE:** cuando la IA resuelve una palabra a un segmento, se guarda como
  sinónimo en `contable_memoria` (clave `sinonimo_negocio:<palabra>`, SIN migración nueva; excluida del
  contexto del LLM) y `detectarIntencion(…, extras)` la usa como determinista la próxima vez (instantánea
  y gratis). (2) LLM libre —
  si nada casa, `construirContexto` arma un panorama completo (sociedades→negocios, saldos bancarios,
  resumen del año por destino, **posición fiscal IRPF** vía `getResumenFinanciero` —misma fuente que
  `/finanzas`—, facturas pendientes y memoria de rutina) y lo pasa al modelo. Modelo configurable por env
  **`CONTABLE_MODEL`** (default `deepseek-ai/deepseek-v4-flash-0731` por NVIDIA NIM, gratis; id erróneo degrada a
  Groq→Gemini→Kimi, nunca rompe). `stripThink()` quita `<think>` de modelos de razonamiento antes de
  parsear. Protocolo side-channel: el modelo emite `APRENDER:{json}` (hábitos) y `ACCION:{json}`
  (propuestas sobre un `#ref`), parseado por regex puro en `parse.ts`. Módulos puros
  (`intencion`/`parse`/`formato`/`acciones-tipos`/`documentos-tipos`) testeables con `node --test` (sin
  `@/` ni Prisma). Cadena de fallback IA global: **NIM → Groq → Gemini → Kimi** (`@central/core-ai`).

- [x] **📊 `/sivra/resultado-pisos` = RENDIMIENTO por rango + previsión con seguimiento (30/08/2026):**
  la página pasó de «P&L de UN mes» a cuadro de rendimiento: selector de rango de MESES en la URL
  (`?desde=YYYY-MM&hasta=&piso=`; el P&L es de caja mensual, un rango por días mentiría en gastos),
  KPIs con Δ interanual, gráficas Recharts (evolución + por piso + gastos por categoría), canales con
  **comisión REAL** (= `amount_gross − amount`; sin bruto → «no consta», no 0), cancelaciones
  (declarando que el registro nace el 12/08/2026) y heatmap de estacionalidad 24 meses (perezoso,
  `/api/sivra/pl-heatmap`). **Previsión** (mes en curso + 2, decisión de Alberto): CONFIRMADO y
  ESTIMADO («si repites el año pasado») SIEMPRE por separado; sin base histórica → null, jamás 0.
  **Pace** con `incomes.reserved_at` (ingreso sin fecha de reserva se declara, no se excluye en
  silencio). **Seguimiento**: cron diario `prevision-pisos` (05:50, `CRON_JOBS`) fotografía la
  previsión en `pisos_previsiones` (migración `2026-08-30`, aplicada) y la página contrasta la última
  foto ANTES de empezar el mes contra el ingreso real — un mes sin foto previa queda «sin registro»,
  nunca «acertó/falló». Aviso Telegram «previsión floja» a 28-32 días (confirmado <40% del mismo mes
  del año anterior con base ≥500€; dedupe `pisos_previsiones_avisos`, una vez por mes+piso). Latido
  `sivra_prevision` (registro + PROBES en el mismo PR). `PLPiso` ganó `noches`/`nochesSinDato`.
  Lógica pura testeada: `lib/sivra/pl-rango-logica.ts` + `lib/sivra/prevision-logica.ts`; BD:
  `pl-rango.ts` (caché por mes; `?fresco=1` tras subir factura) + `prevision-pisos.ts`.

## 🔀 Proveedores de IA — regla permanente (dictada por Alberto, 24/08/2026)
**Todo lo que PUEDA ir por OpenRouter, va por OpenRouter.** Unificar proveedores: cada proveedor
suelto (Serper, keys directas de Gemini, APIs de búsqueda de terceros…) es una cuenta más que se
agota, rota o cambia de precio EN SILENCIO — la caída de Serper del 22/08/2026 tardó dos días en
verse. OpenRouter ya da modelos + búsqueda web + fallback nativo + presupuesto/auditoría en
`ai_usos`, todo por una sola key. Al añadir una capacidad nueva de IA/búsqueda, la pregunta no es
«¿qué API la da?» sino «¿la da OpenRouter?»; solo si no, se considera un proveedor aparte — y
entonces con latido/presupuesto propios desde el día uno. (Las vías gratis existentes —cadena
NIM→Groq→…, Gemini gateado— siguen como fallback/opción, pero no se añaden dependencias nuevas
fuera de OpenRouter sin decisión explícita de Alberto.)

## Índice de arquitectura a nivel de función + Director de código (10/07/2026)
Para que los agentes programadores NO lean el repo entero por cada tarea:
- **Índice (0 tokens):** `scripts/auditar-estructura.mjs` extrae firmas de función + resumen + tablas por archivo
  (regex Node-puro) → `docs/mapa-funciones.generated.json`. Se regenera/commitea en cada push (`auditoria.yml`).
- **Tabla `mapa_arquitectura`** (`prisma/sql/2026-07-10_mapa_arquitectura.sql`, **aplicar por Supabase MCP como
  `postgres`**): 1 fila/archivo, `funciones jsonb`, índice **pg_trgm** sobre `busqueda`, GIN en `tablas`, sin RLS
  (BYPASSRLS) + `REVOKE anon/authenticated`. Se puebla por `POST /api/internal/mapa-arquitectura` (auth `CRON_SECRET`,
  upsert idempotente por `hash`), invocado desde `auditoria.yml` **solo en `main`** (secrets `PLATAFORMA_URL`+`CRON_SECRET`).
- **Director de código:** `lib/ia-director-codigo.ts::acotarArchivos(tarea)` → keywords + `word_similarity` sobre
  `mapa_arquitectura` → archivos candidatos; reutiliza `elegirModelo` (presupuesto/catálogo) y registra en `ai_usos`
  (`endpoint='codigo'`). Puerto `POST /api/ai/codigo` (auth `AI_GATEWAY_SECRET`). Devuelve archivos + modelo; NO edita.
  Degrada solo (`sinMapa`/`stale`), nunca bloquea. Catálogo: categoría `codigo` en el cron `ia-director-refresh`.
  Env opcional `MAPA_STALE_DIAS` (default 7). **🚨 LANDMINE (17/07/2026):** el acotado usa `word_similarity`
  (pg_trgm), que en Supabase vive en el schema **`extensions`**; el rol con el que conecta la app (por el pooler)
  necesita **`USAGE`** sobre ese schema o la query lanza `permission denied for schema extensions (42501)` **solo
  en runtime** (en el editor SQL sí resuelve) → el acotado devuelve 0 filas en silencio. Aplicado el fix:
  `GRANT USAGE ON SCHEMA extensions TO public;` (grant a `authenticator` solo NO basta: la app usa otro rol). La
  query va CUALIFICADA `extensions.word_similarity(...)` y SIN array de Prisma (`ILIKE ANY(array)` fallaba en el
  pooler) — solo params escalares. Instrumentado: si el mapa lanza, el error real va a `ai_usos.error`.
- **Ejecutor de código (Fase 1, 16/07/2026) — "caro planifica / barato ejecuta":** puerto `POST /api/ai/ejecutar`
  (auth `AI_GATEWAY_SECRET`). Dado `{ ruta, contenido, instruccion, criterio?, maxTokens? }`, un **coder BARATO**
  de la categoría `codigo` reescribe el archivo y devuelve `{ contenido, modelo }`. Determinista: `chatConDirector`
  con `categoria:'codigo'` (nuevo `lib/ia-director.ts::elegirPorCategoria` elige por tag del catálogo SIN hop al
  decisor); reutiliza presupuesto + `ai_usos` (`endpoint='ejecutar'`). NO escribe disco/git: el orquestador (la
  sesión Claude, que es el PLANIFICADOR caro) aplica, revisa y verifica. Skill de sesión `.claude/skills/delegar-codigo`
  (delega SOLO lo mecánico/voluminoso). El **planificador Claude alto como servicio autónomo** es la categoría
  **`plan`** del catálogo (`ia-director-refresh`), con techo de precio propio **`DIRECTOR_PLAN_PRECIO_OUT`**
  (default 100 USD/M — para que Opus/lo más alto no quede capado por `DIRECTOR_MAX_PRECIO_OUT`). La categoría `plan`
  solo aparece en el catálogo tras la próxima corrida del cron `ia-director-refresh` (o disparo manual). Ver
  `docs/DIRECTOR-CODIGO.md` y `docs/ESTUDIO-DIRECTOR-CODIGO-TOKENS.md`.
- **Fase 2 (orquestador autónomo) COMPLETA y PROBADA end-to-end (17/07/2026).** `POST /api/ai/programar`
  (`lib/programador.ts`, planifica con Opus, `endpoint='programar'`) + `scripts/ai-programar.mjs` (acota →
  planifica → ejecuta → aplica) + Action manual `ai-programar.yml` (abre **PR draft**, nunca mergea). **Guardia
  antidestructiva** (`lib/reescritura-guardia.ts`, testeada): el coder barato NO es fiable ni en tareas triviales
  (qwen truncó un archivo y borró una función) → el ejecutor valida la salida y, si es destructiva (vacía,
  truncada <50 %, borra exports), **escala UNA vez a Opus** (`escalado:true`) y si tampoco pasa responde **422**
  (el orquestador salta ese archivo). Prueba real (PR autogenerado #966): acota qwen → plan Opus → ejecuta qwen
  (falló) → guardia → escaló a Opus → diff sano → PR draft abierto solo, ~0,13 €. Requisitos ya cumplidos: GRANT
  de `extensions` (ver arriba), secrets de repo `PLATAFORMA_URL`+`AI_GATEWAY_SECRET`, y el ajuste *"Allow GitHub
  Actions to create and approve pull requests"* (Settings→Actions→General) para el auto-PR. **Nada se auto-mergea.**

## Registrar una cuenta
Desde la propia app: **`/register`** (nombre + email + password ≥8). Hace auto-login.
El alta manual por SQL ya no es necesaria.

## Panel de OPERADOR — arquitectura post PR #249
- **`/admin`** → redirect a `/operador/clientes` (PR #332, merged). Ya no sirve el god-panel oscuro.
- **`/operador/*`** (nuevo, tema claro): `ClientesClient.tsx`, `MapaArquitectura`, placeholder ia-rest. Mismas APIs `/api/admin/*` sin tocar.
- **Auth:** `lib/superadmin.ts` + cookie `plataforma_admin` 8h. El login de `/login` (no `/admin/login`) ya emite ambas cookies si el email está en `superadmins`.
- **Adaptadores:** `lib/adapters/*` — ialimp/sivra por BD compartida, ia-rest e **iarrhh** por HTTP Bearer
  (iarrhh: alta de empresa+responsable desde `/operador/clientes`, vertical `'rrhh'`).
- **`lib/conciliacion.ts`:** `candidatosSivra()` lee tabla `gastos` (raw SQL). Ref: `sivra:gasto:<id>`.
- **👁️ Actividad ialimp (`/operador/actividad`, 15/08/2026):** historial de accesos y actividad de los
  usuarios del SaaS ialimp (dueña/usuarios/limpiadoras/propietarios) leído de la tabla compartida
  `registro_actividad` (la escribe apps/ialimp; `prisma_plataforma` solo SELECT). «Último acceso por
  persona» + historial filtrable (empresa/perfil/tipo/texto), 50 filas + «Ver más»
  (`lib/actividad-ialimp.ts` + `GET /api/admin/actividad`). La tabla nació vacía el 15/08/2026: la UI
  declara desde cuándo hay registro — «sin filas» ≠ «no ha entrado». Retención 90 días (purga en ialimp).
- **Personas a través de verticales (RR.HH., SOLO LECTURA):** `/operador/personas` (`PersonasClient.tsx`)
  consolida a la **misma persona** aunque tenga roles en varias verticales, agrupando por **`persona_id`**.
  `lib/personas.ts` lee ialimp (`limpiadoras`, prisma directo) + rrhh (empleados por el puerto operador
  `/api/operador/personas`, Bearer `RRHH_OPERADOR_SECRET`) y **propone enlaces** no hechos por DNI/email
  (`coincidenciaPersona` de `@central/core-identity`). API: `GET /api/admin/personas`. **El enlace MANUAL
  del `persona_id` (escritura cross-app) está PENDIENTE** — hoy solo se sugiere.
- **🚨 LANDMINE — el redeploy del panel 🔑 Secretos podía morir en el Ignored Build Step sin avisar
  (03/08/2026, PR #1236):** `redeployProjectProduction` usaba `withLatestCommit`, y si el último commit
  de `main` era uno `[skip ci]` (p. ej. el `chore(auditoría): regenerar radiografía` de esta misma rutina),
  `vercel-ignore-build.mjs` lo saltaba SIEMPRE → el redeploy salía **CANCELED** en Vercel mientras el panel
  decía «✅ redeploy lanzado» y el secreto guardado nunca llegaba a runtime. Fix: el redeploy pasa
  `projectSettings.commandForIgnoringBuildStep: ''` (fuerza build) + una sonda de ~15s que reporta
  CANCELED/ERROR como fallo real (el endpoint solo dice `redeployed:true` si TODOS los proyectos construyeron).

## Concursos públicos / licitaciones (agente) — PORTADO de ialimp (19/06/2026)
Las licitaciones son **transversales a los negocios de la cuenta** (fontanería, catering, limpieza…), por eso el agente vive aquí y **se eliminó de ialimp**. Sección de usuario **🏛️ Concursos** (`/concursos`, sidebar *Mi negocio*). Consume el módulo PURO **`@central/module-concursos`** (en `transpilePackages`).
- **Scope = CUENTA.** Las rutas usan `requireEmpresaId()` (shim `lib/tenant.ts` → `requireSession().id` = `cuenta_id`); las tablas guardan ese id en su columna `empresa_id`. El **corpus `concursos_licitaciones` es GLOBAL** (compartido, sin scope).
- **Shims de compatibilidad** (para que el código portado de ialimp funcione sin reescribir): `lib/prisma.ts` (re-export de `lib/db`), `lib/tenant.ts` (`requireEmpresaId`), `lib/mailer.ts` (`getTransporter`/`MAIL_FROM` sobre `@central/core-email`). **IA:** `lib/ai-client.ts` añade `aiComplete()` (NVIDIA NIM `nimChat`); el módulo entra por el puerto `aiRunner` de `lib/concursos.ts`.
- **Páginas:** `app/(usuario)/concursos/{page,perfil/page,biblioteca/page}.tsx` (tokens `var(--primary)`). **API:** `app/api/concursos/**` (buscador, radar, seguidos, preparar, analizar, perfil, biblioteca, `[id]/{memoria,sobre-administrativo,oferta}`, radar/{buscar,resumen,interpretar,criterios,importar,visto}). **Crons** (`vercel.json`, auth `lib/cron-auth.ts`): `concursos-ingesta` (corpus PLACSP), `concursos-radar`, `concursos-avisos` (digest email de nuevos), `concursos-cierre` (recordatorio ≤3 días). Los crons de email hacen `JOIN cuentas` (no `empresas`) para el destinatario.
- **No portado:** OCR de PDFs escaneados (deps pdfjs/canvas). Si el pliego no trae texto, `analizar` avisa.
- **OJO envs:** para que los crons de email envíen, el proyecto Vercel `plataforma` necesita `SMTP_*`/`RESEND_API_KEY` (hoy viven en `ialimp`). `NVIDIA_API_KEY` y `CRON_SECRET` ya están. PLACSP da **403** a IPs no-Vercel → la ingesta solo corre en preview/prod.
- **Tablas** (BD compartida, ya aplicadas): `concursos`, `concursos_licitaciones`, `concursos_seguidos`, `concursos_perfil_empresa`, `concursos_radar_criterios`, `concursos_radar_anuncios`, `biblioteca_documentos` (+ columnas `resumen_ia`, `avisado_email_at`, `recordatorio_cierre_at`).

## Subastas de inmuebles del BOE (agente) — PRs #1113-#1120 (28/07/2026)
Radar de subastas judiciales/notariales del BOE con coste real de adquisición. Sección de usuario **🏛️ Subastas** (`app/(usuario)/subastas/{page,SubastasClient}.tsx`). Módulo PURO **`@central/module-subastas`** (BOE parsing, Catastro, geo, extracción de importes en texto español, scoring, comparables de mercado, costes/tesorería del depósito).
- **Ingesta de alertas del BOE por IMAP dedicado, NO por el triaje de correo:** `lib/subastas/gmail-boe.ts` abre «Todos los mensajes» (`specialUse \All`) y busca por remitente (`no-responder@boe.es`) porque las alertas llegan ya etiquetadas/archivadas fuera de INBOX — el lector incremental de `lib/correo/**` (que solo mira INBOX y trunca el cuerpo) nunca las vería. Es una decisión deliberada, no un gap del triaje.
- **🏛️ Surus in situ — 6ª fuente, y la primera que cobra COMISIÓN AL COMPRADOR (13/08/2026):** portal
  privado de subastas de activos en liquidación (concursal/fondos). `fuente='surus'`, `tipo='concursal'`
  (aquí NO aplica el art. 670 LEC: el vendedor se reserva adjudicar o no). Parser puro
  `module-subastas/surus.ts` (lector de etiquetas + **lector COLUMNAR**: «Precio de salida» vive en una
  cabecera de tabla, no en `etiqueta: valor`, y confundir su columna con la de «Valor de tasación» son
  90.000€ de error — hay test que lo fija). Ingesta `lib/subastas/surus.ts` por el MISMO IMAP del BOE
  (`leerAlertas(dias,max,'surusin.com')`, que ya aceptaba otro remitente), colgada de `subastas-ingesta`.
  **`CosteAdquisicion.comisionCompra`**: 5% del remate + 400€ + 21% IVA, NO se descuenta del precio
  (2.299€ sobre una salida de 30.000€). Se aplica **por FUENTE dentro de `calcularCoste`** — mismo
  criterio que el ITP por provincia — para que ninguna pantalla dé un coste distinto por olvidarla;
  tabla `COMISION_POR_FUENTE` en `costes.ts`, las fuentes oficiales NO están ahí (0, no un default
  inventado). También: el **depósito PUBLICADO manda sobre el 5% derivado** en el coste del dinero
  (Surus exige el 25%: 7.500€ sobre 30.000€, y derivarlo al 5% inflaba lo que queda por financiar).
  🚨 **Sin validar todavía: el CORREO de alerta** — Alberto se dio de alta el mismo día y no había
  llegado ninguno, así que la maquetación del aviso no se ha visto. El adaptador aplica el vocabulario
  de etiquetas de las FICHAS (eso sí está copiado del PDF real, `test/fixtures-surus.ts`) y devuelve
  `correosSinLeer` cuando no extrae nada: un aviso ilegible es un hueco CONTADO, nunca «no había
  subastas». Contrastar con el primer correo real y ajustar con ese documento delante.
  ⚠️ **Los lotes de VEHÍCULOS de Surus quedan fuera**: el corpus `subastas` es `es_inmueble` de punta a
  punta (Catastro, m², ITP, flip, comparables). Meter coches ahí pide diseño propio, no un booleano.
- **API:** `app/api/subastas/{criterios,radar,seguidas,route,oferta}`. **Crons** (`vercel.json`): `subastas-ingesta`, `subastas-radar`, `subastas-cierre`, `subastas-mercado`, `subastas-enriquecer`, `subastas-avisos`.
- **Coste real:** ficha del BOE + valor de mercado (comparables) + valor Catastro + tesorería del depósito (`lib/subastas/{tesoreria,mercado,enriquecer}.ts`).
- **Yield con datos PROPIOS (28/07/2026):** `lib/subastas/rendimiento.ts` usa la mediana real de los 4 pisos turísticos del grupo (`incomes` + `properties.bedrooms`) para estimar el retorno de un inmueble en subasta, siempre con caveat de que asume rendimiento similar.
- **Lentes + filtros (29/07/2026):** el embudo de Alberto es «primero rentabilidad; si cuadra, análisis
  profundo de que la documentación sea clara». Módulo puro: `flip.ts` (margen comprar-reformar-vender con
  reforma por baremo €/m² según edad del Catastro), `playa.ts` (🏖️ costa de Huelva, SIN tope de precio) y
  `analisis.ts` (🚦 semáforo documental determinista: posesión/cargas/proindiviso/herencia/valoración/RC).
  App: `lib/subastas/clasificar.ts` rellena `subastas.{es_playa,margen_flip(_pct),flip_apto,semaforo,analisis}`
  al final del cron `subastas-enriquecer`; filtros server-side en `GET /api/subastas` (tipo_bien —🅿️ garaje
  incluido—, playa, m², €/m², sin ocupadas, margen flip, semáforo, municipio) + barra de filtros en la pestaña
  Todas (paginación real contra la API). El radar mete lo de playa AUNQUE no case con los criterios y etiqueta
  🔨 los flips ≥25%.
- **Fotocasa como 2ª fuente de comparables (29/07/2026):** la nota antigua «las alertas de Fotocasa no traen
  detalle» era FALSA para las alertas actuales — sí traen precio/tipo/dirección/habs/m²/enlace por anuncio
  (verificado contra correos reales; parser `fotocasa.ts` del módulo con fixtures reales). Además la FICHA del
  anuncio embebe `clientAlias/clientName/clientTypeId` → `enriquecerAnunciantesFotocasa` etiqueta **👤
  particular** (negociación directa) en `mercado_comparables.{anunciante,es_particular}` (migración
  `2026-07-29_mercado_fotocasa.sql`). Chollos y Telegram muestran el 👤.
- **Puja máxima:** bisección sobre `calcularCoste` para hallar la puja que deja un descuento real objetivo (hereda toda la lógica fiscal, incluida la base imponible por valor de referencia).
- **🏠 SOLO CASAS en los avisos de mercado + la casa se mide contra CASAS (26/08/2026):** Alberto, sobre
  el aviso 💡 (3 de 4 eran pisos): «solo buscamos casas, no pisos». El filtro `esCasa` se aplica en
  `avisarChollos` y `avisarBajadas` (los dos Telegram), **NO en el corpus ni en `detectarChollos`**: los
  pisos siguen entrando a `mercado_comparables` porque SON la mediana de zona, y siguen listándose en
  /subastas (el chip 🏠 Casas de la pestaña ya filtraba a mano). 🚨 A un piso filtrado **no** se le marca
  `chollo_avisado_at`/`bajada_avisada_n`: marcar un «ya te lo enseñé» que no ocurrió lo dejaría mudo el día
  que las preferencias cambien. `esCasa` vive ahora en `comparables.ts` (lo usa todo el agente, no solo la
  lente 🌊) y decide por el **TIPO DECLARADO** — lo que el portal pone antes del « en » del título — porque
  mirar el título entero hacía casa a un «Piso en Villa del Río» o en «Calle Hacienda»; cubre además
  cortijo/masía/alquería y «Finca rústica **con casa**», que `tipoComparable` clasificaba como suelo (una
  finca a secas sigue siendo `terreno`; el €/m² de suelo no contamina porque `esParcela` >400 m² lo saca).
  **Y el descuento:** una casa tiene €/m² más bajo que un piso del mismo sitio, así que compararla con la
  mediana mixta lo exageraba (fixture: 27% real → 63%). `referenciaZona(..., soloCasas)` prefiere la mediana
  de CASAS de la zona cuando hay ≥3 (`fuente:'casas'`, manda sobre la del buscador aunque tenga menos
  muestra); si no la hay cae a la mixta y **el aviso y la ficha lo declaran** — nunca se da por bueno a secas.
- **🗺️ Mapa nacional + enlace a Google Maps (30/07/2026):** pestaña **🗺️ Mapa** (`app/(usuario)/subastas/MapaSubastas.tsx`, Leaflet+OSM por CDN igual que `/operador/flota-mapa`, **montaje perezoso** — el script solo se carga al abrir la pestaña) sobre `GET /api/subastas/mapa`, y botón **📍 Google Maps** en cada ficha (`urlGoogleMaps` del módulo: coordenadas > dirección > municipio; con SOLO provincia NO se enlaza — un pin en mitad de "Sevilla" engaña). **DOS precisiones, siempre declaradas** en `subastas.geo_precision` (migración `2026-07-30_subastas_geo.sql`, aplicada — columnas `lat`/`lon`/`geo_precision`): `'catastro'` = parcela exacta por el servicio LIBRE `Consulta_CPMRC` (⚠️ `<xcen>` es la LONGITUD y `<ycen>` la LATITUD; acepta la ref. de **14** caracteres, con la de 20 del bien responde error) · `'municipio'` = centroide por Nominatim/OSM cuando NO hay referencia catastral (solo 5 de 34 vigentes la traían el 30/07 → sin este escalón el mapa mostraría el 15% del corpus). El mapa pinta los aproximados **en hueco** (`fillOpacity` 0.15 + dashArray) y los abre en un anillo determinista de ~300 m para que los del mismo municipio sean clicables; el pie de mapa separa exactos/aproximados/sin ubicar. Geocodifica el cron `subastas-enriquecer` (solo mientras `lat IS NULL`: las coordenadas no cambian). **🚨 Nominatim exige ≤1 req/s y lo hace cumplir BLOQUEANDO LA IP** (que sería la de Vercel, compartida con todo lo demás): NO basta con que el cron vaya en serie — las filas que solo se geocodifican no pagan ninguna otra latencia y saldrían seguidas. Hay un **cerrojo de módulo** en `lib/subastas/enriquecer.ts` (`esperarTurnoNominatim`, 1,1 s, reserva el turno ANTES de dormir para que dos llamadas concurrentes se encolen en vez de salir juntas) + **presupuesto de 25 s** de geocodificación por pasada (el `maxDuration` es 60 s y `?max=40` se lo comería). Matiz importante: `enriquecida_at` se deja NULL **solo cuando no se llegó a intentar** por falta de presupuesto; si se intentó y Nominatim no resolvió el municipio (p. ej. «LA M1 DE LA UE-1 DEL PP-G3 DE GUILLENA») se marca igual — dejarlo NULL lo devolvería al principio de la cola en cada pasada, que es justo el bug del bullet siguiente. Verificado el 30/07/2026 que el servicio responde 200 desde infraestructura cloud (probado con `pg_net` desde Supabase; el 403 del contenedor de Claude es de su proxy, no del servicio).
- **🏛️ Ubicación EXACTA + datos del Catastro EN LA FICHA (30/07/2026, 2ª iteración):** la queja «la ubicación es muy mala» NO era del punto (era el oficial del Catastro) sino de que **la dirección no se pintaba en ningún sitio** —vivía solo en BD— y de que el enlace usaba `query=lat,lon`, que en Google deja un **pin anónimo** en mitad de la manzana, sin portal ni Street View. Tres cambios: (a) **`direccionCatastro()`** (módulo, puro) trocea el `ldt` denso del Catastro — `AV PEDRO ROMERO (DE) 2 Es:1 Pl:07 Pt:B 41007 SEVILLA` → `{postal:'AV PEDRO ROMERO 2, 41007 SEVILLA', escalera:'1', planta:'07', puerta:'B'}`, quitando los artículos entre paréntesis que ningún buscador reconoce; (b) la ficha y el popup del mapa muestran dirección + planta/puerta + **m² catastrales, año de construcción y uso** (datos que ya se guardaban y no se veían); (c) **🚨 `urlGoogleMaps` prioriza la DIRECCIÓN sobre las coordenadas** — cambio deliberado, con test que lo fija: las coordenadas quedan de respaldo y para `urlStreetView`. Botones nuevos: 👁️ Ver la calle (Street View — la única «visita» posible en las subastas sin acceso al interior) y 🏛️ Catastro (`urlFichaCatastro`, ficha pública con plano).
- **⚖️ Resumen de CARGAS y documentación en la ficha, en TODAS las pestañas (30/07/2026):** el semáforo
  documental y las notas del edicto se pintaban SOLO en la pestaña «Todas» (iban en su prop `extra`), así que
  📡 Radar —la que Alberto mira— salía muda aunque la fila tuviera semáforo, 4 notas y certificación registral.
  Ahora `ResumenDocumental` vive DENTRO de `FichaSubasta` (no en el `extra` de una pestaña): titular de cargas
  SIEMPRE visible (🔴 importe que subsiste / 🟠 no publicadas / 🟢 sin cargas anteriores) + `<details>` cerrado
  con el semáforo, el **texto oficial de cargas** (`cargas_texto`, que nunca se había pintado), las notas del
  edicto y los **documentos adjuntos enlazados**. El radar recibe esos campos del corpus VIVO (`docs` en
  `page.tsx`), no del snapshot. Nueva columna **`subastas.documentos`** (jsonb,
  `prisma/sql/2026-07-30_subastas_documentos.sql`, aplicada): `procesarDocumentosDeFicha` guarda el listado
  ENTERO de adjuntos con `legible` (`false` = escaneado sin capa de texto → la ficha dice «léelo a mano»;
  `null` = no se intentó por el tope de 3 descargas/pasada) aunque solo lea los 3 primeros. La cola del cron
  pasa a `(notas_edicto IS NULL OR documentos IS NULL)` para rellenar las ya procesadas.
  **🚨 LANDMINE — `documentos` NULL ≠ `[]` (30/07/2026):** la columna nació después que las filas, así que
  todo el corpus vivo la tuvo a NULL hasta la primera pasada del cron (06:15 UTC). La ficha pintaba ese NULL
  como lista vacía y afirmaba «sin documentos adjuntos» en subastas que publicaban edicto Y certificación de
  cargas — justo el dato que decide si se puja. El titular sale ahora del helper PURO
  **`lib/subastas/resumen-docs.ts`** (`estadoDocumentacion`/`resumenDocumentos`, testeado): **NULL = «adjuntos
  sin revisar»** (con aviso de abrir la ficha oficial), **`[]` = «sin documentos adjuntos»**. Las fuentes sin
  ficha documental (Junta) pasan `publicaAdjuntos=false` para no quedar «pendientes» para siempre. Regla
  general: **no afirmes una ausencia con un dato que aún no has mirado** — al añadir una columna de
  enriquecimiento, la UI debe distinguir «no lo sé todavía» de «no hay».
- **⏰ Subasta vencida seguía «viva» en el radar (01/08/2026):** ningún camino de LECTURA filtraba por fecha —
  solo el DELETE diario de `archivarPasadas` (06:15 UTC, con 1 día de gracia) limpiaba la bandeja, así que una
  subasta cerrada seguía pintándose pujable 14-38h (o para siempre si el cron fallaba). Filtros canónicos
  **`SUBASTA_VIGENTE`/`RADAR_VIGENTE`/`RADAR_CON_CORPUS`** en `lib/subastas-radar.ts`, aplicados a la SSR de
  `/subastas`, `GET /api/subastas/{radar,mapa}` y el cron `subastas-avisos`; `archivarPasadas` borra sin gracia.
  De regalo: `decidirAviso` gana `cerrada` (evita que «cerró hace horas» suene como «cierra hoy, urgentísimo»)
  y el aviso vuelve a leer `valor_orientativo` (no se seleccionaba, la guarda de rentabilidad nunca saltaba).
- **⚖️ «Cargas no publicadas» ya no se confunde con «sin leer todavía» (01/08/2026):** `cargas_conocidas`
  colapsaba dos cosas distintas en el mismo `false` — el BOE no publica cargas vs. sí las publica pero el
  lector aún no las abrió. Nuevos **`estadoCargas`/`titularCargas`** (6 estados: subsisten/sin_cargas/
  **sin_cuantificar**/publicadas_sin_extraer/no_publicadas/sin_revisar) en `module-subastas/cargas.ts`,
  consumidos por la ficha y por
  `analisisDocumental`. El gate de rentabilidad `mereceAnalisisProfundo` dejó de bloquear también la LECTURA
  de cargas: si la ficha publica el documento se lee igual aunque el flip no compense. `LECTOR_VERSION` 4→5
  (relee lo ya procesado), documentos de cargas se descargan primero en la cola.
- **🔎 Referencia catastral POR DIRECCIÓN — idea de Alberto (30/07/2026):** el BOE publica la dirección casi siempre pero la referencia catastral solo a veces (5 de 34 vigentes), y sin referencia no hay punto exacto. Cadena nueva en `lib/subastas/enriquecer.ts`: `paramsDnploc()` (módulo) saca sigla+vía+número del texto registral → **`resolverNombreVia()`** consulta el callejero (`ConsultaVia`, busca por prefijo) porque **`Consulta_DNPLOC` exige el nombre EXACTO y el Catastro archiva los artículos al final** («Avenida de Madrid» → **«MADRID DE»**) → **`buscarRefPorDireccion()`** (`Consulta_DNPLOC`) devuelve los inmuebles del portal → si todos comparten parcela, esa es la referencia (`parcelaUnica`; si mezcla parcelas la dirección era ambigua y se devuelve `null` en vez de adivinar) → `Consulta_CPMRC` da el punto exacto. **Acierto real medido: 4 de 16** direcciones del corpus; los fallos son por datos de ORIGEN imprecisos (parcelas de polígono, «S/N», direcciones antiguas, locales sin portal propio), no por el parser — verificado a mano que ni «MADRID» ni «MADRID DE» tienen el nº 78 en Catastro. Degrada al centroide del municipio, nunca rompe. ⚠️ **Trampa del parser (costó 10 de 16 fallos):** NO cortar la dirección por la primera coma — en español el número del portal va justo DETRÁS («CALLE ALPECHÍN, 41»). ⚠️ **Los DATOS del bien (m²/año/uso) exigen la referencia de 20:** con la de parcela (14) `Consulta_DNPRC` devuelve el LISTADO del edificio sin bloque `<bico>` y el parseo sale vacío, así que un portal con varios pisos da ubicación exacta pero no datos del piso concreto (no se sabe cuál se subasta).
- **El enriquecimiento ya no reintenta fichas del BOE para fuentes que no las tienen (30/07/2026):** las filas con `fuente <> 'boe'` (23 lotes de la Junta) entraban en `bajarFicha`, fallaban SIEMPRE y —al ir primeras por `ORDER BY enriquecida_at NULLS FIRST`— **monopolizaban la cola sin enriquecerse nunca**. Ahora esas filas hacen solo su geocodificación y marcan `enriquecida_at`. Al añadir una fuente nueva sin ficha en el Portal, cae en esta rama sola.
- **Aviso Telegram por subasta** (no agregado si ≤10/día) con botones `subr_seguir`/`subr_descartar` (prefijo `subr_` en el webhook) — seguir = alta idempotente en `subastas_seguidas`; descartar registra la decisión (base de un aprendizaje futuro, aún no implementado).
- **Captura de resultados** (`capturarResultados` en `enriquecer.ts`, cron `subastas-enriquecer`): re-consulta subastas concluidas y guarda `resultado`/`importe_adjudicacion`. El parser es defensivo (si no reconoce el marcado de "concluida", loguea y deja NULL) — pendiente de validar contra una conclusión real.
- **Antesala concursal:** cruza el corpus BORME (empresas en concurso) contra promotoras/inmobiliarias de las provincias de los criterios de Alberto y avisa por Telegram.
- **Borrador de oferta a la baja** (`POST /api/subastas/oferta`): la IA (cadena gratis `aiComplete`) solo redacta el texto — precio, mediana de zona, bajadas y antigüedad del anuncio siempre vienen de la BD, nunca los inventa.
- **Tablas** (BD compartida, `prisma/sql/2026-07-28_*.sql`): `subastas_seguidas` + las de mercado/comparables/bajadas de precio/chollo avisado.
- **Fase 3 — estado REAL por fuente (29/07/2026, verificado contra cada web viva vía `pg_net` desde Supabase):**
  · **Junta de Andalucía D.G. Patrimonio → HECHA.** Parser puro `junta.ts` del módulo (12 tests con HTML real)
    + adaptador `lib/subastas/junta.ts` cableado al cron `subastas-ingesta` (best-effort). Dos páginas Drupal SSR:
    subastas abiertas (ese día vacía: «Sin subastas…») y **adquisición directa** (18 lotes reales, 4 Sevilla + 2 Cádiz;
    `tipo='venta_adjudicado'`, plazo como `fecha_fin`).
  · **Sareb → INVIABLE por HTTP plano:** muro Incapsula/Imperva (JS challenge) en toda la web. Requeriría navegador real.
  · **BOP Sevilla → BLOQUEADO:** `admbop.dipusevilla.es` y `dipusevilla.es/bop` devuelven 500 desde IPs no
    españolas (probable geo-IP; también afectaría a Vercel iad1).
  · **BOP Cádiz → BLOQUEADO:** TLS roto en `bopcadiz.es` y `bopcadiz.org` (cert inválido; pg_net y undici lo rechazan).
  · **BOP Huelva → APARCADO:** la sede es una SPA Angular (OpenCms/GSede) — el contenido lo pinta JS; habría que
    reverse-engineerear su API interna.
  · **INE €/m² → PENDIENTE de diseño** (la API JSON Tempus responde; es fuente de VALORACIÓN, no de subastas).
  ⚠️ TEMPORAL mientras dure la fase: endpoint puente `/api/subastas/fase3-debug` (token en BD
  `subastas_debug_token`, hosts oficiales cerrados, en PUBLIC del middleware) — eliminarlo al cerrar Fase 3.
- **⚖️ Deuda, puja mínima y umbrales LEC 670 en la ficha (08/08/2026, PR #1324):** `cantidad_reclamada`
  era campo muerto (ahora en ficha, vía alternativa de aprobación del remate art. 670.4 y techo probable
  de la puja del ejecutante — NO es el valor por el que se puja, ese es `valor_subasta`); `puja_minima`
  gana consumidor (`umbralesPuja`/`estadoPujaMinima` en `module-subastas/umbrales.ts`); «Sin puja mínima»
  del portal → centinela **`0`** (≠ NULL «no publicada»; **nunca filtrar `puja_minima > 0` para «tiene
  dato», usar `IS NOT NULL`**). Score/coste siguen conservadores al 100% (decisión de Alberto).
- **🧮 ITP por CCAA, puja en vivo, vivienda habitual y simulador (08/08/2026, PR #1325):** `calcularCoste`
  (`module-subastas/impuestos.ts`) deja de aplicar el 7% andaluz a TODO — la provincia elige el tipo
  general de su CCAA (con escalas progresivas donde aplica). **Vigía de pujas en vivo** en
  `subastas-cierre` (`mejorPujaViva()`, 1 llamada/ficha, seguidas a ≤3 días) → `subastas.mejor_puja(_at)`
  + Telegram 🔥 una sola vez si superan el techo de Alberto (`sobrepuja_avisada_at`; NULL nunca pisa un
  valor visto). **Simulador «¿y si pujo X?»** en la ficha (módulo puro + financiación de criterios).
- **🧾 3ª tanda — coste autoexplicativo, ITP valenciano al 9%, presupuesto del vigía (08/08/2026, PR
  #1327):** el desglose de coste se explica solo en la ficha (sin volver a `impuestos.ts`); Comunidad
  Valenciana gana su tipo general (9%, antes heredaba el genérico); `mejorPujaViva()` (vigía de pujas en
  vivo del PR anterior) gana presupuesto de tiempo propio para no comerse el del cron `subastas-cierre`.

- **🔐 El Portal ESCONDE documentos y pujas tras el login — y el aviso de cierre no había sonado nunca
  (20/08/2026, PR #1537):** dos hallazgos de mirar qué publica de verdad `subastas.boe.es` a un anónimo.
  - **«Cargas no publicadas» con la certificación colgada de la ficha.** El bloque «Información
    complementaria» —donde vive la lista de documentos— **solo se enseña a usuarios identificados**, en
    unas subastas sí y en otras no (lo decide la autoridad gestora). El cron entra anónimo,
    `fichaLegible()` PASA (la ficha ES la ficha; lo que falta es el bloque), `enlacesDocumentos()` devuelve
    `[]`, y ese «no lo veo» se persistía como `documentos = []` = «revisada, el BOE no adjunta nada» con
    `lector_version` sellado → no se reintentaba jamás. Medido: de las 13 vivas, **las 8 que decían «no
    publicadas» tenían muro total; NINGUNA carecía de documentos**. Fix: **`muroDocumental()`** (puro,
    `module-subastas/edicto.ts`, fixtures literales de tres fichas reales) → `ninguno|parcial|total`;
    columna **`subastas.documentos_muro`** escrita SIEMPRE (también el `'ninguno'`: es lo que convierte un
    listado vacío en una AFIRMACIÓN en vez de en un hueco); estado **`ocultas_tras_login`** en
    `titularCargas`/`analisisDocumental`/`resumenDocumentos`, que manda al LOGIN, no al Registro. Con muro
    parcial el documento que SÍ se ve sigue mandando. Las fichas con muro se reintentan cada 7 días sin
    monopolizar la cola del lector. **Comprobado y descartado como alternativa gratis:** el anuncio del BOE
    es un stub de 1,1 KB (juzgado + expediente + enlace al Portal) en las 4 subastas de 3 juzgados
    revisadas; las pestañas `ver=2/3/5` tienen el mismo muro; y lo público de la pestaña Bienes ya lo lee
    el cron. **Las cargas no están en ningún sitio público.** El registro en el Portal exige certificado o
    Cl@ve (una vez), pero luego da usuario/contraseña — eso sí es automatizable, y es lo que hace la sesión
    del apartado siguiente.
  - **El aviso de cierre no se había disparado NUNCA.** Todo `subastas-cierre` colgaba de
    `subastas_seguidas`, que solo se llena pulsando «👀 Seguir» en Telegram: **19 filas en el radar, 18
    avisadas, 0 seguidas**, y `mejor_puja_at` sin estrenar en las 26 filas del corpus. Un aviso que depende
    de un botón que nadie pulsa es un aviso que no existe → los avisos salen ahora del **RADAR** (lo que ya
    pasó el filtro de rentabilidad); las seguidas conservan su camino y el radar las excluye
    (`SIN_SEGUIMIENTO_ACTIVO`) para no avisar dos veces. **Y la puja se leía de la pestaña equivocada:**
    `mejorPujaViva` miraba la GENERAL, donde solo están la puja MÍNIMA y los tramos → no encontraba nada
    nunca, y como el `null` se interpretaba (bien) como «no publicado», el fallo era invisible. La pestaña
    **`ver=5`** sí responde a un anónimo con una de cuatro frases → **`pujasDeFicha`** (puro) con
    `sin_pujas | con_puja | secretas | desconocido`; `desconocido` **NUNCA** se colapsa con `sin_pujas`.
    Medido en las 13 vivas: 5 sin pujas · 5 con puja de importe oculto · 3 secretas por decisión del
    juzgado. **El importe solo se publica al CONCLUIR** (y ahí sí lo captura ya `capturarResultados`).
  - **Dos ventanas de aviso, no una** (petición de Alberto): **💶 «prepara el depósito» a 5 días** y **🚨
    «últimas 24 h»** (`subastas_radar.aviso_deposito_at` / `aviso_cierre_at`). El cuello de botella real es
    el DINERO, no la documentación: el Portal llega a pedir el **20%** del tipo (SUB-JA-2026-262097:
    3.108,68€ sobre 15.543,40€) y avisar la víspera no da tiempo a moverlo. Texto en el helper PURO
    `lib/subastas/aviso-cierre.ts` (testeado): depósito, estado de pujas **con su fecha de lectura**, suelo
    del art. 670 **solo si de verdad no hay pujas** (cantarlo con una puja viva encima invita a pujar por
    debajo de lo que ya hay), techo de puja, cargas y enlace. **Ratio de remate real de SU provincia**
    (`calibracionResultados`), nunca el agregado nacional disfrazado de local: con los 8 remates capturados
    la mediana global es **0,64× el tipo** pero **Sevilla va a 1,42×** (un 165.000€ rematado en 669.900€,
    verificado a mano en el Portal).
- **🛑 EL LOGIN AUTOMÁTICO DEL PORTAL NO ES VIABLE — no volver a intentarlo (20/08/2026, PRs #1548→#1560).**
  Se construyó entero y se probó contra producción. El Portal lo cerró en dos escalones:
  1. **2FA en la única vía automatizable.** El certificado y Cl@ve no los puede usar un proceso; la vía
     usuario+contraseña sí, pero **es justo la que exige un código** enviado al correo Y al móvil
     («Se ha recibido un intento de inicio de sesión **utilizando su usuario y contraseña**…»).
  2. **CAPTCHA.** Tras una ráfaga de intentos, el Portal dejó de pedir el código y pasó a pedir «los
     caracteres de la imagen» (`<input name="captcha" maxlength="6">`). Es un control anti-automatización
     dirigido contra este cron. **No se resuelve**: automatizar el acceso propio de Alberto es una cosa;
     saltarse un «demuéstrame que eres una persona» es otra, y el siguiente escalón es el bloqueo de la
     cuenta, que el propio Portal anuncia en su mensaje de error.
  El código se queda porque **degrada honestamente y se calla solo**: `captcha` y `rechazada` no se
  reintentan nunca, y ambos avisan por Telegram (un cron que se rinde en silencio es indistinguible de uno
  que funciona). El lector sigue en ANÓNIMO, que es lo que hacía antes: las fichas con muro dicen
  «identifícate», no «no hay documentos». Las envs `BOE_PORTAL_*` pueden quedarse: sin sesión no cambian nada.
  - **Lo que sí funcionó y merece la pena recordar:** los documentos SÍ están ahí. Alberto entró a mano con
    Claude Chrome y bajó **18 documentos de las 9 fichas con muro en dos minutos**. Solo una
    (`SUB-JA-2026-265289`, Barbate) publica edicto y **no** certificación de cargas: esa sí hay que pedirla
    al Registro. **Ninguna de las otras 8 carecía de documentación.**
  - **El camino bueno, por tanto, es el buzón de entrada del lector**, no el login — **CONSTRUIDO el
    24/08/2026, por la FICHA y no por Drive**: botón «📥 Aportar documentos» en `/subastas` (componente
    `DocsAportados`, multi-fichero, en cada ficha) → `POST /api/subastas/documentos` → el MISMO lector
    registral que los adjuntos del BOE (doble pasada + consenso, visión para escaneados) → las cargas
    leídas van al corpus `subastas.cargas_*` **con la semántica exacta del cron** (solo pisa cuando hay
    cargas leídas; un PDF ilegible se registra como ilegible, jamás como «sin cargas»). Histórico en la
    tabla **`subastas_docs_aportados`** (migración `2026-08-24_subastas_docs_aportados.sql`, aplicada).
    Dos decisiones no obvias: (a) a diferencia de la nota simple, lo aportado SÍ escribe el corpus global
    — son los MISMOS documentos oficiales del Portal, solo que bajados con sesión; (b) las señales del
    edicto se guardan en `subastas_docs_aportados.notas`, **NO en `subastas.notas_edicto`** — esa columna
    la pisa el cron incondicionalmente en cada pasada del muro y se llevaría lo aportado. Lógica pura en
    `lib/subastas/docs-aportados-logica.ts` (testeada); BD/red en `lib/subastas/docs-aportados.ts`.
  - 🚨 **Dos bugs propios que este episodio destapó, y que son la lección de método:**
    · El detector de sesión buscaba «Cerrar sesión»; la barra del Portal dice **«Desconectar»**. Constaba
      por escrito en dos observaciones de la página viva, y **el fixture del test se redactó con la misma
      suposición que el código**, así que la suite daba verde sobre un detector que no reconocía NUNCA una
      sesión abierta. El fixture de un parser se copia del documento real, jamás se escribe de memoria.
    · El margen de frescura del código OTP era de 30 s «para el desfase de reloj», pero los intentos
      llegaron a estar a **11 s** (porque `desconocido` no se cacheaba y cada llamada relanzaba el login).
      **El margen era más ancho que la distancia entre intentos**, así que se tragaba el código del intento
      anterior. Un margen de tolerancia es una puerta: hay que medirlo contra la frecuencia real del evento.

- **🔓 El cron ya sabe identificarse en el Portal (20/08/2026, PR de seguimiento):** Alberto se registró con
  su firma digital, y el Portal —una vez registrado— admite **usuario (correo o teléfono) + contraseña** en
  `POST /id/login.php`, sin CSRF ni captcha. Eso es lo único de las tres vías de acceso (`/acceso.php`:
  certificado, usuario/contraseña, Cl@ve) que puede usar un proceso automático. **La firma digital NO entra
  en el repo ni en Vercel**: es la identidad legal de Alberto, no una credencial de app.
  - Envs (solo en Vercel, nunca en el repo): **`BOE_PORTAL_USUARIO`** y **`BOE_PORTAL_PASSWORD`**.
    Sin ellas todo sigue funcionando en anónimo, exactamente como antes.
  - **`interpretarLogin()`** (puro, `module-subastas/portal-login.ts`, fixture con la respuesta REAL de
    error) devuelve `iniciada | rechazada | desconocido`. **El éxito se exige POSITIVO** (cabecera «Cerrar
    sesión» + cookie): una respuesta que no lo demuestra es `desconocido`, nunca `iniciada`. Dar por buena
    una sesión que no existe haría que el muro se grabara como «ni registrado se ve», que es el recado que
    manda al Registro a pagar una certificación.
  - **🚨 UN INTENTO Y NO MÁS.** El error literal del Portal es «…los datos de acceso proporcionados son
    incorrectos, el usuario no está activo **o está bloqueado**»: el Portal bloquea cuentas. `rechazada` se
    cachea para todo el proceso y NO se reintenta; solo el `desconocido` (red) es reintentable. El único
    sitio que puede reintentar es el diagnóstico manual `fase3-debug?accion=portal`, que además nunca
    devuelve la contraseña ni la cookie — solo el veredicto.
  - **La sesión se verifica en CADA ficha** (`pareceIdentificada`), no solo al abrirla: las sesiones PHP
    caducan, y si caduca a mitad de pasada el resto de fichas se leerían como anónimas y su muro quedaría
    grabado como lo que ve un usuario registrado.
  - Columna **`subastas.documentos_sesion`** (`true` con sesión · `false` en anónimo · `null` = no consta):
    el mismo `documentos_muro` significa cosas opuestas según con qué ojos se miró — «identifícate» (gratis)
    frente a «pide la certificación al Registro» (tasa + mañana). De ahí el estado nuevo
    **`ocultas_pese_a_sesion`**. Ante `null` se mantiene el recado BARATO: mirar antes que pagar.
  - La cola del lector reintenta las fichas con muro **sin esperar la semana** en cuanto hay sesión y la
    última lectura fue a ciegas: el día que se configuren las envs, las **9** fichas con muro (8 total + 1
    parcial) se releen en la primera pasada. Validado contra la BD real.
  - Si el Portal RECHAZA las credenciales, `subastas-enriquecer` manda **un Telegram**: la degradación a
    anónimo es honesta pero silenciosa, y una contraseña caducada dejaría el lector ciego semanas.

  - **🚨 DOS LANDMINES que `tsc` y `next build` NO cazan, encontradas al probar antes de mergear:**
    **(a)** `datosDe()` leía `pujas_estado`, `pujas_estado_at` y `puja_maxima_calc`, que **no estaban en
    `COLS_SUBASTA`** → las filas llegaban con `undefined` y el aviso salía MUDO («❔ estado de pujas sin
    comprobar», sin techo) **con el dato en la BD**. Las filas de `$queryRaw` son `any`, así que
    `f.columna_que_no_existe` es TypeScript válido. Lo vigila ahora **`lib/subastas/cols-subasta.test.ts`**,
    que lee el FUENTE del cron y exige que toda `f.<col>` esté declarada (probado en rojo quitando una
    columna a propósito). **Al añadir una columna que el código necesita, va a `COLS_SUBASTA` en el mismo
    PR** — ya lo decía el comentario de la constante. **(b)** `vigilarPujas()` usaba
    `SELECT DISTINCT … ORDER BY s.fecha_fin` con `fecha_fin` fuera del SELECT: **SQL inválido (42P10)**, el
    vigía moría en cada pasada. No hacía falta `DISTINCT` (se consulta `subastas` con dos `EXISTS`, no con
    un JOIN). Lección: **el SQL de un cron nuevo se ejecuta contra la BD real antes de mergear** — ni el
    typecheck ni el build miran dentro de un `Prisma.sql`.
  - Migraciones aplicadas: `2026-08-20_subastas_documentos_muro.sql` (columna + re-encolado de lo grabado
    como «revisada y sin adjuntos» + saneo del `analisis` guardado, que repetía la negación en el
    desplegable) y `2026-08-20_subastas_pujas_avisos.sql`. Las 13 vivas quedaron reclasificadas con el muro
    y el estado de pujas MEDIDOS contra el Portal, no supuestos.
  - **De paso:** `GET /api/subastas/radar` devolvía el anuncio PELADO (sin `analisis`/`notas_edicto`/
    `documentos`/`cargas_detalle`), y como la página recarga la bandeja por ahí al marcar «visto», la misma
    ficha que acababa de decir «el BOE SÍ publica la certificación» pasaba a decir «todavía no se ha
    revisado» **con solo tocarla**. Ahora la documentación viaja con la fila y el cliente FUSIONA en vez de
    sustituir (el endpoint no calcula `escenarios` ni la foto viva de la subasta).
  - **PENDIENTE:** llevar el estado de pujas a la ficha de `/subastas` (hoy solo va en el Telegram);
    registrar el MOTIVO del descarte para que el radar aprenda.
  - **🖨️ Rasterizador de PDF (24/08/2026):** los registros escanean en **CCITT G4/JBIG2** (compresión de
    fax, sin un solo JPEG embebido) → `localizarJpegs()` devolvía 0 bandas y la certificación salía
    «ilegible» con el PDF delante (`SUB-JA-2026-262310`, 26 páginas; la de Siero en la prueba del buzón).
    Respaldo en `lib/subastas/rasterizar-pdf.ts`: **PDFium en WASM** (`@hyzyla/pdfium`, MIT, sin binarios
    nativos — en `serverExternalPackages` para que webpack no empaquete el .wasm) renderiza las páginas en
    GRIS y `sharp` las codifica a JPEG; `leerDocumento` lo usa SOLO cuando no hay JPEGs que rescatar (es
    más caro: ~0,8 s/página). Validado contra la certificación real de Punta Umbría (12 páginas legibles).
    OJO: el caso «OCR basura» (texto extraíble pero ilegible, `pareceEscaneado()` mide cantidad y no
    calidad) sigue entrando por la vía de texto — si reaparece, la señal es un cuadro vacío con confianza
    baja sobre un doc con muchos chars.
  - **🚨 LANDMINE — enrutado de IA del lector: `modelo` ≠ `categoria` en `chatConDirector` (24/08/2026,
    PR #1675):** `modelo` es un PIN que SALTA OpenRouter entero (la petición va a la cadena clásica NIM);
    `categoria` elige por catálogo DENTRO de OpenRouter. `leerTexto` pinó un id de catálogo OpenRouter
    (`google/gemini-2.5-flash`) como `modelo` → NVIDIA devolvía 404 → **el lector de TEXTO llevaba muerto
    desde su estreno** (solo funcionaba la visión de escaneados), y lo destapó la primera prueba real del
    buzón. Regla: el lector registral usa `categoria: 'registral'`, jamás `modelo`; lo vigila el guardián
    `lib/subastas/lector-registral-enrutado.test.ts` (lee el FUENTE — ni tsc ni build cazan este bug).
  - **🧑‍⚖️ VEREDICTO en la ficha + ref catastral desde los aportados (24/08/2026, PR #1680):**
    `module-subastas/veredicto.ts` (puro, 11 tests) pinta arriba de cada `FichaSubasta` un titular:
    🟢 interesa (con techo de puja por bisección sobre `calcularCoste`, descuento objetivo 25%) /
    🔴 no interesa / 🟠 faltan datos (y dice CUÁLES) / ⚫ cerrada. **Asimetría deliberada:** el 🔴 es
    afirmable con piezas sin resolver (lo que falta solo empeora); el 🟢 exige valor de mercado REAL
    (la estimación m²×€/m² de zona NUNCA sentencia — siempre 🟠) y cargas resueltas. Razones: techo vs
    `cantidad_reclamada` («hasta ahí el ejecutante puede sobrepujarte sin gastar un euro»), ocupada→
    lanzamiento, y **📊 probabilidad de quedártela** por calibración de remates (`calibracionAdjudicaciones`):
    compara techo/tipo contra el ratio mediano de SU provincia, y el agregado nacional se DECLARA como tal
    («sin muestra de Asturias; mediana global 0,64×»), nunca disfrazado de local. Además
    `procesarDocAportado` extrae la **referencia catastral** del texto/literales de cargas
    (`extraerRefCatastral`) → tapa `subastas.ref_catastral` SOLO si estaba NULL y pone `enriquecida_at=NULL`
    para que el cron nocturno traiga m²/año/uso del Catastro (idea de Alberto: Siero no publicaba m²).

## 🔓 `/api/publico/*` — el único endpoint sin sesión, y su landmine de CORS (20/08/2026)
`GET /api/publico/disponibilidad?piso=<slug>&meses=<1..12>` alimenta el calendario de la landing de
House Sevillana (`apps/housesevillana`). Está en la lista `PUBLIC` del middleware a propósito: publica
solo qué noches están cogidas de una lista blanca de 4 slugs — lo mismo que el motor de Smoobu ya enseña
a cualquiera. Degrada Smoobu en vivo → `rate_snapshots` de ≤2 días (devolviendo la fecha del snapshot,
no `now()`) → **503**, nunca `ocupadas: []`: aguas abajo eso se pintaría como calendario entero libre.

**🚨 LANDMINE — una respuesta CACHEADA no puede depender del `Origin`. Y en Vercel, `Vary` NO te
salva.** La respuesta lleva `s-maxage=600`, así que la sirve el CDN. Se rompió DOS veces el 20/08/2026:
1. **PR #1500** devolvía el origen literal si estaba en una lista blanca. El CDN guarda **una sola
   copia**, así que **la primera petición decidió las cabeceras de todas durante 10 minutos**: la
   primera fue un `curl` de comprobación SIN `Origin` → copia sin `Access-Control-Allow-Origin` → el
   navegador de housesevillana.es la rechazó y la landing enseñó su aviso de error.
2. **PR #1519** añadió `Vary: Origin` a todas las respuestas, que es lo que manda el estándar HTTP.
   **No funcionó: el CDN de Vercel no cachea por `Origin`** — sirve una copia única y encima ELIMINA
   el `vary: Origin` de lo que entrega. Medido en producción tras desplegar: **12 de 12** peticiones
   desde housesevillana.es recibieron la copia dejada por un curl con `Origin: https://competencia.com`
   (`x-vercel-cache: HIT`, sin ACAO, sin `vary`). El calendario siguió roto igual.

**Arreglo (PR #1521): `Access-Control-Allow-Origin: *` FIJO** y la lista blanca retirada. La respuesta
pasa a ser idéntica para todos, así que da igual qué copia guarde el CDN. Es seguro porque el endpoint
es público a propósito y **no lee sesión** (con `*` el navegador ni deja mandar credenciales); la lista
blanca no protegía nada —no hay nada que robar— y era justo lo que hacía la respuesta variable.
- Helper puro **`lib/sivra/cors-publico.ts`** (4 tests): no acepta argumentos **a propósito**, y uno de
  los tests lee el fuente de la ruta para vigilar que no vuelva a ramificar por `Origin`.
- Si algún día este endpoint leyera sesión, `*` deja de valer — y entonces lo que se quita es la
  **caché** (`no-store`), no se vuelve a la lista blanca: seguiría siendo una respuesta variable
  servida desde una caché que no varía.
- **Verificar CORS exige el camino real:** `curl -H "Origin: https://housesevillana.es"` y mirar que
  vuelve la cabecera. Un 200 de `curl` a pelo no prueba nada — curl no manda `Origin`. Y con caché de
  por medio, **una sola petición tampoco prueba nada**: repite varias veces y mira `x-vercel-cache`.
- Al añadir otro `/api/publico/*` cacheado, esto es parte del PR, no un apaño posterior.

**🚨 Y LA TERCERA CAPA, la que sobrevivió a los dos arreglos anteriores: `s-maxage` sin `max-age`
NO significa «cachea solo el CDN».** Con el endpoint ya correcto y medido 12/12, la landing SEGUÍA
enseñando el aviso de error. `s-maxage` solo habla con las cachés compartidas, así que para el
navegador la respuesta no tenía vida útil declarada → se calcula por heurística (cero, sin
validador) → y el `stale-while-revalidate` le AUTORIZA a servir su propia copia guardada hasta una
hora. Esa copia era la rota de antes del arreglo: **el navegador no preguntaba, se respondía solo**,
y desde el servidor era invisible. Fix (#1523): `public, max-age=0, must-revalidate, s-maxage=600`
—se renuncia al SWR porque no se puede pedir solo para el CDN— más `cache:'no-store'` en el `fetch`
del widget, que mira solo a la caché del navegador. Hay dos tests que lo vigilan.
**Confirmado funcionando por Alberto el 20/08/2026.**

## 🛑 El canal: un piso que NO se ajusta no puede evaporarse del parte (22/08/2026)
`/api/sivra/pricing/canal` reparte los pisos en **tres** cubos, no dos (`repartirCambios` en
`lib/sivra/pricing-canal.ts`, puro y testeado): **`cambios`** (se ajusta) · **`frenados`** («no he
podido»: sin ajuste fiable, interruptor bajado, o **el paso acotado no mueve la base redondeada**)
· **`sinCambio`** («no hacía falta»: la recta vigente ya cuadra).
- **Caso fundacional.** Antes había dos `continue` MUDOS —`desviacion === 'ok'` y «la base no se
  mueve»— que no dejaban rastro en ninguna lista. El parte decía «4 pisos · 3 ajustados» y el cuarto
  desaparecía, así que «ya cuadra» y «está desviado y no he sabido moverlo» se leían igual. **House
  Sevillana llevaba del 17 al 22/08 con el `channel_markup` = 1,20 INVENTADO** que este cron existe
  para corregir, mientras los otros tres se calibraban a ~0,95–1,04 + cuota fija.
- 🚨 **`usada_en_ajuste_at` se marca solo en los pisos AJUSTADOS, nunca en los MEDIDOS**
  (`ventanasAConsumir`). El marcado iba por `estado === 'medido'` —se pudo medir— en vez de por «se
  ajustó», que son cosas distintas: House quemaba sus 7 ventanas de aforo 12 en cada pasada sin
  corregirse, y se quedó **a cero de muestra limpia**. Un piso frenado que además pierde su muestra
  no vuelve a tener con qué corregirse: el freno se hace permanente por agotamiento, en silencio.
  El flag existe para romper un círculo (una ventana que produjo la recta ya no puede validarla);
  si no hubo recta nueva, no hay círculo que romper y la muestra sigue limpia.
- El detalle del latido antepone `🛑 N SIN corregir (piso: motivo)` y la respuesta expone
  `frenados` y `sin_cambio` por separado. Hermano de la regla «un dato que NO hay ≠ dato que NO se
  ha mirado» del CLAUDE.md raíz, aplicada a las ACCIONES: un «no lo he hecho» no puede presentarse
  como un «no hacía falta».

## 🛑 La pasada de mercado más FRESCA no es la más informativa (23/08/2026, PR #1594)
`pricing/apply`, `pricing/settings` y `pricing/pilot-track` elegían corpus con
`SELECT scenario, MAX(search_date) FROM market_rates` **sin más condición**. El 22/08 corrió el
barrido barato (`serper`) y NO la rutina `mercado-booking`: el `MAX` cayó en una pasada de 22
comparables de los que **1** sobrevivía al filtro de €/plaza (`MIN_EUR_PLAZA_COMP`) — el resto,
apartamentos de 45-108€ etiquetados «aforo 12». Con `1 < MIN_SAMPLE (5)`, el apply saltó **House
Sevillana entera**: cero filas en `pricing_applied` en todo el día, justo el día en que su canal
acababa de corregirse de 1,20 a 1,0872 / 213,50€. **No faltaban datos**: la pasada del día anterior
tenía 93 comparables plausibles. Una pasada ilegible SOMBREABA a una legible — la familia de «un
`catch` que devuelve `[]` no autoriza a afirmar que no hay nada», pero con un `MAX()` en vez de un
`catch`.
- **Cura:** `lib/sivra/pricing-corpus-utilizable.ts::sqlUltimaPasadaUtil()` (puro, testeado, va por
  `Prisma.raw`) elige la última `search_date` que deja ≥5 comparables plausibles, **filtrando por
  €/plaza ANTES de contar**. Cableado en las tres consultas. El tope de frescura NO se toca:
  `MAX_MARKET_AGE_DAYS` sigue vigilando que la pasada elegida no sea vieja — retroceder un día está
  bien, retroceder un mes lo sigue frenando.
- **El sesgo es lo desagradable:** los otros tres pisos se libraron **por casualidad**. Con 2, 4 y 5
  plazas su umbral de €/plaza es 24, 48 y 60€ y el ruido lo pasa; House necesita 144€. **Cuanto más
  grande es el piso, más fácil le es caer** — y el piso grande es el que más factura.
- **El hueco no sonaba:** `skipped:"datos_insuficientes"` vivía SOLO en el array `results` de la
  respuesta HTTP. Un piso de cuatro dejó de tarificarse un día entero y no lo dijo ni Telegram ni el
  latido (`sivra_pricing_guard` reportó «ok · 0 alertas nuevas»). Ahora hay aviso agrupado
  (`avisoPisosSinTarifar`, dedupe por piso y día sobre `pricing_avisos` porque el motor corre 3 veces
  al día) y campo `sin_tarifar` en la respuesta. **No** marca `ok:false` a propósito: los demás pisos
  sí se tarificaron, y el vigía de latidos sigue reservado para lo que invalida la pasada entera.
- **`apply-auto` YA deja latido propio** (`sivra_pricing_apply`, 23/08/2026 — antes había que
  deducirlo a mano contra `lib/cron-dispatch.ts`, porque «0 filas en `pricing_applied`» no distingue
  «corrió y nada se movió ≥3%» de «no corrió»). Ver el apartado siguiente.

## 🛑 El precio que Smoobu RECHAZA + el latido de `apply-auto` (23/08/2026)
Hallazgos 🔴 1 y 2 de `docs/AUDITORIA-2026-08-pricing-mudo.md`, cerrados juntos porque son el mismo
silencio en el mismo eslabón: **el que pone el precio delante del huésped**.
- **Latido `sivra_pricing_apply`** (cron 08:30 · 14:30 · 20:30). **Umbral 26 h, y el número está
  razonado, no copiado**: el hueco legítimo más largo es 20:30 → 08:30 = 12 h, y el vigía comprueba
  a las 07:45 (11,25 h en un día sano). Con 26 h salta al perder un DÍA ENTERO y se calla si solo
  faltó una pasada suelta. **Los 30 h de los crons diarios NO valen aquí** — no llegaría a saltar
  hasta perder día y medio. Escribe **latido de INTENTO al arrancar** (lección de `facturas-scan`,
  31/07): son 365 días × 4 pisos contra Smoobu con `maxDuration = 300`, y sin esa marca un 504 a
  mitad sería indistinguible de «el cron no se dispara».
- **🚦 Lo que NO pone el latido en rojo, a propósito:** `0 noches escritas` (es «nada cruzó el 3%»;
  lo que no puede ser es indistinguible de «no corrió», y eso lo arregla que EXISTA el latido, no
  su color), un piso `sin_tarifar` (tiene su propio aviso) y `demanda_degradada` (degradación menor
  ya declarada). Un vigía que grita por lo que no le toca acaba ignorándose.
- **La pausa global gana al «SIMULACRO» en el parte**: `apply` convierte la pasada en `dryRun`
  cuando `pricing_config.paused`, así que ambos casos llegan con el mismo flag. Sin distinguirlos,
  una pausa OLVIDADA —el motor entero apagado— se leería como una llamada de prueba.
- **Smoobu rechaza → 🛑 Telegram + `ok:false` + latido rojo** (antes: solo una línea en el array
  `results` de la respuesta HTTP, que no lee nadie). **SIN dedupe**, al revés que el aviso de
  `sin-tarifar`: aquel se repite las 3 pasadas porque el corpus tarda un día en rehacerse; éste es
  una avería VIVA del canal y hay que oírla las tres veces.
- 🚨 **Y lo menos obvio: si Smoobu rechaza, NO se anota en `pricing_applied`.** Anotarlo igual
  —que es lo que se hacía— cuesta dos cosas, y la segunda muerde: (1) la tabla de auditoría afirma
  «481€ aplicado» con el canal en 534€; (2) **`pricing_applied` es de donde sale `ref24`, el ancla
  del raíl de MAÑANA**, así que un precio fantasma se convierte en el punto desde el que se mide el
  ±20% y el error se propaga y se compone. En simulacro sí se anota (`dry_run=true` lo distingue y
  `ref24` ya lo excluye).
- Lógica en el módulo PURO `lib/sivra/pricing-latido-apply.ts` (`pasadaFiable`/`detalleApply`/
  `avisoSmoobuRechaza`, 15 tests), no incrustada en el route.

## 🛑 El raíl CIEGO: si no se puede leer el ancla, NO se tarifa (23/08/2026)
Hallazgo 🔴 3 de la auditoría. Las dos lecturas que alimentan el ancla (`ref24` = último precio
aplicado ANTES de hoy; `anclaHoy` = con qué precio empezó el día la fecha) colgaban de un
`.catch(() => [])`.
- **Por qué era invisible:** un `[]` es LEGÍTIMO (fecha sin histórico, 1ª pasada del día), así que
  el fallo de consulta entraba por la MISMA puerta que el caso normal. `anclaRail()` caía a `actual`
  para TODAS las fechas y, con 3 pasadas al día, el tope dejaba de ser ±X%/día para ser ±X%/PASADA.
  Es el agujero del 19/08 (−36% en 16 fechas de House) **por otra puerta**: allí faltaba histórico,
  aquí falla la consulta. Y que puede fallar no es teórico — el `42883` del 20/08 tumbó `sivra_canal`
  en esta misma cadena.
- **La cura no es adivinar un ancla, es NO TARIFAR:** si cualquiera de las dos revienta, la pasada
  se aborta (**503** + `ok:false` + `rail_ciego` + Telegram + latido en rojo). Una pasada saltada
  cuesta seis horas de precio viejo; una con el raíl ciego puede costar la mitad de la noche. La
  siguiente pasada lo reintenta sola.
- **Se aborta también en SIMULACRO**, a propósito: un preview con el raíl 3× más ancho son números
  que nadie debería mirar, y así queda un solo camino que razonar.
- 🚨 **El aviso CALCULA el tope real** (`topeRealSinAncla`, en `pricing-ancla-rail.ts`) en vez de
  citar el «−49%/+73%». `max_change_pct` es POR PISO y las pasadas salen del cron: un número
  hardcodeado deja de ser verdad al cambiar cualquiera de los dos, y **un aviso con un número falso
  es peor que uno sin número**. `PASADAS_POR_DIA_APPLY` (en `pricing-latido-apply.ts`) lo vigila un
  test que lee el FUENTE de `cron-dispatch.ts`: si alguien añade una 4ª pasada, salta en rojo.

## 🟡 Los tres amarillos de la auditoría del pricing, cerrados (24/08/2026)
Hallazgos 4-6 de `docs/AUDITORIA-2026-08-pricing-mudo.md` (los 🔴 se cerraron el 23/08):
- **Las 6 lecturas auxiliares del `apply` que caían a `[]` en silencio** (vuelos, antelación,
  bucket-mes, bucket-fecha, prior estacional, velocidad) ahora se DECLARAN sin abortar:
  `lecturasCaidas` → `ok:false` + campo `lecturas_degradadas` + Telegram con el EFECTO de cada señal
  perdida (`lib/sivra/pricing-lecturas.ts`, puro) + latido rojo vía `apply-auto`. Solo las anclas del
  raíl ABORTAN (eso cambia el tope del daño); estas seis tienen fallback y lo que no podían es callar.
- **`pilot-track` dejó de ser un watchdog mudo**: rojos + avisos de datos → Telegram
  (`avisoPilotTrack` en `lib/sivra/pilot-track.ts`; el día normal = `null`, sin ruido). Los avisos de
  DATOS van primero: un rojo medido sobre un snapshot viejo puede ser mentira.
- **Los 5 jobs sin latido ya laten** (todos diarios, umbral 30 h): `sivra_rates_snapshot` (el que más
  pesa: precio vivo + ocupación), `sivra_resumen_diario` (su «cómo fue el día» vive en el DETALLE del
  latido, sin Telegram diario a propósito), `sivra_pilot_track`, `sivra_experimentos` (el bucle de
  aprendizaje). El 5º (`sivra_mercado_cron`) se retiró horas después junto con toda la vía Serper —
  ver el 🪦 del landmine `market_rates.fuente`.
- 🚨 **`mercado/cron` ya no se traga los fallos de Serper**: así murió la vía Serper ENTERA del 22 al
  24/08 (cero filas `fuente='serper'` en `market_rates`) con `ok:true` en cada pasada — el
  `catch { return [] }` de `searchPortal` convertía «Serper caído» en «0 comps hoy». Ahora los fallos
  se anotan, el `ok` y el latido los reflejan, y los TRES `serperSearch` del repo incluyen el CUERPO
  del error: «Serper 400: Not enough credits» manda a recargar la cuenta en serper.dev; un «400»
  pelado mandaba a leer código.

## 💓 Latidos de agentes — el vigía que avisa por Telegram (ampliado 30/07/2026)
`lib/monitoring/latidos.ts` (registro + `evaluarLatido` puro) + cron `agentes-latido` (07:45 UTC) →
**Telegram**. Regla de oro: solo se vigilan huellas que se refrescan en CADA pasada del agente.
- **Huella para los agentes que solo escriben "cuando hay trabajo": tabla `agente_latidos`**
  (`prisma/sql/2026-07-30_agente_latidos.sql`, **aplicada**; `agente` PK, `ultimo_at` = último intento,
  `ultimo_ok_at` = última pasada BUENA, `ok`, `detalle`). Se escribe con `lib/monitoring/latido-escribir.ts::registrarLatido`.
  La frescura se mide sobre **`ultimo_ok_at`**, así que un agente que corre y falla siempre también salta.
  Estrenada por el **escaneo de facturas de Gmail** (`facturas-scan`), que antes no tenía NINGÚN vigilante
  porque `facturas_proveedor` solo crece si llega una factura. `escanearNuevasFacturas` devuelve ahora
  `{nuevas, ok, error}`: un `nuevas:0` con `ok:false` es «no se pudo mirar el buzón», no «no hay facturas»
  (antes el chat contestaba «No tienes facturas de proveedor pendientes 🎉» con el IMAP caído).
- **`ialimp_pms`**: vigila `pms_connections.last_sync_at` (la columna VIVA; `ultimo_sync` no la escribe
  nadie — ver el landmine en `apps/ialimp/CLAUDE.md`) y además avisa si hay `sync_error`, porque el sync
  marca la fecha aunque la pasada haya fallado. Es infraestructura del SaaS de Alberto, **no** el backlog
  operativo de Vanessa (eso sigue vetado, ver Check 6 retirado).
- **🚨 «0 facturas nuevas» tapaba los correos que la IA no supo leer (02/08/2026).** Con el latido ya
  arreglado, la primera pasada buena reportó «0 factura(s) nueva(s)» **con la extracción por IA fallando
  en los logs** (NIM timeout, Groq JSON truncado). El motivo: `escanearNuevasFacturas` descartaba con un
  `if (!importe) continue` mudo, así que un correo ilegible no contaba como nueva, ni como pendiente, ni
  dejaba rastro — el mismo «no lo sé» disfrazado de «no hay», un nivel por debajo del latido. Fix:
  **`aiExtractInvoiceDetallado`** (en `lib/ai-client.ts`) distingue **`'tecnico'`** (ningún modelo
  respondió → NO se ha leído) de **`'sin_datos'`** (respondió y no era factura → SÍ se ha leído); solo el
  primero cuenta como `sinLeer`, se etiqueta en Gmail (**`Facturas/Extraccion-fallida`**, cola persistente
  que sobrevive al contenedor) y sale con ⚠️ en el parte del latido vía el helper PURO
  `lib/agente-facturas/resumen-escaneo.ts` (`detalleEscaneo`/`recuentoFiable`, testeado). ⚠️ Límite
  asumido y documentado: la ventana del escaneo es de 7 días, así que un correo que falle 7 días seguidos
  deja de reintentarse solo y se queda en la etiqueta para revisión a mano — no se promete un reintento
  eterno. Al añadir un descarte nuevo en un agente, la pregunta es siempre la misma: ¿esto es «he mirado
  y no hay» o «no he podido mirar»? Si es lo segundo, tiene que contarse y dejar cola.
- **🚨 «0 comps» del barrido de mercado eran 44 búsquedas VACÍAS (02/08/2026).** Primera pasada vigilada
  de `sivra_mercado_sweep`: `0 comps en 44 ventanas`, latido en rojo, sin un solo error. No era el mercado
  ni la IA: **Serper devolvía `organic: []`** para la consulta con el operador `site:booking.com` (los 41
  prompts que llegaron a la pasarela pesaban 149-278 tokens contando la respuesta, contra los 576-933 del
  scraper diario `mercado/cron`, que sí trae comps con una consulta abierta). Con la búsqueda vacía la IA
  responde `{"apartments":[]}` —correctamente— y el `catch { return [] }` de la extracción remataba: un
  «no he podido mirar» servido como «no hay mercado». Fixes: (a) `serperSearch` devuelve **cuántos
  resultados** trajo y aprovecha `answerBox`+`sitelinks` como el cron diario; (b) `extractPrices` separa
  `'sin_leer'` (fallo técnico) de leído-sin-precios; (c) **segunda consulta ABIERTA** (sin `site:`) cuando
  la primera vuelve vacía, acotada por `SIVRA_SWEEP_MAX_ABIERTAS` (default 20) porque cada intento es una
  búsqueda de pago; (d) el parte y el `ok` salen del helper PURO **`lib/sivra/resumen-sweep.ts`**
  (`detalleBarrido`/`barridoFiable`, testeado). ⚠️ **La consulta abierta trae mercado pero puede no
  distinguir la fecha**, y un corpus plano etiquetado con fechas futuras es una temporada inventada: por
  eso `sinSenalDeTemporada` marca la pasada como NO fiable si todas las fechas de un aforo acaban con los
  mismos comps al mismo precio (≥3 fechas). Sin comps propios de la fecha el motor cae al ancla global,
  que está dominada por las fechas cercanas y más baratas.
- **🏨 `sivra_mercado_booking` — la huella de una RUTINA, no de un cron (06/08/2026).** El corpus por
  fecha lo mide ahora una rutina diaria de Claude con el conector de Booking (skill `mercado-booking`),
  porque a un conector se le pregunta desde una sesión. Para que el vigía la vea igual que a los crons
  hay un puerto nuevo **`POST /api/internal/latido`** (auth de rutina, **allowlist de agentes** — el
  token viaja en prompts, así que no puede inventar agentes ni tocar la huella de un cron).
  **🚨 LANDMINE — `market_rates.fuente` (migración `2026-08-06_market_rates_fuente.sql`, aplicada):**
  los TRES caminos que escriben el corpus por piso ponían `portal='booking'` y eran indistinguibles
  (barrido Serper · ingesta por conector · carga a mano). El motor (`pricing/apply`) **no filtra por
  portal**: los mezcla en el mismo percentil. Medido ese día para el Dúplex el 4-sep, Serper daba
  **p50 171€** (bucket del mes, elegible) contra **129€** reales de Booking: +33%, y los mismos comps
  repetían precio en agosto, noviembre y marzo — los snippets de búsqueda traen precios de ANUNCIO,
  sin fecha. `fuente` (`serper`|`booking_mcp`|`manual`, **default `serper`** = lectura conservadora)
  es lo que permite medir cobertura fiable (`FUENTES_FIABLES` de `lib/sivra/mercado-cobertura.ts`
  excluye Serper) y, en la fase 2, retirarlo sin adivinar por heurística de fechas.
  **🪦 El sweep de Serper SE APAGÓ el 24/08/2026** (con la condición de arriba ya cumplida, no
  antes): la cuenta agotó créditos el 22/08 y Booking acumulaba 1.100-1.300 comps fiables por piso en
  95-99 fechas — dos días sin Serper y el motor tarificó los 4 pisos sin inmutarse. Los dos crons
  (`mercado/cron` 07:15 y `mercado/sweep` 03:00) están fuera de `CRON_JOBS` y sus latidos fuera del
  registro; las rutas siguen vivas para llamadas manuales si vuelve a haber SERPER_API_KEY.
  **`fuente` NO es `corpus_clonado`** (columna hermana de #1282, mismo día): `corpus_clonado` es el
  veredicto de UNA pasada (la guardia de medianas clonadas la marcó) y ya excluye a las pasadas del
  sweep del 05/08 en adelante de los buckets por mes y por fecha; `fuente` es la PROCEDENCIA de la
  fila y es lo que mide cobertura fiable. Siguen sin marcar las ~1.466 filas `serper` anteriores al
  05/08 (55 fechas), que sí alimentan el bucket mensual (ventana de 120 días de `search_date`), y el
  ancla global no se filtra por ninguna de las dos a propósito.
  Diseño y gate completos: `docs/superpowers/specs/2026-08-06-mercado-booking-design.md`.
- **🔍 `sivra_eventos_verificar` — los eventos PREVISTOS ya no esperan a Alberto (12/08/2026).**
  Su respuesta al aviso 🔮 que le pedía pasarlos a `confirmado`: «esto tiene q ser automático, yo no
  sé de esta información». Ese Telegram se retiró (y además mentía: decía «NO suben el precio» cuando
  desde la v2 del 09/08 un previsto LEJANO sí lo sube ponderado). Ahora decide el cron
  **`/api/sivra/eventos/verificar`** (05:30 UTC, detrás de los dos descubridores) con tres señales
  independientes en `lib/sivra/eventos-verificacion.ts` (PURO, testeado con pares reales del corpus):
  **fuente dura** (otra fila ya `confirmado` en la misma fecha con nombre parecido — `nombresParecidos`
  exige 2 palabras significativas: un concierto DE la Bienal confirma «Bienal de Flamenco», una
  convención de tatuajes no) · **prensa dirigida** (`buscarWeb` por evento; confirma con confianza
  ≥0,8, `desmentido` descarta, y si da OTRA fecha el evento se **muda** a la buena en vez de perderse)
  · **mercado real** (comps `booking_mcp`/`manual` ≥25% sobre la línea del mes de ese piso, con ≥4
  comps y ≥3 fechas de base; hoy casi siempre `sin_datos`, y eso es correcto). Caducidad a 21 días
  vista. 🚨 **Una búsqueda caída NO descarta nada**: solo suman las verificaciones ÚTILES
  (`pricing_eventos_auto.verificaciones`, columnas de `2026-08-12_eventos_verificacion.sql`, aplicada)
  y el latido se pone en rojo — un verificador mudo deja previstos eternos igual que antes, pero en
  silencio. Telegram SOLO para el pelotazo auto-confirmado (factor ≥`SIVRA_EVENTOS_PELOTAZO`, 1,4).
  `decidido_por='alberto'` en una fila la saca del alcance del cron para siempre.
- **🚨 LANDMINE — un precio que la app se cree sin contrastar envenena el track record (08/08/2026,
  PRs #1315 y #1317).** `/api/trading/puntuar` cogía `precios[simbolo]` tal cual lo mandaba la sesión.
  El 03/08 entró **`CVX = 590,17$`** con cierre real **193,18$** (contrastado contra IBKR): puntuó 12
  tesis vencidas, tres a **+205 pp**, y como `trading_estrategia_stats` se recalcula sobre TODOS los
  resultados y `ajustesDeStats` lo convierte en delta de confianza del torneo (activo con n=81), estuvo
  cinco días inclinando decisiones — momentum pasó de **−0,40 pp a +7,18 pp** de media y «reversión
  bajista» cambió de SIGNO. Dos filtros en cadena, los dos con tres estados (**sin con qué comparar NO
  se juzga**): guardia del **×2** contra el último `precio_ref` *anterior a hoy* (nunca el de hoy: una
  pasada envenenada lo está por las dos puntas) y **contraste con 2ª fuente** (Stooq→Yahoo, 2%, el mismo
  cierre) — el ×2 solo caza lo escandaloso, un error del 10% pasa limpio y mueve el retorno 10 puntos.
  Se aplica también en **`/analizar`, que es el ORIGEN**: ahí el símbolo se salta ENTERO, porque sus
  velas alimentan `indicadoresDe` y contaminan EMA/MACD/RSI/ADX igual que el precio. Y en los **stops**:
  un precio hundido cierra una posición paper que en el mercado real nunca saltó. Todo lo vetado viaja
  en la respuesta y se canta por Telegram — un símbolo que desaparece en silencio es indistinguible de
  uno que hoy no dio señal. Hermanas: `trading_*.precio_fuente` (procedencia, patrón `market_rates.fuente`),
  `ventana_dias` = días reales y no el horizonte declarado, y el aviso de salto del NAV >15% en `/saldo`
  (no bloquea: puede ser un ingreso real, pero con el NAV se dimensiona cada compra).
- **📉 Reglas de SALIDA del paper: H10 firmada y midiendo, y el stop que sigue vivo contra H9
  (28/08/2026, PR #1836).** **✅ H10 RESUELTA el 31/08/2026** con el ciclo completo (183.093 obs.):
  ninguna de las 7 variantes cumple el criterio firmado — todas las que frenan batacazos ceden >1 pp
  de mediana — y la salida por TIEMPO queda validada por 2ª vez (ya cableada, `venceVentana`). Sin
  cambio de código; cifras en `docs/TRADING-SALIDAS-2026-08.md` y veredicto en el pre-registro. Alberto pidió salida **no** por tiempo («ir subiendo el stop, o pérdida de
  media») y que decidieran los datos. Medido primero sobre **183.093 observaciones** del retrovisor
  (**8,6×** la muestra con la que se resolvió H9): la salida por TIEMPO sigue ganando (mediana **+3,12%**
  frente a +0,45% del stop −10%, +2,75% del −20% y +1,22% del trailing −15%) — y **gana en los CINCO
  quintiles de momentum**, lo que **REFUTA** el caveat de literatura que H9 dejó firmado («los stops
  ayudan al momentum»): en Q5, que es justo lo que el agente compra, es donde más cuesta (−4,43 pp).
  Ese corte por quintil es **post-hoc**: cierra el caveat, no autoriza a cablear nada.
  - **H10** (firmada ANTES de recolectar un dato) mide las cuatro variantes que H9 nunca probó —
    `salidaTrail25` (trailing ancho), `salidaCoste10` (stop a coste tras +10%), `salidaSma50` y
    `salidaSma200` (pérdida de media)— por la MISMA máquina y con los mismos criterios de
    entrada/horizonte que H9 (`lib/trading/salidas.ts`, comparación manzana-con-manzana contra `ret91`).
    Las rellena el cron `trading-backtest`, que rota por símbolo cada 2 h: el ciclo completo tarda días.
  - 🚨 **Dos trampas del módulo, las dos con test:** (a) las SMA se calculan **solo con los cierres ya
    conocidos** en cada día simulado — con la serie completa sería look-ahead puro; (b) sin historia
    suficiente, `salidaSma50/200` se quedan en **NULL** = «no se pudo evaluar», y NO se rellenan con el
    retorno del horizonte: eso contaría como «la regla no vendió» una regla que nadie midió.
  - **Evaluador** `lib/trading/h10.ts` (PURO) + cron semanal **`trading-h10`** (`40 8 * * 1`). El
    criterio firmado tiene **una sola puerta** (`decidir`), entren los datos como observaciones sueltas
    o como agregados de SQL, para que no puedan existir dos umbrales. Agrega **en SQL** a propósito: las
    7 variantes × 183.093 snapshots serían ~1,3 M de filas dentro de una función serverless. `sin_muestra`
    NUNCA se colapsa con `rechazada`. **El cron no cablea nada** — el cambio de política entra por PR.
  - ✅ **RESUELTO el 28/08/2026 — el paper ya vende por TIEMPO.** `aplicarStop` se retiró y su sitio lo
    ocupa `venceVentana`: la posición guarda `horizonteDias` (la ventana de su tesis) y esa es su ÚNICA
    salida, que es lo que H9 firmó y lo que el panel llevaba prometiendo. **La distancia de 2·ATR se
    conserva**: no es un stop, es el ANCLA DEL TAMAÑO (`dimensionar` reparte el 1% del NAV por ella).
    🚨 El cierre usa el precio de la **sesión de vencimiento**, no el de hoy — al estrenarlo había 10
    posiciones vencidas (MSFT, 24 días abierta con ventana de 10) y cerrarlas al precio de hoy habría
    metido hasta 14 días extra de mercado en el resultado de una regla de 10 días. Se reusa
    `juzgarHuerfana` (ancla + margen); lo que no se puede medir no se cierra, se cuenta.
    `horizonteDias` NULL = **no vence** (las 11 vivas se rellenaron desde su tesis, verificado en prod).
    🔬 Y el cron `trading-h10` es ahora **vigía de las hipótesis abiertas** (H11…H15): avisa cuando una
    tiene muestra para resolverse, con `hay=null` («no se pudo consultar») en un bloque aparte de
    «todavía no hay muestra». Lógica pura en `lib/trading/hipotesis.ts`. **No resuelve ni cablea nada.**
  - 🗄️ **Contexto histórico (ya corregido):** `packages/module-trading/src/paper.ts`
    abre cada posición con un stop a **`entrada − 2·ATR14`** y `/api/trading/puntuar` lo evalúa cada
    noche, **pese a que H9 concluyó literalmente «no se ponen stops»**. Y la salida por TIEMPO que el pie
    de «Cartera paper» promete **no está implementada**: el stop es la única salida del código (por eso
    MSFT sigue abierta desde el 04/08 con horizonte de 10 días). Daño hasta hoy **cero** — 11 BUY y
    **0 SELL** en `trading_paper_orden`, ningún stop ha saltado nunca: es una mina sin pisar, no un
    agujero. Su retirada se rige por **H9 (ya resuelta)**, no por H10. Ojo al quitarlo: el stop no es
    solo la salida, es también el **ancla del tamaño** de la posición (`dimensionar` reparte el 1% del
    NAV según la distancia al stop), así que la distancia 2·ATR hay que conservarla como cálculo de
    tamaño aunque nunca se venda por ella.
  - **🕰️ H12 (28/08/2026, idea de Alberto): la cinta se cortaba en el día 91.** `ret28/56/91` y las
    siete reglas de `salidas.ts` —que cuando no disparan se rellenan con el retorno del horizonte—
    viven TODAS dentro de esa ventana, así que «la salida por tiempo gana» es cierto *entre las
    reglas medidas y dentro de 91 días*: **que aguantar 182 o 364 días sea mejor o peor no se había
    mirado nunca**. No es que saliera peor; es que 91 era el TECHO de la medición. El retrovisor
    recoge ahora `ret182`/`ret364`, el techo y el suelo de la ventana larga (`mfe364`/`mae364`/
    `diasMfe364`) y `tendenciaVivaAlSalir` (al cerrar el día 91, ¿el precio seguía sobre su SMA50?),
    que es la pieza para contrastar «vender por tiempo SALVO que la tendencia siga viva».
    Módulo puro `lib/trading/continuacion.ts`. **El arrepentimiento no se guarda, se deriva:** todas
    las reglas miden desde la misma entrada, así que `ret364 − salidaX` ES lo que costó vender por X.
    🚨 Dos trampas firmadas: (a) `mfe364`/`mae364` quedan en **NULL** con la ventana incompleta — un
    máximo a media ventana es una COTA INFERIOR, no el techo; (b) **`margenDias` (98) de
    `fechasSnapshot` NO se toca**: subirlo a 371 para que todo snapshot tenga `ret364` borraría un
    año de observaciones de `ret91` y rompería H9/H10 a cambio de nada.
  - **📊 H13/H14/H15 (28/08/2026): el track record medía BETA y en BRUTO.** `puntuarTesis` daba el
    retorno ABSOLUTO y `acierto` de una alcista era «subió» — en un tramo alcista eso lo hace el
    mercado, no la estrategia, y ese hit-rate es justo lo que `ajustesDeStats` convierte en delta de
    confianza del torneo. Lo llamativo: el módulo YA tenía benchmark (`seleccionEval`, `universo`,
    `riesgoCesta`) pero **solo para las cestas**. Ahora `/puntuar` recoge `retorno_alfa` y
    `retorno_bench` por observación y `hit_rate_alfa`/`retorno_alfa_medio`/`n_alfa` por estrategia
    (migración `2026-08-28_trading_alfa.sql`, **aplicada**), más `retornoNeto` = bruto − `COSTE_ROUNDTRIP`
    (0,2%), **derivado y NO persistido** — guardar el neto convertiría las filas viejas en mentira el
    día que se ajuste el peaje. `ajustesDeStats` **sigue decidiendo con lo bruto y absoluto** hasta que
    los criterios firmados se cumplan. 🚨 Tres trampas: (a) el alfa lleva el **signo de la tesis**
    (`segunDireccion(mov − bench)`), así que una bajista que cae MENOS que el índice pierde alfa aunque
    «acierte» la caída; (b) **`nAlfa` es una columna aparte de `n`** — una observación sin benchmark no
    es un alfa de 0, y contarla acercaría la media a cero sola; (c) las dos puntas del bench salen de la
    MISMA fuente y con `TOLERANCIA_BENCH_DIAS` (4): restar dos ventanas distintas da un número plausible
    que no significa nada. Y `minN`/clamp de `ajustesDeStats` **nunca se han validado** (H15).
  - **✅ H11–H15 RESUELTAS (31/08/2026), una sola se cablea: H11.** `PISCINA_VIVA = 'direccional'`
    (`lib/trading/piscinas.ts`, guardián en su test): el torneo aprende de las señales que SÍ ajusta
    (deltas hoy: momentum −9 · reversión +5 · valor −13 · catalizador sin ajuste por minN). H12: los
    horizontes largos ganan mediana (+7,74 pp a 364 d) pero EMPEORAN el p25, y la tendencia viva solo
    separa +1,26 pp (≥5 exigidos) → la salida por tiempo a 91 d validada por 3ª vez. H13: el orden por
    alfa cambia pero la que pasaría a primera (momentum) tiene alfa medio NEGATIVO → guarda de daño.
    H14: el cambio de signo del peaje no aguanta 0,1%–0,3% (y en `direccional` ni aparece). H15:
    ganadora idéntica en los 9 combos minN×clamp (minN es INERTE en `'todos'`: n=352 idéntico por
    construcción) → se quedan. El cron `trading-h10` ya no re-avisa el cierre de H10 (solo si una
    variante pasara a cumplir) y su vigía queda con la lista de hipótesis VACÍA (tubería montada).
    Detalle: «✅ RESOLUCIÓN de H11…H15» en `docs/TRADING-HIPOTESIS-PREREGISTRO.md`.
  - Informe vivo con las cifras y su muestra: **`docs/TRADING-SALIDAS-2026-08.md`** (se AÑADE una entrada
    fechada por hito, no se reescriben las anteriores). Hipótesis y criterios: `docs/TRADING-HIPOTESIS-PREREGISTRO.md`.
- **🚨 LANDMINE — SESGO DE SUPERVIVENCIA: la tesis cuyo símbolo se cae del universo no se puntuaba NUNCA
  (12/08/2026).** `/puntuar` solo sabía puntuar con `conformes[simbolo]`, el precio que trae la pasada de
  hoy, así que 16 tesis del 18/07 (CEG, ISRG, SYM, UEC) llevaban desde el 28/07 vencidas y en
  `resultado: null` — sin contar en `trading_estrategia_stats`, sin aparecer en ningún recuento y sin que
  nada las echara de menos. El silencio se leía como «no había trabajo». Y el sesgo no es neutro: un
  símbolo sale del universo por dejar de dar señal, desplomarse o ser adquirido, nunca al azar. Fix
  (`juzgarHuerfana`/`resumenHuerfanas` en `lib/trading/precios-guardia.ts`, puros y testeados con series
  reales de IBKR): pasada una gracia de 3 días se piden a la 2ª fuente y se puntúan con el **cierre de su
  sesión de vencimiento** (`precio_fuente='contraste'`), con ancla contra nuestro `precio_ref` (protege de
  splits y de tickers reciclados) y margen de ventana de 5 días. ⚠️ **El ancla NO puede pedir la fecha
  exacta de la tesis**: la fecha es la de la PASADA y las pasadas no siempre caen en sesión — las 16
  reales son de un SÁBADO y sus refs son el cierre del viernes anterior al céntimo. Lo que no se puede
  puntuar **se cuenta y se canta** (latido + campo `huerfanas` de la respuesta); a los 60 días se deja de
  reintentar pero se sigue declarando como hueco conocido. Regla general: **una fila que desaparece de un
  recuento no es una fila que no existe** — al añadir un camino que deja trabajo pendiente, cuéntalo.
- **🚨 LANDMINE — la huella se escribe DENTRO del trabajo que vigila: si la función muere, no hay
  huella (31/07/2026).** El mismo día de estrenar el vigía saltó «🧾 Escaneo de facturas: sin ninguna
  señal registrada» y la nota mandaba a mirar IMAP/app-password. No era eso: `facturas-scan` corría
  todos los días y **moría en 504** («Task timed out after 60 seconds», 3 de sus últimas 4 pasadas)
  a mitad del escaneo — con facturas ya insertadas (IONOS y Punto y Coma ese 06:16) pero sin llegar
  jamás a `registrarLatido`, que estaba al final. Tres arreglos, aplicables a cualquier agente nuevo:
  (a) **`maxDuration` 60 → 300** y **presupuesto de tiempo explícito** (`escanearNuevasFacturas(…, {deadline})`
  y `listarCandidatosConLimite`, que corta el listado IMAP): subir el techo solo mueve la pared, el
  presupuesto es lo que garantiza que la pasada VUELVE; (b) **latido de INTENTO al empezar** (`ok=false`,
  no toca `ultimo_ok_at`) + **latido definitivo justo después del escaneo**, nunca al final de la ruta —
  la huella del buzón no puede depender de que la conciliación bancaria posterior termine; (c) `evaluarLatido`
  recibe también `ultimo_at` y `detalle` para **distinguir «no se dispara» de «se dispara y no termina»**
  (antes ambas eran el mismo «sin ninguna señal» y mandaban a buscar al sitio equivocado). Un listado IMAP
  truncado devuelve `ok:false`: se ha visto MEDIO buzón, y eso no es haberlo mirado. Los `pendientes`
  van en el `detalle` (se retoman en la pasada siguiente, dedupe por `gmail_uid`).
- **Una sonda que revienta ya NO se traga en silencio**: va en un bloque aparte del Telegram, «Sin poder
  comprobar — esto NO es "todo bien"». Un vigía averiado que calla es un parte de buena salud falso.
- **Declarar un agente en `AGENTES_VIGILADOS` exige su sonda en `PROBES` (route del cron) EN EL MISMO
  PR (16/08/2026, PR #1447):** `sivra_eventos_verificar` se declaró el 12/08 sin sonda y el parte diario
  lo listaba en «Sin poder comprobar» aunque el agente latía bien en `agente_latidos`. Lo fija un test de
  `latidos.test.ts` que compara los ids del registro contra las claves de `PROBES` (lee el fuente de la
  ruta, porque `Prisma.sql` no es importable desde `node --test`).

## 🔧 Del latido rojo al merge: reparación automática de agentes (20/08/2026)
El vigía de latidos DETECTA; hasta hoy nadie REPARABA. El `sivra_canal` roto el 19/08 (moría en
`42883 date - bigint` en su primera consulta) siguió dejando los cuatro pisos con el ×1,20 supuesto
hasta que un humano leyó el Telegram. Decisión de Alberto: «lo más automático posible y solo avisarme
en caso de no resolverse». Diseño: `docs/superpowers/specs/2026-08-20-latido-autoreparacion-design.md`.
- **Disparador:** `.github/workflows/latido-reparar.yml` (08:00 UTC, 15 min detrás del cron de
  latidos) → `POST /api/internal/reclamar-reparacion` → `scripts/ai-programar.mjs` → gate → merge o
  PR draft + Telegram. **Plataforma decide, GitHub ejecuta, el latido juzga.**
- **Solo dispara lo que tiene forma de EXCEPCIÓN** (`lib/monitoring/reparable.ts`, puro y testeado
  con partes reales): SQLSTATE, nombre compuesto de excepción o marcador de runtime. Un `error:`
  suelto NO basta — en castellano aparece en partes de degradación normal. La doctrina «no lo sé ≠
  no hay» aplicada al disparador: un IMAP caído o un Serper vacío no se arreglan tocando el repo.
- **🚨 Al orquestador se le manda la EVIDENCIA, nunca el diagnóstico.** La `nota` de `sivra_canal` en
  `AGENTES_VIGILADOS` decía que el fallo estaba «aguas arriba, en la rutina de Booking y en el plan de
  escaparate» — falso: las 22 mediciones estaban. Lo único cierto era la cadena de la excepción.
- **🚨 El gate es una PRUEBA, no el estado de CI.** El diff debe traer un `*.test.ts` que falle sobre
  `main` y pase con el parche (el workflow lo ejecuta él mismo, en su run). Doble motivo: un `tsc`
  verde bendice igual un «arreglo» que borre la consulta, y **el estado de checks de un PR miente
  aquí** — el PR #1529 mostraba ✅ con `tests.yml`/`ci.yml` sin haberse ejecutado nunca.
- **Frenos:** una firma de error (`firmaError`) = un intento · 3 por agente en 30 días · un intento
  vivo (claim `agente_reparaciones`, migración `2026-08-20_agente_reparaciones.sql`) · el diff nunca
  toca `.claude/**`, `CLAUDE.md`, `.github/workflows/**` ni `.sql`.
- **El agente no se declara curado a sí mismo:** a las 24 h del merge, `agentes-latido` compara
  `ultimo_ok_at` contra `merged_at`. Verde → cierra en silencio. Rojo → Telegram. **Éxito = silencio.**

## 🧾 Libro de comisiones de la correduría — devengo → liquidación → cobro → renta (01/09/2026, PR #1962)
Alberto: «controlar que me pagan lo que me deben y que está ingresado en cuenta». La matriz de
`/correduria` solo veía el INGRESO del banco, y el ingreso no es lo que va a la renta.

- **Tabla `comisiones_devengo`** (PK `cuenta_id, compania_codigo, periodo_inicio, periodo_fin`;
  `prisma/sql/2026-09-01_comisiones_devengo.sql`, **aplicada**) con tres ejes por periodo: `esperado_*`
  (recibos cobrados en CIMA) → `liq_*` (extracto de la compañía) → `banco_total` (BBVA). Más
  **`comisiones_cobertura`**, que dice de qué compañías se está CIEGO — sin ella el total anual parece
  completo estándolo a medias. Se retiró `cima_liquidaciones` (0 filas) y `lib/cima.ts`.
- **El cron `/api/cron/cima-liq` NO habla SOAP.** Aquello (`ws.cimaseg.es`) nunca funcionó —404, parser
  adivinado, códigos de compañía numéricos cuando los reales son `C0058`/`C0109`/`C0468`/`C0613`— y
  vivía apagado. Lee el **puerto HTTP de `apps/asegura`** (`/api/operador/comisiones`, Bearer
  `ASEGURA_OPERADOR_SECRET`), como `lib/cartera-asegura.ts`. 🚨 **`ASEGURA_DATABASE_URL` NO existe en
  este proyecto** y no debe pedirse: el aislamiento entre apps es el mismo patrón que ia-rest/iarrhh.
- 🚨 **Los tres números NO son el mismo, y quien retiene es la COMPAÑÍA.** Retiene el 15 % de IRPF y lo
  declara en el modelo 190 **a nombre de Alberto**, que cobra ya el NETO. Para él la retención no es un
  gasto: es un **pago a cuenta** que resta de la CUOTA. Por eso **a la renta va el BRUTO y contra el
  banco se compara la REMESA** (bruto − retención; Allianz feb/2026: 95,03 − 14,26 = 80,77 exacto).
  Restar el 15 % otra vez en cualquier punto lo cuenta dos veces.
- **Veredicto en el helper PURO `lib/correduria/cuadre.ts`** (testeado), con **9 estados** porque cada
  uno manda a hacer algo distinto: `deudor` (Occident, comisión negativa y remesa 0) **no es un
  impago**; `sin-cobertura` (Generali, sin ninguna fuente) **no es** `sin-datos` (Mapfre, que devenga y
  no manda extracto); y `no-comprobado` manda sobre todo — un fallo de lectura no puede acabar pintado
  como «la compañía no te ha pagado». El total anual con cualquier hueco se presenta como
  **PROVISIONAL**: es la cifra que va a la asesoría.
- **Mapfre se teclea** (`liq_origen='manual'`, PDF cifrado tras enlace que caduca); el `coalesce` del
  upsert impide que un NULL de CIMA lo pise en la pasada siguiente. **Allianz se lee**: su PDF «Cuenta
  Agente» lleva el texto en **EBCDIC (cp500)** dentro de los content streams y Node no trae esa
  codificación → tabla explícita en `lib/correduria/pdf-allianz.ts`.
- UI: pestaña «Cuadre» en `/correduria`. Los importes que no han llegado se pintan **«—», nunca 0,00€**.
- 🚨 **Un `estado:'error'` del puerto lleva SIEMPRE su CAUSA (02/09/2026, PRs #2029 y #2034).** El aviso
  decía «no se ha podido leer la cartera (`asegura_error`)» y ahí se acababa: los `catch {}` de asegura
  colapsaban credenciales, permisos, conexión, schema y fila-que-no-está en el mismo error pelado, sin un
  `console.error` que lo dejara ni en los logs de la función. Ahora `ComisionesAsegura` trae `causa?` del
  clasificador único `apps/asegura/lib/error-cartera.ts` y `describirCausaAsegura()` (en
  `lib/correduria-puerto.ts`) la traduce a la frase que dice dónde tocar; el Telegram la enseña — o dice
  que asegura no la manda, que es otra cosa.
  ✅ **La causa REAL resultó ser `credenciales`:** la contraseña de `prisma_seguros` se rotó tres veces ese
  día y el `DATABASE_URL` del proyecto Vercel `central-asegura` se quedó con la vieja. **No era el schema**
  — esa hipótesis se escribió aquí como probable y era falsa.
  ⚠️ Al escribir el aviso de un fallo, la pregunta no es «¿he dicho que falló?» sino **«¿dice dónde mirar?»**.
- 🚨 **PENDIENTE — la cifra fiscal de comisiones sigue siendo una ESTIMACIÓN.** `lib/finanzas.ts:594`
  eleva el neto del banco al bruto con `× (0,15/0,85)` y da por hecho que TODO abono de seguros es una
  comisión neta al 15 %; un periodo deudor de Occident rompe el supuesto. El bruto y la retención
  REALES ya están en `comisiones_devengo`: falta sustituir la estimación por el dato real. Hasta
  entonces, al hablar de esa cifra di «estimada», no «verificada».

## 🗂️ La correduría se trabaja DESDE AQUÍ — ficha del cliente y accesos directos (01/09/2026)

> Alberto: *«asegura hay que meterlo en correduría, yo solo uso UNA página»* · *«pincho en Jose Suárez
> Salas y directamente me lleva a su ficha, donde tengo todos sus datos, pólizas, recibos, siniestros.
> Rápido y limpio»*.

**`/correduria` es LA pantalla de la correduría.** `apps/asegura` es la trastienda: tiene la BD de la
cartera y es la única que gasta dinero al retarificar, pero **Alberto no entra ahí**. Toda pantalla
nueva de la correduría se monta aquí y su dato llega por el puerto `/api/operador/*` de asegura.

- **`/correduria/cliente/[id]`** — la ficha entera en una pantalla: titulares (pólizas vivas · recibos
  devueltos · pendientes · siniestros abiertos), contacto (📞 y ✉️ clicables), pólizas vivas con su
  objeto/prima/estado de cobro, siniestros, y el volcado histórico plegado con montaje perezoso.
  Server component; datos por `lib/ficha-asegura.ts` (interpretación PURA + tests en
  `test/regression-ficha-asegura.test.ts`).
- **Accesos directos:** el nombre del cliente en la tabla de Renovaciones es un enlace a su ficha.
- **📑 `/correduria/poliza/[id]` — la ficha de UNA póliza (Alberto, 02/09/2026: «pincho en la póliza y ahí
  especifica más: datos, documentación, siniestros, recibos»).** Objeto asegurado (con la **copia gemela**
  del volcado cuando CIMA no manda la dirección del riesgo), efecto inicial/anualidad/vencimiento con la
  ventana de anulación, prima neta/bruta, forma de pago y recargo, **coberturas** (1.418 filas en las 109
  vivas; el capital es TEXTO del EIAC —«ILIMITADO», «VALOR VENAL»— y no se numera), todos los recibos,
  siniestros, intervinientes y documentación (`0` en toda la base = «todavía no se guarda ninguno», y se
  dice). Lector `lib/poliza-asegura.ts` (`gemelaInformada` distingue «no hay gemela» de «asegura no la
  busca»; `documentos: null` ≠ 0), tests en `test/regression-poliza-asegura.test.ts`. En la ficha del
  cliente, la compañía y «ver póliza →» enlazan aquí.
  🚨 **42 de las 109 pólizas CIMA están `cancelada`** (medido 02/09/2026): la ficha las saca de «Pólizas
  vivas» a un bloque plegado «Canceladas en CIMA» y no ofrece «Retarificar» sobre ellas. **Recibos todos
  anulados** (20 vivas) se pintaba «🟢 0 cobrado(s)»: ahora es «⚪ N anulado(s)» (`estadoCobro` ganó el
  estado `anulados`). Y **prima 0 no es una prima** (24 vivas): `primaReferencia` devuelve `null` → «sin dato».
- **📞 El teléfono de la ficha sale de `contactoEfectivo()` (02/09/2026), no solo del tomador.** Una
  empresa (Esquiansa) decía «sin teléfono» teniendo a su conductor habitual con teléfono en la ficha
  enlazada por CIMA. Ahora el número lleva entre paréntesis DE QUIÉN es (con enlace a su ficha), y cada
  póliza lista sus intervinientes debajo de «Qué asegura». `intervinientes === null` = asegura no los
  informa → «sin teléfono · intervinientes sin comprobar», nunca «nadie tiene teléfono».
- **🏠 `/correduria/hogar` — presupuesto de hogar desde el Catastro (02/09/2026).** Con la dirección
  («Calle San Vicente 40, 2º 14» + municipio + provincia) o la referencia catastral de 20, el Catastro da
  m², año de construcción, uso y CP — gratis, sin preguntar al cliente. Verificado sobre el caso real de
  Alberto: 76 m² · 1994 · Residencial · 41002, idéntico a lo tecleado en la póliza. Lógica en
  `lib/correduria-hogar.ts` (6 estados: `ok` · `elegir` —varios pisos: elige una persona— · `ambigua` ·
  `no_encontrado` · `direccion_ilegible` · `error`), API `POST /api/correduria/catastro` (sesión).
  Usa `@central/core-catastro` (extraído de subastas; `lib/subastas/enriquecer.ts` lo re-exporta).
  🚨 La referencia de 14 es el EDIFICIO y no trae m² ni año: se pide la de 20 (`precalificarHogar`
  lo declara). La página dice si **hogar tarifica** para nuestra organización: `lineasCodeoscopic()` →
  puerto `GET /api/operador/codeoscopic/lineas` (= `GET /insurance-lines` del vendor, **gratis**, corre
  con el interruptor apagado). Tres estados: `disponible` (con el id EXACTO del ramo, que es lo que va en
  `insuranceLine`) · `ausente` (hay que pedírselo a Codeoscopic) · `desconocido` (no se pudo mirar).
  ✅ **Pedir precio de hogar SÍ conecta desde el 02/09/2026 (tarde):** en la ficha del cliente y de la
  póliza, «Retarificar hogar ↗» salta a la pantalla de confirmación de asegura, que ramifica por ramo.
  El puerto manda por póliza `retarificacion: {ramo, retarificable, motivo, fuente}` (helper
  `retarificabilidad()` de `@central/module-seguros`); `null` si asegura es más viejo → se cae al
  booleano de antes. `motivo` es la frase del `title` cuando no se puede (ya no vive aquí duplicada).
  Hogar exige m² + año + CP en la póliza o en su copia gemela del volcado — CIMA no los manda.
- **📎 Documentos en la ficha del cliente y de la póliza (02/09/2026, tarde):** `Documentos.tsx` (client) sobre
  `/api/correduria/documentos` (POST multipart = subir · POST json `{pedir:true}` = anotar pedido) y
  `/api/correduria/documentos/[id]` (GET = el fichero en streaming · PATCH revisar · DELETE), que reenvían al puerto
  de asegura con el secreto; sesión de plataforma obligatoria. Lector puro `lib/documentos-asegura.ts`
  (`test/regression-documentos-asegura.test.ts`, 4): `null` = no se pudo consultar ≠ `[]` = no hay. La lista trae
  el estado **pedido / recibido / revisado** y ofrece primero los tipos que faltan para emitir auto
  (`NECESARIOS_EMISION_AUTO`). Los ficheros viven en `seguros.documentos` (bytea, ≤10 MB); aquí no se guarda nada.
- **✏️ Editar y ➕ dar de alta clientes DESDE AQUÍ (02/09/2026).** Alberto: «pero no puedo editar» · «ni
  añadir; cliente puede tener varios tlf y mails» · «cualquier dato básico, DNI, nombre, fecha de nacimiento…
  tendrá que solicitarlo documentado». Tarjeta «✏️ Datos del cliente» en la ficha (`EditarCliente.tsx`) y
  `/correduria/cliente/nuevo` (`NuevoCliente.tsx`), sobre los proxies `/api/correduria/cliente` (POST alta,
  PATCH edición) y `/api/correduria/cliente/contactos` (GET/POST/PATCH/DELETE), que reenvían al puerto de
  asegura con `actor = email de la sesión`. Lector puro `lib/cliente-edicion-asegura.ts` (+ test).
  - **Tres bloques con tres reglas:** teléfonos/emails (varios, etiqueta cerrada, ⭐ principal — el principal
    es lo que espeja `clientes.telefono/email` y lo que lee todo lo demás) y dirección/CP/ciudad/provincia/
    notas se cambian **libremente**; la **identidad** (DNI, nombre, apellidos, fecha de nacimiento) **solo
    con un documento tipo DNI recibido en 📎 Documentos**, que se elige en un `<select>` y viaja como
    `documentoId`. Sin él, el bloque está deshabilitado y ofrece «Pedir DNI» (anota `pedido`).
  - **Alta = buscar primero.** El puerto devuelve 409 con las fichas que ya tienen ese DNI/teléfono/email; la
    pantalla enlaza a ellas. DNI repetido: no se crea. Teléfono/email repetido: «Crear igualmente» (`forzar`).
    La ficha nueva nace `lead`; «Cliente (CIMA)» lo da tener pólizas vivas, no el `tipo` (CIMA no lo cambia).
  - `contactos === null` / `identidad === null` = asegura no lo manda (versión anterior o consulta caída): se
    dice, nunca se pinta «sin teléfonos». Un contacto `ilegible` (clave PII) se enseña como «cifrado».
- **🔎 El buscador ya mira el RIESGO (02/09/2026):** dos bloques nuevos del puerto, `riesgo` (localidad o CP
  del bien, en claro en `datos_especificos`) y `direccion` (la calle, que asegura DESCIFRA EN MEMORIA
  —son ~170—). «rota» o «san vicente 40» sacan la casa de la playa de un cliente de Sevilla. Si asegura no
  tiene la clave, el aviso dice cuántas direcciones no ha podido leer; un bloque vacío ahí no es «nadie».
- **💳 Forma de pago en la ficha (Alberto, 02/09/2026):** columna «Pago» por póliza —periodicidad
  (`fraccionamiento`, CIMA lo trae en 108/109 vivas), forma de cobro del último recibo (CC/OF/TA →
  domiciliado/oficina/tarjeta) y el **recargo por fraccionar**, que CIMA NO da y se deriva de los
  recibos del ciclo con TRES estados (`recargoFraccionamiento()` en module-seguros, 8 tests): solo se
  afirma con el ciclo completo — con 2 de 4 recibos la resta sale negativa y parecería que fraccionar
  ahorra. Bajo «Vence», `ventanaAnulacion()` recuerda que el contrato es anual y solo se deja al
  vencimiento avisando 30 días antes (se pinta cuando faltan ≤60 días).
- **📄 «Subir póliza o documento ↗»** (botón en la ficha) salta a `asegura/cartera/subir`: el agente lee
  el PDF/foto y enseña lo leído. Es gratis. **Hoy solo lee pólizas de AUTO y NO guarda el fichero**
  (falta decidir dónde y cuánto tiempo conservar documentos con DNI dentro) — la pantalla lo dice.
- **🔎 Buscador de TODO (`BuscadorCartera.tsx`)**: nombre, matrícula, nº de póliza, DNI, teléfono,
  email, ciudad o código postal, en un solo cuadro. Un término se busca por **todos** los criterios que
  encaje (`41003` es CP y nº de póliza plausibles a la vez).
  🚨 **Vive FUERA de `CarteraViva`, nunca dentro.** Estaba anidado ahí y ese bloque hace `return`
  temprano cuando el puerto falla → el buscador desaparecía justo el día que asegura no responde.
  🚨 **DNI, teléfono y email van por índice ciego y solo alcanzan al 12-16% de las fichas**; la
  dirección va cifrada y **no se puede buscar**. Cada bloque enseña su cobertura y el vacío se explica
  (`explicarVacio()`), porque un «no aparece» ahí NO es «no está en la cartera».
- **📞 Cola de retención (`Retencion.tsx`)**: los recibos devueltos y los vencidos sin cobrar,
  ordenados por el **reloj** (art. 15 LCS) y no por el importe. 🔴 «sin cobertura» = el cliente circula
  sin seguro y no lo sabe; si paga vuelve a estar cubierto en 24 h. Botón `tel:` de 44px y, en auto con
  matrícula, «Precio en otra compañía ↗» (que salta a asegura porque cuesta 0,50€).
  🚨 Que la cola esté vacía **no es «está todo cobrado»**: debajo se declaran las pólizas vivas sin
  ningún recibo informado (18 de 109) y los pendientes que aún no han vencido.
- **El único salto a asegura es «Retarificar ↗»**, porque cuesta 0,50€ reales y tiene que pasar por su
  pantalla de confirmación. `urlRetarificar()` en `lib/ficha-asegura.ts`.

🧹 **Reorganización de la pantalla (agente de diseño, 01/09/2026).** Alberto: *«hay duplicidad y ahí
solo tiene que salir datos importantes»*. Se pasó de 12 KPIs a **4** y el orden es ahora
**buscar → cartera → a quién llamar → cuadre → detalle del banco (plegado)**. Lo retirado y por qué:
«Total cobrado», «Compañías activas» y «Mejor mes» **se leen de la propia tabla que tienen debajo**;
«Vencen en 60 días» no dispara ninguna acción distinta de los 30 (la ventana que manda es la del
preaviso, LCS art. 22); «Históricas» y «Leads» son el MISMO volcado de 2013-2018 contado en dos
unidades y bajan a una línea de pie; «Sin fecha» no era un KPI sino una advertencia de calidad del
dato, y baja a subtítulo de «Cartera viva». La matriz compañía×mes **NO se borra** (es el único
camino para reclasificar un movimiento y que aprendan `correduria_reglas`/`banca_destino_reglas`):
se pliega en un `<details>` que se auto-abre si hay algo pendiente.
🚨 **«Pendiente de confirmar» salió del gate `totalAnual > 0`**, que lo escondía un año sin ingreso
bancario — justo cuando más importa que haya movimientos dudosos sin revisar.
El selector de año **bajó al bloque del banco**: en la cabecera parecía gobernar la cartera viva, y
retroceder a 2025 dejaba los vencimientos de hoy intactos sin que se entendiera por qué.

🚨 **Cuatro «no lo sé» que esta pantalla NO colapsa** (regla NULL≠0 del CLAUDE.md raíz):
1. **`recibos.total === 0` NO es «al corriente de pago»**: es que la compañía no ha mandado ningún
   recibo de esa póliza — medido el 01/09/2026, **18 de las 109 pólizas vivas** están así. Se pinta
   «sin informar». La lógica vive en `@central/module-seguros` (`estadoCobro`/`explicarCobro`, puro).
2. **`recibos === null` es otra cosa distinta**: la versión desplegada de asegura todavía no manda el
   bloque. Un bloque con forma rara degrada a `null`, **nunca a un resumen a ceros** — eso pintaría
   «al corriente» sobre una póliza de la que no se sabe nada. Hay test que lo fija.
3. **`clienteId === null`** = asegura no manda el id: el nombre se pinta sin enlace y se dice por qué,
   en vez de un enlace roto.
4. **`no_encontrado` ≠ `error`**: «se ha mirado y no está» frente a «no se ha podido mirar». Colapsarlos
   diría que un cliente no existe cuando lo que pasa es que el puerto no responde.

🚨 **Los importes de los recibos llegan como TEXTO del EIAC y `Number()` NO vale.** `importeEiac()`
(`@central/module-seguros`) acepta SOLO la forma medida —`NNN.NN`, punto decimal, 2 decimales, la de
los 184 recibos reales— y devuelve `null` para cualquier otra. `Number('1.234')` daría 1,234 sobre un
texto que quería decir 1.234 en español: la cifra sale plausible y **no hay hueco que delate el fallo**
(lección de ORCL, 31/07/2026). `sumarImportesEiac` cuenta aparte los ilegibles en vez de sumarlos como 0.

## 🔔 Panel «Avisos Telegram» (`/telegram`) — el interruptor de lo que manda el bot (01/09/2026, PR #1924)
Alberto: «las notificaciones de Telegram son muchas». El bot emitía desde **~57 ficheros** sin
inventario ni forma de callar uno solo: para bajar ruido había que buscar el `tgSend` y borrarlo.

- **Catálogo = `lib/telegram/catalogo.ts`**, fuente única de los **76 avisos PROACTIVOS** (id,
  título, qué avisa, cadencia real, categoría). 9 categorías; pantalla en `app/(usuario)/telegram/`
  + API `app/api/telegram/avisos/` (GET catálogo+estado · POST encender/apagar aviso o categoría).
- 🚨 **Un aviso proactivo NUEVO se emite con `tgAviso`/`tgAvisoBotones`/`tgAvisoAlerta`
  (`lib/telegram/avisos.ts`) y SE AÑADE AL CATÁLOGO en el mismo PR.** Lo obliga el guardián
  `lib/telegram/catalogo.test.ts`, que falla si un id emitido no está catalogado (aviso que llega y
  no se puede callar, y que además no sale en la pantalla) o si uno catalogado no lo emite nadie
  (interruptor que Alberto apaga, sigue recibiendo el aviso y deja de creerse el panel entero).
  El id es un `string`: ni `tsc` ni el build cazan ninguno de los dos, por eso lee el FUENTE.
- 🚨 **Fail-open a propósito:** si la BD no responde, el aviso **SALE**. Un fallo de red no puede
  convertirse en silencio — es el modo de fallo que el CLAUDE.md raíz marca como el más caro. Solo
  se silencia lo que hay escrito en `telegram_avisos_pref` (ausencia de fila = activo).
- **Lo que NO entra en el catálogo, a propósito:** las RESPUESTAS del bot a un mensaje o botón de
  Alberto (agente contable, borradores del agente de huéspedes, clasificar un movimiento…). Esas
  siguen con `tgSend` directo: silenciarlas no quitaría ruido, rompería la conversación.
- **`sistema.canal-mudo` es el ÚNICO `critico`** (no silenciable ni por API): es el aviso de que los
  demás están mudos (el 401 auto-anulante de `/api/internal/alerta`). Apagarlo dejaría el sistema
  sin voz sin que nada lo delate. Hay test que fija que es el único.
- **Triaje de correo: un interruptor POR CATEGORÍA** (`avisoDeCategoriaCorreo` en el catálogo), no
  uno global — «avísame de los leads pero no de cada correo de huéspedes» es la distinción real.
  Una categoría sin id mapeado avisa siempre (nunca al revés).
- **Bitácora `telegram_avisos_log`** (`enviado`|`omitido`) → el panel dice cuántos llegan DE VERDAD
  en 30 días, no la cadencia teórica del cron. **Nace vacía**, así que la pantalla distingue «no ha
  llegado ninguno en este periodo» de «todavía no se ha medido» y no pinta ceros que se leerían
  como una afirmación (regla del NULL). Purga a 90 días: `purgarBitacora()` desde `agentes-latido`.
- 🚨 **`make_interval(days => ${n})` NECESITA `::int`**: Prisma manda el número como `int8` y
  `make_interval(days => bigint)` no existe (42883) — revienta SOLO en runtime. Lo cazó el guardián
  `test/regression-sql-fecha-parametro.test.ts` en el CI de este mismo PR.
- Migración `prisma/sql/2026-09-01_telegram_avisos.sql` **aplicada** (incluye el `GRANT USAGE` de
  `telegram_avisos_log_id_seq` a `prisma_plataforma`: sin él el `bigserial` no deja insertar).

## 🎨 Sistema de diseño — `components/ui.tsx` (02/09/2026)
Nació como `app/(usuario)/dashboard/ui.tsx` (02/07/2026), pero `/dashboard` pasó a solo REDIRIGIR a
`/banca`: el sistema de diseño colgaba de una ruta muerta. Y al auditarlo, **ningún archivo lo importaba**
— existía como documento, no como código, mientras las pantallas se escribían con ~4.900 objetos
`style={{}}` a mano y 223 verdes/rojos en hex fijo (ilegibles en modo oscuro). Movido a
**`components/ui.tsx`** (`@/components/ui`); **`/banca` es la implementación de referencia**.
- **Adopción POR GOTEO** (regla del CLAUDE.md raíz): se trae el patrón cuando una pantalla lo necesita.
  Migrar los ~4.900 inline styles de golpe rompería pantallas que hoy funcionan.
- **Ancho por tipo de contenido:** `<Pagina ancho="lectura">` (960, resúmenes/fichas) o `"tabla"` (1400,
  páginas cuyo cuerpo es una tabla). Sustituye al `maxWidth:'960px'` que estaba copiado en 14 páginas.
- **Nada de hex.** Colores SIEMPRE por token (`var(--positive)`, `var(--negative)`…); para un importe,
  `colorImporte(n)`. Lo vigila `test/regression-tokens-color.test.ts`.
- **`btnStyle()` devuelve el ESTILO, no un componente con `onClick`:** el archivo es server-safe y un
  handler obligaría a `'use client'` en cada pantalla que lo importe.
- **CSS responsive en `globals.css`, no en la página.** Un estilo inline no admite media queries, y ese
  era el motivo de que 47 páginas llevaran un bloque `<style>` incrustado (201 `!important` entre todas).

### El CUERPO del Inicio, migrado (02/09/2026, PR #2024)
El primer lote (#2011→#2018) tocó el **chrome** de `/banca` —pestañas, migas, ancho, cabecera del libro— y
Alberto respondió **«no está terminado, ¿no?»**: tenía razón, porque **el cuerpo de la página no lo tocó
nadie**, y el cuerpo es lo que se ve al abrir. Medido entonces: **7 primitivas con CERO consumidores**, y
`banca/ResumenPeriodo.tsx` con su propia `card`, su propio `Kpi` y su propio `<style>` — copias de lo que
`components/ui.tsx` ya ofrecía. **Copiar el estilo en vez de importarlo es por qué arreglar el oscuro o el
móvil hay que hacerlo N veces y se olvida una.**
- Ya usan el sistema: `ResumenPeriodo`, `NegociosResumen` y `banca/page.tsx` (`KpiCard`, `CardHeader`,
  `cardStyle`, `Stat`, `Badge`, `TablaScroll`, `Pendiente`). `IntervaloSelector` —compartido con
  `/finanzas`— pasa de quince pastillas con borde a segmentado + chips: un control de navegación no puede
  pesar como las tarjetas de datos que filtra.
- **`DeltaBadge` colorea por SIGNIFICADO, no por signo** (`bueno`): gastar menos que el año pasado es verde
  aunque el número sea negativo. Al revés, la pastilla premiaba subir el gasto.

🚨 **Una exención del guardián de tokens puede llevar un motivo FALSO y sobrevivir por eso.** Las barras del
gráfico de `ResumenPeriodo` estaban exentas de `regression-tokens-color` con el motivo escrito «son series,
no estados» — y no: ingreso y gasto SON el par semántico, y el hex no cambiaba en modo oscuro. Sobrevivió al
barrido de ~734 hex precisamente porque su justificación tenía buena pinta. Convertidas a token y exención
retirada; la dona sí sigue en paleta categórica (ahí el motivo se sostiene). **Regla: una exención razonada
sigue siendo una exención que hay que releer, no una decisión cerrada.**

⏸️ **Dos cosas PENDIENTES DE DECISIÓN DE ALBERTO, no deuda técnica anónima:**
1. **`PageHeader`, `BtnLink`, `BarListRow`, `ThinBar` y `LegendDot` siguen con CERO consumidores.** NO se
   enchufaron a la fuerza en ningún sitio: hacerlo sería repetir el defecto que este lote arregla. En
   `/banca` el hueco de `PageHeader` ya lo ocupan las migas + el saldo con su botón 👁. O se usan donde
   encajen de verdad, o se borran — un catálogo que nadie importa no es un sistema, es documentación.
2. **`banca/page.tsx:221` dice «último mov. ninguno» cuando `ultimoMov` es NULL** (`lib/psd2-estado.ts`),
   que es un «no se ha podido leer» servido como afirmación — la regla del NULL incumplida en la pantalla
   del banco. Sin tocar porque cambia un texto que Alberto lee a diario.

### 🚨 `Dato` — los tres estados, por construcción
La regla raíz «dato que NO hay ≠ dato que NO se ha mirado» se cumplía por VIGILANCIA: cada pantalla nueva
tenía que acordarse. La lógica pura vive en **`lib/dato.ts`** (`estadoDato`/`esPendiente`), con guardián en
`test/regression-dato-tres-estados.test.ts`:
- `null`/`undefined` → **«pendiente»** (nadie lo ha mirado; columna de enriquecimiento sin pasada aún).
- `[]`/`''` → **«revisado, no hay»**.
- **el `0` es un VALOR**, no un hueco. Es el error simétrico, el que aparece justo al arreglar el primero:
  «0 €» y «0 incidencias» son afirmaciones legítimas que alguien comprobó, y tratarlas como «sin revisar»
  hace que la pantalla deje de decir lo que sabe.

`<Pendiente>` lo pinta con borde **discontinuo** (se rellenará) o **continuo** (`definitivo`: la fuente no
lo va a traer nunca — prometer una pasada que no llega es la otra forma de mentir). `donde` dice dónde
mirar mientras tanto (la ficha oficial, el portal del banco…).

## Reglas
- Multi-tenant: SIEMPRE filtrar por `cuenta_id` en todas las queries.
- Sin credenciales en repo.
- El sector es texto libre (enchufable); no hardcodear la lista salvo en UI labels.
- **Formato de dinero:** todo importe en € usa el helper **`eur()` de `lib/dinero.ts`** → `2.162,49€`
  (formato español, € detrás, punto de millar también en 4 cifras). Vale para pantalla, Telegram y email.
  Prohibido `€${x.toFixed(2)}` suelto / estilo dólar. Regla global en el CLAUDE.md raíz.
