# Recaptación de leads sin vencimiento — diseño

Fecha: 12/09/2026. Decidido con Alberto en sesión (rama `claude/poliza-bidp023227-catalana-sesyfs`).

## Contexto

El volcado histórico de la correduría (28.728 pólizas / ~32.600 fichas) es en su mayoría leads
con fecha de vencimiento conocida (se trabajarán en una fase posterior, por vencimiento). Hay un
subconjunto — 846 pólizas `estado='activa'` sin `fecha_vencimiento` — donde no hay fecha a la que
anclar el contacto. De esas, 669 tienen teléfono y/o email legible. Alberto quiere una forma de
ir contactándolos con WhatsApp/email personalizados, pulsando él mismo el envío.

## Alcance de la cola

Un lead entra en la cola de recaptación si cumple TODO:
1. `polizas.import_ref` no nulo y no vacío (viene del volcado).
2. `polizas.eiac_xml_hash IS NULL` (no confirmado por CIMA).
3. `polizas.estado = 'activa'`.
4. `polizas.fecha_vencimiento IS NULL`.
5. El cliente tiene `telefono_lookup_hash` o `email_lookup_hash` no nulo (hay algún contacto).
6. **Exclusión (no prioridad):** el `cliente_id` NO tiene ninguna otra póliza que cumpla
   `esCarteraViva()` de `@central/module-seguros` (`import_ref IS NULL` o `eiac_xml_hash IS NOT
   NULL`). Si el cliente ya es cliente vivo por CIMA en otro ramo, se gestiona desde su ficha
   normal — no aparece aquí.
7. Ni el cliente ni el canal concreto (teléfono/email) están en opt-out
   (`wa_opt_out_at`/`email_opt_out_at` de `seguros.clientes`, ya existentes).
8. No tiene una fila `recaptacion_envios` de los últimos 14 días para ese lead (cooldown) —
   salvo que la pantalla ofrezca "ver igualmente" para forzarlo.
9. No tiene una fila `recaptacion_envios` con `estado='descartado'` (exclusión permanente).

## Datos nuevos

Tabla `seguros.recaptacion_envios`:

| columna | tipo | notas |
|---|---|---|
| `id` | uuid pk | |
| `correduria_id` | uuid | ámbito, como el resto de `seguros.*` |
| `cliente_id` | uuid | FK a `clientes` |
| `poliza_id` | uuid | FK a `polizas` (la póliza zombi concreta) |
| `canal` | enum `whatsapp` \| `email` | |
| `estado` | enum `enviado` \| `enlace_abierto` \| `abierto` \| `pinchado` \| `descartado` | `enlace_abierto` es techo de WhatsApp (no hay lectura sin WABA); `abierto`/`pinchado` solo email |
| `mensaje` | text | el texto final mostrado/enviado, para auditoría |
| `motivo_descarte` | text nullable | solo si `estado='descartado'` |
| `resend_message_id` | text nullable | para casar el webhook |
| `creado_por` | text | actor (Alberto) |
| `created_at` / `updated_at` | timestamp | |

Sin tabla nueva para "cola calculada": se deriva en cada `GET`, como ya hace
`actividad-cartera.ts`. Cada envío/descarte deja también fila en `historial_interno` del cliente
(regla del repo: toda escritura dentro de `seguros` deja rastro ahí).

## Mensaje personalizado

Plantilla con huecos (nombre, ramo, aseguradora anterior, nº de póliza) rematada por una llamada
a `@central/core-ai` (categoría barata) para darle tono natural. Se muestra editable en pantalla
ANTES de cualquier envío o apertura de enlace — nunca se manda lo que Alberto no ha visto y podido
tocar (regla global "comunicaciones salientes": nunca sin autorización explícita para ESE envío).

## Canales

- **WhatsApp** (sin WABA, como el resto del repo): botón que abre
  `https://wa.me/<teléfono>?text=<mensaje codificado>` en pestaña nueva. Al pulsar se registra
  `recaptacion_envios` con `estado='enlace_abierto'`. No hay forma de saber si el cliente lo leyó.
- **Email**: a diferencia de los correos existentes en `apps/asegura` (que van por SMTP vía
  `@central/core-email` y no dan tracking), este flujo envía por la **API HTTP de Resend**
  (`track_opens`/`track_clicks` activados), solo para este caso de uso. Un webhook nuevo
  `POST /api/webhooks/resend` (verificado con el signing secret de Resend, tipo `svix`) recibe
  `email.opened`/`email.clicked` y actualiza el `estado` de la fila que case por
  `resend_message_id`.

## Estados y semáforo

`enviado` → `abierto` → `pinchado` (email); `enviado`/`enlace_abierto` (WhatsApp, techo). Solo un
semáforo simple por lead en la pantalla — sin timeline de eventos (decisión explícita de Alberto:
"estado simple", no historial completo).

## Descarte manual

Botón "no interesado / no sigue con seguro / no contactar" en la ficha del lead → inserta
`recaptacion_envios` con `estado='descartado'` (+ `motivo_descarte` opcional). Saca al lead de la
cola PARA SIEMPRE (no vuelve tras el cooldown). El registro nunca se borra — regla global del
repo sobre no perder información.

## Cooldown

14 días por defecto tras cualquier envío (`enviado`/`enlace_abierto`), configurable como constante
en el módulo puro (no hardcodeado dos veces). La pantalla puede forzar "ver igualmente" para saltarse
el cooldown en un lead concreto sin cambiar el valor global.

## Contador semanal

En la propia pantalla: "N contactados esta semana / M con apertura o respuesta" — mismo patrón de
conteo independiente que `actividad-cartera.ts` (cada cifra se cuenta aparte, un fallo no tumba las
demás).

## Arquitectura (dónde vive cada cosa)

- **Puerto** (`apps/asegura`, Bearer `ASEGURA_OPERADOR_SECRET`):
  - `GET /api/operador/recaptacion` — la cola calculada + contadores semanales.
  - `POST /api/operador/recaptacion/whatsapp` — registra `enlace_abierto` tras pulsar.
  - `POST /api/operador/recaptacion/email` — genera texto final, envía por Resend API, registra
    `enviado` con `resend_message_id`.
  - `POST /api/operador/recaptacion/descartar` — registra `descartado`.
  - `POST /api/webhooks/resend` — recibe eventos de Resend, actualiza `estado`.
- **Pantalla**: `apps/plataforma` → `/correduria`, nueva sección "Recaptación" (patrón
  `Secciones.tsx` ya existente), con badge de contador.
- **Reglas puras**: `@central/module-seguros` (cola/exclusión/cooldown como funciones testeadas,
  siguiendo el patrón de `cartera-viva.ts`/`retencion.ts`).

## Fuera de alcance de esta primera vuelta

- Leads CON fecha de vencimiento conocida (fase posterior, por vencimiento).
- Envío automático o por lotes: siempre un lead, un clic, una vez.
- WhatsApp Business API / lectura de mensajes de WhatsApp (no hay WABA).
- Historial completo de eventos de email (solo estado simple).
