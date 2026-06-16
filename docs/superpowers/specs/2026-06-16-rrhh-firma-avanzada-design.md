# Firma electrónica avanzada (eIDAS art. 26) en iarrhh — Diseño (Fase 2)

> Fecha: 2026-06-16. App: `apps/rrhh` + nuevo paquete `@central/core-firma`.
> Decisión de Alberto: **firma propia** legalmente válida (no Firmafy ahora). Avanzada (no
> cualificada) basta para nóminas/contratos (art. 29 ET + STS 1023/2016). Firmafy queda
> enchufable como otro proveedor del puerto.

## Objetivo

El responsable solicita la firma de un documento del expediente; el empleado lo firma desde su
portal (móvil) con una **firma electrónica avanzada** que cumple las 4 condiciones del art. 26
eIDAS, y queda una **evidencia verificable**.

## Cómo se cumplen las 4 condiciones (art. 26)

- **(a) vinculada al firmante** — el empleado autenticado teclea su nombre completo; se valida
  que coincide con el del titular (`nombreCoincide`) y se guarda `empleado_id`.
- **(b) identifica al firmante** — se guarda nombre + email/DNI del empleado.
- **(c) control exclusivo** — el empleado accede con su **token personal** (credencial que solo
  él posee) y confirma con consentimiento explícito. `metodo = 'sesion_token'`. (OTP por email
  queda como refuerzo futuro: `metodo = 'otp_email'`.)
- **(d) integridad detectable** — al firmar se calcula el **SHA-256 del contenido** del documento
  y se guarda. Cualquier cambio posterior se detecta comparando hashes (`verificarIntegridad`).

## Arquitectura: puerto `@central/core-firma` (puro)

Paquete TS puro (sin BD/Storage/red), consumido por rrhh. Firmafy u otros se enchufan
implementando `ProveedorFirma`.

- `tipos.ts`: `Firmante`, `ContextoFirma`, `MetodoFirma`, `EntradaFirma`, `Evidencia`,
  `ResultadoVerificacion`, `Art26`, `ProveedorFirma`.
- `firma.ts`: `hashDocumento` (SHA-256 vía WebCrypto), `nombreCoincide`, `cumpleArt26`,
  `verificarIntegridad`, `TEXTO_CONSENTIMIENTO`, y `FirmaPropia` (proveedor por defecto).
- Tests (`firma.test.ts`, vitest): hash determinista/SHA-256, coincidencia de nombre, evidencia
  cumple art.26, rechazo si el nombre no coincide, detección de alteración. **9/9 verde.**

## Wiring en `apps/rrhh`

- **DB** (`prisma/migrations/0006_firmas.sql`): tabla `rrhh.firmas` (FK a `documentos`
  ON DELETE CASCADE, `doc_hash`, `metodo`, identidad, ip/ua, `sello_tiempo`, `evidencia` jsonb).
  `documentos.estado_firma`: `no_requiere → pendiente → firmado`.
- `lib/storage.ts`: `descargarObjeto(path)` (bytes con service_role, para hashear).
- `lib/firma.ts`: `solicitarFirma(empresa, empleado, doc)` (gestor → 'pendiente') y
  `firmarDocumento(empresa, empleado, doc, ctx)` (descarga bytes → `FirmaPropia.firmar` → inserta
  `firmas` + `estado='firmado'` en transacción).
- **API:** `POST /api/admin/empleados/[id]/documentos/[docId]/solicitar-firma` (gestor, avisa al
  empleado por push) · `POST /api/e/expediente/[docId]/firmar` `{ nombre_confirmado }` (empleado,
  captura ip/ua, avisa a responsables).
- **UI:** admin `ExpedienteClient` (badge de estado + botón "Solicitar firma"); empleado
  `ExpedienteEmpleado` (badge + botón "Firmar" → modal con consentimiento + teclear nombre).
- `documental.ts`: `listarExpediente` incluye `estado_firma`.

## Qué NO toca

Login, alta de empresas, chat, solicitudes, push existentes. Solo añade el flujo de firma.

## Verificación (hecha)

- **Unit (core-firma):** 9/9 verde.
- **Build rrhh:** verde, rutas `solicitar-firma` y `firmar` presentes.
- **Integración BD:** crear empresa→empleado→documento('pendiente') → insertar evidencia +
  `estado='firmado'` → `integro_original=true`, `integro_si_modificado=false` (alteración
  detectable), cascade al borrar documento. Datos de prueba borrados.
- `hashDocumento` (WebCrypto) == `node:crypto` SHA-256 para los mismos bytes.

## Pendiente

- **Proveedor Firmafy** (cuando Alberto tenga alta/credenciales): nuevo `firmafy.ts` que implemente
  `ProveedorFirma`; el flujo de rrhh no cambia (solo se elige proveedor).
- Refuerzo OTP por email (`metodo='otp_email'`) cuando haya SMTP configurado.
