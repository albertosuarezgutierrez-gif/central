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

> **Última actualización:** Mayo 2026 · auditoria completa aplicada

---

## Resumen ejecutivo

**ia.rest** es un Voice POS multi-tenant SaaS B2B para hostelería española.  
El camarero habla → Whisper transcribe → LLM estructura → ticket en cocina en <0.5s.  
Stack: Next.js 16 (Vercel) + Supabase (Postgres 17, RLS, Edge Functions Deno) + Stripe + MONEI Bizum.  
**Alberto trabaja sin terminal local. Todo código debe ser archivo completo listo para push a GitHub web o Supabase Dashboard. Nunca diffs.**

---

## Infraestructura

| Recurso | Valor |
|---|---|
| **App URL** | `https://www.iarest.es` (dominio propio, DNS Vercel) |
| **Supabase project** | `efncqyvhniaxsirhdxaa` (eu-west-1, Postgres 17) |
| **Vercel team** | `team_f4gPpt6dPuNcd5YyMt3q27uf` |
| **Vercel app** | `ia-rest` → `prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo` |
| **Vercel docs** | `ia-rest-docs` → `prj_eKC4r06S5svI3mwJJUbZmLVnbiQE` |
| **Repo** | github.com/albertosuarezgutierrez-gif/ia.rest |
| **Vercel Access Token** | `[VERCEL_TOKEN — guardar en variable de entorno segura]` |
| **Supabase Management Token** | `[SUPABASE_TOKEN — guardar en variable de entorno segura]` |
| **DNS** | A `@→76.76.21.21` · CNAME `www→cname.vercel-dns.com` |

---

## Design System — reglas absolutas

### Paleta (app real — dark theme)
```
Fondo base:       #14110E  (dark, toda la app)
Acento vermilion: #D9442B  (brand, CTAs, urgencia)
Vermilion deep:   #A8311E  (botones presionados)
Texto principal:  #F6F1E7  (crema claro)
Texto secundario: #D8CDB6
Ámbar aviso:      #E8A33B
Ámbar oscuro:     #A8761A  (texto sobre crema)
Verde marchar:    #3F7D44
Reglas:           #D8CDB6  (bordes finos)
```

> ⚠️ El knowledge.md menciona fondo crema `#F6F1E7` — es el concepto de demo/marketing. En la **app real** el fondo es `#14110E`. Usar siempre dark theme para código.

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

- **PIN de 4 dígitos** por camarero (sin password tradicional)
- **6 roles activos** (el rol `admin` fue renombrado a `jefe_sala` en producción):

| Rol | Ruta | PIN demo |
|---|---|---|
| `super_admin` | `/super` | 9999 |
| `owner` | `/owner` | 1369 |
| `jefe_sala` | `/jefe` | 2566 |
| `camarero` | `/edge` | 7672 |
| `cocina` | `/kds` | 3297 |
| `running` | `/running` | 5310 |

- **DEMO token directo:** `www.iarest.es/login?t=62d3124f5185d326ba0e5632`
- **Super shield URL:** `www.iarest.es/api/auth/super-shield?k=a484332b7cee3f1be49b473ebbf2d8ea5a575a8103c85e40` (cookie 8h, HttpOnly)
- **RPC principal:** `validate_pin_with_rate_limit`
- **Tablas de seguridad:** `auth_attempts`, `sesiones_activas`, `security_log`
- **KDS token separado:** campo `kds_token` en `restaurantes`, RPC `rotate_kds_token`
- **Multi-cuenta:** tabla `cuentas` central → `restaurantes.cuenta_id` + `camareros.cuenta_id`. Login por PIN de cuenta con selector si N locales.

---

## Pricing SaaS (pricing per-user dinámico — sin planes fijos)

> ⚠️ Los planes BARRA/SERVICIO/CASA están obsoletos. El modelo actual es per-user dinámico.

| Usuarios (camarero+cocina+jefe_sala; owner no cuenta) | Precio/mes |
|---|---|
| Base (0–1 usuarios) | 59 € |
| Usuarios 2–6 | +20 €/usuario |
| Usuarios 7+ | +15 €/usuario |

**Ejemplos:** 1u=59€ · 3u=99€ · 6u=159€  
**Trial:** 14 días · **Dto anual:** 18% · **Sin comisión por transacción**  
**Posicionamiento:** "único a este precio" (SmartBar: 99,99€)  
**Mercado:** nacional + internacional (no mencionar Sevilla en copy)

### Stripe Price IDs
```
# LIVE
base  → price_1TUKYVK5xixGkeRIEGTKlZFp
e20   → price_1TUKYVK5xixGkeRIL33AA4Ef
e15   → price_1TUKYVK5xixGkeRIMbs7zJ2j

# TEST
base  → price_1TUPaTK5xixGkeRIEU1x3sqG
e20   → price_1TUPaTK5xixGkeRIPu8nSS8q
e15   → price_1TUPaTK5xixGkeRIZJnwRPw0
```

> ⚠️ `STRIPE_MODE=test` activo en producción — cambiar a `live` antes de aceptar pagos reales.

### QR Add-on
+12 €/mesa/mes · Tab QR en `/owner → Config` · DEMO activo: S3 (menú 12.5€/pax oblig), T1 (pago opcional), B1 (solo pedido)

---

## Tablas Supabase (RLS activo en todas)

```
# Core operativo
restaurantes, camareros, mesas, comandas, comanda_items, productos,
secciones_cocina, impresoras, print_jobs, transcripciones, turnos,
productos_86, zonas, producto_formatos, facturas_verifactu, bridge_tokens,
push_subscriptions, alerta_reglas, alerta_log, alergeno_confirmaciones,
metodos_pago, pagos, sugerencias, reglas_envio, cobro_config,
movimientos_caja, comanda_audit_log

# SaaS / auth / seguridad
cuentas, perfiles, auth_attempts, sesiones_activas, security_log,
sms_verification, stripe_events, contract_acceptances, leads,
restaurante_contactos

# Hardware / bridge
bridge_devices, bridge_commands

# QR en mesa
qr_sesiones_cliente

# IA / sistema
ia_training_log, system_errors
```

**Vistas:** `v_productos_con_seccion`

### Constraints críticos (auditados en BD mayo 2026)
- `mesas.estado` CHECK: `libre` · `activa` · `marchar` · `aviso` · `urgente` · `cuenta` — **NUNCA `ocupada`**
- `comandas.estado` CHECK: `nueva` · `en_cocina` · `lista` · `entregada` · `cancelada` · `cerrada` — **NUNCA `pendiente`**
- `comandas.origen` CHECK: `camarero` · `qr_cliente` · `kds` · `sistema` — **NUNCA `voz`**
- `comandas.tipo` CHECK: `comanda` · `cuenta` · `marchar` · `86` · `aviso`
- `comandas.numero_ticket` es `GENERATED ALWAYS` — **no insertar manualmente**
- `comanda_items` requiere siempre `nombre` + `restaurante_id`

### Schema alerta_reglas (columnas existentes + añadidas mayo 2026)
Existentes: `nombre, activa, logica, horario_desde, horario_hasta, destinatario_tipo, camarero_id, canal_vox, canal_push, canal_hub`  
Añadidas: `condicion, umbral_minutos, objeto, mensaje, dias_semana, zona_ids, escalar_a, escalar_minutos, prioridad`

### Schema alerta_log (columnas existentes + añadidas mayo 2026)
Existentes: `regla_id, regla_nombre, mesa_id, camarero_notificado_id, trigger_tipos TEXT[], contexto JSONB, disparada_at, actuada_at, resuelta_por_id, mensaje_voz, leida`  
Añadidas: `referencia_id, reclamado_at, eta_minutos, respondido_at, respondido_por`

---

## Edge Functions activas — 33 total (Deno)

| Función | Versión | Propósito |
|---|---|---|
| `auth-register` | v26 | Registro SaaS / onboarding |
| `stripe-checkout` | v19 | Checkout SaaS (per-user pricing) |
| `webhook-stripe` | v20 | Webhooks Stripe |
| `cobro-stripe` / `cobro-monei` | v16 | Pagos en mesa (card_present + Bizum) |
| `brain-parse` | v17 | LLM → JSON estructurado (BRAIN) |
| `alerta-ritmo-cron` | v17 | Cron alertas ritmo servicio (pg_cron, cada 2 min) |
| `verifactu-sign` | v17 | Firma SHA-256 + QR AEAT |
| `auth-pin-validate` | v17 | Validación PIN con rate limiting |
| `ear-transcribe` | v16 | Whisper Groq (EAR provider) |
| `courier-route` | v16 | Enrutado a impresora/KDS/pasarela |
| `owner-panel` | v18 | API panel propietario |
| `push-send` | v12 | Notificaciones Web Push VAPID |
| `bridge-agent` | v12 | Heartbeat/commands/result bridge local |
| `recuperar-pin` | v8 | Recuperación de PIN |
| `error-ingest` | v9 | Ingesta errores del cliente |
| `contact-lead` | v5 | Captura leads (RGPD, IP anonimizada) |
| `qr-session` | v2 | Sesión cliente QR en mesa |
| `qr-order` | v4 | Pedido QR |
| `qr-cobro` | v1 | Cobro QR |
| `qr-connect` | v1 | Conexión QR |
| `qr-split` | v1 | División cuenta QR |
| `qr-call-waiter` | v2 | Llamada camarero QR |
| `kds-token-validate` | — | Validación token KDS |
| `auth-verify-sms` | — | Verificación SMS Twilio |

### Patrón canónico de Edge Function (Deno)
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

### Configuradas en Vercel
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `MONEI_*`
- `GROQ_API_KEY` (EAR provider principal)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Pendientes de configurar / verificar
- `STRIPE_MODE` — cambiar de `test` a `live` para producción real
- `STRIPE_CLIENT_ID` — necesario para QR cobro
- `STRIPE_WEBHOOK_SECRET_QR` — webhook separado para flujo QR
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — SMS 2FA
- `RESEND_API_KEY` + dominio `noreply@iarest.es` (IONOS Mail Basic pendiente)
- `IP_HASH_SALT`, `INTERNAL_API_SECRET`
- `EAR_PROVIDER=openai` + `OPENAI_API_KEY` — fallback si Groq supera límite free

---

## Módulos completados ✅

| Módulo | Notas |
|---|---|
| **#1** Cierre de cuenta + cobro dividido | Stripe Terminal card_present + MONEI Bizum |
| **#2** VeriFactu | SHA-256 encadenado, QR AEAT. ✅ Listo antes de jul-2026 autónomos |
| **#3** Hardware Bridge Agent | ESC/POS TCP, bridge-local.js, Termux/RPi/PC |
| **#6** Stripe Terminal | `card_present` |
| **#7** Bizum MONEI | |
| **QR en mesa** | `/q/[token]`, 6 EFs, addon +12€/mesa/mes |
| **Motor Flujos v2** | `reglas_envio`, horarios, multi-sección, fallback impresora, pase al marchar |
| **Seguridad v1.0** | Rate limiting, sesiones, purge transcripciones 90d (pg_cron) |
| **Módulo venta SaaS** | Landing, onboarding 6 pasos, contrato v1.0, EFs auth+stripe |
| **APK Android v10** | Icono vermilion, PTT nativo, auto-update via `version.json`, release GitHub android-v1.0 |
| **KDS voz continua** | SpeechRecognition keywords + TTS, filtro sección por URL `?seccion=` |
| **Alertas** | Realtime + TTS + Web Push, cron cada 2 min |
| **Supervisor de Tiempos** | Motor reglas configurable. Tab en /owner+/jefe. Misma fuente de verdad. 6 condiciones. API /api/owner/supervisor. SupervisorTab.tsx compartido. |
| **RGPD leads** | Casilla no pre-marcada, validación server-side EF (422 sin consent), IP anonimizada |

---

## Backlog priorizado

| # | Módulo | Estado | Notas |
|---|---|---|---|
| 5 | **Cashdro HTTP real** | 🟡 En progreso | HTTP API local LAN. Bridge ESC/POS funciona; gestión efectivo Cashdro pendiente |
| 12 | API pública | ⚪ | |
| 14 | Forecaster IA | ⚪ | |
| — | TheFork | ⚪ | Columnas `thefork_secret` + `thefork_customer_id` ya en `restaurantes` |

### Pendientes de configuración (no de desarrollo)
1. `STRIPE_MODE=live` en Vercel env vars
2. `STRIPE_CLIENT_ID` + `STRIPE_WEBHOOK_SECRET_QR` en Vercel
3. `ALTER TABLE leads ADD COLUMN consent_rgpd BOOLEAN, consent_at TIMESTAMPTZ, consent_ip TEXT`
4. Email IONOS Mail Basic → `noreply@iarest.es` → configurar en Resend

### Patrón Supervisor — fuente única owner+jefe_sala
```typescript
// Misma API, mismo componente, mismo restaurante_id
// /owner → <SupervisorTab rol={session.rol} restauranteId={session.restaurante_id} sh={sh} />
// /jefe  → <SupervisorTab rol={session.rol} restauranteId={session.restaurante_id} />
// DELETE solo para owner/super_admin — verificar session.rol en API route
```

---

## Patrones críticos de código

### API Routes Next.js — SIEMPRE `createServerClient`
```typescript
// ✅ CORRECTO — nunca 401
import { createServerClient } from '@/lib/supabase'
const supabase = createServerClient()

// ❌ INCORRECTO — causa 401 silencioso
import { createClient } from '@supabase/supabase-js'
```

### Dynamic routes Next.js 16 — params como Promise
```typescript
// ✅ CORRECTO
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}

// ❌ INCORRECTO — rompe en Next.js 16
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params
}
```

### Git workflow (Alberto puede commitear en paralelo)
```bash
git pull --rebase   # SIEMPRE antes de push
git push
```

### PTT / EAR — globals en Android nativo
```typescript
window.startPTT()   // inicia grabación
window.stopPTT()    // para grabación
window.resetPTT()   // resetea estado
// startRecording acepta screen='idle' y screen='asking'
// timeout asking→idle: 15s
// isNativeApp: true → salta MediaSession web, audio focus re-adquirido
```

### `[skip ci]` — gestionar límite 100 deploys/día Vercel
Añadir `[skip ci]` en el mensaje de commit para cambios en `android/` y `scripts/` que no afectan al deploy.

---

## Hardware bridge

```
Terminal (Android+Termux / PC / RPi Zero 2W ~25€)
  → bridge-local.js (polling TCP puro cada 3s)
  → /api/print
  → bridge-agent v12 (/heartbeat /commands /result /log-error)
  → ESC/POS TCP:9100
  → impresora física
```

`connection_type` acepta: `tcp` · `ip_local` · `usb_bridge`

---

## Vocabulario hostelero (usar en UI/copy)

- "marchar" — enviar a cocina
- "86" — producto agotado
- "la dos" — mesa 2 (referencias cortas)
- "sin gluten, ojo" — alergia crítica
- Codificación mesas: S01-S06 (salón), T01-T03 (terraza), B01-B03 (barra)
- KDS por sección: `calientes` · `frios` · `barra` · `postres` · `sala`

---

## Convenciones de código

1. **Archivos siempre completos** — nunca diffs ni fragmentos parciales
2. **SQL con RLS** — toda tabla nueva necesita políticas RLS
3. **Respuestas de error consistentes** — `{ error: string, code?: string }`
4. **Nombres en español** para tablas/columnas (convención del proyecto)
5. **Multi-tenant** — siempre filtrar por `restaurante_id`
6. **`comandas.estado`** — usar `nueva` (no `pendiente`)
7. **`comanda_items`** — siempre incluir `nombre` + `restaurante_id`
8. **Versioning EFs** — incrementar versión en comentario al desplegar (v1, v2…)

---

## Auto-detección de nuevos skills necesarios

Durante el desarrollo de ia.rest, evalúa si conviene crear un skill nuevo cuando:
- Se repite 3+ veces la misma consulta técnica compleja
- Un módulo nuevo tiene >20 páginas de spec técnica
- Una integración externa tiene quirks importantes (Redsys, TheFork, Cashdro)
- Se establece un patrón de código nuevo usado en múltiples lugares

**Skills candidatos identificados:**
- `ia-rest-hardware-bridge` — cuando se complete el módulo #5 Cashdro
- `ia-rest-supabase-patterns` — si los patrones RLS/RPC se vuelven complejos
- `ia-rest-api-publica` — cuando se empiece el módulo #12
