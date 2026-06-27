import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { calcularNomina, tablas2026 } from '@central/module-nominas'
import type { ContratoLaboral, IncidenciaMes, NominaDesglose, TipoIncidencia } from '@central/module-nominas'

export function parsePeriodo(periodo: string): { year: number; month: number } {
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error(`Período inválido: ${periodo}`)
  const [y, m] = periodo.split('-').map(Number)
  if (m < 1 || m > 12) throw new Error(`Período inválido: ${periodo}`)
  return { year: y, month: m }
}

export function periodoActual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function atEpDeEmpresa(empresaId: string): Promise<number> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT at_ep_tipo FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  return rows[0]?.at_ep_tipo != null ? Number(rows[0].at_ep_tipo) : 0.015
}

async function _recalcularDesglose(empresaId: string, nominaId: string): Promise<NominaDesglose> {
  const nomina = await prisma.nominas.findFirst({
    where: { id: nominaId, empresa_id: empresaId },
    include: { incidencias: true },
  })
  if (!nomina) throw new Error('Nómina no encontrada')

  const contrato = await prisma.contratos_laborales.findFirst({
    where: { empresa_id: empresaId, empleado_id: nomina.empleado_id, activo: true },
  })
  if (!contrato) throw new Error('Sin contrato activo para recalcular')

  const atEp = await atEpDeEmpresa(empresaId)
  const tablas = tablas2026(atEp)

  const contratoLaboral: ContratoLaboral = {
    tipoContrato: contrato.tipo_contrato as ContratoLaboral['tipoContrato'],
    jornadaPct: Number(contrato.jornada_pct),
    salarioBase: Number(contrato.salario_base),
    grupoCotizacion: contrato.grupo_cotizacion as ContratoLaboral['grupoCotizacion'],
    irpfRetencionPct: Number(contrato.irpf_retencion_pct),
    conceptosFijos: (contrato.conceptos_fijos as Array<{ nombre: string; importe: number }>) ?? [],
  }

  const incidencias: IncidenciaMes[] = nomina.incidencias.map(i => ({
    tipo: i.tipo as TipoIncidencia,
    concepto: i.concepto,
    importe: i.importe != null ? Number(i.importe) : undefined,
    horas: i.horas != null ? Number(i.horas) : undefined,
    dias: i.dias ?? undefined,
  }))

  return calcularNomina(contratoLaboral, incidencias, tablas, nomina.periodo)
}

export async function generarBorradores(
  empresaId: string,
  periodo: string,
): Promise<{ creadas: number; omitidas: number }> {
  parsePeriodo(periodo)

  const atEp = await atEpDeEmpresa(empresaId)
  const tablas = tablas2026(atEp)

  const contratos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id, c.empleado_id, c.salario_base, c.grupo_cotizacion, c.tipo_contrato,
           c.jornada_pct, c.irpf_retencion_pct, c.conceptos_fijos
    FROM rrhh.contratos_laborales c
    JOIN rrhh.empleados e ON e.id = c.empleado_id
    WHERE c.empresa_id = ${empresaId}::uuid AND c.activo = true AND e.estado = 'activo'`)

  let creadas = 0
  let omitidas = 0

  for (const c of contratos) {
    const existing = await prisma.nominas.findFirst({
      where: { empresa_id: empresaId, empleado_id: c.empleado_id, periodo },
    })
    if (existing) { omitidas++; continue }

    const contratoLaboral: ContratoLaboral = {
      tipoContrato: c.tipo_contrato as ContratoLaboral['tipoContrato'],
      jornadaPct: Number(c.jornada_pct),
      salarioBase: Number(c.salario_base),
      grupoCotizacion: Number(c.grupo_cotizacion) as ContratoLaboral['grupoCotizacion'],
      irpfRetencionPct: Number(c.irpf_retencion_pct),
      conceptosFijos: (c.conceptos_fijos as Array<{ nombre: string; importe: number }>) ?? [],
    }

    const desglose = calcularNomina(contratoLaboral, [], tablas, periodo)

    await prisma.nominas.create({
      data: {
        empresa_id: empresaId,
        empleado_id: c.empleado_id,
        periodo,
        estado: 'borrador',
        datos_calculo: desglose as unknown as object,
      },
    })
    creadas++
  }

  return { creadas, omitidas }
}

export async function listarNominas(empresaId: string, periodo: string) {
  parsePeriodo(periodo)
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT n.id, n.empleado_id, n.periodo, n.estado, n.generada_at, n.confirmada_at,
           n.datos_calculo, e.nombre AS empleado_nombre
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id
    WHERE n.empresa_id = ${empresaId}::uuid AND n.periodo = ${periodo}
    ORDER BY e.nombre ASC`)
}

export async function obtenerNomina(empresaId: string, nominaId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT n.id, n.empleado_id, n.periodo, n.estado, n.generada_at, n.confirmada_at,
           n.datos_calculo, n.pdf_path,
           e.nombre AS empleado_nombre, e.dni AS empleado_dni, e.nss AS empleado_nss
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id
    WHERE n.id = ${nominaId}::uuid AND n.empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) return null
  const incidencias = await prisma.incidencias_mes.findMany({
    where: { nomina_id: nominaId },
  })
  return { ...rows[0], incidencias }
}

export async function addIncidencia(
  empresaId: string,
  nominaId: string,
  datos: { tipo: TipoIncidencia; concepto: string; importe?: number; horas?: number; dias?: number },
) {
  const nomina = await prisma.nominas.findFirst({
    where: { id: nominaId, empresa_id: empresaId, estado: 'borrador' },
  })
  if (!nomina) throw new Error('Nómina no encontrada o ya confirmada')

  const inc = await prisma.incidencias_mes.create({
    data: {
      empresa_id: empresaId,
      nomina_id: nominaId,
      tipo: datos.tipo,
      concepto: datos.concepto,
      importe: datos.importe ?? null,
      horas: datos.horas ?? null,
      dias: datos.dias ?? null,
    },
  })

  const desglose = await _recalcularDesglose(empresaId, nominaId)
  await prisma.nominas.update({
    where: { id: nominaId },
    data: { datos_calculo: desglose as unknown as object },
  })

  return { id: inc.id }
}

export async function deleteIncidencia(empresaId: string, incId: string): Promise<void> {
  const inc = await prisma.incidencias_mes.findFirst({
    where: { id: incId, empresa_id: empresaId },
  })
  if (!inc) throw new Error('Incidencia no encontrada')

  const nomina = await prisma.nominas.findFirst({
    where: { id: inc.nomina_id, empresa_id: empresaId, estado: 'borrador' },
  })
  if (!nomina) throw new Error('Nómina ya confirmada')

  await prisma.incidencias_mes.delete({ where: { id: incId } })

  const desglose = await _recalcularDesglose(empresaId, inc.nomina_id)
  await prisma.nominas.update({
    where: { id: inc.nomina_id },
    data: { datos_calculo: desglose as unknown as object },
  })
}

export async function listarPeriodosConNominas(empresaId: string) {
  return prisma.$queryRaw<{ periodo: string; total: number; confirmadas: number }[]>(Prisma.sql`
    SELECT periodo,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE estado = 'confirmada')::int AS confirmadas
    FROM rrhh.nominas
    WHERE empresa_id = ${empresaId}::uuid
    GROUP BY periodo
    ORDER BY periodo DESC`)
}
