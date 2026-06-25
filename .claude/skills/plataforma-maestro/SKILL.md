---
name: plataforma-maestro
description: >
  Router de contexto de la vertical PLATAFORMA (cuadro de mando consolidado de la casa de
  marcas + god-panel de operador; jerarquía Cuenta → Sociedad → Negocio). NO duplica los docs:
  dice qué existe, dónde vive y qué NO romper antes de tocar nada. USAR SIEMPRE que Alberto
  pida cualquier cosa de plataforma: dashboard consolidado, god-panel `/admin`, adaptadores por
  vertical, resumen financiero cross-negocio, registro de cuentas, o el puerto HTTP a ia-rest.
  Sin secretos: solo nombres de variable.
---

# PLATAFORMA — router de contexto

> Esto es un **índice/puente**, no una copia. La fuente de verdad es
> `apps/plataforma/CLAUDE.md` y los diseños apuntados abajo. Si algo de aquí
> contradice al código, manda el código: corrige este router en el mismo commit.

## Antes de tocar nada (gate obligatorio)
1. Lee `apps/plataforma/CLAUDE.md` — qué es, BD, envs, estado y god-panel.
2. Identifica el objetivo: dashboard del dueño vs **god-panel `/admin`** (operador Alberto).
3. Toda query **scopeada por `cuenta_id`**. El god-panel se auto-protege en los handlers (`getAdmin`).
4. Si tocas datos de ia-rest: recuerda que **NO** se leen por Prisma sobre `iarest.*` (clon vacío)
   sino por **puerto HTTP** (`${IAREST_URL}/api/operador/*`, Bearer `OPERADOR_SHARED_SECRET`).

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Qué es, BD, envs, estado, reglas | `apps/plataforma/CLAUDE.md` |
| **Concursos / licitaciones** (agente, sección de usuario `🏛️ Concursos`, scope CUENTA) | Portado de ialimp (jun-2026). Páginas `app/(usuario)/concursos/*`, API `app/api/concursos/**`, módulo puro `@central/module-concursos`. **Buscador** sobre corpus compartido `concursos_licitaciones`; ingesta PLACSP en `lib/concursos-ingesta.ts` (cron `concursos-ingesta` 6 h + botón "⟳ Actualizar ahora"). **PLACSP da 403 fuera de Vercel** → la ingesta solo trae datos en preview/prod. **Provincia** = del **código postal del órgano** (`provinciaDeCP` del módulo; el feed solo trae ubicación en ~56% → filtro de zona **estricto**, el resto sale solo en "Toda España"). Shims `lib/{prisma,tenant,mailer}.ts`; IA por `aiComplete` (NVIDIA). **Emails** (avisos/cierre) requieren `SMTP_*`/`RESEND_API_KEY` en el Vercel de plataforma. Detalle en `apps/plataforma/CLAUDE.md` |
| **Personas a través de verticales** (god-panel, RR.HH., solo lectura) | `/operador/personas` + `lib/personas.ts`; consolida por `persona_id` (ialimp por prisma + rrhh por puerto `/api/operador/personas`), sugiere enlaces por DNI/email (`@central/core-identity`). Enlace MANUAL pendiente. Detalle en `apps/plataforma/CLAUDE.md` |
| **Concursos públicos / licitaciones** (movido desde ialimp el 19/06/2026, PR #403) | Sección usuario **🏛️ Concursos** (`/concursos`, sidebar *Mi negocio*). Scope = CUENTA (`lib/tenant.ts` shim). Corpus `concursos_licitaciones` GLOBAL. Consume `@central/module-concursos`. Crons: `concursos-ingesta`, `concursos-radar`, `concursos-avisos`, `concursos-cierre` (en `vercel.json`). **OJO PLACSP da 403 a IPs no-Vercel** → ingesta solo en preview/prod. **PENDIENTE env**: `SMTP_*`/`RESEND_API_KEY` en el proyecto Vercel plataforma para que salgan los emails. Detalle en `apps/plataforma/CLAUDE.md` |
| **Pasarela de IA central** (keys de proveedor solo aquí) | `/api/ai/{chat,search,vision,tools}` (Bearer `AI_GATEWAY_SECRET`) + `lib/ai-gateway.ts` (`verificarSecreto`/`registrarUso`/`dentroDePresupuesto`/`resumenIA`) + tabla `public.ai_usos`. Panel **god-panel → 🤖 IA · gasto** (`/operador/ia`). Las verticales (rrhh/ialimp/sivra/**ia-rest**) llaman con `gatewayChat`/`gatewaySearch`/`gatewayVision`/`gatewayTools` de `@central/core-ai`; conexión por envs Team-shared `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`. ia-rest 100% conectado el 16/06/2026 — las 4 vías (`callAI`/`callAISearch`/`callAIVision`/`callAITools`) pasan por la pasarela (`/api/ai/tools` = function-calling NIM con presupuesto+registro) |
| **Secretos · inventario + edición blindada** (god-panel → 🔑 Secretos, `/operador/secretos`) | MAPA de todas las credenciales (`lib/secrets-registry.ts` — metadatos, NUNCA valores). Claves `editable` (solo `api-externa`) se **sobrescriben en Vercel desde el panel**: `api/operador/secretos/set` (6 candados: `getAdmin` + 2º factor `loginAdmin` + allow-list `editable`+`vercelProject` + bloqueo `firma-sesion` + write-only + auditoría `secrets_audit`) → `lib/vercel-env.ts` (`upsertProjectEnv` write-only + `redeployProjectProduction` auto). Inerte sin `VERCEL_ADMIN_TOKEN`. **Para hacer gestionable una clave nueva: añadir su fila en `secrets-registry.ts` con `editable:true`+`vercelProject`** (el panel no crea nombres arbitrarios). 2º factor → TOTP es un PENDIENTE elegido. Fase 2 = #502/#503/#504 |
| **Correduría CIMA LIQ** (integración TIREA/CIMA WSE Estándar → liquidaciones de seguros → cruce BBVA → alerta Telegram) | Cron `cima-liq` (`30 7 * * *`) en `apps/plataforma/vercel.json`. Cliente SOAP: `lib/cima.ts` (`recibirFicherosPendientes` + `confirmarFicherosRecibidos`, parsea EIAC 6.0, base64 latin1, mapeo códigos CIMA → compañías). Handler: `app/api/cron/cima-liq/route.ts` (upsert `cima_liquidaciones` por `nombre_fichero`, cruce ±45d contra `movimientos_bancarios WHERE destino='seguros'`, Telegram `🟡` si \|diff\| > 5€). BD: tabla `cima_liquidaciones` + `idx_cima_liq_cuenta_periodo` (migración aplicada 24/06 en `wswbehlcuxqxyinousql`). Envs: `CIMA_WSE_USER`, `CIMA_WSE_PLATAFORMA`, `CIMA_WSE_PASSWORD`. PR #508. ⚠️ `SERPER_API_KEY` ausente en plataforma → `mercado/cron` mudo (añadir a Vercel plataforma) |
| Diseño del god-panel | `docs/DISEÑO-god-panel.md` |
| Plataforma modular (roadmap) | `docs/PLAN-plataforma-modular.md` |
| Radiografía del repo (pestaña 🗺️ Estructura) | `docs/ESTRUCTURA.md` |
| Estado vivo del proyecto | `docs/CONTEXTO-SESIONES.md` |
| Estructura del monorepo | `MATRIZ.md` |

## Infra (sin secretos — nombres de variable)
- **Supabase** `wswbehlcuxqxyinousql` (schema `public`) — **COMPARTIDA con sivra y ialimp**.
  Tablas propias: `cuentas`, `sociedades`, `negocios`.
- Stack: Next 15 · Prisma · JWT (jose/bcryptjs, cookie `plataforma_session`) · sin Tailwind (CSS vars).
- God-panel: auth propia (cookie `plataforma_admin`, 8h) contra tabla `superadmins` (mismo login que `/superadmin` de ialimp).
- Envs: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `IAREST_URL`, `IALIMP_URL`,
  `OPERADOR_SHARED_SECRET` (mismo valor en el proyecto Vercel `ia-rest`).
  - `SIVRA_URL`: **YA NO se usa en runtime** (Fase 1 retirada de sivra, 21/06/2026 — el aviso de early
    check-in pasó a llamada interna y el dashboard enlaza a `/sivra/income`). Env muerta; no se borra
    porque la app standalone `apps/sivra` se mantiene como web pública (ver `sivra-maestro`).
- Root Directory Vercel: `apps/plataforma`.

## Pilar autónoma — `/finanzas/pilar` (23/06/2026, PR #462)
- **Cuentas bancarias de Pilar:** se importan con `titular='conyuge'` (campo en `cuentas_bancarias`). El select "Titular de la cuenta" en `BancaClient.tsx` lo recoge y lo pasa a `lib/banca.ts::importarExtracto(titular)`.
- **Auto-clasificación:** `clasificarDestinoDetalle(banco, concepto, contraparte, importe, titular)` acepta `titular` como 5º parámetro. Para `titular='conyuge'`: TGSS/Seg.Social → `actividad_pilar` + `subcategoria='cuota_autonomos'`; abono → `actividad_pilar` + `cobro_cliente`; cargo → `actividad_pilar` + `gasto_profesional`. `lib/categorizar.ts` lee `cb.titular` y persiste `subcategoria` en BD.
- **BD:** `movimientos_bancarios.subcategoria TEXT` (nuevo). `fiscal_perfil` + 5 campos cónyuge autónoma: `conyuge_es_autonomo`, `conyuge_ingresos_brutos`, `conyuge_gastos_deducibles`, `conyuge_cuota_autonomos`, `conyuge_retenciones`. Migración: `prisma/sql/2026-06-23_pilar_autonoma.sql`.
- **`getResumenPilar(cuentaId, year, quarter)`** en `lib/finanzas.ts`: 4 queries paralelas — totales (cobros/gastos_prof/cuota_ss), clientes top, evolución mensual, recientes. Calcula concentración (>75% = alerta Hacienda), Modelo 130 por trimestre, badges de plazo (✅/🟡/⬜). Fechas M130: Q1→20 abr · Q2→20 jul · Q3→20 oct · Q4→30 ene.
- **`compararDeclaracion()`** en `lib/fiscal-deducciones.ts`: conjunta vs separada — cuota ambas, ahorro y recomendación.
- **`/finanzas/pilar`** (page.tsx + PilarClient.tsx): KPIs morado, evolución mensual, Modelo 130 por trimestre, tabla clientes con alerta concentración (banner naranja si >75%), movimientos recientes con badges subcategoría.
- **`/finanzas`:** card compacta "🟣 Actividad de Pilar" en el grid de accesos rápidos → enlace a `/finanzas/pilar`.
- **`/api/finanzas/perfil`:** GET/PUT incluye los 5 campos `conyuge_*`.

## Home `/dashboard` "de un vistazo" (PR #523, 25/06/2026)
`app/(usuario)/dashboard/page.tsx` (Server Component) + 3 funciones nuevas en `lib/banca.ts`. Widgets:
**Saldo por cuenta** (`getCuentasConMovimientos`, excluye `titular='conyuge'`) = tarjeta por cuenta con
saldo + movs de los 2 últimos días (incl. `saldo_posterior`). **Pisos "ya cobrado" = conciliado con banco**
(`getCobradoPisos`, abonos `turistico_*` mes/YTD; el banco solo separa **Dúplex (BBVA) vs Pisos (Kutxa
agrupados)**, NO por piso individual) + desglose por piso desde `incomes.amount` (neto, *facturado*) con
ocupación/ADR. **Reservas por piso ±7 d** (`getReservasVentana`). Extras: pendiente cobrar OTA
(`getEstadoCobrosOTA`), top gastos del mes (`getTopGastosMes`), aviso Modelo 130 (`getResumenPilar`).
**LANDMINE (igual que el resto de widgets):** las funciones `getResumen*` del dashboard deben replicar la
lógica de las páginas/APIs correspondientes; no simplificar con SQL puro.

## Módulo banca y finanzas (18/06/2026)
- **`lib/destino.ts`** (puro, testeable `node --test`): clasifica el destino de un movimiento. En ABONOS recibidos (Norma 43), la contraparte es el TITULAR propio → clasificar por CONCEPTO, NO por nombre (de lo contrario, las comisiones de seguros quedan como 'traspaso_interno' y desaparecen del P&L). En CARGOS, el nombre sí identifica traspasos internos. `lib/categorizar.ts` reexporta.
  - **ABONOS de BBVA (23/06/2026):** los que casan comisión (`RE_COMISIONES`/`RE_SEGUROS`/`RE_LIQUID_SEGUROS` = saldo agente/remsaldo/saldo cuenta/pago saldo cta/PD005) → `seguros`; `RECIBIDO:` (Bizum particular) → `personal`; **Booking del Dúplex se reconoce por el marcador fiable `LIQ. OP. Nº`** (lo trae el feed PSD2) → `turistico_duplex`. Lo que **no casa nada** ya NO cae a Dúplex por descarte: va a `personal` + **`requiere_revision`** (`clasificarDestinoDetalle` → `{destino,revisar}`). **Cerrado "capturar el ordenante":** BBVA NUNCA lo da (ni Excel ni PSD2, que pone el titular en `debtor.name`); el discriminante es `LIQ. OP.`. Excel↔PSD2 se solapaban → depurado el doble conteo (22 cobros, 8.459€; `prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql`). El cuadre `/cuadre-booking` cuenta por `destino`, no por el concepto.
- **Correduría `/correduria`** (`app/(usuario)/correduria/`, sidebar Mi negocio): matriz comisiones por compañía×mes desde `movimientos_bancarios` con `destino='seguros'`. **La correduría es SIEMPRE BBVA** — `lib/destino.ts` solo asigna `seguros` en BBVA; un recibo de aseguradora en Kutxa/otros es seguro PROPIO (coche/hogar) → `personal` (o `turistico_pisos` si es de un piso). No clasificar `seguros` fuera de BBVA. `lib/correduria.ts` (puro): `detectarCompania`, `motivoSeguros`, `claveReferencia`, `COMPANIAS_CONOCIDAS`. Importe formato `1.543€`; celdas clicables → desglose (`/api/correduria/detalle`) con confirmar/reclasificar.
  - **Aprendizaje (clave de referencia → …):** dos tablas en BD compartida. `correduria_reglas (cuenta_id,clave,compania)`: al asignar compañía en el desglose se aprende por código (M1454→Asisa, M00171/8-92361→Occident, PD005→Caser) y se aplica a todos los iguales. `banca_destino_reglas (cuenta_id,clave,destino)`: al sacar de seguros ("No es de seguros") se aprende el negocio (p.ej. DNI de la pensión→personal). `lib/categorizar.ts` consulta `banca_destino_reglas` al ingestar; matriz/detalle consultan `correduria_reglas`. Override por movimiento: columna `movimientos_bancarios.compania_seguros`.
  - **⚠️ LANDMINE — widgets resumen en el dashboard:** NO hacer GROUP BY sobre `compania_seguros` directamente en SQL. La compañía se resuelve en 3 pasos JS: `compania_seguros || reglas.get(claveReferencia(concepto)) || detectarCompania(...)`. Un GROUP BY en SQL solo ve el campo manual → todas las compañías detectadas por nombre/código caen en "Otras" y desaparecen del widget. La función `getResumenCorreduria` en `dashboard/page.tsx` aplica esta cadena sobre filas raw (PR #480, jun-2026).
- **`/sivra/facturas-control`** (sidebar Mis pisos → 🗂️ Facturas): estado mensual por proveedor recurrente (✅/⏳/❌). API `GET/POST /api/sivra/facturas-control`. Alerta `facturasFaltantes` en `lib/banca.ts::getAlertas` → banner dashboard.

## Landmines (no romper — detalle en CLAUDE.md)
- **`middleware.ts` deja pasar los crons por `CRON_SECRET`** (Bearer o `?secret=`) ANTES del gate de
  cookie de sesión. **Es lo que permite que corran los crons `/api/sivra/*`** (snapshot, apply-auto,
  updates/sync, mercado, guard, limpiadoras, mensajes…): el cron de Vercel llega sin cookie, y sin esa
  excepción se redirige **307 → /login** y el handler nunca se ejecuta (así estuvieron **5 días mudos**
  en jun-2026, #429). NO quitar esa excepción ni meter rutas de cron tras el gate sin el secreto. Los
  handlers ya revalidan (`isCronAuthorized` o `secretOk || getSession()`), así que no abre datos.
  Heartbeat de vigilancia: paso 2-bis de `/auditoria-diaria`.
- **ia-rest vive en OTRA BD**: la unificación quedó a medias; `iarest.*` del compartido es un **clon vacío del DDL**.
  Los datos vivos están en el proyecto Supabase propio de ia-rest (`efncqyvhniaxsirhdxaa`). Léelo por el **puerto HTTP**.
- **Adaptadores por vertical** (`lib/adapters/*`, contrato `VerticalAdapter`): ialimp+sivra → BD directa (SQL raw);
  iarest → puerto HTTP. **No se fusiona nada.**
- Sin `OPERADOR_SHARED_SECRET` correcto, el panel no ve los clientes de ia-rest (ialimp+sivra sí).
- 🏠 Mis propiedades: "Resumen" lee `properties` (sivra Smoobu), **NO** `propiedades` (multi-tenant limpiadoras).
- **Dashboard widgets vs páginas completas:** los widgets del dashboard usan funciones `getResumen*` en `dashboard/page.tsx` (Server Components). Estas funciones DEBEN replicar EXACTAMENTE la lógica de detección de las páginas/APIs correspondientes. No simplificar con SQL puro si la página aplica lógica JS post-query (p.ej. correduría aplica cadena manual→regla→auto en JS). Si el API route y el widget producen números distintos, el widget está mal.
- **Dedupe PSD2 = por CONTENIDO, NO por entry_reference (#524, 25/06/2026):** `lib/psd2.ts::hashMov` deduplica con `dedupe_hash` = `cuenta_bancaria_id|fecha|importe(2dec)|upper(trim(concepto))`. **NUNCA volver a usar el `entry_reference`/`accountUid` de Enable Banking como clave:** el banco (BBVA/Kutxa) los ROTA entre sesiones → el mismo movimiento reaparece con otro hash y burla el `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)` (así se duplicaron cuota PTMO, recibos de tarjeta, etc.). El hash JS debe coincidir BYTE A BYTE con el backfill SQL (`prisma/sql/2026-06-25_psd2_dedupe_contenido.sql`); si tocas uno, toca el otro y re-backfillea. Matiz aceptado: dos movimientos idénticos el mismo día se colapsan en uno.

## Frontera multi-tenant
Scope `cuenta_id` siempre. BD compartida con sivra/ialimp: cambios transversales de BD → `auditoria-central`.
