import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente de SOLO LECTURA contra la BD separada de ia-rest (`efncqyvhniaxsirhdxaa`).
// Usa service_role: vive solo en el servidor, nunca se expone al cliente.
// (HITO 3) plataforma lo usa para leer la vista `v_resumen_financiero_anual` y
// consolidar el financiero de ia-rest en el dashboard. Misma idea de singleton que lib/db.ts.
const globalForIaRest = globalThis as unknown as { iaRestDb?: SupabaseClient }

export function iaRestDb(): SupabaseClient {
  if (globalForIaRest.iaRestDb) return globalForIaRest.iaRestDb
  const url = process.env.IAREST_SUPABASE_URL
  const key = process.env.IAREST_SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('IAREST_SUPABASE_URL / IAREST_SUPABASE_SERVICE_KEY no configuradas')
  }
  const client = createClient(url, key, { auth: { persistSession: false } })
  if (process.env.NODE_ENV !== 'production') globalForIaRest.iaRestDb = client
  return client
}
