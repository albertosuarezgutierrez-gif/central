import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * La señal de la carta de no renovación (20/09/2026).
 *
 * La carta no se envía desde aquí —sigue saliendo por el canal que elija la
 * persona (portapapeles, impresora, su correo)—, pero el portal SÍ apunta que
 * la redactó y, si lo dice, que la envió. Esa marca la lee el corredor en la
 * lista de leads: alguien que ha escrito a su compañía para dejarla es la
 * oportunidad más caliente que existe, y hasta hoy no se veía.
 *
 * Tres acciones, y ninguna borra la primera marca:
 *   · `generada`: copió, imprimió o abrió el correo. Solo se sella la PRIMERA
 *     vez (`carta_generada_en` no se pisa): interesa cuándo empezó, no cuántos
 *     clics dio.
 *   · `enviada`: marcó «ya la he enviado». Se sella la fecha de hoy.
 *   · `enviada_deshacer`: la desmarca. Vuelve a NULL — la persona puede haber
 *     pulsado sin querer, y una marca falsa manda al corredor a llamar por una
 *     baja que no existe.
 *
 * 🚨 `updateMany` filtrando por `identidadId` ADEMÁS de por `id`, igual que el
 * PATCH de la póliza: el aislamiento lo da este código, no RLS. `count === 0`
 * es 404 tanto si no existe como si es de otro: distinguirlos confirmaría al
 * que prueba uuids cuáles existen.
 */
const ACCIONES = ['generada', 'enviada', 'enviada_deshacer'] as const
type Accion = (typeof ACCIONES)[number]

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  // La vista de corredor es de SOLO LECTURA: Alberto mirando la bóveda de un
  // cliente no puede marcar por él que ha enviado una carta.
  if (identidad.corredor) return NextResponse.json({ error: 'solo_lectura' }, { status: 403 })

  const { id } = await ctx.params

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const accion = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { accion?: unknown }).accion : undefined
  if (typeof accion !== 'string' || !(ACCIONES as readonly string[]).includes(accion)) {
    return NextResponse.json({ error: 'accion_invalida' }, { status: 400 })
  }

  const ahora = new Date()
  const where = { id, identidadId: identidad.id }
  let count: number
  if ((accion as Accion) === 'generada') {
    // Solo la primera vez: el filtro `cartaGeneradaEn: null` hace que un
    // segundo clic no reescriba la fecha. Pero entonces `count === 0` también
    // es «ya estaba sellada», así que se distingue con una lectura filtrada.
    const r = await prisma.portalPolizaDeclarada.updateMany({
      where: { ...where, cartaGeneradaEn: null },
      data: { cartaGeneradaEn: ahora },
    })
    count = r.count
    if (count === 0) {
      const existe = await prisma.portalPolizaDeclarada.findFirst({ where, select: { id: true } })
      if (!existe) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
    }
  } else {
    const r = await prisma.portalPolizaDeclarada.updateMany({
      where,
      data: {
        cartaEnviadaEn: accion === 'enviada' ? ahora : null,
        // Marcar «enviada» sin haber pasado por «copiar» (p. ej. la escribió a
        // mano) también cuenta como generada: la señal fuerte implica la débil.
        ...(accion === 'enviada' ? { cartaGeneradaEn: { set: ahora } } : {}),
      },
    })
    count = r.count
    if (count === 0) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
