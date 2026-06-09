# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo en "Registro de sesiones" y actualiza "Estado actual" y
> "Pendientes" si algo cambió. Un hook `Stop` (`.claude/hooks/persist-memoria.sh`)
> commitea y empuja este archivo automáticamente.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 📌 Estado actual (lo más reciente arriba)

- **🔄 PR en curso — Gestión de limpiezas para Vanessa (feat/vanessa-gestion-limpiezas) — 09/06/2026**
  Vanessa (Sique Brilla, cliente piloto en producción) pidió 5 mejoras. Todo en rama `feat/vanessa-gestion-limpiezas`:
  - **✅ Migración aplicada en Supabase (`wswbehlcuxqxyinousql`):**
    - `cleaning_sessions.orden_manual` (int, nullable): orden manual por día; `NULL` = auto.
    - `cleaning_sessions.urgente_manual` (bool, default false): prioridad manual.
    - Índice `idx_cleaning_sessions_orden_manual` (por empresa/día).
    - Vista `sesiones_limpiadora` recreada añadiendo `notas`, `orden_manual`, `urgente_manual`.
  - **✅ Backend:**
    - `PATCH /api/admin/sesiones/[id]` extendido: `hora_checkout`/`hora_checkin_siguiente` (cast `::time`), `num_huespedes`, `orden_manual`, `urgente_manual`, recálculo de `ventana_minutos`/`alerta_ventana`, push «⏰ Cambio de horario» si cambia fecha/hora con limpiadora asignada.
    - `POST /api/admin/sesiones/reordenar` (NUEVO): ordena el día con `unnest WITH ORDINALITY`; `{reset:true}` → `orden_manual = NULL`.
    - Orden actualizado en `/api/admin/agenda` y `/api/l/sesiones`: `orden_manual` lidera, luego `urgente_manual` → `alerta_ventana` → `hora_checkin_siguiente` → hora.
  - **✅ `NuevaLimpiezaModal` modo edición:** prop `sesion?` → PATCH en vez de POST, salta pasos 1-2, precarga paso 3, muestra botón 🗑️ Eliminar solo si `origen=manual` + sin empezar. Nota label: "(la limpiadora las verá)".
  - **✅ UI admin:**
    - **Inicio (`DashboardClient.tsx`)**: botón ✏️ Editar por tarjeta, flechas ↑↓, atajo «→Mañana/←Hoy», 🔥 Urgente, badge sin asignar, filtro «Sin asignar», chips urgente/notas, aviso solapamiento, botón ↺ Orden automático, duplicar. Función `prioridad()` incluye `orden_manual`+`urgente_manual`.
    - **Agenda (`app/admin/agenda/page.tsx`)**: igual que Inicio — ✏️ editar, ↑↓, mover día, 🔥 urgente, ↺ orden auto, modal de edición montado, limpiezas pre-cargadas desde `/api/admin/clientes`.
  - **✅ App limpiadora (`/l/page.tsx`)**: muestra `notas` como bloque «📝 Indicaciones» destacado antes del checklist; badge 🔥 Urgente en la tarjeta y en el detalle.
  - **✅ Documentación:**
    - `docs/guia-limpiadoras.md` — guía WhatsApp de 7 pasos para limpiadoras (fotos, incidencias, chat).
    - `docs/mejoras-vanessa.md` — manual para Vanessa con todas las funciones nuevas.
    - `public/manual.html` — sección limpiadora ampliada (fotos/incidencias/chat) + sección nueva «Editar, mover, ordenar y priorizar limpiezas».
    - `CLAUDE.md` actualizado: `orden_manual`/`urgente_manual`, `/reordenar`, modo edición PATCH, push horario, orden nuevo.
  - **Gotcha recordada:** `hora_inicio` es TEXT → nunca `::time`. `hora_checkout`/`hora_checkin_siguiente` sí son TIME.
  - **✅ Push realizado a GitHub** — rama `feat/vanessa-gestion-limpiezas` actualizada (09/06/2026).
  - **Pendiente:** preview verde en Vercel + merge a `main`.

- **🔄 PR #105 — Unificar módulos crypto y aiComplete (feat/unificar-modulos-crypto-ai) — 09/06/2026**
  3 duplicaciones eliminadas entre `ialimp`, `sivra` y `plataforma`:
  - **`packages/core-identity/src/crypto.ts`** (NUEVO): `genHex`, `genJti`, `sha256Hex` — Web Crypto puro, sin deps, edge-safe.
    Adopción: `ialimp/lib/auth.ts`, `ialimp/lib/propietario-auth.ts`, `plataforma/lib/auth.ts`, 4 rutas de ialimp (hashPin).
  - **`packages/core-ai/src/client.ts`** (NUEVO): `aiComplete(promptOrMessages, options)` — lee `NVIDIA_API_KEY` del entorno.
    Adopción: `ialimp/lib/ai-client.ts` (3 líneas), `sivra/lib/ai-client.ts` (conserva `aiExtractInvoice` local).
  - **ia-rest mailer NO migrado** (intencional): ia-rest usa Resend SDK; `core-email` usa nodemailer. Transportes distintos.
  - PR en draft; CI en progreso al cierre de sesión.

- **✅ BD plataforma desmembrada (estructura real) — 09/06/2026**
  Sociedades reales en `wswbehlcuxqxyinousql` (tabla `sociedades`):
  - **Alberto Suárez Gutiérrez** (CIF vacío — editable desde `/dashboard` con ✎):
    - ia.rest (hostelería, app=ia-rest) — sin clientes aún, muestra "📊 BD separada"
    - Casa Sevillana (inmobiliario, app=sivra)
    - Busto Reform, Duplex Center, Luxury Busto (inmobiliario, app=sivra, con sus `ref_ext` de propiedades Smoobu)
  - **Sique Brilla SL** (B22992523, NIF real de `empresas`):
    - Sique Brilla (limpieza, app=ialimp, `ref_ext=05edacff-ea49-42fe-8997-f9369613a845`)
  Eliminada la sociedad fake "Tu Empresa SL" (CIF B12345678). Restructurado por SQL directo vía Supabase MCP.
  **Próximo paso:** cuando Vanessa empiece a operar (reactivar `documentos_contables.activo=true`), el financiero de Sique Brilla aparecerá automáticamente en el dashboard. Alberto puede ajustar el CIF de su sociedad personal desde la UI.

- **✅ HITO 5 — Plataforma CRUD completo (edición + registro de cuenta) — 09/06/2026**
  (PR #104 mergeado; producción `https://plataforma-ten-flame.vercel.app`)
  - `PATCH /api/sociedades/[id]` y `PATCH /api/negocios/[id]` — edición scoped por `cuenta_id`.
  - `POST /api/auth/register` + `/register` — alta de cuenta por UI con auto-login (`/register` público en middleware).
  - `EditarSociedadBtn`/`EditarNegocioBtn` — modales ✎ con valores precargados.
  - **Plataforma COMPLETA**: registro · login · CRUD sociedad/negocio · financiero real (ialimp+sivra).
  - **PENDIENTE:** volcar Sique Brilla (cuenta real) + ia-rest financiero (sin clientes aún).

- **✅ HITO 4 — Gestión de sociedades y negocios por UI en plataforma — 09/06/2026**
  (PR #103 mergeado)
  - `POST/DELETE /api/sociedades` y `POST/DELETE /api/negocios` — crear/eliminar scoped por `cuenta_id`.
  - `GestionSociedad.tsx` — modales ＋ Sociedad / ＋ Negocio / ✕, con `router.refresh()`.

- **✅ HITO 3 — Dashboard financiero en plataforma (ialimp + sivra) — 09/06/2026**
  (PR #102 mergeado; preview producción `https://plataforma-ten-flame.vercel.app`)
  - **`apps/plataforma/lib/financiero.ts`** nuevo: `getResumenNegocio(app, refExt, anio)` dispatcher.
    - `ialimp` → `getResumenIalimp(empresaId, anio)`: lee `v_contab_pyg` WHERE `empresa_id` + `anio`.
    - `sivra` → `getResumenSivra(anio, propertyId?)`: suma `incomes` + `expenses` por año, filtrado por piso si se pasa `refExt`.
    - `ia-rest` → `getResumenIaRest()`: devuelve `{disponible:false, nota:'BD separada'}` (BD separada).
  - **`apps/plataforma/app/dashboard/page.tsx`** actualizado: KPI bar consolidada (ingresos + resultado YTD)
    + tarjetas por negocio con Ingresos/Gastos/Resultado reales.
  - **Todos los builds verdes**: ia-rest ✅ · ialimp ✅ · sivra ✅ · plataforma ✅.
  - **PENDIENTE:** conectar ia-rest BD (`efncqyvhniaxsirhdxaa`) para mostrar datos reales (hoy: "📊 BD separada").

- **✅ HITO 2 CIMIENTO — `Cuenta → Sociedad → Negocio` + `apps/plataforma` shell — 09/06/2026**
  (PR #101 mergeado; Vercel `https://plataforma-ten-flame.vercel.app`)
  - **`packages/core-identity`** extendido: `Cuenta`, `Sociedad`, `Negocio`, `Sector`, `CuentaSession`.
  - **BD compartida (`wswbehlcuxqxyinousql`):** tablas `cuentas/sociedades/negocios` aplicadas.
    Cuenta de Alberto cargada con 3 negocios: ia.rest (hosteleria), Sique Brilla (limpieza), Casa Sevillana (inmobiliario).
  - **`apps/plataforma`** en producción: login + dashboard consolidado por sociedad/negocio + links a verticales.
    Auth: `plataforma_session` + `session_jti`. Stack: Next.js 15 · jose/bcryptjs · Prisma → BD compartida.
  - **HITO 3 siguiente:** resumen financiero real en tarjetas (federar `module-contabilidad` cruzando las 2 BD).

- **✅ HITO 1 CONTABILIDAD — `packages/module-contabilidad` creado y adoptado en las 3 verticales — 09/06/2026**
  (PR #100, rama `feat/module-contabilidad`, rebased sobre main con pnpm `workspace:*`)
  - `packages/module-contabilidad`: módulo TS puro, sin deps npm, DB-agnostic. Exports: tipos PORT
    (`Apunte`, `IVATrimestral`, `ResumenTesoreria`, `RentabilidadEntidad`, `PlantillaRecurrente`) +
    funciones puras (`calcularIVA`, `calcularPyG`, `calcularTesoreria`, `calcularRentabilidad`,
    `calcularCuotaIva`, `calcularTotal`, `round2`).
  - **ialimp** — `calcularCuotaIva`/`calcularTotal` en `apuntes/route.ts` e `ingresos/route.ts`.
  - **sivra** — `round2` en `facturacion/route.ts` (reemplaza `Math.round(x*100)/100` × 4 usos).
  - **ia-rest** — `round2` en `cron/cobro-inactividad/route.ts` (totalEur + comisión).
  - Todas las apps usan `workspace:*` + `transpilePackages` + `outputFileTracingRoot`.
  - Previews Vercel: **ialimp ✅ · sivra ✅ · ia-rest ✅** (tras rebase sobre main).

- **🧭 DECISIÓN ESTRATÉGICA: plataforma modular unificada — 09/06/2026 (ver `docs/PLAN-plataforma-modular.md`)**
  - **Norte del proyecto:** unificar los **módulos transversales** (contabilidad, ventas, almacén,
    RRHH, marketing, SEO, web, mensajería, IA) en UNA implementación que se **enciende** por vertical;
    las **verticales se quedan como especialidades** (cada una su peculiaridad). "Una mejora vale para todas".
  - **3 verticales:** **Hostelería** (ia.rest: restaurantes+catering/eventos+espacios) · **Limpieza/
    Mantenimiento** (ialimp, lado operativo + servicio) · **Inmobiliario/Propietarios** (= `sivra` +
    portal-propietario de `ialimp` **UNIFICADOS**; la limpieza es un servicio contratable). sivra+ialimp
    ya comparten BD; ia.rest tiene otra.
  - **Principio:** "motor común + enchufe por vertical" (ej. Contabilidad = motor IVA/PyG/tesorería común
    + de dónde salen ingresos/gastos según el sector). **Fase 1 = Contabilidad** (la de ialimp es la más
    madura → base del módulo compartido). Fase 2 = unificar Inmobiliario. Fase 3+ = resto de módulos.
  - **Añadidos al plan:** cuenta/identidad ÚNICA (`core-identity`, su 1er uso) · "marketplace" para
    encender servicios · datos-compartidos-vs-aislados (mismo motor, 2 BD). **Esquema:** `docs/esquema-
    casa-marcas.svg`. **Pendiente:** nombre de la matriz (Encaje) → rename del scope. **Metodología:
    esquema + preview verde antes de cada código; Vanessa intacta.**
  - **👉 DESARROLLO (lo programa Sonnet):** el plan maestro + **handoff/roadmap está en
    `docs/PLAN-plataforma-modular.md` §9** (patrón, guardarraíles, hitos, definición de hecho). **Empezar
    por HITO 1 = módulo Contabilidad compartido** (`packages/module-contabilidad`, agnóstico de BD,
    adoptar vertical a vertical preservando comportamiento, ialimp la última). Leerlo ENTERO antes de tocar código.
  - **🔑 EL CLIENTE REAL (§3.bis del plan):** un **DUEÑO con VARIOS negocios de sectores distintos**
    ("todo dueño accede a todo lo suyo"). Ej.: Joaquín Jaén = restaurante+catering+camiones+tiendas;
    otro = fontanería+taller. → jerarquía **Cuenta→Negocios→Sector**; **sectores ENCHUFABLES** (no solo
    3: transporte, fontanería, taller, retail…); `core-identity` es CENTRAL. Refuerza unificar módulos
    (contabilidad/RRHH/ventas/almacén = 80% igual en cualquier sector). **Nueva Fase 0.5** = cimiento
    Cuenta→Negocios + identidad única, antes de los módulos.

- **✅ pnpm WORKSPACES + FASE 3 REANUDADA (core-push, core-storage, core-email) — TODO EN PRODUCCIÓN — 09/06/2026**
  - **Migración a pnpm workspaces (PR #94, en prod las 3 verticales).** Sustituye los `file:` deps por
    `workspace:*`. Esto **desbloquea** núcleos compartidos con **dependencia npm propia** (lo que `file:`
    deps no resolvía en Vercel). Config: `pnpm-workspace.yaml`, `.npmrc` (`strict-peer-dependencies=false`
    + `auto-install-peers` + reintentos de fetch), root `package.json` con `packageManager: pnpm@10.33.0`
    + `pnpm.onlyBuiltDependencies` (pnpm 10 no corre postinstall por defecto). CI (ci/qa.yml) migrado a pnpm.
  - 🔴 **CAUSA RAÍZ del fallo de build (resuelta) — LECCIÓN CLAVE:** Vercel **NO usa** nuestro
    `packageManager`; autodetecta otro pnpm que considera el `pnpm-lock.yaml` *"not compatible"* y
    **re-resuelve todo el workspace** contra el registro en vivo → tormenta de metadatos → bug de undici
    `ERR_INVALID_THIS` (`Value of "this" must be of type URLSearchParams`) → install KO. **NO era la
    versión de Node** (pasaba en 20 y 24). **FIX (en los 3 `apps/*/vercel.json`):** `installCommand` =
    **`npx --yes pnpm@10.33.0 install --no-frozen-lockfile`** → usa SIEMPRE 10.33, honra el lockfile,
    sin re-resolución → sin fetches → sin `ERR_INVALID_THIS`, determinista con store fría o caliente.
  - **Fase 3 reanudada — 2 núcleos nuevos extraídos y EN PRODUCCIÓN:**
    - **`@iarest/core-push` (PR #95)** — envoltura pura sobre `web-push` (`sendWebPush` → `{ok,gone,...}`).
      **1er núcleo con dep npm propia** (la prueba de que pnpm lo desbloquea). Consumido por **ia-rest**
      (`/api/push/send`) e **ialimp** (`lib/push.ts`). Pendiente menor: migrar `ia-rest/lib/qr-notify.ts`.
    - **`@iarest/core-storage` (PR #96)** — firmado de signed URLs de Supabase Storage vía REST (puro,
      sin `supabase-js`): `storageObjectPath`/`signStorageObject`/`publicStorageUrl`. Consumido por
      **ialimp** (`lib/cleaning-photos.ts`, exports preservados) y **sivra** (`/api/limpiadoras/photo`).
    - **`@iarest/core-email` (PR #97)** — transporter de `nodemailer` desde env (dep npm propia):
      `createMailTransporter()` (multi-proveedor Resend→SMTP→Gmail) + `gmailTransporter()` (Gmail
      explícito) + `MAIL_TIMEOUTS`. **ialimp** (`lib/mailer.ts` `getTransporter`/`MAIL_FROM`, idéntico)
      y **sivra** (4 rutas: resumen-semanal, alerta-ventana, huespedes-repetidos, detect-opportunities,
      usaban Gmail inline → `gmailTransporter()`; el stub auto-reply no se tocó). sivra solo tiene
      `GMAIL_*` → mismo proveedor, sin riesgo de cambio.
    - **`core-push` cerrado en ia-rest (PR #98):** `lib/qr-notify.ts` (último `web-push` inline) migrado a
      `sendWebPush`; se eliminó la dep `web-push`/`@types/web-push` de ia-rest (el núcleo trae su copia).
  - **Núcleos compartidos hoy:** `core-ai`, `core-fiscal`, `core-push`, `core-storage`, `core-email`
    (+ `core-identity` sin consumidores). Patrón para añadir uno: `packages/core-x` (mirror de `core-ai`) + `workspace:*` en
    las apps + `transpilePackages`. Si tiene dep npm, va en su `package.json` (pnpm la symlinkea).
  - **Pendiente Fase 3 (opcional):** que ia-rest adopte `core-email` para su envío con Resend (hoy usa su
    propio cliente); `core-security` (rate-limit en BD, 1 consumidor); adoptar `core-identity`.
  - **Limpieza HECHA por Alberto (09/06):** auto-delete head branches ✅ activado · Vercel `ia-rest-app`
    e `ialimp-fuentes` ✅ borrados · repos viejos `sivra`/`ialimp` ✅ ARCHIVADOS (read-only). Quedan por
    borrar 10 ramas mergeadas (comando `git push origin --delete …` desde su terminal).
  - **🔧 Fix derivado del archivado (PR #99):** archivar el repo `ialimp` detuvo su Action "Deploy landing"
    = el ÚNICO que desplegaba `ialimp.es` (el workflow del monorepo estaba en `apps/ialimp/.github/`, que
    GitHub NO ejecuta — solo corre `.github/workflows/` de la RAÍZ). Reubicado a la raíz con rutas a
    `apps/ialimp/landing/ialimp-es`. **PENDIENTE de Alberto:** añadir el secreto **`VERCEL_TOKEN`** al repo
    `ia.rest` (Settings → Secrets → Actions) para que la landing vuelva a auto-desplegar; probar con "Run
    workflow". `ialimp.es` sigue ONLINE (lo ya publicado no se cayó). Proyecto Vercel `ialimp-landing` intacto.
  - **Pendiente clave:** **Marca de la matriz** → elegir nombre (Claude Design recomienda **"Encaje"**;
    dominios `encaje.ai`/`encaje.app` libres, `.com`/`.es` ocupados) → renombrar scope `@iarest/* → @<marca>/*`
    (rename mecánico, listo para ejecutar en cuanto se decida).
