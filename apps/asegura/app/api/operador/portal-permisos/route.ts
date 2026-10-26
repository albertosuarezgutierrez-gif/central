import { NextResponse } from 'next/server'

import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { operadorAutorizado } from '@/lib/operador'
import { componerPermisos, DIAS_RECIENTES, fichasImplicadas } from '@/lib/portal-permisos-operador'

export const dynamic = 'force-dynamic'

const TOPE = 500

/**
 * GET /api/operador/portal-permisos — los permisos del portal que esperan a alguien (autorizaciones sin aceptar,
 * peticiones de acceso sin contestar) y los aceptados/revocados en los últimos 7 días. Lo lee la campana de
 * plataforma (`/api/correduria/avisos`, tipo `permisos_portal`). SOLO LECTURA: este fichero no exporta escritura.
 *
 *   { estado:'ok', pendientes, recientes, movimientos:[{ id, evento, alcance, fecha, deClienteId, de, aClienteId, a,
 *     aInvitado, revocadoPor }] }
 *
 * 🔒 Aislamiento: TODA lectura filtra por la correduría del puerto (`correduria_id` en las dos tablas y en `clientes`);
 * los nombres solo se leen de fichas de esa correduría. Sin NIF, IBAN ni dirección (solo nombre y apellidos).
 * `error` ≠ lista vacía: si algo falla, la campana dice «no se ha podido comprobar».
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const db = prismaAsegura()
    const ahora = new Date()
    const desde = new Date(ahora.getTime() - DIAS_RECIENTES * 86_400_000)

    const [auts, pets] = await Promise.all([
      db.portalAutorizacion.findMany({
        where: {
          correduriaId: correduria.id,
          OR: [
            { aceptadoEn: null, revocadoEn: null },
            { aceptadoEn: { gte: desde } },
            { revocadoEn: { gte: desde } },
          ],
        },
        select: {
          id: true, otorganteClienteId: true, autorizadoClienteId: true, autorizadoIdentidadId: true, alcance: true,
          otorgadoEn: true, aceptadoEn: true, caducaEn: true, revocadoEn: true, revocadoPor: true,
        },
        orderBy: { otorgadoEn: 'asc' },
        take: TOPE,
      }),
      db.portalPeticionAcceso.findMany({
        where: { correduriaId: correduria.id, concedidaEn: null, rechazadaEn: null, retiradaEn: null, caducaEn: { gt: ahora } },
        select: {
          id: true, solicitanteClienteId: true, destinatarioClienteId: true, alcance: true, creadaEn: true, caducaEn: true,
          concedidaEn: true, rechazadaEn: true, retiradaEn: true,
        },
        orderBy: { creadaEn: 'asc' },
        take: TOPE,
      }),
    ])

    const ids = fichasImplicadas(auts, pets)
    const fichas = ids.length === 0 ? [] : await db.cliente.findMany({
      where: { id: { in: ids }, correduriaId: correduria.id },
      select: { id: true, nombre: true, apellidos: true },
    })
    const nombres = new Map(fichas.map((f) => [f.id, [f.nombre, f.apellidos].filter(Boolean).join(' ').trim() || 'Ficha sin nombre']))

    return NextResponse.json(
      { estado: 'ok', truncado: auts.length >= TOPE || pets.length >= TOPE, ...componerPermisos(auts, pets, nombres, ahora) },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/portal-permisos', e) }, { status: 500 })
  }
}
