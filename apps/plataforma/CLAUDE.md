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
| `GEMINI_API_KEY` | Búsqueda web + **fallback de texto GRATIS** de `aiComplete` (cadena NIM → Groq → **Gemini** → Kimi; `geminiChat`, sin grounding) y de la pasarela (`/api/ai/chat`). Se activa solo con la key ya presente → evita "IA no disponible" sin coste. Override de modelo: `GEMINI_BRAIN_MODEL`. **Búsqueda web (13/07/2026):** toda la búsqueda (endpoint `/api/ai/search`, cron `eventos/websearch`, `seo-refresh`) va por **`lib/websearch.ts::buscarWeb`** — Gemini grounding (gratis) primero y, si está en racha de 429, el **plugin `web` de OpenRouter** como suplente de pago (~0,02€/llamada, respeta el presupuesto diario; tarifa override `AI_PRECIO_WEBPLUGIN_EUR`). Ambos intentos en `ai_usos`. |
| `GROQ_API_KEY` | **Fallback de texto gratis de la pasarela** (NIM → **Groq** `openai/gpt-oss-120b`, gratis rate-limited) en `aiComplete`/`aiTools`. Sin ella el fallback queda inactivo (no rompe). Override de modelo: `GROQ_BRAIN_MODEL`. |
| `MOONSHOT_API_KEY` | **Último fallback de texto** (… → **Kimi**/Moonshot, de pago) en `aiComplete`. Sin ella queda inactivo (no rompe). Opcionales: `MOONSHOT_MODEL` (default `kimi-k2.6`), `MOONSHOT_BASE_URL` (usa `.cn` si aplica). |
| `OPENROUTER_API_KEY` | **Camino PRIMARIO de la pasarela** (09/07/2026): agregador OpenRouter con el **Agente Director** eligiendo modelo por petición + fallback nativo entre modelos. Sin ella todo queda como antes (cadena gratis NIM→Groq→Gemini→Kimi). Opcionales: `OPENROUTER_MODEL` (default `deepseek/deepseek-chat`), `OPENROUTER_FALLBACK_MODELS` (csv de suplentes), `OPENROUTER_BASE_URL`, `OPENROUTER_REFERER`/`OPENROUTER_TITLE` (atribución). |
| `DIRECTOR_MODO` | **🟢 En producción `activo` desde el 10/07/2026** (la semana de sombra se acortó a 1 día por decisión de Alberto). `sombra` (el Director decide y se REGISTRA en `ai_usos` pero se sirve con el modelo por defecto) · `activo` (enruta de verdad). Opcionales: `DIRECTOR_MODEL` (modelo barato que decide, default `deepseek/deepseek-chat`), `DIRECTOR_USAR_FLOOR` (`false` desactiva el sufijo `:floor` = proveedor más barato), `DIRECTOR_MAX_PRECIO_OUT` (techo USD/M del cron, default 20). **Guardas en memoria (12/07/2026):** `DIRECTOR_BREAKER_FALLOS` (default 3) fallos SEGUIDOS del hop → se sirve default directo durante `DIRECTOR_BREAKER_PAUSA_MIN` (default 5) min sin pagar el timeout de 4s por petición (se marca `[breaker abierto]` en `ai_usos.error`); `DIRECTOR_DECISION_TTL_MIN` (default 5, `0`=off) memoiza la decisión por forma de petición (app+system+tamaño+versión de catálogo+degradado) — el tráfico repetitivo no paga el hop cada vez. |
| `DIRECTOR_PRESUPUESTO_UMBRAL` | Degradación GRADUAL del Director por presupuesto (09/07/2026): al superar este ratio del límite diario (gasto de hoy/límite, máx entre global/app/cliente) el Director elige SOLO modelos baratos ANTES del bloqueo duro al 100%. Default `0.8`. Techo de "barato" en `DIRECTOR_PRESUPUESTO_PRECIO_OUT` (USD/M salida, default `1.0`). El filtro (`lib/director-modelos.ts::modelosPermitidos`) también enruta por contexto real de la petición y, si el caller marca datos sensibles, prefiere modelos `eu` (RGPD) cuando el catálogo los ofrece. |
| `DIRECTOR_APRENDIZAJE_DIAS` | Bucle de aprendizaje del cron `ia-director-refresh` (F4): ventana en días del rendimiento real por modelo desde `ai_usos` (default `7`). Un modelo con mala racha se PENALIZA (se descarta del catálogo nuevo) si `error_rate ≥ DIRECTOR_MAX_ERROR_RATE` (default `0.3`) o `ms_medio ≥ DIRECTOR_MAX_MS` (default `20000`), con muestra `≥ DIRECTOR_MIN_LLAMADAS` (default `20`). Snapshot histórico en la tabla `ia_director_aprendizaje`. Determinista; avisa por Telegram si penaliza un preferido. |
| `AI_GATEWAY_LIMITE_DIARIO_EUR` | Presupuesto DIARIO en € de la pasarela (default **1**; `0` = sin límite). Al cruzarlo se bloquea SOLO el camino de pago (OpenRouter/Kimi) — la cadena gratis sigue sirviendo — y avisa por Telegram 1x/día. Límites específicos por vertical/cliente en la tabla `ia_presupuestos` (`ambito` `app`/`cliente`); atribución por cliente vía `cliente` en el body → `ai_usos.cliente_ref` (base de refacturación, panel `/operador/ia`). `AI_USD_EUR` (default 0.9) convierte el coste real del catálogo. |
| `AI_CREDITOS_UMBRAL` | Umbral en $ de créditos OpenRouter restantes bajo el cual el cron semanal `ia-director-refresh` avisa por Telegram (default 5). |
| `IA_CACHE_SEMANTICA` | `1` activa la caché semántica pgvector de la pasarela (default APAGADA). Además el caller debe mandar `cache:{ambito,ttlHoras?}` (opt-in doble; nunca cachear datos vivos). Umbral `IA_CACHE_UMBRAL` (default 0.97). Embeddings con `GEMINI_API_KEY` (text-embedding-004). |
| `CONTABLE_MODEL` | Modelo que RAZONA en el **agente contable** cuando no hay respuesta determinista (`lib/contable/cerebro.ts`). Default `deepseek-ai/deepseek-v3` (NIM, gratis con `NVIDIA_API_KEY`, mejor analista de cifras que Llama). Vacío `''` = default de la pasarela (Llama). Un id erróneo NO rompe (cae a Groq→Kimi). Para el chat, usar modelo RÁPIDO (no R1) para no agotar el timeout. |
| `TELEGRAM_BOT_TOKEN` | Bot único del monorepo (`@central/core-telegram`). Avisos automáticos, agente huéspedes SIVRA, agente pago de facturas. **Fuente única del token para todo el monorepo** — las rutinas de Claude Code no lo duplican; llaman a `/api/internal/alerta` con `ALERTA_TOKEN` (token dedicado; el endpoint acepta `CRON_SECRET` solo por compat). |
| `TELEGRAM_CHAT_ID` | Chat ID de Alberto donde llegan los avisos del bot. Par obligatorio de `TELEGRAM_BOT_TOKEN`. |
| `TELEGRAM_WEBHOOK_SECRET` | Valida que los callbacks de Telegram llegan del servidor de Telegram (no de terceros). |
| `CRON_SECRET` | **Llave maestra** que autentica los crons de Vercel y las llamadas servidor→servidor. **NO ponerla en prompts de rutinas** (ver `ALERTA_TOKEN`). El endpoint `/api/internal/alerta` la sigue aceptando solo por compatibilidad. |
| `ALERTA_TOKEN` | Token **dedicado** de bajo privilegio: SOLO abre `/api/internal/alerta` (aviso Telegram de las rutinas de Claude Code). Es el que va en el prompt de las rutinas — si se filtra, solo permite mandar un Telegram. Si no está definido, el endpoint acepta `CRON_SECRET` (compat). |
| `EINFORMA_CLIENT_ID` / `EINFORMA_CLIENT_SECRET` | **PENDIENTE (Alberto contrata eInforma).** Credenciales OAuth2 client_credentials de la API de eInforma para el **enriquecimiento de «Empresas en dificultad»** (`lib/empresas-einforma.ts`: informe financiero → patrimonio neto, EBITDA, fondo de maniobra, deuda, CNAE, facturación, incidencias RAI/ASNEF). Sin ellas el enriquecimiento degrada con aviso «pendiente de contratar», no rompe. Opcional `EINFORMA_BASE_URL` (default `https://api.einforma.com`). ⚠️ Al activar, CONFIRMAR las rutas/campos del payload marcados en `empresas-einforma.ts` contra la doc/sandbox. |
| `EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR` | Tope de gasto mensual € del enriquecimiento de empresas (default `50`; `0` = sin límite). Se compara contra la suma del ledger `empresas_enriquecimiento_coste` del mes. `EMPRESAS_ENRIQUECER_COSTE_EUR` = coste estimado por empresa (default `12`, ~precio del informe financiero en pack). |
| _(Acceso invitado «Empresas»)_ | **NO es una env.** El token de acceso invitado (Pablo prueba el módulo sin cuenta) vive en la **tabla BD `empresas_acceso_token`** (fila única `id=1`, `token`/`activo`), para poder **rotarlo/revocarlo sin redeploy** (el conector de Vercel no deja escribir envs desde las sesiones de Claude). Enlace: `…/invitado/empresas?token=<valor>` → la página lo canjea en `/api/empresas/invitado` (fija cookie httpOnly `empresas_invitado`) → `lib/empresas-acceso.ts::accesoEmpresas` valida la cookie contra la BD (runtime Node; el middleware edge solo enruta por presencia de cookie). Acepta sesión O token en `/api/empresas/*` **salvo enriquecimiento (POST) e ingesta-manual, que son SOLO sesión**. El invitado no ve «Enriquecer» ni «Actualizar BORME». **Revocar/rotar:** `UPDATE empresas_acceso_token SET token='…'` o `activo=false` (por Supabase MCP). |

> **Sobre la "BD unificada" de ia-rest:** la unificación quedó **a medias**. El schema
> `iarest` de la BD compartida es un **clon vacío del DDL** (~200 tablas a 0 filas + tabla de
> log `_mig_ddl`); los **datos vivos** de ia-rest siguen en su **proyecto Supabase propio**
> (`efncqyvhniaxsirhdxaa`, schema `public`), de donde lee su producción. Por eso plataforma
> **NO** lee ia-rest por Prisma sobre `iarest.*`, sino por el **puerto HTTP** (ver abajo).
> `IAREST_SUPABASE_URL` / `IAREST_SUPABASE_SERVICE_KEY` ya no se usan en plataforma.

## Root Directory en Vercel
`apps/plataforma` — install `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.

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

- [x] **Cierre ciclo tarjetas/facturas (02/07/2026):** `/api/banca/importar` acepta **PDF de tarjeta Kutxabank** (`lib/extracto-tarjeta-pdf.ts`, parser puro + pdf-parse por subpath, `origen='pdf'`; el `ccc` sale del PAN → `TARJETA-KUTXA-<últ.4>` y el dedupe_hash es idéntico al de Excel/manual → reimportar no duplica). `health-check` +2 checks: **Check 7 cuadre tarjetas** (liquidación `TARJ.CRDTO` en corriente sin espejo `PAGO RECIBO` en otra cuenta = falta el extracto de ese mes → 🔴 Telegram) y **Check 8 justificantes** (últimos 10 días del trimestre: deducibles sin `conciliado`/`factura_ref` → aviso con total y link a `/finanzas?tab=gastos`).
  - **Subir el extracto al AGENTE (📎), no solo en /banca (13/07/2026, Fase 1):** el 📎 del chat contable (y Telegram) detecta un extracto de tarjeta (`esExtractoTarjeta`, ≥3 movimientos) en `lib/contable/documentos.ts::procesarDocumento` y lo enruta a `lib/contable/extracto-tarjeta.ts::procesarExtractoTarjeta` (variante `DocProcesado.tipo='extracto_tarjeta'`) — NO al lector de factura suelta. Ese flujo: parse → resuelve sociedad/titular por el ccc de la tarjeta (reutiliza la `cuentas_bancarias` existente; **NO** filtra `cuentas` por `estado`) → `importarExtracto(...,'pdf',titular,'tarjeta')` → `analizarMovimientos` → **empareja DEVOLUCIONES** (`lib/devoluciones-tarjeta.ts::casarDevolucion`: abono que no es `PAGO RECIBO` ↔ compra misma comercio+importe, ventana 120d → copia `destino`/`propiedad_id` para que se ANULEN; sin casar → `requiere_revision` + botones `mov_*` propios, porque `getMovimientosDudosos` solo mira cargos) → **cuadre** (`cuadrarExtractoTarjeta`: Σcompras−Σdevoluciones = liquidación; si no cuadra, avisa) → `enviarResumenTarjeta` (dudosas por Telegram) → **archiva el PDF en Drive** (`subir`, año/mes). Check 7 ahora pide "súbeme el PDF en el chat (📎)" en vez de "/banca". Restricción de Alberto: sube en el PC (web), revisa dudosas en el móvil (Telegram). **Fase 2 (vigilantes, mismo PR):** `lib/vigilantes-tarjeta.ts` (puro: `esCargoFinanciero`/`dobleCobro`/`subioPrecio`) + `vigilantesTarjeta()` en `extracto-tarjeta.ts` manda UN mensaje Telegram tras importar con lo que aplique: intereses/comisiones, posible cobro doble (mismo comercio+importe), cargos de comercio nunca visto (>80€, solo si hay histórico), subidas de precio de recurrentes, y justificantes pendientes de deducibles >100€ sin factura (enlaza Check 8). **Fase 3 (comodidades, 13/07/2026):** (a) **extracto consultable por el chat** — al archivar en Drive se persiste el enlace por tarjeta+mes en `contable_memoria` (clave `extracto_tarjeta:<PAN4>:<YYYY-MM>`, excluida del contexto del LLM como los `sinonimo_negocio:`), y una intención nueva `extracto_drive` (detector puro en `intencion.ts`, respuesta en `respuestas-directas.ts`, también enrutable por la IA) devuelve el link a demanda ("enséñame el extracto de junio de la ****0302"); (b) **auto-factura del correo** — tras importar, `procesarExtractoTarjeta` dispara `conciliarFacturasDesdeGmail` (acotado `maxAdjuntos:8/mesesAtras:2`, best-effort) para enganchar YA los justificantes de las compras deducibles recién importadas (mismo motor conservador que el cron diario `facturas-conciliar-gmail`, que sigue de red de seguridad).
- [x] **`/banca` = cuadro financiero UNIFICADO + IA GRATIS (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, PRs #882/#886-893):** sustituye a la vista suelta de movimientos. **Core (F1-F3):** period-driven (`?year/quarter/desde/hasta`, default mes en curso, mismo `IntervaloSelector` que la radiografía) — `ResumenPeriodo.tsx` reusa `getResumenFinanciero`; gráficas Recharts (evolución + dona); P&L de pisos (`getPLMensual`); libro completo paginado con reclasificación en línea (`MovimientosTabla`, PR #840, ver bullet de arriba). **Extras de IA GRATIS bajo demanda (todos: la IA solo SUGIERE/CLASIFICA/NARRA, los importes SIEMPRE salen de `lib/banca.ts`/`lib/finanzas.ts`, nunca los inventa):** 🧾 **Cazador de deducciones** (`lib/cazador-deducciones.ts`, `POST /api/banca/cazador-deducciones`) — gasto personal que probablemente es deducible + ahorro fiscal estimado; 💬 **Mini-chat** (`MiniChatContable.tsx` → `POST /api/contable/chat`, embebe el agente contable existente); 🤖 **Sugerir por fila** en cargos del libro (reusa `POST /api/finanzas/gastos/sugerir`); 📈 **Benchmark entre pisos** (`BenchmarkPisos.tsx`, lectura IA bajo demanda vía `POST /api/banca/benchmark-pisos`); ✂️ **Fugas en recurrentes** (`POST /api/banca/fugas`, anualiza los recurrentes que ya detecta la tesorería y marca cancelar/renegociar); 🚨 **Antifraude** (`POST /api/banca/antifraude`, **reglas DETERMINISTAS sin IA** — cobro doble/comercio nuevo/subida de precio/cargo financiero, reusa `lib/vigilantes-tarjeta.ts` + `lib/comercio.ts`); 📤 **Cierre de mes narrado** (`lib/resumen-mensual.ts::enviarResumenMensual`, cron día 1 08:00 `/api/cron/resumen-mensual`, por cuenta: cifras del mes anterior + narración IA de 1-2 frases que degrada sin romper). Todo verificado `tsc` 0 + `next build` exit 0. Pendiente (F4 cola): desviación explicada, aviso fiscal proactivo, adjuntar/conciliar factura por foto en banca; F5: módulo 🛒 tickets de súper + comparador de precios.
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
- [x] **Health-check: Check 6 (alertas) RETIRADO (11/07/2026):** contaba filas de la tabla `alertas` (de **IALIMP**, operativa de limpiezas de Sique Brilla) con >30 días **sin filtrar por empresa** → metía el backlog de Vanessa al Telegram de Alberto (saltó con `🟡 152 alertas`). Esas alertas no son de plataforma; ialimp ya las gestiona (panel 🔔 + cron semanal `alertas-pendientes` que avisa a `empresas.email`). **No reintroducir ningún conteo de `alertas` en el health-check de plataforma** (es de otro tenant). Raíz del atasco: el log `asignacion_auto` de ialimp se insertaba sin leer y no se purgaba (corregido en ese repo). Diseño: `docs/superpowers/specs/2026-07-11-health-check-alertas-limpiezas-design.md`.
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
  (nunca actúa) · codigos-verificacion/dudoso→sin tocar. Tablas `correo_triaje`/`correo_cursor`/
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
  **`CONTABLE_MODEL`** (default `deepseek-ai/deepseek-v3` por NVIDIA NIM, gratis; id erróneo degrada a
  Groq→Gemini→Kimi, nunca rompe). `stripThink()` quita `<think>` de modelos de razonamiento antes de
  parsear. Protocolo side-channel: el modelo emite `APRENDER:{json}` (hábitos) y `ACCION:{json}`
  (propuestas sobre un `#ref`), parseado por regex puro en `parse.ts`. Módulos puros
  (`intencion`/`parse`/`formato`/`acciones-tipos`/`documentos-tipos`) testeables con `node --test` (sin
  `@/` ni Prisma). Cadena de fallback IA global: **NIM → Groq → Gemini → Kimi** (`@central/core-ai`).

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
- **Personas a través de verticales (RR.HH., SOLO LECTURA):** `/operador/personas` (`PersonasClient.tsx`)
  consolida a la **misma persona** aunque tenga roles en varias verticales, agrupando por **`persona_id`**.
  `lib/personas.ts` lee ialimp (`limpiadoras`, prisma directo) + rrhh (empleados por el puerto operador
  `/api/operador/personas`, Bearer `RRHH_OPERADOR_SECRET`) y **propone enlaces** no hechos por DNI/email
  (`coincidenciaPersona` de `@central/core-identity`). API: `GET /api/admin/personas`. **El enlace MANUAL
  del `persona_id` (escritura cross-app) está PENDIENTE** — hoy solo se sugiere.

## Concursos públicos / licitaciones (agente) — PORTADO de ialimp (19/06/2026)
Las licitaciones son **transversales a los negocios de la cuenta** (fontanería, catering, limpieza…), por eso el agente vive aquí y **se eliminó de ialimp**. Sección de usuario **🏛️ Concursos** (`/concursos`, sidebar *Mi negocio*). Consume el módulo PURO **`@central/module-concursos`** (en `transpilePackages`).
- **Scope = CUENTA.** Las rutas usan `requireEmpresaId()` (shim `lib/tenant.ts` → `requireSession().id` = `cuenta_id`); las tablas guardan ese id en su columna `empresa_id`. El **corpus `concursos_licitaciones` es GLOBAL** (compartido, sin scope).
- **Shims de compatibilidad** (para que el código portado de ialimp funcione sin reescribir): `lib/prisma.ts` (re-export de `lib/db`), `lib/tenant.ts` (`requireEmpresaId`), `lib/mailer.ts` (`getTransporter`/`MAIL_FROM` sobre `@central/core-email`). **IA:** `lib/ai-client.ts` añade `aiComplete()` (NVIDIA NIM `nimChat`); el módulo entra por el puerto `aiRunner` de `lib/concursos.ts`.
- **Páginas:** `app/(usuario)/concursos/{page,perfil/page,biblioteca/page}.tsx` (tokens `var(--primary)`). **API:** `app/api/concursos/**` (buscador, radar, seguidos, preparar, analizar, perfil, biblioteca, `[id]/{memoria,sobre-administrativo,oferta}`, radar/{buscar,resumen,interpretar,criterios,importar,visto}). **Crons** (`vercel.json`, auth `lib/cron-auth.ts`): `concursos-ingesta` (corpus PLACSP), `concursos-radar`, `concursos-avisos` (digest email de nuevos), `concursos-cierre` (recordatorio ≤3 días). Los crons de email hacen `JOIN cuentas` (no `empresas`) para el destinatario.
- **No portado:** OCR de PDFs escaneados (deps pdfjs/canvas). Si el pliego no trae texto, `analizar` avisa.
- **OJO envs:** para que los crons de email envíen, el proyecto Vercel `plataforma` necesita `SMTP_*`/`RESEND_API_KEY` (hoy viven en `ialimp`). `NVIDIA_API_KEY` y `CRON_SECRET` ya están. PLACSP da **403** a IPs no-Vercel → la ingesta solo corre en preview/prod.
- **Tablas** (BD compartida, ya aplicadas): `concursos`, `concursos_licitaciones`, `concursos_seguidos`, `concursos_perfil_empresa`, `concursos_radar_criterios`, `concursos_radar_anuncios`, `biblioteca_documentos` (+ columnas `resumen_ia`, `avisado_email_at`, `recordatorio_cierre_at`).

## Reglas
- Multi-tenant: SIEMPRE filtrar por `cuenta_id` en todas las queries.
- Sin credenciales en repo.
- El sector es texto libre (enchufable); no hardcodear la lista salvo en UI labels.
- **Formato de dinero:** todo importe en € usa el helper **`eur()` de `lib/dinero.ts`** → `2.162,49€`
  (formato español, € detrás, punto de millar también en 4 cifras). Vale para pantalla, Telegram y email.
  Prohibido `€${x.toFixed(2)}` suelto / estilo dólar. Regla global en el CLAUDE.md raíz.
