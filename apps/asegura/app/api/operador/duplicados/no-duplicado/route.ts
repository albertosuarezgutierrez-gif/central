import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR } from '@/lib/actor'
import { leerPeticionNoDuplicado } from '@/lib/no-duplicado-peticion'
import { marcarNoDuplicado } from '@/lib/no-duplicados'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/operador/duplicados/no-duplicado `{ ids: uuid[], motivo }` — «No es
 * duplicado» (04/10/2026): marca TODOS los pares del grupo en
 * `seguros.poliza_no_duplicado` (mig 0108 del repo asegura) para que dejen de
 * salir en la pantalla «Duplicadas» y en la señal 🔁 del vigía.
 *   · 200 `{ estado: 'ok', pares, nuevos }` (idempotente: un par ya marcado no se pisa).
 *   · 400 ids/motivo no válidos, o las pólizas no forman un grupo con el criterio de la pantalla.
 *   · 403 sin persona en `x-actor` (decidido_por = la sesión, nunca el cuerpo).
 *   · 503 `migracion_pendiente` si la tabla no existe: NUNCA un éxito falso.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const cuerpo = await req.json().catch(() => null)
    const p = leerPeticionNoDuplicado(cuerpo, req.headers.get(CABECERA_ACTOR))
    if (!p.ok) return NextResponse.json({ estado: 'error', motivo: p.motivo }, { status: p.status })
    const correduria = await correduriaUnica().catch(() => null)
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await marcarNoDuplicado(correduria.id, p.ids, p.motivo, p.decididoPor)
    const { status, ...json } = r
    return NextResponse.json(json, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/duplicados/no-duplicado', e) }, { status: 500 })
  }
})
