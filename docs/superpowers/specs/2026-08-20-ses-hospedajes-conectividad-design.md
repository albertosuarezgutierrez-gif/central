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

## 1.bis Estado verificado (20/08/2026)

Probado contra el servicio **real** de SES, desde fuera del contenedor de desarrollo:

- ✅ **TLS**: valida con la cadena FNMT versionada en el repo.
- ✅ **Credenciales del servicio web de Busto Reform**: aceptadas (HTTP 200, no 401).
- ✅ **`codigoArrendador`**: existe y **tiene habilitado el servicio web** (ni `10103` ni `10120`).
- ✅ **Formato ZIP + Base64**: aceptado (ningún `10111`).
- ✅ **Operación `C` (consulta)**: `codigo 0 / Ok`.
- ❌ **Entorno de pruebas (`pre-ses`)**: caído, 502 a todo. Ver §4.5.

Es decir: **todo el transporte está validado**. Lo que falta es el producto — recoger los datos
del huésped, construir el parte y gestionar el ciclo.

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
  `<solicitud>`, que es el **XML real comprimido en ZIP y codificado en base64**.
- 🚨 **ZIP, no gzip.** Verificado literal contra la guía oficial v3.1.2: *«Este fichero XML deberá
  ser comprimido según el algoritmo ZIP y codificado en Base64»*, y el error `10111` es
  *«Formato de solicitud incorrecto. Ha de ir comprimido (zip) y codificado en Base64»*. Son
  formatos de contenedor distintos: `gzipSync` produce un stream gzip, no un fichero ZIP. Una
  primera versión de este diseño usaba gzip y **todas sus peticiones habrían sido rechazadas**
  con un 10111 que además parece un error de credenciales si no se lee el código.
- **`tipoComunicacion` va en el alta (A) pero NO en la consulta (C).** La cabecera de C solo lleva
  `codigoArrendador`, `aplicacion` y `tipoOperacion`.
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

### Consulta (C) y anulación (B) — estructura exacta

Ambas son **asíncronas**: devuelven un `<lote>` que después se consulta con C.

**Consulta**, XML interior (comprimido en ZIP + base64 dentro de `<solicitud>`):

```xml
<con:lotes xmlns:con="http://www.neg.hospedajes.mir.es/consultarComunicacion">
  <con:lote>00000000-0000-0000-0000-000000000000</con:lote>
</con:lotes>
```

**Anulación**:

```xml
<anul:comunicaciones xmlns:anul="http://www.neg.hospedajes.mir.es/anularComunicacion">
  <anul:codigoComunicacion>44444444-4444-4444-4444-444444444441</anul:codigoComunicacion>
</anul:comunicaciones>
```

🚨 **Código de lote ≠ código de comunicación.** Para anular hay que mandar el **código de
comunicación**; mandar el de lote devuelve *«No existe una comunicación para ese código»*. Son
dos UUID con la misma pinta, así que `ses_envios` guarda los dos por separado y con nombres que
no se puedan confundir.

⚠️ **Erratas en el XSD oficial, que NO hay que corregir en el parser**: la respuesta trae
`<tipoComuniacion>` (sin la `c`) y `<resutadoComunicacion>` (sin la `l`). Están así en el
esquema del Ministerio; «arreglarlas» rompe el parseo.

### Límites y comportamiento del servicio

- **100** comunicaciones por petición de alta (configurable por el Ministerio).
- **10** lotes por consulta, **10** comunicaciones por consulta.
- Anulación: la guía dice que hay límite pero **no da la cifra**.
- **No hay cuota por minuto documentada** en la v3.1.2. Ausencia de documentación no es garantía
  de que no exista: el cliente respeta un ritmo conservador igualmente.
- **Un XML idéntico a uno anterior se rechaza como «Lote duplicado».** El control opera sobre
  **el XML, no sobre el ZIP**: recomprimir el mismo contenido NO lo esquiva. Es una red de
  seguridad contra el doble envío, pero **no sustituye a nuestra idempotencia** — y de hecho
  estorba al reintento legítimo tras un timeout, donde no sabemos si SES llegó a procesarlo.
  Ante un fallo de transporte hay que **consultar el lote** (operación C), no reenviar a ciegas.

### Cómo se monta el ZIP: la guía no lo dice

Verificado grepeando las 76 páginas: la guía repite tres veces el orden —**XML (UTF-8) → ZIP →
Base64** → ese texto va en `<solicitud>`— y la tabla de campos tipa `solicitud` como `Base64`
obligatorio. Pero **no documenta nada del interior del ZIP**: ni el nombre de la entrada, ni si
admite más de una, ni el método (deflate vs store), ni si el Base64 puede llevar saltos de línea,
ni si admite BOM, ni el tamaño máximo. El glosario define «ZIP» y «Base64» citando Wikipedia.

Decisión tomada con la combinación más conservadora posible, y **ya validada contra el servicio
real de producción el 20/08/2026**: SES devolvió `codigo 0 / Ok`, no un `10111`. Deja de ser un
supuesto:

| Parámetro | Elegido |
|---|---|
| Entradas en el ZIP | **una sola** |
| Nombre de la entrada | `solicitud.xml` |
| Método de compresión | **deflate** |
| Codificación del XML | UTF-8 **sin BOM** |
| Base64 | una sola línea, sin saltos |

**Confirmado contra el servicio real**: una consulta construida así se acepta. Si alguna vez
apareciera un `10111`, las variables a mover serían, en este orden: método (deflate → store),
nombre de la entrada, y BOM.

### Inconsistencias de la propia guía (no son erratas nuestras)

- El ejemplo de error del Anexo I devuelve **`<codigoRetorno>109</codigoRetorno>`**, pero en la
  tabla del apartado 5 ese error es el **10111**, con otra redacción, y **no existe ningún 109**.
  El parser no debe asumir la longitud del código, y ante uno desconocido registra el valor
  literal en vez de descartarlo.
- La tabla de campos llama al campo **`arrendador`** (String(10)); todos los ejemplos SOAP usan
  **`codigoArrendador`**. Se sigue el ejemplo.
- Lo mismo con **`aplicación`** (con tilde en la tabla) frente a **`aplicacion`** en los ejemplos.
  Se sigue el ejemplo.

### Tablas maestras: se piden al servicio, no se cablean

La guía documenta una operación **`catalogo`** que devuelve las tablas maestras vigentes:
`SEXO`, `TIPO_DOCUMENTO`, `TIPO_PAGO`, `TIPO_PARENTESCO`, `TIPO_ESTABLECIMIENTO`,
`TIPO_COLOR`, `TIPO_MARCA_VEHICULO`, `TIPO_PERMISO_CONDUCIR`, `TIPO_VEHICULO`. Sin parámetro
devuelve la lista de tablas soportadas.

Esto **sustituye** al plan inicial de cablear los códigos en el módulo: se vuelcan a BD en el
alta y se refrescan periódicamente. Un catálogo cableado es un dato que caduca en silencio, que
es justo el fallo que la regla del monorepo prohíbe. (El `codigoMunicipio` del INE **no** está
entre las tablas maestras, así que ese sí sigue siendo tabla estática nuestra.)

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
| `zip.ts` | Escritor ZIP mínimo de una entrada (deflate + CRC-32), sin dependencias. Es el formato que exige SES; gzip **no** vale. |
| `enviar.ts` | `enviarComunicacion(cfg, peticion, deps)`. ZIP + base64 + POST con Basic, sobre un agente HTTPS con la cadena FNMT. Cliente HTTP **inyectable** para poder testear sin red. |
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

🚨 **El entorno de pruebas de SES no funciona.** `hospedajes.pre-ses.mir.es` acepta la conexión
y valida el TLS, pero responde **502 Proxy Error — «Error reading from remote server»** a toda
petición, con credenciales válidas o sin ellas. Comprobado el 20/08/2026 en las dos pasadas. Es un
fallo de su lado, no nuestro.

Eso tumba el plan original de «probar en pre-ses y luego pasar a producción». La puesta en marcha
real, mientras pre-ses siga caído:

1. Desplegar con **`SES_DRY_RUN=1`** y `entorno='produccion'`. El sistema construye el XML, lo
   comprime, lo valida y lo registra en `ses_envios` **sin enviarlo**.
2. Dar de alta Busto Reform en la pantalla de establecimientos y pulsar «probar conexión»
   (`tipoOperacion` `C`, que no da de alta nada). **Ya verificado a mano: responde `codigo 0 / Ok`.**
3. Revisar a ojo el XML que ha quedado registrado en dry-run para uno o dos check-ins reales.
4. Quitar el dry-run **para ese piso solo**, y con una reserva concreta y vigilada.
5. El resto de los pisos, uno a uno, repitiendo 2-4.

La consecuencia incómoda: el primer envío de verdad va contra producción, así que el dry-run y la
revisión manual del paso 3 **no son opcionales** — son el único ensayo que vamos a tener.
Reintentar pre-ses de vez en cuando por si lo arreglan entra en el vigía.

El envío real **no se puede probar desde el contenedor de desarrollo**: el proxy de salida bloquea
`*.mir.es`, y además intercepta el TLS. Toda validación contra SES ocurre desde Vercel.

### 4.6 La cadena de CA de SES: qué pasaba de verdad

**Corrección de una conclusión anterior de este mismo spec.** La versión previa afirmaba que
«SES no usa una CA pública, sino una de la Administración». **Era falsa**, y la prueba en que se
apoyaba no daba para afirmarlo.

Lo que se sabe ahora, verificado el 20/08/2026:

- La cadena real es `*.ses.mir.es` (O = MINISTERIO INTERIOR – SECRETARIA ESTADO SEGURIDAD –
  SGSICS) → `OU=AC Componentes Informáticos, O=FNMT-RCM` → `OU=AC RAIZ FNMT-RCM, O=FNMT-RCM`.
- **`AC RAIZ FNMT-RCM` es una CA pública y está en el almacén de Mozilla.** Comprobado por huella
  SHA-256 contra el almacén de este propio contenedor: `/usr/share/ca-certificates/mozilla/
  AC_RAIZ_FNMT-RCM.crt`, presente entre los 152 certificados de `ca-certificates.crt`.
- `openssl verify -CAfile <raíz> <intermedio>` → **OK**.

Por qué la prueba anterior falló y aun así no probaba nada: se hizo contra un bundle de **121**
certificados que se describió como «el bundle de Mozilla completo». El de verdad trae **152**, y
la raíz FNMT está entre los que faltaban. Se sacó una conclusión firme —«no es una CA pública»—
de un experimento que solo demostraba que a *ese* runtime le faltaba *esa* raíz. La lección de
método es la de siempre en este repo: **una ausencia solo se afirma sobre lo que se ha mirado**,
y «bundle completo» era una suposición, no una comprobación.

⚠️ **La trampa que probablemente causó el fallo original.** La página de descargas de la Sede de
la FNMT sirve, **bajo el mismo nombre** «AC Componentes Informáticos», un certificado **distinto**
del que usa SES:

| Fichero | Caduca | Huella SHA-256 | ¿Sirve? |
|---|---|---|---|
| `http://www.cert.fnmt.es/certs/ACCOMP.crt` | 2028-06-**24** | `F038421F…7690554EF23876AB` | ✅ **este** |
| `sede.fnmt.gob.es/…/AC_Componentes_Informaticos.cer` | 2028-06-**27** | `DB0DA160…E1BCE2BD` | ❌ no cierra |

Cargar el segundo da exactamente `UnknownIssuer`. Dos certificados con el mismo nombre y tres
días de diferencia en la caducidad es justo la clase de detalle que se pasa por alto.

**Consecuencias para el conector:**

1. Se versiona en `packages/module-ses` el bundle **raíz + intermedio** (`ses-ca-bundle.pem`),
   con las huellas SHA-256 en un comentario del fichero. No porque la raíz falte en los almacenes
   estándar —no falta—, sino porque **el intermedio hay que servirlo con la certeza de que es el
   correcto** y porque fija el entorno frente a runtimes con almacenes recortados, que es
   exactamente lo que pasó aquí.
2. En Vercel se carga con **`NODE_EXTRA_CA_CERTS`**; `enviar.ts` acepta además un `ca` explícito
   para no depender solo de la variable de entorno.
3. **Nunca se desactiva la verificación TLS** (`rejectUnauthorized: false`, `verify=False`).
   Por este canal viajan documentos de identidad: aceptar cualquier certificado convierte un
   error de configuración en un man-in-the-middle silencioso sobre datos personales sensibles.
   Si la cadena no valida, el envío falla y se registra como `error_transporte`.
4. **Un mismo truststore vale para los dos entornos**: `pre-ses` usa idénticos raíz e intermedio
   y solo cambia la hoja.
5. **No se fija (pin) la hoja.** Caduca el **03/09/2026** —dos semanas— y la van a rotar. Se
   confía en raíz e intermedio, que duran hasta 2030 y 2028. Una rotación de la hoja **no** debe
   romper el envío; que lo rompiera sería un fallo nuestro de diseño, no del Ministerio.
6. La caducidad del **intermedio (2028-06-24)** entra en el vigía: una cadena caducada deja de
   enviar partes en silencio, y silencio con un plazo de 24 h es lo más caro que hay.

**Verificado de punta a punta el 20/08/2026.** Con este bundle cargado, la llamada real desde
fuera del contenedor de desarrollo devuelve:

| Endpoint | TLS | Con credenciales falsas | Con las credenciales reales |
|---|---|---|---|
| `hospedajes.ses.mir.es` (producción) | **valida** | HTTP 401 | **HTTP 200 · `codigo 0 / Ok`** |
| `hospedajes.pre-ses.mir.es` (pruebas) | **valida** | HTTP 502 | HTTP 502 |

El `UnknownIssuer` desaparece: era el intermedio equivocado, no una CA privada.

### 4.7 🚨 Firma del viajero y registro documental — obligaciones que este diseño no cubría

Revisado el 20/08/2026. El RD 933/2021 impone **tres** obligaciones, no una, y el diseño inicial
solo cubría la segunda:

1. **Registro documental** (el «libro-registro», hoy informático) con los datos de los viajeros.
2. **Comunicación** a SES.HOSPEDAJES dentro de las 24 h.
3. **Conservación durante TRES AÑOS** desde la finalización del servicio contratado.

Y sobre la firma, **artículo 4.2, literal del BOE**:

> «Los partes de entrada para el uso de los servicios de hospedaje deberán ser firmados por toda
> persona mayor de catorce años que haga uso de los mismos, conforme al sistema y modelo que se
> establezca. En el caso de las personas menores de catorce años, sus datos serán proporcionados
> por la persona mayor de edad de la que vayan acompañados.»

Los menores de 14 no firman; sus datos los facilita el adulto acompañante, que es para lo que
sirve el campo `parentesco` de §3.

🚨 **Corrección: que la firma digital valga NO está confirmado.** Una versión anterior de este
spec afirmaba que «la firma digital tiene la misma validez que la manuscrita». **El RD 933/2021
no dice eso, ni lo contrario**: no menciona la firma electrónica, digital, manuscrita ni
biométrica en todo su articulado. El artículo 4.2 remite a *«el sistema y modelo que se
establezca»*, y la disposición adicional segunda remite a su vez al Ministerio:

> «La transmisión y conservación de los datos exigida por este real decreto a los sujetos
> obligados se hará conforme a los sistemas y procedimientos que se establezcan por el
> Ministerio del Interior.»

Es decir: la respuesta está en normas de desarrollo que **no se han consultado**. El diseño sigue
adelante con firma digital en el check-in porque es la única opción operativa para un piso sin
recepción, pero **queda marcado como supuesto sin verificar**, no como hecho. Confirmarlo con la
asesoría es tarea del plan, y es barato comparado con descubrir que el registro documental no
vale.

Contexto normativo: la Orden INT/1922/2003 (libros-registro y partes de entrada) **no está
derogada del todo**; sigue vigente en lo que no contradiga el RD 933/2021, y de ahí que el modelo
de parte de entrada firmado siga siendo la referencia.

Excepción que **no** nos aplica: quien ejerce el hospedaje de forma **no profesional** queda
exento del registro documental y de la conservación, y solo tiene la obligación de comunicar.
El alquiler turístico de los pisos es actividad profesional, así que nos aplican las tres.

✅ **Contrastado contra el BOE el 20/08/2026** (texto consolidado de BOE-A-2021-17461, sin
modificaciones posteriores al texto inicial). Los artículos que sostienen este diseño:

| Obligación | Artículo | Texto |
|---|---|---|
| Firma de mayores de 14 | **4.2** | ver cita arriba |
| Responsabilidad sobre la exactitud de los datos | **4.3** | el establecimiento responde de que coincidan con el documento de identidad |
| Registro **informático** (no libro en papel) | **5.1** | datos de los anexos I y II |
| **Tres años** de conservación | **5.3** | «desde la finalización del servicio o prestación contratada» |
| Comunicación en **24 h** | **6.3** | dos disparadores distintos, ver abajo |
| Régimen sancionador | **8** | remite a la LO 4/2015 |

Los importes **no están en el RD**: salen del artículo **39.1 de la LO 4/2015** — graves 601 a
30.000 €, leves 100 a 600 €. Y la clasificación importa más de lo que parece: **comunicar tarde
es leve** (100–600 €); **no comunicar o no tener registro es grave** (hasta 30.000 €). El sistema
debe preferir siempre enviar tarde a no enviar, que es justo lo que hace la cola de reintentos.

La **Orden INT/1922/2003 sigue vigente «en lo que no contravenga»** el RD (disposición derogatoria
única, apartado 2), y solo hasta que se dicte el desarrollo reglamentario.

🚨 **Obligación que faltaba: el artículo 6.3 tiene DOS disparadores, no uno.** Literal:

> «Esta comunicación se realizará de manera inmediata, y en todo caso en un plazo no superior a
> 24 horas […] a partir de los siguientes momentos: a) Al realizar la reserva o la formalización
> del contrato **o, en su caso, su anulación**. b) Al inicio de los servicios contratados.»

El diseño solo cubría (b). La reserva —y **su anulación**— también obliga a comunicar en 24 h.
Eso es la comunicación `RH`, que §6 había dejado fuera de alcance por suponer que era cosa de las
plataformas de intermediación. **Hay que resolverlo antes de implementar**, porque cambia el
alcance: si nos aplica, el conector necesita reaccionar a altas y cancelaciones de Smoobu, no
solo a check-ins. Es la segunda pregunta para la asesoría.

Además, el artículo 6.1–6.2 obliga a comunicar los **datos del establecimiento** antes de iniciar
la actividad, y de nuevo ante cualquier modificación. Eso ya está hecho por el portal —de ahí
salen `codigoArrendador` y `codigoEstablecimiento`—, pero un cambio de dirección o de titularidad
obliga a repetirlo, y conviene que la pantalla de establecimientos lo recuerde.

🚨 **El anexo I exige datos de pago que este diseño no había mirado.** El apartado A.4.d pide
tipo de pago, **identificación del medio de pago (tipo y número de tarjeta, IBAN)**, titular,
caducidad de la tarjeta y fecha del pago. Eso es un salto de categoría en sensibilidad: guardar
números de tarjeta arrastra obligaciones de PCI-DSS que hoy no tenemos, y el resto del sistema
nunca ha almacenado un PAN. **Decisión para el plan, no para aquí**: averiguar el mínimo que SES
acepta en `<pago>` (el ejemplo oficial usa `EFECT`) y no guardar ni un dígito de tarjeta mientras
no sea estrictamente exigible. Hasta resolverlo, el campo se rellena con el tipo de pago y nada
más.

**Cambios que esto introduce en el diseño:**

- **`ses_viajeros` gana la firma**: `firma_png` (el trazo, imagen pequeña), `firmado_en`,
  `firma_ip`, `firma_user_agent` y `firma_hash` (hash del conjunto de datos firmados, para poder
  demostrar que la firma corresponde a ESOS datos y no a otros). Solo se exige a mayores de 14;
  para el resto queda a NULL con `parentesco` relleno, que es un «no aplica», **no** un «falta».
  La UI y las guardas deben distinguir esos dos casos, igual que §4.2 exige para el resto.
- **El parte de entrada se materializa**: al completar el check-in se genera un PDF por contrato
  con los datos y las firmas, y se guarda en un bucket **privado** (`ses-partes`). Ese PDF, junto
  con las filas de `ses_checkins`/`ses_viajeros`, es nuestro registro documental.
- **Cron `ses-purga`** (mensual): borra checkins, viajeros y PDFs cuya fecha de salida tenga más
  de tres años. Cumple las dos caras de la obligación — conservar tres años **y** no conservar de
  más, que es lo que exige la minimización del RGPD. La purga se registra en bitácora: un borrado
  silencioso no se puede auditar.
- **La página de check-in** necesita un campo de firma por viajero mayor de 14 (canvas táctil,
  usable a 320 px como exige la regla responsive del monorepo) y el texto informativo de
  protección de datos: quién es el responsable, que la base legal del envío al Ministerio es una
  obligación legal, y el plazo de conservación de tres años.

Lo que **no** cambia: la foto del documento se sigue procesando en memoria y sin persistir (§3).
La obligación es conservar los **datos** y el parte firmado, no la imagen del documento de
identidad, y guardarla solo añadiría superficie sin necesidad legal.

## 5. Pruebas

- `validar.ts` — un test por regla de §3, incluyendo los casos frontera: cumpleaños 18 justo el día
  de la entrada, NIF de extranjero, menor sin parentesco, documento duplicado.
- Firma (§4.7) — el umbral son **14 años**, distinto del de la documentación, que son 18: un
  viajero de 15 firma pero puede no llevar documento propio, y uno de 13 ni firma ni lo lleva.
  Un test por cada lado de los dos umbrales, con el cumpleaños cayendo el mismo día de la entrada.
- Purga a tres años — que borra lo caducado, que **no** borra lo que está en plazo, y que deja
  rastro en bitácora.
- `xml.ts` — comparación contra XML de referencia; escapado de caracteres (`&`, `<`, comillas,
  tildes) en nombres y direcciones.
- `respuesta.ts` — clasificación `datos` vs `transporte` a partir de respuestas reales de SES.
- `zip.ts` — el ZIP producido lo abre un descompresor real (no solo «nuestro código lo relee»):
  una entrada, `solicitud.xml`, deflate, CRC correcto, y el XML íntegro tras descomprimir.
- `enviar.ts` — con el cliente HTTP inyectado: ZIP+base64 correcto, cabecera `Authorization` bien
  formada, que un 503 se clasifica como transporte y que un TLS que no valida **falla**, nunca
  se acepta.
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
