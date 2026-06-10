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

- **🔄 SIVRA pricing — fuente de mercado real (Booking+Trivago) + piloto Busto Reform (claude/tourist-apartments-auto-pricing) — 09/06/2026**
  El "precio automático" (motor `rates/snapshot` + `pricing/detect-opportunities` + experimentos) ya estaba en prod, pero la
  competencia salía de **scraping de Google (Serper) + IA**, dato aproximado. Mejora de la fuente:
  - **Conectores evaluados** (MCP de Claude, NO llamables desde el cron de Vercel): el mejor para **apartamentos** es
    **Booking** (`accommodations_search`) + **Trivago** (radius search) — precio real/noche, score, reseñas, barrio.
    DirectBooker/Wyndham/lastminute/TripAdvisor son de hoteles → no sirven de comparable de pisos.
  - **Estrategia 1 (coste 0, elegida para el piloto):** Claude actúa de recolector y vuelca comparables reales en
    `market_rates`. Cargados 14 comps reales para `scenario='prop_busto_reform'`.
  - **⚠️ CAPACIDAD IMPORTA — corregido:** Busto Reform es **1 dorm / 2 plazas** (`properties.maxGuests`). La 1ª carga se hizo
    a 4 plazas (pisos más grandes/caros, ~190€) → MAL. Recargado a **2 plazas**: Booking avg **168€** (p50 168, rango 140–220) ·
    Trivago **166€** → mercado real ≈ **166–168€/noche**. Capacidades: Busto Reform 2 · Duplex Center 4 · Luxury Busto 5 ·
    House Sevillana 12. **Cada piso necesita comps a SU ocupación** (pendiente para los otros 3). Matiz: el filtro por nº de
    dormitorios no está en los conectores; se usa la ocupación (nº huéspedes) como proxy.
  - **Nuevo endpoint `POST /api/mercado/ingest`** (protegido por `CRON_SECRET` si está): la "tubería" para meter comps reales
    sin Serper; upsert idempotente con la misma clave que el cron. Es también el hook para una futura API de pago (Estrategia 2).
  - **🎯 OBJETIVO DE NEGOCIO: esto se va a VENDER como producto (automatización de pricing para pisos turísticos) → "no puede
    fallar".** Implica que el estado actual (piloto, semi-manual) NO es todavía product-grade. Checklist para hacerlo vendible:
    1. **Autonomía real (Estrategia 2):** hoy la fuente de mercado depende de que Claude la recolecte en sesión (Estrategia 1).
       Un producto necesita una **API real** (Booking/Expedia partner o RapidAPI) llamada por el cron, sin humano en el bucle.
    2. **Comps por capacidad para los 4 pisos:** sólo Busto Reform (2 pax) está corregido. Faltan Duplex (4), Luxury (5),
       House (12). Comparar contra la ocupación correcta es **crítico** (un fallo aquí = precio mal puesto = cliente perdido).
    3. **Reconciliar la fórmula del motor:** 3 números no cuadran para Busto Reform → `OUR_PRICES.normal` 80€ vs base 175€ del
       `snapshot` vs mercado real ~168€. Hasta resolver esto, el "precio recomendado" no es de fiar.
    4. **Cerrar el bucle a Smoobu:** hoy `detect-opportunities` sólo manda email; un producto debe **escribir el precio** en el
       canal (Smoobu API) con tope de seguridad y aprobación opcional.
    5. **Robustez/observabilidad:** reintentos, alertas si una fuente falla, validación de outliers (precio absurdo no se aplica),
       y log/auditoría de cada cambio de precio (para defender el resultado ante el cliente).
  - **Hecho esta sesión:** evaluación de conectores, fuente real Booking+Trivago, endpoint `/api/mercado/ingest`, comps
    a-capacidad cargados para los **4 pisos** (Busto 2pax p50 168€ · Duplex 4pax 180€ · Luxury 5pax 228€ · House 12pax 650€),
    y **`GET /api/pricing/recommend`** = motor anclado al mercado (idea #1, sólo recomienda, no aplica). Doc de producto
    `apps/sivra/docs/pricing-automatico.md` con las 4 ideas. PR **#108** (draft, CI verde). Branch
    `claude/tourist-apartments-auto-pricing-jq0v4z`.
  - **Producto vendible (decisión de Alberto):** será un **SaaS de pago** para propietarios; el pricing es **100% adaptable por
    piso** y **sólo activo si contratan**. Implementado: tabla **`pricing_settings`** por piso (`enabled`, `target_pctl`,
    `floor/ceil_pctl`, `position_factor`, `quality_k`, `own_score`, `min/max_price`); los 4 pisos propios sembrados `enabled=true`.
    `/api/pricing/recommend` reescrito para leer estos ajustes + ajuste por calidad (reseñas) + hook de demanda.
  - **Modelo afinado (09/06):** **demanda** ✅ real desde ocupación propia (`rate_snapshots`, ±8%). **2ª fuente** Trivago en
    Duplex. **Calidad** ✅ `own_score` real (Busto 6,9 · Duplex 7,6 · Luxury 7,2 · House 8,4, dados por Alberto desde Booking)
    — están BAJO la mediana del mercado (8,7–8,8) → la calidad **baja** el precio. **Salida final verificada (mercado×demanda×
    calidad):** Busto **161€** · Duplex **175€** · Luxury **219€** · House **614€**.
  - **ÚNICO paso que NO ejecuto sin OK explícito de Alberto:** escribir precios reales en Smoobu (irreversible / de cara al
    exterior). Todo lo demás del modelo está aplicado y verificado.
  - **🧪 PILOTO EN MARCHA (09/06):** validación en **Busto Reform**. Baseline en `apps/sivra/docs/pricing-automatico.md §7`
    (ocupación 75%, reseñas 6,9, recomendado 161€). Recordatorio en Google Calendar de Alberto **16/06 10:00**.
    **Acción de Alberto:** desconectar **PriceLabs** en Busto Reform (✅ HECHO 09/06, confirmado por captura) + aplicar el test.
    **🚨 HALLAZGO:** PriceLabs tenía Busto Reform a **~70€/noche** (la mitad del mercado 168€). Salto a 161€ = +130% (brusco)
    → recomendado subir por escalones (test ~120€ una semana) o ir al objetivo si Alberto lo ve. apply_enabled=true ya puesto.
  - **✅ PUSH A SMOOBU CONSTRUIDO — `POST /api/pricing/apply`** (Alberto confirmó que sí se puede por la API de Smoobu).
    Escribe el precio recomendado en Smoobu (corre en Vercel, que alcanza Smoobu; el dev NO). Protecciones: `dryRun=true` por
    defecto, gate `apply_enabled` por piso, acotado a [suelo,techo] y `max_change_pct` (20%), auditoría `pricing_applied`,
    `CRON_SECRET`. ⚠️ **Verificar el formato del POST `/api/rates` de Smoobu en un preview antes de `dryRun=false` en prod.**
    El **16/06**: analizar piloto y decidir si se extiende a los otros 3 pisos.
  - **📌 PARA RETOMAR (próxima sesión):** doc maestro = `apps/sivra/docs/pricing-automatico.md`. Endpoints: `/api/mercado/ingest`,
    `/api/pricing/recommend`, `/api/pricing/apply`. **Estado que vive en BD Supabase `wswbehlcuxqxyinousql` (NO en git, pero
    persiste):** tablas `pricing_settings` (own_score Busto 6,9/Duplex 7,6/Luxury 7,2/House 8,4; `apply_enabled=true` sólo en
    Busto), `pricing_applied` (auditoría), comps en `market_rates` (scenario=`prop_*`). **Recordatorio Google Calendar 16/06 10:00.**
    Suelo de coste `min_price=90` + techo del test `max_price=110` en Busto Reform → motor recomienda **110€**.
    **⚠️ SMOOBU base ≠ precio huésped:** Smoobu fija un *precio base* y cada canal le suma margen (Booking +16%, Airbnb/Agoda/
    HomeToGo +15%, Expedia +20%); el host neta ~la base. Nuestros `market_rates` son precios de huésped → **el motor debe escribir
    base ≈ objetivo_huésped/(1+margen)** (PENDIENTE ajustar en `/api/pricing/apply`). `rate_snapshots.price_pricelabs` = base Smoobu.
    **✅ TEST EJECUTADO POR EL SISTEMA (10/06 06:36 UTC):** `/api/pricing/apply` (tras arreglar 4 bugs: min/max ignorados,
    sin conversión huésped→base con `channel_markup` 1.16, orden de topes, occ sin JOIN; + middleware no excluía las rutas
    de pricing — los crons `detect-opportunities`/`check-results` llevaban redirigidos a /login sin ejecutarse). Escribió en
    Smoobu: **10/06 65→110 · 23/06 102→110** (únicas fechas libres en 15 días). Verificación triple: re-dry-run "0 cambios",
    snapshot fresco = 110, auditoría en `pricing_applied`. **Primer precio puesto 100% por el sistema.**
    **✅ CONFIRMADO VISUALMENTE POR ALBERTO (10/06): "sale perfectamente" en su app Smoobu.** Bucle 100% cerrado:
    sistema calculó → escribió → verificado por API/BD → visto por el dueño. Prueba de concepto del producto COMPLETA.
    **⚠️ ANTES DE MERGEAR PR #108: definir `CRON_SECRET` en Vercel sivra** (no parece estar; en prod el middleware ya no
    bloquea apply). **Vigilar PriceLabs** (el 23 estaba a 102 → algo lo tocó; si revierte a 65, quitar listing del todo).
    El 16/06: "analiza el piloto de Busto Reform" (recordatorio en Calendar).

- **🔄 PR #107 — ialimp consume `nimVision` de core-ai en 6 rutas IA (feat/ialimp-ia-core-ai) — 09/06/2026**
  Las 6 rutas de visión de ialimp dejaban de pasar por el módulo y llamaban a la API NVIDIA inline. Ahora delegan en `nimVision`:
  - **`core-ai/nim.ts`**: `nimVision` 6º param `signal?` → `opts: {temperature?, signal?}` (aditivo). Permite afinar temperatura
    (OCR 0.05 / fotos 0.1; antes fija 0.1). Si `system` va vacío, NO envía mensaje de sistema (replica el patrón
    single-user-message de los agentes ialimp). Conserva `nimChat` (multi-turno) de main.
  - **Rutas migradas** (preservan modelo 90b-vision, temp y max_tokens exactos): `admin/ia/{analizar-foto(0.1/256),
    comparar-foto(0.1/400),analizar-botes(0.05/600)}`, `admin/escanear/process(0.05/800)`,
    `cron/procesar-documentos(0.05/800)`, `propietario/[token]/escanear(0.1/1200)`.
  - **sivra** `aiExtractInvoice`: adapta su llamada a `{ signal: AbortSignal.timeout(30_000) }` (forma opts). **ia-rest** `callAIVision`
    pasa 5 args → sin cambios. `upload-photo` solo llama a analizar/comparar server-to-server → no toca NVIDIA.
  - PR en draft; CI en cola. **Pendiente:** validar preview ialimp (escáner docs + análisis fotos) antes de mergear.

- **✅ PR #105 + #106 MERGEADOS A PRODUCCIÓN — 09/06/2026** (deploy ialimp `app.ialimp.es` READY, verificado en Vercel)
  - **#105** (unificar crypto + aiComplete): `core-identity/crypto.ts` (`genHex/genJti/sha256Hex`) + `core-ai/client.ts`
    (`aiComplete`). Adopción en ialimp (auth, propietario-auth, ai-client, enviar-acceso, 4 rutas hashPin), plataforma (auth),
    sivra (ai-client). Fix CI: `NimChatMessage` se importa de `./nim`, no `./types`. Fix audit: `enviar-acceso` usa `sha256Hex`.
  - **#106** (demo ia.rest): `GET /api/demo` + `POST /api/demo/seed` (protegido por env `DEMO_SEED_SECRET`) → crea "Bar Demo"
    (slug `demo`, código `DEMO`, PINs 1234/2222/3333/4444, 8 mesas, 17 productos, turno activo). Idempotente.
    **PENDIENTE de Alberto:** añadir env `DEMO_SEED_SECRET` en Vercel `ia-rest` y llamar al seed para testear.
  - **Auditoría exhaustiva del monorepo** (7 módulos + 4 apps): estado SANO. Pendientes menores: 2 rutas sivra con
    `crypto.subtle` inline (opcional), ia-rest financiero en plataforma (BD separada). **ia.rest mensajería** = tabla
    `mensajes_turno` (chat camarero↔cocina, privado/grupo, audio), totalmente implementada.
  - **Vanessa puede trabajar**: producción intacta y estable (los cambios solo mueven código, sin tocar BD/RLS/buckets).

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
    (+ `core-identity` con consumidores: crypto en ialimp/plataforma, identidad en plataforma). Patrón para añadir uno:
    `packages/core-x` (mirror de `core-ai`) + `workspace:*`/`file:` en las apps + `transpilePackages`. Si tiene dep npm, va en su `package.json`.
  - **Pendiente Fase 3 (opcional):** que ia-rest adopte `core-email` para su envío con Resend (hoy usa su
    propio cliente); `core-security` (rate-limit en BD, 1 consumidor).
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

- **ℹ️ NOTA OPERATIVA (sesión 09/06):** el **proxy git local da 503 en push** toda la sesión → los push se hacen
  vía **MCP github** (`push_files`/`create_pull_request`), que sí funciona (API de GitHub directa). El repo GitHub
  sigue llamándose `ia.rest` (redirige desde/hacia `central`); las llamadas MCP usan `repo: "ia.rest"`.

- **✅ MATRIZ DEFINITIVA: `ia.rest` bajado a `apps/ia-rest`, LIVE en producción — 08/06/2026 (PR #90)**
  - **Las 3 verticales viven bajo `apps/` y la raíz es la matriz.** `iarest.es` ya sirve desde
    `apps/ia-rest` (deploy de producción **READY**, Next 16.2.6, `✓ Compiled`, alias `iarest.es`/
    `www.iarest.es`). `sivra` y `ialimp` ya estaban en `apps/*`.
  - **Cómo se resolvió que `apps/ia-rest` consuma `packages/*` sin pnpm** (patrón para futuras
    verticales): `file:` deps (`@iarest/core-ai|core-fiscal` → `node_modules/@iarest/*` por symlink) +
    `next.config` con `outputFileTracingRoot`/`turbopack.root` = raíz del monorepo + se quitaron los
    `tsconfig paths` de `@iarest/*` (resuelven por node_modules). CI a `working-directory: apps/ia-rest`.
    Detalle en `MATRIZ.md`.
  - **Cutover sin downtime (orden CRÍTICO):** primero Root Directory del proyecto Vercel `ia-rest` →
    `apps/ia-rest`, **después** merge. (Al revés: la raíz-matriz genera un build vacío de ~1s que
    "tiene éxito" y **reemplazaría producción** → caída.) Red: Instant Rollback de Vercel.
  - Verificado antes de mergear: build/tsc/lint/qa **locales** en verde + **CI de GitHub** verde
    (ambos ya en `apps/ia-rest`).
  - 🟡 **Limpieza pendiente (sin prisa):** proyectos Vercel `ia-rest-docs` y `repo` (catch-all del
    root, `live:false`, solo dominios `*.vercel.app`) ahora fallan porque la raíz ya no es app →
    **borrarlos** o ignorarlos (no afectan a producción). + archivar/borrar repos viejos `sivra`/
    `ialimp`. + Fase 3 (adopción de `packages/core-*` por sivra/ialimp).

- **🏛️ MATRIZ definida + corrección: `ia.rest` es una VERTICAL, no la matriz — 08/06/2026**
  - Alberto corrige (acertadamente): en la casa de marcas, **`ia.rest` es una vertical más**, no la
    matriz. La raíz hace de matriz; las 3 verticales son hermanas bajo `apps/`. Manifiesto nuevo:
    **`MATRIZ.md`** (raíz) define estructura, verticales y regla.
  - **Hallazgo técnico (cambia el riesgo del movimiento de ia.rest):** `ia.rest` **ya consume
    `packages/*`** (`@iarest/core-ai`, `@iarest/core-fiscal` vía `tsconfig paths` +
    `transpilePackages`, rutas relativas a la raíz). Por eso **bajar `ia.rest` a `apps/ia-rest` NO es
    un `git mv` simple**: requiere montar **workspace** (pnpm/npm que abarque `apps/*`+`packages/*`)
