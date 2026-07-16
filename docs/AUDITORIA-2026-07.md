# Auditoría exhaustiva — 2026-07-12

> Pasada **exhaustiva multi-agente** (a petición de Alberto: "la auditoría más completa posible
> de todo: flujos, agentes, APIs, IA e infra"). Método: gate baseline → typecheck de las 7 apps →
> fan-out de 15 dominios (7 verticales + 5 capas transversales + 2 de infra) con **81 subagentes** y
> **verificación adversarial de cada hallazgo** antes de anotarlo (para no repetir los falsos positivos
> de la pasada del 01/07). Infra Supabase/Vercel consultada por MCP en solo lectura.
> **La pasada anterior (01/07) se conserva íntegra más abajo.**

## Resumen ejecutivo (12/07)

**Salud base sólida:** `pnpm install --frozen-lockfile` limpio, radiografía de estructura al día,
guardianes **22/22**, y las **7 apps typechequean con 0 errores TS** (incluidas las 5 con
`ignoreBuildErrors:true` en build — el typecheck sí las valida). Migraciones y edge functions sanas
en ambos proyectos Supabase.

**66 hallazgos confirmados** (de 67 brutos; el verificador solo descartó 1): **2 críticos, 25 medios,
39 bajos**. El patrón dominante es de **autorización de crons/webhooks** (fail-open cuando falta un
secreto, o crons que escriben datos sin ninguna guarda) y **formato de dinero** (varias pantallas y el
PDF de nómina en estilo dólar). Dos críticos: (1) un **IDOR cross-empresa** en ialimp que filtra PII y
tarifa de limpiadoras de otra empresa, y (2) las **77 funciones `SECURITY DEFINER` ejecutables por
`anon`** ya conocidas de julio, reconfirmadas hoy en AMBOS proyectos. Dos hallazgos de **dinero real**
que merecen prioridad: el webhook de Stripe de ialimp **nunca actualiza el plan** (metadata en el sitio
equivocado) y el cron de descuentos puede **duplicar el crédito** por falta de idempotencia. En IA, el
wrapper de plataforma **salta la cadena de fallback** y depende solo de NVIDIA NIM — justo el modo de
fallo que dejó "IA no disponible" en el pasado.

**Acciones de esta pasada:** los **auto-fix de bajo riesgo** (formato de dinero, guardas de cron
fail-open, docs desalineadas) se aplican en la rama `claude/program-audit-plan-g1tlaf`; los de gran
radio (RLS, REVOKE de funciones `anon`, huella VeriFactu, migración de PINs) van al **checklist manual
de Alberto** al final, con orden seguro y rollback. **Nada de infra se ejecuta**: solo se documenta.

---

## 🔴 Críticos (12/07)

### C1 · IDOR cross-empresa: informe de limpiadora sin scope `empresa_id` — fuga de PII (ialimp)
- **Ubicación:** `apps/ialimp/app/api/admin/informe/route.ts:37-48`
- **Evidencia:** `GET` no llama a `requireEmpresaId()`; consulta `limpiadoras WHERE id = ${lid}` y
  `cleaning_sessions WHERE limpiadora_id = ${lid}` tomando `lid` del query string SIN filtrar por
  `empresa_id`. El middleware solo exige una sesión `ialimp_session` de *cualquier* empresa (la ruta no
  está en `MODULO_MAP`). Un usuario de la empresa B pasa el UUID de una limpiadora de la empresa A y
  recibe su nombre, propiedades limpiadas, horarios, nº de fotos y **tarifa/importe de pago**. Frontera
  RGPD crítica (cliente vivo Sique Brilla).
- **Acción:** añadir `const empresa_id = await requireEmpresaId()` y filtrar `AND empresa_id = ${empresa_id}::uuid`
  en las tres queries. Auto-fix de bajo riesgo, pero verificar que la página que consume envía la cookie.

### C2 · 77 funciones `SECURITY DEFINER` ejecutables por `anon` (y `authenticated`) — infra
- **Ubicación:** `efncqyvhniaxsirhdxaa: public` (77) y `wswbehlcuxqxyinousql: iarest` (77) — mismas firmas.
- **Evidencia:** `get_advisors(security)` reporta 77× `anon_security_definer_function_executable` +
  77× `authenticated` en AMBOS proyectos. Ejemplos: `activar_plan`, `calcular_precio_transferencia`,
  `calcular_margen_evento`, `aplicar_menu_a_evento`, `buscar_mesa_por_voz`. Al ser `SECURITY DEFINER`
  corren con privilegios del owner (bypass RLS) e invocables por `anon` vía PostgREST RPC.
- **Acción (manual, gran radio):** revisar función por función y `REVOKE EXECUTE ... FROM anon`
  (y `authenticated` si no procede) en las internas; las que deban ser públicas deben validar tenant
  internamente. **Verificar reachability real por PostgREST anon antes de revocar en masa.** → ver checklist.

---

## 🟡 Medios (12/07)

**ia-rest**
- **M1 · Cron `cobro-descuento` sin idempotencia → doble crédito Stripe** (`src/app/api/cron/cobro-descuento/route.ts:74`).
  `createBalanceTransaction(customerId, {...})` se llama sin `idempotencyKey` ni marca `ya_aplicado_mes`;
  el hermano `cobro-inactividad:73` sí usa `idempotencyKey`. Doble disparo = doble descuento = pérdida de
  ingreso SaaS. **Fix bajo:** pasar `{ idempotencyKey: descuento-${local_id}-${mesStr} }`.
- **M2 · Crons de dinero fail-OPEN si falta `CRON_SECRET`** (`cobro-descuento:17`, `cobro-inactividad:111`,
  `cobros-eventos:16`): `if (!secret) return true`. Sin la env, cualquiera dispara cobros de tarjeta /
  créditos. `operador/financiero:13` sí hace `return false`. **Fix bajo:** fail-secure.
- **M3 · Webhook TheFork sin validar firma si el restaurante no tiene `thefork_secret`**
  (`src/app/api/thefork/webhook/route.ts:75`): `if (restaurante.thefork_secret) {...}` — si es NULL no
  valida nada; con el `CustomerId` (controlado por el atacante) se abren mesas e inyectan alergias. **Fix
  bajo:** 401 cuando falte el secreto.
- **M4 · Login de asesoría: PIN en claro + sin rate-limit** (`src/app/api/asesoria/login/route.ts:30`):
  `.eq('pin', pin.trim())` compara el PIN sin hash; la sesión da acceso a datos fiscales (modelo 303).
  **Fix alto:** hashear (bcryptjs ya en deps) + throttling; requiere migrar los PINs.
- **M5 · Doble `next.config` divergente** (`apps/ia-rest/next.config.js` vs `next.config.ts:22-44`): el
  `.js` no define las cabeceras de seguridad (`X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`). **Fix bajo:** borrar `next.config.js`.
- **M6 · TOCTOU en cierre de factura VeriFactu** (`src/app/api/factura/cerrar/route.ts:42-46,103`;
  idem `pago-parcial:53`): el chequeo de idempotencia va al inicio pero la comanda no se marca `cerrada`
  hasta el paso 9 → dos POST concurrentes consumen dos números fiscales y crean dos facturas para una
  venta. **Fix alto:** verificar `UNIQUE(comanda_id)` en `facturas_verifactu` y serialización de
  `siguiente_numero_factura` (viven en la BD viva, no versionadas). → checklist.

**plataforma**
- **M7 · Cron `sivra/updates/sync` SIN ninguna auth** (`apps/plataforma/app/api/sivra/updates/sync/route.ts:7,16`):
  registrado como cron (`0 5 * * *`), escribe en `incomes` y llama a Smoobu, sin `CRON_SECRET`/sesión/`getAdmin`.
  Es el único cron del bloque sin `isCronAuthorized`. **Fix bajo:** añadir `isCronAuthorized(req)`.
- **M8 · Importes en estilo dólar en el chat/Telegram del contable** (`apps/plataforma/lib/contable/documentos-tipos.ts:56,58,77`):
  `${f.total.toFixed(2)}€` → "1234.50€". El propio repo lo prohíbe en `respuestas-directas.ts:16`.
  **Fix bajo:** `toLocaleString('es-ES', {minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:'always'})+'€'`.

**ialimp**
- **M9 · `pms/sync` público y sin `CRON_SECRET`** (`app/api/pms/sync/route.ts:146`): está en `PUBLIC_PATHS`
  y no valida Bearer; cualquiera dispara un sync global y la respuesta **filtra nombres de propiedad de
  todas las empresas**. **Fix bajo:** exigir Bearer / sacarlo de `PUBLIC_PATHS` y no devolver nombres cross-tenant.
- **M10 · `empresa_id` nunca llega al webhook de Stripe → el plan nunca se actualiza**
  (`app/api/stripe/checkout/route.ts:31`): la metadata va en la `checkout.session`, pero el webhook lee
  `sub.metadata.empresa_id` (siempre `undefined`). Además `PRICES` usa IDs placeholder. **Fix bajo:**
  mover a `subscription_data.metadata` o manejar `checkout.session.completed`; verificar price IDs reales.
- **M11 · Cron de informes mensuales roto (sub-fetch 401)** (`app/api/admin/informes/cron/route.ts:26-33`):
  hace `fetch('/api/admin/informes/generar', headers:{x-empresa-id})` con `.catch(()=>{})`; `generar` usa
  `requireEmpresaId()` (ignora el header) y el fetch no manda cookie ni Bearer → 401 tragado en silencio.
  Los informes nunca se generan/envían. **Fix alto:** invocar la lógica directamente pasando `empresa_id`.
- **M12 · Columna inexistente `token_acceso` en escaneo del propietario** (`app/api/propietario/[token]/escanear/route.ts:24`):
  usa `c.token_acceso` cuando el resto del portal usa `access_token` (24 usos) → escaneo roto (500).
  **Fix bajo:** cambiar a `c.access_token` (confirmar esquema).

**sivra** (app propia)
- **M13 · `updates/sync` escribe/BORRA `incomes` sin auth y excluido del middleware**
  (`app/api/updates/sync/route.ts:32,35`). **Fix bajo:** `isCronAuthorized(req)`.
- **M14 · Cron `mensajes/auto-reply` sin auth** (`app/api/mensajes/auto-reply/route.ts:104`, `GET()` sin `req`);
  el envío de email es stub hoy, pero el nodemailer queda listo. **Fix bajo:** `GET(req)` + `isCronAuthorized`.
- **M15 · Cron `limpiadoras/auto-sessions` sin auth** (`app/api/limpiadoras/auto-sessions/route.ts:16`),
  crea `cleaning_sessions` y llama a Smoobu. **Fix bajo:** `isCronAuthorized(req)`.

**rrhh**
- **M16 · Nóminas en estilo dólar** (`apps/rrhh/lib/nomina-pdf.tsx:16`, `NominasPanel.tsx:28`,
  `ContratoForm.tsx:118`): `n.toFixed(2)+' €'`. Es el **PDF oficial** que ve el empleado. **Fix bajo:**
  replicar `eur()` es-ES.
- **M17 · Policy de lectura del bucket `rrhh-documentos` abierta a `anon`**
  (`apps/rrhh/prisma/migrations/0008_storage_rrhh_documentos_read_policy.sql:4`): `USING (bucket_id = 'rrhh-documentos')`
  sin tenant ni rol; `lib/storage.ts:37` firma con la anon key → con la anon key + un path se mintan URLs
  de PII (nóminas/DNI). **Fix alto:** restringir a `service_role` y firmar server-side. → checklist.

**cadena-ia / packages / infra**
- **M18 · El wrapper `aiComplete` de plataforma salta la cadena de fallback** (`apps/plataforma/lib/ai-client.ts:22-32`):
  llama directo a `nimChat` (solo NVIDIA NIM), no al `aiComplete` de `@central/core-ai`. 9 consumidores
  (concursos, agente-movimientos, correo, pre-renta, seo-refresh, finanzas…) quedan sin respaldo
  Groq→Gemini→Kimi pese a tener las keys. Es exactamente el modo de fallo que vigila `buscador-ia`.
  **Fix bajo-medio:** delegar en la cadena de `@central/core-ai`.
- **M19 · Endpoint de visión IA sin auth** (`apps/ia-rest/src/app/api/onboarding/extract-carta/route.ts:6,33`):
  `callAIVision(..., 6000)` sin sesión/token; los hermanos `asn/ocr` y `asn/factura` sí validan `asn_token`.
  DoS de coste contra la clave NVIDIA. **Fix bajo:** token de onboarding de un solo uso / rate-limit.
- **M20 · `renderInvoiceHtml` lanza `FiscalIntegrityError` para importes ≥ 1000**
  (`packages/core-receipts/src/integrity.ts:11-13` vs `renderers/html.ts` + assert `:139`):
  `formatFiscalNumber` no agrupa miles pero el render usa `eur()` con punto de miles → el verbatim no
  cuadra → **la factura no se emite**. Consumidor vivo: facturas de propietario de ialimp (superan 1000€).
  El test lo enmascara con `total:999999`. **Fix bajo + test ≥1000.**
- **M21 · `calcularHuella` etiqueta `CuotaTotal` con `importe_total` (no `cuota_iva`) y omite campos**
  (`packages/core-fiscal/src/es/aeat.ts:46`): incoherente con el XML LROE de ia-rest. Al activar el envío
  a AEAT (~2027) la huella no cuadrará y rompería el encadenamiento. El snapshot congela el valor erróneo.
  **Fix alto (ventana/migración).** → checklist.
- **M22 · `xlsx@0.18.5` parsea (`XLSX.read`) un fichero subido por el usuario — CVE explotable**
  (`apps/plataforma/lib/extracto-xls.ts:62` desde `app/api/banca/importar/route.ts:53`): prototype-pollution
  (CVE-2023-30533) / ReDoS (CVE-2024-22363) en la ruta de parseo de extractos bancarios; los `pnpm.overrides`
  no cubren `xlsx`. El export de ialimp (`xlsx.write`) NO es explotable. **Fix alto:** migrar el camino de
  LECTURA a la build parcheada de SheetJS o a `exceljs`.
- **M23 · `ESTRUCTURA.md` cita cifras obsoletas de su propia radiografía** (`docs/ESTRUCTURA.md:9,19`):
  "5 verticales · 26 packages · 951 APIs" vs la radiografía real "7 apps · 34 packages · 1056 rutas".
  **Fix bajo (texto).**
- **M24 · 47 vistas `SECURITY DEFINER` (ERROR) en el proyecto ia-rest standalone** (`efncqyvhniaxsirhdxaa`):
  el hardening que bajó el shared a 1 vista NO se portó. **Fix alto:** recrear con `security_invoker=on`. → checklist.
- **M25 · Políticas RLS `always true` incluyendo `bridge_tokens`** (`iarest` 16 + `efncqyvhniaxsirhdxaa public` 23):
  `bridge_tokens`, `impresoras`, `print_jobs`, `documentos_escaneados`… con `USING(true)` = sin aislamiento.
  **Fix alto:** condiciones por `restaurante_id`; prioridad `bridge_tokens` y `documentos_escaneados`. → checklist.

---

## 🟢 Bajos (12/07) — 39 hallazgos

**Formato de dinero (regla global) — auto-fix:** ia-rest `materiales/informe:51,74,76` y `cierre-diario:244`;
sivra `dashboard/page.tsx:13`; transporte `lib/format.ts:1-2`; alquiler `lib/format.ts:1-5`; ticket térmico
`packages/core-receipts/src/renderers/thermal.ts:199,237-240`. Todos: replicar `eur()` es-ES (€ detrás,
miles con punto, 2 decimales).

**Autorización / crons fail-open — mayoría auto-fix bajo:**
- `isCronAuthorized`/bypass abiertos si falta `CRON_SECRET`: plataforma `lib/cron-auth.ts:4-7`, sivra
  `lib/cron-auth.ts:31-35` → fallar cerrado en producción (verificar env en Vercel antes).
- ialimp: endpoints DDL de migración invocables por cualquier autenticado (`admin/migrate-chat-destinatario/route.ts:8`)
  → exigir `isSuperadmin()`; `CRON_SECRET` aceptado por `?secret=` (`cron/impagos/route.ts:36`) → solo header.
- sivra: `inventario` PATCH sin guard (`limpiadoras/inventario/route.ts:35`); middleware valida solo
  *presencia* del token de limpiadora, no validez (`middleware.ts:38-45` + notas/alertas/photo/upload-photo)
  → `isLimpiadoraAuthorized()`; `hashPin` SHA-256 sin sal de 4 dígitos (`limpiadoras/auth/route.ts:116`).
- rrhh: login de empleado `/e` sin rate-limit (`app/api/e/login/route.ts:13-14`).
- ia-rest: 5 `createClient` service-role directos en rutas API que saltan RLS (`asn/route.ts:20`,
  `asn/factura:15`, `asn/ocr:15`, `asesoria/clientes:9`, `asesoria/login:8`) → migrar al helper central.
- ia-rest: `NEXT_PUBLIC_CRON_SECRET || 'dev'` en cliente (`components/BlogSEOTab.tsx:41`) → quitar el
  header `authorization` vestigial del fetch (la sesión ya autentica).

**Idempotencia — bajo:** plataforma gastos fijos check-then-insert sin índice único (`lib/sivra/gastos-fijos.ts:71,102`);
ialimp `alertas-pendientes` sin dedup (`route.ts:56-70`) y webhook Stripe sin dedup por `event.id` (`stripe/webhook:24`).

**Webhooks fail-open — verificar env, no auto-fix ciego:** plataforma Smoobu acepta todo si falta
`SMOOBU_WEBHOOK_SECRET` (`sivra/mensajes/webhook/route.ts:46-48`).

**VeriFactu (pre-AEAT) — bajo:** XML LROE usa la fecha de la factura actual en `RegistroAnterior` (`src/lib/verifactu.ts:169`).

**RGPD/logs — bajo:** sivra loguea email + cuerpo de mensajes de huésped (`mensajes/auto-reply/route.ts:15`).

**Negocio — verificar con Alberto:** alquiler `estado` como string libre sin validar la máquina de estados
(`alquileres/route.ts:16,64`) y sin comprobar disponibilidad de stock (sobre-reserva, `:37-56`); transporte
mapa del operador `take:500` antes de deduplicar puede omitir vehículos (`lib/transporte-repo.ts:189-211`);
transporte ingesta GPS con secreto global único (`lib/ingest-auth.ts`).

**IA — bajo:** `SUPLENTES_DEFAULT` del Director es lista de slugs OpenRouter hardcodeada que no se auto-cura
(`apps/plataforma/lib/ia-director.ts:24`) → que `buscador-ia` vigile también estos 2 slugs.

**Docs desalineadas — auto-fix directo:** `RUTINAS-PROGRAMADAS.md:104,113,124` (numeración rota);
MATRIZ.md:24 y ESTRUCTURA.md:21 (23 vs 20 vs **24** modules); CLAUDE.md:11 (sivra "intranet" vs doble-hogar);
ESTRUCTURA.md:34 (falta transporte/alquiler en BD compartida), `:204` (`module-inventario` inexistente),
`:23,103` ("X de 19 module-*" cuando hay 24); rrhh `CLAUDE.md` dice `requireSecret()` pero `lib/operador.ts:4-8` no lo usa.

**Infra (solo lectura, sin acción urgente):** RLS-on-sin-policy creció a 196 en `public` shared (rrhh 9,
iarest 32; ia-rest standalone public 29); 113 funciones `search_path` mutable en el standalone (shared 0);
extensiones en `public` y bucket `logos` listable; migraciones/edge functions **sanas en ambos proyectos**;
Vercel: `ialimp-landing` último deploy ~28 días (READY, sin urgencia); alquiler/transporte/rrhh **sin
proyecto Vercel visible en el equipo** (¿otra cuenta? rrhh usa `central-rrhh.vercel.app`) → verificar inventario.

---

## ✅ Checklist manual de Alberto (infra / gran radio) — 12/07

> **Nada de esto se ha ejecutado.** Solo lectura por MCP. Orden seguro + rollback. Empezar por lo de
> dinero/PII, que es lo que más duele.

1. **[C1 dinero/PII — YA en rama]** Verificar en la app que la página que consume `admin/informe` manda la
   cookie tras el fix de scope. Si algo se rompe, rollback = revertir el commit del filtro.
2. **[C2 · 77 funciones `anon`]** En cada proyecto: listar las `SECURITY DEFINER` con `EXECUTE` a `anon`,
   comprobar si son alcanzables por PostgREST, y `REVOKE EXECUTE ... FROM anon` (y `authenticated`) en las
   internas (`activar_plan`, `calcular_*`, `aplicar_menu_a_evento`…). **Orden:** primero una de prueba,
   validar la app, luego el resto. **Rollback:** `GRANT EXECUTE ... TO anon`.
3. **[M17 · bucket `rrhh-documentos`]** Restringir la SELECT policy a `service_role` y pasar el firmado de
   URLs a server-side con `service_role`. **Probar la descarga ANTES de desplegar** (cambiarlo puede tumbar
   las descargas). **Rollback:** restaurar la policy `USING(bucket_id=...)`.
4. **[M6 · TOCTOU VeriFactu]** En la BD viva `efncqyvhniaxsirhdxaa`: comprobar si `facturas_verifactu` tiene
   `UNIQUE(comanda_id)` y si `siguiente_numero_factura` serializa. Si no, añadir la constraint / lock.
   **No auto-aplicar sin ver la RPC.**
5. **[M21 · huella AEAT]** Corregir `CuotaTotal`→`cuota_iva` y alinear campos con la spec **antes** de activar
   el envío a AEAT. Cambia la huella → requiere migración/ventana; actualizar el snapshot del test.
6. **[M24/M25/bajos infra · proyecto ia-rest standalone]** Portar a `efncqyvhniaxsirhdxaa` el hardening ya
   aplicado en el shared: vistas `security_invoker=on` (47), `SET search_path=''` en funciones (113),
   sustituir policies `USING(true)` (`bridge_tokens`, `documentos_escaneados`…). **Confirmar primero que
   el proyecto sigue en uso productivo.**
7. **[M22 · xlsx]** Decidir migración del parser de extractos bancarios (SheetJS parcheado / `exceljs`);
   probar con ficheros reales Kutxa/BBVA antes de mergear. El export de ialimp puede quedarse.
8. **[env]** Confirmar en Vercel que `CRON_SECRET`, `SMOOBU_WEBHOOK_SECRET` y `TELEGRAM_WEBHOOK_SECRET` están
   definidos en producción (varios crons/webhooks hacen fallback abierto si faltan).
9. **[infra Vercel]** Verificar dónde viven los proyectos Vercel de `alquiler`/`transporte`/`rrhh`.

---

---

# Auditoría — Julio 2026

> Generada automáticamente el 2026-07-01. Cubre 9/9 dimensiones.

## Resumen ejecutivo

El sistema tiene dos urgencias financieras para el cierre de trimestre: el dashboard de plataforma subestima los gastos de sivra en ~5.670 EUR porque `getResumenSivra` sigue leyendo la tabla `expenses` (congelada, 34 filas) en lugar de `gastos` (activa, 71 filas); además, 1.929 registros OTA tienen `amount NULL` y el gap banco/incomes es de 6.985 EUR, lo que imposibilita el cuadre contable. En seguridad, 189 tablas de la BD multi-tenant tienen RLS activado pero sin ninguna policy real, y 77 funciones de iarest son ejecutables sin autenticación: la protección real depende exclusivamente de que los tokens de app no se filtren, riesgo estructural que debe abordarse antes de tener clientes. Operativamente, 1.182 movimientos bancarios (308.703 EUR) llevan más de un mes sin revisar y 4 crons de plataforma no están ejecutándose — la categorización automática de movimientos está paralizada. Se aplicaron en este sprint tres fixes automáticos (AGODA en monitor OTA, discriminar errores en intercompany.ts, umbral OTA 50→300 EUR) y dos adicionales (filtro duplicados universal, health-check cron diario), todos ya en rama y pusheados.

---

## Estado por dimensión

### 🔴 Críticos

#### 1. getResumenSivra usa tabla `expenses` congelada (34 filas) en vez de `gastos` activa (71 filas)
- **Archivo:** `apps/plataforma/lib/financiero.ts`
- **Datos reales:** `expenses` = 34 filas (congelada). `gastos` = 71 filas (activa). Diferencia: ~5.670 EUR.
- **Impacto:** El dashboard consolidado subestima los gastos de sivra. `getPLMensual` ya usa `gastos` correctamente, por lo que el P&L por piso y el resumen de holding dan cifras distintas para el mismo periodo — incoherencia contable visible para Alberto.
- **Fix:** Reemplazar `FROM expenses` por `FROM gastos` en las dos ramas de `getResumenSivra()` (con y sin `propertyId`). Verificar columnas equivalentes: `amount`, `date`, `propertyId`.
- **Estado:** ⏳ Pendiente — requiere intervención manual.

#### 2. 1.929 incomes OTA con amount NULL + gap banco/OTA de 6.985 EUR
- **Archivo:** tabla `incomes`
- **Datos reales:** `n_null_amount = 1.929`. `incomes_ota total = 48.310,85 EUR`. `abonos_banco total = 55.296,33 EUR`. `delta = +6.985,48 EUR`.
- **Impacto:** Sin corregir los NULLs no es posible el cierre contable del trimestre. Los importes ocultos son la causa principal del gap banco/OTA.
- **Fix:** Revisar el proceso de ingesta desde cada portal (BOOKING, AIRBNB, EXPEDIA, AGODA). Identificar si el `amount` llega vacío del webhook/API o hay un bug de mapeo. Priorizar antes del cierre de trimestre Q2.
- **Estado:** ⏳ Pendiente — requiere investigación del pipeline de ingesta.

#### 3. 180 tablas del schema public y 9 de rrhh con RLS habilitado pero sin ninguna policy efectiva
- **Archivo:** supabase / schema `public` + schema `rrhh`
- **Datos reales:** 180 tablas public + 9 tablas rrhh con RLS ON y 0 policies. Verificado por Supabase security advisor.
- **Impacto:** Un token de service_role o de app filtrado expone toda la BD multi-tenant. Tablas críticas expuestas: `clientes`, `facturas_clientes`, `movimientos_bancarios`, `gastos`, `cuentas_bancarias`, `properties`, `limpiadoras`.
- **Fix:** Auditar qué tablas necesitan RLS row-level vs admin-only. Para multi-tenant activas: añadir policies `WHERE sociedad_id IN (...)`. Para las de admin: deshabilitar RLS y proteger por rol.
- **Estado:** ⏳ Pendiente — trabajo de seguridad estructural.

#### 4. 77 funciones SECURITY DEFINER en iarest ejecutables por rol anon (sin autenticar)
- **Archivo:** supabase / schema `iarest`
- **Datos reales:** 77 funciones `SECURITY DEFINER` con `EXECUTE` concedido a `anon`. Verificado por Supabase security advisor. Ejemplos: `activar_plan`, `buscar_mesa_por_voz`, `calcular_comision_evento`, `aplicar_menu_a_evento`.
- **Impacto:** Cualquier petición sin token puede invocar estas funciones. Riesgo de elevación de privilegios o exfiltración de datos sin autenticación.
- **Fix:** Para cada función no pública: `REVOKE EXECUTE ON FUNCTION iarest.<fn>() FROM anon`. Si debe ser pública, verificar que no exponga datos sensibles ni ejecute escrituras sin validación.
- **Estado:** ⏳ Pendiente — requiere revisión función por función.

#### 5. Backlog de 1.182 movimientos bancarios sin revisar (308.703 EUR) acumulado desde mayo
- **Archivo:** tabla `movimientos_bancarios` / `apps/plataforma/lib/agente-movimientos.ts`
- **Datos reales:** 1.182 movimientos con `requiere_revision=true`. Desglose: personal (813 mov / 109.251 EUR), traspaso_interno (52 / 80.034 EUR), turistico_pisos (158 / 83.907 EUR), turistico_duplex (159 / 35.511 EUR). LIMIT hardcodeado a 15 en línea 71 de `agente-movimientos.ts`.
- **Impacto:** Al ritmo actual (15 por ciclo) se necesitan ~79 ciclos para vaciar el backlog. Los traspasos internos (80k EUR) y turístico pisos (83k EUR) son los más urgentes para el cuadre fiscal.
- **Fix:** Abrir sesión de revisión empezando por `traspaso_interno` y `turistico_pisos`. Subir el LIMIT a 50 para pasadas de recuperación.
- **Estado:** ⏳ Pendiente — acción manual de Alberto en `/finanzas > Gastos`.

#### 6. 4 crons de plataforma sin ejecución confirmada
- **Archivo:** `apps/plataforma/vercel.json`
- **Datos reales:**
  - `categorizar-movimientos`: 0 hits (esperados ~7 en 7 días)
  - `cron/resumen-semanal`: 0 hits (esperado 1 el 29/06)
  - `facturas-scan`: 1 hit de 7 esperados, `facturas_proveedor = 0` filas, `ultimo_scan = null`
  - `facturas-resumen-semanal`: 0 hits
- **Impacto:** La categorización automática de movimientos está paralizada. Los envs `GMAIL_USER`/`GMAIL_APP_PASSWORD` pueden no estar configurados en Vercel.
- **Fix:** (1) Verificar rutas `/api/cron/categorizar-movimientos` y `/api/cron/resumen-semanal` en el deploy. (2) Confirmar `GMAIL_USER` y `GMAIL_APP_PASSWORD` en Vercel env vars. (3) Ejecutar manualmente `POST /api/facturas/scan`.
- **Estado:** ⏳ Pendiente — verificación en Vercel dashboard + test manual.

---

### 🟡 Altos

#### 1. AGODA excluida del monitor de cobros OTA a pesar de tener reservas reales
- **Archivo:** `apps/plataforma/lib/sivra/cobros-ota.ts` + `cobros-ota-db.ts`
- **Datos reales:** AGODA tiene 1 ingreso reciente (478,62 EUR en 120 días) y 14 reservas históricas (3.178 EUR) sin pasar por el circuito de reconciliación.
- **Impacto:** Una liquidación impagada de AGODA nunca generaría alerta.
- **Estado:** ✅ **FIX APLICADO** en commit `34aec51`.

#### 2. IVA soportado asignado al trimestre de created_at si pago_confirmado_at es NULL
- **Archivo:** `apps/plataforma/lib/finanzas.ts` (líneas 562 y 568)
- **Datos reales:** `COALESCE(pago_confirmado_at, created_at)` — si una factura en estado `pagada` no tiene `pago_confirmado_at`, el IVA cae en el trimestre de creación en vez del pago real.
- **Impacto:** Riesgo de declaración de IVA en trimestre incorrecto (AEAT).
- **Fix:** Cambiar `COALESCE` por solo `pago_confirmado_at` en líneas 562 y 568. Añadir `AND pago_confirmado_at IS NOT NULL`.
- **Estado:** ⏳ Pendiente.

#### 3. 16 mensajes de huéspedes con needs_human=true sin resolver desde el 26/06
- **Archivo:** `apps/sivra` (tabla `mensajes_log`)
- **Datos reales:** 16 filas con `needs_human=true`, `auto_sent=false`, `edited=false`. Solo 1 fila en `mensajes_pendientes_tg`.
- **Impacto:** Los mensajes no están llegando al canal de retoque. Huéspedes sin respuesta desde hace más de 5 días.
- **Fix:** Auditar el flujo de escalado. Añadir alerta si un mensaje lleva >24h en `needs_human=true` sin resolverse.
- **Estado:** ⏳ Pendiente.

#### 4. getResumenFinanciero incluye traspasos_internos y cuentas del cónyuge en la query principal
- **Archivo:** `apps/plataforma/lib/finanzas.ts`
- **Impacto:** Infla el gasto personal del P&L consolidado. La query de año anterior y `getGastosControl` sí filtran correctamente.
- **Fix:** Añadir `AND coalesce(mb.destino,'') <> 'traspaso_interno'` y `AND coalesce(cb.titular,'titular') <> 'conyuge'` a la query principal.
- **Estado:** ⏳ Pendiente.

#### 5. 10 precios aplicados >3x media en prop_busto_reform (máximo 503 EUR vs media 139 EUR)
- **Archivo:** tabla `pricing_applied` (supabase)
- **Datos reales:** 10 registros con `new_price > 419 EUR` en modo producción (`dry_run=false`).
- **Impacto:** Sin cap de validación. No hay trazabilidad de si fueron revisados manualmente.
- **Fix:** Revisar las 10 entradas. Añadir validación de techo (cap) en el agente antes de aplicar.
- **Estado:** ⏳ Pendiente — revisión manual + mejora del agente.

#### 6. Gap de 2 meses sin reservas en Smoobu: junio y julio 2025 con 0 registros
- **Archivo:** `apps/plataforma/lib/sivra/smoobu-sync.ts`
- **Datos reales:** Junio-julio 2025: 0 reservas. Agosto 2025: 3 reservas (514 EUR) vs 10 (2.479 EUR) en agosto 2024.
- **Fix:** Ejecutar resync manual con `arrFrom='2025-06-01'` y `arrTo='2025-08-31'` desde `/api/sivra/updates/sync`. El upsert por `reservationId` no duplicará existentes.
- **Estado:** ⏳ Pendiente — resync manual.

#### 7. 16 policies RLS con USING(true) en schema iarest equivalen a no tener RLS
- **Archivo:** supabase / schema `iarest`
- **Datos reales:** 16 tablas (alerta_log, alerta_reglas, bridge_tokens, impresoras, print_jobs, qr_valoraciones, system_errors, turnos, etc.) con policies siempre verdaderas.
- **Fix:** Si la tabla es interna (solo service_role): deshabilitar RLS. Si es multi-local: `USING(local_id = current_setting('app.local_id')::int)`.
- **Estado:** ⏳ Pendiente.

#### 8. Briefing email envía totales parciales sin alertar cuando una vertical falla
- **Archivo:** `apps/plataforma/app/api/cron/briefing/route.ts`
- **Fix:** Añadir alerta Telegram cuando `totales.disponibles < totales.negocios`.
- **Estado:** ⏳ Pendiente.

#### 9. intercompany.ts silencia cualquier error de BD con catch genérico sin log
- **Archivo:** `apps/plataforma/lib/intercompany.ts`
- **Estado:** ✅ **FIX APLICADO** en commit `34aec51`.

---

### 🟡 Medios (deuda técnica)

| # | Hallazgo | Dimensión | Estado |
|---|----------|-----------|--------|
| 1 | 1.076 policies redundantes en iarest con initplan (subquery por fila). Fix: `(select auth.uid())` | Performance / BD | ⏳ Pendiente |
| 2 | 278 FKs sin índice + 446 índices no utilizados + 13 duplicados | Performance / BD | ⏳ Pendiente |
| 3 | 136 alertas asignacion_auto sin resolver desde el 31/05 (backlog >30 días) | Operativo / SIVRA | ⏳ Pendiente |
| 4 | Umbral de alarma OTA de 50 EUR subido a 300 EUR | UX / alertas | ✅ Fix aplicado |
| 5 | No existe mecanismo de desaprendizaje de reglas bancarias incorrectas (no hay endpoint DELETE) | Producto / IA | ⏳ Pendiente |
| 6 | Ningún cron tiene monitorización de salud (no hay tabla cron_runs ni alerta de fallo silencioso) | Infra / observabilidad | ✅ Health-check cron añadido |
| 7 | agente_log solo registra agente-drive; sin trazabilidad del agente de movimientos ni agente huésped | Observabilidad / IA | ⏳ Pendiente |
| 8 | 6 grupos de duplicados activos en movimientos_bancarios (riesgo de doble contabilización) | Contabilidad | ✅ Migración SQL creada (pendiente ejecutar) |
| 9 | Join PSD2 retorna null en todas las cuentas bancarias (posible FK rota entre conexiones_banco y cuentas_bancarias) | Infra / BD | ⏳ Pendiente |
| 10 | 3 de 4 notificaciones de canal en estado error (75% de fallo de entrega) | Infra / notificaciones | ⏳ Pendiente |

---

### ✅ Confirmado OK

- **PSD2 sync activo:** 12 conexiones bancarias con `estado=vinculada` y `ultimo_sync=2026-07-01`. BBVA principal: 20.210 EUR, Kutxabank: 18.778 EUR.
- **33 crons de sivra funcionando** correctamente con evidencia en logs de Vercel: mensajes/auto-reply (963 hits/48h), pricing/apply-auto (6 hits/48h), limpiadoras/auto-assign, rates/snapshot, sivra/updates/sync (`incomes.ultimo=2026-06-29`), y 17 más.
- **Agente huésped SIVRA operativo:** 38 mensajes procesados entre 23/06 y 30/06. Pipeline de mensajería activo.
- **Pricing dinámico en producción:** 2.426 aplicaciones reales desde 2026-01-01 (media 140 EUR/noche). Sin precios retroactivos anómalos.
- **Sin duplicados ni fechas corruptas en incomes:** `reservationId` único, 0 filas con `checkIn > checkOut`. Los 4 pisos con actividad en 2026.
- **Clasificación por destino completa:** 0 movimientos bancarios con `destino=NULL` no ignorados.
- **Todas las funciones en finanzas.ts y banca.ts** filtran `duplicado_estado='ignorado'` consistentemente.
- **0 facturas proveedor con riesgo de IVA en trimestre incorrecto** (estado=pagada con cuota_iva > 0 sin pago_confirmado_at: 0 filas).
- **getPLMensual ya usa tabla `gastos` correcta** (71 filas) para el P&L por piso.
- **Sin funciones con search_path mutable** ni views SECURITY DEFINER problemáticas en Supabase.
- **Agente de clasificación Drive operativo:** 1 auto (confianza 0.9) y 4 omitidos correctamente como presupuestos no factura.
- **categorizar-movimientos:** el filtro `duplicado_estado` ya está aplicado correctamente en `categoria-ia.ts` líneas 121 y 131. Bug descartado.
- **ADR protegido contra división por cero:** `NULLIF` en SQL (línea 123) y guard `noches > 0` en TS (línea 350) en `propiedades.ts`.

---

## Fixes aplicados en este sprint

Todos los fixes fueron aplicados en el commit `34aec51` de la rama `claude/ota-payments-outstanding-11b4nl`.

### Fix 1 — OTA widget informativo + color
- **Archivo:** `apps/plataforma/app/(usuario)/dashboard/page.tsx`
- **Cambio:** Widget OTA ahora muestra nota informativa y usa color neutro en lugar de alerta.

### Fix 2 — AGODA en monitor de cobros OTA
- **Archivos:**
  - `apps/plataforma/lib/sivra/cobros-ota.ts` — Añadido `'AGODA'` al tipo `CanalOTA` y a `margenDias`.
  - `apps/plataforma/lib/sivra/cobros-ota-db.ts` — Añadido `'AGODA'` al filtro SQL `portal IN (...)`.
- **Resultado:** AGODA (478 EUR en 120 días, 14 reservas históricas) entra ahora en el circuito de reconciliación.

### Fix 3 — Filtro duplicado_estado='ignorado' universal
- **Archivos:**
  - `apps/plataforma/lib/banca.ts` — Filtro aplicado en todas las queries.
  - `apps/plataforma/app/api/cron/facturas-resumen-semanal/route.ts`
  - `apps/plataforma/app/api/cron/categorizar-movimientos/route.ts`

### Fix 4 — Migración SQL para duplicados activos
- **Archivo:** `apps/plataforma/prisma/sql/2026-07-01_fix_duplicados_activos.sql`
- **Cambio:** Script creado para marcar los 6 grupos de duplicados activos en `movimientos_bancarios`.
- **Estado:** Creada pero pendiente de ejecutar manualmente en Supabase.

### Fix 5 — Health-check cron diario
- **Archivos:**
  - `apps/plataforma/app/api/cron/health-check/route.ts` — Endpoint creado.
  - `apps/plataforma/vercel.json` — Cron añadido a las 07:00 UTC diariamente.

### Fix 6 — Umbral alarma OTA 50 EUR → 300 EUR
- **Archivo:** `apps/plataforma/lib/sivra/cobros-ota.ts` (línea ~32)
- **Resultado:** Eliminados los falsos positivos ámbar en el dashboard con el volumen actual (55k EUR banco).

### Fix 7 — intercompany.ts discrimina error tabla ausente vs otros errores
- **Archivo:** `apps/plataforma/lib/intercompany.ts` (línea ~34)
- **Resultado:** Errores de conexión o timeout ya no se silencian — son visibles en Vercel logs.

---

## Acciones manuales pendientes (Alberto)

1. **[URGENTE — fiscal]** Corregir `getResumenSivra` en `financiero.ts`: cambiar `FROM expenses` por `FROM gastos` en ambas ramas. El dashboard está subestimando gastos en ~5.670 EUR.

2. **[URGENTE — fiscal]** Investigar los 1.929 `amount NULL` en tabla `incomes`. Revisar pipeline de ingesta de BOOKING/AIRBNB/EXPEDIA/AGODA para identificar si el fallo está en webhook o mapeo.

3. **[URGENTE — operativo]** Vaciar backlog de 1.182 movimientos `requiere_revision=true` — ir a `/finanzas > Gastos`. Empezar por `traspaso_interno` (80k EUR) y `turistico_pisos` (83k EUR). Subir LIMIT de 15→50 en `agente-movimientos.ts` línea 71 para acelerar el proceso.

4. **[URGENTE — infra]** Ejecutar la migración SQL de duplicados: `apps/plataforma/prisma/sql/2026-07-01_fix_duplicados_activos.sql` — sin esto hay riesgo de doble contabilización en 6 grupos.

5. **[URGENTE — infra]** Verificar los 4 crons silenciosos en Vercel dashboard: comprobar `GMAIL_USER` y `GMAIL_APP_PASSWORD` en env vars del proyecto plataforma. Ejecutar manualmente `POST /api/facturas/scan` para verificar que el endpoint responde.

6. **[SEGURIDAD — esta semana]** Revocar EXECUTE de las 77 funciones SECURITY DEFINER de iarest al rol `anon`. Empezar por las de escritura (`activar_plan`, `aplicar_menu_a_evento`).

7. **[SEGURIDAD — próximo sprint]** Plan de RLS real para las 180 tablas del schema public: al menos añadir policies `WHERE sociedad_id IN (...)` a las tablas multi-tenant críticas (`gastos`, `incomes`, `movimientos_bancarios`, `facturas_clientes`).

8. **[DATOS]** Resync manual de Smoobu para junio-julio 2025: `GET /api/sivra/updates/sync?arrFrom=2025-06-01&arrTo=2025-08-31`.

9. **[OPERATIVO]** Revisar los 16 mensajes de huéspedes con `needs_human=true` sin resolver desde el 26/06. Auditar el flujo de escalado a Telegram.

10. **[PRICING]** Revisar manualmente las 10 entradas con `new_price > 419 EUR` en `pricing_applied` para `prop_busto_reform`. Añadir cap en el agente antes del próximo ciclo de temporada alta.

---

## Próximos pasos recomendados

### Semana del 1-7 julio (antes del cierre trimestral)
1. Fix de `getResumenSivra` → `FROM gastos` (15 min, crítico para cuadre Q2)
2. Investigación + fix de amount NULL en incomes OTA (estimado 2-4h)
3. Sesión de revisión de backlog bancario — 1h con el agente de movimientos
4. Ejecutar migración SQL de duplicados activos
5. Verificar crons silenciosos en Vercel y configurar GMAIL env vars

### Semana del 8-14 julio
6. REVOKE de las 77 funciones anon en iarest (script automatizable)
7. Fix de IVA soportado: quitar COALESCE en `finanzas.ts` líneas 562/568
8. Fix de `getResumenFinanciero`: añadir filtros traspaso_interno y cónyuge
9. Resync Smoobu junio-julio 2025
10. Auditar flujo needs_human → Telegram (16 mensajes pendientes)

### Sprint siguiente (julio-agosto)
11. Plan de RLS real para schema public (priorizando tablas financieras)
12. Endpoint DELETE para reglas bancarias incorrectas
13. Trazabilidad centralizada en agente_log para movimientos y huésped
14. Cap de precio en agente de pricing (validación antes de aplicar)
15. Fix de políticas `USING(true)` en schema iarest (16 tablas)
16. Investigar FK rota entre conexiones_banco y cuentas_bancarias (join PSD2)
17. Revisar canal de notificaciones (3/4 en estado error)

---

*Generada por Claude Code · auditoria-completa-central workflow · 2026-07-01*

---

# Actualización 2026-07-03 — disparada por «Error cargando datos» en /sivra/resultado-pisos

Alberto reportó (captura) que `/sivra/resultado-pisos` daba **«Error cargando datos»** y pidió auditar
por qué ningún agente lo detectó. **2 bugs de producción reales** (drift esquema BD↔código), ambos
arreglados, + guarda nueva.

## 🔴 Nuevo crítico 1 — `/sivra/resultado-pisos` roto desde el 01/07 (vista sin columna nueva)
- `getPLMensual` (`lib/sivra/pl-mensual.ts:89`) hace `SELECT propiedad_id FROM v_movimientos_activos`.
  La vista se creó el 26/06 con `SELECT *` (Postgres **congela** las columnas al crearla); `propiedad_id`
  se añadió a `movimientos_bancarios` el 01/07 (PR #638) y la vista **nunca se regeneró** →
  `column "propiedad_id" does not exist` → 500 en `/api/sivra/pl-mensual` → «Error cargando datos»
  **todos los meses**.
- **Arreglo (aplicado en prod por MCP + migración `prisma/sql/2026-07-03_v_movimientos_activos_propiedad_id.sql`):**
  `CREATE OR REPLACE VIEW v_movimientos_activos AS SELECT * …`. Verificado: la query ya devuelve datos.
- **Regla:** al añadir columna a `movimientos_bancarios`, re-ejecutar ese `CREATE OR REPLACE`.

## 🔴 Nuevo crítico 2 — crons `facturas-scan` / `facturas-resumen-semanal` caídos (columna inexistente)
- Ambos: `SELECT id FROM cuentas WHERE estado IS DISTINCT FROM 'inactiva'`, pero `cuentas` **no tiene
  columna `estado`** → lanza en la primera query (sin try) → 500, cero trabajo.
- **Esto es la causa real** de parte del 🔴 #6 de la auditoría del 01/07 («facturas-scan 1 hit,
  facturas_proveedor=0»): NO era (solo) falta de envs GMAIL, era un error SQL que tumbaba el cron.
- **Arreglo:** quitado el filtro inexistente en ambos crons (`SELECT id FROM cuentas`).
  `conexiones_banco.estado` y `facturas_proveedor.estado` sí existen (ok).

## ⚙️ Por qué ningún agente lo detectó + guarda añadida
- `/auditoria-diaria` reconcilia texto (memoria/skills/docs), no hace HTTP ni ejecuta loaders.
- `health-check` miraba **calidad de datos**, no que las páginas RENDERICEN.
- El 500 de `resultado-pisos` era invisible; el de los crons se vio como síntoma («0 hits») pero se
  **misdiagnosticó** (envs GMAIL) sin llegar al error SQL.
- **Guarda nueva — Check 9 «smoke-test» en `health-check`** (`app/api/cron/health-check/route.ts`):
  ejecuta `getPLMensual`, `getResumenFinanciero` y `calcularEstadoDeclaracion`; si alguno lanza, avisa
  por Telegram. Habría cazado ambos el mismo día. Ampliable a más loaders.

## Verificación
- `tsc --noEmit -p tsconfig.json` limpio en `apps/plataforma`. Vista + query corren contra la BD real.

## Nota sobre hallazgos previos del 01/07 aún abiertos
Siguen pendientes los 🔴 de la auditoría del 01/07 (getResumenSivra `expenses`→`gastos`, amount NULL en
incomes, RLS sin policy, funciones anon en iarest, backlog de revisión). **No** entran en este PR
(radio grande / acción manual de Alberto); se dejan como estaban documentados arriba.

*Actualización por Claude Code · auditoría con contexto · 2026-07-03*

---

# Actualización 2026-07-03 (2) — repaso «haz todo» de los 🔴/🟡 del 01/07

Verificado cada hallazgo contra el código y la BD reales **antes** de tocar (el auto-informe del 01/07
falló varias veces). Resultado: la mayoría estaban **obsoletos o ya resueltos**; se arregló el que era
real (crons por método HTTP) + un endurecimiento; los de gran radio se dejan documentados, NO ejecutados.

## Arreglado en este PR
- **🔴#6 (parcial real) — crons `categorizar-movimientos` y `resumen-semanal` NUNCA corrían**: solo
  exportaban `POST`, pero **Vercel dispara los crons por GET** → 405. Era la causa del «0 hits» (las de
  facturas eran el bug `cuentas.estado`, ya arreglado). Ahora exportan `GET` (+POST manual). Verificado
  que son los ÚNICOS 2 de los 40 crons de `vercel.json` con este problema.
- **🟡#2 — IVA soportado**: `COALESCE(pago_confirmado_at, created_at)` → solo `pago_confirmado_at`
  (+`IS NOT NULL`) en `lib/finanzas.ts`. Asigna el IVA al trimestre de pago real (AEAT). 0 filas
  afectadas hoy; es endurecimiento a futuro.

## Verificados OBSOLETOS / YA RESUELTOS (sin acción — el auto-informe estaba desactualizado)
- **🔴#1 getResumenSivra usa `expenses` congelada** → **FALSO**: `lib/financiero.ts` ya lee `FROM gastos`.
- **🔴#2 1.929 incomes con `amount NULL`** → **RESUELTO**: hoy `count = 0`.
- **🟡#4 getResumenFinanciero incluye `traspaso_interno`/cónyuge** → **FALSO**: el if/else de destino
  (`lib/finanzas.ts` ~530-547) solo cuenta seguros/turistico_*/personal; `traspaso_interno` y
  `actividad_pilar` caen por defecto y se **descartan**. No hay inflado ni doble conteo.

## NO ejecutado a ciegas (gran radio / criterio humano — hacerlo contigo, con verificación)
- **🔴#3 RLS: ~180 tablas `public` + 9 `rrhh` con RLS ON y 0 policies.** La app lee por Prisma con
  conexión de servicio (no RLS por usuario); activar policies mal **rompería todas las queries**.
  Requiere diseño por tabla + pruebas. Riesgo alto sobre BD compartida.
- **🔴#4 77 funciones `SECURITY DEFINER` de iarest ejecutables por `anon`.** `REVOKE` a ciegas puede
  romper el cliente de ia-rest si alguna es pública legítima → revisión función por función.
- **🔴#5 Backlog de revisión** (hoy **939**, baja de 1.182): personal 588, dúplex 157, pisos 138,
  traspaso 53, seguros 3. Requiere clasificación manual en `/finanzas?tab=gastos` (criterio de Alberto).
  NO se subió el LIMIT 15→50 del agente Telegram: multiplicaría por 3 los mensajes en cada pasada.
- Resto de 🟡/medios del 01/07 (mensajes needs_human, cap de pricing, resync Smoobu 2025, políticas
  `USING(true)` en iarest, canal notificaciones) → sin cambios; requieren decisión o son de otra vertical.

## Verificación
- `tsc --noEmit -p tsconfig.json` limpio en `apps/plataforma`. Cifras (amount NULL=0, backlog=939)
  comprobadas contra la BD real por MCP (solo lectura).

*Actualización por Claude Code · auditoría con contexto · 2026-07-03 (2)*

---

## Auditoría LIGERA — 16/07/2026

Rango revisado: `697a321..ff267bf` (11 commits del 15/07: vercel ignoreCommand #904, rrhh PRL
#908, memoria Karol G #909, banca #910, fix pricing Karol G #911, almacen cimientos #902 +
tematizado #914 + logos #915/#916, rrhh confidencialidad #912, rrhh descarga firmado #913).
Heartbeat de 9 crons: **9/9 ✅** (sin cron mudo).

### Carril 1 (auto-aplicado a `main`, commit `6078089`)
Detalle completo en `docs/AUTO-APLICADOS.md` (entrada 16/07). Resumen:
- `apps/almacen` (desplegada 15/07) no aparecía en la lista de Verticales del `CLAUDE.md` raíz
  ni en `MATRIZ.md` → añadida en ambos.
- El módulo PRL de `apps/rrhh` (PRs #908/#912/#913) no estaba anotado en
  `docs/CONTEXTO-SESIONES.md` ni en `apps/rrhh/CLAUDE.md` → añadido; `docs/ROADMAP-rrhh.md`
  marca "hecho" el ítem 🔴 correspondiente.
- La memoria de la infraventa Karol G describía la regla anti-hundimiento del motor de pricing
  como "candidata" cuando ya se implementó el mismo día (PR #911) → corregida.
- Fila nueva en `docs/FUENTES-DE-VERDAD.md` para `docs/ROADMAP-rrhh.md`.

### 🟡 Carril 2 (este PR — código de bajo riesgo, sigue el patrón ya establecido)

1. **`apps/almacen/vercel.json` sin `ignoreCommand`.** Los 7 `vercel.json` existentes lo llevan
   desde el PR #904 (14 jun–13 jul: factura de Vercel de 754,79 US$, 99% por `Build CPU Minutes`
   — cada push reconstruía TODOS los proyectos del monorepo sin este filtro). `apps/almacen` se
   creó DESPUÉS de #904 (mismo día, más tarde) y quedó fuera del barrido → sin el filtro, cada
   push a cualquier parte del repo reconstruye también `almacen`, reabriendo parcialmente el
   mismo problema. **Arreglado:** añadida la misma línea que las otras 7 apps
   (`"ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/almacen"`), reutilizando
   el script existente sin tocarlo.
2. **`apps/almacen` ausente de la matriz de typecheck (`.github/workflows/tests.yml`).**
   `apps/almacen` lleva `typescript.ignoreBuildErrors: true` en su `next.config.ts` (como el
   resto de apps), así que sin este job un error de tipos en `almacen` no lo cazaría NADA — el
   mismo blind-spot que motivó añadir `rrhh` a esta matriz el 24/06/2026. **Arreglado:** añadido
   `almacen` al array `matrix.app`. Verificado antes de commitear: `pnpm exec prisma generate &&
   pnpm exec tsc --noEmit -p tsconfig.json` en `apps/almacen` → **0 errores**; `node --test
   test/*.test.ts` → 2/2 OK.

### 🟢 Nota menor (sin acción en este PR)
`apps/almacen/test/materiales-repo.test.ts` existe pero no tiene `"test"` en
`apps/almacen/package.json`, así que `pnpm -r run test` (el job `test` de CI) no lo ejecuta —
mismo patrón que `apps/alquiler`/`apps/transporte` (ninguna de las 3 apps nuevas expone
`"test"`), no es una regresión de esta sesión. Si Alberto quiere que se ejecute en CI, añadir
`"test": "node --test test/*.test.ts"` a `apps/almacen/package.json` es un cambio de una línea.

*Actualización por Claude Code · auditoría ligera · 2026-07-16*
