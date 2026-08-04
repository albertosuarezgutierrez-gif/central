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
- **/auditoria-diaria:** vigila la frescura de `correo_triaje` (heartbeat) y reconcilia `rutas.ts`
  contra `.claude/skills/` (skill nueva con correo entrante sin categoría → PR draft + Telegram).

## Qué NO romper
- No tocar los correos que ya llevan filtro Gmail existente (`IA`, `inmobiliaria`, `Facturas/*`) ni
  los ya triados (`Triaje/*`): el orquestador los salta por etiqueta antes de clasificar.
- Nunca borrar correo: archivar es solo quitar de INBOX. `dudoso`/`codigos-verificacion` se dejan intactos.
- `seguridad-sospechosa` **solo marca y avisa**, nunca actúa (evita falsos positivos con acciones).
- El dedupe canónico es `correo_triaje.gmail_message_id` (Message-ID): sobrevive a resets de UIDVALIDITY.

<!-- verificado: 2026-07-10 -->
