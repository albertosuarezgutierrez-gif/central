# Edge Functions de ia.rest — inventario

> Inventario generado en el cierre de la unificación Supabase (19/08/2026).
> Fuente canónica: proyecto compartido `wswbehlcuxqxyinousql`, schema `iarest`.
> **Desplegar SIEMPRE a ese proyecto.**

Fuente TS en el repo: `apps/ia-rest/supabase/functions/<slug>/index.ts`.
La columna «fuente en repo» refleja el estado ANTES del rescate del 19/08/2026
(las 26 marcadas «no» solo existían desplegadas; ese día se bajaron al repo).
Las 5 functions `qr-assistant`, `daily-briefing`, `nim-sentiment`, `nim-diagnostico`
e `ig-video-gen` fueron sincronizadas repo→compartida ese mismo día.

| # | slug | verify_jwt | fuente en repo (antes del rescate) |
|---|------|------------|------------------------------------|
| 1 | alerta-ritmo-cron | false | sí |
| 2 | analizar-cv | true | no |
| 3 | auth-pin-validate | false | no |
| 4 | auth-register | false | no |
| 5 | auth-verify-sms | false | no |
| 6 | brain | false | no |
| 7 | brain-parse | false | no |
| 8 | bridge-agent | false | no |
| 9 | check-elaboraciones | false | sí |
| 10 | cobro-monei | false | no |
| 11 | cobro-stripe | false | no |
| 12 | contact-lead | false | sí |
| 13 | courier-route | false | no |
| 14 | daily-briefing | false | sí |
| 15 | ear-transcribe | false | no |
| 16 | enviar-verifactu | false | no |
| 17 | error-ingest | false | no |
| 18 | eventos-entorno | false | sí |
| 19 | ia-training-dashboard | false | no |
| 20 | ig-video-gen | true | sí |
| 21 | infra-monitor-cron | false | sí |
| 22 | kds-token-validate | false | no |
| 23 | lead-research | true | no |
| 24 | menu-stockout | false | no |
| 25 | monitor-health | true | sí |
| 26 | nim-diagnostico | false | sí |
| 27 | nim-sentiment | false | sí |
| 28 | notify-error | false | sí |
| 29 | owner-panel | false | no |
| 30 | push-send | false | no |
| 31 | qr-assistant | false | sí |
| 32 | qr-call-waiter | false | sí |
| 33 | qr-cobro | false | sí |
| 34 | qr-connect | false | sí |
| 35 | qr-order | false | sí |
| 36 | qr-session | false | sí |
| 37 | qr-split | false | sí |
| 38 | recuperar-pin | false | no |
| 39 | stripe-checkout | true | no |
| 40 | test-runner | false | no |
| 41 | tg-send | false | no |
| 42 | verifactu-sign | false | no |
| 43 | vox-confirm | false | no |
| 44 | webhook-monei | false | no |
| 45 | webhook-stripe | false | sí |

Nota del rescate (19/08/2026): en las 14 functions que ya tenían fuente en el repo, la
versión desplegada en la compartida era MÁS VIEJA (10/06/2026) que el archivo del repo
(commit 16/08/2026) — típicamente el repo va por delante (p. ej. `eventos-entorno` migró
de Anthropic web_search a Gemini el 17/06/2026 solo en el repo). En esos casos NO se tocó
el repo; la desplegada quedó pendiente de redespliegue desde el repo, no al revés.
