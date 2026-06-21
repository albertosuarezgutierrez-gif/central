import { createClient } from '@supabase/supabase-js'

// Fallback vacío para build time (Next.js evalúa el módulo sin env vars)
// En runtime (Vercel) las vars siempre están disponibles
const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Schema de BD. Por defecto 'public' (BD propia histórica). En la BD unificada de la
// casa de marcas, ia-rest vive en el schema 'iarest' → fijar NEXT_PUBLIC_SUPABASE_SCHEMA=iarest
// junto con las URL/keys del proyecto compartido (corte atómico y reversible por envs).
export const SB_SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? 'public'
// El cast a 'public' es solo de TIPOS (los SupabaseClient del código van tipados con ese
// literal); en runtime el schema real es SB_SCHEMA ('iarest' en la BD unificada).
export const SB_OPTS = { db: { schema: SB_SCHEMA as 'public' } }

export const supabase = createClient(
  supabaseUrl     || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    ...SB_OPTS,
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  }
)

// Server-side client with service role (for API routes)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder',
    SB_OPTS
  )
}
