// Lector del panel de conversión de Patrimonio: llamada al puerto de asegura (solo lectura) + agregación pura.
// Intérprete y contrato: `patrimonio-conversion.ts`. `null`/error = no se pudo leer ≠ «no hay titulares».
import { cabecerasPuerto } from '../puerto-actor.ts'
import { agregarConversion, inicioMesMadrid, interpretarConversion, type LecturaConversion } from './patrimonio-conversion.ts'

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function leerPatrimonioConversion(ahora: Date = new Date()): Promise<LecturaConversion> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const q = new URLSearchParams({ desdeMes: inicioMesMadrid(ahora).toISOString() })
    const res = await fetch(`${urlAsegura()}/api/operador/patrimonio-conversion?${q}`, {
      headers: { ...(await cabecerasPuerto(secret)) }, cache: 'no-store', signal: AbortSignal.timeout(20_000),
    })
    const l = interpretarConversion(res.status, await res.json().catch(() => null))
    if (l.estado !== 'ok') return l
    return { estado: 'ok', ...agregarConversion(l.titulares, ahora) }
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
