---
name: ia-rest-project
description: >
  Contexto técnico completo del proyecto ia.rest (Voice POS para hostelería española).
  USAR SIEMPRE que Alberto pida: código para ia.rest, Edge Functions, migraciones SQL,
  componentes React/Next.js, diseño UI, integraciones (Stripe, MONEI, Supabase),
  VeriFactu, módulos nuevos, revisión de arquitectura, o cualquier tarea de desarrollo
  relacionada con ia.rest. También activar si Alberto menciona: restaurantes, camareros,
  comandas, KDS, sala, cobros, voz, brain, impresión, QR, o cualquier funcionalidad del sistema.
---

# ia.rest — Skill de proyecto (actualizado 19/05/2026)

Lee este archivo ANTES de escribir cualquier código o responder cualquier pregunta técnica sobre ia.rest.

---

## Resumen ejecutivo

**ia.rest** es un Voice POS multi-tenant SaaS B2B para hostelería española.
Camarero habla → Groq Whisper transcribe → NVIDIA NIM/Claude estructura → ticket en cocina.
Stack: Next.js (Vercel Pro) + Supabase (Postgres 17, RLS, Edge Functions Deno) + Stripe + Groq.

**Output rules CRÍTICO:**
- Todo código SIEMPRE inline en el chat como bloques de código
- NUNCA usar present_files para entregar código (Alberto no ve archivos por URL)
- Archivos siempre completos — nunca diffs ni fragmentos parciales

---

## Flujo de trabajo Git/Deploy

1. Clonar: `git clone https://<EN_GESTOR_DE_SECRETOS>@github.com/albertosuarezgutierrez-gif/ia.rest`
2. Antes de push: `git pull --rebase origin main`
3. Si conflictos: `git stash → pull --rebase → stash pop → push`
4. Push a `main` = deploy automático Vercel Pro (sin límite, sin ignoreCommand)
5. NUNCA mencionar ramas dev — push directo a `main` siempre

---

## Infraestructura

| Recurso | Valor |
|---|---|
| URL producción | www.iarest.es |
| Supabase project | <EN_GESTOR_DE_SECRETOS> (eu-west-1, Postgres 17) |
| Vercel team | <EN_GESTOR_DE_SECRETOS> |
| Vercel app | ia-rest → <EN_GESTOR_DE_SECRETOS> |
| Vercel docs | ia-rest-docs → <EN_GESTOR_DE_SECRETOS> |
| Repo | github.com/albertosuarezgutierrez-gif/ia.rest |
| GitHub PAT | <EN_GESTOR_DE_SECRETOS> |
| DEMO token | www.iarest.es/login?t=<EN_GESTOR_DE_SECRETOS> |
| SUPER shield | www.iarest.es/api/auth/super-shield?k=<EN_GESTOR_DE_SECRETOS> |

---

## Design System

### Paleta
```
Fondo base:       #14110E  (dark, TODA la app — nunca crema en código)
Acento vermilion: #D9442B  (brand, CTAs, urgencia)
Vermilion deep:   #A8311E  (botones presionados)
Texto principal:  #F6F1E7  (crema claro)
Texto secundario: #D8CDB6
Ámbar aviso:      #E8A33B
Verde marchar:    #3F7D44
```

### Tipografía
- Newsreader — titulares, números grandes italic
- Inter Tight — UI body, labels, botones
- JetBrains Mono — datos, IDs, transcripciones, telemetría
- Caveat — microcopy con personalidad, notas marginales

### Anti-patrones (nunca hacer)
- No gradientes morados/azules AI genéricos
- No emojis en UI salvo contextos de mood
- No fondo crema en código de app (solo en marketing)
- NUNCA bg oscuro (#14110E/#1F1A15) + texto C.ink/ink2/ink3 sin sobreescribir color (invisible)
- Sobre fondos oscuros usar: dkFg=#F6F1E7 dkFg2=#C9BFAA dkFg3=#8D8270

---

## Auth & Roles

- PIN de 4 dígitos (sin password tradicional)
- 6 roles activos (NO usar "admin" — fue renombrado a jefe_sala):

| Rol | PIN demo | Ruta |
|---|---|---|
| super_admin | 9999 | /super |
| owner | 1369 | /owner |
| jefe_sala | 2566 | /jefe |
| camarero | 7672 | /edge |
| cocina | 3297 | /kds |
| running | 5310 | /running |

- RPC: validate_pin_with_rate_limit
- Auth en API routes: SIEMPRE getSession() + getRestauranteId() de @/lib/session
- NUNCA usar x-session-token ni acceder sesiones_activas directamente
- KDS: token separado kds_token en restaurantes, RPC rotate_kds_token

---

## Stack de IA

```
EAR (ASR):   Groq Whisper → buildWhisperPrompt() con carta+vocab (caché 5min/restaurante)
BRAIN v2:    Patrón<10ms → nim_8b_fast~80ms (Groq llama-3.1-8b-instant, comandas ≤9 pal)
                         → claude_api~800ms (NIM 70b + Haiku fallback)
VOX (TTS):   /api/vox → msedge-tts → es-ES-ElviraNeural (sin API key, sin coste)
LLM texto:   lib/ai-client.ts → callAI() → NVIDIA NIM meta/llama-3.3-70b-instruct primario
                                          → Anthropic Claude Haiku (fallback timeout 8s)
LLM visión:  lib/ai-client.ts → callAIVision() → NIM meta/llama-3.2-11b-vision-instruct → Haiku
```

Patrón lib/ai-client.ts: centraliza callAI(), callAIVision(), cleanJSON().
El resto del código SOLO llama estas funciones — nunca llama a NVIDIA/Anthropic directamente.

### BRAIN — tipos de resultado (BrainResult.tipo)

| tipo | mesa | items | nota_general | Acción en transcribe |
|---|---|---|---|---|
| comanda | código mesa | productos+cant+formato | nota global | INSERT comandas + comanda_items + print_jobs |
| marchar | código mesa | [] | null | UPDATE mesas estado=marchar |
| cuenta | código mesa | [] | null | UPDATE comanda estado=cuenta_pedida + print ticket |
| 86 | T00 | productos agotados | null | INSERT productos_86 |
| aviso | destinatario¹ | [] | texto mensaje | INSERT mensajes_turno (rol_destino mapeado) |
| mesa_rapida | '' | [] | null | intent=mesa_rapida + zona + alias_cliente |

¹ `aviso.mesa` = `"cocina"` | `"barra"` | `"sala"` | `"todos"` — NO un código de mesa real
→ ROL_MAP: cocina→cocina · barra/sala→camarero · todos→todos
→ INSERT en mensajes_turno con tipo='voz', leido_por=[camareroId]

### BRAIN — KW_MENSAJE (brain-patron.ts — early return null, sección 3.5)

Cuando el camarero dice cualquiera de estas frases → patron devuelve null → escala a LLM (70b):
`mensaje a cocina|barra|sala|todos`, `mensaje para cocina|barra|sala|todos`,
`avisa a cocina|barra|sala`, `avisa cocina|barra|sala`,
`di a cocina`, `dile a cocina`, `comunica a cocina`, `manda mensaje`,
`aviso a cocina|barra|sala|para cocina|para barra|para sala`

El LLM devuelve: `tipo:"aviso"`, `mesa:"cocina"`, `nota_general:"S1 esperando croquetas"`, `items:[]`

### BRAIN — PALABRAS_COMPLEJIDAD (brain-router — nunca va al 8b)

```
sin, pero, aunque, cambiar, quitar, nota, alergi, celiac, vegano, vegana,
picante, templado, especial, mitad, aparte, antes, después, espera,
cancelar, anular, cobrar, cuenta, divid, split, transferir,
mensaje, avisa, aviso    ← añadido 19/05/2026 (fix mensajes a cocina)
```

---

## Patrón crítico: Turnos (2 tipos coexisten)

```typescript
// Turno de SERVICIO (mesa/sala) — camarero_id IS NULL
// Turno de FICHAJE (personal)   — camarero_id tiene UUID

// ✅ SIEMPRE filtrar turno activo de servicio así:
const { data: turno } = await supabase
  .from('turnos')
  .select('*')
  .eq('restaurante_id', restauranteId)
  .eq('estado', 'activo')
  .is('camarero_id', null)    // IS NULL — no .eq('camarero_id', null)
  .maybeSingle()              // maybeSingle — no .single()

// ❌ ERROR — mata fichajes o explota
.eq('camarero_id', null)   // sintaxis incorrecta para IS NULL
.single()                  // lanza error si no hay turno activo
```

---

## Patrón crítico: Impresión (guard dedup)

```typescript
// ✅ CORRECTO — courier-route genera print_jobs automáticamente
POST /api/comanda → courier genera print_jobs → imprime

// ❌ NUNCA llamar /api/marchar tras /api/comanda
// El courier YA genera el push marchar internamente
// Llamarlo manualmente DUPLICA la impresión

// Guard dedup activo: 30s filtrando payload->>'tipo'='marchar'
```

---

## Auth pattern en API routes

```typescript
// ✅ SIEMPRE este patrón completo
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function POST(req: Request) {
  const supabase = createServerClient()
  const session = await getSession(supabase)
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = await getRestauranteId(session)
}

// ❌ NUNCA
import { createClient } from '@supabase/supabase-js'      // causa 401
const token = req.headers.get('x-session-token')           // patrón obsoleto
```

---

## Dynamic routes Next.js (App Router)

```typescript
// ✅ CORRECTO — params siempre Promise
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}

// ❌ ERROR
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params  // TypeError en runtime
}
```

---

## Tablas Supabase (RLS activo en todas)

```
Core: restaurantes, camareros, mesas, zonas, comandas, comanda_items,
      productos, producto_formatos, secciones_cocina, turnos, pagos,
      cobro_config, movimientos_caja, comanda_audit_log

Impresión: impresoras, print_jobs, bridge_tokens, bridge_devices, bridge_commands

IA / Voz: transcripciones, voice_profiles, ia_training_log, system_errors

Mensajería: mensajes_turno (campos: camarero_id, rol_origen, nombre_origen,
            rol_destino, destinatario_id, tipo, texto, mesa_ref, leido_por, turno_id)

Facturas: facturas_verifactu, clientes_fiscales, facturas_cliente

Storefront: storefront_config, pedidos_online

QR: qr_sesiones_cliente

SaaS: auth_attempts, sesiones_activas, security_log, perfiles,
      contract_acceptances, leads, cuentas, restaurante_contactos

Extras: push_subscriptions, alerta_reglas, alerta_log, alerta_condiciones,
        sugerencias, reglas_envio, productos_86,
        documentos_escaneados, candidatos, cv_analisis
```

### Constraints críticos BD
- comandas.estado: nueva|en_curso|lista|cerrada — NUNCA pendiente ni abierta
- mesas.estado: libre|activa|marchar|aviso|urgente|cuenta
- comanda_items: obligatorios → nombre (desnormalizado) + restaurante_id (RLS)
- Multi-tenant: SIEMPRE filtrar por restaurante_id

---

## Edge Functions activas — 32+ (Deno)

Auth & SaaS: auth-register v26, auth-pin-validate v17, auth-verify-sms v15,
stripe-checkout v19, webhook-stripe v20, webhook-monei v17, contact-lead v4

Core TPV: brain-parse v17, brain v15, ear-transcribe v16, cobro-stripe v16,
cobro-monei v16, courier-route v16, bridge-agent v12, verifactu-sign v17,
enviar-verifactu v15, owner-panel v18, push-send v12, vox-confirm v15,
kds-token-validate v15, menu-stockout v15, recuperar-pin v8, error-ingest v9,
ia-training-dashboard v16, test-runner v13

QR: qr-session v2, qr-order v4, qr-cobro v1, qr-connect v1, qr-split v1, qr-call-waiter v2

Cron: alerta-ritmo-cron v17 (pg_cron job #6, cada 2min)

API routes Next.js relevantes: /api/vox, /api/brain/conversar, /api/turnos/fichar,
/api/scanner/clasificar, /api/rrhh/candidatos, /api/clientes-fiscales,
/api/factura/cliente, /api/mensajes (GET/POST/PATCH → mensajes_turno)

### Patrón Edge Function (Deno)
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // SIEMPRE service role en EFs
    )
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

---

## Pricing SaaS (mayo 2026)

- Base: 59 EUR/mes (incluye 1 usuario operativo)
- Usuarios 2–6: +20 EUR/usuario/mes
- Usuarios 7+: +15 EUR/usuario/mes
- Trial: 14 días completo, sin tarjeta
- Descuento anual: 18%
- QR add-on: +12 EUR/mesa/mes

Ejemplos: 1u=59€ · 3u=99€ · 6u=159€

Stripe TEST price IDs: base=<EN_GESTOR_DE_SECRETOS>
                       e20=<EN_GESTOR_DE_SECRETOS>
                       e15=<EN_GESTOR_DE_SECRETOS>
Stripe LIVE price IDs: base=<EN_GESTOR_DE_SECRETOS>
                       e20=<EN_GESTOR_DE_SECRETOS>
                       e15=<EN_GESTOR_DE_SECRETOS>
STRIPE_MODE=test (activo) — cambiar a live en primer cliente real

---

## Variables de entorno pendientes

```
STRIPE_CLIENT_ID              # bloqueante: pagos QR inline (P2)
STRIPE_WEBHOOK_SECRET_QR      # bloqueante: pagos QR inline (P2)
STRIPE_WEBHOOK_SECRET_STOREFRONT                         # (P3)
AZURE_SPEECH_KEY + REGION     # voice profiles (opcional)
```

---

## Módulos en producción (mayo 2026)

- Voice/Brain: PTT, Groq Whisper EAR, BRAIN v2 (patron+nim_8b_fast+claude_api), VOX ElviraNeural
- Mensajes voz: rol/nombre/sección → print_job si sección tiene impresora (67c05d6)
- Marchar granular: "marcha croquetas S1" → comanda_items.estado=listo → tachado KDS (67c05d6)
- Chuleta Voz: 5 bloques comanda/mensaje/marchar/86/vino en /owner /edge /running /kds (01c4688)
- Permisos personal (e367f80): camareros.puede_comandar + modulos_gestion JSONB. RPC login_pin actualizada. Modal /owner PERMISOS con tooltips.
- Headers /jefe+/edge: icono 🍷 vino + icono perfil condicional (jefe→/edge si puede_comandar; camarero→/jefe si jefe_sala)
- VinoModal.tsx: modal reutilizable dark/light. Chips platos reales. /api/vinos/recomendar (callAI+vinos_catalogo ≤200 chars). /edge+/jefe
- useModulo() hook: comprueba modulos_activos. Caché en memoria. Default todos activos → sin impacto existente.
- restaurantes.modulos_activos JSONB: 20 módulos default todos. API /api/owner/modulos GET+PUT. Núcleo protegido.
- ModulosTab /owner Config: 3 grupos (núcleo/base/opcional), toggles, tooltips impacto, VeriFactu badge ley.
- /portal: gestión para usuarios con modulos_gestion sin rol sala. Login redirige automático. RRHH+Analytics reales.
- Fix TS build (0a40815 PROD): VinoModal session type, portal checking, jefe import React.
- Turnos · Cobro Stripe+MONEI · VeriFactu (obligatorio ley) · Bridge v6.0.1 · APK v2.0
- QR(sin_pago ok) · Storefront v1.0 · Almacén/Escandallos/Vinos · Escáner IA · Supervisor · Auto-Healer
- Producto formatos T/M/R · Multi-cuenta · Contrato SaaS v1.0 · Sugerencias · RRHH v1.0

## Pendientes prioritarios

- P1: STRIPE_MODE=live
- P2: STRIPE_CLIENT_ID + WEBHOOK_SECRET_QR (bloqueante QR cobro)
- P3: STRIPE_WEBHOOK_SECRET_STOREFRONT
- T2: camareros→personal ANTES de API pública (#12)
- AZURE_SPEECH_KEY + REGION en Vercel (voice profiles)
- Cashdro: conectar cashdroAbrirCajon() al cobro efectivo en /edge
- Multi-idioma Whisper: ✅ implementado (restaurantes.idioma_whisper)
- Rotación token QR: ✅ implementado (al abrir turno)
- T3 Cashdro: ✅ lib + API + BD implementados

---

## Vocabulario hostelero

- "marchar" — enviar a cocina
- "86" — producto agotado
- "la dos" — mesa 2 (referencias cortas)
- "sin gluten, ojo" — alergia crítica
- Codificación: T04 (terraza), B11 (barra), M02 (interior)
- Formatos: T=tapa, M=media, R=ración

---

## Convenciones de código

1. Archivos siempre completos — nunca diffs ni fragmentos parciales
2. SQL con RLS — toda tabla nueva necesita políticas RLS
3. Respuestas de error consistentes — { error: string, code?: string }
4. Nombres en español para tablas/columnas
5. Multi-tenant — siempre filtrar por restaurante_id
6. Versioning EFs — incrementar comentario // v12 → // v13 al desplegar
7. comandas.estado — usar nueva (nunca pendiente ni abierta)
8. owner/jefe_sala: sh es función ()=>Record<string,string> → siempre sh()

---

## Skills adicionales disponibles

- ia-rest-verifactu — facturación VeriFactu + facturas_cliente
- ia-rest-hardware-bridge — bridge impresoras ESC/POS, Cashdro, APK
- ia-rest-supabase-patterns — patrones RLS, RPC, Realtime, errores frecuentes
- ia-rest-qr — módulo QR completo (sesiones, cobro, split, call-waiter)
