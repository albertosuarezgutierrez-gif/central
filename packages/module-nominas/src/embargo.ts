/**
 * Embargo de salario (art. 607 LEC), en céntimos. La parte hasta 1 SMI es inembargable; el resto, por tramos de múltiplos
 * del SMI: (1,2] 30 % · (2,3] 50 % · (3,4] 60 % · (4,5] 75 % · >5 90 %. Se aplica al LÍQUIDO percibido (tras SS e IRPF).
 * SMI: el del año (tabla N0). Pagas 12 o 14 prorrateadas → SMI anual/12 (1.424,50 € en 2026); 14 pagas sin prorrata →
 * SMI mensual de 14 pagas (1.221 €); la paga extra cobrada en su mes cuenta como UNA PERCEPCIÓN APARTE con el SMI de 14 pagas
 * (criterio sin contrastar → regla `embargo_paga_extra`, bloquea en modo cálculo).
 */
import { cifra, CifraPendienteError, type Cifra } from './cifras'
import { aplicarTipo, esCentimos, type Centimos, type Ppm } from './dinero'
import { tablaDelAño, type TablaAnual } from './tablas'

const F = 'LEC art. 607.2 [norma estable; sin contrastar con BOE desde el contenedor]'
export const ESCALA_EMBARGO_607: { hastaSmi: number | null; tipo: Cifra<Ppm> }[] = [
  { hastaSmi: 1, tipo: cifra('embargo_607_t0', 0, 'probable', `${F}: hasta 1 SMI inembargable`) },
  { hastaSmi: 2, tipo: cifra('embargo_607_t1', 300_000, 'probable', `${F}: 30 %`) },
  { hastaSmi: 3, tipo: cifra('embargo_607_t2', 500_000, 'probable', `${F}: 50 %`) },
  { hastaSmi: 4, tipo: cifra('embargo_607_t3', 600_000, 'probable', `${F}: 60 %`) },
  { hastaSmi: 5, tipo: cifra('embargo_607_t4', 750_000, 'probable', `${F}: 75 %`) },
  { hastaSmi: null, tipo: cifra('embargo_607_t5', 900_000, 'probable', `${F}: 90 %`) },
]

export interface ResultadoEmbargo {
  percibido: Centimos
  embargable: Centimos
  inembargable: Centimos
}

/** Embargo de UNA percepción con el SMI de referencia dado (céntimos). */
export function calcularEmbargo(percibido: Centimos, smi: Centimos): ResultadoEmbargo {
  if (!esCentimos(percibido) || percibido < 0) throw new Error('percibido debe ser céntimos enteros ≥ 0')
  if (!esCentimos(smi) || smi <= 0) throw new Error('smi debe ser céntimos enteros > 0')
  let desde = 0
  let numerador = 0
  for (const t of ESCALA_EMBARGO_607) {
    const techo = t.hastaSmi === null ? Infinity : t.hastaSmi * smi
    const tipo = t.tipo.valor as number
    if (percibido > desde) numerador += (Math.min(percibido, techo) - desde) * tipo
    desde = techo
    if (percibido <= techo) break
  }
  const embargable = Math.min(percibido, Math.round(numerador / 1_000_000))
  return { percibido, embargable, inembargable: percibido - embargable }
}

export interface EntradaEmbargo {
  año: number
  /** Líquido de la nómina ordinaria del mes. */
  netoOrdinario: Centimos
  /** Líquido de la paga extra cobrada en este mes (0 si no hay). */
  netoPagaExtra?: Centimos
  pagas: 12 | 14
  prorrataExtras: boolean
  modo: 'calculo' | 'simulacion'
  tabla?: TablaAnual
}

export function embargoDeNomina(e: EntradaEmbargo): { ordinaria: ResultadoEmbargo; pagaExtra: ResultadoEmbargo | null; embargableTotal: Centimos; cifrasPendientes: string[] } {
  const tabla = e.tabla ?? tablaDelAño(e.año)
  if (tabla.smi.mensual.valor === null || tabla.smi.anual.valor === null) throw new Error('SMI sin valor conocido: no se puede calcular el embargo')
  const smiMensual14 = tabla.smi.mensual.valor
  const smiOrdinario = e.pagas === 14 && !e.prorrataExtras ? smiMensual14 : Math.round(tabla.smi.anual.valor / 12)
  const pend = new Set<string>()
  for (const c of [tabla.smi.mensual, tabla.smi.anual, ...ESCALA_EMBARGO_607.map(t => t.tipo)]) if (c.certeza === 'PENDIENTE_VERIFICAR') pend.add(c.clave)
  const ordinaria = calcularEmbargo(e.netoOrdinario, smiOrdinario)
  let pagaExtra: ResultadoEmbargo | null = null
  if ((e.netoPagaExtra ?? 0) > 0) {
    pend.add('regla:embargo_paga_extra')
    pagaExtra = calcularEmbargo(e.netoPagaExtra as number, smiMensual14)
  }
  const cifrasPendientes = [...pend].sort()
  if (e.modo === 'calculo' && cifrasPendientes.length) throw new CifraPendienteError(cifrasPendientes)
  return { ordinaria, pagaExtra, embargableTotal: ordinaria.embargable + (pagaExtra?.embargable ?? 0), cifrasPendientes }
}
