// Manejador del cron `/api/cron/enviar-hechos`: Bearer CRON_SECRET (comparación en tiempo constante) y envío del outbox a contabilidad.
// La ruta solo aporta el secreto (`requireSecret`) y las dependencias reales.
import { secretoCoincide } from '@central/core-identity'
import { enviarHechos, type DepsEnvio } from './enviar-hechos.ts'

export type DepsCronHechos = DepsEnvio & { secreto: string | null }

const json = (cuerpo: unknown, status: number) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function manejarCronHechos(req: { headers: { get(n: string): string | null } }, d: DepsCronHechos): Promise<Response> {
  const cab = req.headers.get('authorization') ?? ''
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : ''
  if (!secretoCoincide(token, d.secreto)) return json({ error: 'No autorizado' }, 401)
  const r = await enviarHechos(d)
  // Solo contadores: nada de hechos ni de clientes en la respuesta.
  return json({ ok: r.talleresConError === 0, ...r }, 200)
}
