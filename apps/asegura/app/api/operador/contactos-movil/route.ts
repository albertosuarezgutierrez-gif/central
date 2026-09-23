import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { contactosMovil } from '@/lib/contactos-movil'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/contactos-movil — clientes en vigor y leads de Vencimientos
 * con teléfono y correo, para el .vcf del móvil que arma plataforma. Solo
 * lectura; ni DNI, ni dirección, ni pólizas.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    return NextResponse.json({ estado: 'ok', ...(await contactosMovil(correduria.id)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/contactos-movil', e) }, { status: 500 })
  }
}
