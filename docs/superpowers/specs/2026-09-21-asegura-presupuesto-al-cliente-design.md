# Presupuesto al cliente — diseño (21/09/2026)

Dictado de Alberto (21/09/2026): «Yo veo el vencimiento, o el cliente me llama: venga, te mando el
presupuesto. Le doy a un botón, se le manda un enlace directo con ese presupuesto —habrá que
diseñarlo bonito, no como está ahora, que está bastante feo—, él entra en SU intranet, se le informa
de lo que tiene contratado actualmente, se le hace una comparativa contra lo que hay en las
compañías, él selecciona la opción y las garantías, se le confirma el precio, y que simplemente
tenga que darle a un botón de emitir y emita directamente con la compañía.»

Añadidos del mismo día: **Fase 2 confirmada** («me vale»); la aceptación **se firma**
(`@central/core-firma`); **no se le mandan las 24 filas** (tres opciones en portada); caducidad
visible con «pídeme precio actualizado» que llega a Alberto y no al vendor; telemetría del
presupuesto como cola de trabajo; **dos salidas** (cambio de compañía / cambio de mediador); envío
**por mail o WhatsApp a elección**; y un apartado propio (§4bis) para los datos que faltan para emitir.

Y la corrección del canal, también suya y del mismo día, que **abarata el §3 entero**: «El WhatsApp,
como lo tengo actualmente, sería simplemente: cuando yo tuviera la parrilla, un botón que dice
"enviar presupuesto al cliente", me hace un mensaje tipo con un enlace a su intranet donde él pueda
ver los presupuestos, y ya está. Como ahora mismo: le doy a un botón y se me abre automáticamente el
WhatsApp para que YO le dé a enviar. No que sea automático, sino que yo le tenga que dar al
botoncito. **Así no hace falta la WABA.**»

Reglas vinculantes que enmarcan todo esto: `.claude/skills/correduria-crm/SKILL.md` (6: emisión ⇒
spec + OK; 7: nada sale al cliente sin OK; 19: el contacto vive en tres sitios; 20: Codeoscopic
cuesta 0,50€ y no es idempotente), `apps/asegura-portal/CLAUDE.md` (el portal aísla por CÓDIGO, y no
tiene a quién escribir), y la regla raíz `null` ≠ `[]` ≠ `0`.

---

## §0. Lo que se midió antes de escribir esto (21/09/2026)

| Hecho | Marca | Dónde se midió |
|---|---|---|
| El portal **SÍ está desplegado** desde el 03/09/2026 (`asegura-portal.vercel.app`, envs puestas; `clientes.grupoasegura.es` en «Valid Configuration» según el panel, 07/09) | [Seguro] | `apps/asegura-portal/CLAUDE.md` §«Puesta en producción»; el `curl` desde este contenedor está bloqueado por el proxy, así que **no lo he tocado con las manos**, lo he leído |
| Uso real del portal: **10 identidades, 8 vínculos** | [Seguro] | `select count(*) from seguros.portal_identidad / portal_vinculo` |
| `seguros.tarificaciones`: **18 filas, 15 reales**; `tarificacion_precios`: **187 precios y NI UNO `firme`** | [Seguro] | consulta directa a la BD compartida |
| `seguros.codeoscopic_consumo`: 18 líneas, 15 `facturable` = **7,50€ gastados en total** | [Seguro] | ídem |
| Cartera viva: **100 clientes**; 62 con email (ficha o `cliente_emails`), 71 con teléfono, 73 con alguno, **11 con teléfono y sin correo**, **27 sin ningún contacto EN LA FICHA** | [Seguro] | consulta con `import_ref is null or eiac_xml_hash is not null` |
| **Cuántos de esos teléfonos son MÓVILES no se puede medir en SQL**: la columna está cifrada, así que un `regexp` sobre ella da 0 y ese 0 es un artefacto, no un dato | [Seguro] — lo intenté y devolvió `con_movil: 0` con 71 teléfonos delante | la decisión la toma `movilParaInvitar()`/`urlWhatsapp()` tras descifrar, ficha a ficha |
| La agrupación por cobertura y los filtros del otro agente **ya están en `main`**: `comparativa-precios.ts` (`nivelCobertura`, `agruparPrecios`, `parseFiltroPrecios`, tipos `Nivel`/`GrupoCobertura`/`Comparativa`) y `defensa-cartera.ts` (`defensaDeCartera`, `bloqueaEmision`, `fraseDefensa`), exportados desde `@central/module-seguros` | [Seguro] | `packages/module-seguros/src/index.ts:630-675` |
| El deep link de WhatsApp **ya está construido y en uso**: `telefono-wa.ts` (`urlWhatsapp`, `esMovilEs`), `invitacion-whatsapp.ts` (`enlaceWhatsappConMensaje`, `movilParaInvitar`, `canalWhatsapp` con sus **cinco** desenlaces) y `acciones-contacto.ts`, con test cada uno y **siete pantallas** de `/correduria` consumiéndolos | [Seguro] | `apps/plataforma/lib/*` + `grep` de consumidores |
| Esos 27 **no son 27 ilocalizables**: la ficha es uno de cuatro sitios (regla 19). El 05/09/2026, de 18 sin ficha quedaban **6** mirando los cuatro | [Seguro] la medición del 05/09; [Suposición] que hoy sigan siendo ~6 — no lo he vuelto a medir | `apps/asegura/lib/clientes-sin-canal.ts` |
| **Ni `/oferta` (ReRate) ni `/emitir` (Submit) pasan por `cotizar()`**: no escriben línea en `codeoscopic_consumo` y **no cuentan contra el tope diario/mensual** | [Seguro] | `grep` de quién importa `lib/codeoscopic/cotizar`: 19 ficheros, y esas dos rutas no están |
| La única operación que el fabricante documenta como facturable es `POST /insurances` (0,50€) | [Seguro] | `docs/CODEOSCOPIC-API-PORTAL.md:158` y su tabla de costes |
| El CRM de Manuel trata el ReRate como **facturable y no idempotente** (`noRetry` siempre) | [Seguro] que lo trata así; [Probable] que cueste 0,50€ | `docs/CODEOSCOPIC-API-PORTAL.md:314` |
| `expirationDate` **solo aparece en los ejemplos de `POST …/offers` y `…/policy-applications`**, o sea después del ReRate. Los 15 precios reales tenían `expires_at` a NULL | [Seguro] | `docs/CODEOSCOPIC-API-PORTAL.md` §Caducidad |
| La emisión real **ya funciona**: primera póliza de auto emitida el 21/09/2026 (proyecto 40769244, Allianz) | [Seguro] | `apps/asegura/CLAUDE.md`, confirmado por Codeoscopic |
| `camposDeEmision()` (`GET …/policy-application-fields`) es **gratis pero exige `offerId`**: no existe antes del ReRate | [Seguro] | `apps/asegura/lib/codeoscopic/emitir.ts:585` |
| `GET /api/operador/codeoscopic/faltan-producto` **NO es un oráculo de qué falta**: es telemetría agregada de rechazos pasados por compañía | [Seguro] | su propio `route.ts` |
| `@central/core-firma` existe (eIDAS art. 26, SHA-256, `otp_email`), y la **orquestación OTP es agnóstica de vertical pero vive en `@central/module-rrhh`** | [Seguro] | `packages/core-firma/src/*`, `packages/module-rrhh/src/firma.ts` (su propia cabecera dice «AGNÓSTICA DE VERTICAL») |
| El nombre `cotizaciones` está cogido (cotizador web, 25 filas) y `avisos-presupuesto.ts` en asegura ya significa **presupuesto de tiempo**, no de dinero | [Seguro] | el SQL de tarificaciones y `apps/asegura/lib/avisos-presupuesto.ts` |

Una corrección al encargo, porque cambia el §5: **la premisa «ReRate y Submit cuestan 0,50€ y pasan
por el cupo» es falsa en su segunda mitad.** Que cuesten es probable; que el cupo los vea, no: hoy no
los ve. Eso es un agujero que ya existe con Alberto solo, y que la Fase 2 **no abre más** (el cliente
no llega a esas dos llamadas) pero que la Fase 3 convertiría en un grifo.

---

## §1. Alcance por fases

### Fase 1 — hoy
Alberto tarifica en `/correduria/poliza/[id]/retarificar`, ve la tabla de precios y **se lo pasa al
cliente a mano**. La pantalla ya hace bien lo difícil: pinta la firmeza pegada al precio, dice
«franquicia no declarada» en vez de «sin franquicia», y esconde los productos sin precio en un
`<details>` para que «5 precios» no se lea como «esto es el mercado».

### Fase 2 — **esto** (confirmada por Alberto)
El cliente **ve, elige y FIRMA**; Alberto emite.

Entrega:
1. Un objeto `presupuesto` que congela precios reales con fecha (§2).
2. Un enlace por mail o WhatsApp, elegido por Alberto al enviar, que **no abre sesión** (§3).
3. Una pantalla en `apps/asegura-portal` con la comparativa contra lo que ya tiene (§4).
4. **Dos salidas, no una** (ver abajo).
5. Aceptación como **firma electrónica avanzada** sobre el documento exacto que vio (§2.4).
6. Los datos que faltan para emitir, pedidos en el portal y no por correo (§4bis).
7. Telemetría como cola de trabajo en `/correduria` → Hoy (§2.5).

**Las dos salidas del mismo presupuesto:**
- **A · «Me cambio de compañía»** → firma la opción elegida → Alberto hace ReRate + Submit.
- **B · «Quédate con tu seguro, pero llévamelo tú»** → **carta de nombramiento de mediador** (idea H
  del banco de ideas), firmada con el mismo `core-firma`. Convierte un lead en cliente **sin
  tarificar y sin gastar un euro**, y el efecto de segundo orden es el premio: [Probable] esa póliza
  empieza a entrar por CIMA, y su vencimiento y su prima pasan de dato declarado a dato verificado.
  La salida B tiene que estar **en la misma pantalla que la A**, con el mismo peso visual. Si solo
  se ofrece A, el que dice «no» se va con las manos vacías; con B, el «no» de hoy es el cliente de
  la renovación siguiente. La CARTA en sí (plantilla, estados `enviada → aceptada → rechazada`) se
  construye después de la Fase 2: aquí solo se reserva el sitio, el estado y la firma.

Lo que la Fase 2 **NO** entrega, a propósito:
- El cliente **no dispara ninguna llamada al vendor**. Ninguna. Ese es el diseño, no una limitación.
- No hay IPID ni documento de información previa del producto (no existe en el repo; §1 Fase 3).
- No hay pago, ni mandato SEPA firmado, ni domiciliación.
- No hay ramos fuera de los seis de la API (Car, Motorcycle, Home, Health, Burial, Term Life):
  Comercios y Comunidades están activados en el panel de Avant2 **y no tienen endpoint** [Seguro,
  confirmado por Codeoscopic el 21/09/2026].

### Fase 3 — el cliente emite. Qué haría falta, y qué de eso NO existe hoy

Enseñar una comparativa de varias compañías **es asesoramiento sobre la base de un análisis
objetivo** (RDL 3/2020, arts. 155 y ss.), y dejar que el cliente contrate por sí mismo es
**contratación a distancia de un servicio financiero** (Ley 22/2007). El responsable es el mediador,
y la carga de la prueba de haber informado **antes** del clic es suya. Lista honesta:

| Hace falta | ¿Existe hoy? |
|---|---|
| **IPID / documento de información del producto**, por producto y compañía, entregado antes de contratar | ❌ **No existe nada**: ni tabla, ni plantilla, ni lo sirve Codeoscopic (no hay ni una referencia en `docs/CODEOSCOPIC-API-PORTAL.md`). Es el bloqueo duro |
| Documento de información previa del **mediador** (identidad, clave DGSFP, tipo de asesoramiento, participaciones, reclamaciones) — arts. 173-178 | 🟡 medio: `MEDIADOR` de `@central/module-seguros` tiene la clave DGSFP y los datos; falta el documento y su entrega |
| Declaración de **asesoramiento basado en análisis objetivo**, con cuántos contratos se compararon | 🟡 el dato está (`r.precios` + `r.fallos`), no el documento |
| **Derecho de desistimiento**: 14 días naturales (art. 10 Ley 22/2007), **30 en vida** (art. 83.a LCS) | ❌ ni texto ni mecanismo ni sello |
| **Prueba de entrega** de todo lo anterior antes del clic | 🟡 la firma de la Fase 2 lo resuelve **si el documento firmado incluye la información previa**. Hoy no la incluye porque no existe |
| **Mandato SEPA** firmado para domiciliar el recibo | ❌ |
| Idempotencia de punta a punta del Submit | ❌ **Codeoscopic no deduplica por nuestro `attempt_id`** y nunca se ha probado mandar el mismo dos veces [Seguro, está escrito como condición pendiente en `apps/asegura/CLAUDE.md`]. El candado propio (`submit_in_flight_at`, 10 min) protege de un doble clic del corredor; con un cliente al otro lado —recarga, botón atrás, móvil que pierde cobertura— doblar el pedal deja de ser el borde y pasa a ser el caso normal |
| Tope de gasto que **vea** el ReRate y el Submit | ❌ (§5) |

**Recomendación:** no diseñar la Fase 3 hasta que (a) exista el IPID y el documento del mediador, y
(b) la Fase 2 haya producido presupuestos firmados de verdad. El argumento no es solo legal: **el
cuello de botella no es el clic de Alberto.** Entre que el cliente acepta y que la póliza existe hay
un ReRate que puede cambiar el precio y un Submit que puede pedir cuatro consentimientos de la
compañía. Quitar a Alberto de en medio ahí no acelera nada y quita al único que sabe interpretar un
400 del vendor.

---

## §2. El objeto «presupuesto»

### 2.1 Por qué no vale lo que hay

`seguros.tarificaciones` + `tarificacion_precios` responden **«qué precio me dio el vendor y cuánto
me costó preguntarlo»**. Un presupuesto responde otra cosa: **«qué le enseñé a esta persona, cuándo,
cuál eligió y qué firmó»**. Son tablas distintas por tres razones medidas:

1. `tarificacion_precios` guarda **todos** los precios (187 filas para 15 tarificaciones ≈ 12 por
   cotización). Al cliente se le enseña un subconjunto, ordenado y agrupado — y **eso** es lo que hay
   que poder reconstruir letra a letra dentro de seis meses, porque es lo que firmó.
2. Una tarificación puede reutilizarse en dos presupuestos (dos envíos, dos fechas de caducidad).
3. Lo que se firma tiene que ser **inmutable**. Una fila de `tarificacion_precios` no lo es.

⚠️ **Naming:** `cotizaciones` ya está cogido (cotizador web, 25 filas) y `avisos-presupuesto.ts` en
asegura significa *presupuesto de tiempo*. El módulo nuevo se llama `presupuesto-cliente.ts` en
`@central/module-seguros`, y las tablas `seguros.presupuesto*` (singular, como `portal_obligacion`).

### 2.2 Tablas

```
seguros.presupuesto
  id                uuid pk
  correduria_id     uuid not null
  cliente_id        uuid not null          -- el TOMADOR. La identidad es el id, nunca el nombre (regla 12)
  poliza_id         uuid null              -- la póliza que se compara. NULL = venta nueva, NO «no tiene»
  ramo              text not null
  tarificacion_id   uuid not null references seguros.tarificaciones(id)
  token_hash        text not null unique   -- el enlace, HASHEADO (patrón portal_invitacion)
  canal_aviso       text null check (canal_aviso in ('email','whatsapp_enlace'))
  destino_hash      text null              -- a quién se avisó, hasheado. NUNCA el correo en claro
  vence_el          timestamptz not null   -- ver 2.3
  -- sellos: NULL = «no ha pasado», y en `visto_at` NULL = «no consta» (ver 2.5)
  creado_at         timestamptz not null default now()
  -- 🚨 DOS sellos, no uno (ver 3.3): el correo sale de nuestro servidor y el
  -- proveedor acusa; el enlace de WhatsApp lo manda Alberto desde su móvil y
  -- NADIE sabe si lo mandó. Colapsarlos en `enviado_at` sería afirmar un envío
  -- que no consta.
  enlace_generado_at timestamptz null      -- se abrió WhatsApp con el mensaje escrito
  enviado_at        timestamptz null       -- email aceptado por Resend, o «ya lo he mandado» de Alberto
  visto_at          timestamptz null
  elegido_at        timestamptz null
  aceptado_at       timestamptz null
  emitido_at        timestamptz null
  retirado_at       timestamptz null
  retirado_motivo   text null
  salida            text null check (salida in ('cambio_compania','cambio_mediador'))
  poliza_emitida_id uuid null              -- se rellena al acuñar (registrarPolizaEmitida)
  creado_por        text not null
  constraint retirado_con_motivo check ((retirado_at is null) = (retirado_motivo is null))

seguros.presupuesto_opcion          -- SNAPSHOT, no un puntero
  id, presupuesto_id, orden smallint
  compania, producto, modalidad, categoria
  grupo_cobertura   text null       -- la agrupación de @central/module-seguros. NULL = no clasificable
  prima_eur         numeric(10,2) not null
  entrada_eur       numeric(10,2) null
  franquicia_eur    numeric(10,2) null   -- NULL = el producto NO la declara, jamás «sin franquicia»
  firmeza           text not null check (firmeza in ('firme','condicionado','estimado'))
  requiere_rerate   boolean not null
  referencia_vendor text null            -- el id del quote (Q…), sin él no hay ReRate posible
  coberturas        jsonb not null default '[]'::jsonb
  avisos            jsonb not null default '[]'::jsonb
  portada           boolean not null default false
  papel             text null check (papel in ('equivalente','mas_barata','mejor_cubierta'))
  elegida_at        timestamptz null

seguros.presupuesto_evento          -- append-only, la telemetría
  id, presupuesto_id, tipo, ocurrido_at, origen, detalle jsonb

seguros.firma                       -- genérica: sirve al presupuesto Y a la carta de mediador
  id, correduria_id, documento_tipo, documento_id, cliente_id, identidad_id
  doc_hash, algoritmo, metodo, firmante_nombre, firmante_email, firmante_dni
  ip, user_agent, sello_tiempo, evidencia jsonb, creada_at
  unique (documento_tipo, documento_id)   -- ← la idempotencia de la firma, en la BD
```

**Invariantes que van en la BD y no en un comentario:**

- `CHECK`/trigger: **no se puede poner `enviado_at` sobre un presupuesto cuya tarificación sea
  `simulado = true`.** Es el hermano de `simulada_sin_libro`. Un precio inventado enseñado a un
  cliente es el peor fallo posible de todo esto, y «marcado en la UI» no basta porque la UI cambia.
- `aceptado_at` exige fila en `seguros.firma` (se comprueba en el puerto y se vigila con un test;
  hacerlo con FK circular complica el DDL sin ganar nada).
- `unique (documento_tipo, documento_id)` en la firma: **pulsar dos veces devuelve la primera
  evidencia, no crea una segunda.** Sin esto, un móvil con mala cobertura produce dos firmas con dos
  sellos de tiempo sobre el mismo documento, y entonces no hay «la firma»: hay dos.

### 2.3 Caducidad: tres fuentes y ninguna es del vendor (todavía)

[Seguro] Hoy, al enviar el presupuesto, **no sabemos cuánto vale el precio**: `expirationDate` solo
aparece tras el ReRate, y los 15 precios reales tenían `expires_at` a NULL. Así que `vence_el` se
calcula como **el mínimo de lo que sí se sabe**:

1. `fecha_efecto` de la tarificación menos un día. Una fecha de efecto pasada mata el proyecto: el
   ReRate contesta «The effective date cannot be before today» y `effectiveDate` es de solo lectura
   [Seguro, incidente del 13/09/2026, proyecto 40685666].
2. `enviado_at + VALIDEZ_PRESUPUESTO_DIAS` (constante de la casa, ver §7 Q1).
3. `expirationDate` de la oferta, **si algún día llega** — o sea, solo en presupuestos que ya hayan
   pasado por un ReRate.

Y el copy: **nunca «válido hasta el X» a secas**, porque eso suena a compromiso de la compañía.
«Precio calculado el <fecha>. Lo confirmo con la compañía antes de contratar; si tardas más de
<n> días puede cambiar.» La procedencia de la fecha se pinta (regla 4 del banco de ideas).

Cuando `vence_el` ha pasado: la pantalla **sigue enseñando el presupuesto** (es información suya,
tachar la página sería peor) con los precios claramente marcados como caducados, los botones de
elegir/firmar apagados, y un botón **«Pídeme un precio actualizado»** que **no llama al vendor**:
escribe `presupuesto_evento('actualizacion_pedida')` y manda un Telegram a Alberto. Es la idea G
tal cual («el botón que gasta nunca es automático ni del cliente»). Cooldown de 1/día por
presupuesto, para que no sea un timbre.

### 2.4 La aceptación es una FIRMA, no un botón

Esto es lo que convierte el §2 de un CRUD en una pieza que aguanta una reclamación.
`@central/core-firma` ya da firma avanzada eIDAS art. 26: hash SHA-256 del documento, sello de
tiempo, consentimiento textual, método `otp_email` y `cumpleArt26()` evaluando las cuatro
condiciones. El molde vivo es `apps/rrhh` (`lib/firma.ts` + `rrhh.firmas` + la orquestación OTP de
`@central/module-rrhh`).

**El documento que se firma** es un PDF/HTML generado desde `presupuesto` + `presupuesto_opcion`
(el snapshot), que incluye: quién es el mediador y su clave DGSFP, el tipo de asesoramiento, la
opción elegida con su compañía, prima, franquicia, garantías y firmeza, la fecha de cálculo y de
caducidad, las compañías consultadas y las que no dieron precio, y **en su cara** el aviso del
párrafo siguiente. El `doc_hash` de la evidencia se calcula sobre esos bytes exactos.

🚨 **Lo más importante de toda la spec: la firma NO es la contratación.** Entre que el cliente firma
y que la compañía emite hay un ReRate que puede mover el precio y un Submit que puede fallar. Si el
documento no lo dice, el cliente se cree cubierto y no lo está, y eso no es un fallo de UX: es una
reclamación. El documento y la pantalla de confirmación dicen, literalmente, que **la aceptación es
un encargo al corredor para tramitar, que el precio se confirma con la compañía y que no hay
cobertura hasta que la compañía emita y lo comunique**. Y `aceptado sin emitir` es la cola más
urgente del §2.5, con Telegram inmediato.

**Quién compone la firma, y por qué no puede ser el portal.** `cumpleArt26()` exige
`firmante.nombre` **y** (`email` **o** `dni`). El portal **no puede aportar ninguno de los dos**: su
rol no tiene GRANT sobre el email en claro ni sobre `clientes.dni`, y `portal_canal` guarda un hash
con pimienta que no se revierte. El único instante en que el portal ve el correo es el canje del
código. Por tanto:

> La firma se compone en **`apps/asegura`** (`prisma_seguros`, que sí lee el correo cifrado), por el
> puerto `POST /api/operador/presupuesto/{id}/firmar`. El portal pinta, recoge el nombre tecleado y
> el código, y llama al puerto. **No se le da ni un GRANT nuevo sobre PII.**

Es el mismo reparto que ya existe para el correo de avisos (regla 15: el portal no tiene a quién
escribir). El OTP de firma lo emite y manda también asegura (`POST …/codigo-firma`), y devuelve solo
el correo enmascarado (`enmascararEmail` de module-rrhh) para que el portal pueda decir «te he
mandado un código a j***@gmail.com».

**Lo que esto cuesta y hay que declarar:** una llamada servidor-a-servidor NUEVA, portal → asegura,
que hoy no existe (el portal lee la cartera directamente con su rol, no por el puerto). Necesita
`ASEGURA_BASE_URL` y el secreto del puerto en las envs de `asegura-portal`, **sin fallback a un
literal** (`requireSecret()` de `@central/core-identity`; lo obliga `test/regression-secrets.test.ts`).
Y un modo de fallo nuevo: si asegura está caída, el cliente ve «no hemos podido registrar tu firma,
inténtalo en unos minutos» — **un 503 honesto, nunca un «listo» optimista**. Si me equivoco en esto,
el síntoma sería una firma dada por buena sin evidencia escrita; se verifica pidiendo la evidencia
de vuelta y comprobando `cumpleArt26().ok` antes de sellar `aceptado_at`.

**¿OTP fresco, o vale la sesión?** La sesión del portal dura 30 días. Firmar con una sesión de hace
tres semanas en un móvil que se prestó cumple la letra (`metodo: 'sesion_token'` es válido en
`cumpleArt26`) y no cumple el espíritu. **Recomiendo OTP fresco**, igual que rrhh: `metodo:
'otp_email'`, 10 minutos, hasheado, y se borra al firmar.

**Dónde vive la orquestación.** `packages/module-rrhh/src/firma.ts` declara en su cabecera que es
«AGNÓSTICA DE VERTICAL» — y lo es. Que `apps/asegura` dependa de `@central/module-rrhh` para firmar
un presupuesto de seguros es feo pero funciona; duplicarla sería el fallo que este repo persigue
(dos copias y una deja de vigilar). **Propuesta (es opinión de diseño, no un bug):** mover
`firma.ts` + sus puertos a `@central/core-firma` y que `module-rrhh` lo re-exporte. Qué se rompe si
me equivoco: los imports de `apps/rrhh/lib/firma.ts` y `firma-empresa.ts`; se verifica con el
typecheck de rrhh y sus tests, que ya existen (`packages/module-rrhh/src/firma.test.ts`). **Si se
prefiere no tocar rrhh en este PR, la alternativa correcta es depender de `@central/module-rrhh` tal
cual y anotar la deuda — nunca copiar el fichero.**

### 2.5 Estados: se DERIVAN, y «no consta» es uno de ellos

Como el estado del cliente (`estadoCliente()`), el del presupuesto **no se guarda**: se deriva de
los sellos con una función pura en `@central/module-seguros`:

```
estadoPresupuesto(p, hoy) →
  'retirado'   si retirado_at          (manda sobre todo lo demás)
  'emitido'    si emitido_at
  'aceptado'   si aceptado_at          (= firmado)
  'elegido'    si elegido_at
  'caducado'   si vence_el < hoy       (antes que 'visto': un visto caducado es un caducado)
  'visto'      si visto_at
  'enviado'    si enviado_at
  'enlazado'   si enlace_generado_at   -- 🚨 WhatsApp: se abrió el chat, no consta que se enviara
  'borrador'   en otro caso
```

🚨 **`enlazado` no es `enviado`, y la pantalla no los pinta igual.** Con el deep link, el mensaje sale
del WhatsApp de Alberto: el sistema sabe que se generó el enlace y **no puede saber si le dio a
enviar**. Fundirlos daría una cola de Hoy que dice «enviado hace 4 días, no lo ha abierto» sobre algo
que quizá nunca salió, y Alberto perseguiría a un cliente que no ha recibido nada. Es la misma regla
que `invitacion-whatsapp.ts` ya aplica hoy, literalmente: *«no se anota nada en el historial: anotar
"se le invitó por WhatsApp" sobre un clic que solo abrió una ventana es la afirmación falsa de
siempre, y encima en el sitio donde más dura»*. La única forma de pasar de `enlazado` a `enviado` es
que **Alberto lo diga** con una casilla «ya lo he mandado» (mismo patrón que `carta_enviada_en` de la
idea Q), y esa casilla es opcional: dejarla sin marcar es un estado legítimo, no un olvido que haya
que rellenar.

Quién escribe cada transición:

| Transición | Quién | Cómo |
|---|---|---|
| borrador → enlazado | **Alberto**, al pulsar el botón de WhatsApp | sella `enlace_generado_at`; el mensaje lo manda él desde su WhatsApp |
| enlazado/borrador → enviado | **Alberto** | `POST /api/operador/presupuesto/{id}/enviar` (email), o la casilla «ya lo he mandado» (WhatsApp) |
| enviado → visto | el **portal**, tras el canje del código | `UPDATE presupuesto SET visto_at = coalesce(visto_at, now())` filtrado por el `cliente_id` del vínculo |
| visto → elegido | el **portal** | sella `presupuesto_opcion.elegida_at` + `presupuesto.elegido_at`. **Reversible** mientras no haya firma |
| elegido → aceptado | el **puerto de asegura** | solo con evidencia de firma válida |
| aceptado → emitido | **asegura** | al acuñar (`registrarPolizaEmitida`), rellena `poliza_emitida_id` |
| → caducado | nadie | derivado |
| → retirado | **Alberto**, con motivo | |

Cada transición deja fila en `historial_interno` (tipo `presupuesto`), con `quien` =
`alberto` / `portal:<identidad_id>` / `sistema`, y **nunca el valor de un dato de identidad**
(principio 3 de la visión). El importe sí puede ir: no es dato de identidad.

**«No consta» no es «no».** `visto_at IS NULL` significa **«no consta que lo haya abierto»**, y eso
NO es «no lo ha abierto»: el cliente puede tener las imágenes bloqueadas, puede leerlo en la vista
previa, o el correo puede haberse abierto sin que el sello llegara. La pantalla de Alberto lo dice
con esas palabras. Y **`abierto_correo` ≠ `abierto_portal`**: el primero es telemetría de Resend y
la disparan también los escáneres antivirus; el segundo exige haber canjeado un código que llegó a
su correo. Solo el segundo sella `visto_at`; el primero se guarda en `presupuesto_evento` con su
`origen` y se pinta aparte, como pista, no como hecho.

**Cola de trabajo en `/correduria` → Hoy** (`PresupuestosEnCurso.tsx`, con `onContador` al padre y
los tres desenlaces que manda la skill — `{n}` · `n+` · `!`, **nunca 0**):

- 🔴 **Firmado sin emitir** — el cliente ya ha dicho que sí y el seguro no existe. Telegram inmediato.
- 🟠 Elegido sin firmar (>2 días) — está a un paso.
- 🟡 Caduca en ≤3 días.
- 🟡 Abierto sin elegir (>5 días).
- ⚪ Enviado y sin constancia de apertura (>3 días) — con el matiz de arriba.
- ⚪ **Enlazado y sin confirmar** (>1 día) — «abriste WhatsApp pero no me has dicho si lo mandaste».
  Es la única fila de la cola cuya acción es de Alberto consigo mismo.

### 2.6 Observatorio de precios (ideas F y L): no se construye, pero el modelo no lo impide

Cada presupuesto enviado congela **precio real, compañía, ramo, coberturas, franquicia y fecha**,
más el riesgo completo vía `tarificacion_id → peticion jsonb`. Para que eso siga siendo consultable
después basta con tres decisiones aquí y ahora, todas gratis:

1. `presupuesto_opcion` **no se borra nunca**: retirar un presupuesto es un sello, no un `DELETE`.
2. Índice `(ramo, creado_at desc)` en `presupuesto_opcion`, como el que ya tiene
   `tarificacion_precios` para la horquilla.
3. Lo simulado **no entra** (el CHECK de 2.2), igual que el índice parcial `where not simulado` de
   `tarificaciones` deja escrito en el esquema que lo inventado no alimenta ninguna estimación.

Con 18 tarificaciones la muestra sigue siendo minúscula y Alberto ya decidió el 12/09 no automatizar
el precio orientativo. Esto no lo cambia: solo evita que dentro de un año haya que reconstruirlo.

---

## §3. El enlace, la identidad y el canal

### 3.1 El enlace no abre sesión. El token dice QUÉ, el código dice QUIÉN

El repo ya resolvió exactamente este problema en `seguros.portal_invitacion` (04/09/2026), y la
solución se copia tal cual porque las tres razones valen igual aquí:

1. **Se lo comen los escáneres.** Un GET que consume estado lo gastan el antivirus del correo y el
   prefetch antes de que la persona lo toque.
2. **Un token en un correo es una llave reenviable.** Quien reenvía el mensaje, o quien lee el buzón
   compartido de una empresa, entraría a ver el precio, la compañía y el bien asegurado de un
   tercero — y aquí, además, en ramos como salud, vida o decesos eso roza dato de categoría especial.
3. **«Aceptado por el que tenía el enlace» no es prueba de consentimiento** (art. 7.1 RGPD). Y aquí
   encima se firma.

Mecánica:
- `GET /presupuesto/<token>` es **público** y enseña solo una carátula: «Alberto Suárez, de Grupo
  ASegura, te ha preparado un presupuesto para tu seguro de <bien>. Entra con tu correo para verlo»,
  + el formulario de código con el destino **pre-rellenado** (mismo patrón `?d=&c=` del correo de
  acceso). **Ni un precio, ni una compañía, ni un número de póliza** en esa carátula.
- Tras canjear el código, el presupuesto se enseña si **(a)** el `portal_canal.valor_hash` de quien
  entra coincide con `presupuesto.destino_hash`, **o (b)** su `portal_vinculo.cliente_id` es el
  `presupuesto.cliente_id`. Dos ramas porque una persona puede tener dos correos suyos y entrar por
  el otro.
- Si no se cumple ninguna: **403 con texto neutro**, sin decir de quién es el presupuesto (sería un
  oráculo de la cartera, el mismo razonamiento que `peticion-acceso.ts`), y se escribe un
  `presupuesto_evento('apertura_ajena')` para que Alberto lo sepa.
- `vinculo = ambiguo` (el correo aparece en más de una ficha) → **no se enseña**, misma regla que la
  bóveda, y con la frase que ya existe («lo está revisando el corredor»), no con «no eres cliente».
- El token se guarda **hasheado** (`token_hash`), 256 bits. Una tabla de presupuestos con sus tokens
  legibles es una tabla de llaves.

**Email compartido.** El email es identificador limpio en esta cartera [Seguro: 0 duplicados entre
clientes distintos], así que el riesgo no es la ambigüedad de la ficha sino el **buzón familiar**. Lo
cubre el código de un solo uso: quien entra ha demostrado acceso a ese buzón, que es exactamente el
mismo nivel de prueba con el que ya se le enseña toda su cartera en la bóveda. No se sube el listón
aquí: sería incoherente enseñarle sus pólizas y esconderle un presupuesto.

### 3.2 Quién manda el correo: asegura, no el portal

[Seguro] `portal_canal` guarda **solo** `valor_hash`, y el rol del portal no tiene GRANT sobre la
columna del email. El envío vive en `apps/asegura` (`lib/correo-presupuesto.ts`, hermano de
`correo-invitacion-portal.ts`), con `prisma_seguros`, que sí lee `cliente_emails` cifrado. **No se
«arregla» metiendo un transporte de correo en el portal**: lo caza
`test/regression-portal-obligaciones.test.ts`.

Y las dos respuestas que no se pueden confundir, que ya están resueltas en el repo:
- `sin_enlace` (503): falta `PORTAL_PUBLIC_URL` o no es https → **no se escribe la fila, no se
  sella `enviado_at`**. Aquí el enlace ES el mecanismo (a diferencia del correo de acceso, donde el
  código abre igual la puerta).
- `envio_fallido` (502): el presupuesto existe, lo que falló fue avisar → se dice así, y el
  presupuesto queda en `borrador` con el motivo, reintentable.

### 3.3 El selector de canal: aviso ≠ identidad

Alberto pidió «opción por mail o WhatsApp». Se construye así, y la separación es deliberada:

> **El canal de AVISO lo elige Alberto. El canal de IDENTIDAD es siempre el email.**

El aviso es «te he preparado un presupuesto, ábrelo aquí». La identidad es el código de un solo uso
que abre el portal. Razón medida: **un móvil identifica un HOGAR, no a una persona** (740 números
compartidos por 1.599 fichas), y el email sí es identificador limpio (0 duplicados). Un presupuesto
es un dato económico, y en salud/vida/decesos roza el dato de salud.

No me parece restrictivo, y añado un argumento que lo hace inocuo: **el aviso por WhatsApp no lleva
ni precio ni compañía ni bien asegurado** — solo el nombre del corredor y el enlace. Aunque el número
sea el del hogar, no se filtra nada: la puerta sigue siendo el correo. Con eso, permitir WhatsApp
como aviso no baja el listón de seguridad ni un milímetro.

Lo que **no** hace es llegar a quien no tiene correo: a ese le llevaría a una puerta que no puede
abrir. Cómo se resuelve ese hueco, en §3.4.

**Dos opciones en el selector, y las dos funcionan hoy. No hace falta WABA.**

| Opción | Qué hace | Qué sella |
|---|---|---|
| **Email** | `apps/asegura` manda el correo por Resend. Sale de nuestro servidor y el proveedor acusa | `enviado_at` |
| **WhatsApp (deep link)** | El botón **no manda nada**: abre `wa.me` con el texto y el enlace ya escritos y **Alberto le da a enviar desde su propio WhatsApp** | `enlace_generado_at`; `enviado_at` solo si él marca «ya lo he mandado» |

**Lo que se reutiliza TAL CUAL** (nada de esto se rediseña; está construido, probado y en producción
en `TabContactos.tsx`, `BotonWhatsapp.tsx`, `Recaptacion.tsx`, `BuscadorCartera.tsx`, `ContactosFicha.tsx`
y `AccionesContacto.tsx`):

| Pieza | Qué aporta aquí |
|---|---|
| `apps/plataforma/lib/telefono-wa.ts` → `urlWhatsapp()`, `esMovilEs()` | **La fuente única del repo** para «¿esto es un móvil?». `null` NO es «no tiene WhatsApp», es «no se puede afirmar que sea un móvil» — y entonces no se pinta el botón, porque un fijo abre el chat igual y el «este número no está en WhatsApp» solo se ve DESPUÉS de pulsar |
| `apps/plataforma/lib/invitacion-whatsapp.ts` → `enlaceWhatsappConMensaje()`, `movilParaInvitar()`, `canalWhatsapp()` | El enlace con el texto ya encodeado, el primer móvil de la ficha, y **los cinco desenlaces** del canal (`listo` · `no_procede` · `sin_movil` · `sin_correo_que_nombrar` · `sin_enlace`) |
| `apps/plataforma/lib/acciones-contacto.ts` → `accionesContacto()` | Compone `tel:`/`mailto:`/`wa.me` en un sitio, y aporta el estado `ilegible` (cifrado que no abre → **no se ofrece nada**, porque lo que tenemos delante no es su teléfono) |
| `@central/module-seguros` → `mensaje-whatsapp.ts` | El precedente de dónde vive el copy: en el módulo puro, donde pasa los cepos de `copy-regulado` |

**Lo único que hay que añadir**: el texto del mensaje (`mensajePresupuestoWhatsapp()`, en
`@central/module-seguros`, junto a los demás y con su paso por `revisarCopy()`) y el enlace al
presupuesto. El botón de la parrilla llama a `canalWhatsapp()` con ese texto y pinta lo que devuelva.

⚠️ El único ajuste real: hoy `canalWhatsapp()` está atado a la **invitación al portal** (sus
parámetros son `accion: AccionPortal` y `portal: PortalCartera`). Para el presupuesto hay que
**generalizar la firma** —el texto y el enlace como entrada, el resto igual— manteniendo los cinco
desenlaces y sus notas. Es una refactorización pequeña y acotada, **no una copia**: si se copia, el
día que cambie la regla de «con qué correo entra» una de las dos pantallas dejará de aplicarla sin
que nada falle. Qué se rompe si me equivoco: su único llamante de hoy
(`TabContactos.tsx`); se verifica con el typecheck de plataforma y con
`apps/plataforma/lib/invitacion-whatsapp.test.ts`, que ya cubre los cinco desenlaces.

**Si algún día hace falta envío automático** (lotes, acuse de entrega, respuestas entrantes) habría
que montar la WABA con sus plantillas y su coste. Hoy **no hace falta y no se diseña**: la decisión
está tomada y es la barata.

Y una consecuencia a favor que conviene decir en voz alta: con deep link **la regla de
comunicaciones salientes se cumple sola**. No hay entrega automática a un tercero porque no hay
entrega automática de nada: el mensaje sale del teléfono de Alberto, con él mirándolo.

### 3.4 A quién se le puede mandar, dicho ANTES del botón

Medido hoy sobre los **100 clientes de cartera viva**: 62 con email, 71 con teléfono, 73 con alguno,
**11 con teléfono y sin correo**, 27 sin nada en la ficha. Por email solo se llega a poco más de la
mitad de la cartera — ese es el argumento de negocio a favor de WhatsApp.

⚠️ **Cuántos de esos 71 teléfonos son móviles no lo sé, y no se puede saber desde SQL**: la columna
está cifrada y un `regexp` sobre ella devuelve 0 con 71 teléfonos delante (lo intenté). El veredicto
lo da `movilParaInvitar()` después de descifrar, ficha a ficha, y por eso la pantalla lo resuelve en
el momento y no hay aquí una cifra de «a cuántos se podría escribir por WhatsApp». **Un 0 que sale de
una columna cifrada no es un dato: es el artefacto de haber medido mal.**

**El hueco del que pregunta Alberto: teléfono sí, correo no (≤11 clientes).** A esa persona el
WhatsApp le llevaría a una puerta que no puede abrir, porque el código de acceso va al email. La
respuesta **ya está escrita en el repo y no hay que decidir nada nuevo**: `canalWhatsapp()` devuelve
`sin_correo_que_nombrar` y **no ofrece el canal**, con esta razón textual, que vale igual para el
presupuesto:

> *«Por WhatsApp haría falta decirle con qué correo entra, y asegura no ha podido confirmar cuál es.
> No se nombra uno a ojo: si no es el que el portal reconoce, teclearía su dirección y no recibiría
> ningún código.»*

Y el comentario del propio módulo dice el principio que lo sostiene, que es el que defiendo:
**el canal nuevo no puede ser un atajo alrededor de los frenos del viejo.**

Así que, de las dos salidas posibles para esos ≤11, elijo la primera:

1. ✅ **Pedirle el correo en ese mismo flujo.** El botón de WhatsApp, en vez de apagarse a secas,
   ofrece **otro** mensaje: «te he preparado un presupuesto; dime un correo y te mando el acceso».
   Es un mensaje que no expone nada, que Alberto manda igual a mano, y que además **limpia la ficha**
   (§4bis.4): el correo que conteste entra por el mismo camino que cualquier otro dato confirmado.
2. ❌ **Enseñar el presupuesto sin datos económicos hasta identificarse.** La descarto: sería una
   pantalla nueva, con su propio modelo de «qué se puede ver sin identidad», para 11 personas — y la
   primera vez que alguien se equivoque de umbral, el precio de un cliente se verá con un enlace
   reenviado. El coste de mantener esa segunda escala de visibilidad es mayor que el de pedir un
   correo.

**Y la ficha no es el único sitio** (regla 19; le costó un fallo real a esta casa: `Esquiansa` salía
«ilocalizable» teniendo a su contacto de siempre con ficha, email y teléfono). La pantalla de envío
llama a `contactoEfectivo()` de `@central/module-seguros` y, **antes de que Alberto pulse**, dice:

1. **A qué dirección o número va.**
2. **De dónde sale ese dato**: ficha · su propio dato colgado de la póliza (`poliza_intervinientes`
   con su `cliente_id`) · otra persona de la póliza · `cliente_relaciones`.
3. Si no hay ninguno: **el botón sale apagado**, con el motivo. No se descubre porque no conteste.

🚨 **Y la regla que hay que escribir, porque `contactoEfectivo()` no la sabe:** un presupuesto solo
se manda a un canal **DEL TOMADOR**. Si `viaEmail === 'interviniente'` y `quien !== null` —el correo
es de un tercero—, el botón no manda: ofrece «pídele el correo a <nombre>». Es la misma línea que ya
trazó el preaviso del art. 22 LCS: **tener a quién llamar no es poder notificar**. Un presupuesto con
precios enviado al correo del conductor habitual es el seguro del padre en el buzón del hijo.

Guardián: extender `test/regression-clientes-sin-canal.test.ts`, o uno hermano, para que la pantalla
de envío no pueda leer solo las columnas de la ficha.

### 3.5 Nada sale sin que Alberto pulse

Regla global de comunicaciones salientes: **el envío lo dispara Alberto, por cliente y por
presupuesto**. No hay lote, no hay cron, no hay «mandar a todos los que vencen». La cola del §2.5
le dice a quién le tocaría; el botón lo pulsa él.

---

## §4. La pantalla del presupuesto (el encargo de «bonito»)

No es maquillaje: es la pantalla donde alguien decide gastarse su dinero, y donde la casa se juega
la diferencia entre informar y asesorar.

### 4.1 Jerarquía: la comparativa ES la portada

1. **Qué tienes hoy.** Compañía, prima, vencimiento y el bien descrito con `describirBien()` —
   **nunca el número de póliza como identificador** (regla permanente del portal: «el nº de póliza
   NUNCA identifica una póliza para el cliente»). Si no hay póliza actual (`poliza_id IS NULL`), este
   bloque **no se inventa**: se dice «no tengo tu seguro actual» y **no se calcula ningún ahorro**.
2. **Tres opciones, no veinticuatro** (§4.2), como tarjetas.
3. **Comparativa por garantía** contra la actual (§4.3).
4. `<details>` **«Ver todas las opciones (N)»**, cerrado y con **montaje perezoso** — un `<details>`
   cerrado igualmente crea todo su DOM (regla de rendimiento de la casa).
5. Las compañías que **no dieron precio**, plegadas. Sin ellas, «5 opciones» se lee como «esto es el
   mercado entero», y es justo lo que sostiene el «análisis objetivo».
6. Las dos salidas (§1): «Me cambio» y «Llévame tú el seguro», con el mismo peso.
7. Pie regulado (§4.5).

### 4.2 La regla de las tres — pura, testeable, en `@central/module-seguros`

`elegirPortada(opciones, actual)` → `{ equivalente, masBarata, mejorCubierta, descartados, motivos }`.

- **Equivalente**: la opción cuyo grupo de cobertura coincide con el de la póliza actual, y dentro de
  ese grupo la más barata.
- **Más barata**: la más barata **dentro del grupo de la equivalente**. Si no hay equivalente, la más
  barata de todas **pero marcada «cobertura distinta de la tuya»**. 🚨 Ordenar por precio mezclando
  Terceros y Todo Riesgo **es la mentira que motiva toda esta spec**, y la mentira no desaparece
  porque la lista sea corta: se agrava, porque una lista de tres se lee entera.
- **Mejor cubierta**: el grupo de cobertura más alto disponible y, dentro de él, la más barata. Nunca
  «la más cara»: caro no es sinónimo de mejor y decirlo así sería asesoramiento inventado.
- **Si dos papeles caen en la misma opción, se funden y se dice** («es a la vez la equivalente y la
  más barata»). No se rellena el hueco con una cualquiera para tener tres tarjetas.

**Y el `null` que importa.** `equivalente: null` tiene **dos motivos distintos** y la pantalla dice
cuál:
- `actual_sin_coberturas`: la póliza actual no trae el desglose legible (CIMA no siempre lo manda) →
  **«no puedo compararlo con lo que tienes»**. No es «no hay nada parecido».
- `sin_equivalente`: la actual sí se leyó y ninguna opción cae en su grupo → «ninguna compañía me ha
  dado un precio con tu misma cobertura».
Colapsar los dos en «no hay equivalente» es exactamente el fallo raíz del repo, sobre la frase que
más pesa en la decisión.

**Reutilización, no duplicación.** La agrupación por cobertura y los filtros **ya están en `main`**
[Seguro, leídos en `packages/module-seguros/src/index.ts`], así que `elegirPortada` no inventa nada:

- `nivelCobertura(etiqueta, ramo)` → `Nivel` con su `rango` y su `familia`. **El `ramo` importa**:
  «Todo Riesgo» es el tope de auto **y** el nombre que Mapfre le da a su hogar completo; sin ramo, un
  hogar de 84,80€ cae en el grupo del todo riesgo de coche. Eso es exactamente el error que
  `elegirPortada` no puede cometer, y ya está resuelto ahí.
- `agruparPrecios(filas, opciones)` → `Comparativa { grupos, total, mostrados, ocultosPorFiltro,
  bloqueadasOcultas, avisoEscala, nivelesPresentes, companiasPresentes }`. Ordena **entre** grupos de
  menos a más cobertura y **dentro** por prima ascendente con los `null` al final.
- `GrupoCobertura.masBarataEmitible` — «la más barata **que sí se puede emitir**, que es la que de
  verdad se vende». **`masBarata` de la portada sale de ahí, no de un `sort` propio.**
- `Comparativa.avisoEscala` (`string | null`) — cuándo los grupos **no** son comparables entre sí.
  Si viene non-null, la portada **lo pinta**: es literalmente la advertencia que esta spec existe
  para no callar.
- `defensaDeCartera()` / `bloqueaEmision()` / `fraseDefensa()` de `defensa-cartera.ts`, con sus
  **cuatro** estados (`desconocida` incluida) — una opción bloqueada no se ofrece como portada.
- `eurEs()` para el importe en formato español, en vez de un helper nuevo.

`elegirPortada(comparativa, actual)` es por tanto **una capa fina encima**, no un segundo motor: lee
`Comparativa`, localiza el grupo de la póliza actual y elige tres filas. Y como allí: **un valor que
no se reconoce se DECLARA, nunca se ignora** — ignorarlo convierte «las de tu cobertura» en «todas».

### 4.3 Comparar lo que no es comparable

La tabla de garantías tiene **cuatro** estados por línea, no dos:

| Estado | Cuándo | Cómo se pinta |
|---|---|---|
| `igual` | la garantía está en las dos | ✓ |
| `mejor` | está en la nueva y no en la actual, o con más capital | ▲ |
| `peor` | está en la actual y no en la nueva | ▼ **y se pinta siempre, aunque estropee la venta** |
| `no_consta` | la actual no trae ese desglose | «no lo sé» |

`no_consta` **no se pinta como `igual`**. Y una opción con garantías `peor` no puede presentarse como
«equivalente»: si al comparar aparece un ▼, deja de ser equivalente y pasa a su grupo real.

**Franquicias.** `franquicia_eur = NULL` significa **«el producto no declara franquicia»**, jamás
«sin franquicia» — la pantalla del corredor ya lo hace bien y esta lo hereda. Va **en la tarjeta,
pegada al precio**, no escondida en el detalle: enseñar un todo riesgo callando 1.500€ de franquicia
es la versión cara de leer mal un dato que sí está.

**Firmeza.** [Seguro] **los 187 precios guardados son `estimado`/`condicionado`; ni uno `firme`.** O
sea que hoy, en la práctica, **el 100% de lo que se le enseñaría a un cliente no es una oferta
cerrada**. Consecuencias, no negociables:
- La portada **no puede decir «tu precio es 412,30€»**. Dice «precio calculado: 412,30€ — lo
  confirmo con la compañía antes de contratar».
- Un badge de firmeza **por tarjeta**, no una nota al pie que se lee una vez.
- El documento que se firma repite la advertencia (§2.4).
Si algún día llegan precios `firme`, la pantalla puede quitar la advertencia **de esa opción**, no de
la página.

### 4.4 Dinero, responsive y forma

- **Formato español obligatorio**: `2.162,49€`, punto de miles (también en 4 cifras), coma decimal,
  **€ detrás**. Nada de `€412.30`. En `apps/plataforma` está `eur()`; el portal replica la misma
  convención en un helper único, no en cada componente.
- **≥320 px**: tarjetas apiladas; la tabla de garantías se convierte en filas etiquetadas, no en
  scroll horizontal (una comparación que hay que arrastrar no se compara); botones **44 px** táctiles.
  Y se mide **sobre el scroller real**, no sobre `body` (la trampa de `LayoutShell` en plataforma), y
  se comprueba que nada `position: fixed` tape el CTA — un `fixed` **no desborda, se pone encima**.
- **Bloques plegados por defecto** con montaje perezoso, como manda la casa (la bóveda y los recibos
  ya nacen plegados).
- Marca: colores y tipografía de `MARCA_ASEGURA` (`@central/brand`). **Ni un hex a mano.**

### 4.5 El copy regulado

- **Todo texto generado pasa por `revisarCopy()`** de `packages/module-seguros/src/copy-regulado.ts`,
  con test que lee el fuente — igual que `apps/asegura-web/lib/ramos.test.ts`. Prohibido prometer
  ahorro, cifras de ahorro, superlativos de precio («el mejor precio», «más barato») o garantías que
  la correduría no puede dar. Aquí el daño es peor que en la web: **un presupuesto ya es
  asesoramiento**, y una promesa de ahorro dentro de él es una promesa contractualizable.
- Bloque de mediador, visible y no plegado: nombre, **clave DGSFP CS-F/0170**, que el asesoramiento
  se presta **sobre la base de un análisis objetivo**, cuántas compañías se consultaron y cuántas
  dieron precio, y cómo reclamar. Todo desde `MEDIADOR` de `@central/module-seguros`: **ni la clave
  ni el nombre se teclean aquí**.
- **«Grupo ASegura»**, con A y S mayúsculas. Lo vigila `test/regression-nombre-comercial-asegura.test.ts`.

---

## §4bis. Los datos que faltan para emitir

Alberto: «Revisar los datos que tengo del cliente automáticamente y que el mail le diga los datos
que necesitaría para emitir.»

### 4bis.1 El correo NO pide datos: dice cuántos faltan y lleva al portal

El correo dice «para poder contratar me faltan 3 datos tuyos — entra y los confirmas en un minuto»
y lleva al portal. **No pide el DNI, ni el IBAN, ni la fecha de nacimiento.** Tres razones, y la
primera basta:

1. Un correo que pide DNI e IBAN es **indistinguible de un phishing**, y entrena al cliente a
   responder a correos que piden datos bancarios. El día que alguien suplante el dominio de la
   correduría, el cliente ya está entrenado para contestar. El coste de esa lección no lo paga quien
   la enseñó.
2. El correo no es un canal con identidad: un buzón se comparte, se reenvía y se archiva. El IBAN
   escrito en un correo se queda ahí para siempre, en dos buzones.
3. El portal ya tiene identidad (código de un solo uso), transporte cifrado, cifrado en reposo para
   la PII y un modelo de aislamiento con guardián. El correo no tiene nada de eso.

### 4bis.2 Son TRES listas, y hay que modelarlas separadas

| Lista | Qué es | ¿Existe? |
|---|---|---|
| **(a) Para TARIFICAR** | los reparos de la precalificación | ✅ existe: `revisarDatosAuto()` → `Reparo[]`, y `desde-cartera.ts` devuelve **tres cosas** (lo que se manda, lo **supuesto** y lo que **falta**) |
| **(b) Para EMITIR, en general** | IBAN + mandato SEPA, DNI completo, fecha de nacimiento, **dirección con tipo/nombre/número de vía** y **correo** — el Submit los exige y **no los admite después** | 🟡 a medias: `CAMPOS_PERSONA_SUBMIT` y `huecosPersonaParaEmitir()` existen, pero **operan sobre el proyecto del vendor, no sobre la ficha**, y el mandato SEPA no existe |
| **(c) Para emitir EN ESA COMPAÑÍA** | lo que pide cada compañía: p. ej. los **4 consentimientos de Allianz** en `product.options` del Submit | 🔴 **no se puede saber antes de elegir** (ver abajo) |

**(b) necesita una función nueva, pura y testeable**, en `@central/module-seguros`:
`huecosParaEmitirDesdeFicha(ficha)` → `{ campo, deQuien: 'tomador'|'propietario'|'conductor', estado:
'ok' | 'falta' | 'no_legible' }`. No es un duplicado de `huecosPersonaParaEmitir`: aquella mira el
JSON del vendor (y se usa justo antes del Submit, para reparar por PATCH), esta mira lo nuestro, y se
usa **semanas antes**, al preparar el presupuesto. El incidente del 12/09/2026 es el que justifica
que exista: **7 cargos de 0,50€ seguidos sobre la póliza de Pilar Franco Ruz**, cada uno descubriendo
UN campo que faltaba, porque «el email y la calle no hacen falta para el precio» — cierto para
tarificar, falso para emitir.

**(c) tiene una restricción de orden que hay que decir en voz alta y que condiciona el producto.** La
única fuente real es `camposDeEmision()` (`GET /insurances/{id}/policy-application-fields?offerId=`),
que es **gratis pero exige un `offerId`**, o sea **solo existe después del ReRate** — que en la Fase 2
lo lanza Alberto después de que el cliente elija. Y las dos alternativas no sirven:
- `GET /api/operador/codeoscopic/faltan-producto` es **telemetría** de rechazos pasados agregada por
  compañía [Seguro, leído su `route.ts`]. Dice «a Allianz le ha faltado algo 9 veces», no «a este
  cliente le falta X». Usarlo como lista sería inventar.
- `lib/codeoscopic/product-form.ts` es el **relay del widget del corredor**: pinta el formulario real
  de la compañía en la pantalla de Alberto. No es una API de «qué falta», y su iframe no se le puede
  poner delante a un cliente.

⇒ **Consecuencia de producto, honesta: con el presupuesto solo se pueden pedir los datos comunes (b).
Los de compañía (c) se piden en una segunda vuelta, tras elegir.** Y eso está *bien*: pedirlo todo de
golpe hace abandonar. La pantalla lo dice así («ahora los datos que hacen falta siempre; si eliges
una compañía que pida algo más, te lo pido entonces»), en vez de prometer una lista completa que no
puede calcular.

🚨 Y sobre los 4 consentimientos de Allianz: `conProductoPorDefecto()` los pone a `false` porque ese
es el default del propio formulario y **ninguno se decide a favor del cliente sin que él lo diga**. Si
alguna vez se le preguntan al cliente, se le **preguntan**; no se le decide y luego se le enseña
marcado.

### 4bis.3 No se le pide nada que ya tengamos

El contacto y los datos de un cliente viven en **cuatro** sitios (regla 19 + la cuarta fuente que
añadió Alberto el 05/09): su ficha, **su propio dato colgado de la póliza** (`poliza_intervinientes`
con su `cliente_id`), otra persona de la póliza, y `cliente_relaciones`. La consolidación vive en una
función **pura** de `@central/module-seguros` —`datosDelTomador(ficha, intervinientes, relaciones)`,
hermana de `contactoEfectivo()`— con su test, y **no se reimplementa en la pantalla**.

La pantalla dice **«esto es lo que tengo de ti, confírmalo»** y solo pregunta el hueco real. Campos
ya confirmados se enseñan en gris con un ✓, no en una caja vacía.

🚨 **El dato cifrado que no abre NO es un dato que falte.** Si el descifrado falla (clave PII mal
puesta o rotada), el estado es **`no_legible`**, y `no_legible`:
- **no se le pide al cliente** — pedirle otra vez su IBAN porque una clave nuestra no abre es hacerle
  arreglar nuestra avería, y encima duplicaría el dato;
- **no se pinta como «falta»** en la cuenta del correo («te faltan 3 datos» sería falso);
- **se le avisa a Alberto por Telegram**, porque es una avería nuestra y silenciosa. Es la lección
  del índice ciego: una clave mal puesta **no da error**, devuelve vacío, y la pantalla dice «no
  tiene» sobre un dato que está ahí.

### 4bis.4 El efecto de segundo orden: cada presupuesto LIMPIA la ficha

Esto es un **beneficio buscado, no un accidente**, y conviene decirlo al diseñar porque cambia
decisiones: justifica pedir un campo aunque no bloquee la emisión de hoy, y justifica enseñar
confirmados los que ya están.

- Un dato confirmado por el titular se escribe con **`origen = 'portal'`** y fecha, en la misma
  columna de procedencia que ya usa la casa (`compania` ≠ `calculado` ≠ `declarado` ≠ `portal`).
- Deja fila en `historial_interno`, tipo `dato_confirmado`, `quien = portal:<identidad_id>`, **con el
  nombre del campo y nunca el valor** cuando sea dato de identidad.
- **Conflicto con CIMA: no se pisa a ciegas.** Dos fuentes en desacuerdo es **un hecho que se
  declara**, no un empate que se resuelve en silencio. Y la regla de quién manda no es la misma para
  todo:
  - **Contacto y dirección de contacto** (email, teléfono, domicilio postal): **manda el cliente**.
    Es su dato y él es la fuente primaria; CIMA lo trae de la compañía, que suele tenerlo más viejo.
  - **Identidad** (DNI, nombre, apellidos, fecha de nacimiento): **no la cambia el cliente tecleando**
    — principio 7 de la visión, «la identidad se cambia documentada». Si el cliente dice otra cosa, se
    guarda como **declarado** y se levanta una fila de cola `conflicto_dato` para Alberto, que lo
    resuelve con el documento delante.
  - **Datos del riesgo** (matrícula, dirección del riesgo, capitales): manda CIMA, porque es lo que
    la compañía tiene asegurado; una discrepancia aquí puede ser una **agravación del riesgo** (arts.
    11-13 LCS) y eso es una conversación, no un `UPDATE`.
- Un `COALESCE(nuevo, viejo)` **no protege nada** si el nuevo es un valor de cajón. Cualquier
  centinela (`'otro'`, `''`, `'N/A'`) se anula antes de escribir (`NULLIF`) y se trata como NULL en
  toda guarda. Es la lección de `subastas.tipo_bien`.

---

## §5. El gasto, con números

### 5.1 El camino completo, llamada a llamada

| # | Paso | Llamada al vendor | Coste | Quién la dispara |
|---|---|---|---|---|
| 1 | Tarificar | `POST /insurances` | **0,50€** [Seguro] | **Alberto** |
| 2 | Preparar y enviar el presupuesto | ninguna | 0€ | Alberto |
| 3 | El cliente abre y mira | **ninguna** | 0€ | el cliente |
| 4 | El cliente elige | **ninguna** | 0€ | el cliente |
| 5 | El cliente firma | **ninguna** | 0€ | el cliente |
| 6 | Confirmar el precio (ReRate) | `POST /insurances/{id}/offers` | **no documentado**; el CRM de Manuel lo trata como facturable y `noRetry` ⇒ [Probable] 0,50€ | **Alberto** |
| 7 | Emitir (Submit) | `POST /insurances/{id}/policy-applications` | **no documentado**; además compromete un contrato | **Alberto** |

> **Llamadas de pago que puede disparar el cliente en la Fase 2: CERO.** No es una mitigación: es el
> diseño, y es el motivo principal por el que la Fase 2 va antes que la Fase 3.

Todo lo que ve el cliente sale del **snapshot** de `presupuesto_opcion`. Ni una lectura al vendor,
ni siquiera un `GET /insurances/{id}` (que es gratis): si el snapshot no basta para pintar la
pantalla, el snapshot está mal hecho.

### 5.2 Lo que le falta al embudo, y sirve tal cual

**Sirve tal cual:** `cotizar.ts` es un embudo sólido y no hay que tocarlo. Su orden (config → ámbito
→ **libro** → tope → **reserva ANTES de llamar** → un solo intento → cierre con evidencia) y su regla
de que **una cotización sin desenlace cuenta como gastada** son exactamente lo que hace falta. El
guardián `test/regression-asegura-gasto-codeoscopic.test.ts` ya impide que alguien abra un `GET` que
cotice (un prefetch dispararía el cargo) o llame al vendor por fuera. **La Fase 2 no toca nada de
esto.**

**Lo que le falta**, y es un agujero que ya existe hoy con Alberto solo:

> [Seguro, medido] **Ni `/oferta` (ReRate) ni `/emitir` (Submit) pasan por `cotizar()`.** No escriben
> línea en `seguros.codeoscopic_consumo`, así que `puedeCotizar()` no los ve y el tope diario/mensual
> **no los cuenta**. Si el ReRate factura —y probablemente factura—, el libro de consumo está
> contando de menos y el tope protege menos de lo que dice.

**Arreglo mínimo, un PR pequeño e independiente de esta spec:** que `/oferta` y `/emitir` abran su
propia línea en el libro con `motivo: 'rerate' | 'submit'`, `coste_cents` propio y configurable, y
contadores separados de los de cotizar. Qué se rompe si me equivoco: si esas llamadas resultan ser
gratis, estaríamos contando gasto inexistente y el tope cortaría antes de tiempo — por eso el coste
va en una env y puede ponerse a 0 sin tocar código, y por eso los contadores van separados. Cómo se
verifica: la **factura** de Codeoscopic del mes contra el conteo del libro. Hasta entonces, lo
conservador es contarlas.

### 5.3 Recargar o pulsar dos veces

- **El cliente no puede cobrar dos veces porque no puede cobrar ni una.** Ese es el mecanismo.
- Lo que el cliente sí puede doblar es la **firma**: lo corta `unique (documento_tipo, documento_id)`
  en `seguros.firma` — la segunda devuelve la primera evidencia, no crea otra. Y `elegido_at` es
  `coalesce(elegido_at, now())`: cambiar de opción reescribe la opción elegida, no el sello inicial.
- Lo que Alberto puede doblar (ReRate/Submit) ya tiene candado: `submit_attempt_id` +
  `submit_in_flight_at` (10 min) con el upsert que decide la fila **en la misma sentencia**, el 409
  `solicitud_existente` cuando el proyecto ya cuenta una `policyApplication`, y el 409
  `reintento_sin_confirmar` tras un 5xx. Eso **no cambia** en la Fase 2.
- El botón «Pídeme un precio actualizado» **no llama al vendor** (§2.3): escribe un evento y avisa a
  Alberto. Cooldown 1/día por presupuesto. Aunque lo pulse cien veces, cuesta 0€.

---

## §6. Lo mínimo para la Fase 2, en orden

Cada PR sale verificable en local (typecheck de la app + `pnpm test`), con `code-review` antes de
sacarlo de draft, y **viendo el cepo ponerse rojo** antes de darlo por bueno.

| # | Qué | Ficheros / tablas / endpoints | Tamaño |
|---|---|---|---|
| **1** ⭐ | **El objeto, congelado, sin enviar nada.** DDL + reglas puras + puerto + botón «Preparar presupuesto» que deja `borrador`. Alberto lo prepara, lo ve y lo borra. **Nada sale al cliente.** | `apps/asegura/prisma/sql/2026-09-2x_presupuesto.sql` · `packages/module-seguros/src/presupuesto-cliente.ts` (`estadoPresupuesto`, `elegirPortada`, `VALIDEZ_PRESUPUESTO_DIAS`) + test · `POST/GET /api/operador/presupuesto` · botón en `retarificar/retarificador.tsx` | ~700-900 líneas con tests |
| 2 | **La pantalla del cliente**, solo lectura, sin firma. Alberto la mira con la vista de corredor que ya existe. Aquí se gasta el esfuerzo de «bonito». | `apps/asegura-portal/app/presupuesto/[token]/` + `app/(portal)/presupuesto/[id]/` · GRANT de lectura por columnas + `UPDATE(visto_at)` para `prisma_asegura_portal` · extender `test/regression-portal-aislamiento.test.ts` con los modelos nuevos | ~600-800 |
| 3 | **El envío**: correo desde asegura + **deep link de WhatsApp reutilizando `canalWhatsapp()`** (solo se añade `mensajePresupuestoWhatsapp()`) + los dos sellos (`enlace_generado_at` ≠ `enviado_at`) + telemetría + **cola en Hoy** con `onContador` | `apps/asegura/lib/correo-presupuesto.ts` · `packages/module-seguros/src/mensaje-presupuesto-whatsapp.ts` · `POST …/presupuesto/{id}/enviar` · `PresupuestosEnCurso.tsx` | ~400-600 (menos que antes: el canal ya existe) |
| 4 | **Elegir y FIRMAR**: OTP de firma por el puerto, `seguros.firma`, evidencia, documento firmable, aviso Telegram de «firmado sin emitir» | `POST …/presupuesto/{id}/codigo-firma` y `/firmar` · `@central/core-firma` (+ la decisión de §2.4 sobre dónde vive la orquestación) | ~600-800 |
| 5 | **§4bis**: `huecosParaEmitirDesdeFicha` + `datosDelTomador` + la pantalla de confirmar datos + `origen='portal'` + cola de `conflicto_dato` | `@central/module-seguros` · portal · puerto de escritura | ~700-900 |
| 6 | **Salida B**: carta de nombramiento de mediador, firmada con el mismo mecanismo, estados `enviada → aceptada → rechazada` | idea H del banco de ideas | ~500 |

**El primer PR es el 1.** Es el único que no depende de nadie, no manda nada a ningún cliente, no
gasta un euro, y deja construido lo que los otros cinco necesitan. Y tiene una propiedad que vale
más que su tamaño: **se puede enseñar a Alberto** (prepara un presupuesto real sobre una póliza real
y lo mira) antes de que exista una sola línea de la pantalla del cliente.

**Fuera de esta serie, independiente y pequeño:** el PR del §5.2 (que el libro de consumo cuente el
ReRate y el Submit). No bloquea nada de arriba y tapa un agujero que ya existe.

---

## §7. Las cinco preguntas que solo puede contestar Alberto

> **✅ CONTESTADAS por Alberto el 21/09/2026** (las cuatro que se le plantearon; Q2, Q3 y Q4 siguen
> abiertas con su recomendación en pie):
>
> - **Fase 2** — «me vale»: el cliente ve, elige y acepta; emite Alberto.
> - **El alcance de la defensa de cartera es POR CLIENTE y de CUALQUIER RAMO**, que es como funciona
>   la relación cliente↔compañía. Las canceladas no marcan: cuentan como `exPolizas` («ya fue
>   cliente suyo»), que es argumento comercial. Es exactamente lo implementado, así que no cambia
>   código. Se eligió sabiendo que **8 clientes tienen ya 2+ pólizas del mismo ramo en la misma
>   compañía**: la marca dice «probable retención», no «imposible», y por eso la fila se ve.
> - **Al aceptar SÍ se reconfirma el precio con la compañía** (ReRate), aun costando. Razón: hoy
>   ninguno de los 187 precios guardados es «firme», así que sin reconfirmar, lo que el cliente
>   firmaría sería un estimado. Consecuencia para §5: la Fase 2 **deja de tener cero llamadas de
>   pago disparables por el cliente** — la aceptación dispara una. El gate de idempotencia de §5.3
>   pasa de conveniente a **obligatorio**: pulsar dos veces o recargar no puede cobrar dos veces.
> - **Q1 · Validez: 15 días naturales**, como se recomendaba abajo.
> - **Q5 · Sí al correo a Codeoscopic**, en borrador para que lo envíe él (regla de comunicaciones
>   salientes). Borrador en `docs/BORRADOR-CODEOSCOPIC-COSTE-RERATE-SUBMIT.md`, sin enviar.

(Las dos ya planteadas —si le vale la Fase 2, y si al aceptar se reconfirma el precio pagando— se
dan por hechas y no se repiten. **El canal tampoco es una pregunta: está decidido** — email +
deep link de WhatsApp que manda él a mano, sin WABA.)

**Q1 · ¿Cuántos días vale un presupuesto?** — ✅ **DECIDIDO: 15 días.**
*Recomiendo **15 días naturales**, y nunca más allá de la fecha de efecto menos un día.* Porque el
vendor **no nos dice** cuánto vale un precio antes del ReRate, así que la fecha la ponemos nosotros
o no hay ninguna. 15 días es corto para que no se muera solo entre que él lo manda y el cliente lo
mira, y largo para que dé tiempo a hablarlo en casa. Con 30 días, la mitad de los presupuestos
llegarían al ReRate con un precio de hace un mes.

**Q2 · ¿Qué ve alguien que abre el enlace y NO es el tomador?** (buzón compartido, reenvío)
*Recomiendo: **nada del contenido**.* Solo «este presupuesto es personal; si es tuyo, entra con tu
correo». Cuesta fricción al cliente legítimo que usa el correo de su mujer — pero la alternativa es
que el precio, la compañía y el bien asegurado de una persona se abran con un enlace reenviado, y en
salud o vida eso roza un dato de salud. La alternativa que **no** recomiendo es enseñar el
presupuesto solo con el token.

**Q3 · ¿Hay una salida sin firma, o «acepto» es siempre firmar?**
*Recomiendo **dos botones**: «Me interesa, llámame» (sin firma, sin compromiso) y «Acepto esta
opción» (firma).* Si la única salida es firmar, mucha gente no pulsa **nada** y se pierde la señal
más valiosa: que le ha gustado una opción pero quiere hablarlo. El «me interesa» sella `elegido_at`
sin `aceptado_at` y cae en la cola de Hoy. El riesgo de la opción contraria (solo firma) no es
técnico: es que el embudo se queda mudo justo donde importa.

**Q4 · ¿Se le enseña al cliente cuántas compañías se consultaron y cuáles no dieron precio?**
*Recomiendo **sí**, en una línea plegada.* Es lo que sostiene el «asesoramiento basado en análisis
objetivo» y lo que impide que «tres opciones» se lea como «esto es todo el mercado». El coste es que
a veces dirá «consulté 8, me dieron precio 3», que parece poco — pero es verdad, y es lo que ya hace
la pantalla del corredor con `r.fallos`.

**Q5 · ¿Le preguntas a Codeoscopic si el ReRate y el Submit facturan?** — ✅ **DECIDIDO: sí, en borrador.**
*Recomiendo **sí, y antes del PR del §5.2**.* Es la única pregunta de esta spec que no se puede
contestar desde el código: el portal del fabricante **no documenta el coste de ninguna de las dos**,
y la única razón por la que las tratamos como facturables es que el CRM de Manuel lo hacía. De la
respuesta dependen el tope, el conteo del libro y lo que se le puede llegar a permitir al cliente en
la Fase 3. Es un correo a Juan Manuel Fernández, que ya contestó el 21/09 a las otras dos preguntas.
