import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { calcularNomina } from '@central/module-nominas'
import type { ContratoLaboral, IncidenciaMes, ModoCalculo, NominaDesglose, TipoIncidencia } from '@central/module-nominas'
import { leerModulo } from './modulos-empresa'
import { modoMotor } from './modulos-empresa-reglas'

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

/** AT/EP de la empresa como fracción. NULL = «no se sabe» (sin CNAE resuelto): el motor lo marca pendiente, no inventa 1,5 %. */
async function atEpDeEmpresa(empresaId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT at_ep_tipo FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  return rows[0]?.at_ep_tipo != null ? Number(rows[0].at_ep_tipo) : null
}

/** Modo del motor para la empresa: 'calculo' solo con el módulo nóminas activo en modo cálculo (si no, borrador «simulación»). */
export async function modoNominasEmpresa(empresaId: string): Promise<ModoCalculo> {
  return modoMotor(await leerModulo(empresaId, 'nominas'))
}

async function _recalcularDesglose(empresaId: string, nominaId: string): Promise<NominaDesglose> {
  const nomina = await prisma.nominas.findFirst({
    where: { id: nominaId, empresa_id: empresaId },
    include: { incidencias: { where: { empresa_id: empresaId } } },
  })
  if (!nomina) throw new Error('Nómina no encontrada')

  const contrato = await prisma.contratos_laborales.findFirst({
    where: { empresa_id: empresaId, empleado_id: nomina.empleado_id, activo: true },
  })
  if (!contrato) throw new Error('Sin contrato activo para recalcular')

  const atEp = await atEpDeEmpresa(empresaId)
  const modo = await modoNominasEmpresa(empresaId)

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

  return calcularNomina(contratoLaboral, incidencias, { periodo: nomina.periodo, atEp, modo })
}

/**
 * Borradores del mes. `modo` 'calculo' (cron, empresas con el módulo en cálculo) es fail-closed: una cifra legal
 * PENDIENTE_VERIFICAR hace fallar ESE contrato (se cuenta en `errores`, sin datos personales), no se inventa.
 */
export async function generarBorradores(
  empresaId: string,
  periodo: string,
  modo: ModoCalculo,
): Promise<{ creadas: number; omitidas: number; errores: { contrato_id: string; error: string }[] }> {
  parsePeriodo(periodo)

  const atEp = await atEpDeEmpresa(empresaId)

  const contratos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id, c.empleado_id, c.salario_base, c.grupo_cotizacion, c.tipo_contrato,
           c.jornada_pct, c.irpf_retencion_pct, c.conceptos_fijos
    FROM rrhh.contratos_laborales c
    JOIN rrhh.empleados e ON e.id = c.empleado_id AND e.empresa_id = c.empresa_id
    WHERE c.empresa_id = ${empresaId}::uuid AND c.activo = true AND e.estado = 'activo'`)

  let creadas = 0
  let omitidas = 0
  const errores: { contrato_id: string; error: string }[] = []

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

    let desglose: NominaDesglose
    try {
      desglose = calcularNomina(contratoLaboral, [], { periodo, atEp, modo })
    } catch (e) {
      errores.push({ contrato_id: String(c.id), error: e instanceof Error ? e.message : String(e) })
      continue
    }

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

  return { creadas, omitidas, errores }
}

export async function listarNominas(empresaId: string, periodo: string) {
  parsePeriodo(periodo)
  return prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT n.id, n.empleado_id, n.periodo, n.estado, n.generada_at, n.confirmada_at,
           n.datos_calculo, e.nombre AS empleado_nombre
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    WHERE n.empresa_id = ${empresaId}::uuid AND n.periodo = ${periodo}
    ORDER BY e.nombre ASC`)
}

export async function obtenerNomina(empresaId: string, nominaId: string) {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT n.id, n.empleado_id, n.periodo, n.estado, n.generada_at, n.confirmada_at,
           n.datos_calculo, n.pdf_path,
           e.nombre AS empleado_nombre, e.dni AS empleado_dni, e.nss AS empleado_nss
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    WHERE n.id = ${nominaId}::uuid AND n.empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) return null
  const incidencias = await prisma.incidencias_mes.findMany({
    where: { nomina_id: nominaId, empresa_id: empresaId },
  })
  return { ...rows[0], incidencias }
}

export async function addIncidencia(
  empresaId: string,
  nominaId: string,
  datos: { tipo: TipoIncidencia; concepto: string; importe?: number; horas?: number; dias?: number; origen?: { clave: string; fichajeIds: string[] } },
): Promise<{ id: string; duplicada?: boolean }> {
  const nomina = await prisma.nominas.findFirst({
    where: { id: nominaId, empresa_id: empresaId, estado: 'borrador' },
  })
  if (!nomina) throw new Error('Nómina no encontrada o ya confirmada')

  if (datos.origen) {
    // Idempotencia de las propuestas desde fichajes (columnas de la migración 0033): la misma clave no entra dos veces.
    const ya = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM rrhh.incidencias_mes
      WHERE empresa_id = ${empresaId}::uuid AND nomina_id = ${nominaId}::uuid AND origen_clave = ${datos.origen.clave} LIMIT 1`)
    if (ya[0]) return { id: ya[0].id, duplicada: true }
  }

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
  if (datos.origen) {
    try {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE rrhh.incidencias_mes
        SET origen = 'fichajes', origen_clave = ${datos.origen.clave}, origen_fichaje_ids = ${datos.origen.fichajeIds}::uuid[]
        WHERE id = ${inc.id}::uuid AND empresa_id = ${empresaId}::uuid`)
    } catch (e) {
      await prisma.incidencias_mes.deleteMany({ where: { id: inc.id, empresa_id: empresaId } })
      throw e
    }
  }

  let desglose: NominaDesglose
  try {
    desglose = await _recalcularDesglose(empresaId, nominaId)
  } catch (e) {
    // Modo cálculo + regla/cifra pendiente: no se deja una incidencia que el desglose guardado NO refleja.
    await prisma.incidencias_mes.deleteMany({ where: { id: inc.id, empresa_id: empresaId } })
    throw e
  }
  await prisma.nominas.updateMany({
    where: { id: nominaId, empresa_id: empresaId, estado: 'borrador' },
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

  await prisma.incidencias_mes.deleteMany({ where: { id: incId, empresa_id: empresaId } })

  const desglose = await _recalcularDesglose(empresaId, inc.nomina_id)
  await prisma.nominas.updateMany({
    where: { id: inc.nomina_id, empresa_id: empresaId, estado: 'borrador' },
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
