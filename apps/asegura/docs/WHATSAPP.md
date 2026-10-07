# WhatsApp → CRM de la correduría (Cloud API de Meta, solo ENTRANTE)

Estado (05/10/2026): código listo, **apagado**, sin credenciales ni SQL. Sin código de envío (`graph.ts` solo alta/gestión; cepo en su test).

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
5. **Ediciones y borrados** (`type:'edit'`/`'revoke'`): se aplican al ORIGINAL (edit: texto cifrado nuevo +
   `editado_at`, sin resucitar un texto purgado ni retroceder; revoke: texto purgado + `revocado_at`) y la
   conversación vuelve a la cola de la IA. Original desconocido (anterior a la conexión) → `original_desconocido`.
   Error 131060 (no admitido): se cuenta y consta en `metadata.errores`; nunca tumba nada.
6. **Eventos de cuenta** (`lib/whatsapp/eventos.ts`; se registran aunque el canal esté apagado, no llevan texto):
   `account_update` PARTNER_REMOVED (motivo: PRIMARY_INACTIVITY = 14 días sin abrir la app, COMPANION_INACTIVITY,
   BUSINESS_DOWNGRADE, CHANGE_NUMBER, USER_RE_REGISTERED, ACCOUNT_DISCONNECTED) / ACCOUNT_OFFBOARDED /
   ACCOUNT_RECONNECTED → estado en `corredurias` + Telegram (cron de plataforma `correduria-whatsapp-conexion`,
   aviso `correduria.whatsapp-conexion`, sin datos personales). `history` con error 2593109 («No compartir
   chats») → se registra y nada más; con hilos → descartado (solo se cuentan) salvo `WHATSAPP_IMPORTAR_HISTORIAL=1`
   (se guarda en crudo SIN importar: no hay importador). `smb_app_state_sync` → solo acuse (los contactos NO se
   importan: la agenda manda desde Google Contacts).

## Alta (Tech Provider, sin BSP; Embedded Signup v4 + Coexistence)
- Pantalla: plataforma `/correduria/ajustes/whatsapp` → `FB.login` (config_id, `response_type:'code'`,
  `featureType:'whatsapp_business_app_onboarding'`) → `POST /api/operador/whatsapp/alta` (`lib/whatsapp/alta.ts`):
  canjea el code (GET oauth/access_token), guarda el token CIFRADO en `corredurias.wa_access_token`, suscribe la
  app (`/{waba_id}/subscribed_apps`), pide `smb_app_state_sync` y luego `history` (una vez cada uno; 24 h) y
  verifica `is_on_biz_app`/`platform_type`. NO registra el número. Estado: `GET /api/operador/whatsapp/conexion`.
- ⚠️ Duda v4: la versión la fija la configuración (config_id) creada en Meta; si la doc vigente pide otra clave
  en `extras`, se cambia en `apps/plataforma/lib/correduria/whatsapp-embedded-signup.ts`.
- Pasos en Meta: 1) app tipo Business con productos WhatsApp + Facebook Login for Business; verificación de
  negocio y Tech Provider (revisión de app con `whatsapp_business_management` y `whatsapp_business_messaging`);
  2) Facebook Login for Business → Configuración con la plantilla «WhatsApp Embedded Signup» → su id a
  `NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID`; 3) en «Allowed domains» / «Valid OAuth redirect URIs» del login, el dominio
  de plataforma (`https://crm.grupoasegura.es`: Meta rechaza `*.vercel.app`); 4) webhook `https://api.grupoasegura.es/api/webhooks/whatsapp`
  con el verify token, campos: `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync`, `account_update`;
  5) en el móvil, al conectar: **«No compartir chats»**. Abrir la app al menos cada 14 días (si no, PARTNER_REMOVED).

## Envs (proyecto Vercel central-asegura)
| Variable | Uso |
|---|---|
| `WHATSAPP_APP_SECRET` | HMAC de la firma. Falta → 503 |
| `WHATSAPP_VERIFY_TOKEN` | token del alta del webhook. Falta → 503 en GET |
| `WHATSAPP_PHONE_NUMBER_ID` | solo se procesa lo que llega a ese número. Falta → 503 |
| `ASEGURA_WHATSAPP_ACTIVO` | `1` = guarda y procesa; si no, 200 sin guardar nada |
| `ASEGURA_WHATSAPP_IA_ACTIVO` | `1` = el cron llama a la IA (`iaTexto`, `privado`) |
| `WHATSAPP_RETENCION_DIAS` | texto de mensajes, por defecto 730; valor no válido → no purga y 500 |
| `WHATSAPP_APP_ID` | id de la app de Meta (canje del code; requireSecret). Falta → alta 503 |
| `WHATSAPP_GRAPH_API_VERSION` | `vNN.N` para el alta (por defecto v24.0; mal formada → 503) |
| `WHATSAPP_IMPORTAR_HISTORIAL` | `1` = el historial se guarda en crudo (sin importar); si no, se descarta |
| `NEXT_PUBLIC_META_APP_ID` · `NEXT_PUBLIC_WHATSAPP_ES_CONFIG_ID` | en **plataforma**: SDK JS y configuración del ES |

## Estado (07/10/2026)
- Hecho: SQL 05b y 05f aplicados; envs puestas (salvo `ASEGURA_WHATSAPP_*`: apagado); app Meta 2876291632747697
  (portfolio 1111884827984949, config_id 1106985788466271); webhook verificado con los 5 campos.
- Bloqueo: el Embedded Signup responde «no puede incorporar clientes». Falta: verificación de empresa (EN REVISIÓN
  desde 07/10, autónomo «Alberto Suárez Gutiérrez») → Tech Provider → revisión de app y publicarla.
- Pendiente: quitar en Meta los 8 campos que suscribe solo (`calls`, `security`…); decidir el `REVOKE` a
  `crm_seguros`; plataforma: bandeja, pestaña de la ficha y botón «no es personal».
- NUNCA registrar el número por la API/MCP de Meta (`register`/`add_phone_number`): lo saca del móvil.

## RGPD
- **Base legal**: interés legítimo / medidas precontractuales (art. 6.1.b y f RGPD) para quien escribe a la
  correduría por un asunto de seguros. Lo personal (familia, amigos) no es tratamiento de la correduría: la IA
  lo descarta y se purga el texto; queda el hash del número. Revisar con el DPO el aviso del perfil de WhatsApp.
- **Minimización**: número cifrado + hash (en `lead_wa_phone`, seudónimo `h:`); texto cifrado; crudo de Meta
  minimizado al procesar (y a los 30 días si no se procesó); a la IA solo texto redactado + ramos/estado.
- **Retención**: cron `whatsapp-retencion` (diario) borra el texto con más de `WHATSAPP_RETENCION_DIAS`.
  **Supresión**: `DELETE /api/operador/whatsapp/conversaciones?id=` (conversación, mensajes y crudo; lo que la IA
  escribió en la ficha va por el procedimiento de la ficha). `auditoria` sin datos personales.
