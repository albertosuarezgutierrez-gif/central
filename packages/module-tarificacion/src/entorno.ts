// Qué entorno recibe la máquina del worker (05/10/2026).
//
// 🚨 El worker NUNCA tiene la cartera ni el canal que gasta dinero: ni `DATABASE_URL`/`DIRECT_URL`
//    (habla con asegura SOLO por HTTP, con su Bearer), ni ningún `CODEOSCOPIC_*`. Dos barreras:
//    1. El orquestador construye el env de la máquina desde una LISTA BLANCA (`envDeMaquina`).
//    2. El worker se niega a arrancar si encuentra algo prohibido (`variablesProhibidas`), por si
//       alguien pone un fly secret de más a mano.

const PROHIBIDAS: readonly RegExp[] = [
  /^CODEOSCOPIC_/i,
  /^DATABASE_URL$/i,
  /^DIRECT_URL$/i,
  /^ASEGURA_DATABASE_URL$/i,
  /^ASEGURA_OPERADOR_SECRET$/i,
  /^PII_(ENCRYPTION|LOOKUP)_KEY$/i,
  /^POSTGRES/i,
  /^SUPABASE/i,
]

/** Variables del entorno del worker que NO deberían estar ahí. Vacío = arranque permitido. */
export function variablesProhibidas(env: Record<string, string | undefined>): string[] {
  return Object.keys(env)
    .filter((k) => env[k] !== undefined && env[k] !== '')
    .filter((k) => PROHIBIDAS.some((re) => re.test(k)))
    .sort()
}

/** Las ÚNICAS variables que el orquestador pone en la config de la máquina (no son secretos). */
export const ENV_MAQUINA_PERMITIDAS = ['JOB_ID', 'TARIFICADOR_API_URL'] as const

/**
 * El `env` de la máquina efímera. Solo el id del trabajo y a dónde preguntar. El Bearer del worker
 * y las credenciales de portal son fly secrets de la app `asegura-tarificador`: no viajan en la
 * config de la máquina (que se lee por la API de Fly).
 */
export function envDeMaquina(entrada: { jobId: string; apiUrl: string }): Record<(typeof ENV_MAQUINA_PERMITIDAS)[number], string> {
  const jobId = String(entrada.jobId ?? '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('envDeMaquina: jobId no es un uuid')
  }
  let url: URL
  try {
    url = new URL(String(entrada.apiUrl ?? ''))
  } catch {
    throw new Error('envDeMaquina: apiUrl no es una URL')
  }
  if (url.protocol !== 'https:') throw new Error('envDeMaquina: apiUrl tiene que ser https')
  if (url.username || url.password) throw new Error('envDeMaquina: apiUrl no puede llevar credenciales')
  return { JOB_ID: jobId, TARIFICADOR_API_URL: url.origin }
}

/** Nombre de las variables de credencial de un portal: `CRED_ALLIANZ_EPAC_USER` / `_PASS`. */
export function nombresCredencial(clave: string): { usuario: string; contrasena: string } {
  const c = String(clave).trim().toUpperCase()
  if (!/^[A-Z0-9]+(_[A-Z0-9]+)*$/.test(c)) throw new Error(`nombresCredencial: clave inválida «${clave}»`)
  return { usuario: `CRED_${c}_USER`, contrasena: `CRED_${c}_PASS` }
}
