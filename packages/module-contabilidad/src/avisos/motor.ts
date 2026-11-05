// Motor PURO de reglas de aviso: recibe datos ya calculados y un «hoy» inyectado, devuelve avisos con CLAVE de deduplicación.
// No envía nada a nadie: quien lo use guarda los avisos en la app (tabla `avisos`, única por (empresa, clave)). El canal externo
// (push/correo) es una interfaz NO conectada (`CanalAviso`).
//
// 🚨 Tres estados: sin datos suficientes NO se avisa (no se puede afirmar una caída con un mes en blanco ni con base 0).
import { aFechaISO, diasEntre } from '../analisis/periodos.ts'
import type { PuntoSerie } from '../analisis/series.ts'
import type { Prevision } from '../analisis/prevision.ts'
import { avisosFiscalesDeHoy, type FormaEmpresa } from './fiscal.ts'

export type TipoAviso = 'fiscal' | 'ventas' | 'margen' | 'tesoreria' | 'hechos' | 'efectivo'
export type Severidad = 'info' | 'aviso' | 'alerta'

export type Aviso = {
  /** Clave de deduplicación: el mismo hecho avisado dos veces = un solo aviso. */
  clave: string
  tipo: TipoAviso
  severidad: Severidad
  titulo: string
  detalle: string
  /** Fecha a la que se refiere (vencimiento, primer saldo negativo…), ISO. */
  fechaRef: string | null
  /** Pantalla donde se resuelve. */
  enlace: string | null
}

export const UMBRAL_CAIDA_PCT = 20
export const MESES_MEDIA = 3

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')
const eur = (c: number) => {
  const neg = c < 0
  const abs = Math.abs(c)
  return `${neg ? '-' : ''}${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(abs % 100).padStart(2, '0')}€`
}

export function avisosCalendarioFiscal(hoy: Date, forma: FormaEmpresa): Aviso[] {
  return avisosFiscalesDeHoy(hoy, forma).map(({ vencimiento: v, diasRestantes: d, umbral }): Aviso => ({
    clave: `fiscal:${v.id}:${umbral}`,
    tipo: 'fiscal',
    severidad: umbral === 1 ? 'alerta' : umbral === 5 ? 'aviso' : 'info',
    titulo: d === 0 ? `Vence hoy: ${v.titulo}` : `${d === 1 ? 'Mañana' : `En ${d} días`} vence: ${v.titulo}`,
    detalle: `Modelos ${v.modelos}. Plazo hasta el ${fechaEs(v.fecha)} (si cae en festivo o fin de semana pasa al siguiente día hábil). Recordatorio orientativo: confírmalo con tu gestor.`,
    fechaRef: v.fecha,
    enlace: '/informes',
  }))
}

/**
 * Caída de ventas o de margen del ÚLTIMO mes completo frente a la media de los 3 meses anteriores (umbral relativo, 20 % por defecto).
 * `meses` = serie MENSUAL (más antigua → más reciente) cuyo último punto contiene `hoy`; el mes en curso no se evalúa (está a medias).
 */
export function avisosCaida(meses: readonly PuntoSerie[], hoy: Date, umbralPct = UMBRAL_CAIDA_PCT): Aviso[] {
  if (!(umbralPct > 0 && umbralPct < 100)) throw new RangeError('umbralPct entre 0 y 100')
  const h = aFechaISO(hoy)
  const completos = meses.filter((m) => m.hasta < h)
  if (completos.length < MESES_MEDIA + 1) return []
  const ultimo = completos[completos.length - 1]
  const previos = completos.slice(-(MESES_MEDIA + 1), -1)
  const salida: Aviso[] = []
  const media = (xs: (number | null)[]): number | null => (xs.some((x) => x === null) ? null : xs.reduce<number>((t, x) => t + (x as number), 0) / xs.length)

  const mediaVentas = media(previos.map((p) => p.ventas))
  if (ultimo.ventas !== null && mediaVentas !== null && mediaVentas > 0) {
    const caida = ((mediaVentas - ultimo.ventas) * 100) / mediaVentas
    if (caida > umbralPct) {
      salida.push({
        clave: `ventas:${ultimo.clave}`, tipo: 'ventas', severidad: caida > umbralPct * 2 ? 'alerta' : 'aviso',
        titulo: `Las ventas de ${ultimo.etiqueta} caen un ${Math.round(caida)} % frente a la media`,
        detalle: `${eur(ultimo.ventas)} frente a una media de ${eur(Math.round(mediaVentas))} de los ${MESES_MEDIA} meses anteriores.`,
        fechaRef: ultimo.hasta, enlace: '/evolucion',
      })
    }
  }
  const mediaMargen = media(previos.map((p) => p.margenPct))
  if (ultimo.margenPct !== null && mediaMargen !== null && mediaMargen > 0) {
    const caida = ((mediaMargen - ultimo.margenPct) * 100) / mediaMargen
    if (caida > umbralPct) {
      salida.push({
        clave: `margen:${ultimo.clave}`, tipo: 'margen', severidad: caida > umbralPct * 2 ? 'alerta' : 'aviso',
        titulo: `El margen de ${ultimo.etiqueta} cae un ${Math.round(caida)} % frente a la media`,
        detalle: `${ultimo.margenPct} % frente a una media del ${Math.round(mediaMargen * 10) / 10} % de los ${MESES_MEDIA} meses anteriores.`,
        fechaRef: ultimo.hasta, enlace: '/rentabilidad',
      })
    }
  }
  return salida
}

/** Saldo de caja previsto negativo dentro del horizonte. Sin previsión (`null`) no se avisa: no hay base. */
export function avisoTesoreriaNegativa(prevision: Prevision | null): Aviso[] {
  if (!prevision || prevision.primerNegativo === null) return []
  return [{
    clave: `tesoreria:${prevision.primerNegativo}`, tipo: 'tesoreria', severidad: 'alerta',
    titulo: `Saldo de caja previsto negativo el ${fechaEs(prevision.primerNegativo)}`,
    detalle: `Saldo mínimo previsto en los próximos ${prevision.horizonteDias} días: ${eur(prevision.saldoMinimo)}. La previsión usa los cobros y pagos pendientes con un plazo estimado.`,
    fechaRef: prevision.primerNegativo, enlace: '/evolucion',
  }]
}

/** Hechos que las verticales mandaron y no se pudieron asentar. `null` = no se ha podido contar (no se afirma nada). */
export function avisoHechosRechazados(rechazados: number | null, pendientes: number | null): Aviso[] {
  const out: Aviso[] = []
  if (rechazados !== null && rechazados > 0) {
    out.push({
      clave: `hechos:rechazados:${rechazados}`, tipo: 'hechos', severidad: 'alerta',
      titulo: `${rechazados} ${rechazados === 1 ? 'hecho rechazado' : 'hechos rechazados'} por el libro`,
      detalle: 'Una aplicación envió movimientos que no se pudieron traducir a asiento (importes incoherentes). Revísalos con quien los envía.',
      fechaRef: null, enlace: '/asientos/nuevo',
    })
  }
  if (pendientes !== null && pendientes > 0) {
    out.push({
      clave: `hechos:pendientes:${pendientes}`, tipo: 'hechos', severidad: 'aviso',
      titulo: `${pendientes} ${pendientes === 1 ? 'hecho por clasificar' : 'hechos por clasificar'}`,
      detalle: 'Movimientos recibidos que esperan una regla de asiento o un ejercicio abierto. Ajusta las reglas en Ajustes.',
      fechaRef: null, enlace: '/ajustes/reglas',
    })
  }
  return out
}

/** Límite de cobros en efectivo que avisamos (1.000 €, en céntimos) [Probable: validar el límite vigente con el asesor]. */
export const LIMITE_EFECTIVO_CENT = 100_000

/** Cobros en efectivo de importe ≥ límite entre los hechos recibidos: un aviso por cobro (clave = referencia). */
export function avisosEfectivo(cobros: readonly { ref: string; fecha: string; importe: number }[], limite = LIMITE_EFECTIVO_CENT): Aviso[] {
  return cobros.filter((c) => c.importe >= limite).map((c): Aviso => ({
    clave: `efectivo:${c.ref}`, tipo: 'efectivo', severidad: 'aviso',
    titulo: `Cobro en efectivo de ${eur(c.importe)} (${c.ref})`,
    detalle: `Hay un límite legal para los pagos en efectivo en operaciones empresariales (hoy 1.000 €). Confirma con tu gestor que este cobro es válido.`,
    fechaRef: c.fecha, enlace: '/',
  }))
}

export type EntradaAvisos = {
  hoy: Date
  forma: FormaEmpresa
  /** Serie mensual (último punto = mes de `hoy`), o null si no se pudo calcular. */
  mensual: readonly PuntoSerie[] | null
  prevision: Prevision | null
  hechosRechazados: number | null
  hechosPendientes: number | null
  /** Cobros en efectivo recientes (los que lleguen ≥ límite avisan). */
  cobrosEfectivo?: readonly { ref: string; fecha: string; importe: number }[]
  umbralCaidaPct?: number
}

/** Todos los avisos que corresponden HOY. La clave evita repetirlos (la tabla es única por empresa y clave). */
export function evaluarAvisos(e: EntradaAvisos): Aviso[] {
  return [
    ...avisosCalendarioFiscal(e.hoy, e.forma),
    ...(e.mensual ? avisosCaida(e.mensual, e.hoy, e.umbralCaidaPct) : []),
    ...avisoTesoreriaNegativa(e.prevision),
    ...avisoHechosRechazados(e.hechosRechazados, e.hechosPendientes),
    ...avisosEfectivo(e.cobrosEfectivo ?? []),
  ]
}

/** Interfaz del canal externo (push/correo/Telegram a Alberto o al gestor). NO está conectada: hoy los avisos solo viven en la app. */
export interface CanalAviso {
  enviar(destino: { empresaId: string }, aviso: Aviso): Promise<void>
}

/** Canal que no envía nada (el único que hay hasta que Alberto apruebe un canal real). */
export const canalNoConectado: CanalAviso = { async enviar() { /* a propósito: nada sale a nadie */ } }

export { diasEntre }
