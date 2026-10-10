# CLAUDE.md — IALIMP

> 📦 **Índice + reglas (recortado el 03/10/2026 para gastar menos tokens).** La versión íntegra, con cada
> incidente, medición, cifra y porqué, está en `docs/claude-md/IALIMP-completo-2026-10-03.md`. **No la leas
> entera: búscala con Grep** por la palabra del tema («landing», «white-label», «sesion_activa», «iCal»,
> «mailing», «impagos», «nómina», «RGPD», «signed URL»…).

## Qué es
- SaaS **multi-tenant** de limpiezas de pisos turísticos (spin-off de SIVRA). Flujo: salida de huésped (Smoobu) →
  sesión de limpieza → asignación → app móvil de la limpiadora (checklist + fotos) → facturación al propietario.
- App `app.ialimp.es` (proyecto Vercel `ialimp`; `ialimp.vercel.app`/`ialimp.com` redirigen). Cliente piloto
  EN VIVO: Sique Brilla SL (Vanessa Cruz). Este repo es SOLO ialimp (no SIVRA, House Sevillana ni ia.rest).
- **Stack:** Next 15 · React 19 · Prisma 5 · **JWT (jose + bcryptjs), SIN NextAuth** · zod · web-push · pdf-lib.
  Install `npm install --legacy-peer-deps`; build `prisma generate && next build`. `next.config.ts` ignora errores
  de TS/lint (NO los de sintaxis). Commits/PR con prefijo `fix:`/`feat:` (Vercel ignora `chore|trigger|rebuild`).

## 🚨 Despliegue: cliente en vivo
- Producción = rama `main`; **cada merge se ve al instante**. ialimp **NO lleva `--sin-previews`** en su
  `ignoreCommand`: **preview verde antes de mergear a `main`**. La preview usa la BD de producción (lo que
  escribas se guarda de verdad; limpia los datos de prueba). Flujo: rama → PR draft → preview → validar → main.
- `NEXTAUTH_URL=https://app.ialimp.es` fija el dominio canónico (enlaces de emails, portal, Stripe).
- Rollback = panel de Vercel (Production, rollback candidates).

## Definición de «terminado» (en el MISMO PR)
`public/manual.html` si cambia UI/funcionalidad (mailing/superadmin es interno: no va) · este `CLAUDE.md` si
cambia convención/tabla/bucket/cron · migración `.sql` en `prisma/migrations/` **y** aplicada en Supabase ·
`vercel.json` si cambia un cron · build OK + prueba e2e. Sin credenciales en el repo: todo en envs de Vercel.

## Landing `ialimp.es` (proyecto Vercel SEPARADO `ialimp-landing`)
- Fuente en `landing/ialimp-es/` (estática; deploy por `.github/workflows/deploy-landing.yml`, secreto repo `VERCEL_TOKEN`). **NO da acceso a la app**: único CTA = formulario → `landing/ialimp-es/api/contacto.js` (RESEND_API_KEY o SMTP_USER/SMTP_PASSWORD, envs del proyecto `ialimp-landing`) + reenvío a `/api/lead-saas` (`LEAD_SAAS_URL`). Sin cookies de seguimiento. Animación nueva: paleta IALIMP clara y `prefers-reduced-motion`.

## White-label por EMPRESA (según login, NO por host)
- Marca en BD (`empresas.marca_nombre/logo_url/color_primario/color_secundario/color_light`), inyectada como
  `--brand-primary|secondary|light` por `components/BrandingStyle.tsx` + `lib/branding.ts` (`getBranding`/`brandingFrom`);
  logo en `components/LogoIalimp.tsx`. Se configura en `/admin/configuracion` vía `GET/PATCH /api/admin/empresa/branding`.
- **REGLA:** UI nueva usa `var(--brand-primary|secondary|light)` para acentos de marca (no hex fijo), salvo colores
  semánticos/estado. Login, legales y gate RGPD son ialimp genérico a propósito.

## Diseño (FIJO)
- IALIMP: header/botones `#4f46e5`, marca `#6366f1`, suaves `#eef2ff`, texto `#1e1b4b`, fondo `#f1f5f9`. **Tema CLARO
  siempre**; Nunito en todo. `color-scheme: light` (`globals.css` + `viewport.colorScheme`): no quitar.
- Sique Brilla = producto SEPARADO (negro `#0a0805` + dorado `#d4a017`): **nunca mezclar paletas**. Verde/rojo = solo estado.
- **Responsive obligatorio (≥320 px):** anchos fluidos (`%`, `fr`, `flexWrap`), nunca px fijos que desborden; modales
  `maxHeight:'90vh'` + `overflowY:'auto'`; tablas con scroll o cards; botones ≥44 px; sin media queries (estilos inline).
- Fuentes Nunito auto-alojadas: `scripts/fetch-fonts.mjs` (gwfh + fallback Google solo en build). **El `buildCommand`
  de `vercel.json` DEBE incluir `node scripts/fetch-fonts.mjs`** y el `matcher` del middleware excluir `woff2|woff|ttf|otf`.
  Cero llamadas a Google en runtime. Los `.woff2` no se versionan.
- Cookies solo técnicas (`ialimp_session`, `ialimp_prop`, `limpiadora_token`); banner informativo
  `components/CookieBanner.tsx`. Legales en `app/legal/` (`lib/rgpd.ts` `RGPD_RESPONSABLE`), `/legal` en `PUBLIC_PATHS`.

## Auth y sesiones
- Cookie admin `ialimp_session`; propietario **`ialimp_prop`** (separada a propósito: el middleware del panel nunca da
  acceso interno a un propietario); limpiadora `limpiadora_token`. Helpers `lib/auth.ts` (`create*Token` → `{token, jti}`).
- **Sesión ÚNICA por usuario (un asiento = un dispositivo):** limpiadora borra sus `limpiadora_sessions` al entrar;
  admin/usuario/propietario usan `session_jti` (se compara en `getSession` de `lib/tenant.ts` y
  `getPropietarioSession` de `lib/propietario-auth.ts`; `jti` NULL = se permite; superadmin fuera). Owner/usuario:
  2º login = **409 `{sesion_abierta:true}`** y botón «Entrar aquí y cerrar la otra» (`{forzar:true}`) vía flag
  `sesion_activa` (logout → false). **Nunca rotar `session_jti` a NULL** (la regla de gracia lo resucita).
  `requireEmpresaId/requireSession` lanzan `AuthError` (401) y `apiError(e)` lo mapea; `components/SessionGuard.tsx`
  redirige a `/login` ante 401. Desactivar limpiadora/usuario o regenerar enlace borra sus sesiones.
- **Propietario:** email+contraseña en `/propietario` o enlace legacy `/propietario/[token]`; **alta la hace el admin**
  (`clientes/[id]/enviar-acceso` → token `set_password` en `cliente_auth_tokens`, 7 d, SHA-256 un solo uso). Rutas
  `app/api/propietario/auth/` (`login`, `set-password`, `recuperar` solo cuentas activadas, `logout`); anti-enumeración +
  rate-limit; Turnstile (`lib/turnstile.ts`, sin secret no bloquea). Contraseña: `validatePasswordStrength`. Loader
  `lib/propietario-portal.ts`.
- **Gate RGPD del portal:** si `cliente.rgpd_aceptado && rgpd_version === RGPD_VERSION` no se cumple, `page.tsx` NO
  carga datos (solo `ConsentimientoRGPD`). Dos consentimientos granulares: servicio (obligatorio) y marketing
  (opcional, jamás atado al acceso). Evidencia en `cliente_consentimientos`. Cambiar el texto → subir `RGPD_VERSION`.
  Lista de marketing = `GET /api/superadmin/consentimientos` (solo superadmin), no el panel de empresa.
- **Limpiadora `/l`:** SIN correo/contraseña. PIN en `/l/login` (`pin_hash` SHA-256) o enlace mágico
  `/l/acceso/<token>` (`limpiadoras.acceso_token`; `POST /api/admin/limpiadoras/[id]/acceso`). `POST /api/l/auth` acepta
  `{pin}` o `{token}`; **el PIN se acota a la empresa de la cookie `limpiadora_empresa`**; sin cookie y PIN en >1 empresa
  → 401, nunca se adivina (fuga entre tenants). Rate-limit en BD (`lib/rate-limit-db.ts`, `auth_rate_limit`; también en
  `/api/auth/login` y `login-usuario`). `/l`, `/l/*`, `/api/l/*` exentos en middleware; `/limpiadoras` y `/equipo` → `/l`.

## Multi-tenant (CRÍTICO) y middleware
- **Scoping por `empresa_id` en TODA query y route.** Una fuga entre empresas es fallo grave de RGPD.
- Middleware: 401 a `/api/*` sin cookie `ialimp_session`. Eximidos: `/api/auth`, `/api/pms`, `/api/leads`,
  `/api/propietario`, `/api/cotizador`, `/api/catastro`, `/l`, `/api/l`, `/api/m`, `/api/lead-saas`.
- Estáticos necesarios antes del login (p.ej. `public/manifest.json`) que el `matcher` no excluya → `PUBLIC_PATHS`.
- **Crons y llamadas servidor→servidor a `/api/admin/*` DEBEN enviar `Authorization: Bearer CRON_SECRET`** o dan 401 silencioso.
- Registro de accesos: tabla `registro_actividad` (`lib/actividad.ts::registrarActividad`, best-effort; el middleware
  emite a `POST /api/interno/actividad`, Bearer `CRON_SECRET`; superadmin NO se registra; purga 90 d). Lo lee el
  god-panel de plataforma. Sin filas = «sin registro», no «no ha entrado».

## 🚨 LANDMINE — `pms_connections.ultimo_sync` NO la escribe nadie
- `/api/pms/sync` escribe **`last_sync_at`**; `ultimo_sync` está a NULL desde siempre. Estado real del PMS con el helper
  puro **`lib/pms-estado.ts`** (`estadoSync`/`esSyncSano`; verde solo con dato <3 h y sin errores) — **nunca `activa` a pelo**.
- Con el sync muerto `cleaning_sessions` no recibe reservas y todo miente («Sin limpiezas»). Vigilante: cron
  `agentes-latido` de plataforma (`apps/plataforma/lib/monitoring/latidos.ts`, id `ialimp_pms`, Telegram a Alberto).
  Limpiar la deuda = borrar `ultimo_sync`, no escribir en las dos.

## Base de datos (Supabase `wswbehlcuxqxyinousql`, COMPARTIDA con SIVRA)
- `$queryRaw` **SIEMPRE** con `Prisma.sql`; **casts en el SQL** (`${v}::uuid`), nunca concatenados al valor. Listas `IN`:
  `Prisma.join(ids.map(id => Prisma.sql\`${id}::uuid\`))` (si no, `42883 uuid = text`).
- **Rol `prisma_ialimp` least-privilege:** DML solo en las tablas propias del dominio + SELECT en vistas y `cuentas`.
  Tabla nueva por SQL crudo con `permission denied` → GRANT explícito a `prisma_ialimp` (Supabase MCP como `postgres`).
- `schema.prisma` solo declara `empresas` y `pms_connections`; el resto va por SQL crudo.
- `cleaning_sessions.hora_inicio` es **TEXT**: nunca `::time`; en PATCH, un `UPDATE` por campo y solo si viene en el body.
- Deuda: `property_id` (text legacy) vs `propiedad_id` (uuid): normaliza con `COALESCE(NULLIF(propiedad_id::text,''), property_id::text)`
  (ambos `::text`). El slug `prop_house_sevillana` es Casa Socorro.
- `clientes` = entidad facturable. **Baja = DESACTIVAR (`clientes.activo`), nunca borrar** (facturas por ley/VeriFactu):
  `POST /api/admin/clientes/[id]/desactivar|reactivar`; cancela limpiezas futuras no hechas y corta el portal rotando
  `session_jti` (nunca a NULL). `pms/sync` excluye propiedades de clientes inactivos; `GET /api/admin/clientes` solo activos
  salvo `?incluir_inactivos=1`.
- `facturas_clientes` congela destinatario (`dest_*`) para VeriFactu; `iva_importe`/`total`/`lineas.importe` son GENERATED.
  `lib/verifactu.ts` (campos `vf_*`); Sique Brilla obligado desde ene-2027.
- Contabilidad (`/admin/contabilidad`) por **vistas SQL** (`v_contab_ingresos|gastos|pyg|iva|tesoreria`): al extender, mismo
  contrato de columnas y `CREATE OR REPLACE` (**NUNCA `DROP`**, hace CASCADE). Coste de limpieza = facturas emitidas, no
  `cleaning_sessions`. Rentabilidad lee `facturas_clientes` directo. Recurrentes: `apuntes_recurrentes` +
  `lib/contab-recurrentes.ts` (cron `generar-recurrentes`, idempotente).
- Solo los 4 pisos de Alberto sincronizan Smoobu; externos = alta manual (`origen='manual'`).
- **Storage:** `cleaning-photos` (PRIVADO) · `propuestas-leads` (PRIVADO, SIN USO: la propuesta sale de
  `leads.propuesta_html` por `GET /api/admin/leads/[id]/propuesta`) · `cvs-rrhh` · `property-access-files` ·
  `documentos-propiedad` y `documentos-contables` (públicos) · `documentos-limpiadora` (PRIVADO, `lib/storage-limpiadora.ts`).
- **Fotos de limpieza:** BD guarda URL pública; se renderiza SIEMPRE con `photoSrc()` (`lib/photo.ts`) → proxy
  `GET /api/l/photo?u=` que firma con `signCleaningPhoto()` (`lib/cleaning-photos.ts`, anon key, solo bucket
  `cleaning-photos`) y hace 307. Fetch de servidor de IA (`ia/analizar-foto`, `ia/comparar-foto`) firma antes de descargar.
- Documentos del piso: `propiedades.documentos` (jsonb) + `components/DocumentosPropiedad.tsx`; rutas
  `/api/propietario/[token]/documentos-piso` (≠ `/documentos`, histórico del escáner).

## Smoobu, iCal y PMS
- Smoobu customer `127993947`, header `Api-Key` (no Bearer). READ reservations/messages/rates/custom-placeholders;
  WRITE solo `POST /api/rates`; 403 en el resto.
- `lib/ical-sync.ts` (`syncPropertyIcal`) es la fuente ÚNICA del parser iCal; lo usan el cron `/api/pms/sync` (10 min) y
  el portal (pestaña 🔗 Calendario iCal, `GET/PUT /api/propietario/[token]/ical`). Reserva con **salida HOY** insertada
  (`RETURNING (xmax = 0)`) → alerta `reserva_urgente` + email a `empresas.email`, salvo que el piso ya tenga limpieza
  completada hoy. Día «hoy» en `Europe/Madrid`. `pms/sync` sana `property_name`/`propiedad_id` en el `ON CONFLICT`.

## Asignación y sesiones de limpieza
- Disponibilidad por turnos (`limpiadora_disponibilidad`); **sin disponibilidad marcada NO se asigna**. Auto-asignación
  `GET /api/admin/auto-assign` (crons 5:30 y 16:00; solo hoy+mañana con `limpiadora_id` NULL; scoring en el `.map` del route;
  penaliza pero no excluye). Alerta `asignacion_auto` = **historial, `leida=true`** (NO reintroducir `leida=false`); el cron purga >30 d.
- `PATCH /api/admin/sesiones/[id]` (scope empresa; bloquea reasignar si `completed_at`, 409; push a la limpiadora vía
  `sendPushToLimpiadora()` de `lib/push.ts`); `DELETE` solo `origen='manual'` sin empezar. `POST /api/admin/sesiones/reordenar`.
  `orden_manual`/`urgente_manual` en `cleaning_sessions` y vista `sesiones_limpiadora`. Orden (Inicio, Agenda y `/l`):
  `orden_manual` → `urgente_manual` → `alerta_ventana` → `hora_checkin_siguiente` → `hora` (`prioridad(a,b)`).
- `NuevaLimpiezaModal` hace PATCH si recibe `sesion` (modo edición). Revisar limpieza hecha: `GET /api/admin/sesiones/[id]/completions`.
- Incidencias: `/api/l/incidencias` (tabla sin `empresa_id`, acotada por `property_id` de sesiones de la empresa) y panel
  `/admin/incidencias` (`/api/admin/incidencias`).
- Tarifas y nóminas (`/admin/equipo`, `Tarifas.tsx`/`Nominas.tsx`): `catalogo_tarifas` (categoría `piso|servicio|pc`),
  `partes_trabajo` (snapshots editables; un parte por sesión), nómina = agregación en vivo (`/api/admin/nomina`,
  `/api/admin/partes-trabajo`, `.../desde-sesiones`), NO usa `facturas_limpiadoras`. Pestañas de `/admin/equipo` en 2 niveles
  (Equipo · Economía · Operación); el análisis IA vive en cada tarjeta de `TabLimpiadoras`.

## Crons y avisos a la empresa
- `/api/cron/impagos` (08:30): vencidas no cobradas, recordatorios +3/+10/+21 d (`recordatorios_impagos`, único
  `(factura_id, escalon)`) y resumen diario a `empresas.email`; lógica en `lib/impagos.ts`.
- `/api/cron/alertas-pendientes` (lunes 08:00): email con alertas sin leer >3 d (`lib/alertas-resumen.ts`); sustituye al
  Check 6 de plataforma. Vanessa no mira el 🔔: lo que deba ver le llega por email.
- Concursos/licitaciones viven en `apps/plataforma` (`/concursos`); sus tablas siguen en la BD compartida.

## Email saliente
- `lib/mailer.ts` (`getTransporter()` + `MAIL_FROM` = `hola@ialimp.es`). Orden: Resend (`RESEND_API_KEY`) → IONOS SMTP
  (`SMTP_USER`/`SMTP_PASSWORD`, `SMTP_HOST`, **`SMTP_PORT=587` STARTTLS**) → Gmail (`GMAIL_USER`/`GMAIL_APP_PASSWORD`).
  Activo hoy: IONOS. Sin credenciales devuelve `null` y no rompe. Diagnóstico: `GET/POST /api/admin/test-email`
  (admin o Bearer `CRON_SECRET`). **Verificación de entrega: la hace Claude** (Gmail de Alberto + runtime logs de Vercel),
  no se le pide al usuario.

## IA
- Todo vía `lib/ai-client.ts` (`aiComplete()`/`aiVision()`, misma firma que `nimVision`); pasarela de plataforma con
  `AI_GATEWAY_URL` + `AI_GATEWAY_SECRET`, fallback NIM (`NVIDIA_API_KEY`). No importar `nimVision` de `@central/core-ai`
  directamente. `@anthropic-ai/sdk` ELIMINADO. No duplicar agentes existentes (auto-asignación, calidad-fotos, informes,
  cotizador, clasificar-queja, escáner de documentos, briefing-diario, comparar-foto, selección de CVs).

## Mailing en frío (panel SUPERADMIN, GLOBAL: tablas `mailing_*` SIN `empresa_id`)
- Marketing propio de IALIMP (`isSuperadmin()`); cada correo con baja funcional + `List-Unsubscribe`. Cron `/api/superadmin/mailing/cron` (Bearer `CRON_SECRET`) excluye `estado IN ('contactado','interesado','descartado','rebotado')` (lead contactado a mano → registrarlo `contactado`); solo horario laboral Madrid y bajo `max_dia`. Lógica `lib/mailing.ts`, recolectores `lib/google-leads.ts`, tracking público `/api/m/*`, landing → `POST /api/lead-saas`.
- Envs: `MAILING_FROM`/`MAILING_FROM_NAME`, `IALIMP_WHATSAPP`, `MAILING_AVISO_TO`, `RESEND_WEBHOOK_SECRET`, `GOOGLE_PLACES_API_KEY`, `APIFY_TOKEN`. Con IONOS el `from` debe ser un buzón REAL y `max_dia` bajo.

## RR.HH. de la limpiadora
- `@central/module-rrhh` + `module-documental` + `core-firma`; tablas `documentos_limpiadora`/`firmas_limpiadora`/`firma_otps_limpiadora`; `limpiadoras.email` OBLIGATORIO (canal OTP). Libs `lib/firma-limpiadora.ts` (`FIRMA_FROM`), `lib/nomina-pdf.ts`, `lib/expediente-limpiadora.ts`; rutas `/api/l/expediente*` y `/api/admin/limpiadoras/[id]/expediente|nomina`.

## Cómo mantener este archivo
Si cambia una convención, regla de datos o decisión de arquitectura, actualiza este `CLAUDE.md` en el mismo PR. Sin
credenciales: tokens y API keys SIEMPRE en envs de Vercel.
