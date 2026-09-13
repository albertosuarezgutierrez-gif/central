import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/companias — el directorio de contacto por compañía
 * (`seguros.companias_dgs`), que ya mantiene la skill `agente-correduria`.
 * No es cartera de cliente: no hace falta `correduriaId` ni tenant-ámbito,
 * es una tabla de REFERENCIA compartida por toda la correduría.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const companias = await prismaAsegura().companiaDgs.findMany({
      where: { activa: true },
      orderBy: { nombreComun: 'asc' },
    })
    return NextResponse.json({ estado: 'ok', companias })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias', e) })
  }
}
