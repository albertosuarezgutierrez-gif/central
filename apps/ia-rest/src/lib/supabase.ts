import { createClient } from '@supabase/supabase-js'

// Fallback vacío para build time (Next.js evalúa el módulo sin env vars)
// En runtime (Vercel) las vars siempre están disponibles
const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(
  supabaseUrl     || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  }
)

// Server-side client with service role (for API routes)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder'
  )
}
