// Manejador del cron `/api/cron/purgar-fotos`: autenticación por Bearer CRON_SECRET (comparación en tiempo constante) y purga.
// La ruta (`app/api/cron/purgar-fotos/route.ts`) solo aporta el secreto (`requireSecret`) y las dependencias reales.
import { secretoCoincide } from '@central/core-identity'
import { purgarFotos, type DepsPurga } from './purga-fotos.ts'

export type DepsCron = Omit<DepsPurga, 'almacen' | 'hoy'> & {
  /** Secreto esperado (ya resuelto con `requireSecret`). Ausente o vacío ⇒ 401 siempre. */
  secreto: string | null
  almacen(): DepsPurga['almacen']
  ahora(): Date
}

const json = (cuerpo: unknown, status: number) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function manejarCronPurga(req: { headers: { get(n: string): string | null } }, d: DepsCron): Promise<Response> {
  const cab = req.headers.get('authorization') ?? ''
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : ''
  if (!secretoCoincide(token, d.secreto)) return json({ error: 'No autorizado' }, 401)
  let almacen
  try { almacen = d.almacen() } catch (e) {
    console.error('[purga-fotos] almacén no disponible', e)
    return json({ error: 'Almacén no configurado' }, 500)
  }
  const r = await purgarFotos({ talleres: d.talleres, conTaller: d.conTaller, almacen, hoy: d.ahora() })
  // Sin datos de clientes: solo contadores.
  return json({ ok: r.talleresConError === 0, talleres: r.talleres, borradas: r.borradas, protegidas: r.protegidas, fallidas: r.fallidas, talleresConError: r.talleresConError }, 200)
}
