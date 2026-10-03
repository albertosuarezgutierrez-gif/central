// La póliza de competencia de una oportunidad, lista para pintar (03/10/2026). Solo compone las reglas
// puras de `@central/module-seguros` (`competencia-poliza.ts`, `oportunidad-aviso.ts`): no decide nada
// por su cuenta, para que la tarjeta, la lista de precios y el aviso digan lo mismo.
import {
  ahorroFrenteActual, estadoAvisoVencimiento, objetivoPrioritario, periodoEnMeses, primaActualAnualizada,
  type AhorroFrenteActual, type EstadoAvisoVencimiento, type PrimaAnualizada, type SeguroAnterior,
} from '@central/module-seguros'
import { eur } from '../dinero.ts'

export type VistaCompetencia = {
  /** «Objetivo prioritario: …». `null` = no lo es, o no se sabe: no se pinta nada. */
  etiquetaPrioritaria: string | null
  aviso: EstadoAvisoVencimiento
  /** Lo que paga al año. `anual: null` = no se puede decir (con su motivo). */
  primaActual: PrimaAnualizada
}

export function vistaCompetencia(e: {
  seguroAnterior: SeguroAnterior | null
  prima: number | null
  fechaFinVigencia: string | null
  hoy: string
}): VistaCompetencia {
  const sa = e.seguroAnterior
  const meses = periodoEnMeses(sa?.fechaEfecto, sa?.fechaVencimiento)
  return {
    etiquetaPrioritaria: objetivoPrioritario({
      canal: sa?.canal, cesionDerechos: sa?.cesionDerechos, pagoUnico: sa?.pagoUnico, periodoMeses: meses,
    }).texto,
    aviso: estadoAvisoVencimiento(e.fechaFinVigencia, e.hoy),
    primaActual: primaActualAnualizada({
      prima: e.prima, pagoUnico: sa?.pagoUnico, fechaEfecto: sa?.fechaEfecto, fechaVencimiento: sa?.fechaVencimiento,
    }),
  }
}

/** Por qué no se enseña lo que paga hoy (para decirlo, en vez de callarlo). */
export function motivoSinPrimaActual(p: PrimaAnualizada): string | null {
  if (p.anual !== null) return null
  switch (p.motivo) {
    case 'prima_desconocida': return 'No consta lo que paga hoy: no se compara.'
    case 'periodo_desconocido': return 'Su póliza es plurianual de pago único y no consta el periodo: no se puede anualizar, no se compara.'
    case 'posible_plurianual': return 'Su póliza parece de varios años y no consta si se pagó de una vez: no se compara hasta saberlo.'
  }
}

/**
 * «Pagas X → te proponemos Y» para UNA propuesta. `null` = no se enseña ahorro (falta una cifra).
 * Con propuesta más cara se dice tal cual, sin llamarlo ahorro.
 */
export function textoPagasProponemos(primaActualAnual: number | null, propuestaAnual: number | null | undefined): string | null {
  const a: AhorroFrenteActual | null = ahorroFrenteActual(primaActualAnual, propuestaAnual)
  if (!a) return null
  const base = `Pagas ${eur(a.actual)}/año → te proponemos ${eur(a.propuesta)}/año`
  if (a.ahorro > 0) return `${base} (ahorras ${eur(a.ahorro)}/año, un ${String(a.pct).replace('.', ',')} %)`
  if (a.ahorro === 0) return `${base} (mismo precio)`
  return `${base} (${eur(-a.ahorro)}/año más: no es un ahorro)`
}

/**
 * Lo que `ListaPrecios`/`FiltroGarantias` necesitan para el «pagas X → te proponemos Y». `null` si no hay
 * oportunidad de la que sacarlo (la pantalla es la de siempre).
 */
export function primaActualParaLista(
  anterior: { aseguradora: string | null; prima: number | null; seguroAnterior: SeguroAnterior | null } | null,
): { anual: number | null; motivo: string | null; compania: string | null } | null {
  if (!anterior) return null
  const sa = anterior.seguroAnterior
  const p = primaActualAnualizada({ prima: anterior.prima, pagoUnico: sa?.pagoUnico, fechaEfecto: sa?.fechaEfecto, fechaVencimiento: sa?.fechaVencimiento })
  // Sin prima en la oportunidad no hay nada que comparar: no se pinta un aviso por cada tarificación.
  if (p.anual === null && p.motivo === 'prima_desconocida') return null
  return { anual: p.anual, motivo: motivoSinPrimaActual(p), compania: anterior.aseguradora }
}
