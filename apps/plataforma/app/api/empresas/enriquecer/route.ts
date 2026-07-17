import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { accesoEmpresas } from '@/lib/empresas-acceso'
import { enriquecerEmpresa, getGastoMesEur } from '@/lib/empresas-enriquecer'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Estado del presupuesto (para pintar el gasto del mes en la UI). Lo puede ver el invitado.
export async function GET() {
  if (!(await accesoEmpresas())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const gastoMes = await getGastoMesEur()
  const tope = Number(process.env.EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR ?? '50')
  const configurado = Boolean(process.env.EINFORMA_CLIENT_ID && process.env.EINFORMA_CLIENT_SECRET)
  return NextResponse.json({ gastoMes, tope, configurado })
}

// El enriquecimiento GASTA dinero → SOLO el titular con sesión (Pablo/invitado no puede disparar gasto).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Solo el titular puede enriquecer' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { empresaNorm?: unknown; cif?: unknown }
  const empresaNorm = typeof body.empresaNorm === 'string' ? body.empresaNorm : ''
  if (!empresaNorm.trim()) return NextResponse.json({ error: 'empresaNorm requerido' }, { status: 400 })
  const cif = typeof body.cif === 'string' && body.cif.trim() ? body.cif.trim() : null
  try {
    const r = await enriquecerEmpresa(empresaNorm, cif)
    return NextResponse.json(r, { status: r.ok ? 200 : 200 })
  } catch (e) {
    console.error('[empresas enriquecer]', e)
    return NextResponse.json({ ok: false, error: 'proveedor', mensaje: 'Error al enriquecer.' }, { status: 200 })
  }
}
