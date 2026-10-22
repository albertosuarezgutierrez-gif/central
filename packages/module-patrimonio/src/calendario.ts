// Calendario de OBLIGACIONES del patrimonio: lo que vence (ITE/IEE, certificado energético, revisiones, fin de
// contrato, fianza, seguro del inquilino, actualización de renta) y desde cuándo hay que avisar.
//
// 🚨 `hoy` se inyecta. 🚨 Sin fecha no hay «al día»: `sin_dato` es un estado propio y la pantalla lo dice
// («no sabemos cuándo te toca: dinos la fecha de la última»), nunca 🟢.
// 🚨 Las periodicidades legales cambian por comunidad autónoma y municipio (la ITE de Sevilla no es la de Madrid;
// la del ascensor depende del nº de plantas y viviendas): el catálogo trae un valor por defecto SOLO donde la norma
// es estatal y estable (certificado energético 10 años; gas 5 años). En el resto la periodicidad es `null` y se
// pide la fecha al cliente. Cada obligación puede traer su propia periodicidad, que manda sobre el catálogo.

import { diasEntre, sumarDias, sumarMeses, type Fecha } from './fechas.ts'
import { finEfectivo } from './contrato.ts'
import { proximoAniversarioActualizacion } from './actualizacion-renta.ts'
import type { Contrato } from './tipos.ts'

export type TipoObligacion =
  | 'ite_iee'
  | 'certificado_energetico'
  | 'revision_gas'
  | 'inspeccion_ascensor'
  | 'boletin_electrico'
  | 'fin_contrato'
  | 'deposito_fianza'
  | 'devolucion_fianza'
  | 'seguro_inquilino'
  | 'actualizacion_renta'
  | 'otra'

export interface ReglaObligacion {
  etiqueta: string
  /** Periodicidad por defecto en meses; `null` = depende de la normativa local: se pide la fecha. */
  periodicidadMeses: number | null
  /** Días antes del vencimiento desde los que se avisa. */
  avisoDias: number
  /** De dónde sale la periodicidad (se enseña en la pantalla). */
  fuente: string
}

export const CATALOGO_OBLIGACIONES: Readonly<Record<TipoObligacion, ReglaObligacion>> = Object.freeze({
  ite_iee: { etiqueta: 'Inspección técnica del edificio (ITE/IEE)', periodicidadMeses: null, avisoDias: 180, fuente: 'Ordenanza municipal / norma autonómica: varía.' },
  certificado_energetico: { etiqueta: 'Certificado de eficiencia energética', periodicidadMeses: 120, avisoDias: 90, fuente: 'RD 390/2021, art. 13: validez máxima 10 años (5 si la calificación es G: pásalo en periodicidadMeses).' },
  revision_gas: { etiqueta: 'Inspección periódica de la instalación de gas', periodicidadMeses: 60, avisoDias: 60, fuente: 'RD 919/2006 (ITC-ICG 07): cada 5 años.' },
  inspeccion_ascensor: { etiqueta: 'Inspección periódica del ascensor', periodicidadMeses: null, avisoDias: 60, fuente: 'RD 355/2024 y norma autonómica: depende del edificio.' },
  boletin_electrico: { etiqueta: 'Boletín / certificado de la instalación eléctrica', periodicidadMeses: null, avisoDias: 60, fuente: 'REBT: en vivienda no caduca salvo reforma; se pide si la compañía lo exige.' },
  fin_contrato: { etiqueta: 'Fin del periodo pactado del contrato', periodicidadMeses: null, avisoDias: 150, fuente: 'LAU art. 9 y 10: prórroga obligatoria y preaviso de 4 meses (arrendador) / 2 (arrendatario).' },
  deposito_fianza: { etiqueta: 'Depósito de la fianza', periodicidadMeses: null, avisoDias: 15, fuente: 'LAU art. 36 y norma autonómica: plazo variable.' },
  devolucion_fianza: { etiqueta: 'Devolución de la fianza', periodicidadMeses: null, avisoDias: 15, fuente: 'LAU art. 36.4: un mes desde la entrega de llaves.' },
  seguro_inquilino: { etiqueta: 'Recibo del seguro del inquilino', periodicidadMeses: 12, avisoDias: 30, fuente: 'Cláusula del contrato.' },
  actualizacion_renta: { etiqueta: 'Actualización anual de la renta', periodicidadMeses: 12, avisoDias: 30, fuente: 'LAU art. 18 y cláusula del contrato.' },
  otra: { etiqueta: 'Otra obligación', periodicidadMeses: null, avisoDias: 30, fuente: 'Declarada por el cliente.' },
})

/** Obligación de INMUEBLE declarada por el cliente (o precargada del Catastro/edificio). */
export interface ObligacionInmueble {
  id: string
  inmuebleId: string
  tipo: TipoObligacion
  /** ¿Aplica a este inmueble? `false` = no aplica (no sale); `null` = no se sabe (sale como `sin_dato`). */
  aplica: boolean | null
  /** Última vez que se hizo. */
  ultima: Fecha | null
  /** Vencimiento explícito (manda sobre `ultima` + periodicidad). */
  vence: Fecha | null
  /** Periodicidad propia en meses (manda sobre el catálogo). */
  periodicidadMeses: number | null
}

export type EstadoObligacion = 'vencida' | 'avisar' | 'sin_dato' | 'al_dia' | 'cumplida'

export interface Vencimiento {
  /** Estable por obligación y ciclo: sirve de id del aviso (no avisar dos veces de lo mismo). */
  clave: string
  tipo: TipoObligacion
  etiqueta: string
  inmuebleId: string
  contratoId: string | null
  vence: Fecha | null
  avisarDesde: Fecha | null
  estado: EstadoObligacion
  /** Días hasta `vence` (negativo = pasada). `null` sin fecha. */
  dias: number | null
  /** Qué falta cuando es `sin_dato`. */
  falta: string | null
}

export function estadoPorFecha(vence: Fecha | null, avisarDesde: Fecha | null, hoy: Fecha): EstadoObligacion {
  if (!vence || !avisarDesde) return 'sin_dato'
  if (hoy > vence) return 'vencida'
  if (hoy >= avisarDesde) return 'avisar'
  return 'al_dia'
}

function vencimiento(
  base: Omit<Vencimiento, 'estado' | 'dias' | 'avisarDesde' | 'etiqueta'>,
  hoy: Fecha,
  avisoDias?: number,
): Vencimiento {
  const regla = CATALOGO_OBLIGACIONES[base.tipo]
  const avisarDesde = base.vence ? sumarDias(base.vence, -(avisoDias ?? regla.avisoDias)) : null
  return {
    ...base,
    etiqueta: regla.etiqueta,
    avisarDesde,
    estado: estadoPorFecha(base.vence, avisarDesde, hoy),
    dias: base.vence ? diasEntre(hoy, base.vence) : null,
  }
}

export function vencimientoDeObligacion(o: ObligacionInmueble, hoy: Fecha): Vencimiento | null {
  if (o.aplica === false) return null
  const per = o.periodicidadMeses ?? CATALOGO_OBLIGACIONES[o.tipo].periodicidadMeses
  let vence: Fecha | null = o.vence
  if (!vence && o.ultima && per) vence = sumarMeses(o.ultima, per)
  let falta: string | null = null
  if (!vence) {
    if (o.aplica === null) falta = 'No sabemos si este inmueble la necesita.'
    else if (!o.ultima) falta = 'Falta la fecha de la última vez.'
    else falta = 'Falta cada cuánto toca (depende de tu municipio o edificio).'
  }
  return vencimiento(
    { clave: `${o.id}:${vence ?? 'sin_fecha'}`, tipo: o.tipo, inmuebleId: o.inmuebleId, contratoId: null, vence, falta },
    hoy,
  )
}

export interface OpcionesContrato {
  /** Plazo para depositar la fianza desde la firma (depende de la comunidad autónoma). Def. 30 días. */
  plazoDepositoFianzaDias?: number
}

/** Obligaciones que nacen de un CONTRATO (fin, fianza, seguro del inquilino, actualización de renta). */
export function vencimientosDeContrato(c: Contrato, hoy: Fecha, op: OpcionesContrato = {}): Vencimiento[] {
  const out: Vencimiento[] = []
  const terminado = c.terminadoEn !== null && hoy > c.terminadoEn
  const base = { inmuebleId: c.inmuebleId, contratoId: c.id }

  if (!terminado) {
    // Fin del periodo pactado. Sin `fin` no se inventa: `sin_dato`.
    out.push(vencimiento({ ...base, clave: `${c.id}:fin:${c.fin ?? 'sin_fecha'}`, tipo: 'fin_contrato', vence: c.fin, falta: c.fin ? null : 'El contrato no tiene fecha de fin.' }, hoy))

    if (c.clausula.tipo === 'indice') {
      const aniv = proximoAniversarioActualizacion(c)
      out.push(vencimiento({ ...base, clave: `${c.id}:actualizacion:${aniv}`, tipo: 'actualizacion_renta', vence: aniv, falta: null }, hoy))
    }

    if (c.seguroInquilino?.exigido) {
      const v = c.seguroInquilino.venceRecibo
      out.push(vencimiento({ ...base, clave: `${c.id}:seguro:${v ?? 'sin_fecha'}`, tipo: 'seguro_inquilino', vence: v, falta: v ? null : 'El inquilino no ha aportado el recibo del seguro.' }, hoy))
    }
  }

  if (c.fianza) {
    if (c.fianza.depositadaEn) {
      out.push({
        clave: `${c.id}:deposito`, tipo: 'deposito_fianza', etiqueta: CATALOGO_OBLIGACIONES.deposito_fianza.etiqueta,
        ...base, vence: c.fianza.depositadaEn, avisarDesde: null, estado: 'cumplida', dias: null, falta: null,
      })
    } else if (!terminado) {
      const v = sumarDias(c.inicio, op.plazoDepositoFianzaDias ?? 30)
      out.push(vencimiento({ ...base, clave: `${c.id}:deposito`, tipo: 'deposito_fianza', vence: v, falta: null }, hoy))
    }
    const finReal = c.terminadoEn ? finEfectivo(c) : null
    if (finReal && !c.fianza.devueltaEn) {
      const v = sumarDias(finReal, 30)
      out.push(vencimiento({ ...base, clave: `${c.id}:devolucion`, tipo: 'devolucion_fianza', vence: v, falta: null }, hoy))
    }
  }
  return out
}

const ORDEN_ESTADO: Record<EstadoObligacion, number> = { vencida: 0, avisar: 1, sin_dato: 2, al_dia: 3, cumplida: 4 }

/** Ordena para la pantalla: vencidas → a avisar → sin dato → al día → cumplidas; dentro, por fecha. */
export function ordenarCalendario(vs: readonly Vencimiento[]): Vencimiento[] {
  return [...vs].sort((a, b) => {
    const e = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
    if (e !== 0) return e
    if (a.vence && b.vence) return a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0
    return a.vence ? -1 : b.vence ? 1 : 0
  })
}

export function calendarioPatrimonio(
  entrada: { obligaciones: readonly ObligacionInmueble[]; contratos: readonly Contrato[] },
  hoy: Fecha,
  op: OpcionesContrato = {},
): Vencimiento[] {
  const out: Vencimiento[] = []
  for (const o of entrada.obligaciones) {
    const v = vencimientoDeObligacion(o, hoy)
    if (v) out.push(v)
  }
  for (const c of entrada.contratos) out.push(...vencimientosDeContrato(c, hoy, op))
  return ordenarCalendario(out)
}
