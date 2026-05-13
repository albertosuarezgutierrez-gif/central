---
name: ia-rest-project
description: >
  Contexto técnico completo del proyecto ia.rest (Voice POS para hostelería española).
  USAR SIEMPRE que Alberto pida: código para ia.rest, Edge Functions, migraciones SQL,
  componentes React/Next.js, diseño UI, integraciones (Stripe, MONEI, Supabase),
  VeriFactu, módulos nuevos, revisión de arquitectura, o cualquier tarea de desarrollo
  relacionada con ia.rest. También activar si Alberto menciona: restaurantes, camareros,
  comandas, KDS, sala, cobros, o cualquier funcionalidad del sistema.
---

# ia.rest — Skill de proyecto (mayo 2026)

Lee este archivo ANTES de escribir cualquier código. Contiene convenciones, stack y decisiones de diseño que deben respetarse siempre.

---

## Stack y flujo de trabajo

**ia.rest** es un Voice POS multi-tenant SaaS B2B para hostelería española.
Stack: Next.js 16 (Vercel) + Supabase (Postgres 17, RLS, Edge Functions Deno) + Stripe + MONEI Bizum.

**Flujo Claude:**
- Claude trabaja en rama `dev`, NUNCA en `main`
- GitHub PAT disponible: <GITHUB_PAT_EN_MEMORIA>
- Siempre `git pull --rebase` antes de push
- Cuando Alberto aprueba → Claude hace merge dev→main → Vercel despliega
- Solo `main` despliega. `dev` nunca despliega.
- Outputs: archivos completos, nunca diffs

**Versiones coloquiales:** PRUEBA (dev) → REAL (merge main, Alberto aprueba)

---

## Infraestructura

| Recurso | Valor |
|---|---|
| URL producción | www.iarest.es |
| Supabase | efncqyvhniaxsirhdxaa (eu-west-1, Postgres 17) |
| Vercel team | team_f4gPpt6dPuNcd5YyMt3q27uf |
| Vercel app | ia-rest → prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo |
| Repo | github.com/albertosuarezgutierrez-gif/ia.rest |
| DEMO login | www.iarest.es/login?t=62d3124f5185d326ba0e5632 |
| SUPER shield | www.iarest.es/api/auth/super-shield?k=a484332b7cee3f1be49b473ebbf2d8ea5a575a8103c85e40 |
| Estado público | www.iarest.es/estado |

---

## Design System

```
Fondo base:       #14110E  (dark, toda la app)
Vermilion:        #D9442B  (brand, CTAs, urgencia)
Vermilion deep:   #A8311E  (botones presionados)
Texto principal:  #F6F1E7
Texto secundario: #D8CDB6
Ámbar:            #E8A33B
Verde marchar:    #3F7D44
```

⚠️ El knowledge.md menciona fondo crema — es marketing. En la app real siempre dark #14110E.

Tipografía: Newsreader (titulares italic) · Inter Tight (UI) · JetBrains Mono (datos) · Caveat (microcopy)

---

## Auth & Roles

- PIN 4 dígitos. Roles: super_admin · owner · jefe_sala · camarero · cocina · running
- ROL "admin" fue renombrado a jefe_sala — no usar "admin" en código nuevo
- PINs DEMO: super=9999 · owner=1369 · jefe=2566 · camarero=7672 · cocina=3297 · running=5310
- Rutas: /super · /owner · /jefe · /edge · /kds · /running
- RPC: validate_pin_with_rate_limit · rotate_kds_token
- Seguridad: auth_attempts · sesiones_activas · security_log

---

## Patrones críticos de código

### ⚠️ REGLA #1 — API routes: SIEMPRE createServerClient()
```typescript
// ✅ CORRECTO
import { createServerClient } from '@/lib/supabase'
export async function GET(req: Request) {
  const supabase = createServerClient()
}
// ❌ NUNCA — causa 401 o inconsistencia
import { createClient } from '@supabase/supabase-js'
```

### ⚠️ REGLA #2 — Dynamic routes Next.js 16
```typescript
// ✅ CORRECTO
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
```

### ⚠️ REGLA #3 — comandas.estado
```
nueva · en_curso · lista · cerrada   ← únicos valores válidos
NUNCA: pendiente · abierta
```

### ⚠️ REGLA #4 — comanda_items campos obligatorios
```typescript
{ comanda_id, producto_id,
  nombre: producto.nombre,       // OBLIGATORIO — desnormalizado
  restaurante_id: rid,           // OBLIGATORIO — RLS
  cantidad, precio_unitario }
```

### ⚠️ REGLA #5 — Multi-tenant absoluto
Siempre `.eq('restaurante_id', rid)` en todas las queries. Sin excepción.

---

## Tablas BD principales

```
restaurantes, camareros, mesas, comandas, comanda_items, productos,
secciones_cocina, impresoras(+secciones_ids UUID[]), transcripciones,
turnos, productos_86, zonas, facturas_verifactu, bridge_tokens,
bridge_devices, bridge_commands, push_subscriptions, alerta_reglas,
alerta_log, alerta_condiciones, pagos, cobro_config, movimientos_caja,
comanda_audit_log, auth_attempts, sesiones_activas, security_log,
perfiles, contract_acceptances, leads, ia_training_log, system_errors,
cuentas, restaurante_contactos, sugerencias, reglas_envio,
mensajes_turno, qr_sesiones_cliente,
soporte_tickets, soporte_mensajes    ← NUEVAS mayo 2026
```

Constraints BD:
- mesas.estado: libre|activa|marchar|aviso|urgente|cuenta
- comandas.estado: nueva|en_curso|lista|cerrada
- comanda_items: nombre + restaurante_id obligatorios
- impresoras.secciones_ids: UUID[] (columna añadida mayo 2026)

---

## Edge Functions activas (Deno) — 33 total

```
Auth/SaaS:  auth-register v26, auth-pin-validate v17, auth-verify-sms v15,
            stripe-checkout v19, webhook-stripe v20, webhook-monei v17, contact-lead v4
Core TPV:   brain-parse v17, brain v15, ear-transcribe v16, cobro-stripe v16,
            cobro-monei v16, courier-route v16, bridge-agent v12, verifactu-sign v17,
            enviar-verifactu v15, owner-panel v18, push-send v12, vox-confirm v15,
            kds-token-validate v15, menu-stockout v15, recuperar-pin v8,
            error-ingest v9, ia-training-dashboard v16, test-runner v13
QR:         qr-session v1, qr-order v4, qr-cobro v1, qr-connect v1,
            qr-split v1, qr-call-waiter v2
Cron:       alerta-ritmo-cron v17 (job #6, cada 2min)
            infra-monitor-cron v1  (job #16, cada 5min) ← NUEVA mayo 2026
```

### Patrón EF (Deno)
```typescript
// supabase/functions/mi-funcion/index.ts · v1
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
```

---

## pg_cron jobs activos

| Job | Nombre | Schedule | Qué hace |
|---|---|---|---|
| #6 | alerta-ritmo | */2 * * * * | Alertas de ritmo de servicio |
| #16 | infra-monitor | */5 * * * * | Bridge offline, errores críticos, turno inactivo |

---

## Pricing SaaS (mayo 2026)

Por usuario activo (camarero + cocina + jefe_sala; owner no cuenta):
- Base: 59€/mes (1 usuario incluido)
- Usuarios 2-6: +20€/usuario/mes
- Usuarios 7+: +15€/usuario/mes
- QR add-on: +12€/mesa/mes
- Trial: 14 días sin tarjeta · Descuento anual: 18%

Stripe LIVE: base=price_1TUKYVK5xixGkeRIEGTKlZFp · e20=price_1TUKYVK5xixGkeRIL33AA4Ef · e15=price_1TUKYVK5xixGkeRIMbs7zJ2j
Stripe TEST: base=price_1TUPaTK5xixGkeRIEU1x3sqG (STRIPE_MODE=test activo)

---

## Módulos completados (mayo 2026)

- ✅ Core TPV: voz PTT, EAR Groq Whisper, BRAIN Claude, COURIER, VOX TTS, KDS
- ✅ Cobro: Stripe Terminal + Bizum MONEI
- ✅ VeriFactu: hash SHA-256 encadenado, QR AEAT
- ✅ Hardware Bridge: bridge-local.js, polling TCP, ESC/POS, CloudPRNT
- ✅ QR: pedido + cobro + split desde mesa (6 EFs)
- ✅ Supervisor de tiempos: 6 condiciones, /owner y /jefe
- ✅ Chat entre roles: mensajes_turno, /edge + /kds + /jefe + /running
- ✅ SaaS onboarding: landing, contrato v1.0, Stripe checkout
- ✅ Android APK v10
- ✅ DiagnosticoTab: /owner → Auditoría → Sistema (estado real, auto-refresh 60s)
- ✅ SoporteTab: /owner → Auditoría → Soporte (chat IA con contexto real, auto-escalado)
- ✅ SoporteSuperTab: /super → Soporte (Alberto ve y responde todos los tickets)
- ✅ infra-monitor-cron: alertas proactivas bridge/errores/turno inactivo
- ✅ Circuit breaker offline: useOfflineQueue, banner en /edge, auto-sync al reconectar
- ✅ Página estado pública: www.iarest.es/estado (uptime 30d, 5 servicios, sin login)
- ✅ Auditoría seguridad: 0 createClient directos en API routes, multi-tenant 100%

---

## Pendientes prioritarios

1. STRIPE_MODE=live (primer cliente real)
2. STRIPE_CLIENT_ID + WEBHOOK_SECRET_QR en Vercel
3. Cashdro HTTP (módulo #5)
4. API pública (#12), Forecaster (#14), TheFork

---

## Convenciones

1. Archivos siempre completos — nunca diffs
2. SQL con RLS — toda tabla nueva necesita políticas
3. `{ error: string, code?: string }` en respuestas de error
4. Nombres en español para tablas/columnas
5. Multi-tenant: siempre filtrar por restaurante_id
6. Versioning EFs: incrementar comentario al desplegar
7. comandas.estado: solo nueva/en_curso/lista/cerrada

---

## Skills adicionales disponibles

- ia-rest-verifactu — módulo VeriFactu
- ia-rest-hardware-bridge — bridge impresoras, ESC/POS, Cashdro
- ia-rest-supabase-patterns — patrones RLS, RPC, Realtime, errores
- ia-rest-qr — módulo QR completo
