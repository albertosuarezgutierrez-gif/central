// Gastos FIJOS: de una plantilla (cuota de comunidad, IBI, hipoteca, gestoría…) a los cargos que deberían
// existir en un rango de fechas. Idea portada de `apps/plataforma/lib/sivra/gastos-fijos.ts` (plantilla con
// `dia_mes` + generador mensual) y de ialimp `propietario_gastos` (periodicidad, recurrente), sin su código.
//
// Reutiliza `generarFechasRecurrente` de @central/module-contabilidad para el PASO (mensual/trimestral/…),
// pero alimentándolo SIEMPRE con el día 1 del mes a mediodía UTC: esa función usa `setMonth` nativo, que desde
// un 31 salta de enero a marzo (31/01 + 1 mes = 03/03) y en un huso local puede cambiar de día. Con el día 1
// no desborda nunca; el día real del cargo (`diaMes`, recortado al último día del mes) se pone después.
//
// La DEDUPLICACIÓN la hace quien persiste (como en ialimp/sivra): cada ocurrencia lleva una clave estable
// `<plantilla>:<YYYY-MM>` que la tabla tiene con índice único; `pendientesDeMaterializar` filtra por esas claves.

import { generarFechasRecurrente } from '@central/module-contabilidad'
import {
  aDateMediodia, deDateMediodia, diasDelMes, fecha, inicioDeMes, maxFecha, mesDe, minFecha, partes, sumarMeses,
  type Fecha,
} from './fechas.ts'
import type { CategoriaGasto, Centimos, PlantillaGasto } from './tipos.ts'

export interface OcurrenciaGasto {
  plantillaId: string
  titularId: string
  inmuebleId: string | null
  categoria: CategoriaGasto
  concepto: string
  fecha: Fecha
  /** `null` = la plantilla no fija importe: se confirma con la factura. Nunca 0. */
  importe: Centimos | null
  /** `<plantilla>:<YYYY-MM>` — clave de deduplicación al persistir. */
  clave: string
}

export function claveOcurrencia(plantillaId: string, f: Fecha): string {
  return `${plantillaId}:${mesDe(f)}`
}

/** Día `diaMes` del mes de `primerDia`, recortado al último día del mes (31 → 30/28/29). */
function diaDelMes(primerDia: Fecha, diaMes: number): Fecha {
  const { y, m } = partes(primerDia)
  return fecha(y, m, Math.min(Math.max(1, Math.trunc(diaMes)), diasDelMes(y, m)))
}

/**
 * Ocurrencias de una plantilla con fecha dentro de `[desde, hasta]` (ambos incluidos) y dentro de su propia
 * vigencia `[inicio, fin]`. Plantilla inactiva → `[]`. El paso arranca en el mes de `inicio`.
 */
export function generarOcurrencias(plantilla: PlantillaGasto, desde: Fecha, hasta: Fecha): OcurrenciaGasto[] {
  if (!plantilla.activo || desde > hasta) return []
  const tope = plantilla.fin ? minFecha(plantilla.fin, hasta) : hasta
  const suelo = maxFecha(plantilla.inicio, desde)
  if (suelo > tope) return []

  const meses = generarFechasRecurrente(
    {
      tipo: 'gasto',
      base_imponible: 0,
      porcentaje_iva: 0,
      periodicidad: plantilla.periodicidad,
      fecha_inicio: aDateMediodia(inicioDeMes(plantilla.inicio)),
    },
    aDateMediodia(inicioDeMes(tope)),
  )

  const out: OcurrenciaGasto[] = []
  for (const dt of meses) {
    const f = diaDelMes(deDateMediodia(dt), plantilla.diaMes)
    if (f < suelo || f > tope) continue
    out.push({
      plantillaId: plantilla.id,
      titularId: plantilla.titularId,
      inmuebleId: plantilla.inmuebleId,
      categoria: plantilla.categoria,
      concepto: plantilla.concepto,
      fecha: f,
      importe: plantilla.importe,
      clave: claveOcurrencia(plantilla.id, f),
    })
  }
  return out
}

/** Las ocurrencias cuya clave NO está ya persistida (idempotente: correr el generador dos veces no duplica). */
export function pendientesDeMaterializar(
  ocurrencias: readonly OcurrenciaGasto[],
  clavesExistentes: ReadonlySet<string>,
): OcurrenciaGasto[] {
  const vistas = new Set<string>()
  const out: OcurrenciaGasto[] = []
  for (const o of ocurrencias) {
    if (clavesExistentes.has(o.clave) || vistas.has(o.clave)) continue
    vistas.add(o.clave)
    out.push(o)
  }
  return out
}

// ─── Derramas de comunidad ───────────────────────────────────────────────────────────────────────────────────

export interface Derrama {
  id: string
  titularId: string
  inmuebleId: string
  concepto: string
  /** Importe TOTAL que le toca al inmueble. */
  total: Centimos
  /** Nº de cuotas mensuales (1 = pago único). */
  cuotas: number
  /** Fecha del primer cargo; los siguientes, el mismo día de cada mes (recortado al fin de mes). */
  primera: Fecha
}

/**
 * Reparte una derrama en cuotas mensuales que SUMAN EXACTAMENTE el total: el resto de la división en céntimos
 * va a la primera cuota (lo habitual es que el administrador redondee al alza la primera).
 * `cuotas` < 1 o no entero, o total no entero/negativo → `[]` (no se inventa un reparto).
 */
export function cuotasDerrama(d: Derrama): OcurrenciaGasto[] {
  if (!Number.isInteger(d.cuotas) || d.cuotas < 1) return []
  if (!Number.isInteger(d.total) || d.total < 0) return []
  const base = Math.floor(d.total / d.cuotas)
  const resto = d.total - base * d.cuotas
  const out: OcurrenciaGasto[] = []
  for (let i = 0; i < d.cuotas; i++) {
    const f = sumarMeses(d.primera, i)
    out.push({
      plantillaId: d.id,
      titularId: d.titularId,
      inmuebleId: d.inmuebleId,
      categoria: 'COMUNIDAD',
      concepto: d.cuotas === 1 ? d.concepto : `${d.concepto} (${i + 1}/${d.cuotas})`,
      fecha: f,
      importe: base + (i === 0 ? resto : 0),
      // Cuota i-ésima, no mes: dos cuotas de la misma derrama nunca comparten clave.
      clave: `${d.id}:${i + 1}`,
    })
  }
  return out
}
