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
| 2 | Sale **desde el Gmail de Alberto como `hola@grupoasegura.es`** por SMTP de Gmail, NO por Resend | Misma cuenta que ya lee el triaje (`GMAIL_USER`/`GMAIL_APP_PASSWORD`, `apps/plataforma/lib/correo/imap.ts`). Queda en Enviados y la respuesta llega al mismo hilo. `apps/asegura/lib/correo-envio.ts` (Resend, `envios.grupoasegura.es`) queda para lo transaccional |
| 3 | **Nada sale solo**: la IA redacta, Alberto edita y aprueba CADA envío | Regla «comunicaciones salientes». Redacta `iaTexto()` de `apps/asegura/lib/ia.ts` (vía privada). Los recordatorios también son borrador a aprobar |
| 4 | **Solo el riesgo, sin identidad** | Actividad, facturación, plantilla, siniestralidad, provincia, capitales. SIN nombre/CIF/DNI del cliente |
| 5 | Adjuntos **opcionales**, por defecto ninguno | Se eligen documentos ya subidos a la ficha |
| 6 | Contactos con **ramos**; **Alberto ELIGE a quién se envía** en un panel (§5), la app no propone ni premarca | Que no se le quede fuera a nadie sin verlo. Descartado: campo «Para:» con buscador (esconde a quién te dejas fuera) |
| 6b | Varias personas de la MISMA compañía → un solo correo con todas en Para (mismo hilo); compañías distintas → correos separados | Seguimiento por compañía, sin revelar a quién más se consulta |
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
| `asunto`, `cuerpo` | Editables mientras `estado='borrador'` |
| `codigo_ref` | Único, formato `ASG-XXXX`, va en el asunto como `[ASG-XXXX]` |
| `gmail_message_id`, `gmail_thread_id` | Se guardan al enviar (Message-ID RFC y X-GM-THRID) |
| `estado` | enum `borrador · aprobada · enviada · respondida · sin_respuesta · cancelada` |
| `enviada_at`, `respondida_at`, `recordatorio_avisado_at` | Timestamptz, NULL = no ha ocurrido |
| `adjuntos` | jsonb: referencias a documentos de la ficha elegidos |

### 3.3 `seguros.consulta_compania_mensaje` (nueva, entrantes)

`id`, `correduria_id`, `consulta_id`, `message_id` (**único**, idempotencia del triaje), `de`, `fecha`,
`resumen`, `adjuntos` (rutas en storage, `core-storage`).

### 3.4 Reglas de la migración

- SQL versionado en `apps/asegura/prisma/sql/` + modelos en `asegura.prisma`. REVOCAR a `crm_seguros` el DML
  en las dos tablas nuevas (los *default privileges* de `seguros` se lo darían; ver spec de acuerdos §0.2).
- `codigo_ref` con restricción UNIQUE; `message_id` UNIQUE.
- `oportunidad_historial` es una tabla **solo por SQL** (sin modelo Prisma; ver `apps/asegura/prisma/sql/2026-09-23_oportunidad_seguimiento.sql`): se escribe por SQL/puerto, no con el cliente Prisma. Cada evento (borrador creado, enviada, respuesta, recordatorio, sin respuesta, cancelada, convertida en
  oferta) escribe en `seguros.oportunidad_historial`. Escrituras por `/api/operador/*` de asegura.

## 4. Flujos

### 4.1 Redactar y enviar (fase 1)

1. En la oportunidad, «Consultar a compañías» abre el panel de §5: Alberto marca las personas (nada premarcado).
2. Asegura construye el **resumen de riesgo** con un helper puro y llama a `iaTexto()` → un borrador por
   compañía en estado `borrador`.
3. Alberto edita asunto/cuerpo, elige adjuntos (opcional) y pulsa **Aprobar y enviar**, uno a uno.
4. Plataforma envía por SMTP de Gmail (`hola@grupoasegura.es`), con `[ASG-XXXX]` en el asunto; guarda
   `gmail_message_id`/`gmail_thread_id` y pasa a `enviada` **solo si el SMTP aceptó** (si falla, sigue
   `aprobada` y se avisa; nunca se marca enviada a ciegas).

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

- **3 días laborables** sin respuesta → Telegram con **borrador de recordatorio** para aprobar
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
- **Pie:** «N compañías · M personas» + **«Redactar borradores»** (un borrador por compañía marcada; las
  personas de una compañía van juntas en Para).
- Responsive ≥320 px: tarjetas apiladas, casillas y botones ≥44 px, modal a 95 vw.
- **Fase posterior (no fase 1): «grupos guardados»** (p. ej. «Panel RC») = selección con nombre reutilizable,
  montada sobre este panel.

**Cuadro en la oportunidad** tras enviar: compañía · destinatarios · enviado · respondido · oferta · días de
espera. Estado con color y texto. A ≥320 px en cards. Borradores pendientes arriba; «sin asignar» como
bandeja aparte con acción «asignar a esta consulta».

## 6. Privacidad y cepos

- **Guardián:** test que comprueba que el prompt y la plantilla del borrador **no reciben campos de
  identidad** (nombre, apellidos, CIF/NIF, DNI, teléfono, email, dirección exacta). La entrada de
  `iaTexto()` se arma con una lista blanca de campos de riesgo, no quitando los de identidad de un objeto
  completo. Como cepo, no está terminado hasta verlo **fallar** (meter `nombre` en la lista blanca → rojo).
- Test de la regla de destinatarios: vacío → rechaza; un contacto de otra compañía → rechaza.
- Test del casado de respuestas: un caso por brazo (hilo, código, remitente único, ambiguo → sin asignar).
- «Dato que no hay ≠ no mirado»: ramos `NULL` ≠ todos; una oportunidad sin facturación declarada se redacta
  como «no consta», nunca como 0.
- La skill `agente-correduria` **no** envía a compañías; esto solo lo dispara Alberto desde la pantalla.

## 7. Fases (3 PRs, cada uno en draft hasta `code-review`)

| Fase | Contenido |
|---|---|
| **1** | SQL + modelos (`consulta_compania`, `ramos` en contactos), borrador IA, envío por Gmail SMTP desde la oportunidad, cuadro, historial |
| **2** | Casado de respuestas en el triaje, `consulta_compania_mensaje`, adjuntos entrantes a storage, Telegram, bandeja «sin asignar» |
| **3** | Cron de seguimiento (3 y 7 días laborables), recordatorio como borrador, «convertir en oferta» |

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

## 9. Fuera de alcance

Extracción IA de ofertas desde PDF, envío masivo con CCO, envío automático de recordatorios, consultas a
clientes, y cualquier cambio en `apps/asegura-web` o el portal del cliente.
