// Lo común de las rutas de consultas a compañías (15/10/2026): la correduría se resuelve como en el resto de
// `/api/operador/*` (`correduriaUnica()`); `correduriaId` del cuerpo/query es OPCIONAL y, si viene y no casa, 403.
import { NextResponse } from 'next/server'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import type { Resultado } from '@/lib/consulta-compania-flujo'

export async function correduriaDeLaPeticion(correduriaId: unknown): Promise<{ ok: true; id: string } | { ok: false; res: NextResponse }> {
  if (!aseguraConfigurada()) return { ok: false, res: NextResponse.json({ estado: 'sin_configurar' }, { status: 503 }) }
  const c = await correduriaUnica()
  if (!c) return { ok: false, res: NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 }) }
  if (correduriaId !== undefined && correduriaId !== null && correduriaId !== '' && correduriaId !== c.id) {
    return { ok: false, res: NextResponse.json({ estado: 'error', motivo: 'correduriaId no es el de esta correduría' }, { status: 403 }) }
  }
  return { ok: true, id: c.id }
}

/** Quién firma en el historial: el `x-actor` de plataforma; sin él, `plataforma`. */
export function actorDe(req: Request): string {
  const a = leerActor(req.headers.get(CABECERA_ACTOR))
  return a.tipo === 'desconocido' ? 'plataforma' : `${a.tipo}:${a.id}`
}

export function respuesta<T>(r: Resultado<T>, ok: (v: T) => Record<string, unknown>): NextResponse {
  if (r.ok) return NextResponse.json({ estado: 'ok', ...ok(r.valor) })
  return NextResponse.json({ estado: r.estado, motivo: r.motivo, ...(r.detalle === undefined ? {} : { detalle: r.detalle }) }, { status: r.status })
}
