// Fixture de tests del resultado de la declaración (no es un test: node --test solo ejecuta *.test.ts).
// Situación familiar = la real de fiscal_perfil/fiscal_descendientes (03/11/2026); bases inventadas pero realistas.
import type { Periodo, PropiedadFiscal } from './base-fiscal-devengo.ts'
import type { Descendiente, PerfilFiscal } from './fiscal-deducciones.ts'
import type { ContextoResultado } from './resultado-declaracion.ts'
import { parametrosIrpf, type EntradaSimulador } from './simulador-irpf.ts'

export const HIJOS: Descendiente[] = [
  { nombre: 'h1', fechaNacimiento: '2018-10-01', gradoDiscapacidad: 0, computoCompleto: true },
  { nombre: 'h2', fechaNacimiento: '2024-04-11', gradoDiscapacidad: 0, computoCompleto: true },
  { nombre: 'h3', fechaNacimiento: '2025-11-10', gradoDiscapacidad: 0, computoCompleto: true },
]
export const PERFIL: PerfilFiscal = {
  comunidadAutonoma: 'andalucia', declaracionConjunta: true, familiaNumerosa: 'general', conyugeTrabaja: true,
  gastoGuarderiaAnual: 3435.5, aportacionPlanPensiones: 0, gradoDiscapacidadTitular: 0, gradoDiscapacidadConyuge: 0,
  ascendientesACargo: 0, ascendientesMayores75: 0, donativosAnual: 0, gastoDeportivoAnual: 0,
  cuotasSSMadreAnual: 467.45, familiaNumerosaDesde: '2025-11-18', abonoAnticipadoMaternidad: 0, abonoAnticipadoFamiliaNumerosa: 0,
}
export const PROPS: PropiedadFiscal[] = [
  { id: 'prop_socorro', nombre: 'Socorro', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 50 }, { titular: 'pilar', porcentaje: 50 }] },
  { id: 'prop_duplex', nombre: 'Dúplex', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 100 }] },
]
const linea = (id: string, nombre: string, neto: number) =>
  ({ propertyId: id, nombre, bloque: 'capital_inmobiliario' as const, bruto: neto + 10000, comision: 0, gastosDirectos: 0, mobiliario: 0, compartidos: 0, amortizacion: null, dias: 0, neto })

/** Socorro neto 30.000 (50/50), Dúplex 10.000 (Alberto), correduría 20.000 (Alberto), actividad de Pilar 5.000. */
export function entradaFixture(): EntradaSimulador {
  const p: Periodo = {
    desde: '2026-01-01', hasta: '2026-12-31', porMes: [], compartidosSinRepartir: 0,
    correduria: { cobrado: null, bruto: null, retencion: null, gastos: null, neto: 20000 }, pilar: { ingresos: null, gastos: null, neto: 5000 },
    lineas: [linea('prop_socorro', 'Socorro', 30000), linea('prop_duplex', 'Dúplex', 10000)],
    bloques: { capital_inmobiliario: 40000, capital_mobiliario: 0, actividad_correduria: 20000, actividad_pilar: 5000 },
    baseGeneral: 65000,
  }
  return {
    periodo: p, propiedades: PROPS, params: parametrosIrpf(2026, HIJOS),
    rendimientosTrabajo: { alberto: 0, pilar: 0 }, retenciones: { alberto: null, pilar: null }, pagosFraccionados: { alberto: null, pilar: null },
    intereses: { prop_socorro: 0, prop_duplex: 0 },
  }
}
export function ctxFixture(extra: Partial<ContextoResultado> = {}): ContextoResultado {
  return {
    anio: 2026, perfil: PERFIL, descendientes: HIJOS,
    retencionesAlberto: { total: 1500, real: 1000, estimada: 500, fuente: 'mixta' },
    retencionesPilar: 297.17, pagosFraccionados: { alberto: 0, pilar: 0 }, mesesTranscurridos: 12, avisos: [], ...extra,
  }
}
