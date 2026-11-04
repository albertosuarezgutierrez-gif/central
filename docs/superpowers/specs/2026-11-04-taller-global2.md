# Vertical TALLER DE VEHÍCULOS (piloto Global 2) — especificación (04/11/2026)

**Estado:** diseño, sin código. Fuentes: conversación con el dueño (Drive `Globa_original.txt`, id
`1lJMM1PPZXUFs64iLsH__LIHegpHFqWOp`, 35 requisitos R1-R35 reconstruidos) y la entrada «Taller Global 2» de
`docs/CONTEXTO-SESIONES.md`. Las decisiones de Alberto de la sección 1 están cerradas: no se reabren aquí.

## 0. Objetivo y modelo de negocio
- **Producto:** gestión de taller (recepción, presupuesto, orden de trabajo, piezas, factura, avisos) **regalada** a
  talleres. Piloto: **Talleres de Automoción G2** («Global 2», ya cliente de `rrhh`), Calle Cañada Real 14, Parque Industrial
  Parque Plata, 41900 Camas (Sevilla). Hoy: **1 mecánico** y pocos coches (recién abierto): piloto ideal. F1 se dimensiona para
  1 mecánico (una sola tablet, un parte abierto), pero el modelo ya admite varios mecánicos y varios talleres.
- **Contrapartida:** el taller lleva el logo «con Grupo ASegura» y la comunicación con su cliente final pasa por nuestra
  app. Objetivo comercial: captar clientes finales para Grupo ASegura (seguro de **auto** y de **hogar**, este por
  dirección + Catastro). «Tú ya fidelizas, porque tienes el seguro y tienes el taller».
- **Límite jurídico:** el cliente final es del taller; **solo pasa a ser lead de ASegura con su consentimiento propio**
  (sección 6). La frase «el cliente pasa a serlo de los dos» se traduce a: dos casillas, dos finalidades, un registro.
- **Cifras:** la tarifa de referencia (5 h = 250 €, es decir 50,00 €/h) es una inferencia: la tarifa real la fija el taller en sus Ajustes (sección 3bis).
  Los «2.000 €/mes» del audio NO son un precio pactado (duda 2 de la sección 11).

## 1. Decisiones cerradas (resumen operativo)
1. `apps/taller` + `packages/module-taller`, schema `taller`, rol de BD propio, **multi-taller desde el inicio**,
   clave de negocio = **matrícula**. Alta en la matriz de `tests.yml`; `vercel.json` con `ignoreCommand` y `--sin-previews`.
2. Avisos **sin WhatsApp**: push de la app (gratis) + copia por correo siempre; sin app, solo correo.
3. Pedidos a proveedor: la OT **propone**, el dueño **elige proveedor y pulsa Enviar**; nada sale sin su botón.
4. Jornada legal: se ficha en `apps/rrhh`. El taller solo registra **horas por mecánico y coche**.
5. Identificación en pantallas del taller por **PIN** (como ia-rest). Huella: más adelante.
6. Baremo y horas reales **se guardan los dos**; el margen sale de la diferencia.
7. Consentimiento y puente a `seguros`: ver sección 6.

## 2. Actores
| Actor | Qué hace | Cómo entra |
|---|---|---|
| **Recepción** | Alta del vehículo, fotos, km, daños, firma, presupuesto, citas, cierre y aviso de «terminado» | PIN en tablet |
| **Mecánico** | Elige coche abierto, imputa horas, dicta, declara consumos, cierra su parte | PIN en tablet/pantalla de taller |
| **Dueño** | Aprueba pedidos, elige proveedor, ve márgenes y facturas, gestiona tarifas, paquetes y baremos | PIN + dispositivo propio |
| **Administración** (H3 del audio, por identificar) | Compras imputadas a matrícula, facturas de proveedor, cobros | PIN, rol propio |
| **Cliente final** | Acepta presupuesto y ampliaciones, pide cita, recibe avisos, firma la recepción | Enlace con token; app/portal si se instala |

## 3. Modelo de datos (schema `taller`)
Toda tabla lleva `taller_id` (aislamiento multi-taller por RLS), `creado_en`, `actualizado_en`. Importes en céntimos.
- **`talleres`**: razón social, nombre comercial, NIF, dirección (CP → provincia → municipio → calle Catastro), marca
  (`@central/brand`), tarifa €/h, serie de facturación, ajustes de aviso.
- **`configuracion_taller`** y **catálogos** (sección 3bis): ajustes escalares como clave/valor tipado (precio hora y por tipo de
  trabajo, IVA por defecto, intervalos de aviso, horario y huecos, textos de correo y resguardo, plantillas de presupuesto) y
  catálogos `tipos_vehiculo` (recargo), `series_factura`, `medios_cobro` y `aceites` (familia, envase, €/litro). Cada cambio, en `auditoria`.
- **`usuarios_taller`**: nombre, rol (`recepcion|mecanico|dueno|admin`), PIN (hash, único por taller), activo, intentos y bloqueo,
  enlace opcional a la persona en `rrhh`.
- **`clientes`**: nombre, NIF, móvil, correo, dirección validada, `app_instalada`, referencia opcional al contacto de `seguros`
  (solo si hay consentimiento, sección 6).
- **`vehiculos`**: **matrícula (clave única por taller)**, bastidor, marca, modelo, versión, tipo (`turismo|todoterreno|furgoneta|otro`),
  combustible, fecha de matriculación, datos de `core-vehiculos`, `cliente_id` actual, `km_actuales`, vencimientos
  (`itv_hasta`, `seguro_hasta`, `aseguradora`, `proxima_revision_km`, `proxima_revision_fecha`). Fecha desconocida = `null`,
  nunca «sin vencimiento» (regla «dato que NO hay ≠ no mirado»).
- **`recepciones`**: vehículo, cliente, km de entrada, nivel de combustible, objetos dejados, motivo, `danos` (puntos sobre croquis +
  nota), firma del cliente (`core-firma`), PDF del resguardo, estado del seguro declarado, fecha/hora.
- **`recepcion_fotos`**: recepción, orden, ruta en `core-storage`, huella (hash) y fecha de captura.
- **`ordenes_trabajo`** (OT): número por taller, recepción, vehículo, estado (`abierta|en_curso|esperando_pieza|esperando_cliente|terminada|facturada|cancelada`),
  presupuesto origen, tipo de cobro de cada línea, totales, cierre.
- **`ot_lineas`**: OT, tipo (`mano_obra|pieza|granel|paquete|otro`), descripción, cantidad, precio, `baremo_horas`, `horas_reales`,
  `articulo_id`, `proveedor_pedido_id`, origen (`dictado|manual|paquete|ampliacion`), `aceptada_en`.
- **`partes_horas`**: OT, mecánico, inicio, fin, minutos. Un mecánico, un parte abierto a la vez; cambiar de coche cierra y abre.
- **`dictados`**: OT, mecánico, audio (opcional), transcripción, propuesta estructurada de la IA, estado (`pendiente|confirmado|descartado`).
- **`paquetes`** y **`paquete_precios`**: paquete («cambio de aceite», «filtros»…), composición (horas, artículos, litros) y precio por tipo de vehículo.
- **`baremos`**: operación, marca/modelo/familia opcional, horas tabuladas, origen (propio|comercial|experiencia), vigencia.
- **`articulos`** y **`movimientos_stock`** (extienden `module-materiales`): referencia propia, referencia del fabricante, unidad
  (`ud|litro`), mínimo, coste medio, granel (litros por envase), stock.
- **`proveedores`**: nombre, correo de pedidos, contacto; ilimitados por taller.
- **`pedidos`** y **`pedido_lineas`**: OT de origen, proveedor, estado (`borrador|enviado|albaran|recibido|facturado`), correo enviado
  (fecha, id), enlace de albarán, `recibido_en`, factura del proveedor (OCR de `module-asn`), matrícula imputada.
- **`presupuestos`** y **`presupuesto_lineas`**: vehículo, cliente, origen (`taller|casa|ampliacion`), PDF, token de aceptación,
  estado (`borrador|enviado|aceptado|rechazado|caducado`), aceptación (fecha, IP, texto, firma), `presupuesto_padre_id` si es ampliación.
- **`ampliaciones_fotos`**: ampliación, ruta, nota.
- **`citas`**: taller, cliente, vehículo, inicio, duración, motivo, presupuesto, estado; exporta `.ics` al calendario del taller.
- **`facturas`**: OT, serie y número, líneas (copia congelada), VeriFactu (huella, QR), medio de cobro
  (`efectivo|bizum|tarjeta|transferencia|otro`), cobros parciales en `cobros` (importe, medio, fecha, justificante `core-receipts`).
- **`avisos`**: cliente, vehículo, tipo (`terminado|itv|revision_km|revision_fecha|seguro|cita|presupuesto`), canal (`push|correo`),
  programado, enviado, error, `consentimiento_comercial` exigido o no.
- **`consentimientos`**: ver sección 6. **`leads_enviados`**: id de consentimiento, id de lead en `seguros`, fecha, resultado.
- **`auditoria`**: quién, qué, cuándo, antes/después (precios, baremos, aceptaciones y cierres de OT son inmutables tras facturar).

## 3bis. Configuración autoservicio del taller (sin intervención de Alberto)
**Principio.** Todo lo que varía entre talleres es **dato editable por el dueño** desde una pantalla «Ajustes» (rol `dueno`),
nunca constante en código ni un cambio que tenga que hacer Alberto. Cada taller nace con **valores por defecto sensatos**
(IVA 21 %, tarifa de partida 50,00 €/h marcada como sugerencia, intervalos de aviso habituales, horario de mañana y tarde)
que el dueño cambia desde el primer día. Todo cambio queda en `auditoria` (antes/después).

**Configurable por el taller:**
- **Datos y marca:** razón social, NIF, dirección (CP → provincia → municipio → calle Catastro), logo y colores (`@central/brand`).
  El «con Grupo ASegura» va siempre fijo: no es editable.
- **Mano de obra:** precio hora y, si lo quiere, precio por tipo de trabajo.
- **Vehículos:** tipos y recargos (`tipos_vehiculo`), que alimentan los precios de los paquetes.
- **Paquetes y servicios:** composición, baremo de horas y precio por tipo de vehículo (`paquetes`, `baremos`).
- **Aceites y granel:** familias, envases y precio por litro.
- **IVA por línea:** tipo por defecto y excepciones por línea.
- **Facturación:** series y numeración (sin huecos por serie) y medios de cobro habilitados.
- **Personal:** mecánicos y recepción: alta, baja y reset de PIN por el dueño (el PIN se guarda como hash; el reset genera uno temporal).
- **Proveedores:** nombre, correo de pedidos y contacto.
- **Textos:** correo de avisos y pie del resguardo de depósito.
- **Avisos:** intervalos de ITV, de revisión por km y de revisión por meses.
- **Agenda:** horario y duración de los huecos de cita.
- **Presupuestos:** plantillas (cabecera, condiciones, textos de paquetes).

**No configurable por el taller:** el texto y la casilla de consentimiento de Grupo ASegura (versión controlada por la
correduría, sección 6) y las reglas fiscales VeriFactu (`core-fiscal`).

**Regla de implementación:** `module-taller` no contiene ningún precio, IVA, intervalo ni horario literal; todo se lee de
configuración (guardián F1 (11)).

## 4. Flujos
**4.1 Recepción (R1-R4, resguardo de depósito RD 1457/1986).** Matrícula → `resolverMatricula` (`core-vehiculos`) rellena marca,
modelo y versión → km de entrada → fotos guiadas (frontal, trasera, laterales, cuadro, daños previos) → daños sobre croquis →
combustible y objetos → casilla ASegura y casilla comercial del taller (sección 6) → firma del cliente en la tablet →
PDF de **resguardo de depósito** (datos del taller, del vehículo, estado, fotos con huella, firma, fecha) enviado por correo.
Abre la OT. Si falta cobertura, la recepción se guarda en local y sincroniza; la OT no se factura sin recepción firmada.
Pregunta de seguro: ¿vigente?, ¿aseguradora?, ¿vence cuándo? Se guarda como dato; ofrecer estudio es opcional y solo con consentimiento.

**4.2 Presupuesto por paquetes (R21, R25-R26).** Se elige paquete; el precio sale del **tipo de vehículo** (turismo, todoterreno,
furgoneta). Aceite: dos familias (genérico de gama amplia y específico) × litros del vehículo. Dos orígenes:
(a) **en taller**, desde recepción; (b) **desde casa**: el cliente teclea matrícula y km en un enlace público, elige paquete,
ve el PDF y **pide cita** en la misma página. Aceptación por enlace con token (plantilla PDF y aceptación reutilizadas de
asegura), con registro de fecha, IP y texto. Un presupuesto sin matrícula no existe.

**4.3 Ampliación con fotos (R27).** El mecánico detecta algo extra, dicta y hace fotos; recepción crea la ampliación
(importe + fotos + explicación). El cliente recibe push y correo, ve las fotos y pulsa «Acepto» (o rechaza). Queda constancia
escrita aunque antes hubiera llamada. Sin aceptación, la línea no pasa a la factura.

**4.4 OT y partes con PIN (R5-R7, R24).** La tablet compartida muestra marca conjunta y teclado de PIN; tras el PIN, lista de coches
abiertos; pinchar uno abre un parte de horas (y cierra el que hubiera). Dictado por botón (R8): audio → texto → `core-ai`
estructura en líneas propuestas (trabajo, pieza que falta, consumo) → el mecánico **confirma** antes de que entren en la OT
(nunca se imputa sin revisión humana; R9). La traducción a otros idiomas del mecánico (R10) queda fuera hasta que el dueño
la pida. Cada línea de mano de obra guarda baremo y horas reales.

**4.5 Piezas y granel (R22-R23).** Una pieza faltante crea línea con artículo (referencia del fabricante) o texto libre.
Aceite a granel: se descuentan litros del envase abierto al **cerrar la OT**, cuando el mecánico declara lo consumido.
Alertas de stock mínimo solo para artículos que el taller decida llevar a stock (hoy no lleva existencias).

**4.6 Pedido a proveedor (R11-R16).** La OT agrupa las piezas pendientes. El dueño ve la propuesta, **asigna proveedor por línea**
(una OT puede ir a varios), edita y pulsa **Enviar** → correo con el pedido (matrícula y OT en el asunto). El proveedor responde al
mismo hilo con el enlace del albarán → se registra → «Recibida» manual → correo automático solicitando la factura, cuyo PDF se lee
con OCR (`module-asn`) y se **imputa a la matrícula**. Sugerencia de recambio por matrícula/referencia: solo propuesta (R13-R14),
ver dudas. Ningún pedido sale sin botón.

**4.7 Cierre y factura (R17-R18).** Mecánico cierra su parte y declara consumos; recepción revisa y pulsa «Terminado». El sistema
genera la factura desde la OT (líneas aceptadas, mano de obra al baremo o al precio cerrado, piezas, granel), con VeriFactu
(`core-fiscal`). Se registra el **medio de cobro** y el justificante (`core-receipts`); cobro dividido admitido como varios
cobros. Si el cobro es en efectivo, aplicar el límite legal de efectivo y avisar. Aviso «coche terminado» con la factura.

**4.8 Avisos (R29-R30).** Cola de `avisos` con disparadores: coche terminado, ITV (fecha), revisión (km estimados o fecha),
seguro (fecha) y cita. Canal: push si hay app y **siempre** copia por correo; sin app, solo correo. Los avisos de servicio (terminado,
cita, ITV, revisión) no requieren consentimiento comercial; los que promocionen seguros o servicios sí. Kilómetros: se estiman por
histórico de recepciones y se corrigen en cada visita. Marca del taller en cada mensaje.

**4.9 Cita (R28).** Hueco libre del calendario del taller, confirmación por correo con `.ics`, recordatorio 24 h antes.
Evitar solapes por puesto y duración estimada del paquete. Desde 04/11/2026 el reparto es por capacidad, no por puesto: ver «Citas por enlace y agenda con capacidad» (§8, F1).

## 5. Direcciones y Catastro
Toda dirección (taller, cliente, factura) sigue la regla del CLAUDE.md: CP → provincia → municipio → calle del Catastro →
número, sin valores por defecto. Referencia: `BuscadorDireccionCp.tsx` + `core-catastro` / `core-direccion`. Con la dirección
validada y consentimiento, el lead de hogar llega a `seguros` con referencia catastral ya consultable.

## 6. Consentimiento y puente a `seguros`
- **Casilla 1 (ASegura)**, propia, **sin marcar**: «Acepto que Grupo ASegura me contacte para ofrecerme seguros». Se muestra en el
  primer contacto: recepción (misma firma) o aceptación del presupuesto desde casa.
- **Casilla 2 (taller)**, aparte y sin marcar: uso comercial propio del taller (promociones, campañas).
- **El servicio no se condiciona** a ninguna casilla (RGPD art. 7.4). Se permite incentivo, nunca negar servicio.
- **Segunda oportunidad** al primer acceso a la app, si sigue sin consentimiento.
- **Registro** (`consentimientos`): cliente, finalidad, texto exacto y versión, taller, canal (`recepcion|presupuesto_casa|app`),
  firma, fecha, IP si procede, y retirada (con fecha). Retirar el consentimiento detiene envíos y deja traza.
- **Puente:** un lead a `seguros` solo se crea llamando al puerto `/api/operador/*` de `apps/asegura` con origen **«taller»**,
  con identificador del consentimiento vigente; sin él, la llamada se rechaza en origen y también en destino. Tipos: auto
  (matrícula, aseguradora, vencimiento) y hogar (dirección validada). Los envíos comerciales por correo exigen consentimiento.
- **Roles RGPD** (corresponsables o encargado) y contrato de colaboración: F0, ver dudas. `core-consent` actual cubre cookies
  (banner); el registro de consentimiento comercial es nuevo (tabla propia) y se alinea con él en textos.

## 7. Qué se reutiliza y qué es nuevo
| Necesidad | Ruta | Estado |
|---|---|---|
| Sesión, secretos | `packages/core-identity` (`requireSecret`) | reutilizar |
| Marca del taller + «con Grupo ASegura» | `packages/brand` (alta con skill `marca-cliente`) | reutilizar |
| Datos por matrícula | `packages/core-vehiculos` (`resolverMatricula`) | reutilizar |
| Stock | `packages/module-materiales` | **extender**: referencia, mínimo, coste medio, granel en litros |
| Presupuestos | `packages/module-presupuestos` (solo cálculo) | **extraer** la plantilla PDF y la aceptación por enlace de `apps/asegura` (`app/api/portal/presupuesto`) y `apps/asegura-portal` (`api/presupuesto/firma`) |
| Albarán OCR | `packages/module-asn` | reutilizar |
| Factura | `packages/core-fiscal` (VeriFactu) + `packages/core-receipts` | reutilizar |
| Firma | `packages/core-firma` | reutilizar |
| Correo / push | `packages/core-email`, `packages/core-push` | reutilizar |
| Dictado | `packages/core-ai` | reutilizar |
| Direcciones | `packages/core-catastro`, `packages/core-direccion` | reutilizar |
| Jornada legal | `apps/rrhh` + `packages/module-horario` | no duplicar |
| PIN | `apps/ia-rest` (ver 7.1) | **extraer** a package |
| Lead a seguros | `apps/asegura/app/api/operador/leads` | reutilizar con origen «taller» |
| Todo el dominio taller | `apps/taller`, `packages/module-taller` | **nuevo** |

**7.1 PIN de ia-rest (localizado).** Login: `apps/ia-rest/src/app/login/page.tsx` (pad de 4 dígitos, auto-envío al completar,
línea 136; prueba primero `/api/auth/pin-cuenta` y luego `/api/auth/route.ts`). Verificación: `apps/ia-rest/src/app/api/auth/route.ts:48-50`
llama a la función SQL `iarest.login_pin(restaurante, pin, ip)`, con bloqueo por BD y limitador en memoria por IP (10 intentos
/ 5 min, `:8-9`); definición en `apps/ia-rest/supabase/migrations/20260526_login_pin_rate_limit.sql`. Sesión: objeto firmado con HMAC
(`src/lib/session-sign.ts`, `firmarSesion`/`verificarSesion`) leído por `src/lib/session.ts`, guardado en `localStorage`.
**No es reutilizable tal cual**: depende del schema `iarest`, de alias `@/lib` propios y de roles de restaurante. Decisión de
spec: **extraer a `core-identity`** un módulo de PIN (hash, comparación, bloqueo por intentos, firma de sesión) con un adaptador de
almacenamiento por app; ia-rest migra después a él, sin tocar su comportamiento. El PIN solo atribuye horas y acciones: **no es
el fichaje legal** (eso es rrhh). Aviso: PIN de 4 cifras en tablet compartida es débil; mitigar con bloqueo por intentos, PIN
único por taller y cierre de sesión por inactividad.

## 8. Fases
**F0 — Validación (sin código).** Respuestas de la sección 11; contrato de colaboración con Global 2 y reparto de roles RGPD;
texto legal de las dos casillas revisado; elegir proveedor de base de recambios (o descartarla). *Hecho:* contrato firmado, textos
aprobados por Alberto, datos del taller en mano.

**F1 — Recepción, consentimiento, PIN, OT, presupuesto** (dimensionada para 1 mecánico; sin pantallas grandes ni huella). Alta de `apps/taller` (matriz, `vercel.json`, proyecto Vercel, rol y schema),
`module-taller`, PIN extraído, recepción con fotos/km/daños/firma y resguardo PDF, consentimiento y registro, OT y partes de horas,
presupuesto por paquetes con aceptación por enlace y cita, dictado con confirmación, **citas por enlace y agenda con capacidad** (sección siguiente).
*Hecho:* una recepción real de Global 2 de punta a punta en tablet; PDF legible; presupuesto aceptado por enlace en móvil a 320 px; el dueño cambia el precio hora en Ajustes y el siguiente
presupuesto lo usa sin tocar código.
*Tests y guardianes:* (1) **ningún lead a `seguros` sin consentimiento registrado** (visto fallar: quitar el registro y ver rojo);
(2) servicio no condicionado: recepción se completa con ambas casillas sin marcar; (3) la matrícula es única por taller y
toda tabla de negocio lleva `taller_id` (guardián de esquema); (4) aislamiento multi-taller: un PIN de un taller no abre
datos de otro; (5) PIN: bloqueo tras N intentos; (6) matriz `tests.yml` incluye `taller` (`test/regression-matriz-typecheck.test.ts`);
(7) `vercel.json` con `ignoreCommand` y `--sin-previews`; (8) secretos sin literal (`regression-secrets`); (9) dinero en formato
español (2.162,49€); (10) cálculo del paquete por tipo de vehículo y del margen baremo − real con fechas relativas a hoy;
(11) **ningún precio, IVA, intervalo ni horario literal en la lógica de `module-taller`**: un test escanea el módulo y falla ante
cualquier literal de ese tipo fuera de configuración (visto fallar: meter un «50» a pelo y ver rojo).

### Citas por enlace y agenda con capacidad (decidido por Alberto, 04/11/2026; cierre de F1)
**Qué es.** El taller invita a un cliente a pedir cita por un enlace y la agenda reparte los huecos sin cuellos de botella. No se planifica
mecánico a mecánico: se reparte por **franja de entrada** y por **capacidad diaria en horas-mecánico**.

**Motor (`module-taller/src/agenda.ts`, puro, `ahora` inyectado).** Una franja se ofrece si (1) caben más coches en ella
(`maxCochesPorFranja`) y (2) el día tiene capacidad libre para el servicio:
`capacidad del día = puestos × minutos de horario del día × % ocupable`; `ocupado = trabajo pendiente de las OT abiertas + citas pedidas/confirmadas`;
se ofrece si `capacidad − ocupado ≥ baremo del paquete + margen`. El trabajo pendiente de las OT (baremo − horas ya trabajadas; una OT sin baremo
cuenta como un diagnóstico, nunca como 0) se reparte desde hoy llenando la capacidad de cada día en orden. Simplificación asumida: la capacidad del día
no se prorratea por la hora actual (la antelación mínima cubre el mismo día). Nunca ofrece franjas pasadas, fuera del horario semanal, en cierres
ni fuera de la antelación mínima/máxima. Servicio «diagnóstico / no sé» con duración configurable (código reservado `diagnostico`).

**Configuración editable por el dueño (Ajustes → Agenda; defaults en `configDeAlta().agenda`, espejo en 0007):** horario semanal y duración de la franja de entrada
(`horarioCitas`), `puestos` = mecánicos/puestos activos, festivos y cierres, máx. coches por franja, % ocupable (alta 85 %), margen entre trabajos,
antelación mínima (horas) y máxima (días), confirmación automática o manual (alta: **manual**), duración del diagnóstico y días de validez del enlace.

**Flujo.** (1) Recepción o dueño pulsa «Invitar a pedir cita» (nombre, correo opcional, matrícula opcional): se crea la invitación con token de 256 bits
(`<taller>.<32 bytes>`; en BD solo el SHA-256), caducidad configurable y un solo uso. El correo pasa por el puerto `Notificador`; **hoy no hay transporte
de correo cableado en apps/taller**, así que el envío queda REGISTRADO (no sale nada) y la pantalla enseña el enlace para copiarlo. (2) El cliente abre
`/c/<token>` (marca del taller + sello «con Grupo ASegura»), escribe la **matrícula** (normalizada y validada; si el vehículo existe lo enlaza, si no lo crea solo con la
matrícula: APIVehículo/`core-vehiculos` no está cableado en el taller), elige servicio y ve los huecos del motor. (3) Confirma: reserva **atómica** (candado de transacción
por taller → relee citas y OT → recomprueba la franja → consume el token con un UPDATE condicionado → inserta la cita; dos clientes a la última plaza: uno recibe 409 y
conserva su token). (4) La cita entra `pedida` (pendiente) o `confirmada` según la política. Casillas de consentimiento propias (ASegura y taller), **sin marcar**, canal `cita_enlace`,
una fila solo por casilla marcada y solo si no la tenía; nunca se atribuye a un titular ajeno el consentimiento de quien escribió su matrícula.
(5) Agenda `/citas` (día/semana): coches por franja y % de capacidad del día (rojo si se pasa), aceptar/rechazar/cancelar/mover (mismas reglas del motor, sin
antelación mínima) y «Ha llegado» → recepción precargada que enlaza la cita (`realizada`).

**Seguridad.** `/c/[token]` es público: límite de fallos por IP con el patrón del código del taller (`enlace:<ip>`, 10 fallos → 1 h; token malo, caducado, usado o IP bloqueada = el mismo 404);
RLS por el taller del token; SQL **0007** sin aplicar (se aplica a mano, preview → prod tras OK de Alberto).

**Tests y guardianes (visto fallar cada uno):** no ofrece hueco con franja llena; no ofrece si la capacidad diaria está agotada; nunca franjas pasadas; doble reserva de la última plaza
→ una falla; token caducado/usado/revocado → 404; sin casillas marcadas no se crea consentimiento; espejo 0007 ≡ `configDeAlta()`; el token no está en ninguna columna ni en la auditoría.

**F2 — Piezas, pedidos, stock, factura.** Artículos y granel, propuesta de pedido, envío con botón del dueño, albarán y recepción de
pieza, petición y OCR de factura de proveedor, imputación a matrícula, factura VeriFactu con medio de cobro, ampliaciones con fotos.
*Hecho:* una OT real cerrada y facturada, con pedido enviado y recibido, y el margen visible en el panel del dueño.
*Tests y guardianes:* (1) **ningún correo de pedido sale sin acción explícita del dueño** (ver fallar); (2) descuento de litros al
cerrar OT con granel (no antes, no dos veces); (3) factura inmutable tras emitir y numeración sin huecos por serie; (4) línea de
ampliación no entra en la factura sin aceptación; (5) cobro dividido suma el total; (6) línea sin horas reales no calcula margen
(`null`, no 0).

**Ahorro en piezas (decisiones de Alberto).** Dentro de F2:
- (a) **Petición de precio por correo** a 2-3 proveedores desde la OT, con el patrón de la spec de consultas a compañías por correo (PR #4759). El dueño elige proveedores y pulsa Enviar: nada sale sin su botón. Las respuestas (PDF/Excel) se leen y se ordenan por precio.
- (b) **Historial de precios** por referencia y proveedor, desde albaranes y facturas (OCR de `module-asn`). Al pedir una pieza, aviso «la última vez X€ en proveedor B».
- (c) **Compra a granel** de lo de más rotación (aceite, filtros, pastillas) con stock mínimo y aviso al bajar de él.
- **En estudio (no entra en F2):** catálogo o consulta por matrícula del distribuidor. Opción preferida: el distribuidor pasa su listado o tarifa (Excel/CSV) y se importa periódicamente al catálogo del taller, con importador configurable por el dueño y columnas mapeables. Alternativas: API o pedido electrónico oficial del distribuidor; bot sobre su portal solo con permiso escrito (riesgo de ToS y credenciales). Sin TecDoc de pago en el piloto.

**F3 — Avisos y puente a seguros.** Cola de avisos (terminado, ITV, revisión, seguro, cita), push + correo, retirada de
consentimiento, lead auto/hogar a `seguros` con origen «taller», segunda oportunidad en la app, panel de conversión.
*Hecho:* un aviso real de ITV y uno de «terminado» recibidos por un cliente de prueba; un lead con consentimiento visible en la cartera de la correduría.
*Tests y guardianes:* (1) consentimiento retirado = cero envíos comerciales; (2) sin app, solo correo; con app, push + correo;
(3) avisos de servicio no se bloquean por falta de consentimiento comercial; (4) origen «taller» obligatorio y trazable;
(5) fecha desconocida no dispara aviso ni se muestra como «vigente»; (6) cualquier correo masivo exige consentimiento.

## 9. Riesgos
- **RGPD:** mezclar servicio y marketing, o enviar avisos con regalo sin base legal. Mitigación: sección 6 y guardianes.
- **Prueba de fotos:** fotos sin huella ni fecha no sirven ante reclamación; guardar hash, fecha y firma.
- **Dependencia de PIN débil** en tablet compartida y fichaje legal confundido con horas por coche.
- **Datos del proveedor actual:** el programa actual guarda claves y datos («se ha llevado las claves»); migración incierta.
- **Calidad del dictado:** la IA estructura mal; por eso confirmación humana siempre.
- **Base de recambios** de pago o poco fiable; referencias de fabricante vs proveedor.
- **Coste:** push gratis, pero correo, almacenamiento de fotos y OCR cuestan; límite por taller y retención de fotos.
- **Calendario CI:** al añadir `taller` la matriz pasa de 13 a 14 apps; el ruleset exige los checks por nombre y no se toca por
  iniciativa propia: Alberto decide si `Typecheck · taller` pasa a requerido.
- **Obligaciones del taller** (hojas de reclamaciones, resguardo, garantía de reparación): revisar con el taller antes de F1.
- **Tablets y Wi-Fi:** sin conexión estable, la recepción debe poder guardarse en local.

## 10. Contradicciones entre requisitos y decisiones (ya resueltas en esta spec)
- El dueño pidió **WhatsApp** (presupuesto y avisos) → decisión: sin WhatsApp; PDF por correo/app.
- Pidió **jornada** y fichaje en el programa → decisión: legal en rrhh; el taller solo horas por coche.
- **Autorización de datos conjunta** («cliente de los 2») → casillas separadas y sin condicionar el servicio.
- Pidió **huella** (lector ya comprado) → PIN primero; huella más adelante.
- **Multi-taller** no aparece en el audio (R35) → se fija desde el inicio por decisión de Alberto.
- «Descuento» en seguro al entrar el coche → permitido como incentivo, nunca negando servicio.

## 11. Dudas pendientes para Alberto
Confirmado por Alberto (04/11/2026, ya no son dudas): nombre **Talleres de Automoción G2**; dirección Calle Cañada Real 14,
Parque Industrial Parque Plata, 41900 Camas (Sevilla); **1 mecánico** y pocos coches (acaban de abrir).

1. **Facturación si se tarda más que el baremo:** ¿se factura siempre el baremo aunque se tarde más?
2. **Qué eran los «2.000 €/mes»**: coste del programa actual, de un servidor o una cuota; y si el trato es 100 % gratis.
3. **Programa actual y migración:** cuál es, formato de exportación, histórico por matrícula, y qué pasó con las claves.
4. **Origen de los baremos:** propios, comercial o experiencia; formato para cargarlos.
5. **Base de recambios por matrícula:** ¿contratar una (tipo catálogo de pago) o limitar a búsqueda por referencia de fabricante?
6. NIF y serie de facturación del taller; quién es H3 (administración) y quiénes son Pacheco, Manu, Pilar y Carlos.
7. «**No tenemos seguro**» (12:29): ¿es el taller (RC de taller, oportunidad) o un cliente?
8. «**Cobro dinámico / divididos**»: ¿pago fraccionado o financiación?
9. **Roles RGPD** (corresponsables o encargado) y contrato de colaboración con G2; plazo de arranque.
10. **Tablets y pantallas:** nº y modelos, y si las 2 pantallas grandes muestran el tablero de coches en curso.
11. **Distribuidor de recambios:** ¿con qué distribuidor(es) trabaja G2 y pueden pasar la tarifa en Excel/CSV?

## 12. Ideas aprobadas (04/11/2026)
Decisión de Alberto: aprobadas todas salvo la 2, que queda **PENDIENTE** (se estudia, no se implementa). Fase y criterio de «hecho» por idea:

1. **Flota de G2 en el taller** (`module-flota`): mantenimiento, ITV y revisiones de sus furgonetas en la app del taller; seguro de flota de Grupo ASegura solo con consentimiento de la empresa. **F2.**
   - Hecho: una furgoneta de G2 tiene revisiones e ITV visibles en la app y la oferta de seguro no sale sin consentimiento de empresa.
2. **PENDIENTE — Taller de confianza de Grupo ASegura para siniestros** (derivar clientes con parte al taller; la correduría gestiona el siniestro; estudiar qué compañías permiten libre elección de taller). **No se implementa.**
   - Hecho: n/a hasta que Alberto decida estudiarla; no hay código ni tablas para ella.
3. **«¿Te mejoramos el seguro de este coche?»** en resguardo, presupuesto y correo de terminado; solo a quien tiene consentimiento ASegura; datos precargados por matrícula. **F3.**
   - Hecho: el bloque no aparece sin consentimiento y, con él, la matrícula llega precargada.
4. **Historial digital del vehículo** en la app del cliente (reparaciones, km, fotos) como motivo para instalar la app (push gratis). **F3.**
   - Hecho: el cliente ve el historial de su coche tras un terminado y recibe el push correspondiente.
5. **Aviso de ITV/revisión con enlace de cita** (reutiliza citas por enlace); vencimiento de seguro solo con consentimiento. **F3.**
   - Hecho: un aviso de ITV con enlace de cita se genera con la fecha conocida; sin fecha no se avisa ni se muestra «vigente».
6. **Enlace de reseña en Google** en el correo de terminado (URL configurable por el taller). **F2.**
   - Hecho: el correo de terminado incluye el enlace configurado; sin URL configurada no aparece.
7. **Coche de sustitución** reutilizando `module-alquiler`. **F2.**
   - Hecho: se puede reservar un vehículo de sustitución asociado a una reparación en curso.
8. **Garantía legal 3 meses / 2.000 km** (RD 1457/1986): aviso al recepcionar si el vehículo vuelve en garantía; plazos configurables. **F2.**
   - Hecho: al recepcionar un coche dentro del plazo aparece el aviso; los plazos se cambian sin tocar código.
9. **Panel de resultados del regalo** para Alberto en plataforma: por taller, coches, consentimientos, leads y pólizas cerradas. **F3.**
   - Hecho: el panel muestra las cinco cifras por taller con datos reales de BD.
10. **Alta de taller nuevo en minutos** desde plataforma: checklist de onboarding y plantilla de configuración. **F2.**
   - Hecho: un taller nuevo queda operativo siguiendo el checklist sin intervención de Alberto.

Descartado por ahora: cobros y señales online (comisiones y regulación).
