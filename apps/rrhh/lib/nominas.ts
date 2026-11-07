import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { calcularNomina, situacionVigente } from '@central/module-nominas'
import type {
  ContratoLaboral, EntradaNomina, IncidenciaMes, ModoCalculo, NominaDesglose, OpcionesNominaEuros, SituacionFamiliar, TipoIncidencia,
} from '@central/module-nominas'
import { leerModulo } from './modulos-empresa'
import { modoMotor } from './modulos-empresa-reglas'
import { duracionInferiorAnio, type DuracionContrato } from './contratos'

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

/** Último día del periodo (YYYY-MM-DD): la fecha con la que se busca el modelo 145 vigente de esa nómina. */
export function ultimoDiaPeriodo(periodo: string): string {
  const { year, month } = parsePeriodo(periodo)
  const d = new Date(Date.UTC(year, month, 0))
  return d.toISOString().slice(0, 10)
}

// ── Incidencias recurrentes (migración 0033) ─────────────────────────────────────────────────────────────────────────

export type Periodicidad = 'mensual' | 'trimestral' | 'anual'
export const PERIODICIDADES: Periodicidad[] = ['mensual', 'trimestral', 'anual']
const PASO_MESES: Record<Periodicidad, number> = { mensual: 1, trimestral: 3, anual: 12 }

export function mesesEntre(desde: string, hasta: string): number {
  const a = parsePeriodo(desde)
  const b = parsePeriodo(hasta)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/**
 * ¿Se copia la incidencia ORIGINAL (de la nómina de `periodoOrigen`) a la nómina de `periodo`? Solo hacia delante, cada
 * `periodicidad` y hasta `recurrenteHasta` incluido (null = sin fin conocido). Una copia nunca se vuelve a copiar.
 */
export function tocaEnPeriodo(
  o: { periodoOrigen: string; periodicidad: string | null; recurrenteHasta: string | null },
  periodo: string,
): boolean {
  if (!o.periodicidad || !PERIODICIDADES.includes(o.periodicidad as Periodicidad)) return false
  const d = mesesEntre(o.periodoOrigen, periodo)
  if (d <= 0) return false
  if (o.recurrenteHasta && periodo > o.recurrenteHasta) return false
  return d % PASO_MESES[o.periodicidad as Periodicidad] === 0
}

// ── Modelo 145 (migración 0032) → IRPF por algoritmo ─────────────────────────────────────────────────────────────────

/** Forma de `irpfAlgoritmo` del motor (motor.ts: `{ situacion, duracionInferiorAño }`). */
export type IrpfAlgoritmo = NonNullable<EntradaNomina['irpfAlgoritmo']>

const fechaIso = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

/** Fila de `rrhh.situacion_familiar` → tipo del motor. Céntimos BIGINT → number entero (nunca euros float). */
export function filaASituacionFamiliar(r: Record<string, unknown>): SituacionFamiliar {
  const datos = (r.datos ?? {}) as { descendientes?: SituacionFamiliar['descendientes']; ascendientes?: SituacionFamiliar['ascendientes'] }
  return {
    vigenteDesde: fechaIso(r.vigente_desde),
    vigenteHasta: r.vigente_hasta == null ? null : fechaIso(r.vigente_hasta),
    situacion: Number(r.situacion) as SituacionFamiliar['situacion'],
    fechaNacimientoContribuyente: fechaIso(r.fecha_nacimiento_contribuyente),
    discapacidad: (r.discapacidad ?? 'ninguna') as SituacionFamiliar['discapacidad'],
    necesitaAsistencia: Boolean(r.necesita_asistencia),
    descendientes: Array.isArray(datos.descendientes) ? datos.descendientes : [],
    ascendientes: Array.isArray(datos.ascendientes) ? datos.ascendientes : [],
    pensionCompensatoriaAnual: Number(r.pension_compensatoria_cent ?? 0),
    anualidadesAlimentosAnual: Number(r.anualidades_alimentos_cent ?? 0),
    hipotecaViviendaAnterior2013: Boolean(r.hipoteca_vivienda_anterior_2013),
    firmaDocumentoId: (r.firma_documento_id as string | null) ?? null,
  }
}

/**
 * `irpfAlgoritmo` para una nómina. `historial` null = la tabla del 145 NO se pudo leer («no se sabe»): devuelve undefined
 * y el llamador decide (cálculo → falla; simulación → % plano del contrato con aviso). Historial leído sin fila vigente =
 * `situacion: null` (sin 145: regla de ausencia del motor), que NO es lo mismo.
 */
export function irpfAlgoritmoPara(
  historial: SituacionFamiliar[] | null,
  periodo: string,
  contrato: { duracion: DuracionContrato | null; fechaInicio: Date | null; fechaFin: Date | null },
): IrpfAlgoritmo | undefined {
  if (historial === null) return undefined
  const situacion = situacionVigente(historial, ultimoDiaPeriodo(periodo))
  const inferior = duracionInferiorAnio(contrato)
  return inferior === undefined ? { situacion } : { situacion, duracionInferiorAño: inferior }
}

export const AVISO_145_ILEGIBLE = 'irpf:modelo145_ilegible_se_aplica_el_tipo_del_contrato'

function esTablaInexistente(e: unknown): boolean {
  const t = String((e as { message?: unknown })?.message ?? e) + String((e as { meta?: { code?: unknown } })?.meta?.code ?? '')
  return /42P01|situacion_familiar.*does not exist|relation .*situacion_familiar/i.test(t)
}

/** Historial del 145 por empleado de la empresa; null = tabla sin crear (migración 0032 sin aplicar). Datos RGPD art. 9: no salen de aquí. */
async function historial145(empresaId: string, empleadoId?: string): Promise<Map<string, SituacionFamiliar[]> | null> {
  try {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT empleado_id::text AS empleado_id, vigente_desde, vigente_hasta, situacion, fecha_nacimiento_contribuyente,
             discapacidad, necesita_asistencia, datos, pension_compensatoria_cent, anualidades_alimentos_cent,
             hipoteca_vivienda_anterior_2013, firma_documento_id
      FROM rrhh.situacion_familiar
      WHERE empresa_id = ${empresaId}::uuid
        ${empleadoId ? Prisma.sql`AND empleado_id = ${empleadoId}::uuid` : Prisma.empty}`)
    const m = new Map<string, SituacionFamiliar[]>()
    for (const r of rows) {
      const k = String(r.empleado_id)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(filaASituacionFamiliar(r))
    }
    return m
  } catch (e) {
    if (esTablaInexistente(e)) return null
    throw e
  }
}

// ── Cálculo común ────────────────────────────────────────────────────────────────────────────────────────────────────

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

type FilaContrato = {
  tipo_contrato: unknown; jornada_pct: unknown; salario_base: unknown; grupo_cotizacion: unknown
  irpf_retencion_pct: unknown; conceptos_fijos: unknown; duracion?: unknown; fecha_inicio?: unknown; fecha_fin?: unknown
}

const aFecha = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T00:00:00Z`))

export function contratoDeFila(c: FilaContrato): { laboral: ContratoLaboral; duracion: DuracionContrato | null; fechaInicio: Date | null; fechaFin: Date | null } {
  const duracion = c.duracion === 'indefinido' || c.duracion === 'temporal' ? c.duracion : null
  const laboral: ContratoLaboral = {
    tipoContrato: c.tipo_contrato as ContratoLaboral['tipoContrato'],
    jornadaPct: Number(c.jornada_pct),
    salarioBase: Number(c.salario_base),
    grupoCotizacion: Number(c.grupo_cotizacion) as ContratoLaboral['grupoCotizacion'],
    irpfRetencionPct: Number(c.irpf_retencion_pct),
    conceptosFijos: (c.conceptos_fijos as Array<{ nombre: string; importe: number }>) ?? [],
    // Duración real del contrato (0033). Sin ella, el adaptador del motor deduce del tipo (parcial → «no se sabe»).
    ...(duracion ? { duracion } : {}),
  }
  return { laboral, duracion, fechaInicio: aFecha(c.fecha_inicio), fechaFin: aFecha(c.fecha_fin) }
}

/**
 * Llama al motor con el 145 como `irpfAlgoritmo`. 145 ilegible: en 'calculo' falla (fail-closed); en 'simulacion' usa el
 * % plano del contrato y lo deja en `avisos`.
 */
function calcularConIrpf(
  c: ReturnType<typeof contratoDeFila>,
  incidencias: IncidenciaMes[],
  base: OpcionesNominaEuros,
  historial: SituacionFamiliar[] | null,
): NominaDesglose {
  const irpfAlgoritmo = irpfAlgoritmoPara(historial, base.periodo, c)
  if (!irpfAlgoritmo && base.modo === 'calculo') {
    throw new Error('Modelo 145 ilegible (migración 0032 sin aplicar): no se calcula en modo cálculo')
  }
  // `irpfAlgoritmo` en las opciones del adaptador (P1, misma forma que motor.ts). Variable, no literal: compila aunque el
  // tipo de las opciones aún no lo declare.
  const opts: OpcionesNominaEuros & { irpfAlgoritmo?: IrpfAlgoritmo } = irpfAlgoritmo ? { ...base, irpfAlgoritmo } : base
  const d = calcularNomina(c.laboral, incidencias, opts)
  if (!irpfAlgoritmo) d.avisos = [...(d.avisos ?? []), AVISO_145_ILEGIBLE]
  return d
}

type FilaIncidencia = { tipo: string; concepto: string; importe: unknown; horas: unknown; dias: number | null }

function incidenciaMotor(i: FilaIncidencia): IncidenciaMes {
  return {
    tipo: i.tipo as TipoIncidencia,
    concepto: i.concepto,
    importe: i.importe != null ? Number(i.importe) : undefined,
    horas: i.horas != null ? Number(i.horas) : undefined,
    dias: i.dias ?? undefined,
  }
}

/** Recalcula el desglose de una nómina. `excluir` = incidencia que se va a borrar (se calcula SIN ella antes de borrarla). */
async function _recalcularDesglose(empresaId: string, nominaId: string, o: { excluir?: string } = {}): Promise<NominaDesglose> {
  const nomina = await prisma.nominas.findFirst({
    where: { id: nominaId, empresa_id: empresaId },
    include: { incidencias: { where: { empresa_id: empresaId } } },
  })
  if (!nomina) throw new Error('Nómina no encontrada')

  const contrato = await prisma.contratos_laborales.findFirst({
    where: { empresa_id: empresaId, empleado_id: nomina.empleado_id, activo: true },
  })
  if (!contrato) throw new Error('Sin contrato activo para recalcular')

  const [atEp, modo, h145] = await Promise.all([
    atEpDeEmpresa(empresaId), modoNominasEmpresa(empresaId), historial145(empresaId, nomina.empleado_id),
  ])
  const incidencias = nomina.incidencias.filter(i => i.id !== o.excluir).map(incidenciaMotor)
  const historial = h145 === null ? null : h145.get(nomina.empleado_id) ?? []
  return calcularConIrpf(contratoDeFila(contrato), incidencias, { periodo: nomina.periodo, atEp, modo }, historial)
}

/**
 * Borradores del mes. `modo` 'calculo' (cron, empresas con el módulo en cálculo) es fail-closed: una cifra legal
 * PENDIENTE_VERIFICAR hace fallar ESE contrato (se cuenta en `errores`, sin datos personales), no se inventa.
 * Las incidencias RECURRENTES (0033) se copian a la nómina nueva en la misma transacción que la crea.
 */
export async function generarBorradores(
  empresaId: string,
  periodo: string,
  modo: ModoCalculo,
): Promise<{ creadas: number; omitidas: number; errores: { contrato_id: string; error: string }[]; recurrentesCopiadas: number }> {
  parsePeriodo(periodo)

  const [atEp, h145] = await Promise.all([atEpDeEmpresa(empresaId), historial145(empresaId)])

  const contratos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id, c.empleado_id, c.salario_base, c.grupo_cotizacion, c.tipo_contrato,
           c.jornada_pct, c.irpf_retencion_pct, c.conceptos_fijos, c.duracion, c.fecha_inicio, c.fecha_fin
    FROM rrhh.contratos_laborales c
    JOIN rrhh.empleados e ON e.id = c.empleado_id AND e.empresa_id = c.empresa_id
    WHERE c.empresa_id = ${empresaId}::uuid AND c.activo = true AND e.estado = 'activo'`)

  // Originales recurrentes de nóminas ANTERIORES de la empresa (las copias no se repiten).
  const recurrentes = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT i.id, i.tipo, i.concepto, i.importe, i.horas, i.dias, i.periodicidad, i.recurrente_hasta,
           n.empleado_id, n.periodo AS periodo_origen
    FROM rrhh.incidencias_mes i
    JOIN rrhh.nominas n ON n.id = i.nomina_id AND n.empresa_id = i.empresa_id
    WHERE i.empresa_id = ${empresaId}::uuid AND i.periodicidad IS NOT NULL AND i.copiada_de IS NULL
      AND n.periodo < ${periodo}`)

  let creadas = 0
  let omitidas = 0
  let recurrentesCopiadas = 0
  const errores: { contrato_id: string; error: string }[] = []

  for (const c of contratos) {
    const existing = await prisma.nominas.findFirst({
      where: { empresa_id: empresaId, empleado_id: c.empleado_id, periodo },
    })
    if (existing) { omitidas++; continue }

    const copias = recurrentes.filter(r => r.empleado_id === c.empleado_id && tocaEnPeriodo({
      periodoOrigen: r.periodo_origen, periodicidad: r.periodicidad, recurrenteHasta: r.recurrente_hasta,
    }, periodo))

    let desglose: NominaDesglose
    try {
      const historial = h145 === null ? null : h145.get(String(c.empleado_id)) ?? []
      desglose = calcularConIrpf(contratoDeFila(c), copias.map(incidenciaMotor), { periodo, atEp, modo }, historial)
    } catch (e) {
      errores.push({ contrato_id: String(c.id), error: e instanceof Error ? e.message : String(e) })
      continue
    }

    try {
      await prisma.$transaction(async tx => {
        const n = await tx.nominas.create({
          data: {
            empresa_id: empresaId,
            empleado_id: c.empleado_id,
            periodo,
            estado: 'borrador',
            datos_calculo: desglose as unknown as object,
          },
        })
        if (copias.length) {
          await tx.incidencias_mes.createMany({
            data: copias.map(r => ({
              empresa_id: empresaId,
              nomina_id: n.id,
              tipo: r.tipo,
              concepto: r.concepto,
              importe: r.importe ?? null,
              horas: r.horas ?? null,
              dias: r.dias ?? null,
              copiada_de: r.id,
            })),
          })
        }
      })
    } catch (e) {
      // Carrera con otra generación del mismo mes (único empresa+empleado+periodo): ya existe, no es un error.
      if ((e as { code?: string })?.code === 'P2002') { omitidas++; continue }
      throw e
    }
    creadas++
    recurrentesCopiadas += copias.length
  }

  return { creadas, omitidas, errores, recurrentesCopiadas }
}

export async function listarNominas(empresaId: string, periodo: string) {
  parsePeriodo(periodo)
  const nominas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT n.id, n.empleado_id, n.periodo, n.estado, n.generada_at, n.confirmada_at,
           n.datos_calculo, e.nombre AS empleado_nombre
    FROM rrhh.nominas n
    JOIN rrhh.empleados e ON e.id = n.empleado_id AND e.empresa_id = n.empresa_id
    WHERE n.empresa_id = ${empresaId}::uuid AND n.periodo = ${periodo}
    ORDER BY e.nombre ASC`)
  if (!nominas.length) return nominas
  // Antes el panel pintaba `n.incidencias` pero no venían: se cargan aquí (mismas nóminas, misma empresa).
  const incidencias = await prisma.incidencias_mes.findMany({
    where: { empresa_id: empresaId, nomina_id: { in: nominas.map(n => n.id as string) } },
    orderBy: { creada_at: 'asc' },
  })
  const porNomina = new Map<string, unknown[]>()
  for (const i of incidencias) {
    const v = { ...i, importe: i.importe == null ? null : Number(i.importe), horas: i.horas == null ? null : Number(i.horas) }
    if (!porNomina.has(i.nomina_id)) porNomina.set(i.nomina_id, [])
    porNomina.get(i.nomina_id)!.push(v)
  }
  return nominas.map(n => ({ ...n, incidencias: porNomina.get(n.id) ?? [] }))
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
  datos: {
    tipo: TipoIncidencia; concepto: string; importe?: number; horas?: number; dias?: number
    /** 0033: null/undefined = puntual. */
    periodicidad?: Periodicidad | null
    recurrenteHasta?: string | null
  },
) {
  const nomina = await prisma.nominas.findFirst({
    where: { id: nominaId, empresa_id: empresaId, estado: 'borrador' },
  })
  if (!nomina) throw new Error('Nómina no encontrada o ya confirmada')
  if (datos.recurrenteHasta) {
    parsePeriodo(datos.recurrenteHasta)
    if (datos.recurrenteHasta < nomina.periodo) throw new Error('«Hasta» es anterior al periodo de la nómina (inválido)')
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
      periodicidad: datos.periodicidad ?? null,
      recurrente_hasta: datos.periodicidad ? datos.recurrenteHasta ?? null : null,
    },
  })

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

/**
 * Borra una incidencia de un borrador. Se calcula PRIMERO el desglose sin ella: si el recálculo falla (modo cálculo con
 * una cifra pendiente, sin contrato…) no se borra nada (antes se borraba y el desglose guardado quedaba desfasado).
 * Borrado + desglose nuevo van en una transacción, y solo si la nómina sigue en borrador.
 */
export async function deleteIncidencia(empresaId: string, incId: string): Promise<void> {
  const inc = await prisma.incidencias_mes.findFirst({
    where: { id: incId, empresa_id: empresaId },
  })
  if (!inc) throw new Error('Incidencia no encontrada')

  const nomina = await prisma.nominas.findFirst({
    where: { id: inc.nomina_id, empresa_id: empresaId, estado: 'borrador' },
  })
  if (!nomina) throw new Error('Nómina ya confirmada')

  const desglose = await _recalcularDesglose(empresaId, inc.nomina_id, { excluir: incId })

  await prisma.$transaction(async tx => {
    const n = await tx.nominas.updateMany({
      where: { id: inc.nomina_id, empresa_id: empresaId, estado: 'borrador' },
      data: { datos_calculo: desglose as unknown as object },
    })
    if (!n.count) throw new Error('Nómina ya confirmada')
    await tx.incidencias_mes.deleteMany({ where: { id: incId, empresa_id: empresaId } })
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
