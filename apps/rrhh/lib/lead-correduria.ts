// Envío del lead «Quiero que Grupo ASegura me lo revise» a plataforma (/correduria). Reutiliza el puerto de leads EXISTENTE:
// `POST /api/publico/correduria/lead` de apps/plataforma, el mismo que usa grupoasegura.es (apps/asegura-web/app/api/lead).
// Ese puerto es público (sin secreto: lo frenan su rate limit 6/h por IP y su validación `revisarLeadWeb`), registra la ficha
// en la cartera por el puerto de asegura y avisa A ALBERTO por Telegram. NO envía nada al responsable ni a terceros, y aquí
// tampoco: ningún correo, ningún mensaje (regla de comunicaciones salientes).
//
// Se reenvía la IP del responsable (`x-forwarded-for`), como hace asegura-web: si no, el tope por IP sería el de ESTE servidor,
// común a todas las empresas, y el séptimo lead legítimo de la hora se rechazaría.
//
// `PLATAFORMA_URL`: opcional, con defecto el origen REAL de plataforma (misma decisión y mismo origen que asegura-web y
// housesevillana; no es un secreto). Sirve para apuntar a una preview.
import { interpretarRespuestaLead, type ResultadoLead } from './seguro-convenio'

export const PLATAFORMA_URL_DEFECTO = 'https://plataforma-ten-flame.vercel.app'

export function urlLeadPlataforma(env: string | undefined = process.env.PLATAFORMA_URL): string {
  return `${(env || PLATAFORMA_URL_DEFECTO).replace(/\/+$/, '')}/api/publico/correduria/lead`
}

/** Nunca lanza. Ningún dato personal pasa por `console.*`. */
export async function enviarLeadCorreduria(
  cuerpo: Record<string, unknown>,
  ip: string | null,
  f: typeof fetch = fetch,
  url: string = urlLeadPlataforma(),
): Promise<ResultadoLead> {
  try {
    const res = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(10_000),
    })
    const json = await res.json().catch(() => null)
    return interpretarRespuestaLead(res.status, json)
  } catch {
    console.error('[lead-correduria] el envío a plataforma no llegó a completarse')
    return interpretarRespuestaLead(0, null)
  }
}
