# Consultas a compañías por correo desde la oportunidad — spec de diseño (15/10/2026)

> Modo arquitectura: solo diseño. Nada implementado ni migrado. **Pendiente OK de Alberto para implementar.**
> Decisiones tomadas por Alberto el 15/10/2026. Contexto: `CLAUDE.md` raíz (regla «comunicaciones
> salientes»), skills `correduria-crm` (regla 3: escrituras por `/api/operador/*` con `correduriaId` e
> `historial_interno`) y `agente-correduria` (no contacta compañías).

## 1. Objetivo

Desde una oportunidad (`seguros.oportunidades`, pantalla plataforma
`apps/plataforma/app/(usuario)/correduria/oportunidad/[id]/page.tsx`) consultar a comerciales y técnicos de
compañías —p. ej. una RC que Codeoscopic no tarifica—, con borrador redactado por IA, envío y seguimiento de
respuestas. Botón **«Consultar a compañías»** en TODOS los ramos.

## 2. Decisiones

| # | Decisión | Porqué |
|---|---|---|
| 1 | **Un correo POR COMPAÑÍA** (no CCO) | Seguimiento por compañía; no se revela a quién más se consulta; mejor entregabilidad |
| 2 | Sale **desde el Gmail de Alberto como `hola@grupoasegura.es`** por SMTP de Gmail, NO por Resend, y **el envío final lo hace `asegura`**, no plataforma | Misma cuenta que ya lee el triaje (`GMAIL_USER`/`GMAIL_APP_PASSWORD`, `apps/plataforma/lib/correo/imap.ts`). Queda en Enviados y la respuesta llega al mismo hilo. Asegura tiene el DNI descifrado y la cola `seguros.aprobacion`; por eso `GMAIL_USER`/`GMAIL_APP_PASSWORD` van **también** en el proyecto Vercel `central-asegura`. Plataforma solo pide «enviar consulta X» por `/api/operador/*`. `apps/asegura/lib/correo-envio.ts` (Resend, `envios.grupoasegura.es`) queda para lo transaccional |
| 3 | **Nada sale solo**: la IA redacta, Alberto edita y aprueba CADA envío | Regla «comunicaciones salientes». Redacta `iaTexto()` de `apps/asegura/lib/ia.ts` (vía privada). Los recordatorios también son borrador a aprobar |
| 4 | **Riesgo + identidad mínima del tomador, y la identidad NO pasa por la IA** (Alberto, 15/10/2026: las compañías piden DNI/NIE/CIF y nombre para presupuestar). El correo lleva nombre/razón social y DNI/NIE/CIF, por defecto con la casilla **«Incluir identidad del cliente»** marcada en el panel (Alberto la quita por consulta). Nunca otros datos personales (teléfono, email, IBAN, dirección exacta, salud) salvo que él los teclee al editar | `iaTexto()` redacta solo con la lista blanca de campos de riesgo (actividad, facturación, plantilla, siniestralidad, provincia, capitales) y los marcadores `{{NOMBRE_TOMADOR}}`/`{{DOC_TOMADOR}}`; **asegura los sustituye en el servidor justo antes de enviar**. Así el DNI nunca llega a un proveedor de IA ni cruza el puerto hacia plataforma (regla 4 de `correduria-crm`) |
| 5 | Adjuntos **opcionales**, por defecto ninguno | Se eligen documentos ya subidos a la ficha |
| 6 | Contactos con **ramos**; **Alberto ELIGE a quién se envía** en un panel (§5), la app no propone ni premarca | Que no se le quede fuera a nadie sin verlo. Descartado: campo «Para:» con buscador (esconde a quién te dejas fuera) |
| 6b | Varias personas de la MISMA compañía → un solo correo con todas en Para (mismo hilo); compañías distintas → correos separados | Seguimiento por compañía, sin revelar a quién más se consulta |
| 8 | **Competencia (Alberto, 15/10/2026).** La oportunidad ya guarda `poliza_competencia jsonb` (`apps/asegura/prisma/sql/2026-09-01_seguros_volcado_ddl.sql:674`, tabla `seguros.oportunidades`; también en `polizas`, línea 827). Casilla del panel **«Incluir referencia de competencia»**: la IA añade «el cliente tiene póliza/oferta de <compañía> por <prima> con <coberturas>; ¿podéis mejorarla?». Son datos de riesgo/precio, **sí van a la IA**; la identidad del tomador sigue sin ir. **Adjuntar la póliza/oferta de competencia está permitido y es lo normal** («las compañías suelen pedirla para verificar y autorizar la bajada»): se elige entre los documentos de la ficha/oportunidad. Aviso fijo junto al adjunto: **«Este documento puede llevar IBAN, DNI de otros intervinientes o datos de salud: revísalo antes de enviar»**. Sin tachado automático (no fiable en PDF): decide Alberto. **Límite:** NO hay botón para reenviar a una compañía la oferta recibida de OTRA compañía en la misma ronda (solo competencia externa); si quiere, lo hace a mano | Mejor precio de entrada sin exponer identidad; el adjunto lo exige la compañía para autorizar la bajada. Revisión humana en vez de automatismo frágil. No se cruzan ofertas entre compañías de la misma ronda |
| 9 | **Datos mínimos por ramo antes de redactar**: regla pura en `@central/module-seguros` con test. RC: actividad, CNAE, facturación, plantilla, siniestralidad 3 años, límite deseado. Resto de ramos: reutiliza los `faltan` que ya calcula `datos-riesgo-ramo.ts` (`packages/module-seguros/src/`), expuestos como `datosRiesgo.faltan` en `apps/asegura/lib/oportunidad-riesgo.ts:166,401`. Si falta algo, el panel **avisa y deja enviar igualmente** (aviso, no bloqueo) | Una consulta incompleta se contesta con preguntas y gasta la ronda; pero Alberto decide |
| 10 | **Fecha límite de respuesta** en el correo: propuesta = vencimiento de la póliza actual − 15 días (editable), guardada en `consulta_compania.responder_antes`. El seguimiento (§4.3) la usa | Las compañías necesitan margen antes de la renovación |
| 7 | Respuesta con PDF → se guarda en la petición y avisa Telegram; **«convertir en oferta»** a mano | Sin extracción IA automática (no inventar primas) |

## 3. Datos

### 3.1 Contactos (cambio en tabla existente)

`seguros.compania_contactos` (modelo `CompaniaContacto`, `apps/asegura/prisma/asegura.prisma`; hoy tiene
`area: AreaContacto` —comercial/siniestros/administracion/tecnico/general— pero **no ramo**). Añadir
`ramos tipo_seguro[]` (nombre final a confirmar contra el enum real de ramos).

- Tres estados: **`NULL` = «sin clasificar»** (nunca «todos»), `{}` = revisado y sin ramos, valor = ramos.
- Un contacto `NULL` no se propone para ningún ramo; aparece en un grupo aparte «sin clasificar».
- El panel (§5) usa `ramos` solo para ORDENAR y etiquetar («lleva <ramo>»); **nunca premarca**.
  Contactos `activo` por `orden`; los `NULL` salen sin etiqueta de ramo.

### 3.2 `seguros.consulta_compania` (nueva, una fila por compañía consultada)

| Columna | Notas |
|---|---|
| `id`, `correduria_id` | Todo se filtra por `correduria_id` |
| `oportunidad_id` | FK a `seguros.oportunidades` |
| `compania_codigo_dgs` | FK a `companias_dgs` |
| `destinatarios` | Lista de `contacto_id` (jsonb o `uuid[]`). **≥1 y todos de `compania_codigo_dgs`**: regla pura en `@central/module-seguros` con test, aplicada también en el puerto |
| `asunto`, `cuerpo` | Editables mientras `estado='borrador'`. El cuerpo guarda los marcadores `{{NOMBRE_TOMADOR}}`/`{{DOC_TOMADOR}}`, nunca el DNI en claro; se sustituyen en el servidor de asegura al enviar |
| `identidad_incluida` | `boolean`. Si el correo enviado lleva nombre y DNI/NIE/CIF del tomador (casilla del panel, por defecto marcada). Trazabilidad RGPD |
| `codigo_ref` | Único, formato `ASG-XXXX`, va en el asunto como `[ASG-XXXX]` |
| `gmail_message_id`, `gmail_thread_id` | Se guardan al enviar (Message-ID RFC y X-GM-THRID) |
| `estado` | enum `borrador · aprobada · enviada · respondida · sin_respuesta · cancelada` |
| `enviada_at`, `respondida_at`, `recordatorio_avisado_at` | Timestamptz, NULL = no ha ocurrido |
| `adjuntos` | jsonb: referencias a documentos de la ficha/oportunidad elegidos (incluida póliza/oferta de competencia). Lo realmente enviado queda en historial |
| `competencia_incluida` | `boolean`. Si el borrador incluye la referencia de competencia (casilla del panel) |
| `responder_antes` | `date`, NULL = sin fecha. Propuesta: vencimiento de la póliza actual − 15 días; editable. Si no hay vencimiento conocido, NULL (no se inventa) |

### 3.3 `seguros.consulta_compania_mensaje` (nueva, entrantes)

`id`, `correduria_id`, `consulta_id`, `message_id` (**único**, idempotencia del triaje), `de`, `fecha`,
`resumen`, `adjuntos` (rutas en storage, `core-storage`).

### 3.4 Reglas de la migración

- SQL versionado en `apps/asegura/prisma/sql/` + modelos en `asegura.prisma`. REVOCAR a `crm_seguros` el DML
  en las dos tablas nuevas (los *default privileges* de `seguros` se lo darían; ver spec de acuerdos §0.2).
- `codigo_ref` con restricción UNIQUE; `message_id` UNIQUE.
- `oportunidad_historial` es una tabla **solo por SQL** (sin modelo Prisma; ver `apps/asegura/prisma/sql/2026-09-23_oportunidad_seguimiento.sql`): se escribe por SQL/puerto, no con el cliente Prisma. Cada evento (borrador creado, enviada, respuesta, recordatorio, sin respuesta, cancelada, convertida en
  oferta) escribe en `seguros.oportunidad_historial`. Escrituras por `/api/operador/*` de asegura. Al enviar con `identidad_incluida=true` se anota además en `historial_interno` y en `oportunidad_historial`: «se envió identidad de <cliente> a <compañía>» (base: medidas precontractuales a petición del cliente). Los adjuntos enviados (nombre del documento, y si era de competencia) y `competencia_incluida` también quedan en `oportunidad_historial`.

## 4. Flujos

### 4.1 Redactar y enviar (fase 1)

1. En la oportunidad, «Consultar a compañías» abre el panel de §5: Alberto marca las personas (nada premarcado)
   y deja o quita la casilla **«Incluir identidad del cliente»** (marcada por defecto).
1b. El panel comprueba los **datos mínimos del ramo** (decisión 9; helper puro de `@central/module-seguros`) y, si falta algo, lo avisa («falta: facturación, plantilla…») sin bloquear. Alberto puede marcar **«Incluir referencia de competencia»** (si hay `poliza_competencia`) y fijar la **fecha límite de respuesta** (propuesta: vencimiento − 15 días, editable).
2. Asegura construye el **resumen de riesgo** con un helper puro (lista blanca de campos de riesgo, sin
   identidad) y llama a `iaTexto()`, que redacta con los marcadores `{{NOMBRE_TOMADOR}}`/`{{DOC_TOMADOR}}`
   → un borrador por compañía en estado `borrador`. La identidad no entra en el prompt. Con la casilla de competencia, la lista blanca añade solo compañía/prima/coberturas de `poliza_competencia` y el borrador incluye «¿podéis mejorarla?». El correo menciona la fecha límite (`responder_antes`).
3. Alberto edita asunto/cuerpo, elige adjuntos (opcional; puede adjuntar la póliza/oferta de competencia, con el aviso fijo de la decisión 8 junto al adjunto) y pulsa **Aprobar y enviar**, uno a uno. En
   plataforma el borrador muestra el DNI **enmascarado** (regla 4 de `correduria-crm`: el DNI entero no cruza
   el puerto); plataforma solo pide «enviar consulta X» por `/api/operador/*`.
4. **Asegura** sustituye los marcadores con el dato descifrado (solo si `identidad_incluida`; si no, los
   quita y el cuerpo se envía sin ellos) justo antes de enviar y manda por SMTP de Gmail
   (`hola@grupoasegura.es`), con `[ASG-XXXX]` en el asunto; guarda `gmail_message_id`/`gmail_thread_id` y pasa
   a `enviada` **solo si el SMTP aceptó** (si falla, sigue `aprobada` y se avisa; nunca se marca enviada a
   ciegas). Anota en el historial «se envió identidad de <cliente> a <compañía>» si la hubo.

### 4.2 Casado de respuestas (fase 2, en el triaje `apps/plataforma/lib/correo/triaje.ts`)

Orden estricto; el primero que case gana:

1. **Hilo de Gmail:** `X-GM-THRID` o `In-Reply-To`/`References` contra el `Message-ID` guardado.
2. **Código en el asunto:** `[ASG-XXXX]`.
3. **Remitente** = email de un destinatario con **UNA sola** consulta abierta (`enviada`).
4. Si es ambiguo o no casa → bandeja **«sin asignar»**. **Nunca adivinar.**

Al casar: fila en `consulta_compania_mensaje`, `estado='respondida'`, `respondida_at`, adjuntos a storage y aviso
por Telegram (`core-telegram`). Encaje con `CorreoEventoEntrante` (`asegura.prisma`): la consulta no se
confunde con los eventos de compañías ya clasificados (alta de póliza, recibos…); el casado de consultas va
**antes** de la clasificación general y, si casa, el correo no entra por el camino de eventos.

### 4.3 Seguimiento (fase 3)

Patrón de `apps/plataforma/app/api/cron/correduria-seguimiento-presupuestos/route.ts`: **asegura decide,
plataforma manda Telegram y marca solo si salió**. Se registra en `apps/plataforma/lib/cron-dispatch.ts`.

- **3 días laborables** sin respuesta (o, si `responder_antes` cae antes de ese plazo, **ese día**: el recordatorio se adelanta) → Telegram con **borrador de recordatorio** para aprobar
  (`recordatorio_avisado_at` solo si el Telegram salió). Nada se reenvía solo.
- **7 días laborables** → `estado='sin_respuesta'` (con entrada en el historial).
- Calendario laborable: reutilizar el helper de días hábiles que ya use el cron de presupuestos; si no hay
  uno puro con test, crearlo.

### 4.4 Convertir en oferta (fase 3)

Con PDF de respuesta adjunto, el botón **«convertir en oferta»** crea una `OportunidadOferta`
(`asegura.prisma`) con los datos que teclee Alberto y el PDF enganchado. La app no extrae cifras.

## 5. UI en la oportunidad

**Panel «Consultar a compañías»** (opción A, pendiente del OK final de Alberto):

- **Una tarjeta por compañía**, con una casilla por contacto (nombre, cargo, área, ramos). Orden: primero las
  compañías con contactos del ramo de la oportunidad; después «Otras compañías», plegado.
- **Nada premarcado.** Solo una etiqueta «lleva <ramo>» en los contactos que lo tienen.
- **«+ Añadir contacto»** dentro de la tarjeta: alta inline en `compania_contactos` por el puerto de asegura
  (`/api/operador/*`, con `correduriaId` y entrada en historial).
- **Aviso de datos mínimos** del ramo (§2.9) sobre las tarjetas: avisa, no bloquea.
- **Pie:** casilla «Incluir identidad del cliente» (marcada por defecto, ver §4.1) + casilla **«Incluir referencia de competencia»** (solo si hay `poliza_competencia`) + campo **«Responder antes de»** (propuesta vencimiento − 15 días, editable) + «N compañías · M personas» + **«Redactar borradores»** (un borrador por compañía marcada; las
  personas de una compañía van juntas en Para).
- En el borrador, selector de adjuntos entre los documentos de la ficha/oportunidad; al elegir uno de competencia, aviso fijo «Este documento puede llevar IBAN, DNI de otros intervinientes o datos de salud: revísalo antes de enviar». No hay botón «reenviar oferta de otra compañía».
- Responsive ≥320 px: tarjetas apiladas, casillas y botones ≥44 px, modal a 95 vw.
- **Fase posterior (no fase 1): «grupos guardados»** (p. ej. «Panel RC») = selección con nombre reutilizable,
  montada sobre este panel.

**Cuadro en la oportunidad** tras enviar: compañía · destinatarios · enviado · respondido · oferta · días de
espera. Fila fija **«Competencia»** (si hay `poliza_competencia`) como referencia de precio. Estado con color y texto. A ≥320 px en cards. Borradores pendientes arriba; «sin asignar» como
bandeja aparte con acción «asignar a esta consulta».

## 6. Privacidad y cepos

- **Guardián:** test que comprueba que el prompt y la plantilla del borrador **no reciben campos de
  identidad** (nombre, apellidos, CIF/NIF/DNI/NIE, teléfono, email, dirección exacta). La identidad solo
  existe como marcadores `{{NOMBRE_TOMADOR}}`/`{{DOC_TOMADOR}}` y se sustituye en el servidor de asegura tras
  la IA. La entrada de `iaTexto()` se arma con una lista blanca de campos de riesgo, no quitando los de
  identidad de un objeto completo. Como cepo, no está terminado hasta verlo **fallar** (meter `nombre` o
  `nif` en la lista blanca → rojo).
- **Identidad en el correo:** test de la sustitución (con `identidad_incluida=false` no sale nombre ni
  documento y no quedan marcadores sin resolver) y de que el DNI entero no cruza el puerto hacia plataforma
  (solo enmascarado). Nunca otros datos personales salvo los que Alberto teclee al editar.
- **RGPD:** `identidad_incluida` + entrada en `historial_interno`/`oportunidad_historial`; base: medidas
  precontractuales a petición del cliente.
- Test de la regla de destinatarios: vacío → rechaza; un contacto de otra compañía → rechaza.
- Test del casado de respuestas: un caso por brazo (hilo, código, remitente único, ambiguo → sin asignar).
- **Competencia:** test de que, sin `competencia_incluida`, el prompt no recibe `poliza_competencia`, y de que con ella solo entran compañía/prima/coberturas (lista blanca; ni identidad ni IBAN). Test de que el aviso fijo de adjunto aparece siempre que haya un documento de competencia, y de que no existe ruta/acción que reenvíe una oferta recibida de otra compañía de la misma ronda. Un brazo por aserción; verlo fallar.
- **Datos mínimos:** test de la regla pura (RC pide actividad, CNAE, facturación, plantilla, siniestralidad 3 años, límite deseado; otros ramos devuelven los `faltan` de `datos-riesgo-ramo`; `null` = no se sabe, nunca 0) y de que faltar algo NO bloquea el envío.
- **Fecha límite:** test de la propuesta (vencimiento − 15 días; sin vencimiento → NULL) y de que el seguimiento adelanta el recordatorio si `responder_antes` es anterior a 3 días laborables.
- «Dato que no hay ≠ no mirado»: ramos `NULL` ≠ todos; una oportunidad sin facturación declarada se redacta
  como «no consta», nunca como 0.
- La skill `agente-correduria` **no** envía a compañías; esto solo lo dispara Alberto desde la pantalla.

## 7. Fases (3 PRs, cada uno en draft hasta `code-review`)

| Fase | Contenido |
|---|---|
| **1** | SQL + modelos (`consulta_compania` con `identidad_incluida`, `ramos` en contactos), borrador IA con marcadores, casilla «Incluir identidad del cliente», casilla de competencia + adjuntos con aviso (`competencia_incluida`, `adjuntos` en historial), regla de datos mínimos por ramo con aviso, fecha límite `responder_antes` en el correo, sustitución y envío por Gmail SMTP **desde asegura** (`GMAIL_USER`/`GMAIL_APP_PASSWORD` en `central-asegura`), cuadro, historial |
| **2** | Casado de respuestas en el triaje, `consulta_compania_mensaje`, adjuntos entrantes a storage, Telegram, bandeja «sin asignar» |
| **3** | Cron de seguimiento (3 y 7 días laborables; recordatorio adelantado si `responder_antes` es antes de los 3), recordatorio como borrador, «convertir en oferta» |

Cada fase corre `prisma generate` + `tsc` de asegura y plataforma por UN agente al final (un cliente Prisma
para todo el monorepo) y añade la matriz/guardianes que toquen.

## 8. Riesgos y pendientes

1. **SPF/DKIM/DMARC de `grupoasegura.es` para enviar como `hola@` desde Gmail: sin verificar.** Alberto
   abre un correo enviado, «Mostrar original» → SPF/DKIM/DMARC deben decir **PASS**. **Bloquea la fase 1**
   si falla (los correos irían a spam o serían rechazados).
2. Respuesta desde un correo nuevo, sin hilo ni código → cae en «sin asignar» (aceptado).
3. Dos consultas abiertas a la misma compañía: el brazo 3 (remitente) no casa; depende de hilo o código.
4. El límite de envío diario de Gmail es irrelevante a este volumen.
5. SMTP con contraseña de aplicación es **la misma credencial que IMAP**: si Google la revoca, caen el
   triaje y los envíos a la vez. Mitigación: aviso por Telegram si IMAP o SMTP fallan.
6. Nombre y valores del enum de ramos de `compania_contactos` por confirmar al empezar la fase 1.
7. **Misma credencial en dos proyectos Vercel** (`GMAIL_USER`/`GMAIL_APP_PASSWORD` en plataforma y en
   `central-asegura`): si se rota, se rota en ambos a la vez.
8. ✅ **Resuelto (Alberto, 15/10/2026):** la autorización del cliente cubre la cesión
   de nombre y DNI/NIE/CIF (y póliza de competencia) a compañías para cotizar; sin problema de protección de datos.

## 9. Fuera de alcance

Extracción IA de ofertas desde PDF, envío masivo con CCO, envío automático de recordatorios, consultas a
clientes, y cualquier cambio en `apps/asegura-web` o el portal del cliente.
