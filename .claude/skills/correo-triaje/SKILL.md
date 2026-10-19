---
name: correo-triaje
description: Router de contexto del agente de TRIAJE DE CORREO — cron de Vercel en apps/plataforma cada ~10 min (NO sesión Claude) que lee Gmail por IMAP, clasifica y actúa (etiquetas, archivado, aviso Telegram). Úsala si Alberto pide "revisa/ajusta el triaje de correo", añadir categoría/remitente, o cuando /auditoria-diaria reconcilie la tabla de rutas. Sin secretos.
---

# Agente de triaje de correo — casa de marcas (Alberto)

Reparte el correo entrante para que Alberto deje de perder tiempo con ofertas/spam: el ruido sale
del inbox, la contabilidad se la pasa al agente `facturas-correo`, y lo personal/importante se avisa
por Telegram. **Corre como cron de Vercel (código), no como sesión Claude** — este documento es el
mapa para entenderlo y tocarlo con seguridad.

## Dónde vive todo (apps/plataforma)
- **Tabla de rutas (FUENTE ÚNICA):** `lib/correo/rutas.ts` — `RUTAS[]` con `categoria → etiqueta
  Gmail + archivar + aviso`. El prompt del clasificador se GENERA de aquí (`descripcionParaPrompt`).
- 🔔 **El aviso «inmediato» tiene INTERRUPTOR POR CATEGORÍA** (panel `/telegram`, 01/09/2026):
  `avisoDeCategoriaCorreo()` de `lib/telegram/catalogo.ts` mapea la categoría a su id
  (`correo.personal-importante` · `correo.huespedes` · `correo.agoda` · `correo.leads` ·
  `correo.seguridad` · `correduria.lead-correo`) y `triaje.ts` emite con `tgAviso`. **Categoría sin id mapeado → avisa
  siempre**, nunca al revés. Al añadir una categoría con `aviso:'inmediato'`, añade su id al mapa Y
  al catálogo en el mismo PR (lo exige el guardián `lib/telegram/catalogo.test.ts`).
  ⚠️ **`correo.huespedes` está SILENCIADO** desde el 01/09/2026 por decisión de Alberto («esto
  tampoco necesito, ni los avisos de mail de mensaje de booking»): un `stats.avisados` bajo en esa
  categoría es lo esperado, no un fallo del triaje. Los borradores del agente de huéspedes siguen.
  El digest diario y el resumen semanal tienen sus propios interruptores (`correo.digest`,
  `correo.resumen-semanal`).
- **Lector IMAP:** `lib/correo/imap.ts` — incremental por UID, 1 conexión/pasada; etiqueta (X-GM-LABELS
  vía `messageCopy`) y archiva (`messageDelete` de INBOX = quitar de INBOX, NO Papelera).
- **Clasificador:** `lib/correo/clasificador.ts` — orden `correo_reglas` → regex OTP → **keyword
  determinista** (`lib/correo/keywords.ts::clasificarPorKeyword`, alta precisión por dominio/prefijo/
  asunto: Stripe·PayPal·IBKR→contabilidad, Booking·Smoobu·HomeExchange→huéspedes, Occident·`mediadores@`
  →correduría, marketing conocido→ruido; 0 tokens, rescata lo que la IA saturada dejaba en `dudoso`) → IA
  (`llamarIA()`: **Groq primero** —`GROQ_API_KEY`, segundos, no los ~25s de NIM que agotaban el
  timeout de la función—, `aiComplete`/NIM como respaldo). Duda/error → `dudoso` (default seguro,
  no toca el correo). Auto-aprende reglas. (PRs #743/#744/#745, 04/07/2026: normalización de
  categoría tolerante a mayúsculas/puntuación, cap de 10 correos/pasada para no agotar los 300s
  de Vercel, y el cambio a Groq — NIM colgaba cada llamada y todo caía a `dudoso`.)
- **Lead de la CORREDURÍA por correo (19/10/2026), categoría `correduria-lead`** (`Triaje/Correduria-Leads`,
  inmediato, no se archiva; aviso `correduria.lead-correo`). Regla DETERMINISTA sin IA
  (`lib/correo/lead-correduria.ts::esLeadCorreduria`): destinatario (To/Cc/Delivered-To/X-Original-To/
  X-Forwarded-To, `imap.ts::destinatariosDe`) en `@grupoasegura.es|.com` (dominio de `MEDIADOR`) + remitente
  externo (ni la correduría, ni `GMAIL_USER`, ni aseguradora, ni no-reply) + abre hilo (sin In-Reply-To/
  References) + sin keyword. Corre tras `correo_reglas` (una aprendida a `leads-negocio` no le gana) y antes
  del regex OTP. Respuestas del lead en su hilo: casan por referencias con un Message-ID `correduria-lead` de
  `correo_triaje` (`lead-correduria-hilo.ts`) → solo historial. En VIVO (`lead-correduria-proceso.ts`): la IA
  (`llamarIA`) extrae y TODO se valida contra el texto (teléfono/email/nombre que no estén en el correo → null);
  solo `es_lead:true` da de alta (null/false → solo aviso). Las fichas se casan SOLO por el From; si el teléfono del cuerpo cae en otra ficha → «revisar a mano» (sin historial ni oportunidad). Descarta no-reply/dmarc en cualquier parte del buzón y `List-Unsubscribe`/`Auto-Submitted`/`Precedence: bulk`; el OTP va antes (salvo «código postal»). Máx. 2 leads por pasada y ninguno pasados 150 s: se difieren (fila borrada, cursor antes). Tope diario en asegura: 20 altas y 20 oportunidades con fuente correo. Alta por el MISMO puerto que la web
  (`altaClienteAsegura` → `interpretarAltaLead`, `fuente:'correo'`, actor `agente:triaje-correo`, sin
  consentimiento web); ficha existente → historial `contacto`; una oportunidad por ramo (`fuente:'correo'`,
  tope 20/día en asegura, primer paso email HOY). **Petición de datos (19/10/2026, F1):** SOLO lo que falta, desde el
  contrato único `contratoDatos`/`peticionDatos` de `module-seguros` (varios ramos = un bloque por ramo, la persona una
  vez; lo que el correo ya dice y lo del Catastro no se repite) + pie legal de `MEDIADOR` + RGPD. Va como borrador con
  ✅/✏️/❌ (`clp_*`, aviso `correduria.lead-peticion`, tabla `correduria_pendiente_tg`): **nada sale sin el ✅**; el
  ✅ envía por el puerto de asegura (`POST /api/operador/correo/lead`) EN SU HILO, con BCC a hola@. Sin tabla, sin ficha
  propia o sin Message-ID válido → la plantilla para COPIAR de antes. Hogar con referencia catastral válida → Catastro
  al riesgo (solo lo vacío). El eco de esa BCC (From de la correduría + referencias) es `correduria-eco`: solo por
  regla, sin aviso ni historial.
  `leads-negocio` es SOLO ia-rest/ialimp.
- **Huéspedes → SIVRA:** `lib/correo/huespedes.ts` — resuelve el nº de confirmación de Booking a
  bookingId de Smoobu y llama a `procesarMensajeHuesped` (el agente de huéspedes ya existente).
- **Orquestador:** `lib/correo/triaje.ts` — `pasadaTriaje()` / `digestTriaje()` / `resumenSemanal()`.
- **Crons:** `app/api/cron/correo-triaje` (`*/10 * * * *`), `correo-digest` (`30 20 * * *`),
  `correo-resumen-semanal` (`0 9 * * 1`) — en `vercel.json`. Auth `lib/cron-auth.ts` (`CRON_SECRET`).
- **BD (wswbehlcuxqxyinousql):** `correo_triaje` (registro/dedupe/heartbeat), `correo_cursor`
  (último UID), `correo_reglas` (semilla VIP + auto-aprendizaje). SQL: `prisma/sql/2026-07-03_correo_triaje.sql`.
- **Envs (ya existen, sin secretos nuevos):** `GMAIL_USER`/`GMAIL_APP_PASSWORD` (IMAP),
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (avisos), `NVIDIA_API_KEY` (IA), `CRON_SECRET` (auth).
  **🟢 EN VIVO desde el 10/07/2026** (`TRIAJE_DRY_RUN=false` en Vercel plataforma, Production): ya etiqueta/
  archiva en Gmail de verdad y avisa por Telegram. El **modo sombra** sigue disponible como salvaguarda —
  `TRIAJE_DRY_RUN` sin poner o `=true` vuelve a clasificar y anotar en BD SIN tocar Gmail ni avisar (útil para
  validar un cambio de rutas/categorías antes de soltarlo).

## Cómo se extiende (lo que Alberto pedirá)
- **Añadir una categoría** (p.ej. un vertical nuevo genera correos): edita SOLO `lib/correo/rutas.ts`
  (añade una `RutaCorreo`). El prompt y el digest se actualizan solos. Redeploy de plataforma.
- **Forzar la decisión de un remitente** (que un dominio vaya siempre a X): fila en `correo_reglas`
  (`patron` = email exacto o `@dominio`, `categoria`). El clasificador la aplica antes de la IA (0 tokens).
- **Modo sombra** para validar un cambio sin riesgo: pon `TRIAJE_DRY_RUN=true` en Vercel; revisa los digests;
  luego **vuelve a `=false`** para seguir en vivo (el default sin la var es sombra).

## Contrato con otros agentes
- **facturas-correo:** el triaje etiqueta la contabilidad como **`Triaje/Contabilidad`**; la query de
  `facturas-correo` incluye `OR label:Triaje/Contabilidad`. ⚠️ Vercel **no puede disparar** esa rutina
  de Claude Code — lo etiquetado se recoge en su pasada de las 08:00 (o un 2º disparo manual a las 15:00).
- **Agente de huéspedes SIVRA:** el triaje delega los correos de huésped en `procesarMensajeHuesped`,
  que trae idempotencia propia (`claimMensaje`/`esEcoPropio`), así que no choca con la vía Smoobu (cron `*/3`).
- **Factura mensual de Sique Brilla (03/10/2026):** correo de `limpiezascruzz@gmail.com` con «factura» en el asunto → el triaje (sin pasar por el clasificador ni por `yaEtiquetado`) lee el PDF (`lib/correo/imap.ts` conserva sus adjuntos por dirección exacta), `lib/sivra/factura-cuadre.ts` (puro) cuadra unidades por piso con los checkouts no cancelados del mes en `incomes` y la aritmética, guarda en `limpieza_facturas` (`fuente='correo_pdf'`, solo si la aritmética es sana) y avisa por Telegram (`facturas.siquebrilla-cuadre`) con `factura-cuadre-correo.ts`. Solo en modo vivo (`TRIAJE_DRY_RUN=false`). PDF ilegible → «no he podido leer la factura».
- **/auditoria-diaria:** vigila la frescura de `correo_triaje` (heartbeat) y reconcilia `rutas.ts`
  contra `.claude/skills/` (skill nueva con correo entrante sin categoría → PR draft + Telegram).

## Qué NO romper
- No tocar los correos que ya llevan filtro Gmail existente (`IA`, `inmobiliaria`, `Facturas/*`) ni
  los ya triados (`Triaje/*`): el orquestador los salta por etiqueta antes de clasificar.
- Nunca borrar correo: archivar es solo quitar de INBOX. `dudoso`/`codigos-verificacion` se dejan intactos.
- `seguridad-sospechosa` **solo marca y avisa**, nunca actúa (evita falsos positivos con acciones).
- El dedupe canónico es `correo_triaje.gmail_message_id` (Message-ID): sobrevive a resets de UIDVALIDITY.

<!-- verificado: 2026-07-10 -->
