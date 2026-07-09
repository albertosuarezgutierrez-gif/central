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
| `EB_PIS_ENABLED` | `true` activa el flujo Enable Banking PIS. Dejar vacío/omitido para usar el fallback SEPA XML pain.001. **Pendiente confirmar tier gratuito Enable Banking.** |
| `EB_DEBTOR_IBAN` | IBAN de Kutxabank desde el que se debitan los pagos PIS. |
| `NVIDIA_API_KEY` | LLM primario de la pasarela de IA (`/api/ai/*`) y de concursos (NIM, gratis). |
| `GEMINI_API_KEY` | Búsqueda web + **fallback de texto GRATIS** de `aiComplete` (cadena NIM → Groq → **Gemini** → Kimi; `geminiChat`, sin grounding) y de la pasarela (`/api/ai/chat`). Se activa solo con la key ya presente → evita "IA no disponible" sin coste. Override de modelo: `GEMINI_BRAIN_MODEL`. |
| `GROQ_API_KEY` | **Fallback de texto gratis de la pasarela** (NIM → **Groq** `llama-3.3-70b-versatile`, mismo modelo) en `aiComplete`/`aiTools`. Sin ella el fallback queda inactivo (no rompe). Override de modelo: `GROQ_BRAIN_MODEL`. |
| `MOONSHOT_API_KEY` | **Último fallback de texto** (… → **Kimi**/Moonshot, de pago) en `aiComplete`. Sin ella queda inactivo (no rompe). Opcionales: `MOONSHOT_MODEL` (default `kimi-k2-0711-preview`), `MOONSHOT_BASE_URL` (usa `.cn` si aplica). |
| `OPENROUTER_API_KEY` | **Camino PRIMARIO de la pasarela** (09/07/2026): agregador OpenRouter con el **Agente Director** eligiendo modelo por petición + fallback nativo entre modelos. Sin ella todo queda como antes (cadena gratis NIM→Groq→Gemini→Kimi). Opcionales: `OPENROUTER_MODEL` (default `deepseek/deepseek-chat`), `OPENROUTER_FALLBACK_MODELS` (csv de suplentes), `OPENROUTER_BASE_URL`, `OPENROUTER_REFERER`/`OPENROUTER_TITLE` (atribución). |
| `DIRECTOR_MODO` | `sombra` (default: el Director decide y se REGISTRA en `ai_usos` pero se sirve con el modelo por defecto — 1ª semana) · `activo` (enruta de verdad). Opcionales: `DIRECTOR_MODEL` (modelo barato que decide, default `deepseek/deepseek-chat`), `DIRECTOR_USAR_FLOOR` (`false` desactiva el sufijo `:floor` = proveedor más barato), `DIRECTOR_MAX_PRECIO_OUT` (techo USD/M del cron, default 20). |
| `AI_GATEWAY_LIMITE_DIARIO_EUR` | Presupuesto DIARIO en € de la pasarela (default **1**; `0` = sin límite). Al cruzarlo se bloquea SOLO el camino de pago (OpenRouter/Kimi) — la cadena gratis sigue sirviendo — y avisa por Telegram 1x/día. Límites específicos por vertical/cliente en la tabla `ia_presupuestos` (`ambito` `app`/`cliente`); atribución por cliente vía `cliente` en el body → `ai_usos.cliente_ref` (base de refacturación, panel `/operador/ia`). `AI_USD_EUR` (default 0.9) convierte el coste real del catálogo. |
| `AI_CREDITOS_UMBRAL` | Umbral en $ de créditos OpenRouter restantes bajo el cual el cron semanal `ia-director-refresh` avisa por Telegram (default 5). |
| `IA_CACHE_SEMANTICA` | `1` activa la caché semántica pgvector de la pasarela (default APAGADA). Además el caller debe mandar `cache:{ambito,ttlHoras?}` (opt-in doble; nunca cachear datos vivos). Umbral `IA_CACHE_UMBRAL` (default 0.97). Embeddings con `GEMINI_API_KEY` (text-embedding-004). |
| `CONTABLE_MODEL` | Modelo que RAZONA en el **agente contable** cuando no hay respuesta determinista (`lib/contable/cerebro.ts`). Default `deepseek-ai/deepseek-v3` (NIM, gratis con `NVIDIA_API_KEY`, mejor analista de cifras que Llama). Vacío `''` = default de la pasarela (Llama). Un id erróneo NO rompe (cae a Groq→Kimi). Para el chat, usar modelo RÁPIDO (no R1) para no agotar el timeout. |
| `TELEGRAM_BOT_TOKEN` | Bot único del monorepo (`@central/core-telegram`). Avisos automáticos, agente huéspedes SIVRA, agente pago de facturas. **Fuente única del token para todo el monorepo** — las rutinas de Claude Code no lo duplican; llaman a `/api/internal/alerta` con `CRON_SECRET`. |
| `TELEGRAM_CHAT_ID` | Chat ID de Alberto donde llegan los avisos del bot. Par obligatorio de `TELEGRAM_BOT_TOKEN`. |
| `TELEGRAM_WEBHOOK_SECRET` | Valida que los callbacks de Telegram llegan del servidor de Telegram (no de terceros). |
| `CRON_SECRET` | Secreto compartido para autenticar los crons de Vercel y el endpoint interno `/api/internal/alerta` (usado también por las rutinas de Claude Code para enviar alertas Telegram). |

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
- [x] **Fases 1–3 sivra COMPLETAS:** `/sivra/income` · `/sivra/expenses` · `/sivra/gastos-fijos` · `/sivra/fiscal` · `/sivra/calendario` · `/sivra/inversion` · `/sivra/seo` · `/sivra/mensajes` (Smoobu+AI) · `/sivra/mercado` · `/sivra/pricing` · `/sivra/pricing-auto` + todos sus APIs. Todas ya existían en plataforma.
- [x] **Fase 6 — RR.HH. admin (17/06/2026):** `/operador/rrhh/empleados` + `/operador/rrhh/solicitudes`. Read-only desde `rrhh.*` schema (BD compartida, raw SQL). Sidebar: sección "RR.HH." en NAV_OPERADOR con sub-items Empleados/Solicitudes. `lib/rrhh-operador.ts` con `getEmpleadosRrhh()` + `getSolicitudesRrhh()`.
- [x] **Fase 4 — Admin limpiadoras (17/06/2026):** `/sivra/limpiadoras` (10 tabs: Hoy, Semana, Limpiadoras, Disponibilidad, Proveedores, Stock, Lencería, Checklists, Informes, Facturación). 13 API routes en `/api/sivra/limpiadoras/*`. Auth `getSession()`. BD raw SQL vía prisma.$queryRaw sin tocar RLS ni ialimp.
- [x] **Migración crons sivra → plataforma (17/06/2026):** 7 crons migrados a `vercel.json`. Smoobu sync (`/api/sivra/updates/sync`), auto-sessions limpiadoras, auto-assign, alerta-ventana, rates/snapshot, mensajes/auto-reply, resumen-semanal. Libs añadidas: `@central/core-email` (package.json + transpilePackages), `lib/cron-auth.ts`, `lib/pricing-calendar.ts`.
- [x] **Fix banca — ingresos correduría (PR #384, 18/06/2026):** Nuevo `lib/destino.ts` (puro, testeable): en ABONOS recibidos el banco rotula la contraparte con el TITULAR (Norma 43), así que la regla anterior 'titular ⇒ traspaso_interno' ocultaba ~€10.026 de comisiones de seguros del P&L. Ahora los ABONOS se clasifican por CONCEPTO (`LIQ.COMISIONES`/aseguradoras ⇒ `seguros`; pensión/nómina/Bizum ⇒ `personal`). CARGOS sin cambio. `lib/categorizar.ts` reexporta. 7 tests `node --test` en `lib/destino.test.ts`. SQL de reclasificación aplicado a BD compartida.
- [x] **Control de facturas (PR #385, 18/06/2026):** Página `/sivra/facturas-control` (🗂️ Facturas en sidebar Mis pisos). Estado por proveedor/mes: ✅ En Drive / ⏳ En plazo / ❌ Falta. 17 proveedores recurrentes (mensual/bimestral_impar/anual_marzo) en `lib/sivra/facturas-control.ts`. API `GET/POST /api/sivra/facturas-control` (sube PDF vía Apps Script → Drive → `facturas_drive`). Alerta `facturasFaltantes` del mes anterior inyectada en `getAlertas(lib/banca.ts)` → banner en `/dashboard`.
- [x] **Correduría + aprendizaje de clasificación (PRs #435/#437/#439/#441/#444, 22/06/2026):** Página `/correduria` (matriz comisiones por compañía×mes desde `movimientos_bancarios` `destino='seguros'`). `lib/correduria.ts` puro (`detectarCompania`, `motivoSeguros`, `claveReferencia`, `COMPANIAS_CONOCIDAS`). Importe `1.543€`, celdas clicables → desglose (`/api/correduria/detalle`) con confirmar/reclasificar. **Aprendizaje por "clave de referencia"** (código del concepto: M1454, M00171, DNI…): tablas `correduria_reglas (cuenta_id,clave,compania)` y `banca_destino_reglas (cuenta_id,clave,destino)` en BD compartida — al asignar compañía o sacar de seguros se aprende y se aplica a los iguales (pasados/futuros); `lib/categorizar.ts` consulta `banca_destino_reglas` al ingestar. Override por movimiento: `movimientos_bancarios.compania_seguros`. **La correduría (`destino='seguros'`) es SIEMPRE BBVA (23/06/2026):** `lib/destino.ts` solo asigna `seguros` en BBVA. Un recibo de aseguradora (Generali/Occident/Liberty…) en Kutxa/otros es el seguro PROPIO (coche/hogar) → `personal` (o `turistico_pisos` si es de un piso). SQL `prisma/sql/2026-06-23_seguros_solo_bbva.sql`.

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
- [x] **Home `/dashboard` = RESUMEN (02/07/2026; sustituye al "de un vistazo" del PR #523):** decisión de Alberto — la home es solo un resumen de **negocios + saldos bancarios + alertas**: consolidado intercompany (condicional), aviso Modelo 130, AlertasBanner, **Saldo por cuenta con últimos movimientos** y tarjetas Sociedades+Negocios. **(03/07/2026, 2ª pasada de Alberto):** la **KPI bar se ELIMINÓ** (Ingresos año/Resultado/Negocios/Saldo del grupo — `getSaldoConsolidado` ya no se llama desde la home) y cada tarjeta de Saldo por cuenta muestra sus **últimos 5 movimientos** (fecha · contraparte/concepto · importe): `getCuentasConMovimientos(cuentaId, maxMovs=5)` pasó de "días" a "nº de movimientos" (ROW_NUMBER por cuenta, ventana de 90 días para acotar). **Todo lo demás se ELIMINÓ por duplicar páginas dedicadas** (strip Hoy, widgets Correduría/Apartamentos/Pendiente-OTA/Top gastos, gráficas CobrosPisosChart/EvolucionChart —archivos borrados—, Reservas ±7d, Comparativa mensual, Gastos por categoría). ⚠️ NO volver a añadir widgets de detalle a la home: enlazar a la página dedicada. Funciones lib sin consumidor (`getCobradoPisos`, `getSerieCobrosPisos`, `getTopGastosMes`, `getEvolucionMensual`, `getComparativaMensual`, `getGastosPorCategoria`) quedan en `lib/banca.ts` pendientes de la Fase 2 de des-duplicación.
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
  Supabase 03/07/2026**). **Modo sombra por DEFECTO al arrancar** (`TRIAJE_DRY_RUN` sin poner = clasifica y
  anota pero NO toca Gmail ni avisa — validar con los primeros digests); **`TRIAJE_DRY_RUN=false` para ir en VIVO**.
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
  las contesta por SQL SIN LLM (instantáneo, no inventa cifras, funciona con la IA saturada); (2) LLM —
  si nada casa, `construirContexto` arma un panorama completo (sociedades→negocios, saldos bancarios,
  resumen del año por destino, **posición fiscal IRPF** vía `getResumenFinanciero` —misma fuente que
  `/finanzas`—, facturas pendientes y memoria de rutina) y lo pasa al modelo. Modelo configurable por env
  **`CONTABLE_MODEL`** (default `deepseek-ai/deepseek-v3` por NVIDIA NIM, gratis; id erróneo degrada a
  Groq→Gemini→Kimi, nunca rompe). `stripThink()` quita `<think>` de modelos de razonamiento antes de
  parsear. Protocolo side-channel: el modelo emite `APRENDER:{json}` (hábitos) y `ACCION:{json}`
  (propuestas sobre un `#ref`), parseado por regex puro en `parse.ts`. Módulos puros
  (`intencion`/`parse`/`formato`/`acciones-tipos`/`documentos-tipos`) testeables con `node --test` (sin
  `@/` ni Prisma). Cadena de fallback IA global: **NIM → Groq → Gemini → Kimi** (`@central/core-ai`).

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
