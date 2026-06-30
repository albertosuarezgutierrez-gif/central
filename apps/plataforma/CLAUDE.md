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
| `GEMINI_API_KEY` | Búsqueda web + fallback de texto de la pasarela (`/api/ai/chat` → Gemini si NIM/Groq fallan). |
| `GROQ_API_KEY` | **Fallback de texto gratis de la pasarela** (NIM → **Groq** `llama-3.3-70b-versatile`, mismo modelo) en `aiComplete`/`aiTools`. Sin ella el fallback queda inactivo (no rompe). Override de modelo: `GROQ_BRAIN_MODEL`. |

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
- [x] **Módulo `/finanzas` (PR #341):** Hub financiero consolidado. Correduría (BBVA, persona física) + 4 pisos turísticos (propios: amortización 3%; subarrendados: alquiler deducible) + gastos personales BBVA (Alberto solo) / Kutxa (familiar compartida). Base imponible IRPF 2025 con tramos, declaración conjunta, reducción €3.400. Export CSV gestoría, Modelo 179 tracker. Filtros año/trimestre. Sidebar: "💶 Finanzas" 2º ítem Mi negocio.
- [x] **Fases 1–3 sivra COMPLETAS:** `/sivra/income` · `/sivra/expenses` · `/sivra/gastos-fijos` · `/sivra/fiscal` · `/sivra/calendario` · `/sivra/inversion` · `/sivra/seo` · `/sivra/mensajes` (Smoobu+AI) · `/sivra/mercado` · `/sivra/pricing` · `/sivra/pricing-auto` + todos sus APIs. Todas ya existían en plataforma.
- [x] **Fase 6 — RR.HH. admin (17/06/2026):** `/operador/rrhh/empleados` + `/operador/rrhh/solicitudes`. Read-only desde `rrhh.*` schema (BD compartida, raw SQL). Sidebar: sección "RR.HH." en NAV_OPERADOR con sub-items Empleados/Solicitudes. `lib/rrhh-operador.ts` con `getEmpleadosRrhh()` + `getSolicitudesRrhh()`.
- [x] **Fase 4 — Admin limpiadoras (17/06/2026):** `/sivra/limpiadoras` (10 tabs: Hoy, Semana, Limpiadoras, Disponibilidad, Proveedores, Stock, Lencería, Checklists, Informes, Facturación). 13 API routes en `/api/sivra/limpiadoras/*`. Auth `getSession()`. BD raw SQL vía prisma.$queryRaw sin tocar RLS ni ialimp.
- [x] **Migración crons sivra → plataforma (17/06/2026):** 7 crons migrados a `vercel.json`. Smoobu sync (`/api/sivra/updates/sync`), auto-sessions limpiadoras, auto-assign, alerta-ventana, rates/snapshot, mensajes/auto-reply, resumen-semanal. Libs añadidas: `@central/core-email` (package.json + transpilePackages), `lib/cron-auth.ts`, `lib/pricing-calendar.ts`.
- [x] **Fix banca — ingresos correduría (PR #384, 18/06/2026):** Nuevo `lib/destino.ts` (puro, testeable): en ABONOS recibidos el banco rotula la contraparte con el TITULAR (Norma 43), así que la regla anterior 'titular ⇒ traspaso_interno' ocultaba ~€10.026 de comisiones de seguros del P&L. Ahora los ABONOS se clasifican por CONCEPTO (`LIQ.COMISIONES`/aseguradoras ⇒ `seguros`; pensión/nómina/Bizum ⇒ `personal`). CARGOS sin cambio. `lib/categorizar.ts` reexporta. 7 tests `node --test` en `lib/destino.test.ts`. SQL de reclasificación aplicado a BD compartida.
- [x] **Control de facturas (PR #385, 18/06/2026):** Página `/sivra/facturas-control` (🗂️ Facturas en sidebar Mis pisos). Estado por proveedor/mes: ✅ En Drive / ⏳ En plazo / ❌ Falta. 17 proveedores recurrentes (mensual/bimestral_impar/anual_marzo) en `lib/sivra/facturas-control.ts`. API `GET/POST /api/sivra/facturas-control` (sube PDF vía Apps Script → Drive → `facturas_drive`). Alerta `facturasFaltantes` del mes anterior inyectada en `getAlertas(lib/banca.ts)` → banner en `/dashboard`.
- [x] **Correduría + aprendizaje de clasificación (PRs #435/#437/#439/#441/#444, 22/06/2026):** Página `/correduria` (matriz comisiones por compañía×mes desde `movimientos_bancarios` `destino='seguros'`). `lib/correduria.ts` puro (`detectarCompania`, `motivoSeguros`, `claveReferencia`, `COMPANIAS_CONOCIDAS`). Importe `1.543€`, celdas clicables → desglose (`/api/correduria/detalle`) con confirmar/reclasificar. **Aprendizaje por "clave de referencia"** (código del concepto: M1454, M00171, DNI…): tablas `correduria_reglas (cuenta_id,clave,compania)` y `banca_destino_reglas (cuenta_id,clave,destino)` en BD compartida — al asignar compañía o sacar de seguros se aprende y se aplica a los iguales (pasados/futuros); `lib/categorizar.ts` consulta `banca_destino_reglas` al ingestar. Override por movimiento: `movimientos_bancarios.compania_seguros`. **La correduría (`destino='seguros'`) es SIEMPRE BBVA (23/06/2026):** `lib/destino.ts` solo asigna `seguros` en BBVA. Un recibo de aseguradora (Generali/Occident/Liberty…) en Kutxa/otros es el seguro PROPIO (coche/hogar) → `personal` (o `turistico_pisos` si es de un piso). SQL `prisma/sql/2026-06-23_seguros_solo_bbva.sql`.

- [x] **Home `/dashboard` "de un vistazo" (PR #523, 25/06/2026):** `app/(usuario)/dashboard/page.tsx` + 3 funciones nuevas en `lib/banca.ts`. **Saldo por cuenta** (`getCuentasConMovimientos`, excluye `titular='conyuge'`): tarjeta por cuenta bancaria propia con saldo + movimientos de los 2 últimos días al máximo detalle (concepto, contraparte, destino, importe, **saldo posterior**, badges 🔗/🔎). **Pisos "ya cobrado" = conciliado con banco** (`getCobradoPisos`: abonos `importe>0` `destino IN (turistico_duplex,turistico_pisos)` mes/YTD; el banco solo separa Dúplex-BBVA vs Pisos-Kutxa, NO por piso individual) + desglose por piso desde `incomes.amount` (neto, *facturado*) con ocupación del mes y ADR. **Reservas por piso ±7 días** (`getReservasVentana`, estancias que solapan la ventana) agrupadas, con huésped y neto. Extras: tarjeta **Pendiente de cobrar OTA** (`getEstadoCobrosOTA`), **Top gastos del mes** (`getTopGastosMes`), **aviso Modelo 130** de Pilar (`getResumenPilar` → 1er trimestre no vencido con cobros). Sin migración de BD.
- [x] **Control de gastos / deducibilidad (23/06/2026):** `/finanzas` reorganizado en 3 pestañas (`?tab=ingresos|gastos|fiscal`, default fiscal; KPIs de cabecera fijos). **Pestaña Gastos** (`GastosTab.tsx`): triage de cargos del periodo: bandeja «Por revisar» (`requiere_revision OR NOT destino_confirmado`, sin traspasos) + buckets por deducibilidad derivada de `destino` (negocio=`seguros`, renta=`turistico_*`, no deducible=`personal`, fuera=`traspaso_interno`). Por fila: reclasificar (aprende regla y reaplica a los iguales), confirmar, toggle **amortizable**, **🤖 sugerir** (IA `aiComplete`), badge 📎 con factura / ❗ sin justificante + «buscar factura» (Gmail). Nueva columna `movimientos_bancarios.amortizable` (`prisma/sql/2026-06-23_mov_amortizable.sql`): los amortizables (mobiliario/obra) se EXCLUYEN del gasto deducible del año (`getResumenFinanciero` + trimestres) y se listan aparte (CSV `/api/finanzas/gastos/export`). Nuevos: `lib/finanzas.ts` `getGastosControl()`, `POST /api/banca/amortizable`, `GET /api/finanzas/gastos`, `POST /api/finanzas/gastos/sugerir`. **`/api/banca/destino` generalizado:** la regla por clave ya se reaplica a cualquier destino (antes solo dentro de `seguros`). v1 NO calcula el % de amortización (3%/10%) ni hace split por línea.

**`lib/destino.ts` (23/06/2026):** el cobro de Booking del Dúplex en BBVA se reconoce por el marcador **fiable `LIQ. OP. Nº`** (lo trae el feed PSD2). Los abonos de BBVA que **no casan ningún patrón** van a `personal` + **`requiere_revision`** (`clasificarDestinoDetalle` → `{destino,revisar}`), NO a Dúplex por descarte. `RE_LIQUID_SEGUROS` (saldo agente/remsaldo/saldo cuenta/pago saldo cta/PD005) mantiene en seguros las liquidaciones de agente; `RECIBIDO:` → personal. **Cerrado "capturar el ordenante":** BBVA NUNCA lo da (ni Excel ni PSD2, que devuelve el titular en `debtor.name`); el discriminante es `LIQ. OP.`, no el ordenante. Excel↔PSD2 se solapaban → se depuró el doble conteo (22 cobros, 8.459€; `prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql`). El cuadre `/cuadre-booking` cuenta por `destino`, no por el texto del concepto.

**LANDMINE — dedupe PSD2 (PR #524, 25/06/2026):** `lib/psd2.ts::hashMov` deduplica los movimientos de Enable Banking con `dedupe_hash` = `cuenta_bancaria_id|fecha|importe(2dec)|upper(trim(concepto))` (por CONTENIDO). **NUNCA usar el `entry_reference` ni el `accountUid` del banco como clave de dedupe:** BBVA/Kutxa los ROTAN entre sesiones, así que el mismo movimiento reaparece con otro hash y burla el `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)` → se duplica (pasó con la cuota del préstamo `CUOTA PTMO`, recibos `TARJ.CRDTO`, seguros de vida, etc.; 15 filas el 24/06). El hash de JS debe coincidir **byte a byte** con el backfill SQL `prisma/sql/2026-06-25_psd2_dedupe_contenido.sql` (verificado node↔postgres); si cambias el esquema, cambia ambos y re-backfillea TODAS las filas `origen='psd2'` antes del siguiente cron `psd2-sync`. Matiz aceptado: dos movimientos PSD2 idénticos el mismo día (misma cuenta/importe/concepto) se colapsan en uno.

**LANDMINE — dedupe CROSS-ORIGEN Excel↔PSD2 (26/06/2026):** el `dedupe_hash` (tanto el de `lib/norma43.ts` como el de `lib/psd2.ts`) es **por contenido e incluye el CONCEPTO**, así que **NO** colapsa el MISMO movimiento cuando llega por dos vías con el concepto distinto: el feed del banco lo trae **verboso** (`RECIBO DIGI SPAIN TELECO  FACTURA DIGI`) y el Excel **truncado** (`RECIBO DIGI SPAIN TELECO`). Si se importa un Excel **encima** de lo que el banco (`origen='psd2'`) ya trajo, **se duplica todo el periodo solapado** (pasó el 21/06: 138 movimientos duplicados → **+41.762,85€ de ingreso fantasma y +11.872,60€ de gasto fantasma**; saneado en `prisma/sql/2026-06-26_dedupe_cross_origen.sql`, soft vía `duplicado_estado='ignorado'`). **Prevención automática:** `lib/banca.ts::importarExtracto` ejecuta, tras cada import de Excel, una guarda que marca `duplicado_estado='ignorado'` (reversible) en las filas recién importadas que ya tienen gemelo PSD2 por `(cuenta, fecha, importe)`, **conservando siempre el feed del banco** y sin pasarse del nº de gemelos PSD2 (no toca repeticiones legítimas mismo día/importe). OJO: `getDuplicadosSospechosos` **excluye a propósito** los pares cross-origen del banner (líneas "Idea A"), así que estos duplicados **no salen** en la alerta de la home — dependen de esta guarda de ingesta, no del banner. **Vista canónica `v_movimientos_activos`** (`prisma/sql/2026-06-26_v_movimientos_activos.sql`): centraliza el filtro `duplicado_estado <> 'ignorado'`; **toda lectura nueva de saldo/P&L debe leer de esta vista**, no de `movimientos_bancarios` directo (así ninguna consulta "olvida" excluir duplicados — la causa raíz de que el doble conteo no se viera).

- [x] **Agente pago facturas proveedores — Fase 1+2 (30/06/2026, PRs #605+#606 mergeados):**
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
