# Prompt para Claude en Chrome — cierre de la unificación Supabase (19/08/2026)

> Pasos que SOLO puede hacer Alberto (dashboards con sesión). Copia el bloque de abajo en
> Claude para Chrome con las pestañas de Supabase/Stripe/MONEI/Vercel abiertas, o síguelo a
> mano. Contexto: la unificación quedó cerrada por el agente el 19/08/2026 (PR de la rama
> `claude/unificar-supabase-ingress-gastos-zwt9mh`); esto es lo que falta por dashboard.

---

Ayúdame a cerrar la unificación de mis dos proyectos Supabase. Todo el trabajo de BD/código
ya está hecho; faltan estos pasos de dashboard, en este orden:

1. **Renombrar el proyecto compartido a `central`**
   - supabase.com/dashboard → proyecto **«Ingresos Y gastos Smoobu»** (ref `wswbehlcuxqxyinousql`)
     → Settings → General → Project name → `central` → Save.
   - No rompe nada: el ref, las URLs y las claves no cambian.

2. ~~Repuntar el webhook de Stripe~~ **YA HECHO por el agente (19/08, conector Stripe MCP)**:
   el endpoint we_1TU72SK2yY8k1YidQOdbLP2i (modo test, único existente) ya apunta a
   `https://wswbehlcuxqxyinousql.supabase.co/functions/v1/webhook-stripe` conservando su
   signing secret. Referencia original del paso:
   - dashboard.stripe.com → Developers → Webhooks → localiza el endpoint que apunta a
     `https://efncqyvhniaxsirhdxaa.supabase.co/functions/v1/webhook-stripe`.
   - **EDITA su URL** (no crees uno nuevo, así se conserva el signing secret) a:
     `https://wswbehlcuxqxyinousql.supabase.co/functions/v1/webhook-stripe`
   - Si Stripe te obligara a crear un endpoint nuevo: copia su nuevo signing secret y
     actualiza el secret `STRIPE_WEBHOOK_SECRET` en Supabase compartido → Edge Functions →
     Manage secrets. (Repite para el endpoint de test y `STRIPE_WEBHOOK_SECRET_TEST` si existe.)
   - Evidencia de que estaba mal: el proyecto viejo recibía stripe_events hasta el 05/08;
     el compartido tenía 0.

3. **Repuntar el webhook de MONEI (Bizum)**
   - dashboard.monei.com → Settings → Webhooks → cambia la URL a
     `https://wswbehlcuxqxyinousql.supabase.co/functions/v1/webhook-monei`
   - Si MONEI rota el secreto del webhook, actualiza `MONEI_WEBHOOK_SECRET` en los secrets
     de Edge Functions del compartido.

4. **Configurar `app.service_role_key` en la BD compartida** (lo usa el cron `monitor-health-cron`;
   hasta entonces ese cron simplemente no llama, sin errores)
   - Supabase compartido → Settings → API → copia la **service_role key** (revélala).
   - SQL Editor del compartido → ejecuta (pegando la clave):
     `ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';`

5. **Verificar secrets de Edge Functions del compartido** (Edge Functions → Manage secrets).
   Deberían estar desde junio; confirma en particular estos, que usan las functions
   redesplegadas hoy: `NVIDIA_API_KEY` (o `NIM_API_KEY`), `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID`, `FAL_API_KEY`, `CRON_SECRET`, `PLATAFORMA_URL`, `AI_GATEWAY_SECRET`.
   La lista maestra completa está en `docs/RUNBOOK-migracion-bd-iarest.md`.

6. **Storage del proyecto viejo** (opcional, antes de borrarlo algún día): quedan 27 archivos
   demo (3 en `chat-audio`, 23 PDFs en `cobros-pdfs`, 1 en `iarest-app`). Si quieres conservar
   alguno, descárgalo. Mientras el proyecto esté PAUSADO (no borrado) no se pierde nada.

7. ~~Pausar el proyecto viejo~~ **YA HECHO por el agente (19/08, vía MCP)**: `efncqyvhniaxsirhdxaa`
   está pausado (reversible con Restore). Por eso Stripe/MONEI empezarán a avisar de webhooks
   fallidos hasta que hagas los pasos 2-3 — es esperado. Borrarlo del todo es decisión posterior;
   pausado conserva los datos (incluido su Storage del paso 6).

8. **Vercel (comprobación rápida)** — vercel.com → proyecto `ia-rest` → Settings →
   Environment Variables: confirma que `NEXT_PUBLIC_SUPABASE_URL` = la del compartido,
   que existe `NEXT_PUBLIC_SUPABASE_SCHEMA` = `iarest`, y que las keys son las del compartido.
   (El runtime ya escribe en el compartido, así que debería estar bien — es solo confirmación.)

Cuando termines, dile al agente de Claude Code «cierre supabase hecho» para que verifique
(webhook de Stripe llegando al compartido, monitor-health corriendo) y anote la memoria.
