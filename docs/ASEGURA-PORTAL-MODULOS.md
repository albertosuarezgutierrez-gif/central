# «Herramientas» del portal del cliente (Grupo ASegura) — hoja de ruta

> Alta: 22/10/2026. Objetivo de Alberto: ofrecer módulos **gratis** a los clientes de la correduría
> para fidelizar y captar (más adelante, quizá de pago). Vive en `apps/asegura-portal` → `/herramientas`.

## Fase 0 — catálogo (HECHA en código, SQL sin aplicar)
- Catálogo cerrado `flota` · `rrhh` · `alquileres` en `packages/module-seguros-portal/src/modulos.ts`
  (`MODULOS_PORTAL` = CHECK del SQL; el test lee el SQL y falla si divergen).
  - **Flota**: `disponible` (botón «Abrir» → `/flota`) si la identidad ya lleva una flota (dueño o jefe,
    `empresasDeFlota()`/`accesosFlota()`); si no, `bajo_solicitud`. Si no se pudo comprobar → «sin comprobar».
  - **RRHH** (Portal del Empleado, `apps/rrhh`): `bajo_solicitud`. **Sin SSO**: el operador da de alta la empresa a
    mano por `/api/operador/empresas` de rrhh; la pantalla lo dice.
  - **Alquileres**: `proximamente` («Apuntarme»).
- Tabla `seguros.portal_modulo` (`apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql`): una fila por
  identidad y módulo, `solicitado` → `activo` → `retirado`, fechas, `version_condiciones`, `origen` (`portal`/`corredor`).
  El rol del portal solo INSERTA `(identidad_id, modulo, version_condiciones)`: **no puede autoactivarse**.
  No se reutiliza `public.tenant_modulos` (es de plataforma, por tenant; el rol del portal no sale de `seguros`).
- Pedir = fila `solicitado` + Telegram a Alberto («🧰 [nombre] pide el módulo X»). La fila es el registro.
- Cola para Alberto: `GET /api/operador/portal-modulos[?todas=1]` en `apps/asegura` (solo lectura).
  **Pendiente:** pantalla en `plataforma` → `/correduria` y el POST de activar/retirar (con `historial_interno`).
  Mientras tanto, se activa por SQL (bloque comentado al final de la migración).

## Fase 1 — gestión de alquileres para grandes tenedores
- Inmuebles con referencia catastral (`core-catastro`, dirección por `core-direccion`: CP → provincia → municipio
  → calle del callejero → número).
- Inquilinos persona o sociedad + email; documental por inmueble/inquilino (`module-documental`, `core-storage`).
- **Recordatorio anual del seguro obligatorio del inquilino**, con subida del justificante **sin cuenta**
  (enlace con token hasheado, patrón `/datos/[token]`).
- Comunicaciones al inquilino con **borrador IA** (`core-ai`) que **revisa y envía el propietario** (`core-email`);
  nunca sale nada solo.
- Firma por OTP (`core-firma` + `core-identity`).
- Fuera de Fase 1 (van a Fase 2): contratos, rentas, impagos y fianzas.

## Ideas aprobadas por Alberto (22/10/2026), por priorizar
- **Segundo cliente interesado: Grupo Elca** (patrimonial, hoy lo lleva en Excel): control de comunidades y gastos
  FIJOS/VARIABLES por inmueble. ⇒ **La Fase 1 incluye control económico por inmueble**, no solo inquilinos y
  documentos. Rescatar lo ya hecho en `apps/ialimp` (parte del propietario) y en `plataforma` → `/sivra`
  (inventario, en curso).
1. **Calendario de obligaciones del inmueble:** ITE/IEE, certificado energético, revisión de ascensor/gas/boletín
   eléctrico, vencimiento de contratos, depósito de la fianza en el organismo autonómico. (Fideliza mucho.)
2. **Avería/siniestro desde el inquilino:** enlace sin cuenta con fotos → al propietario y, si procede, parte a la
   compañía (el siniestro pasa por la correduría).
3. **Alerta de infraseguro por inmueble:** capital asegurado frente a valor de reposición estimado con el Catastro
   (superficie, año, uso) → venta directa.
4. **Rentabilidad por inmueble:** renta − gastos fijos/variables − seguros (sustituye el Excel de Elca).
5. **Facturas de gastos (IBI, comunidad, suministros) SUBIDAS por el cliente:** NO se lee el correo del cliente ni se
   le pide reenviar nada. El cliente sube la factura (foto/PDF) en el portal; la IA la lee y la imputa al inmueble y a
   la categoría de gasto (fijo/variable); el cliente revisa y confirma. Se reutiliza el extractor de facturas ya
   hecho (`apps/plataforma/lib/agente-facturas/extraer.ts`, `extraerDesdeBuffer`, el de la skill `facturas-correo`)
   **sacado a un paquete** compartido. El circuito por correo queda solo para Alberto.
6. **Actualización anual de la renta** con el índice del contrato + carta al inquilino redactada con IA y revisada
   por el propietario (validar los límites legales de actualización antes).
- **Las que más venden: 2 y 3. Las que más fidelizan: 1 y 4.**

## Fase 2 — contabilidad sencilla
- Sobre `module-contabilidad` + `core-fiscal`. **NO es `/finanzas`** de plataforma (esa está atada a Alberto).

## Después — bajo demanda
- Transporte (`module-flota`/`module-transporte`) y almacén (`module-materiales`) si un cliente lo pide.

## Piezas reutilizables
`core-firma`, `core-identity` (OTP), `core-ai`, `core-catastro`, `core-direccion`, `core-storage`, `core-email`,
`module-documental`.

## Riesgos
- **RGPD:** con cada propietario hace falta un **encargo de tratamiento** (art. 28): los datos de sus inquilinos
  son suyos, nosotros tratamos por cuenta suya.
- **El inquilino NO es un lead** sin su consentimiento expreso: no entra en la cartera ni recibe nada comercial.
- **Firma simple sin TSA cualificado:** vale como firma electrónica simple; no es avanzada/cualificada. No venderla
  como lo que no es.
- **Incentivos (ley de distribución de seguros, RDL 3/2020):** revisar antes de anunciar «gratis para clientes»
  que no constituya un incentivo indebido ligado a contratar.

## Preguntas abiertas a Alberto
1. ¿Gratis solo con póliza viva en vigor, o para cualquiera que entre al portal?
2. ¿El inquilino sin cuenta (solo enlace) o con acceso al portal?
3. ¿Remitente de los avisos al inquilino: Grupo ASegura o el propietario?
4. ¿Quién gestiona las altas y el soporte de los módulos?
5. ¿Volumen de Antonio (nº de inmuebles/inquilinos) para dimensionar Fase 1?
