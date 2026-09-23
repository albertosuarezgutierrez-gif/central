// packages/module-seguros/src/aprobaciones.ts
//
// Cola única de aprobaciones (Fase 2 de ASegura OS, pieza 2-c). PURO.
//
// Una aprobación es algo que el sistema PROPONE hacer y que solo se hace si Alberto dice que sí:
// hoy, mandar un correo a un cliente (regla de la casa: ninguna comunicación a un tercero sale sin
// su OK para ESE envío concreto). Qué acciones piden OK, cuáles van solas y cuáles no se hacen nunca
// lo dice la POLÍTICA, en código y no en una tabla: así cambiarla pasa por un PR y un test.
//
// Primer productor: el recibo devuelto. El detector de cartera ve un recibo pasar a `devuelto`, y
// aquí se redacta el aviso al cliente con el reloj del art. 15 LCS (`retencion()`).

import { retencion } from './retencion.ts'

export const ACCIONES_APROBACION = ['enviar_correo_cliente'] as const
export type AccionAprobacion = (typeof ACCIONES_APROBACION)[number]

export type Politica = 'auto' | 'aprobar' | 'prohibido'

/** Qué hace el sistema con cada acción. Relajar una a `auto` es una decisión de Alberto, por PR. */
export const POLITICA: Readonly<Record<AccionAprobacion, Politica>> = {
  enviar_correo_cliente: 'aprobar',
}

export const ESTADOS_APROBACION = ['pendiente', 'enviando', 'ejecutada', 'rechazada', 'caducada', 'fallida'] as const
export type EstadoAprobacion = (typeof ESTADOS_APROBACION)[number]

/** Una propuesta que nadie mira en una semana ya no es la misma propuesta: caduca, no se ejecuta. */
export const DIAS_CADUCIDAD = 7

export function caducaEn(ahora: Date, dias = DIAS_CADUCIDAD): Date {
  return new Date(ahora.getTime() + dias * 86_400_000)
}

export type EntradaReciboDevuelto = {
  ramo: string | null
  compania: string | null
  numeroPoliza: string | null
  /** Importe del recibo en euros; `null` = no consta (no se escribe ninguna cifra). */
  importe: number | null
  /** Vencimiento del RECIBO, `YYYY-MM-DD`. */
  vencimiento: string | null
  hoy: Date
}

/**
 * `caduca`: hasta cuándo es VERDAD el texto. «Está a tiempo hasta el X» deja de serlo el día X, así
 * que la propuesta caduca entonces aunque no hayan pasado los 7 días: un texto que ya miente no se
 * puede aprobar.
 */
export type Borrador = { asunto: string; texto: string; urgente: boolean; caduca: Date }

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

function masDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

/**
 * El aviso al cliente de un recibo devuelto. `null` si ya no toca avisar: pasados 6 meses el
 * contrato está extinguido (art. 15 LCS) y lo que hay que hacer es una póliza nueva, no un recordatorio.
 *
 * Sin el número de póliza entero (solo sus últimas cifras): la dirección la teclea una persona y
 * puede ser la de otro.
 */
export function borradorReciboDevuelto(e: EntradaReciboDevuelto): Borrador | null {
  // Sin fecha no se sabe si el impago es de ayer o de hace años (el volcado trae recibos viejos sin
  // fecha): eso se mira en el portal de la compañía, no se le escribe al cliente a ciegas.
  if (!e.vencimiento) return null
  const r = retencion(e.vencimiento, 'devuelto', e.hoy)
  if (r.estado === 'extinguida' || r.estado === 'sin_fecha') return null
  const seguro = ['seguro', e.ramo ? `de ${e.ramo}` : null, e.compania ? `con ${e.compania}` : null].filter(Boolean).join(' ')
  const cola = e.numeroPoliza && e.numeroPoliza.length > 4 ? ` (póliza terminada en ${e.numeroPoliza.slice(-4)})` : ''
  const importe = e.importe !== null ? ` de ${eur(e.importe)}` : ''
  const venc = e.vencimiento ? `, con vencimiento el ${fechaEs(e.vencimiento)},` : ''

  const lineas = [
    'Hola:',
    '',
    `La compañía nos avisa de que el banco ha devuelto el recibo${importe} de su ${seguro}${cola}${venc} así que no consta pagado.`,
    '',
  ]
  if (r.estado === 'en_plazo' && e.vencimiento) {
    lineas.push(`Está a tiempo: si se paga antes del ${fechaEs(masDias(e.vencimiento, 30))}, la cobertura no se interrumpe.`)
  } else if (r.estado === 'suspendida' && e.vencimiento) {
    lineas.push(
      `Al pasar un mes sin pagarse, la cobertura queda en suspenso desde el ${fechaEs(masDias(e.vencimiento, 30))} (art. 15 de la Ley de Contrato de Seguro). ` +
        'En cuanto se pague, vuelve a estar cubierto a las 24 horas.',
    )
  } else {
    lineas.push('Si pasa un mes desde el vencimiento sin pagarse, la cobertura queda en suspenso (art. 15 de la Ley de Contrato de Seguro).')
  }
  lineas.push('', 'Responda a este correo o llámenos y le decimos cómo pagarlo. Si ya lo ha pagado, ignore este mensaje.', '', 'Un saludo,', 'Grupo ASegura')

  // Medianoche de Madrid del día límite, cogida con margen (UTC+2): antes, nunca después.
  const finPlazo = new Date(Date.parse(`${masDias(e.vencimiento, 30)}T00:00:00Z`) - 2 * 3_600_000)
  const semana = caducaEn(e.hoy)
  return {
    caduca: r.estado === 'en_plazo' && finPlazo < semana ? finPlazo : semana,
    asunto: r.estado === 'suspendida' ? 'Su seguro está en suspenso por un recibo devuelto' : 'Recibo de su seguro devuelto por el banco',
    texto: lineas.join('\n'),
    urgente: r.estado === 'suspendida',
  }
}

export type Decision =
  | { decision: 'aprobar'; asunto: string; texto: string }
  | { decision: 'rechazar' }
  /** Un envío que se quedó a medias: Alberto ha mirado en el proveedor si salió o no. */
  | { decision: 'cerrar_incierto'; salio: boolean }

/** Valida lo que llega del corredor: puede retocar asunto y texto, nunca vaciarlos. */
export function decisionValida(v: unknown): Decision | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.decision === 'rechazar') return { decision: 'rechazar' }
  if (o.decision === 'cerrar_incierto') return typeof o.salio === 'boolean' ? { decision: 'cerrar_incierto', salio: o.salio } : null
  if (o.decision !== 'aprobar') return null
  const asunto = typeof o.asunto === 'string' ? o.asunto.replace(/[\r\n]+/g, ' ').trim() : ''
  const texto = typeof o.texto === 'string' ? o.texto.trim() : ''
  if (!asunto || asunto.length > 200 || !texto || texto.length > 5000) return null
  return { decision: 'aprobar', asunto, texto }
}
