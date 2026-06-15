# Diseño — `apps/rrhh` · Portal del Empleado / RR.HH.

> Fecha: 2026-06-15 · Estado: **spec aprobado pendiente de revisión** · Rama: `claude/bold-ride-s4s8eq`
> Origen: petición de Pilar (responsable RR.HH. de Mariscos González) vía audio. Decisiones de alcance tomadas con Alberto en sesión del 15/06/2026.

## 1. Resumen

Nueva **vertical** de la casa de marcas: una **intranet de RR.HH. multi-tenant** ("Portal del Empleado").
La empresa cliente gestiona a sus empleados, su documentación clasificada por expediente, la
comunicación interna y la **firma electrónica** de documentos laborales (LOPD, contratos, etc.).

- **Cliente piloto:** Mariscos González (responsable: Pilar).
- **Producto, no proyecto a medida:** se onboardarán **varias empresas** de distinto tipo (p. ej. JJ,
  bares…). Multi-tenant por `empresa_id` desde el día 1.
- **Encaje en la matriz:** `apps/rrhh` con su `package.json`/`vercel.json`, proyecto Vercel propio con
  Root Directory `apps/rrhh`, install `--legacy-peer-deps`. Consume `packages/@central/*`. Sigue el
  patrón de `ialimp` (Next 15, Prisma + `$queryRaw`, Supabase, auth JWT multi-tenant, PWA).

### Lo que pidió Pilar (requisitos de origen)
1. Intranet para gestionar empleados.
2. Los empleados acceden a documentos que ella sube; y ellos pueden enviarle documentos (parte médico,
   solicitar vacaciones o permisos retribuidos…).
3. Todo clasificado por **expediente de cada trabajador**, con carpetas: datos personales, contratos,
   nóminas y demás.
4. **Chat** (mensajería interna tipo WhatsApp).
5. **Envío de documentación con notificación para que la firmen.**

## 2. Roles y acceso

Dos tipos de usuario (patrón espejo de `ialimp`: admin de empresa + trabajador):

- **Responsable RR.HH.** (Pilar) → panel web `/admin`. Auth email + contraseña (bcrypt), sesión JWT
  con `empresa_id`. Da de alta empleados, sube documentos, gestiona expedientes, envía a firmar,
  chatea, aprueba solicitudes.
- **Empleado** → web móvil `/e` (PWA, sin instalar). Acceso por **enlace mágico** (token) y/o **PIN**
  (patrón `limpiadora-auth`). Ve **solo su propio expediente**, sube sus documentos, firma en el móvil,
  chatea con RR.HH., solicita vacaciones/permisos.

## 3. Aislamiento de datos (RGPD)

**Proyecto Supabase propio para `rrhh`** (no se reutiliza el proyecto compartido de ialimp/sivra/plataforma).

Motivo: el producto maneja **datos de salud** (partes médicos / bajas = categoría especial, art. 9 RGPD) y
va a crecer en clientes. Un proyecto dedicado da: blast-radius RGPD acotado, backups y rotación de claves
independientes, RLS propia y posibilidad de DPA separado. La multi-tenencia se resuelve **dentro** con
`empresa_id` + RLS. Se monta ahora (sin clientes) por el principio de la matriz: los cimientos se hacen ya.

- Buckets de Storage **privados**; acceso siempre por **signed URL** vía `@central/core-storage`.
- **Minimización**: los partes de baja **no** deben almacenar el diagnóstico médico.
- Como SaaS somos **encargados del tratamiento** (art. 28 RGPD) de cada empresa cliente → contrato de
  encargo por tenant. Valorar EIPD (art. 35) por el tratamiento de datos de salud a escala.

## 4. Modelo de datos (schema propio, multi-tenant por `empresa_id`)

- **`empresas`** — tenant: nombre, marca (logo/color para white-label), certificado de sello (fase 2), config.
- **`usuarios_rrhh`** — responsables de RR.HH. de cada empresa (email, pass_hash, rol, `session_jti`).
- **`empleados`** — empresa_id, nombre, DNI, email, teléfono, puesto, fecha_alta, estado, `acceso_token`,
  `pin_hash`.
- **`documentos`** — empresa_id, empleado_id, **carpeta** (categoría), nombre, url (bucket privado), tipo,
  tamaño, **`subido_por`** (`responsable` | `empleado`), caducidad, `estado_firma`
  (`no_requiere` | `pendiente` | `firmado`), notas, creado_at.
- **`solicitudes`** — empresa_id, empleado_id, tipo (`vacaciones` | `permiso_retribuido` | `parte_medico`
  | `baja` | `otro`), fecha_inicio, fecha_fin, motivo, adjunto_url, estado
  (`solicitada` | `aprobada` | `rechazada`), resuelta_por, resuelta_at.
- **`firmas`** — documento_id, firmante (empleado o empresa), tipo (`empleado_avanzada` | `empresa_sello`),
  otp_verificado, ip, user_agent, sello_tiempo, hash_documento, proveedor, proveedor_ref, audit_trail (jsonb).
- **`chat_hilos` / `chat_mensajes`** — portado del modelo de ialimp (responsable ↔ empleado, leídos, contexto).
- **`push_subscriptions`** — empresa_id, empleado_id, endpoint, p256dh, auth_key (Web Push).

### Carpetas del expediente y permisos por carpeta

Cada empleado tiene un expediente con carpetas fijas. El empleado **solo ve su propio expediente**.

| Carpeta | Empresa | Empleado |
|---|---|---|
| `datos_personales` | subir / ver / borrar | **subir** + ver lo suyo |
| `contratos` | subir / ver | **solo ver** |
| `nominas` | subir / ver | **solo ver / descargar** |
| `partes_medicos` | ver | **subir** + ver lo suyo |
| `otros` | subir / ver | ver (configurable) |

Implementación: flag `empleado_puede_subir` por carpeta. `contratos` y `nominas` son unidireccionales
(empresa → empleado). Trazabilidad vía `documentos.subido_por`.

## 5. Núcleo nuevo: `packages/core-firma` (puerto + adaptadores)

Núcleo **puro** (como `core-storage`), identity-agnostic, con dos operaciones detrás de un puerto:

- **`solicitarFirma(documento, firmante)`** → **firma avanzada del empleado** (eIDAS art. 26):
  identificación por **OTP** (email/SMS = control exclusivo), captura de aceptación/gesto, **hash** del
  documento, **sellado PAdES**, audit trail (IP, dispositivo, timestamp, eventos). Firma múltiple
  permitida (la firma del empleado se añade **encima** del sello de empresa sin invalidarlo).
- **`sellarDocumento(documento, empresa)`** → **sello/firma de la empresa** (PAdES con el certificado de
  la empresa). Prueba origen + integridad. Custodia de clave privada en **KMS/HSM**.

Adaptadores:
- **`firmafy`** (inicial, fase 2): REST + token + webhooks. Firma avanzada biométrica + 6 evidencias +
  sello de tiempo + custodia 10 años. Requiere plan Enterprise anual o Ad-Hoc (pendiente cotización partner).
- **`self`** (futuro, fase 4): PAdES propio + **sello de tiempo cualificado RFC 3161** de un QTSP
  (Uanataca/FNMT). ~90% del valor probatorio sin coste por firma. Decisión reversible sin tocar la vertical.

### Marco legal (fija el nivel de firma)
Para documentos laborales internos (LOPD, contrato, nóminas, comunicaciones) **basta firma avanzada**
(eIDAS art. 26); **no** hace falta la cualificada (cara). La cualificada solo aporta equivalencia automática
a manuscrita (art. 25) e inversión plena de la carga de la prueba (art. 326.4 LEC). Para nóminas, la firma
es **acuse de recibo** (art. 29 ET; STS 1023/2016 avala el soporte solo informático). Conservar siempre:
identidad del firmante + sello de tiempo + hash/integridad + audit trail.

## 6. Flujos clave

- **Alta de empleado:** Pilar crea el empleado → enlace mágico de acceso → al entrar ve sus documentos de
  onboarding (LOPD, contrato, políticas) **ya sellados por la empresa** → los **firma en el móvil con OTP**
  → quedan en su expediente con doble firma + evidencias.
- **Documento entrante del empleado:** sube parte médico/justificante desde el móvil → carpeta correspondiente
  → **notifica a RR.HH.** (push + email).
- **Documento informativo (nómina):** la empresa sube → notifica al empleado ("nueva nómina disponible").
- **Solicitud:** empleado pide vacaciones/permiso/parte médico → RR.HH. recibe notificación → aprueba/rechaza
  → se notifica al empleado.
- **Chat:** mensajería interna responsable ↔ empleado, con push.

Notificaciones: **Web Push** (`@central/core-push` + service worker portado de sivra/ia-rest) + **email**
(`@central/core-email`).

## 7. Reutilización (no se reescribe)

- `packages/@central/*`: `core-storage` (signed URLs), `core-push` (Web Push), `core-email`,
  `core-identity` (sesión/inquilino). **Nuevo:** `core-firma`.
- Patrones a portar de `ialimp`: chat por hilos, componente de documentos por categoría + caducidad,
  alta de personas + acceso por enlace/PIN (`limpiadora-auth`), white-label por empresa (`branding`),
  service worker de push (de `sivra`/`ia-rest`), `FirmaPad.tsx` (canvas táctil) como base de la firma móvil.

## 8. Fases de entrega

- **Fase 1 — Cimiento:** scaffold `apps/rrhh` + proyecto Supabase propio + auth (responsable + empleado
  móvil) + empleados + expediente con carpetas + subida bidireccional con permisos por carpeta +
  notificaciones (push + email) + PWA.
- **Fase 2 — FIRMA (prioritaria):** `core-firma` (puerto) + adaptador **Firmafy** + flujo
  envío → notificación → firma en móvil + registro probatorio (`firmas`) + **sello de empresa**.
- **Fase 3:** chat interno (portado de ialimp) + solicitudes self-service (vacaciones/permisos/parte médico
  con aprobación).
- **Fase 4 (futuro):** adaptador de firma **self-hosted** (PAdES + RFC 3161) + analítica/panel.

## 9. Fuera de alcance (YAGNI por ahora)

- Fichaje horario, nóminas (cálculo), evaluación de desempeño → no es un competidor de Factorial/Sesame.
- Firma **cualificada** eIDAS (no necesaria para documentos laborales internos).
- App nativa (es PWA / web móvil).
- Precio/planes al cliente: **pendiente**, se decide aparte (no bloquea el diseño técnico).

## 10. Decisiones abiertas / pendientes

- **Precio** a cliente (modelo por tramos de empleados + firmas incluidas) — diferido por Alberto.
- **Cotización de partner** a Firmafy (condiciones multi-empresa/reventa, coste por envío) antes de cerrar
  el adaptador de fase 2.
- Provisión del **proyecto Supabase propio** (crear instancia, env vars, RLS base).
