// apps/plataforma/lib/cuadre-tarjetas.ts
// Veredicto del Check 7 del health-check (cuadre de liquidaciones de tarjeta).
//
// Por qué existe (17/08/2026): el check exigía como única prueba el espejo `PAGO RECIBO`
// del MISMO día en la cuenta de la tarjeta, pero ese recibo ABRE el extracto del mes
// SIGUIENTE (paga el ciclo anterior — landmine 08/08/2026, PR #1300). Resultado: tras la
// liquidación del día 1, el check reclamaba «súbeme el extracto» durante ~un mes aunque el
// desglose de las compras YA estuviera importado (le pasó a Alberto con la ****0300: 96
// compras de julio en BD y el health-check en 🔴 pidiéndolas).
//
// La pregunta real del check es «¿está importado el DESGLOSE del ciclo que se liquidó?», y
// eso se comprueba mirando si la cuenta de la tarjeta (TARJETA-KUTXA-<últ.4>) tiene compras
// del mes del ciclo — esas filas SOLO pueden venir de un extracto subido (pdf/excel/manual;
// la tarjeta no tiene feed PSD2). Tres estados, no dos:
//   · espejo presente → ni llega aquí (el SQL ya lo excluye) → ✅
//   · sin espejo pero con compras del ciclo → ✅ desglose importado (el recibo espejo
//     llegará con el extracto del mes siguiente; no es un fallo)
//   · sin espejo y sin compras del ciclo → 🔴 falta el extracto DEL CICLO (no «de agosto»:
//     la liquidación del 01/08 paga las compras de JULIO, y nombrar el mes equivocado fue
//     parte de la confusión original)
//   · sin PAN en el concepto → no se puede mirar la cuenta de la tarjeta → se dice ESO
//     («no puedo comprobarlo»), nunca «no lo has subido» (regla: dato que no hay ≠ dato
//     que no se ha mirado).
import { eur } from './dinero.ts'

export type LiquidacionSinEspejo = {
  /** Fecha de la liquidación en la cuenta corriente (Date o 'YYYY-MM-DD'). */
  fecha: Date | string
  /** Importe del cargo en la corriente (negativo). */
  importe: number
  /** Dígitos de tarjeta extraídos del concepto (null si el concepto no los trae). */
  pan: string | null
  /** Nº de compras del mes del ciclo ya importadas en la cuenta de la tarjeta. */
  comprasCiclo: number
  /** Suma (en positivo) de esas compras. */
  sumaCiclo: number
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function aFechaUTC(f: Date | string): Date {
  return typeof f === 'string' ? new Date(`${f.slice(0, 10)}T00:00:00Z`) : f
}

// Mes del CICLO que paga una liquidación: el del día anterior a la fecha del cargo.
// Kutxabank liquida el día 1, así que el 01/08 paga julio; si algún mes liquidara a fin
// de mes (31/07), el día anterior sigue cayendo en el mes correcto.
export function mesCiclo(fechaLiquidacion: Date | string): { anio: number; mes: number; label: string } {
  const d = new Date(aFechaUTC(fechaLiquidacion).getTime() - 86400000)
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, label: `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}` }
}

export function veredictoLiquidacion(l: LiquidacionSinEspejo): { nivel: 'ok' | 'fallo'; texto: string } {
  const f = aFechaUTC(l.fecha).toISOString().slice(0, 10)
  const ciclo = mesCiclo(l.fecha)
  const importe = eur(Math.abs(l.importe))

  if (!l.pan) {
    // Sin nº de tarjeta en el concepto no hay cuenta que mirar: se declara el hueco,
    // no se afirma que el extracto falte.
    return {
      nivel: 'fallo',
      texto: `🔴 Liquidación de tarjeta del ${f} por ${importe} sin espejo en ningún extracto, y el concepto no trae el nº de tarjeta, así que no puedo comprobar si el desglose de ${ciclo.label} está subido → si no lo está, súbeme el PDF «Movimientos de tarjeta» en el chat del agente (📎)`,
    }
  }

  const mask = `****${l.pan.slice(-4)}`
  if (l.comprasCiclo > 0) {
    return {
      nivel: 'ok',
      texto: `✅ Cuadre tarjeta ${mask}: liquidación del ${f} (${importe}) con el desglose de ${ciclo.label} ya importado (${l.comprasCiclo} compras, ${eur(l.sumaCiclo)}); el recibo espejo llegará con el extracto del mes siguiente`,
    }
  }
  return {
    nivel: 'fallo',
    texto: `🔴 No me has subido el extracto de la tarjeta ${mask} con las compras de ${ciclo.label}: te la liquidaron el ${f} por ${importe} y aún no tengo el desglose de esas compras → súbeme el PDF «Movimientos de tarjeta» de ${ciclo.label} en el chat del agente (📎) y lo cuadro solo`,
  }
}
