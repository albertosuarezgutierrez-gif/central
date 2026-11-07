/**
 * ADAPTADOR euros ⇄ céntimos para los llamadores de `apps/rrhh` (la BD guarda NUMERIC en euros y el
 * `datos_calculo` JSONB histórico va en euros). El cálculo de verdad está en `motor.ts`, en céntimos enteros:
 * aquí solo se convierte la entrada UNA vez y la salida UNA vez (sin aritmética en float).
 */
import { centimosAEuros, eurosACentimos, fraccionAPpm } from './dinero'
import { calcularNominaCentimos, type ModoCalculo, type NominaCentimos } from './motor'
import type { SituacionFamiliar } from './situacion-familiar'
import type { TablaAnual, TablaIrpf } from './tablas'
import type { ContratoLaboral, IncidenciaMes, NominaDesglose } from './tipos'

export interface OpcionesNominaEuros {
  periodo: string
  /** `rrhh.empresas.at_ep_tipo` como FRACCIÓN (0.0155); null = sin resolver. */
  atEp: number | null
  modo: ModoCalculo
  diasLaborablesMes?: number
  /** Tiempo parcial: horas realmente trabajadas en el mes (mínimos por hora). Sin dato → aproximación pendiente. */
  horasTrabajadasMes?: number
  /**
   * Retención por el ALGORITMO AEAT (RIRPF arts. 82-86) en vez del % plano del contrato. rrhh lo rellena desde
   * `situacion_familiar` (modelo 145 vigente en la fecha del periodo: `situacionVigente`). `situacion: null` = sin
   * modelo 145 → art. 88.2 RIRPF (sin circunstancias personales/familiares). Ausente (undefined) = % plano, como antes.
   */
  irpfAlgoritmo?: EntradaIrpfAlgoritmo
  tabla?: TablaAnual
  tablaIrpf?: TablaIrpf
}

/** Datos del modelo 145 que necesita el algoritmo de retenciones (forma que rellena `apps/rrhh`). */
export interface EntradaIrpfAlgoritmo {
  situacion: SituacionFamiliar | null
  /** Contrato o relación de duración inferior al año (art. 86.2 RIRPF: tipo mínimo 2 %). */
  duracionInferiorAño?: boolean
}

export function calcularNomina(contrato: ContratoLaboral, incidencias: IncidenciaMes[], o: OpcionesNominaEuros): NominaDesglose {
  const duracion = contrato.duracion ?? (contrato.tipoContrato === 'parcial' ? null : contrato.tipoContrato)
  const r = calcularNominaCentimos(
    {
      periodo: o.periodo,
      grupo: contrato.grupoCotizacion,
      duracion,
      jornadaPct: contrato.jornadaPct,
      salarioBase: eurosACentimos(contrato.salarioBase),
      complementosFijos: contrato.conceptosFijos.map(c => ({ concepto: c.nombre, importe: eurosACentimos(c.importe) })),
      pagas: contrato.pagas ?? 12,
      prorrataExtras: contrato.prorrataExtras ?? false,
      irpfPct: contrato.irpfRetencionPct,
      atEp: o.atEp === null ? null : fraccionAPpm(o.atEp),
      incidencias: incidencias.map(i => ({
        tipo: i.tipo,
        concepto: i.concepto,
        importe: i.importe != null ? eurosACentimos(i.importe) : undefined,
        horas: i.horas,
        dias: i.dias,
      })),
      diasLaborablesMes: o.diasLaborablesMes,
      horasTrabajadasMes: o.horasTrabajadasMes,
      irpfAlgoritmo: o.irpfAlgoritmo,
    },
    { modo: o.modo, tabla: o.tabla, tablaIrpf: o.tablaIrpf },
  )
  return desgloseEnEuros(r)
}

export function desgloseEnEuros(r: NominaCentimos): NominaDesglose {
  const e = centimosAEuros
  return {
    periodo: r.periodo,
    devengos: {
      salarioBase: e(r.devengos.salarioBase),
      complementosFijos: r.devengos.complementosFijos.map(c => ({ concepto: c.concepto, importe: e(c.importe) })),
      horasExtra: e(r.devengos.horasExtra),
      prorrataExtras: e(r.devengos.prorrataExtras),
      pagaExtra: e(r.devengos.pagaExtra),
      pluses: r.devengos.pluses.map(p => ({ concepto: p.concepto, importe: e(p.importe) })),
      descuentos: e(r.devengos.descuentos),
      total: e(r.devengos.total),
    },
    baseCotizacion: e(r.bases.contingenciasComunes),
    baseContingenciasProfesionales: e(r.bases.contingenciasProfesionales),
    baseIrpf: e(r.bases.irpf),
    deducciones: {
      contingencias_comunes: e(r.trabajador.contingenciasComunes),
      desempleo: e(r.trabajador.desempleo),
      fp: e(r.trabajador.fp),
      mei: e(r.trabajador.mei),
      solidaridad: e(r.trabajador.solidaridad),
      irpf: e(r.trabajador.irpf),
      total: e(r.trabajador.total),
    },
    netoAPagar: e(r.neto),
    cuotaPatronal: {
      contingencias_comunes: e(r.empresa.contingenciasComunes),
      desempleo: e(r.empresa.desempleo),
      fogasa: e(r.empresa.fogasa),
      fp: e(r.empresa.fp),
      at_ep: e(r.empresa.atEp),
      mei: e(r.empresa.mei),
      solidaridad: e(r.empresa.solidaridad),
      total: e(r.empresa.total),
    },
    costeTotalEmpresa: e(r.costeEmpresa),
    tablasAño: r.año,
    modo: r.modo,
    cifrasPendientes: r.cifrasPendientes,
    avisos: r.avisos,
    irpfAlgoritmo: r.irpf === null ? null : { tipoPct: r.irpf.tipoPpm / 10_000, motivo: r.irpf.motivo },
  }
}

/**
 * ¿Se puede CONFIRMAR (publicar al empleado) este desglose? Solo si se calculó con el motor N0 y sin nada pendiente.
 * `cifrasPendientes` ausente (borrador anterior al 05/11/2026, tablas de 2025 con nombre de 2026) = «no se sabe» → NO.
 */
export function desgloseConfirmable(d: unknown): { ok: true } | { ok: false; motivo: string } {
  const p = (d as { cifrasPendientes?: unknown } | null)?.cifrasPendientes
  if (!Array.isArray(p)) return { ok: false, motivo: 'Borrador calculado con las tablas antiguas: recalcúlalo antes de confirmar' }
  if (p.length) return { ok: false, motivo: `Cifras legales sin verificar: ${p.join(', ')}` }
  return { ok: true }
}
