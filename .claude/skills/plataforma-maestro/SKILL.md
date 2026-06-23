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

## Módulo banca y finanzas (18/06/2026)
- **`lib/destino.ts`** (puro, testeable `node --test`): clasifica el destino de un movimiento. En ABONOS recibidos (Norma 43), la contraparte es el TITULAR propio → clasificar por CONCEPTO, NO por nombre (de lo contrario, las comisiones de seguros quedan como 'traspaso_interno' y desaparecen del P&L). En CARGOS, el nombre sí identifica traspasos internos. `lib/categorizar.ts` reexporta.
  - **ABONOS de BBVA (23/06/2026):** los que casan comisión (`RE_COMISIONES`/`RE_SEGUROS`/`RE_LIQUID_SEGUROS` = saldo agente/remsaldo/saldo cuenta/pago saldo cta/PD005) → `seguros`; `RECIBIDO:` (Bizum particular) → `personal`; **Booking del Dúplex se reconoce por el marcador fiable `LIQ. OP. Nº`** (lo trae el feed PSD2) → `turistico_duplex`. Lo que **no casa nada** ya NO cae a Dúplex por descarte: va a `personal` + **`requiere_revision`** (`clasificarDestinoDetalle` → `{destino,revisar}`). **Cerrado "capturar el ordenante":** BBVA NUNCA lo da (ni Excel ni PSD2, que pone el titular en `debtor.name`); el discriminante es `LIQ. OP.`. Excel↔PSD2 se solapaban → depurado el doble conteo (22 cobros, 8.459€; `prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql`). El cuadre `/cuadre-booking` cuenta por `destino`, no por el concepto.
- **Correduría `/correduria`** (`app/(usuario)/correduria/`, sidebar Mi negocio): matriz comisiones por compañía×mes desde `movimientos_bancarios` con `destino='seguros'`. `lib/correduria.ts` (puro): `detectarCompania`, `motivoSeguros`, `claveReferencia`, `COMPANIAS_CONOCIDAS`. Importe formato `1.543€`; celdas clicables → desglose (`/api/correduria/detalle`) con confirmar/reclasificar.
  - **Aprendizaje (clave de referencia → …):** dos tablas en BD compartida. `correduria_reglas (cuenta_id,clave,compania)`: al asignar compañía en el desglose se aprende por código (M1454→Asisa, M00171/8-92361→Occident, PD005→Caser) y se aplica a todos los iguales. `banca_destino_reglas (cuenta_id,clave,destino)`: al sacar de seguros ("No es de seguros") se aprende el negocio (p.ej. DNI de la pensión→personal). `lib/categorizar.ts` consulta `banca_destino_reglas` al ingestar; matriz/detalle consultan `correduria_reglas`. Override por movimiento: columna `movimientos_bancarios.compania_seguros`.
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

## Frontera multi-tenant
Scope `cuenta_id` siempre. BD compartida con sivra/ialimp: cambios transversales de BD → `auditoria-central`.
