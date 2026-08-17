# ia.rest — Agentes IA, setup de secretos y flujo git (Secciones 6-8)

# ═══════════════════════════════════════════════
# SECCIÓN 6 — AGENTES IA (dónde viven y cómo actúan)
# ═══════════════════════════════════════════════

> Aclaración clave: **los agentes de ia.rest NO son agentes de Claude Code.**
> Son código de producción que corre solo en Vercel/Supabase usando NIM/Gemini
> (**sin Anthropic en ningún sitio** desde 17/06/2026: las 2 edge functions Deno
> —qr-assistant→NIM, eventos-entorno→Gemini google_search— ya migradas).
> Claude Code solo los **edita y despliega**; no los ejecuta
> ni ellos lo llaman a él. Relación: Claude Code construye → Vercel ejecuta.

## Dónde está guardado cada agente (todo en el repo de GitHub)

**1. API routes de cron** (la mayoría):
```
app/api/cron/*            alertas · cobro-inactividad · feedback-visita ·
                          lead-onboarding · reservas-noshow · pipeline-comercial ·
                          crm-recordatorios · eventos-entorno · briefing-semanal ·
                          prospeccion-leads · instagram · instagram-refresh ·
                          instagram-metricas · mantenimiento-espacios · completar-locales
app/api/super/qa-agent/cron
app/api/backup/drive
```

**2. Edge Functions (Deno)** en Supabase:
```
supabase/functions/monitor-health     → Auto-Healer
supabase/functions/daily-briefing
supabase/functions/nim-diagnostico · nim-sentiment · notify-error
```

## Qué los dispara
- `vercel.json` (bloque `crons`) → horarios de producción.
- `pg_cron` en Supabase → job #6 (alerta-ritmo).

## Su "cerebro"
Todos llaman a `lib/ai-client.ts` (`callAI`/`callAISearch`/`callAIVision`/`callAITools`) → **pasarela central**
si está configurada, si no NIM → Haiku. Los 4 agentes del god-panel (agentes-ai, agente-arquitecto,
agentes-seo, cron/seo-agent) migraron de Anthropic a NIM+Gemini el 16/06/2026 (`callAITools`/`callAISearch`).
NINGUNO usa ya la API de Anthropic como vía principal (solo queda como fallback sin saldo).

## Su estado / memoria
Tablas de BD: `qa_patrones_error`, `ia_training_log`, `alerta_log`,
`instagram_semana`, `blog_borradores`, `leads`...

## Panel de control
`/super` → tabs Auto-Healer · QA · Pipeline · Instagram · Blog · Arquitecto
(solo para verlos y lanzarlos a mano).

## Listado y estado
| Agente | Cron | Estado |
|---|---|---|
| Auto-Healer v1.0 | */5 * * * * | ✅ Prod — tasa 97.9% |
| QA Agent v3 | 6:00 diario + 7:00 lunes | ✅ Prod — 6 patrones |
| Lead Hunter | */30 * * * * | ✅ Prod |
| Blog SEO | 8:00 lunes | ✅ Prod |
| Instagram v6 — semana temática | briefing dom 8:30 → lun/mié/vie 8:00 | ✅ Prod — dom: 3 ideas blog por Telegram, Alberto elige → lun 🗂️ carrusel A/B de portada (claves), mié 🎬 Reel IA (Kling+Cloudinary, marca+cierre 2s), vie 🗂️ carrusel (errores ↔ frases de barra alternos). Aprobación por Telegram (webhook del bot en PLATAFORMA → reenvío `x-operador-secret`). Al aprobar un post de imagen se publica también **Story automática** con `/api/ig-img?...&story=1` (lienzo 1080×1920 real — la imagen cuadrada del feed a pelo sale recortada en Stories; fix 17/08/2026, PR #1467). ⛔ reels de slides Cloudinary NUNCA |
| Pipeline Comercial v1.0 | 8:00 lun-vie | ✅ Prod |
| Churn | — | 🔵 Backlog (cuando haya clientes) |

# ═══════════════════════════════════════════════
# SECCIÓN 7 — SETUP, SECRETOS Y ENTORNO LOCAL
# ═══════════════════════════════════════════════

> Principio: el secreto se **guarda cifrado fuera de git** y se **usa** leyéndolo
> en runtime desde `process.env`. En el repo solo el NOMBRE de la variable.

## Patrón "guardar y usar a la vez"
1. **Guardar** una vez en Vercel → Environment Variables (cifrado). Fuente de verdad.
2. **Producción** la app/crons/API routes leen con `process.env.X`.
3. **Local / Claude Code**:
   ```bash
   vercel env pull .env.local     # baja todas las vars a .env.local (gitignored)
   ```
   `next dev` y Claude Code las leen de ahí. Mismo secreto, un solo sitio.

## Casos especiales
- **Edge Functions (Supabase)** — almacén propio:
  ```bash
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
  ```
- **Service account de Drive** → variable única `GOOGLE_SA_JSON` (JSON en base64),
  parsear en runtime. El `.json` NUNCA al repo.
- **Git de Claude Code** → SSH o `gh auth login` (credential helper del sistema).
  NO meter el PAT en `.env`.
- **Passwords personales** (paneles, AEAT) → gestor (Bitwarden / 1Password).
- **Nivel pro opcional**: Doppler / Infisical (un panel, sincroniza a Vercel +
  pull local + rotación). Con `vercel env pull` ya tienes el 90%.

## `.gitignore` recomendado
```gitignore
# Dependencias / build
node_modules/
.next/
out/
dist/

# Entorno y secretos — NUNCA al repo
.env
.env.*
!.env.example
ia-rest-drive-*.json
*-sa-*.json
*service-account*.json

# Sistema
.DS_Store
*.log
```

## `.env.example` (nombres, SIN valores — documenta qué falta configurar)
```bash
# --- Supabase ---
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# --- Sesión / auth ---
SESSION_SECRET=
SESSION_ENFORCE=true
CRON_SECRET=
SUPER_SHIELD_KEY=

# --- IA ---
GROQ_API_KEY=
GEMINI_API_KEY=
NIM_API_KEY=

# --- Stripe ---
STRIPE_SECRET_KEY=
STRIPE_MODE=
STRIPE_WEBHOOK_SECRET_OPERADOR=
STRIPE_WEBHOOK_SECRET_QR=
STRIPE_WEBHOOK_SECRET_STOREFRONT=
STRIPE_CLIENT_ID=

# --- Google Drive (service account) ---
GOOGLE_SA_JSON=          # JSON completo en base64

# --- Infra / tooling (no en repo; aquí solo referencia) ---
GITHUB_PAT=              # mejor usar SSH/gh en local
VERCEL_TOKEN=
```

# ═══════════════════════════════════════════════
# SECCIÓN 8 — SUBIR A GITHUB (flujo de commit)
# ═══════════════════════════════════════════════

> Antes del primer commit, verificar que NO se cuela ningún secreto.

```bash
# 1. Confirmar que .gitignore cubre .env y los .json de credenciales
git status            # NO debe aparecer ningún .env ni *-sa-*.json ni ia-rest-drive-*.json

# 2. Añadir solo lo seguro
git add CLAUDE.md .claude/ docs/ ia-rest-MAESTRO_skill.md .gitignore .env.example

# 3. Commit + push (flujo del proyecto)
npx tsc --noEmit                              # 0 errores TS
git fetch origin && git merge origin/main --no-edit
git commit -m "docs: documento maestro + skills + indice para Claude Code"
git push origin main
```

**NUNCA** `git pull --rebase` (pierde archivos nuevos).
**NUNCA** push sin `tsc --noEmit` limpio.

Si algún secreto se commiteó por error: rotarlo (no basta con borrarlo, queda en
el historial) y limpiar con `git filter-repo`.

---

## FIN DEL DOCUMENTO MAESTRO
Todo el conocimiento operativo de ia.rest está en este archivo. Lo que vive fuera
(BD, secretos, docs pesados, backups) está **apuntado** en la Sección 0 con su
ubicación e ID. Mantén la Sección 0 al día y nada se pierde.
