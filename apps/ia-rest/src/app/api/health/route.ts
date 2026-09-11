// GET /api/health — diagnóstico de env vars y conectividad
// Usado por el panel /super y para debugging de producción

import { NextResponse } from 'next/server'
import { hayClavePublicable } from '@/lib/claves-supabase'

export const runtime = 'nodejs'

export async function GET() {
  const checks = {
    groq_api_key:       !!process.env.GROQ_API_KEY,
    anthropic_api_key:  !!process.env.ANTHROPIC_API_KEY,
    supabase_url:       !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    // Vale la nueva (`sb_publishable_…`) o la `anon` legacy: durante la rotación conviven, y
    // después solo quedará la nueva. Mirar solo la legacy daría «falta la clave» con el
    // entorno YA migrado. Ver docs/ROTACION-SERVICE-ROLE.md
    supabase_anon:      hayClavePublicable(),
    // La cara `service_role` NO cambia de nombre de variable: la rotación sustituye su VALOR
    // en Vercel por el `sb_secret_…` (paso 2 del plan), así que este check sigue valiendo.
    supabase_service:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    vapid_public:       !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    vapid_private:      !!process.env.VAPID_PRIVATE_KEY,
    node_env:           process.env.NODE_ENV,
  }

  const missing = Object.entries(checks)
    .filter(([, v]) => v === false)
    .map(([k]) => k)

  const ok = missing.length === 0

  return NextResponse.json({
    ok,
    checks,
    missing,
    hint: missing.length > 0
      ? `Añadir en Vercel → Settings → Environment Variables: ${missing.join(', ')}`
      : 'Todas las env vars configuradas correctamente',
  }, { status: ok ? 200 : 207 })
}
