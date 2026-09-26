// Rehacer a mano lo que asegura hace solo tras emitir (26/09/2026): abrir la baja de la póliza
// sustituida y mandar al cliente el correo de su nuevo seguro — o mandártelo a ti como PRUEBA.
// Cliente del puerto `POST /api/operador/emision/aviso`; la respuesta se lee con `leerTrasEmision`,
// así que un valor que no se reconoce se dice «no se sabe», nunca «enviado».
import { cabecerasPuerto } from './puerto-actor.ts'
import { leerTrasEmision, type TrasEmision } from './retarificar-asegura.ts'

export type AvisoEmision =
  | { estado: 'ok'; prueba: boolean; tras: TrasEmision | null }
  | { estado: 'error'; motivo: string }

export async function avisarEmision(polizaId: string, prueba: boolean): Promise<AvisoEmision> {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return { estado: 'error', motivo: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  const url = `${(process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')}/api/operador/emision/aviso`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...(await cabecerasPuerto(secreto)), 'content-type': 'application/json' },
      body: JSON.stringify({ polizaId, prueba }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 404 && !j) return { estado: 'error', motivo: 'asegura aún no tiene este aviso desplegado' }
    if (!res.ok || j?.estado !== 'ok') {
      const motivo = typeof j?.motivo === 'string' ? j.motivo : typeof j?.estado === 'string' ? j.estado : `HTTP ${res.status}`
      return { estado: 'error', motivo }
    }
    return { estado: 'ok', prueba: j.prueba === true, tras: leerTrasEmision(j) }
  } catch (e) {
    // Un corte de red puede haber dejado salir el correo: no se afirma nada.
    return { estado: 'error', motivo: `no se sabe si ha salido (${e instanceof Error ? e.message : 'red'}); mira la ficha antes de repetir` }
  }
}
