# Roadmap — RR.HH. como capacidad compartida de la casa de marcas

> **Qué es esto:** el banco de ideas / roadmap del módulo **`@central/module-rrhh`** (RR.HH.
> reutilizable por cualquier vertical + cliente directo). La base ya está construida (Fases 0–3:
> firma eIDAS + OTP owner-agnóstica, nóminas PDF, expediente, identidad `persona_id` cross-vertical,
> consolidación en `plataforma`). Esto es lo que falta para que sea **completo y vendible**.
> Estado vivo en `docs/CONTEXTO-SESIONES.md`; arquitectura en `docs/ARQUITECTURA-casa-marcas.md`.

## ⭐ Top prioridad (máximo ROI / diferenciación — reutilizan piezas ya construidas)

1. **Asistente IA de RR.HH. para el trabajador** 🚀
   La limpiadora/empleado pregunta por chat (o WhatsApp) *"¿cuántos días de vacaciones me quedan?"*,
   *"¿cuándo cobro?"*, *"mándame mi última nómina"*. **Reusa `@central/core-ai`** (ya existe) sobre el
   expediente + datos de nómina. **Multi-idioma de regalo** → resuelve el problema de limpiadoras no
   hispanohablantes sin traducir ninguna UI. Diseño: tool-calling sobre `expediente-limpiadora` /
   `rrhh.documentos`, scoped por `persona_id`/`limpiadora_id`.

2. **Verificación pública por QR (no repudio)** 🚀
   Cada nómina/documento firmado lleva un **QR → URL pública** que muestra *"firmado por X el día Y,
   hash Z, sello TSA"*. Es el **mismo patrón QR/VeriFactu de ia-rest** aplicado a RR.HH. Oro para
   inspección y gestoría. Diseño: ruta pública `/v/[hash]` que lee `core-firma` (evidencia) sin auth.

3. **Plantillas legales versionadas centralizadas** 🛡️
   `packages/legal-templates`: contrato, art. 28 RGPD, política de datos, código de conducta con
   **versión**. Cambia la ley → todas las verticales/empresas heredan la nueva y se dispara
   **re-firma**. Compliance-as-a-service. Diseño: plantilla → render → documento → firma+OTP existente.

## 🔴 Cumplimiento obligatorio (lo que hace al RR.HH. "completo")

- **Registro de jornada / fichaje** (RD 8/2019). En ialimp `partes_trabajo` ya es casi un fichaje;
  en rrhh clock-in/out. Feature estrella.
- **Fichaje con geolocalización en el piso** — ialimp ya conoce los pisos; la limpiadora ficha en el
  inmueble (anti-fraude). Engancha con `partes_trabajo`.
- **Sello de tiempo cualificado (TSA)** — su mayor valor es **sellar el fichaje** (registro de horas
  inalterable y no repudiable) → base para la **métrica de productividad de JJ** e inspección.
  Secundariamente blinda la firma avanzada eIDAS frente al simple OTP+email.
- **Contrato de encargo de tratamiento (art. 28 RGPD)** por empresa (iarrhh = encargado, empresa =
  responsable).
- **Canal de denuncias (Ley 2/2023)** — obligatorio para empresas >50 empleados; módulo vendible.
- **Informe oficial de registro horario para la ITSS** — export RD 8/2019 (conservación 4 años) en el
  formato que pide la Inspección, inalterable con TSA.
- **Modelo 145 (IRPF / situación familiar)** al onboarding, firmado y recurrente anual → la gestoría
  calcula bien la retención.
- ~~**PRL + entrega de EPIs**~~ ✅ **HECHO (15/07/2026, PRs #908/#912/#913).** Módulo `/admin/prl`:
  autorización de uso de maquinaria (Art. 17 LPRL/RD 1215/1997, firma doble empresa→empleado),
  entrega de EPIs (RD 773/1997), información de riesgos (art. 18 LPRL) y acuerdos de confidencialidad
  con/sin acceso a datos (RGPD art. 29/LOPDGDD art. 5). Descarga del documento firmado con certificado
  de firma adjunto (eIDAS art. 26). Sigue pendiente el **contrato de encargo de tratamiento (art. 28
  RGPD)** de la fila de abajo — es un documento distinto (empresa=responsable / iarrhh=encargado, no
  un acuerdo de confidencialidad del empleado).
- **Alerta de caducidad de NIE / permiso de trabajo** — para trabajadores extranjeros; evita sanción
  a la empresa. Encaja en el campo `caducidad` que ya existe.
- **Anonimización / borrado RGPD automatizado a la baja** — al dar de baja, programa el borrado del
  dato personal tras el periodo de retención legal, conservando lo que la ley obliga.

## 🟠 Monetización / consolidación de la casa de marcas

- **Coste laboral real en `plataforma`** — la nómina (que vive en cada vertical) se sube como **línea
  de gasto automática** al P&L consolidado por negocio (plataforma ya hace `v_contab_pyg` de ialimp +
  `gastos` de sivra). Cierra el loop *ingreso del piso vs coste de la limpiadora*.
- **"Mi carpeta" unificada del trabajador vía `persona_id`** — hoy `persona_id` solo consolida en el
  god-panel (lectura operador). Darle la vuelta: que **la propia persona** vea UN expediente con TODAS
  sus nóminas/docs (ialimp + rrhh) en un portal. Es el SSO real + gancho para el login
  email/contraseña ya decidido.
- **Dashboard de productividad (idea JJ) como producto** — el entregable vendible es el panel €/hora,
  horas/piso, ranking (no el fichaje en bruto). Se nutre del fichaje+TSA.
- **Pago real de la nómina (Stripe Connect / banca)** — cierra el loop *nómina → pago*. Stripe MCP
  disponible; "Banca" ya está en el sidebar de plataforma.
- **Portal de la gestoría (rol externo)** — login de gestoría que ve solo lo suyo (nóminas, modelos,
  altas/bajas) across empresas que gestiona. Producto B2B2B. Incluye export/import A3/Sage.
- **Cesión de personal entre verticales vía `persona_id`** 🔮 — una persona dada de alta en ialimp
  puede "prestarse" a otra vertical sin re-alta. Ventaja única que un RR.HH. suelto no puede ofrecer.

## 🟡 Operativa real (pisos turísticos / ialimp)

- **Finiquito automático al dar de baja** — días de vacaciones pendientes + parte proporcional + carta
  de baja a firmar. Reusa `nomina-pdf` + firma.
- **Onboarding self-service por enlace mágico + DNI selfie** — la limpiadora se da de alta ella misma
  (datos + sube DNI + firma contrato) sin que el admin teclee nada. Clave para altas masivas.
- **KYC ligero en el alta** — foto del DNI/NIE + hash sellado, para reforzar el valor probatorio de la
  firma avanzada (eIDAS art. 26 exige vincular identidad).
- **Bonus por productividad atado a fichaje + reseñas** — cruza el fichaje sellado con la calidad
  (sivra ya tiene reseñas/mensajería de huéspedes): la que mantiene limpieza bien valorada gana un plus.
- **Suplencias / cobertura de bajas** — cuando una limpiadora está de baja/vacaciones, el sistema
  sugiere quién cubre cruzando disponibilidad + pisos asignados.
- **Anticipos de nómina** — pide adelanto → el dueño aprueba → se descuenta en la nómina.
- **Recibo de custodia de llaves/material por piso firmado** — la limpiadora firma la recepción de
  llaves de cada inmueble (responsabilidad/custodia). Reusa firma+OTP.
- **Aprobación mensual del propietario → factura** — a fin de mes se le envía el resumen de servicios,
  el propietario da OK y eso dispara la generación de factura + cargo (sustituye la firma por parte,
  que el dueño no va a validar). Cierra el loop de cobro de ialimp.
- **Avisos push "nómina por firmar"** — reusa `@central/core-push` (ialimp ya lo consume). Coste casi
  nulo, sube la tasa de firma.

## 🟢 Transversal (toda vertical + cliente directo)

- **Vacaciones / ausencias** — la tabla `rrhh.solicitudes` ya existe; extender a limpiadoras.
- **Onboarding digital** — al alta, firma de contrato + política de datos + código de conducta
  (reusa firma+OTP). Encaja con plantillas legales versionadas (top-3 #3).
- **Caducidades con alerta** (contratos temporales, PRL, reconocimientos médicos) — `caducidad` existe.
- **Comunicados / tablón** + **multi-idioma** — el asistente IA (top-3 #1) cubre buena parte.
- **Marca / white-label + PWA + login email/contraseña** (decidido para la intranet de empleado de
  rrhh) — aplica igual a las limpiadoras.
- **Encuesta de clima / NPS del empleado** — pulso periódico anónimo; módulo blando vendible.
- **Exportar expediente completo (ZIP)** — portabilidad RGPD / baja de la limpiadora (reusa
  `core-storage`).
- **Contrato autogenerado al alta** desde plantilla → directo a firmar en el onboarding.
- **Integración SEPE / Sistema RED (TGSS)** 🔮 — altas/bajas en Seguridad Social. Grande, pero es el
  santo grial de un RR.HH. "completo".

---

## Decisiones cerradas (16/06/2026)

- **Email del trabajador → OBLIGATORIO** (requerido para el OTP de firma).
- **Remitente del OTP → reusar el de ia.rest (`hola@`, verificado en Resend/Gmail)**, parametrizado en
  `FIRMA_FROM` para migrar a la marca principal a medio plazo sin tocar la lógica de firma.
- **TSA**: su valor principal es el **fichaje** (productividad de JJ), no la firma de la nómina.
- **Propietario**: NO firma cada parte; se le manda **resumen mensual → OK → factura + cargo**.
