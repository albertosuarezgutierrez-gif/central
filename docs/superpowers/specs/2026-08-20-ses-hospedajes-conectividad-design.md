# SES.HOSPEDAJES — conectividad (parte de viajeros) · diseño

**Fecha:** 20/08/2026 · **Vertical:** SIVRA (pisos turísticos) · **Dónde se implementa:** `packages/module-ses` + `apps/plataforma`

## 1. Problema

El RD 933/2021 obliga a comunicar al Ministerio del Interior los datos de todos los viajeros
alojados, **dentro de las 24 h siguientes al check-in**, por la plataforma SES.HOSPEDAJES.
Multas de 100 € a 30.000 €. Hoy no comunicamos nada por medios propios.

Dos hechos condicionan todo el diseño:

1. **Smoobu no tiene los datos.** Nos da la reserva y el nombre/email/teléfono del titular.
   Documento de identidad, soporte del documento, fecha de nacimiento, nacionalidad, sexo y
   dirección **no existen en ninguna fuente nuestra**. Hace falta recogerlos del huésped.
2. **SES se cae con frecuencia.** El sistema debe distinguir «pendiente porque el Ministerio no
   responde» de «pendiente porque nadie ha rellenado nada». Son dos acciones distintas.

## 2. Decisiones tomadas

| Decisión | Elegido | Descartado |
|---|---|---|
| Conector | Propio, en el monorepo | Activar el de Smoobu/Chekin (coste por check-in, datos fuera, no revendible) |
| Recogida de datos | Formulario web + OCR del documento con IA | Solo formulario manual; solo carga interna |
| Alcance | **Solo nuestros pisos**, con el modelo de datos ya preparado para más titulares | Construir el alta multi-tenant y la venta a terceros ahora (aplazado, §9) |
| Uso comercial de los datos del huésped | **Fuera de este spec** | Lista de reserva directa / señal de pricing (aplazado, §9) |

## 3. Protocolo SES (verificado)

- **Endpoints:** `https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion` (pruebas),
  `https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion` (producción).
- **Auth:** HTTP Basic con el usuario y contraseña **del servicio web** (distintos del acceso web
  con certificado digital).
- **Envoltura:** SOAP `com:comunicacionRequest` → `<peticion>` con `<cabecera>`
  (`codigoArrendador`, `aplicacion`, `tipoOperacion` A/C/B, `tipoComunicacion` PV/RH) y
  `<solicitud>`, que es el **XML real comprimido en gzip y codificado en base64**.
- **XML interior:** `ns2:peticion` (namespace `http://www.neg.hospedajes.mir.es/altaParteHospedaje`)
  → `<solicitud>` → `<codigoEstablecimiento>` + N `<comunicacion>`, cada una con `<contrato>`
  (referencia, fechaContrato, fechaEntrada/fechaSalida `AAAA-MM-DDThh:mm:ss`, numPersonas,
  `<pago>`) y N `<persona>`.
- **Códigos:** `codigoArrendador` es único por titular de la actividad; `codigoEstablecimiento` es
  uno **por piso**. Ambos se obtienen al dar de alta el establecimiento en el portal SES, marcando
  «Envío de comunicaciones por servicio web».

### Reglas de validación obligatorias (fallan el envío si no se cumplen)

- Mayor de edad → `tipoDocumento`, `numeroDocumento` y `nacionalidad` obligatorios.
- Menor de edad → `parentesco` obligatorio.
- `tipoDocumento` NIF o NIE → `soporteDocumento` (IDESP) obligatorio.
- `tipoDocumento` NIF → `apellido2` obligatorio, y solo lo pueden llevar nacionales españoles.
- Al menos una `persona` con `rol` = `VI`; el resto puede ser `TI`.
- Ningún documento repetido dentro de la misma comunicación.
- Nº de personas declaradas ≥ nº de `<persona>` enviadas.
- Teléfono **o** correo obligatorio en cada persona.
- Dirección: `pais` en ISO-3166-1 alpha-3; si `pais` = `ESP`, `codigoMunicipio` del INE (5 dígitos,
  provincia + municipio) y **no** puede haber `codigoMunicipio` si el país no es España.

## 4. Arquitectura

### 4.1 `packages/module-ses` (TS puro, portable)

Sin BD y con una sola función que toca la red. Lo consume `apps/plataforma` hoy y podrá
consumirlo `apps/ia-rest` (hostelería) el día que haga falta.

| Fichero | Responsabilidad |
|---|---|
| `tipos.ts` | Enums oficiales: `tipoOperacion` (A/C/B), `tipoComunicacion` (PV/RH), `rol` (VI/TI), `tipoDocumento`, `sexo`, `parentesco`, `tipoPago`. |
| `municipios.ts` | Tabla estática de municipios del INE (código de 5 dígitos → nombre) para resolver `codigoMunicipio`. |
| `validar.ts` | **Helper puro y testeado.** `validarComunicacion(c) → ErrorValidacion[]`. Implementa todas las reglas de §3. Es la pieza que usa tanto el formulario del huésped (en vivo) como el envío (última barrera). |
| `xml.ts` | `construirParteXml(solicitud)` → XML `altaParteHospedaje`; `envolverPeticion(cabecera, solicitudB64)` → SOAP. Escapado XML propio, sin dependencias. |
| `xsd.ts` | Validación del XML generado contra el XSD oficial del Ministerio antes de enviar. |
| `enviar.ts` | `enviarComunicacion(cfg, peticion, deps)`. gzip + base64 + POST con Basic. `fetch` **inyectable** para poder testear sin red. |
| `respuesta.ts` | Parsea la respuesta SOAP → `{ ok, loteId, codigoRetorno, errores[] }`. Distingue explícitamente **error de datos** (culpa nuestra, no reintentar igual) de **error de transporte/5xx** (SES caído, reintentar). |

Los XSD oficiales se descargan del portal SES y se versionan dentro del módulo. *No se pueden
descargar desde el contenedor de desarrollo: el proxy de salida bloquea `*.mir.es`.*

### 4.2 Base de datos (Supabase compartida)

Cuatro tablas nuevas, prefijo `ses_`:

**`ses_establecimientos`** — `id`, `negocio_id`, `property_id`, `codigo_arrendador`,
`codigo_establecimiento`, `usuario`, `password_cifrada`, `entorno` (`pruebas`|`produccion`),
`activo`, `validado_en`, `ultimo_error`.

Una fila por piso nuestro. `negocio_id` y `codigo_arrendador` van en la tabla desde el principio
aunque hoy solo haya un titular: cuestan lo mismo ahora y evitan una migración de datos el día que
esto se abra a terceros (§9). Lo que **no** se construye ahora es la pantalla de alta para clientes
ni el aislamiento por tenant.

Contraseñas cifradas con **AES-256-GCM** y clave `SES_CRYPTO_KEY` (env de Vercel, 32 bytes,
`requireSecret()` de `@central/core-identity`, sin literal de respaldo). Ninguna API de lectura
devuelve `password_cifrada` ni la contraseña en claro. Patrón de referencia:
`apps/plataforma/lib/domotica/tuya-cifrado.ts`.

**`ses_checkins`** — `id`, `establecimiento_id`, `reserva_ref` (bookingId de Smoobu), `token`
(uuid opaco), `fecha_entrada`, `fecha_salida`, `num_personas`, `estado`, `creado_en`,
`completado_en`, `idioma`.

**`ses_viajeros`** — `id`, `checkin_id`, `rol`, `nombre`, `apellido1`, `apellido2`,
`tipo_documento`, `numero_documento`, `soporte_documento`, `fecha_nacimiento`, `nacionalidad`,
`sexo`, dirección (país, municipio, código postal, calle), `telefono`, `correo`, `parentesco`,
`datos_ocr` (jsonb: lo que leyó la IA, para auditar discrepancias), `confirmado_por_huesped`.

**`ses_envios`** — `id`, `checkin_id`, `tipo_comunicacion`, `tipo_operacion`, `intento`,
`enviado_en`, `http_status`, `lote_id`, `codigo_retorno`, `respuesta_raw`, `ok`, `clase_error`
(`datos` | `transporte` | `null`).

#### Estados y la regla «dato que no hay ≠ dato que no se ha mirado»

`ses_checkins.estado` tiene **cinco** valores explícitos, nunca un booleano:

- `pendiente_datos` — creado, el huésped aún no ha rellenado.
- `listo` — datos completos y validados, sin enviar.
- `enviado` — SES devolvió lote aceptado. **Único estado que pinta verde.**
- `error_datos` — SES rechazó el contenido; requiere corrección humana.
- `error_transporte` — SES no respondió o dio 5xx; se reintentará solo.

Una reserva **sin fila** en `ses_checkins` se pinta como «sin parte» en rojo, jamás como «todo en
orden». El semáforo verde solo lo enciende un `codigo_retorno` correcto registrado en
`ses_envios`; la ausencia de errores nunca vale como prueba de cumplimiento.

### 4.3 Flujo

1. **Cron `ses-preparar`** (horario). Lee las reservas de Smoobu con entrada en las próximas 72 h
   sin `ses_checkins` y crea la fila con su token. Idempotente.
2. **Aviso al huésped.** El agente de mensajería existente (`apps/plataforma`, `/api/sivra/mensajes`)
   envía `https://<plataforma>/checkin/<token>` por WhatsApp/email 3 días antes de la llegada, con
   recordatorio a 48 h y a 24 h mientras siga en `pendiente_datos`.
3. **Página pública `/checkin/<token>`.** Sin login. Token opaco de un solo uso lógico, caduca el
   día siguiente al check-out. El titular añade una ficha por viajero.
   - Por cada viajero puede subir una foto del documento → `POST /api/ses/ocr` → `gatewayVision`
     de `@central/core-ai` extrae nombre, apellidos, documento, soporte, nacimiento y nacionalidad.
   - **El huésped confirma o corrige siempre.** Nunca se comunica a la policía un campo que solo
     ha leído la IA. `confirmado_por_huesped` guarda esa confirmación y `datos_ocr` lo que la IA
     propuso, para poder auditar después dónde falla el OCR.
   - La imagen se procesa **en memoria y no se persiste** en ningún bucket. Los campos ya quedaron
     confirmados por una persona, así que guardar el documento solo añadiría superficie RGPD.
   - Validación en vivo con `validar.ts`: el formulario no deja terminar con un parte que SES
     rechazaría.
   - **Idiomas ES / EN / IT**, con el mismo enfoque de diccionario de cadenas que
     `apps/housesevillana`. La mayoría de los huéspedes son extranjeros y un formulario legal que
     no entienden produce partes rechazados.
4. **Cron `ses-enviar`** (cada 30 min). Toma los `listo` cuya entrada ya se ha producido, agrupa
   por `codigo_establecimiento` y manda un `PV` por establecimiento. Registra cada intento en
   `ses_envios`.
   - `error_transporte` → reintento con backoff exponencial. A los 3 fallos, Telegram.
   - `error_datos` → **no se reintenta igual**; se marca y se avisa con el error literal de SES.
5. **Cron `ses-vigia`** (diario, 09:00 UTC). Cualquier entrada de hace más de 20 h sin parte
   aceptado. El aviso de Telegram **separa los dos casos**:
   - «SES no responde desde las HH:MM, N partes en cola» → espera, no hay nada que hacer.
   - «N reservas sin datos del huésped, entrada hace X h» → actúa hoy, con enlace a la pantalla.

   Un aviso que dijera lo mismo en ambos casos se dejaría de leer en dos semanas.
6. **Pantalla interna `/sivra/partes`.** Reservas próximas y pasadas con su estado, «enviar ahora»,
   «rellenar a mano» (fallback cuando el huésped no colabora), el último error de SES en claro, y
   **corregir/anular**: `tipoOperacion` `B` para dar de baja una comunicación errónea y reenviarla
   corregida sin pasar por la web del Ministerio.
7. **Alta de establecimientos**, pantalla interna simple (`/sivra/partes/establecimientos`): un
   formulario por piso con `codigo_arrendador`, `codigo_establecimiento`, usuario y contraseña, más
   un botón **«probar conexión»** que lanza una consulta (`tipoOperacion` `C`) y escribe
   `validado_en`. Cuatro pisos, sin onboarding ni autoservicio. Las credenciales se introducen ahí,
   **nunca en el repositorio**.

Los tres crons se declaran en `apps/plataforma/lib/cron-dispatch.ts`, **no** en `vercel.json`
(que sigue con un único cron, `/api/cron/dispatch`).

### 4.4 Interruptores

- `SES_ENABLED` — kill-switch global, mismo patrón que `SEO_AGENT_ENABLED`.
- `SES_DRY_RUN` — construye el XML entero, lo valida contra el XSD y lo registra en `ses_envios`
  con `http_status` nulo, **sin enviarlo**. Es el modo por defecto hasta que la primera conexión
  real responda OK.
- `SES_CRYPTO_KEY` — clave AES-256 de las contraseñas. Sin literal de respaldo.

### 4.5 Puesta en marcha

1. Desplegar con `SES_DRY_RUN=1` y `entorno='pruebas'`.
2. Dar de alta **un solo piso** (Busto Reform) en la pantalla de establecimientos y pulsar «probar conexión» contra
   `hospedajes.pre-ses.mir.es`.
3. Con la conexión validada, quitar el dry-run y mandar un parte de prueba.
4. Solo entonces pasar ese piso a `produccion`, y después el resto uno a uno.

El envío real **no se puede probar desde el contenedor de desarrollo**: el proxy de salida bloquea
`*.mir.es`. Toda validación contra SES ocurre desde Vercel.

## 5. Pruebas

- `validar.ts` — un test por regla de §3, incluyendo los casos frontera: cumpleaños 18 justo el día
  de la entrada, NIF de extranjero, menor sin parentesco, documento duplicado.
- `xml.ts` — comparación contra XML de referencia; escapado de caracteres (`&`, `<`, comillas,
  tildes) en nombres y direcciones.
- `respuesta.ts` — clasificación `datos` vs `transporte` a partir de respuestas reales de SES.
- `enviar.ts` — con `fetch` inyectado: gzip+base64 correcto, cabecera `Authorization` bien formada,
  y que un 503 se clasifica como transporte.
- Cifrado de credenciales — roundtrip cifrar/descifrar, y que una clave de longitud incorrecta
  falla de forma explícita.

## 6. Fuera de alcance

Esta fase cubre **solo nuestros cuatro pisos** y solo lo que evita la multa: recoger los datos del
huésped y comunicar el parte de viajeros. Todo lo demás está recogido en §9 para no perderlo.

## 7. Extensión opcional (última, aislable)

**PIN de la cerradura condicionado al parte.** El código temporal Tuya
(`apps/plataforma/lib/domotica/`) se genera cuando el check-in pasa a `listo`, no antes. Resuelve
el único problema operativo serio de estos sistemas —que el huésped no rellene— sin perseguir a
nadie. Va al final y aislado a propósito: se puede dejar caer sin afectar al cumplimiento legal,
que es lo que evita la multa.

## 8. Seguridad y datos personales

- Las credenciales del servicio web SES se introducen por la pantalla interna y viven cifradas en BD.
  Nunca en el repositorio, nunca en un log, nunca en una respuesta de API.
- La foto del documento no se persiste.
- Los datos de los viajeros se comunican al Ministerio en virtud de una obligación legal. Ese es
  el único uso contemplado en este diseño.


## 9. Ideas para fases posteriores

Nada de esto se implementa ahora. Se anota aquí para que no se pierda y para que el diseño actual
no lo bloquee.

### 9.1 Explotación de los datos del huésped

El check-in nos deja el contacto **real** de cada persona que ha dormido en los pisos: email,
teléfono, nacionalidad y dirección. Es exactamente lo que Booking y Airbnb nos ocultan.

- Lista propia para reserva directa en `housesevillana.es`, que es la palanca contra el 19,72 % de
  comisión de Booking.
- Señal nueva para el agente de pricing: procedencia y composición del grupo, que hoy no tiene.

**Condición previa:** el envío a la policía se ampara en una obligación legal; el marketing **no**.
Requiere una casilla de consentimiento aparte, sin premarcar, y un registro de quién la marcó y
cuándo. Sin eso, no se toca.

### 9.2 Abrirlo a otros propietarios

Con el modelo de datos ya preparado (§4.2), convertirlo en producto es sobre todo pantalla de alta,
aislamiento por tenant y facturación. Quien hoy usa Chekin paga por check-in; aquí el coste
marginal es casi cero. Mercado natural: propietarios de Sevilla, y los clientes que ya pasan por
`apps/ialimp` y `apps/plataforma`.

### 9.3 Cobertura normativa que falta

- **Comunicación `RH`** (reserva de hospedaje), si al validar el alta resulta que también nos
  aplica y no solo a las plataformas de intermediación.
- **Anulación masiva** y consulta de lotes (`tipoOperacion` `C` sobre histórico), más allá del
  corregir/anular por reserva que sí entra ahora.
- **Cataluña y País Vasco** (Mossos y Ertzaintza, sistemas propios). Hoy irrelevante —los pisos son
  de Sevilla— pero necesario si el producto se abre a terceros (§9.2).
- **Alquiler de vehículos** (`AV` / `RV`): el mismo RD 933/2021 lo cubre, y `apps/transporte` es
  una vertical de flota. Es el encaje más natural del módulo fuera de SIVRA.

### 9.4 Contrato de hospedaje

El RD obliga a conservar el contrato. Se podría generar en PDF y firmarlo en el mismo formulario de
check-in. Se descarta ahora porque mezclar firma electrónica con esto duplica el alcance y retrasa
justo lo que evita la sanción.

### 9.5 Mejoras operativas

- **OCR con memoria:** `datos_ocr` guarda lo que propuso la IA y el huésped corrigió. Con volumen,
  eso mide dónde falla el OCR por tipo de documento y país, y permite cambiar de modelo con datos
  en vez de por intuición.
- **Modo recepción:** el mismo formulario en versión móvil para rellenar el parte en la puerta con
  la foto del documento, cuando el huésped no ha colaborado.
- **Reutilizar el módulo en `apps/ia-rest`:** los establecimientos hosteleros con alojamiento
  tienen la misma obligación.
