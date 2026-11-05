# CLAUDE.md — apps/taller (vertical Taller de vehículos, piloto Global 2)

> Gestión de taller **regalada** a talleres (recepción, presupuesto, orden de trabajo, avisos). Piloto:
> **Talleres de Automoción G2** (Camas, Sevilla). Spec única: `docs/superpowers/specs/2026-11-04-taller-global2.md`.
> Compone el módulo puro `@central/module-taller` (sin BD). Schema `taller` (SQL en `prisma/sql/`) y rol `prisma_taller`.

## Reglas
- **Multi-taller desde el inicio:** toda lectura/escritura lleva `taller_id`; la clave de negocio es la matrícula.
- **Marca (04/11/2026, misma sintonía que rrhh):** base `emitirRootCss(MARCA_ASEGURA)` + Quicksand/Nunito Sans; encima solo el ACENTO del taller (`lib/marca-css.ts`, logo y verde de `MARCA_TALLERES_G2`, texto negro sobre lima, `--brand-ink` oscurecido AA); «con Grupo ASegura» va fijo y pequeño
  (`coMarca`), no es editable. Resolución por taller en `lib/marca.ts`.
- **Login taller → usuario → PIN** (`@central/core-identity/pin`): (1) el dispositivo recuerda el **código del taller** (8 caracteres, lo genera el alta,
  el dueño lo edita/regenera en Ajustes; cookie firmada con el CÓDIGO, no el id: regenerarlo revoca los móviles); (2) se elige el usuario (solo activos);
  (3) PIN de ESA persona. **El PIN ya no es único ni identifica a nadie** (nunca «ya está en uso»). Bloqueos: por persona (5 fallos → 5 h, config), por IP y
  tope por taller (con aviso al dueño y «Desbloquear» en Ajustes). `TALLER_PILOTO_ID` solo vale en desarrollo, nunca en producción. PinStore real en
  `lib/pin-store-bd.ts` (login en una transacción con `pg_advisory_xact_lock`); el stub `lib/pin-store.ts` es solo para tests. Acceso a BD siempre por
  `conTaller()` (RLS). Secreto `TALLER_SESSION_SECRET` vía `requireSecret`, nunca literal. La sesión firmada lleva `sv` (= `usuarios_taller.sesion_version`):
  cambiar/resetear PIN o dar de baja la sube y la cookie vieja deja de valer (`exigir`/`usuarioDeSesion`). `/cambiar-pin` sin PIN temporal pide el PIN actual.
- **Alta por operador (`POST /api/operador/talleres`, `lib/alta-taller.ts`):** sin `tallerId` busca/crea por NIF (`alta_taller`, 0004); con `tallerId`
  completa ESE taller (404 si no existe; NIF NULL → se fija con el de la entrada; NIF distinto o de otro taller → 409, nunca se pisa). Taller existente
  con configuración y **0 dueños activos** → crea el dueño con PIN temporal (201); con dueño → 409 sin PIN. Candado `alta_dueno:<taller>`. Sin SQL
  nuevo (UPDATE de `nif` concedido en 0002). Migraciones 0001-0008 aplicadas en producción; **0009 (facturas) escrita y SIN aplicar**.
- **RR.HH.:** `talleres.rrhh_empresa_id` lo fija SOLO el operador (`/api/operador/talleres`, POST o PATCH); rrhh solo ficha si esa empresa habilitó el taller
  (`empresas.fichaje_taller_id`). `/api/fichar` responde «registrado», sin datos de rrhh.
- **Consentimiento:** el cliente final es del taller; solo pasa a lead de ASegura con su casilla propia, y el servicio
  nunca se condiciona a marcarla. Ningún lead a `seguros` sin consentimiento registrado.
- **Configuración autoservicio:** precios, IVA, intervalos y horarios son datos que edita el dueño en Ajustes; ningún
  literal de ese tipo en código (spec 3bis).
- **Citas por enlace (`/c/[token]`, público) y agenda `/citas`:** motor por capacidad en `module-taller/src/agenda.ts`; la reserva es atómica (candado `cita:<taller>` + UPDATE condicionado del token) y el enlace solo guarda hash. No hay transporte de correo: la invitación se REGISTRA y se enseña el enlace. Límite por IP `enlace:<ip>`. Spec: «Citas por enlace y agenda con capacidad». SQL 0007 aplicada en producción.
- **Retirada y retención de fotos (SQL 0008 aplicada en producción):** al pasar la OT a `entregado` el cliente firma la conformidad (`lib/entrega.ts`, `EntregaCliente`); la firma, el texto exacto, su versión y quién retira
  quedan en la OT. Texto y obligatoriedad editables en Ajustes (alta en `RETIRADA_ALTA`); `cambiarEstadoAccion` NO entrega. `fotos_retencion_dias` (alta 180, **mínimo 90**: garantía legal 3 meses/2.000 km) cuenta desde la entrega.
  Cron diario `/api/cron/purgar-fotos` (`CRON_SECRET`, `lib/purga-fotos.ts`): borra de Storage SOLO fotos de daños y de trabajo de OT entregadas fuera de plazo y marca `purgada_en` (la fila se queda); nunca firmas, resguardo, presupuestos ni facturas.
  Talleres a recorrer: `taller.talleres_activos()` (SECURITY DEFINER). Qué toca lo decide el helper puro `fotosAPurgar` de module-taller.
- **Facturación VeriFactu (SQL 0009, sin aplicar):** `lib/facturas.ts` emite/anula/rectifica en UNA transacción `conTaller()` con el candado `pg_advisory_xact_lock(hashtext('factura:<taller>'))`
  tomado lo PRIMERO y que no se suelta hasta el COMMIT (los triggers de 0009 toman el mismo). Numeración por (taller, serie, año) sin huecos (`contadores_factura`), cadena de registros por taller, todo inmutable
  (solo cambian `estado` y `estado_envio`). Lógica pura en `module-taller/src/factura.ts` (solo líneas aceptadas, F1/F2 ≤ 400 €, rectificativas, cobros con efectivo < 1.000 €).
  **Sin envío a la AEAT** (todo `no_enviado`). El NIF/razón del PRODUCTOR del software va en `lib/sistema-informatico.ts` (hoy `null` → la emisión falla «falta configurar el sistema informático»); nunca se inventa.
- **Sin WhatsApp:** avisos por push de la app + correo. Nada sale a terceros ni a proveedores sin botón del dueño.
- Dinero en formato español (`2.162,49€`); UI usable a ≥320 px, botones ≥44 px.
- Vercel: `vercel.json` con `ignoreCommand` y `--sin-previews`; app en la matriz de `tests.yml`.
