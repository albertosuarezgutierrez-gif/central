/**
 * La carta de NO RENOVACIÓN (oposición a la prórroga, art. 22 LCS), compuesta
 * a partir de una póliza DECLARADA por el cliente — o sea, una de otra
 * compañía que él mismo subió a la bóveda.
 *
 * Puro: sin BD, sin red, sin fecha implícita. La app le pasa la póliza y el
 * «hoy», y de aquí sale el texto y la lista de lo que FALTA.
 *
 * 🚨 Tres decisiones que no se negocian:
 *
 * 1. **La carta no se envía desde aquí ni desde ningún sitio del portal.** Se
 *    compone, se enseña y la persona la copia, la imprime o la descarga. Es
 *    SU comunicación a SU compañía (art. 22 LCS habla del tomador), no de la
 *    correduría, que ni media esa póliza ni tiene relación con esa entidad.
 *    Regla global de comunicaciones salientes del monorepo, aplicada aquí.
 *
 * 2. **Un dato que no tenemos se deja como HUECO visible, nunca se inventa.**
 *    El portal no conoce el NIF de una identidad (y para una póliza declarada
 *    puede no conocer ni el nombre): esos campos salen como `[TU NIF]`, y la
 *    lista `huecos` se lo dice a la pantalla para que lo avise ANTES de que
 *    alguien mande una carta con corchetes dentro. Misma regla que en todo el
 *    repo: `NULL` es «no se sabe», no un valor plausible.
 *
 * 3. **El plazo se calcula con `fechaAccionable()`**, la misma aritmética que
 *    el calendario (vencimiento − 30 días), y no se reimplementa. Si el plazo
 *    ya pasó, la carta se sigue componiendo —la persona puede querer mandarla
 *    igualmente para el vencimiento siguiente— pero el estado lo DICE.
 */
import { DIAS_PREAVISO_TOMADOR, fechaAccionable } from './obligacion.ts'
import { etiquetaRamo } from './poliza-leida.ts'

const MS_DIA = 86_400_000

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Fecha en letra, en UTC (las columnas `date` llegan como medianoche UTC). */
export function fechaEnLetra(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export type PolizaParaCarta = {
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  fechaVencimiento: Date | null
}

/**
 * Dónde está la persona respecto al plazo del art. 22 LCS.
 *
 * - `sin_fecha`: no sabemos cuándo vence → no se puede decir nada del plazo.
 * - `en_plazo`: todavía puede oponerse a la prórroga (hoy ≤ fecha accionable).
 * - `fuera_de_plazo`: la fecha accionable ya pasó y la póliza aún no ha vencido;
 *   la carta sirve para el vencimiento SIGUIENTE, y hay que decírselo.
 * - `vencida`: la fecha de vencimiento que tenemos ya es pasada. Puede ser que
 *   la póliza se haya prorrogado y la fecha guardada esté vieja: se pide que
 *   la actualice antes de fiarse de nada.
 */
export type EstadoPlazoCarta = 'sin_fecha' | 'en_plazo' | 'fuera_de_plazo' | 'vencida'

export function estadoPlazoCarta(x: { fechaVencimiento: Date | null; hoy: Date }): {
  estado: EstadoPlazoCarta
  /** Último día para comunicar la oposición (`null` si no hay vencimiento). */
  fechaLimite: Date | null
  /** Días que quedan hasta ese último día. Negativo = ya pasó. `null` si no hay fecha. */
  diasRestantes: number | null
} {
  if (!x.fechaVencimiento) return { estado: 'sin_fecha', fechaLimite: null, diasRestantes: null }
  const limite = fechaAccionable(x.fechaVencimiento)
  const hoy = diaUtc(x.hoy)
  const diasRestantes = Math.round((limite.getTime() - hoy.getTime()) / MS_DIA)
  if (diaUtc(x.fechaVencimiento).getTime() < hoy.getTime()) {
    return { estado: 'vencida', fechaLimite: limite, diasRestantes }
  }
  return { estado: diasRestantes >= 0 ? 'en_plazo' : 'fuera_de_plazo', fechaLimite: limite, diasRestantes }
}

/** Los huecos que la carta puede llevar, con la etiqueta que se le enseña a la persona. */
export const HUECOS_CARTA = {
  tomador: '[TU NOMBRE Y APELLIDOS]',
  nif: '[TU NIF]',
  compania: '[NOMBRE DE LA COMPAÑÍA]',
  numeroPoliza: '[NÚMERO DE PÓLIZA]',
  fechaVencimiento: '[FECHA DE VENCIMIENTO]',
  lugar: '[LOCALIDAD]',
} as const

export type HuecoCarta = keyof typeof HUECOS_CARTA

export type CartaNoRenovacion = {
  asunto: string
  /** Texto plano, con saltos de línea. Los huecos van entre corchetes, tal cual `HUECOS_CARTA`. */
  cuerpo: string
  /** Qué se ha dejado en blanco, para que la pantalla lo avise antes de copiar. */
  huecos: HuecoCarta[]
}

/**
 * Compone la carta. `tomador` es el nombre de la identidad si lo sabemos; el
 * NIF y la localidad NUNCA los sabe el portal, así que siempre salen como hueco
 * (y por eso están en la lista aunque no sean parámetros).
 */
export function componerCartaNoRenovacion(x: { poliza: PolizaParaCarta; tomador: string | null; hoy: Date }): CartaNoRenovacion {
  const huecos: HuecoCarta[] = []
  const campo = (valor: string | null | undefined, hueco: HuecoCarta): string => {
    const limpio = valor?.trim()
    if (limpio) return limpio
    huecos.push(hueco)
    return HUECOS_CARTA[hueco]
  }

  const tomador = campo(x.tomador, 'tomador')
  const nif = campo(null, 'nif')
  const compania = campo(x.poliza.compania, 'compania')
  const numero = campo(x.poliza.numeroPoliza, 'numeroPoliza')
  const vence = x.poliza.fechaVencimiento ? fechaEnLetra(x.poliza.fechaVencimiento) : campo(null, 'fechaVencimiento')
  const lugar = campo(null, 'lugar')
  const ramo = etiquetaRamo(x.poliza.ramo)
  const ramoTexto = ramo ? ` del ramo de ${ramo.toLowerCase()}` : ''

  const asunto = `Comunicación de no renovación de la póliza n.º ${numero}`

  const cuerpo = [
    `${lugar}, ${fechaEnLetra(x.hoy)}`,
    '',
    `A la atención de ${compania}`,
    'Departamento de Atención al Cliente',
    '',
    `Asunto: ${asunto}`,
    '',
    'Muy señores míos:',
    '',
    `Yo, ${tomador}, con NIF ${nif}, en calidad de tomador/a de la póliza n.º ${numero}${ramoTexto}, con vencimiento el ${vence}, les comunico mi voluntad de NO PRORROGAR dicho contrato a su vencimiento, conforme a lo previsto en el artículo 22 de la Ley 50/1980, de 8 de octubre, de Contrato de Seguro.`,
    '',
    `Esta comunicación se realiza por escrito y con la antelación mínima de ${DIAS_PREAVISO_TOMADOR === 30 ? 'un mes' : `${DIAS_PREAVISO_TOMADOR} días`} que establece dicho artículo.`,
    '',
    'Les ruego que confirmen por escrito la recepción de esta comunicación y la baja de la póliza con efectos desde la fecha de vencimiento indicada, y que no emitan ningún recibo por periodos posteriores.',
    '',
    'Atentamente,',
    '',
    '',
    tomador,
    `NIF ${nif}`,
  ].join('\n')

  return { asunto, cuerpo, huecos }
}
