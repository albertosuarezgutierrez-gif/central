// Cliente HTTP del worker hacia apps/asegura. El ÚNICO canal del worker con la casa: sin BD.

import type { OfertaNormalizada, TipoError } from '@central/module-tarificacion'

export type Config = { jobId: string; apiUrl: string; secreto: string }

export function leerConfig(env: Record<string, string | undefined>): Config {
  const jobId = (env.JOB_ID ?? '').trim()
  const apiUrl = (env.TARIFICADOR_API_URL ?? '').trim()
  const secreto = env.TARIFICADOR_WORKER_SECRET ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('JOB_ID ausente o no es un uuid')
  if (!/^https:\/\//.test(apiUrl)) throw new Error('TARIFICADOR_API_URL ausente o no es https')
  // Sin fallback: sin secreto no se habla con nadie.
  if (secreto.length < 16) throw new Error('TARIFICADOR_WORKER_SECRET ausente (fly secret)')
  return { jobId, apiUrl: apiUrl.replace(/\/+$/, ''), secreto }
}

/** `leaseHasta` (ISO): hasta cuándo asegura acepta el resultado; el runner no reintenta si no cabe. */
export type Trabajo = { id: string; compania: string; ramo: string; riesgo: unknown; leaseHasta?: string }

export async function pedirTrabajo(c: Config): Promise<{ estado: 'ok'; trabajo: Trabajo } | { estado: 'no_disponible'; status: number }> {
  const res = await fetch(`${c.apiUrl}/api/tarificador/trabajo/${encodeURIComponent(c.jobId)}`, {
    headers: { Authorization: `Bearer ${c.secreto}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return { estado: 'no_disponible', status: res.status }
  const j = (await res.json()) as { trabajo?: Trabajo }
  if (!j.trabajo) return { estado: 'no_disponible', status: res.status }
  return { estado: 'ok', trabajo: j.trabajo }
}

export type CuerpoResultado =
  | { trabajoId: string; resultado: 'ok'; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; base64: string }[] }
  | { trabajoId: string; resultado: 'error'; error: { tipo: TipoError; mensaje: string; url: string | null }; capturaBase64?: string; html?: string }

/** Hasta 3 intentos ante red caída o 5xx (un 409 = ya registrado o lease vencido: no se insiste). */
export async function enviarResultado(c: Config, cuerpo: CuerpoResultado): Promise<number> {
  let ultimo = 0
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${c.apiUrl}/api/tarificador/resultado`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(30_000),
      })
      ultimo = res.status
      if (res.status < 500) return res.status
    } catch {
      ultimo = 0
    }
    await new Promise((r) => setTimeout(r, 2_000 * (i + 1)))
  }
  return ultimo
}
