# Agente "secretaria" para la correduría (Grupo ASegura)

**Fecha:** 07/09/2026
**Estado:** Aprobado por Alberto, pendiente de plan de implementación.

## Objetivo

Alberto quiere poder dar órdenes cotidianas en lenguaje natural (texto o voz) — "manda a Pilar la
invitación a la intranet", "autoriza a José Suárez Salas a ver las pólizas de Alberto Suárez
Gutiérrez", "recuérdame llamar a Reale la semana que viene" — y que se ejecuten sin tener que abrir
una pantalla y rellenar un formulario. Caso de uso explícito: estar en la calle o en una conversación
y poder darle la orden al momento.

Alcance fase 1: **solo la correduría** (`apps/plataforma` `/correduria`). Arquitectura extensible a
otras verticales después, sin rediseño.

## Decisiones ya tomadas (por Alberto)

- **Quién manda:** solo Alberto.
- **Autonomía:** ejecución **directa**, sin paso de confirmación previa — para todas las acciones,
  incluida autorizar acceso entre clientes.
- **Canal:** texto y voz desde el inicio.
- **Acciones de fase 1:** enviar email a un contacto · autorizar acceso entre clientes · consultar/
  buscar cliente o póliza · crear un recordatorio.

## Hallazgo clave: no hay que construir canal ni voz

El bot único de Telegram (`@central/core-telegram`, mismo `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`
de siempre) **ya tiene el pipeline completo de voz + texto libre**, montado para el agente contable
(`apps/plataforma/lib/contable/telegram.ts`):

- Nota de voz → `manejarVozTg` → `aiTranscribe()` (ya transcribe) → eco de lo entendido en el chat →
  se trata como si fuera texto.
- Texto libre que no empieza por `/` → `manejarTextoLibreTg` → `responder(cuentaId, texto,
  'telegram')` → el LLM interpreta y devuelve `{ respuesta, acciones }`.
- Las `acciones` propuestas por el agente contable se ofrecen con botones `cont_ok`/`cont_no`
  (webhook `apps/plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts`, prefijo `cont`).

**Consecuencia de diseño: cero endpoint nuevo, cero infraestructura de voz nueva.** Se extiende el
catálogo de intenciones/acciones que ya consume `responder()`, con una categoría nueva de
correduría que se ejecuta **directo** (sin los botones `cont_ok`/`cont_no`, que son del patrón
contable y existen porque ahí sí se confirma antes de tocar dinero).

## Regla dura: identidad antes que ejecución

El `CLAUDE.md` raíz ya prohíbe actuar sobre una persona por su nombre en vez de por su
identificador (hay homónimos reales en la cartera). Esto no es una confirmación de la ACCIÓN — es
evitar ejecutar sobre la PERSONA equivocada:

- Antes de ejecutar cualquier acción con efecto sobre un cliente/contacto, el nombre dicho/escrito
  se resuelve a una ficha única (por identificador, no por texto libre).
- Si hay 0 o >1 coincidencias (homonimia), el agente **no ejecuta**: responde con una pregunta de
  desambiguación en el mismo turno, igual que cualquier respuesta del chat.
- Esto aplica a `autorizar_relacion` y a `enviar_email_invitacion` (el destinatario tiene que
  resolver a una ficha única antes de mandar nada).

## Catálogo de acciones — fase 1

Cada acción llama a lógica/endpoints que **ya existen**, no se reimplementa nada de negocio:

| Acción | Reutiliza |
|---|---|
| `enviar_email_invitacion` | `invitarPortalAsegura` (detrás de `correduria/cliente/portal` POST) |
| `autorizar_relacion` | `autorizarRelacionAsegura` (`correduria/cliente/relaciones` PATCH; crea la relación primero si no existe) |
| `buscar_cliente_poliza` | lectores ya existentes de ficha/póliza (solo lectura, responde en el chat) |
| `crear_recordatorio` | tabla nueva simple (ver más abajo) |

### Multi-acción por turno

`acciones` ya es un array en el contrato de `responder()`. Una frase como "manda la invitación a
Pilar y recuérdame llamar a Reale la semana que viene" puede resolver en dos acciones del mismo
turno; el ejecutor las procesa todas, en orden, y confirma cada una por separado en la respuesta.

### Recordatorios

Tabla nueva (`correduria_recordatorios` o equivalente): texto libre + fecha opcional. Si lleva
fecha, se despacha por el mecanismo de avisos de Telegram ya existente (catálogo de
`lib/telegram/catalogo.ts`) el día que toca — nunca una pantalla nueva que Alberto no vaya a mirar
(regla global "quién mira qué pantalla").

Para la fecha en lenguaje natural ("la semana que viene", "el lunes"): en la fase de implementación,
comprobar primero si ya existe un parser de fechas naturales en el repo (candidatos: subastas,
vencimientos, calendario de sivra) antes de escribir uno nuevo.

## Aprendizaje de frases

Mismo patrón que `sinonimo_negocio:` en `contable_memoria`: cuando el LLM resuelve una expresión
nueva a una acción del catálogo ("dale acceso a X para ver los seguros de Y" ≈ `autorizar_relacion`),
se guarda como sinónimo para que la próxima vez se resuelva determinista y gratis, sin tocar código
ni pagar el LLM otra vez.

## Auditoría y red de seguridad

Como no hay confirmación previa, la seguridad viene de después:

- **Log de cada acción ejecutada** (instrucción original, acción interpretada, resultado):
  reutilizar el mecanismo de log ya existente del agente contable (`logTurno`/`contable_log`) en vez
  de crear una tabla nueva.
- **Comando "deshaz eso"**: revertir la última acción ejecutada, por tipo — `autorizar_relacion` se
  puede revocar (ya existe el DELETE de la relación), `crear_recordatorio` se puede borrar. Enviar un
  email no se puede "deshacer" (se puede avisar de que fue un error, pero no retirarlo).
- **Resumen semanal narrado**: mismo patrón que el cierre de mes narrado de `/banca`
  (`enviarResumenMensual`) — un mensaje corto por Telegram ("esta semana: 1 invitación, 1
  autorización, 2 recordatorios") como forma barata de vigilar un agente que ejecuta sin confirmar,
  sin tener que bucear en el log.
- **Confirmación de resultado siempre por Telegram** ("✅ hecho: invitación enviada a Pilar"),
  independientemente de que la orden llegara por voz o texto — es el canal que Alberto sí mira
  (regla global "quién mira qué pantalla").

## Fuera de alcance (fase 1)

- Otras verticales del grupo (arquitectura lo permite después, sin rediseño: nueva categoría de
  acciones en el mismo catálogo).
- Alias de contactos frecuentes ("Pilar" → persona concreta memorizada tras la primera
  desambiguación) — mejora de comodidad, no bloqueante.
- Interfaz de chat dentro de la intranet — el canal de fase 1 es Telegram; un chat web queda como
  posible vista de solo-lectura del log más adelante, no como canal de entrada.
- Multiusuario (Pilar u otros dando órdenes) — hoy solo Alberto.
