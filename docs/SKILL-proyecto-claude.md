---
name: ia-rest-project
description: >
  Contexto técnico completo del proyecto ia.rest (Voice POS para hostelería española).
  USAR SIEMPRE que Alberto pida: código para ia.rest, Edge Functions, migraciones SQL,
  componentes React/Next.js, diseño UI, integraciones (Stripe, MONEI, Twilio, Supabase),
  VeriFactu, módulos nuevos, revisión de arquitectura, o cualquier tarea de desarrollo
  relacionada con ia.rest. También activar si Alberto menciona: restaurantes, camareros,
  comandas, KDS, sala, cobros, o cualquier funcionalidad del sistema.
---

# ia.rest — Skill de proyecto

Lee este archivo ANTES de escribir cualquier código o responder cualquier pregunta técnica sobre ia.rest. Contiene convenciones, stack, patrones y decisiones de diseño que deben respetarse siempre.

---

## Resumen ejecutivo

**ia.rest** es un Voice POS multi-tenant SaaS B2B para hostelería española.  
El camarero habla → Whisper transcribe → LLM estructura → ticket en cocina en <0.5s.  
Stack: Next.js (Vercel) + Supabase (Postgres 17, RLS, Edge Functions Deno) + Stripe Terminal + MONEI Bizum.  
**Alberto trabaja sin terminal local. Todo código debe ser copy-paste directo a GitHub web o Supabase Dashboard.**

---

## Infraestructura

| Recurso | Valor |
|---|---|
| Supabase project | `efncqyvhniaxsirhdxaa` (eu-west-1, Postgres 17) |
| Vercel team | `team_f4gPpt6dPuNcd5YyMt3q27uf` ("Pisos turisticos' projects") |
| Vercel app | `ia-rest` → `prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo` |
| Vercel docs | `ia-rest-docs` → `prj_eKC4r06S5svI3mwJJUbZmLVnbiQE` |
| Repo | github.com/albertosuarezgutierrez-gif/ia.rest |
| Email | alberto.suarez.gutierrez@gmail.com |

---

## Design System — reglas absolutas

### Paleta
```
Fondo base:      #14110E  (dark, toda la app)
Acento vermilion: #D9442B  (brand, CTAs, urgencia)
Vermilion deep:  #A8311E  (botones presionados)
Texto principal: #F6F1E7  (crema claro)
Texto secundario:#D8CDB6
Ámbar aviso:     #E8A33B
Verde marchar:   #3F7D44
```

> ⚠️ El knowledge.md menciona fondo crema #F6F1E7 como concepto de demo/marketing. En la app real el fondo es #14110E. Usar siempre el dark theme para código.

### Tipografía
- `Newsreader` — titulares, números grandes italic
- `Inter Tight` — UI body, labels, botones
- `JetBrains Mono` — datos, IDs, transcripciones, telemetría
- `Caveat` — microcopy con personalidad, notas marginales

### Anti-patrones (nunca hacer)
- No gradientes morados/azules AI genéricos
- No emojis en UI salvo contextos de mood
- No KPIs decorativos sin datos reales
- No tonos "enterprise sobrio"

---

## Auth & Roles

- **PIN de 4 dígitos** (sin password tradicional)
- Roles: `super_admin` · `owner` · `admin` · `camarero` · `cocina`
- PINs demo: ADMIN·0000 / OWNER·2026 / SUPER·9999
- RPC principal: `validate_pin_with_rate_limit`
- Tablas de seguridad: `auth_attempts`, `sesiones_activas`, `security_log`
- KDS usa token separado: campo `kds_token` en `restaurantes`, RPC `rotate_kds_token`

---

## Tablas Supabase (RLS activo en todas)

```
restaurantes, camareros, mesas, comandas, comanda_items, productos,
secciones_cocina, impresoras, print_jobs, transcripciones, turnos,
productos_86, zonas, producto_formatos, facturas_verifactu, bridge_tokens,
push_subscriptions, alerta_reglas, alerta_log, alergeno_confirmaciones,
metodos_pago, pagos, auth_attempts, sesiones_activas, security_log,
perfiles, sms_verification, stripe_events
```
Vista: `v_productos_con_seccion`

---

## Edge Functions activas (Deno)

| Función | Propósito |
|---|---|
| `alerta-ritmo-cron` | Cron de alertas de ritmo de servicio |
| `cobro-stripe` | Pagos Stripe Terminal (`card_present`) |
| `webhook-stripe` | Webhooks de Stripe |
| `owner-panel` | API del panel de propietario |
| `auth-pin-validate` | Validación de PIN con rate limiting |
| `kds-token-validate` | Validación de token KDS |
| `auth-register` | Registro SaaS (onboarding) |
| `auth-verify-sms` | Verificación SMS via Twilio |
| `stripe-checkout` | Checkout SaaS (planes) |

### Patrón de Edge Function (Deno)
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    // lógica aquí
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

---

## Variables de entorno

### Configuradas
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_PUBLISHABLE_KEY`, `MONEI_*`

### Pendientes de configurar
- `IP_HASH_SALT`, `INTERNAL_API_SECRET`, `SUPABASE_EDGE_FUNCTIONS_URL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

---

## Planes SaaS

| Plan | Precio | Límites |
|---|---|---|
| BARRA | €59/mes | 1 camarero, ≤12 mesas |
| SERVICIO | €99/mes | 4 camareros, mesas ilimitadas |
| CASA | €169/mes | Camareros y mesas ilimitados |

- Trial: 14 días en SERVICIO completo, sin tarjeta
- Funciones SQL clave: `activar_plan()`, `cancelar_plan()`

---

## Módulos completados ✅

- **#1** Cierre de cuenta + cobro dividido
- **#6** Stripe Terminal (`card_present`)
- **#7** Bizum MONEI
- **Seguridad v1.0** — rate limiting, sesiones, purge transcripciones 90d vía pg_cron
- **Módulo venta SaaS** — landing, onboarding 6 pasos, Edge Functions auth/stripe
- **Pipeline voz blindado** (mayo 2026) — ver sección PTT más abajo
- **QR Add-on** — +12€/mesa/mes, cobro Stripe, mesas S3/T1/B1 demo
- **Fichaje jornada** — RD-ley 8/2019, commit a56320b
- **Supervisor tiempos** — 6 condiciones, /owner+/jefe
- **VeriFactu** — firmado SHA-256, serie T/B demo OK

---

## Backlog priorizado

| # | Módulo | Estado | Notas |
|---|---|---|---|
| **2** | **VeriFactu** | ✅ COMPLETADO | Firmado SHA-256, serie T/B/F, AEAT validado |
| 3 | Hardware Bridge Agent | 🟡 | App Tauri/Node, gRPC, abstrae Cashdro/Epson/Redsys en LAN |
| 5 | Cashdro | 🟡 | HTTP API local LAN |
| 9 | Voice Order Pad | ⚪ | |
| 11 | Carta dinámica | ⚪ | |
| 12 | API pública | ⚪ | |
| 14 | Forecaster IA | ⚪ | |

**TheFork**: columnas `thefork_secret` + `thefork_customer_id` ya en `restaurantes`, integración planificada.  
**ia_training_log**: activa — guarda comandas con confianza <0.65 para revisión y fine-tuning propio.

---

## Vocabulario hostelero (usar en UI/copy)

- "marchar" — enviar a cocina
- "86" — producto agotado
- "la dos" — mesa 2 (referencias cortas)
- "sin gluten, ojo" — alergia crítica
- Codificación: T04 (terraza), B11 (barra), M02 (interior)

---

## Convenciones de código

1. **Archivos siempre completos** — nunca diffs ni fragmentos parciales
2. **SQL con RLS** — toda tabla nueva necesita políticas RLS
3. **Respuestas de error consistentes** — `{ error: string, code?: string }`
4. **Nombres en español** para tablas/columnas (convención del proyecto)
5. **Multi-tenant** — siempre filtrar por `restaurante_id`

---

## Pipeline de voz — arquitectura (mayo 2026)

### Flujo completo
```
CAMARERO HABLA → PTT → Groq Whisper → BRAIN Router → Comanda → KDS
```

### PTT — refs clave en /edge/page.tsx
| Ref | Tipo | Propósito |
|---|---|---|
| `pttManualRef` | `useRef<boolean>` | true mientras botón pulsado → desactiva VAD |
| `fetchInFlightRef` | `useRef<boolean>` | lock global anti-peticiones paralelas |
| `cooldownRef` | `useRef<boolean>` | cooldown 1.5s post-grabación |
| `recordStartRef` | `useRef<number>` | timestamp inicio → duración mínima 600ms |
| `recordingIdRef` | `useRef<string>` | UUID idempotency key por grabación |
| `abortFetchRef` | `useRef<AbortController>` | cancela fetch en vuelo |
| `maxRecTimerRef` | `useRef<timeout>` | auto-stop a los 90s |
| `watchdogRef` | `useRef<timeout>` | reset forzado si processing >35s |
| `audioLevel` | `useState<number>` | nivel RMS 0-100 para indicador visual |

### VAD (Voice Activity Detection) — solo activo en modo auricular
- `SILENCE_DURATION = 2500ms` (2.5s de silencio → para)
- Umbral adaptativo: mide ruido ambiente 400ms → threshold = ruido × 1.4 (mín 6)
- **Si `pttManualRef.current === true` → VAD en pausa** (no corta comandas largas)

### BRAIN Router — capas
1. `brain-patron.ts` — regex/fuzzy < 10ms, €0, confianza ≥ 0.80
2. ~~Modelo propio~~ (futuro, ~2.000 pares entrenamiento)
3. `brain.ts` — Claude Haiku, timeout 20s, confianza < 0.65 → ia_training_log

### EAR (Groq Whisper)
- `src/lib/ear.ts` — `whisper-large-v3-turbo`, lang=es
- Reintentos: MAX_RETRIES=2, backoff 800ms/1.6s
- No reintenta en 401 (API key inválida)

### Anti-duplicado — 5 capas
1. `fetchInFlightRef` — bloquea start si hay fetch activo
2. `cooldownRef` — 1.5s pausa post-stop
3. Duración mínima 600ms — descarta tap accidental
4. `recordingIdRef` — UUID único por grabación
5. Cache servidor 30s — mismo recording_id → resultado cacheado

### window globals (APK Android)
- `window.startPTT()` — activa pttManualRef + startRecording
- `window.stopPTT()` — desactiva pttManualRef + stopRecording
- `window.resetPTT()` — cancela fetch+timers, limpia todos los locks, vuelve a idle

---

## Referencias adicionales

- `references/verifactu.md` — especificación técnica VeriFactu (cuando esté disponible)
- `references/hardware-bridge.md` — protocolo gRPC bridge (cuando esté disponible)

---

## Auto-detección de nuevos skills necesarios

Durante el desarrollo de ia.rest, evalúa si conviene crear un skill nuevo cuando:
- Se repite 3+ veces la misma consulta técnica compleja (ej: "cómo firmar XML VeriFactu")
- Un módulo nuevo tiene >20 páginas de spec técnica (ej: hardware bridge, API pública)
- Una integración externa tiene quirks importantes (Redsys, TheFork, Cashdro)
- Se establece un patrón de código nuevo que se usará en múltiples lugares

**Skills candidatos identificados:**
- `ia-rest-verifactu` — cuando se empiece el módulo #2
- `ia-rest-hardware-bridge` — cuando se empiece el módulo #3
- `ia-rest-supabase-patterns` — si los patrones RLS/RPC se vuelven complejos
