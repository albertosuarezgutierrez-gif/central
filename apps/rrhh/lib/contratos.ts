import { prisma } from './prisma'
import type { GrupoCotizacion, TipoContrato } from '@central/module-nominas'

export interface DatosContrato {
  salarioBase: number
  grupoCotizacion: GrupoCotizacion
  tipoContrato: TipoContrato
  jornadaPct: number
  irpfRetencionPct: number
  categoriaConvenio?: string | null
  conceptosFijos: { nombre: string; importe: number }[]
  vigenteDesde: Date
}

export interface ContratoRow extends DatosContrato {
  id: string
  empresaId: string
  empleadoId: string
  activo: boolean
  creadaAt: Date
}

function mapRow(r: Record<string, unknown>): ContratoRow {
  return {
    id: r.id as string,
    empresaId: r.empresa_id as string,
    empleadoId: r.empleado_id as string,
    salarioBase: Number(r.salario_base),
    grupoCotizacion: r.grupo_cotizacion as GrupoCotizacion,
    tipoContrato: r.tipo_contrato as TipoContrato,
    jornadaPct: Number(r.jornada_pct),
    irpfRetencionPct: Number(r.irpf_retencion_pct),
    categoriaConvenio: r.categoria_convenio as string | null,
    conceptosFijos: r.conceptos_fijos as { nombre: string; importe: number }[],
    vigenteDesde: new Date(r.vigente_desde as string),
    activo: r.activo as boolean,
    creadaAt: new Date(r.creada_at as string),
  }
}

export async function contratoActivoDeEmpleado(
  empresaId: string,
  empleadoId: string,
): Promise<ContratoRow | null> {
  const row = await prisma.contratos_laborales.findFirst({
    where: { empresa_id: empresaId, empleado_id: empleadoId, activo: true },
  })
  return row ? mapRow(row as Record<string, unknown>) : null
}

export async function crearContrato(
  empresaId: string,
  empleadoId: string,
  datos: DatosContrato,
): Promise<void> {
  // Desactivar contratos anteriores del mismo empleado
  await prisma.contratos_laborales.updateMany({
    where: { empresa_id: empresaId, empleado_id: empleadoId, activo: true },
    data: { activo: false },
  })
  await prisma.contratos_laborales.create({
    data: {
      empresa_id: empresaId,
      empleado_id: empleadoId,
      salario_base: datos.salarioBase,
      grupo_cotizacion: datos.grupoCotizacion,
      tipo_contrato: datos.tipoContrato,
      jornada_pct: datos.jornadaPct,
      irpf_retencion_pct: datos.irpfRetencionPct,
      categoria_convenio: datos.categoriaConvenio ?? null,
      conceptos_fijos: datos.conceptosFijos,
      vigente_desde: datos.vigenteDesde,
    },
  })
}

export async function historialContratos(
  empresaId: string,
  empleadoId: string,
): Promise<ContratoRow[]> {
  const rows = await prisma.contratos_laborales.findMany({
    where: { empresa_id: empresaId, empleado_id: empleadoId },
    orderBy: { vigente_desde: 'desc' },
  })
  return rows.map(r => mapRow(r as Record<string, unknown>))
}

const TIPOS_CONTRATO: TipoContrato[] = ['indefinido', 'temporal', 'parcial']
const GRUPOS_VALIDOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** Valida y parsea el body de una petición de creación/actualización de contrato. */
export function parsearDatosContrato(body: unknown): DatosContrato {
  const b = body as Record<string, unknown>
  const salarioBase = Number(b.salarioBase)
  if (!isFinite(salarioBase) || salarioBase <= 0) throw new Error('salarioBase debe ser positivo')
  const grupoCotizacion = Number(b.grupoCotizacion)
  if (!GRUPOS_VALIDOS.includes(grupoCotizacion)) throw new Error('grupoCotizacion debe ser 1-11')
  const tipoContrato = b.tipoContrato as TipoContrato
  if (!TIPOS_CONTRATO.includes(tipoContrato)) throw new Error('tipoContrato inválido')
  const jornadaPct = Number(b.jornadaPct)
  if (!isFinite(jornadaPct) || jornadaPct <= 0 || jornadaPct > 100) throw new Error('jornadaPct debe ser 1-100')
  const irpfRetencionPct = Number(b.irpfRetencionPct ?? 0)
  if (!isFinite(irpfRetencionPct) || irpfRetencionPct < 0 || irpfRetencionPct > 45) throw new Error('irpfRetencionPct debe ser 0-45')
  const vigenteDesde = new Date(b.vigenteDesde as string)
  if (isNaN(vigenteDesde.getTime())) throw new Error('vigenteDesde es una fecha inválida')
  const conceptosFijos = Array.isArray(b.conceptosFijos)
    ? (b.conceptosFijos as Array<{ nombre: string; importe: number }>)
    : []
  return {
    salarioBase,
    grupoCotizacion: grupoCotizacion as GrupoCotizacion,
    tipoContrato,
    jornadaPct,
    irpfRetencionPct,
    categoriaConvenio: typeof b.categoriaConvenio === 'string' ? b.categoriaConvenio || null : null,
    conceptosFijos,
    vigenteDesde,
  }
}
