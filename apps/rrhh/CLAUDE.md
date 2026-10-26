# CLAUDE.md — RRHH (iarrhh)

Lee este archivo al empezar cualquier sesión sobre esta vertical.

## Qué es
**iarrhh** — Portal del Empleado multi-tenant para RR.HH. (hostelería/turismo). Flujo: el
operador (god-panel de plataforma) da de alta una empresa → los responsables de RR.HH. gestionan
empleados, documentos, solicitudes y nóminas desde `/admin` → el empleado accede a su portal `/e`
con token o PIN.

- URL de producción: `empleados.grupoasegura.es` (proyecto Vercel `central-rrhh`; `central-rrhh.vercel.app` redirige 308 salvo `/api/*`)
- Root Directory Vercel: `apps/rrhh` · Install: `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`
- Build: `prisma generate && next build`

## BD y schema
- BD compartida del monorepo (`wswbehlcuxqxyinousql`, Supabase, schema `rrhh`).
- Rol de BD: `rrhh_app` con `BYPASSRLS` (aislamiento por `empresa_id` en capa de aplicación).
- Envs: `DATABASE_URL` / `DIRECT_URL` (Supabase pooler / directo).
- ORM: Prisma (`prisma/schema.prisma`). Modelos principales: `empresas`, `usuarios_rrhh`,
  `empleados`, `documentos`, `solicitudes`, `usuario_empresas` (N:N responsable↔empresa),
  `empresa_documentos`, `obras` (geovalla), `fichajes`.
- Las migraciones van a la BD compartida — coordinar con ialimp/sivra/plataforma si afectan
  al schema `public`.

## Alta de empresas desde plataforma
El god-panel de plataforma crea empresas vía HTTP:
`POST /api/operador/empresas` (Bearer `RRHH_OPERADOR_SECRET`).
- `lib/operador.ts` verifica el secret con `requireSecret()` de `@central/core-identity`.
- **NUNCA** añadir fallback literal a `RRHH_OPERADOR_SECRET` (regla de secrets del monorepo).

## Estructura de rutas
```
/login              → responsable (26/10/2026): correo → código de 6 dígitos (o «Entrar con contraseña» OPCIONAL, SOLO para los
                      correos de la env `RRHH_LOGIN_PASSWORD_EMAILS` —sin ella, nadie y sin botón—: bcrypt contra `pass_hash`,
                      `lib/acceso-password.ts`, respuesta uniforme siempre tras un bcrypt, topes EN BD 5 fallos/15 min por correo
                      y 30 por IP en `acceso_otps` con prefijo propio (`lib/acceso-password-repo.ts`), `/api/auth/acceso/password`) → [selector si >1 empresa, salvo que la última recordada siga autorizada]
                      → casilla «Recordar este dispositivo» = sesión de 90 días en vez de 30 (cookie y JWT, claim `rec`).
                      Formulario compartido con /e/entrar: `components/AccesoOtp.tsx`.
                      → `rrhh_session` (`typ:'responsable'`+jti). `lib/acceso-responsable.ts` usa el núcleo de
                      `acceso-email.ts` (`pedirCodigo`/`canjearCodigo`, misma tabla `acceso_otps`) con propósito
                      'responsable' en el prefijo de los HMAC: un código de /e/entrar no abre /login ni al revés.
                      Rutas `/api/auth/acceso/{solicitar,verificar}`. Los `pass_hash` heredados (pre-#5103) NO valen fuera de la lista.
                      `getSesion` revalida EN BD cada petición (fail-closed): jti vigente (NULL no vale; «Salir» lo rota) y
                      empresa del token en `usuario_empresas` (ÚNICA fuente; el alta inserta la fila). `lib/sesion-responsable-vigencia.ts`.
/admin              → Inicio del responsable: pendientes (solicitudes por aprobar, firmas, avisos/correos fallidos, fichajes
                      abiertos). `lib/inicio-admin.ts` (SELECT, `null` = «no se sabe») + `lib/inicio-admin-reglas.ts` (puro)
/admin/empleados    → CRUD empleados
/admin/solicitudes  → gestión de solicitudes (vacaciones, permisos…)
/admin/calendario   → calendario de vacaciones/permisos aprobados
/admin/cuenta       → AJUSTES de empresa: logo/color de PDF, convenio y documentación de empresa (CIF, escritura, TC2…).
                      `/admin/empresa` solo redirige aquí (era un duplicado). `/admin/calendario` es una pestaña de Solicitudes.
/admin/fichajes     → control de presencia en tiempo real + corrección manual
/admin/obras        → CRUD de centros de trabajo (geovalla lat/lng/radio para fichaje)
/admin/prl          → documentos de Prevención de Riesgos Laborales (autorización maquinaria,
                      entrega EPIs, información de riesgos art.18, acuerdos de confidencialidad
                      RGPD con/sin acceso a datos) — firma doble empresa→empleado
/admin/informes     → informes de todas las entidades (catálogo declarativo `lib/informes/catalogo.ts`
                      + motor puro `motor.ts` + SQL por entidad `consultas.ts`, SIEMPRE con empresa_id de
                      sesión); vista previa y descarga Excel (xlsx/SheetJS) / PDF (@react-pdf) / CSV.
                      Entidad nueva = entrada en el catálogo + su consulta (lo vigila `consultas.test.ts`)
/e/entrar           → entrada normal del empleado: email → código de 6 dígitos (10 min, 5 intentos) →
                      [elegir empresa si el email está en varias] → [PIN si lo tiene] → cookie 90 días.
                      Lógica en `lib/acceso-email.ts` (código: `@central/core-identity/codigo-otp`, el
                      mismo del portal de la correduría); tabla `rrhh.acceso_otps` (migración 0021).
/e/[token]          → alternativa por ENLACE para empleados sin email (+PIN si lo tiene); misma sesión
/e                  → portal del empleado (incluye fichaje GPS). Sesión revocable: `empleados.sesion_version`
                      («Cerrar sesiones» y «Nuevo enlace» en la ficha la suben; `getSesionEmpleado` la mira en BD)
/api/admin/*        → endpoints protegidos por sesión JWT (responsable), incl. `/api/admin/prl/generar`
                      y `/api/admin/empleados/[id]/documentos/[docId]/descargar-firmado`
                      (fusiona el PDF con el certificado de firma eIDAS art.26, vía pdf-lib)
/api/operador/*     → endpoints protegidos por Bearer (god-panel plataforma)
/api/e/*            → endpoints del portal empleado (auth por token/PIN), incl. `/api/e/fichaje`
/api/auth/seleccionar-empresa → elige empresa activa en el flujo de LOGIN (cuando el responsable tiene varias)
/api/auth/cambiar-empresa  → cambia empresa estando ya autenticado (rota el JWT; usa getSesion())
/api/admin/mis-empresas    → lista empresas del usuario autenticado (para el cambiador en sidebar)
/admin/documentos · /admin/firmas → envío asistido/masivo y panel de firmas pendientes (ver sección propia)
```

## Packages consumidos (transpilePackages)
`@central/core-ai`, `@central/core-email`, `@central/core-firma`, `@central/core-storage`,
`@central/core-identity`, `@central/legal-templates`, `@central/module-documental`,
`@central/module-rrhh`, `@central/module-chat`, `@central/module-nominas`, `@central/module-geo`,
`@central/module-horario`, `@central/core-telegram` (aviso de fichajes abiertos, 16/07/2026).

## Crons (`vercel.json`)
- `/api/cron/nominas` — mensual (día 25, 08h).
- `/api/cron/recordatorio-fichaje` — L-V 9h (hora ES): push a empleados que aún no han fichado entrada.
- `/api/cron/alerta-fichajes-abiertos` — diario 22h (hora ES): Telegram si un fichaje activo lleva
  >10h sin fichar salida.
- `/api/cron/recordatorio-firmas` — diario 8h UTC: recuerda firmas pendientes a los 3 y 7 días y luego semanal
  (regla pura `lib/recordatorios-firma.ts`; idempotente por índice único documento+día en `rrhh.avisos`).

## Envío de documentos, avisos y firmas pendientes (20/10/2026, migración `0023_avisos_firma.sql`)
- `/admin/documentos`: Pilar sube 1..N archivos al staging (`staging/<empresa_id>/…`, validado con `esPathStagingDe`);
  la IA (`lib/asistente-subida.ts`, catálogo cerrado; a la IA NO se le manda la plantilla) PROPONE tipo/carpeta/título/
  firma/resumen y los destinatarios se emparejan en código por NIF > nombre completo único (nunca se funden). Nada se
  asigna ni avisa hasta «Confirmar»: una copia (objeto + fila) por empleado o toda la plantilla (`lib/envio-documentos.ts`).
  - Solo se PRESELECCIONA a quien la IA marca como trabajador en `personas` (`clasificarDestinatarios`); el resto de
    coincidencias (p. ej. el representante en plantilla) va a «Revisa a mano» sin marcar. Sin IA, nadie preseleccionado.
  - Idempotente: `envio_id` lo genera el CLIENTE por documento; índice único `(envio_id, empleado_id)` + ON CONFLICT.
    Tamaño/tipo salen del objeto real del staging (HEAD), nunca del cliente. Sin firma en `formacion`/`datos_personales`
    (`carpetaAdmiteFirma`). `documentos.avisar=false` → firmar-empresa no avisa (NULL = anterior: avisa).
  - El cron `recordatorio-firmas` borra el staging de > 48 h (por empresa, solo `staging/<empresa>/`). Un aviso con
    `email_estado` NULL de > 1 h no cuenta como contacto (`ultimoContactoEfectivo`).
- Avisos (`lib/avisos.ts`, tabla `rrhh.avisos`): intranet + email + push con el resultado de cada canal registrado; un
  fallo de email no tumba la solicitud. Saltan al solicitar firma, al subir con «solo firma el empleado», al firmar la
  empresa y al «Reclamar». El empleado los ve en `/e` y abrir el documento los marca vistos (`documentos.visto_empleado_at`).
- `/admin/firmas`: panel paginado (50 + «Ver más») con demora, visto, último aviso y contacto. `firma_solicitada_at` NULL
  (docs anteriores a 0023) = «no se sabe»: la demora se cuenta desde la subida y el cron NO los reclama hasta un «Reclamar».

## Patrones clave
- `lib/auth.ts` — sesión del responsable (JWT firmado, `requireSecret()` para la clave de firma).
- `lib/empleado-auth.ts` — sesión del empleado (`typ:'empleado'`, sin jti, con versión `v`) y ticket del paso
  intermedio. 🚨 Comparte `JWT_SECRET` con el responsable: `lib/auth.ts` solo acepta `typ:'responsable'` + `jti`
  (lista blanca, cepo `lib/auth-separacion.test.ts`; antes una cookie de empleado pegada en `rrhh_session` abría el panel — 05/10/2026).
- `lib/tenant.ts` / `lib/empleado-tenant.ts` — resolución del `empresa_id` en cada request.
- `lib/asistente.ts` — asistente IA (convenio, chat) usando `@central/core-ai`.
- `lib/firma.ts` / `lib/firma-publica.ts` — firma de documentos vía `@central/core-firma`.
- `lib/documental.ts` — gestión documental vía `@central/module-documental`.
- `lib/push.ts` — Web Push vía `@central/core-push` (si se activa).
- `lib/branding.ts` — personalización (logo, color) por empresa. `color_primario` en `rrhh.empresas` → Mariscos González `#1B3461`.
- `components/CabeceraApp.tsx` — cabecera COMÚN de `/e` y `/admin` (26/10/2026): «[logo cliente] con Grupo ASegura» · selector de
  empresa (≥2, `<select>` de 44 px) · botones «Herramientas» (esta app, activa) y «Seguros» (`urlPortalAsegura`: SOLO el correo +
  `origen=rrhh`; los datos de RR.HH. no se usan comercialmente) · Salir. Se recuerda la última empresa en la cookie
  `rrhh_ultima_empresa` (`lib/sesion-responsable-reglas.ts`, siempre revalidada contra `usuario_empresas`).
- **Marca ÚNICA Grupo ASegura (26/10/2026):** `app/layout.tsx` inyecta `emitirRootCss(MARCA_ASEGURA)` de `@central/brand`; Tailwind lee
  esas variables (`tailwind.config.ts`, con canal alfa vía `color-mix`). Sin beige/teal/serif ni hex a mano. 🚨 La env
  `RRHH_EMPRESAS_MARCA_ASEGURA` YA NO SE LEE (puede seguir puesta sin efecto). El color de la empresa solo pinta sus PDF; la UI
  cambia solo el logo. Cepos: `lib/tema-tailwind.test.ts` (compila el tema; falla con clases sin CSS, paleta cruda, `italic`,
  `min-h` < 44 px) y `lib/marca-asegura.test.ts`.
- Capa `components/ui/`: `Page`, `Card`, `Tabla`, `Boton` (≥44 px), `Chip`, `Modal`, `Aviso`. Usarlas antes de repetir clases.
- **Marco del panel (20/10/2026):** `app/admin/layout.tsx` monta `AdminShell` UNA vez con el branding de la empresa de la
  sesión; el menú (`components/AdminNav.tsx`, Inicio + Personas/Documentos/Tiempo/Empresa) marca la ruta activa con
  `usePathname`. 🚨 El layout NO es barrera: cada `page.tsx` sigue llamando a `getSesion()` y filtrando por su
  `empresa_id` (cepo `lib/admin-guardas.test.ts`). Pantallas nuevas: `components/ui/Page` (título/acciones;
  `ancho="formulario"` = max-w-2xl), `Card` y `Tabla` (envuelve `.tabla-cards`) — no repetir las clases a mano.
- `lib/plantillas-prl.tsx` — plantillas PDF de PRL (autorización maquinaria, EPIs, riesgos,
  confidencialidad) con `@react-pdf/renderer` (`serverExternalPackages` en `next.config`).
- `lib/certificado-firma.tsx` — genera la página de certificado de firma (eIDAS art.26) que se
  fusiona con el PDF original en la descarga del documento firmado.

## Tests
`vitest run` — los tests viven en `lib/*.test.ts`. Gate de tipos: `tsc --noEmit` (CI).
El build de Vercel ignora errores de tipos (`typescript.ignoreBuildErrors: true`) — el gate
real es el job `typecheck` de `.github/workflows/tests.yml`.

## Comportamientos establecidos
- **Login:** nunca muestra branding de EMPRESA (aún no se sabe cuál); siempre la marca Grupo ASegura (pantalla y correo del código).
  `/api/auth/acceso/solicitar` deja en el log un `console.warn` (correo ENMASCARADO) si no casa con ningún responsable y un
  `console.error` si el envío falla; la respuesta al usuario es siempre la misma.
- **Multi-empresa:** `rrhh.usuario_empresas` (N:N). Código con 1 empresa → sesión directa. Login con N → selector. Ya autenticado → selector en `CabeceraApp`.
- **Fichajes sin obra:** si `obra_id` es null pero hay coordenadas GPS, la columna Obra muestra `📍 Ver mapa` (enlace a Google Maps con `lat_entrada,lng_entrada`).
- **Crons:** deben llevar `Authorization: Bearer CRON_SECRET` (sin User-Agent bypass).

## Responsive (medido 24/09/2026, PRs #3459 y #3463)
- **Tablas → cards en móvil:** clase `.tabla-cards` en la `<table>` + `data-label="…"` en cada `<td>`
  (`app/globals.css`). Por debajo de 768 px cada `<tr>` es una tarjeta: 1.ª celda = título, celdas sin
  etiqueta = acciones a la derecha, `colspan` (edición/historial) a todo ancho. El `min-w-[…]` de la tabla
  va con prefijo `md:`; sin él, la card no cabe. Tabla nueva con más de 3 columnas → mismo patrón.
- **`AdminShell`:** columna de contenido `minmax(0,1fr)` (con `1fr` una tabla ancha ensancha la página);
  en móvil el `nav` va en su propia fila — compartiéndola con `CambiadorEmpresa` quedaba a 0 px (sin menú).
- **Controles:** `globals.css` limita `input/select/textarea` a `max-width:100%; min-width:0` y da 44 px de
  alto en `pointer:coarse`. Un `<button>` sin `bg-*` hereda el teal global: pon `bg-transparent` si no es CTA.
- **Verificar:** banco temporal en `app/zzh/[p]/page.tsx` que monta los `*Client` con datos ficticios +
  Playwright con `page.route('**/api/**')`; medir `scrollWidth` y los hijos cuyo `right` se salga. No commitear el banco.

## Reglas heredadas del monorepo
- Secrets que firman/validan sesiones → `requireSecret()`, **sin fallback literal**.
- API keys de servicios externos → pueden caer a `|| ''` (falla la llamada saliente, no la app).
- Scope npm: `@central/*` (nunca `@iarest/*`).
- No poner `apps/` en `.vercelignore` de la raíz.
