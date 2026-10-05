# WhatsApp → CRM de la correduría (Cloud API de Meta, solo ENTRANTE)

Estado (05/10/2026): código listo, **apagado**. Sin credenciales de Meta ni SQL aplicado. No hay código de envío.

## Flujo
1. **Webhook** `app/api/webhooks/whatsapp/route.ts`. GET = handshake (`hub.verify_token`, tiempo constante).
   POST = firma `X-Hub-Signature-256` (HMAC del cuerpo CRUDO) → flag → Zod → crudo a `channel_inbound_messages`
   (dedupe por wamid) → 200 → procesado en `after()`. Campos: `messages` (entrante) y `smb_message_echoes`
   (lo que Alberto escribe desde el móvil en Coexistence = saliente). `statuses` y el resto se ignoran.
2. **Fase 1, sin IA** (`lib/whatsapp/procesar.ts`): número → E.164 (`aE164`) → hashes (`formasHashTelefono`,
   el índice ciego no cambia) → ficha viva (`clientes` + `cliente_telefonos`, siguiendo fusiones) →
   conversación (una por correduría + teléfono) → mensaje (dirección, fecha, wamid, estado, texto CIFRADO).
   Teléfono sin ficha: **no se crea ficha**; la conversación queda `pendiente_clasificar`. Teléfono en >1
   ficha: no se vincula a ninguna. Opt-out (`wa_opt_out_at`): solo consta el evento.
3. **Fase 2, IA** (cron `whatsapp-analizar`, cada 15 min): conversaciones con mensajes nuevos y ≥10 min de
   silencio. Últimos 40 mensajes, tope 6.000 caracteres, texto pasado por `redactarPii` y sin el nombre del
   contacto. Salida Zod `.strict()` (`lib/whatsapp/analisis.ts`); campo ausente = `null`.
   Ejecutor con lista blanca (`lib/whatsapp/ejecutor.ts`): `updateLead` (solo hacia delante) · `createOpportunity`
   (no si hay una abierta del ramo; reutiliza `crearOportunidad`) · `updateOpportunity` (rellena huecos, estado
   no terminal, `info_riesgo.whatsapp_ia`) · `createTask` (`gestiones`, `origen_trigger='whatsapp_ia'`, dedupe) ·
   `updateContact` (solo nombre vacío) · `addConversationNote` (`historial_interno` tipo contacto). La IA no da
   ids. Personal sin ficha → `descartada_personal` + texto purgado. Comercial sin ficha → lead por `altaCliente`
   (fuente whatsapp, nombre del perfil si parece un nombre). Cada acción → `auditoria` (`agente:whatsapp-ia`).
4. **Lectura** `GET /api/operador/whatsapp/conversaciones?clienteId=` · `?bandeja=pendientes` (Bearer operador).

## Envs (proyecto Vercel central-asegura)
| Variable | Uso |
|---|---|
| `WHATSAPP_APP_SECRET` | HMAC de la firma. Falta → 503 |
| `WHATSAPP_VERIFY_TOKEN` | token del alta del webhook. Falta → 503 en GET |
| `WHATSAPP_PHONE_NUMBER_ID` | solo se procesa lo que llega a ese número. Falta → 503 |
| `ASEGURA_WHATSAPP_ACTIVO` | `1` = guarda y procesa; si no, 200 sin guardar nada |
| `ASEGURA_WHATSAPP_IA_ACTIVO` | `1` = el cron llama a la IA (`iaTexto`, `privado`) |
| `WHATSAPP_RETENCION_DIAS` | texto de mensajes, por defecto 730; valor no válido → no purga y 500 |

## Pasos pendientes
- **SQL**: `prisma/sql/2026-10-05b_whatsapp_crm.sql` (gate DDL: PR + 2 ojos). Antes de `ASEGURA_WHATSAPP_ACTIVO=1`.
  Decidir el `REVOKE` comentado a `crm_seguros` (confirmar que el repo de Manuel no usa estas tablas).
- **Meta**: app en developers.facebook.com con producto WhatsApp; WABA + número en **Coexistence** (el número
  sigue en la app del móvil); webhook `https://api.grupoasegura.es/api/webhooks/whatsapp` con el verify token;
  suscribir `messages` y `smb_message_echoes`; copiar App Secret y phone_number_id a Vercel. El onboarding de
  Coexistence ofrece importar el historial (`history`): hoy se IGNORA a propósito.
- Plataforma: pintar la bandeja y la pestaña de la ficha; botón «no es personal» (hoy no hay reclasificación).

## RGPD
- **Base legal**: interés legítimo / medidas precontractuales (art. 6.1.b y f RGPD) para quien escribe a la
  correduría por un asunto de seguros. Lo personal (familia, amigos) no es tratamiento de la correduría: la IA
  lo descarta y se purga el texto; queda el hash del número para no volver a guardar su texto. Revisar con el DPO
  el aviso en el perfil de WhatsApp Business.
- **Minimización**: número cifrado + hash (en `lead_wa_phone`, seudónimo `h:`); texto cifrado; crudo de Meta
  minimizado al procesar (y a los 30 días si no se procesó); a la IA solo texto redactado + ramos/estado.
- **Retención**: cron `whatsapp-retencion` (diario) borra el texto con más de `WHATSAPP_RETENCION_DIAS`.
- **Supresión**: `DELETE /api/operador/whatsapp/conversaciones?id=` borra conversación, mensajes y crudo. Lo que
  la IA escribió en la ficha (tareas, notas, oportunidades) se suprime por el procedimiento de la ficha.
- `auditoria` es append-only y no lleva datos personales: solo tipo de acción, resultado e ids.
