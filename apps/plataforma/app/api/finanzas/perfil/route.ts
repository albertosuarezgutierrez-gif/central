import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getResumenFinanciero } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

// Lee la situación fiscal/familiar de la cuenta (perfil + hijos).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [perfil, descendientes] = await Promise.all([
    prisma.fiscalPerfil.findUnique({ where: { cuentaId: session.id } }),
    prisma.fiscalDescendiente.findMany({ where: { cuentaId: session.id }, orderBy: { fechaNacimiento: 'asc' } }),
  ])
  return NextResponse.json({ perfil, descendientes })
}

type DescIn = { nombre?: string; fechaNacimiento?: string; gradoDiscapacidad?: number; computoCompleto?: boolean }

// Guarda el perfil (upsert) y REEMPLAZA la lista de hijos. Todo scoped por cuenta_id.
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const p = body.perfil ?? {}
  const perfilData = {
    comunidadAutonoma: String(p.comunidadAutonoma ?? 'andalucia'),
    declaracionConjunta: Boolean(p.declaracionConjunta ?? true),
    familiaNumerosa: p.familiaNumerosa === 'general' || p.familiaNumerosa === 'especial' ? p.familiaNumerosa : null,
    conyugeTrabaja: Boolean(p.conyugeTrabaja ?? false),
    gastoGuarderiaAnual: Number(p.gastoGuarderiaAnual ?? 0) || 0,
    aportacionPlanPensiones: Number(p.aportacionPlanPensiones ?? 0) || 0,
    gradoDiscapacidadTitular: Math.trunc(Number(p.gradoDiscapacidadTitular ?? 0)) || 0,
    gradoDiscapacidadConyuge: Math.trunc(Number(p.gradoDiscapacidadConyuge ?? 0)) || 0,
    ascendientesACargo: Math.trunc(Number(p.ascendientesACargo ?? 0)) || 0,
    ascendientesMayores75: Math.trunc(Number(p.ascendientesMayores75 ?? 0)) || 0,
    donativosAnual: Number(p.donativosAnual ?? 0) || 0,
  }

  const hijos: DescIn[] = Array.isArray(body.descendientes) ? body.descendientes : []
  const hijosData = hijos
    .filter(h => h.nombre && h.fechaNacimiento)
    .map(h => ({
      cuentaId: session.id,
      nombre: String(h.nombre).slice(0, 120),
      fechaNacimiento: new Date(h.fechaNacimiento as string),
      gradoDiscapacidad: Math.trunc(Number(h.gradoDiscapacidad ?? 0)) || 0,
      computoCompleto: h.computoCompleto !== false,
    }))

  await prisma.$transaction([
    prisma.fiscalPerfil.upsert({
      where: { cuentaId: session.id },
      create: { cuentaId: session.id, ...perfilData },
      update: { ...perfilData, updatedAt: new Date() },
    }),
    prisma.fiscalDescendiente.deleteMany({ where: { cuentaId: session.id } }),
    ...(hijosData.length ? [prisma.fiscalDescendiente.createMany({ data: hijosData })] : []),
  ])

  // Snapshot del histórico interanual del año en curso (cuánto se ahorra).
  try {
    const year = new Date().getFullYear()
    const resumen = await getResumenFinanciero(session.id, year, 0)
    const r = resumen.deducciones.resultado
    const ahorro = Object.fromEntries(resumen.deducciones.resultado.deducciones.map(d => [d.clave, d.importe]))
    await prisma.$executeRaw`
      INSERT INTO fiscal_historico (cuenta_id, anio, cuota_liquida, deducciones_total, ahorro_por_deduccion, resultado, actualizado_at)
      VALUES (${session.id}::uuid, ${year}, ${r.cuotaLiquida}, ${r.totalDeducciones}, ${JSON.stringify(ahorro)}::jsonb, ${r.resultado}, now())
      ON CONFLICT (cuenta_id, anio) DO UPDATE SET
        cuota_liquida = EXCLUDED.cuota_liquida,
        deducciones_total = EXCLUDED.deducciones_total,
        ahorro_por_deduccion = EXCLUDED.ahorro_por_deduccion,
        resultado = EXCLUDED.resultado,
        actualizado_at = now()`
  } catch (e) {
    console.error('[finanzas/perfil] histórico', e)
  }

  return NextResponse.json({ ok: true })
}
