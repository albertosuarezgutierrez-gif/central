# Agente de captación dentro del portal del cliente (asegura-portal) — diseño

> Dictado por Alberto, 07/09/2026, en varias vueltas de conversación. Objetivo: que la propia
> intranet del cliente (`apps/asegura-portal`) haga el trabajo de captación y venta cruzada que hoy
> haría un comercial, sin caer en asesoramiento no regulado (RDL 3/2020) y sin depender de WhatsApp
> (no hay WABA de Grupo ASegura todavía).
>
> Este documento consolida la conversación; no sustituye al banco de ideas
> (`docs/CORREDURIA-INTRANET-IDEAS.md`), que sigue siendo la referencia de ideas sueltas — este spec
> es la versión comprometida de las ideas B, C, D, H y (parcialmente) G y F de ese documento.

## La tesis

El portal ya existe para que el cliente "mire sus pólizas". La idea de Alberto es que, además, el
propio portal **pregunte, recuerde y compare** — sin que Alberto tenga que escribir a nadie a mano y
sin que un sistema automático decida por el cliente. El límite que sostiene todo el diseño:

> **La IA lee y pregunta. Nunca opina, nunca recomienda, nunca decide por el cliente.**

Esto no es una precaución de estilo: es la misma línea que ya está escrita en
`docs/CORREDURIA-INTRANET-IDEAS.md` (regla 5) — *"un aviso de «tengo mejor oferta para ti» es
asesoramiento, no información"* — y en todo el portal existente (la IA de `extraer-poliza.ts` solo
extrae campos, nunca opina sobre ellos).

## Fase 1 — las seis piezas

### 1. El cuestionario de huecos ("agente con guion fijo, no chat libre")

Al entrar en la bóveda, por cada ramo del catálogo (`auto, moto, hogar, vida, salud, decesos,
responsabilidad_civil, comercio, comunidades`) que el cliente NO tiene en su cartera con Grupo
ASegura, se le pregunta si lo tiene en otro sitio.

- **Tri-estado, nunca binario**: Sí / No / No lo sé. Un "no preguntado" no puede colapsar en "no
  tiene" (misma regla que el resto de la casa).
- **Los mensajes del agente son SIEMPRE de una plantilla fija**, revisada una vez y no generada en
  vivo por un LLM. Se siente conversacional (una pregunta cada vez, tono cercano) pero no es un chat
  libre.
- La IA solo interviene para **entender la respuesta libre del cliente** cuando no pulsa un botón
  (p. ej. escribe "el del coche ya lo tengo con vosotros, pero la moto no sé"), nunca para redactar
  contenido nuevo sobre seguros.
- Aplica a **cualquiera que entre al portal**, no solo a los 80 clientes vivos — es la misma tesis
  del producto: sirve también a los ~32.500 leads.

**Dato nuevo:** tabla `seguros.portal_pregunta_ramo` (identidad_id, ramo, respuesta
`si|no|no_se|no_me_interesa`, respondida_en). **Append-only** (como el resto del portal): una
respuesta nueva no borra la anterior, por si el cliente cambia de opinión. El cuarto valor lo añade
la pieza 14.

### 2. Subir la póliza y leerla (ya existe, se reutiliza)

Si responde "sí, la tengo en otro sitio", se le ofrece subir el documento. Reutiliza el flujo YA
construido: `POST /api/polizas` → `extraerPoliza()` → se guarda como `declarado` en la bóveda,
alimentando el calendario de vencimientos que ya existe. **No hace falta ninguna pieza nueva aquí.**

### 3. Resumen de garantías (pieza nueva)

Alberto pidió que, al subir la póliza, la IA haga además un resumen en lenguaje llano de qué cubre y
qué excluye — no solo los campos estructurados que ya extrae hoy.

- Tercera pasada de IA (o ampliación de la 2ª de `extraer-poliza.ts`) sobre el mismo texto/imagen ya
  leído. Nunca una llamada nueva al Catastro ni a Avant2.
- **Solo hechos del documento**: coberturas, exclusiones, capitales/límites si constan. **Prohibido**
  cualquier juicio de valor ("cubierto de sobra", "mejor que la media", "te conviene ampliar") — cepo
  de frases prohibidas desde el día uno, mismo patrón que ya usan `ramos.test.ts` (asegura-web) y los
  guardianes de frases del portal (parte de siniestro, canal-compañía).
- Lleva siempre el aviso que ya usa el resto del portal para lo leído por IA: "esto lo hemos leído
  nosotros del documento, verifica las condiciones — no es un documento contractual".
- Se enseña también en `/correduria` cuando esa póliza es candidata de la pieza 5 (cambio de
  mediador): Alberto no tiene que abrir el PDF para saber qué tiene el cliente.

### 4. Recordatorios a la carta (pieza nueva)

Si el cliente no tiene la póliza a mano, el agente ofrece recordárselo cuando él diga ("mañana",
"el jueves a las 5", "cuando tú me digas").

- Tabla nueva `seguros.portal_recordatorio` (identidad_id, tipo, cuando, canal, estado
  `pendiente|enviado|cancelado`).
- La IA se usa **solo para convertir la fecha/hora en lenguaje natural a un timestamp** — la misma
  clase de tarea (extracción factual) que ya hace en todo el portal, nunca para redactar el
  contenido del aviso.
- Un cron dispara el envío en su momento — mismo patrón que `avisos-vencimiento` de `apps/asegura` —
  con un enlace directo a "sube tu póliza aquí".
- **Canal: hoy solo email.** WhatsApp se añade el día que haya WABA de Grupo ASegura; web push, con
  la pieza 16. Los dos entran por el puerto de AVISOS de la pieza 16, que no es el mismo que el del
  código de acceso (ver ahí por qué).
- **Consentimiento resuelto por diseño**: como lo pide el propio cliente dentro de una sesión suya,
  es un aviso de servicio (él lo solicitó), no marketing — no necesita el opt-in de campaña
  (`portal_consentimiento.comercial`) que sí haría falta para escribir en frío.

### 5. Cambio de mediador (idea H del banco de ideas, sin cambios)

Si el cliente confirma que tiene una póliza con otra compañía, la vía más barata es nombrar a Grupo
ASegura mediador de ESA póliza: carta pre-rellenada (con lo leído en la pieza 2) + firma electrónica
(`core-firma`, eIDAS, mismo `otp_email` que ya usa el portal para entrar). Cliente sin tarificar y
sin gastar un euro; la póliza empieza a entrar por CIMA.

### 6. Comparación transparente (pieza nueva, la más sensible — necesita presupuesto real)

Alberto quiere que, además de leer la póliza ajena, el agente la compare con un presupuesto de Grupo
ASegura. **Esto es información, no asesoramiento, SOLO si se construye así:**

- Tabla de comparación **generada automáticamente**, campo a campo: coberturas, capitales,
  franquicias, precio — lo leído de la póliza ajena (pieza 2) contra el presupuesto real.
- **Cero texto de conclusión.** Nada de "mejor", "te conviene", "recomendado", ni un resaltado visual
  que insinúe cuál ganar. Cepo de frases prohibidas + cepo positivo (que exista una columna por cada
  lado, sin un tercer bloque de "veredicto").
- **El presupuesto tiene que ser REAL**, no una horquilla orientativa: viene de Avant2 (idea G del
  banco de ideas), 0,50 € por consulta, **nunca automático ni en lote** — se dispara una vez, cuando
  el cliente lo pide explícitamente después de ver el resumen de su póliza actual.
- **Va siempre con el IPID** del producto ofertado adjunto, antes de cualquier contratación —
  requisito del art. 42 LDSC independientemente de si hay asesoramiento o no.
- Termina en un único botón: **"¿dudas? te llamamos"** → lead humano, mismo flujo que en el resto del
  diseño. El sistema no cierra la venta solo.

⚠️ **Esta pieza depende de tener un presupuesto real conectado** (Avant2 vía Codeoscopic, ya
parcialmente construido para retarificar en el panel del corredor — `lib/codeoscopic/*`). Es la
pieza de mayor alcance y mayor coste de las seis.

## Fase 2 — once piezas más, aprobadas y desarrolladas

Todas compatibles con la línea roja del spec (la IA lee y pregunta, nunca opina). Se detallan aquí
para que cada una pueda entrar en un plan de implementación por separado; el orden de la lista no es
el de prioridad.

### 7. La pregunta viaja en el aviso de vencimiento que ya existe

En vez de esperar a que el cliente entre por su cuenta, la pregunta de la pieza 1 se engancha al
correo que el cron `avisos-vencimiento` de `apps/asegura` ya manda cuando SU póliza con Grupo
ASegura está por vencer. Una línea añadida a la plantilla: *"¿tienes algún otro seguro que quieras
que te vigilemos?"*, con enlace al cuestionario.

- **Consentimiento ya resuelto**: es el mismo correo de servicio que ya se manda por su propia
  póliza, no un envío nuevo. Si algún día ese correo pasara a mandarse a quien no tiene póliza con
  nosotros, dejaría de ser servicio y necesitaría `portal_consentimiento.comercial`.
- 🚨 **El enlace NO abre sesión**, igual que `lib/enlace-acceso.ts`: lleva a la puerta con el destino
  pre-rellenado y el cuestionario esperando detrás. Un enlace que entrara solo se lo comerían los
  escáneres antivirus del correo, y la lección ya está pagada dos veces en este portal.
- ⚠️ **Depende de que ese cron esté encendido**, y hoy está apagado. Mientras lo esté, esta pieza no
  existe aunque su código esté escrito — y desde dentro se ve idéntica a una que funciona y no tiene
  destinatarios. Su latido tiene que distinguir "0 avisos porque no vencía nada" de "0 avisos porque
  el cron no corrió".
- Sin tabla nueva.

### 8. Contador factual de cobertura en la bóveda

"2 con nosotros · 1 aportado · 3 sin dato". La misma información que produce el cuestionario, visible
de un vistazo permanente en vez de solo en el momento de preguntar.

- **Tres estados, y el tercero es el que importa**: `con nosotros` · `aportado` (lo tiene, en otra
  compañía, y nos lo ha enseñado) · `sin dato` (no se le ha preguntado, o dijo "no lo sé"). Un ramo
  que dijo NO tener **no cuenta como hueco**: sale de la cuenta, no se pinta en gris esperando.
- 🚨 **El denominador son los ramos PREGUNTADOS, no el catálogo de nueve.** "2 de 9" convierte el
  contador en una meta y sugiere que lo correcto es llegar a nueve — que es exactamente el juicio de
  valor que la regla 2 prohíbe. Nadie necesita nueve seguros.
- **Ni barra de progreso, ni porcentaje, ni semáforo.** Una barra que se llena ES una opinión sobre
  qué está bien. Es un recuento, con las tres cifras al mismo peso tipográfico.
- Sin tabla nueva: se deriva de `portal_pregunta_ramo` + la cartera.

### 9. El resumen de garantías, descargable

La pieza 3 en un documento que el cliente se puede llevar — a su pareja, a otra correduría, a donde
quiera. Refuerza la transparencia precisamente porque no está atada a que compre nada.

- **Se hace con la vía imprimible, no con una librería de PDF nueva**: `/boveda/.../resumen`
  imprimible, con el patrón de `@media print` que ya está construido y medido para la hoja del QR
  (tokens re-declarados para tinta sobre blanco, armazón oculto, una sola página).
- 🚨 **Allow-list, nunca deny-list**, por la lección que ya costó una vez aquí: `.resumen > *` a
  `display:none` con las excepciones nombradas una a una. Lo que alguien añada mañana nace sin
  imprimirse, que es el modo de fallo barato — al revés, el campo nuevo sale en un papel que se va
  de casa y no se entera nadie.
- Lleva impresos: la fecha de lectura, la procedencia (`declarado`) y el aviso de que no es un
  documento contractual. **Un resumen sin fecha es un resumen que envejece sin avisar.**
- Mismos cepos de frases prohibidas que la pieza 3, y con más razón: esto sale del portal.
- Sin tabla nueva.

### 10. La actividad del cliente como orden de llamada para Alberto

Si alguien entra tres veces a mirar la póliza que aportó, es interés. Sale **solo en `/correduria`**,
para ordenar a quién llama Alberto primero. **Nunca se le enseña al cliente** ni se le menciona.

- **Dato nuevo:** `seguros.portal_visita_poliza` (identidad_id, poliza_declarada_id | poliza_id,
  vista_en). Append-only, sin actualizar contadores en sitio: un contador se corrompe y no se puede
  auditar; las filas se cuentan.
- ⚠️ **Bloqueo real que hay que cerrar antes:** `registrarUso` (`lib/autorizaciones.ts`) **hoy no lo
  llama ninguna pantalla**, así que el mecanismo que esta pieza dice extender está sin estrenar. Si
  se construye la 10 sin cerrar eso, el otorgante de una autorización sigue leyendo "no ha entrado
  nadie" sobre alguien que sí entró, y encima habrá dos registros de visitas con distinta fiabilidad.
- 🚨 **Esto es tratamiento de datos de comportamiento y cambia lo que dice la ley de privacidad.**
  `/legal/privacidad` describe hoy un portal que no observa cómo navegas. Añadir esta pieza obliga,
  **en el mismo PR**, a reescribir esa página y subir `VERSION_TEXTOS_LEGALES` — una política que
  describe la versión anterior de la app no es un texto viejo, es información falsa al interesado.
- **Retención corta y declarada** (p. ej. 12 meses): guardar visitas para siempre es guardar un
  historial de navegación de una persona sobre sus seguros, y no hay ninguna razón de negocio para
  saber a qué miraba en 2029.

### 11. Cerrar relaciones cuando el titular de la póliza aportada NO es el cliente

Si al leer el documento (pieza 2) el tomador extraído no coincide con el nombre de la identidad que
lo sube (el hogar a nombre de su mujer, el coche con un conductor habitual que no es él), se le
pregunta —mismo guion fijo tri-estado— qué relación tiene con esa persona: pareja, hijo/a,
padre/madre, hermano/a, empresa propia, otro, no lo sé.

Ataca un problema ya medido en la cartera: `poliza_intervinientes` está al 1,7 % y el 81 % de los
intervinientes no trae NIF, así que hoy la correduría no sabe quién más hay detrás de sus 110
pólizas.

- **Dato nuevo:** `seguros.portal_relacion_declarada` (identidad_id, poliza_declarada_id,
  titular_leido, relacion, declarada_en, estado `pendiente|confirmada|descartada`). Append-only.
- 🚨 **Lo que declara el cliente es una PROPUESTA, no una relación operativa.** No se escribe en
  `cliente_relaciones` —eso es autoridad del corredor, con `prisma_seguros` desde `apps/asegura`—
  sino que se enseña en `/correduria` para que Alberto la confirme. Mismo patrón asimétrico que
  `portal_peticion_acceso`: el cliente propone, el corredor decide.
- **Y nunca se cruza por NOMBRE con la cartera.** Por la regla de identidad de la casa, dos personas
  que se llaman igual no son la misma, y fundirlas mezcla teléfonos y papeles sin que falle nada.
  Esta pieza NO sustituye a `poliza_intervinientes`: abre la puerta a que Alberto la complete con el
  NIF cuando confirme.
- ⚠️ **`titular_leido` es un dato personal de un tercero que no ha consentido nada.** Se guarda
  porque venía en el documento que el propio cliente subió, se usa solo para que Alberto entienda la
  propuesta, y **no se busca ni se enriquece** con él.
- **UI ya decidida:** chip inline en la fila ("De Pilar Piña Franco · tu mujer"), nunca pop-up ni
  panel lateral (ver "Preguntas cerradas").

### 12. Invitar al tercero declarado — y por qué NO es una autorización

Si la relación declarada es familiar, se ofrece invitar a esa persona al portal.

🚨 **Corrección de una versión anterior de este spec, que decía "cero infraestructura nueva":
era falso, y por una razón que importa.** `portal_invitacion` está construida para "José invita a
María a ver una póliza **de José**", y se apoya en la ficha de cartera del invitador. Aquí el objeto
es una póliza **que no es de José** — es de Pilar. **José no tiene ninguna autoridad para conceder
acceso a la póliza de Pilar**, así que reutilizar el mecanismo tal cual sería regalar el acceso a los
datos de un tercero con el consentimiento de quien no puede darlo.

Lo que sí se puede hacer, y es lo que se construye:

- **Invitación SIN objeto**: "Pilar, José nos ha dicho que este seguro es tuyo. Entra y te lo
  guardamos a ti". No le da a Pilar acceso a nada de José, y no le da a José nada de Pilar. Le da a
  Pilar **su propio portal**, que es justo la captación que se busca.
- **Ensancha `portal_invitacion` con un tipo sin alcance** (o tabla hermana), respetando todo lo que
  ya la sostiene: token hasheado, código de un solo uso al correo invitado, el token dice QUÉ
  invitación es y el código dice QUIÉN eres, caducidad de 30 días, y el enlace **no canjea solo**.
- **El correo lo escribe José**, porque no lo tenemos. Y por eso el correo a Pilar no puede nombrar
  compañía, número de póliza, matrícula ni importe: José pudo equivocarse de dirección. Aplica la
  misma `CAMPOS_PROHIBIDOS_EN_INVITACION` que ya existe.
- Cierra el círculo: declaras con quién tienes relación → esa persona entra → sus propios seguros son
  otro lead. Sin que nadie vea los datos de nadie.

### 13. El vencimiento como ventana para el cambio de mediador

Cambiar de mediador tiene menos fricción con la compañía actual cuando la póliza está cerca de
renovar. Con el vencimiento que `extraer-poliza.ts` ya extrae de la póliza ajena, la propuesta de la
pieza 5 se prioriza en esa ventana.

- **La ventana se cuenta con `fechaAccionable()`**, que ya resta los 30 días de preaviso del art. 22
  LCS y ya está construida y testeada para el calendario. Reimplementar el plazo aquí es cómo se
  acaba con dos cuentas distintas del mismo plazo legal en el mismo monorepo.
- **La ventana ordena la cola de Alberto, no dispara un envío al cliente.** Lo que el cliente ve en
  su bóveda sigue siendo el hecho —"vence el 12 de marzo"— y nunca una llamada a la acción de venta
  colgada de esa fecha.
- **Sin vencimiento leído no hay ventana, y eso se dice**: `null` es "no lo hemos podido leer", no
  "queda lejos". Una póliza sin fecha no puede caer al fondo de la cola en silencio.
- Sin tabla nueva.

### 14. Cadencia y "no me preguntes más"

La pieza 1 no dice cuántas veces pregunta, y sin esa regla el cuestionario acaba siendo el banner de
cookies del portal: la gente aprende a cerrarlo y entra menos.

- **Una pregunta por visita.** Nunca dos ramos seguidos, aunque el cliente conteste rápido.
- **Un "no" no se repite en 12 meses. Un "no lo sé" se repite a los 90 días** (es un estado que
  cambia: la póliza aparece en un cajón). Un "sí" no se repite: ya se le pidió el documento.
- **Cuarta respuesta: "no me interesa, no me preguntes"**, por ramo, y se respeta para siempre.
  Vive como un valor más de `portal_pregunta_ramo.respuesta` (`no_me_interesa`), sin tabla nueva.
- 🚨 **El silencio se calcula sobre la ÚLTIMA respuesta de ese ramo, no sobre la existencia de
  alguna.** Con la tabla append-only, preguntar "¿tiene alguna fila?" hace que un "no" de hace tres
  años silencie el ramo para siempre; y ordenar mal el `DESC` (en Postgres implica `NULLS FIRST`)
  sube arriba justo las filas sin fecha.
- **El contador de la pieza 8 no cuenta los `no_me_interesa` como hueco**: quien dijo que no quiere
  que le pregunten tampoco quiere ver el recordatorio de que no lo tiene.

### 15. Cambio de coche detectado por la matrícula

Cuando la póliza de auto que sube el cliente trae una matrícula que **no está en su cartera viva**,
el agente pregunta: *"¿es un coche nuevo, o sustituye al 1234ABC?"*.

Es una comparación de cadenas, sin IA, y el lead que sale es de los buenos: coche nuevo = póliza
nueva que no tenemos; sustituye = una baja que la correduría debe saber antes que la compañía.

- ⚠️ **El cruce es asimétrico y hay que escribirlo sabiendo dónde vive cada dato**: en la póliza
  aportada la matrícula es **columna** de `portal_poliza_declarada` (ya validada y compactada en
  `lib/poliza-editable.ts`); en la cartera viva vive dentro de `polizas.datos_especificos` (jsonb),
  de donde la lee `describirBien()` — medida en 81 de 81 pólizas de auto.
- **Se compara compactada** (sin espacios ni guiones, mayúsculas), que es como ya la normaliza el
  editor. Comparar en crudo hace que `1234 ABC` y `1234ABC` sean coches distintos.
- 🚨 **Solo se pregunta si la matrícula se LEYÓ.** `null` es "no la hemos podido leer", y tratarlo
  como "no está en tu cartera" convierte cada PDF mal escaneado en una pregunta sobre un coche que
  el cliente ya tiene asegurado con nosotros. Es la regla del NULL de la casa, en el caso donde el
  fallo queda más ridículo delante del cliente.
- **La respuesta es una propuesta, como la 11**: "sustituye a" se le enseña a Alberto, no da de baja
  nada.
- Sin tabla nueva (la respuesta cabe en la relación declarada o en una nota del lead).

### 16. Web push como canal de AVISOS — y por qué no es el puerto que ya existe

`@central/core-push` ya está construido y en uso por `ia-rest` e `ialimp`. Sirve para entregar los
recordatorios de la pieza 4 y los avisos de vencimiento **sin esperar a la WABA**.

🚨 **Pero NO se registra en `lib/canal.ts`, y confundirlo es el error que este apartado existe para
evitar.** Ese puerto tiene un solo método, `enviarCodigo(destino, codigo)`: es el canal por el que
sale **el código de acceso**. Una suscripción de web push solo existe *después* de que la persona
haya entrado y aceptado el permiso en ese navegador — así que nunca puede entregar el código que te
deja entrar. Meterlo ahí obligaría a inventarse un `destino` que el usuario no puede teclear y
dejaría el puerto significando dos cosas.

- **Puerto nuevo `lib/aviso.ts`**, con el mismo patrón probado: contrato, registro de adaptadores, y
  la distinción entre "el canal no está montado" y "el envío no salió" (503 ≠ 502, la lección de
  `canal_no_disponible`). Sus adaptadores: email (hoy), push (esta pieza), WhatsApp (cuando haya
  WABA).
- **Dato nuevo:** `seguros.portal_push_suscripcion` (identidad_id, endpoint, claves, creada_en,
  ultima_ok_en). La suscripción de push **es un identificador de dispositivo**: se declara en
  `/legal/privacidad` y se borra cuando el navegador la invalida (`410 Gone` del servicio de push no
  es un error a reintentar: es una baja).
- **El email sigue siendo el respaldo, siempre.** Push solo llega al dispositivo donde se aceptó, y
  un permiso denegado no da error: simplemente no llega nada. Un aviso que se manda solo por push es
  un aviso que no se sabe si existió — que es justo la regla de la casa sobre en qué pantalla lo va
  a ver la persona.
- **Base legal la misma que el email**: aviso de servicio pedido por el cliente. El permiso del
  navegador no sustituye a nada, y aceptarlo no es consentimiento comercial.

### 17. "Súbenos el aviso de renovación" (extensión de la 13)

45 días antes del vencimiento de una póliza **aportada**, el aviso no dice "llámanos": dice *"cuando
te llegue el recibo de renovación, súbelo"*.

Es el único momento del año en que el cliente tiene el **precio real** de su póliza ajena en la mano
— y ese precio es justo el input que la comparación de la pieza 6 necesita para no ser una
comparación contra un dato de hace un año.

- Reutiliza entero el motor de la pieza 4 (recordatorio + puerto de avisos): esto es un recordatorio
  con una plantilla distinta, no una pieza nueva.
- **La prima que trae el recibo pisa a la leída del documento viejo**, y por la escalera de
  procedencia que ya existe: `documento` (3) gana a `declarado` (1). No se compara nunca contra la
  prima vieja sin decir de cuándo es.
- **Sigue sin ser marketing**: el cliente ya nos enseñó esa póliza y nos pidió que se la vigilemos.
  Si algún día se mandara a quien no ha aportado nada, cambia la base legal.

## Reglas que no se negocian

1. **La IA nunca genera contenido dirigido al cliente sobre seguros.** Solo hace dos cosas: extraer
   datos de documentos, y entender intención (qué ramo, qué fecha) en lenguaje libre. Todo lo demás
   que el cliente lee es plantilla fija.
2. **Ningún ranking ni recomendación automática.** Comparar es enseñar hechos lado a lado; decidir
   es del cliente. Una barra de progreso o un semáforo también son un juicio.
3. **Ninguna tarificación automática ni en lote.** Avant2 se dispara una vez, a petición explícita.
4. **Ningún canal nuevo sin su base legal resuelta.** El recordatorio por email vale porque lo pide
   el propio cliente en su sesión; escribir en frío a leads fríos NO entra en este diseño.
5. **Todo lo que la IA extrae lleva su procedencia** (`declarado`, nunca `verificado`) y su aviso de
   revisión — mismo patrón que ya usa el resto del portal.
6. **El cliente PROPONE, el corredor CONFIRMA.** Nada de lo que declare el cliente sobre terceros
   (relaciones, sustituciones de vehículo) se escribe en la cartera sin que Alberto lo confirme.
7. **Nadie concede acceso a lo que no es suyo.** Que una póliza esté en tu bóveda no te hace su
   titular (pieza 12).

## Qué NO se construye en esta fase

- Chat libre de IA hablando de seguros con el cliente.
- WhatsApp como canal (no hay WABA de Grupo ASegura).
- Horquilla de precio orientativa sin presupuesto real (idea F del banco de ideas) — se descarta a
  favor del presupuesto real de la pieza 6, que es más honesto y ya estaba semi-construido.
- Cualquier automatización de la campaña de WhatsApp a clientes de confianza (eso quedó aparte, como
  envío manual de Alberto, sin relación con este diseño).
- **Referidos con incentivo** ("trae a un amigo y te regalamos X"). Descartado por normativa, no por
  producto: el RDL 3/2020 exige que quien colabore en la distribución esté registrado como
  colaborador externo, y premiar a un cliente por traer a otro es exactamente esa figura sin
  registro. Sin incentivo, "invita a un amigo" rinde poco — y la pieza 12 ya cubre a la familia, que
  es donde de verdad convierte.

## Modelo de datos nuevo

| Tabla | Para qué |
|---|---|
| `seguros.portal_pregunta_ramo` | Qué se ha preguntado y qué contestó, por ramo (piezas 1, 8 y 14) |
| `seguros.portal_recordatorio` | Recordatorios programados por el cliente (piezas 4 y 17) |
| `seguros.portal_relacion_declarada` | Relación que el cliente declara con el titular leído (pieza 11) |
| `seguros.portal_visita_poliza` | Visitas a una póliza, solo para ordenar la cola de Alberto (pieza 10) |
| `seguros.portal_push_suscripcion` | Suscripciones de web push por dispositivo (pieza 16) |
| `seguros.portal_invitacion` (ensanche) | Tipo de invitación **sin objeto**, para la pieza 12 |

Las piezas 2, 3, 5, 7, 9, 13 y 15 no necesitan tabla nueva. La pieza 6 depende del presupuesto real y
su propio cupo (`seguros.codeoscopic_consumo`, ya existente).

Todas las tablas nuevas son **append-only** y siguen las reglas del portal: la DDL se aplica **en el
mismo paso** que el despliegue que la usa (lección de `portal_supresion`), y el `GRANT` por columnas
va **antes** de declarar la columna en `schema.prisma`, o revienta la lectura entera del modelo.

## Bloqueos conocidos

- El portal sigue sin desplegar del todo (envs pendientes de Alberto, ver `apps/asegura-portal/CLAUDE.md`).
- La pieza 6 (comparación) necesita medir que el flujo de Avant2 para HOGAR/AUTO desde fuera de una
  póliza propia funciona igual que el de retarificación del panel del corredor — no está verificado.
- La pieza 7 depende de que el cron `avisos-vencimiento` de `apps/asegura` se encienda.
- La pieza 10 exige cerrar antes el hueco de `registrarUso`, que hoy no llama ninguna pantalla, y
  reescribir `/legal/privacidad` con subida de `VERSION_TEXTOS_LEGALES` en el mismo PR.
- Ninguna pieza requiere WABA; todas funcionan con el canal email ya existente.

## Preguntas cerradas en esta conversación (para no reabrirlas)

- ¿Chat libre o guion fijo con NLU acotada? → **Guion fijo.**
- ¿La comparación es un ranking o una tabla de hechos? → **Tabla de hechos, sin ranking.**
- ¿El presupuesto de la comparación es real o una horquilla? → **Real (Avant2), a petición explícita.**
- ¿A quién aplica el cuestionario de huecos? → **A cualquiera con sesión en el portal, cliente o lead.**
- ¿Cómo se muestra en la bóveda que una póliza aportada está a nombre de otra persona (pieza 11)?
  → **Chip inline en la propia fila** ("De Pilar Piña Franco · tu mujer"), nunca un pop-up ni un
  panel lateral. Es el mismo patrón que ya usa `FilaPoliza.tsx`/`FilaDeclarada.tsx` para "De
  {titular}" y "Añadida por ti": un dato que puede cambiar lo que el cliente hace no puede vivir
  detrás de un clic. Comparativa visual de las tres opciones, aprobada por Alberto:
  https://claude.ai/code/artifact/95013a06-784e-451a-a6c6-64db3160a2a6
- ¿Cuántas veces pregunta el cuestionario? → **Una por visita**, con silencio de 12 meses tras un
  "no", 90 días tras un "no lo sé", y un "no me preguntes" definitivo por ramo (pieza 14).
- ¿El contador de cobertura lleva barra de progreso o porcentaje? → **No.** Tres cifras al mismo
  peso, y el denominador son los ramos preguntados, no el catálogo entero.
- ¿Web push entra por el puerto `lib/canal.ts` que ya existe? → **No.** Ese puerto es solo del código
  de acceso; los avisos van por un puerto propio (pieza 16).
- ¿Invitar al familiar de la pieza 12 es una autorización sobre esa póliza? → **No.** Es una
  invitación sin objeto: el cliente no puede conceder acceso a una póliza que no es suya.
- ¿Se hace un programa de referidos con incentivo? → **No**, por el RDL 3/2020 (colaborador externo
  no registrado).
