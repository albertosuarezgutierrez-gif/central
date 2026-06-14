// Conciliación banco ↔ apuntes registrados (Fase 3). Cruza cada movimiento bancario
// con los ingresos/gastos ya registrados en las verticales UNIFICADAS (BD compartida):
//   - sivra:  incomes / expenses           (scoped por "propertyId" = negocio.refExt)
//   - ialimp: v_contab_ingresos / v_contab_gastos (scoped por empresa_id = negocio.refExt)
// ia-rest NO entra: vive en otra BD (puerto HTTP, sin endpoint de apuntes todavía).
//
// Match conservador (evita falsos positivos): mismo signo (abono↔ingreso, cargo↔gasto),
// importe idéntico al céntimo y fecha dentro de ±TOL_DIAS. Uno a uno. Marca conciliado + factura_ref.

import { prisma } from './db'

const TOL_DIAS = 5

type Candidato = { ref: string; importe: number; fecha: string }  // importe>0 ingreso, <0 gasto

// Candidatos (ingresos + gastos) de un negocio sivra, por propertyId.
async function candidatosSivra(propertyId: string): Promise<Candidato[]> {
  const [ing, gas] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; total: unknown; fecha: Date | null }>>`
      SELECT id, amount AS total, date AS fecha FROM incomes
      WHERE "propertyId" = ${propertyId} AND date >= now() - interval '400 days'`,
    prisma.$queryRaw<Array<{ id: string; total: unknown; fecha: Date | null }>>`
      SELECT id, amount AS total, date AS fecha FROM expenses
      WHERE "propertyId" = ${propertyId} AND date >= now() - interval '400 days'`,
  ])
  return [
    ...ing.map(r => ({ ref: `sivra:income:${r.id}`, importe: Math.abs(Number(r.total)), fecha: fechaIso(r.fecha) })),
    ...gas.map(r => ({ ref: `sivra:expense:${r.id}`, importe: -Math.abs(Number(r.total)), fecha: fechaIso(r.fecha) })),
  ]
}

// Candidatos de un negocio ialimp, por empresa_id (vistas contables ya normalizadas).
async function candidatosIalimp(empresaId: string): Promise<Candidato[]> {
  const [ing, gas] = await Promise.all([
    prisma.$queryRaw<Array<{ ref: string; total: unknown; fecha: Date | null }>>`
      SELECT factura_id::text AS ref, total, fecha FROM v_contab_ingresos
      WHERE empresa_id = ${empresaId}::uuid AND fecha >= now() - interval '400 days'`,
    prisma.$queryRaw<Array<{ ref: string; total: unknown; fecha: Date | null }>>`
      SELECT ref_id::text AS ref, total, fecha FROM v_contab_gastos
      WHERE empresa_id = ${empresaId}::uuid AND fecha >= now() - interval '400 days'`,
  ])
  return [
    ...ing.map(r => ({ ref: `ialimp:ingreso:${r.ref}`, importe: Math.abs(Number(r.total)), fecha: fechaIso(r.fecha) })),
    ...gas.map(r => ({ ref: `ialimp:gasto:${r.ref}`, importe: -Math.abs(Number(r.total)), fecha: fechaIso(r.fecha) })),
  ]
}

function fechaIso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

function diffDias(a: string, b: string): number {
  if (!a || !b) return 9999
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000)
}

// Concilia los movimientos pendientes de una cuenta. Idempotente (solo toca conciliado=false).
export async function conciliarMovimientos(cuentaId: string): Promise<{ conciliados: number; pendientes: number }> {
  // Movimientos sin conciliar, con su sociedad (vía cuenta bancaria).
  const movs = await prisma.$queryRaw<Array<{ id: string; importe: unknown; fecha: Date | null; sociedad_id: string }>>`
    SELECT mb.id, mb.importe, mb.fecha_operacion AS fecha, cb.sociedad_id
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.conciliado = false
    ORDER BY mb.fecha_operacion DESC NULLS LAST
  `
  if (movs.length === 0) return { conciliados: 0, pendientes: 0 }

  // Negocios por sociedad (para saber qué apuntes mirar por cada movimiento).
  const sociedades = await prisma.sociedad.findMany({
    where: { cuentaId },
    include: { negocios: { select: { app: true, refExt: true } } },
  })

  // Candidatos por sociedad (una vez por sociedad, no por movimiento).
  const candidatosPorSociedad = new Map<string, Candidato[]>()
  for (const soc of sociedades) {
    const cands: Candidato[] = []
    for (const neg of soc.negocios) {
      if (!neg.refExt) continue
      if (neg.app === 'sivra') cands.push(...await candidatosSivra(neg.refExt))
      else if (neg.app === 'ialimp') cands.push(...await candidatosIalimp(neg.refExt))
    }
    candidatosPorSociedad.set(soc.id, cands)
  }

  let conciliados = 0
  const usados = new Set<string>()  // refs ya casados (uno a uno)

  for (const m of movs) {
    const importe = Number(m.importe)
    const fecha = fechaIso(m.fecha)
    const cands = candidatosPorSociedad.get(m.sociedad_id) ?? []

    // Mismo signo, importe idéntico al céntimo, fecha dentro de tolerancia, no usado.
    const match = cands.find(c =>
      !usados.has(c.ref) &&
      Math.sign(c.importe) === Math.sign(importe) &&
      Math.abs(Math.abs(c.importe) - Math.abs(importe)) < 0.005 &&
      diffDias(c.fecha, fecha) <= TOL_DIAS,
    )
    if (!match) continue

    const res = await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET conciliado = true, factura_ref = ${match.ref}
      WHERE id = ${m.id}::uuid
        AND cuenta_bancaria_id IN (SELECT id FROM cuentas_bancarias WHERE cuenta_id = ${cuentaId}::uuid)
    `
    if (Number(res) === 1) { conciliados += 1; usados.add(match.ref) }
  }

  return { conciliados, pendientes: movs.length - conciliados }
}
