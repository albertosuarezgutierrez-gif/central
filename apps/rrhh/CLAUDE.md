# CLAUDE.md — RRHH (iarrhh)

Lee este archivo al empezar cualquier sesión sobre esta vertical.

## Qué es
**iarrhh** — Portal del Empleado multi-tenant para RR.HH. (hostelería/turismo). Flujo: el
operador (god-panel de plataforma) da de alta una empresa → los responsables de RR.HH. gestionan
empleados, documentos, solicitudes y nóminas desde `/admin` → el empleado accede a su portal `/e`
con token o PIN.

- URL de producción: `central-rrhh.vercel.app` (proyecto Vercel `central-rrhh`)
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
/login              → autenticación responsable (usuario_rrhh; selector si tiene >1 empresa)
/admin/             → dashboard del responsable
/admin/empleados    → CRUD empleados
/admin/solicitudes  → gestión de solicitudes (vacaciones, permisos…)
/admin/calendario   → calendario de vacaciones/permisos aprobados
/admin/cuenta       → datos de la empresa + documentación de empresa (CIF, escritura, TC2…)
/admin/fichajes     → control de presencia en tiempo real + corrección manual
/admin/obras        → CRUD de centros de trabajo (geovalla lat/lng/radio para fichaje)
/admin/prl          → documentos de Prevención de Riesgos Laborales (autorización maquinaria,
                      entrega EPIs, información de riesgos art.18, acuerdos de confidencialidad
                      RGPD con/sin acceso a datos) — firma doble empresa→empleado
/e/[token]          → portal del empleado (acceso por token único; incluye fichaje GPS)
/api/admin/*        → endpoints protegidos por sesión JWT (responsable), incl. `/api/admin/prl/generar`
                      y `/api/admin/empleados/[id]/documentos/[docId]/descargar-firmado`
                      (fusiona el PDF con el certificado de firma eIDAS art.26, vía pdf-lib)
/api/operador/*     → endpoints protegidos por Bearer (god-panel plataforma)
/api/e/*            → endpoints del portal empleado (auth por token/PIN), incl. `/api/e/fichaje`
/api/auth/seleccionar-empresa → elige empresa activa en el flujo de LOGIN (cuando el responsable tiene varias)
/api/auth/cambiar-empresa  → cambia empresa estando ya autenticado (rota el JWT; usa getSesion())
/api/admin/mis-empresas    → lista empresas del usuario autenticado (para el cambiador en sidebar)
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

## Patrones clave
- `lib/auth.ts` — sesión del responsable (JWT firmado, `requireSecret()` para la clave de firma).
- `lib/empleado-auth.ts` — auth del empleado (token único + PIN hash).
- `lib/tenant.ts` / `lib/empleado-tenant.ts` — resolución del `empresa_id` en cada request.
- `lib/asistente.ts` — asistente IA (convenio, chat) usando `@central/core-ai`.
- `lib/firma.ts` / `lib/firma-publica.ts` — firma de documentos vía `@central/core-firma`.
- `lib/documental.ts` — gestión documental vía `@central/module-documental`.
- `lib/push.ts` — Web Push vía `@central/core-push` (si se activa).
- `lib/branding.ts` — personalización (logo, color) por empresa. `color_primario` en `rrhh.empresas` → Mariscos González `#1B3461`.
- `components/CambiadorEmpresa.tsx` — selector de empresa en sidebar (auto-carga, visible solo si ≥2 empresas). Se auto-incluye en `AdminShell`.
- `lib/plantillas-prl.tsx` — plantillas PDF de PRL (autorización maquinaria, EPIs, riesgos,
  confidencialidad) con `@react-pdf/renderer` (`serverExternalPackages` en `next.config`).
- `lib/certificado-firma.tsx` — genera la página de certificado de firma (eIDAS art.26) que se
  fusiona con el PDF original en la descarga del documento firmado.

## Tests
`vitest run` — los tests viven en `lib/*.test.ts`. Gate de tipos: `tsc --noEmit` (CI).
El build de Vercel ignora errores de tipos (`typescript.ignoreBuildErrors: true`) — el gate
real es el job `typecheck` de `.github/workflows/tests.yml`.

## Comportamientos establecidos
- **Login:** nunca muestra branding de empresa — siempre neutro `ia·rrhh`. El branding entra solo dentro del panel.
- **Multi-empresa:** `rrhh.usuario_empresas` (N:N). Login con 1 empresa → sesión directa. Login con N → selector. Ya autenticado → `CambiadorEmpresa` en sidebar.
- **Fichajes sin obra:** si `obra_id` es null pero hay coordenadas GPS, la columna Obra muestra `📍 Ver mapa` (enlace a Google Maps con `lat_entrada,lng_entrada`).
- **Crons:** deben llevar `Authorization: Bearer CRON_SECRET` (sin User-Agent bypass).

## Reglas heredadas del monorepo
- Secrets que firman/validan sesiones → `requireSecret()`, **sin fallback literal**.
- API keys de servicios externos → pueden caer a `|| ''` (falla la llamada saliente, no la app).
- Scope npm: `@central/*` (nunca `@iarest/*`).
- No poner `apps/` en `.vercelignore` de la raíz.
