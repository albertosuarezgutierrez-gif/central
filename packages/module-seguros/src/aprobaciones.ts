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

export const ACCIONES_APROBACION = ['enviar_correo_cliente', 'enviar_correo_compania'] as const
export type AccionAprobacion = (typeof ACCIONES_APROBACION)[number]

export type Politica = 'auto' | 'aprobar' | 'prohibido'

/** Qué hace el sistema con cada acción. Relajar una a `auto` es una decisión de Alberto, por PR. */
export const POLITICA: Readonly<Record<AccionAprobacion, Politica>> = {
  enviar_correo_cliente: 'aprobar',
  // Comunicar una anulación firmada a la compañía (pieza 2-d-3): la carta sale en nombre del tomador.
  enviar_correo_compania: 'aprobar',
}

/**
 * La ÚNICA excepción a «aprobar» (dictada por Alberto el 26/09/2026: «envío automático al firmar»):
 * la carta de baja que el propio cliente FIRMA en su portal sale sola hacia su compañía, sin pasar por
 * «Hoy». El OK de ese envío concreto lo da la firma del tomador, que es quien tiene que oponerse a la
 * prórroga (art. 22 LCS). Tres condiciones, y si falta una la carta se queda en la cola como siempre:
 *   · tipo `no_renovacion` o `sustitucion` — una `inmediata` corta una cobertura en curso (extorno,
 *     posible hueco sin seguro) y esa la mira Alberto;
 *   · firma electrónica guardada (carta + huella), que es lo que se adjunta;
 *   · la compañía tiene un buzón de anulaciones RECORDADO (`buzonSugerido`): el primero lo elige
 *     Alberto en la tarjeta y queda guardado; el sistema nunca adivina a qué dirección escribir.
 */
export const TIPOS_ANULACION_ENVIO_SOLO = ['no_renovacion', 'sustitucion'] as const

export function anulacionSeEnviaSola(tipo: string, buzon: string | null): boolean {
  return (TIPOS_ANULACION_ENVIO_SOLO as readonly string[]).includes(tipo) && buzon !== null
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

export type EntradaAnulacionCompania = {
  tomador: string
  compania: string
  numeroPoliza: string
  tipo: 'no_renovacion' | 'inmediata' | 'sustitucion'
  /** `YYYY-MM-DD`. */
  fechaEfecto: string
  /** Cuándo firmó el cliente, `YYYY-MM-DD`. */
  firmadaEl: string
  /** Huella SHA-256 del texto firmado (la de `seguros.firma.doc_hash`). */
  docHash: string
  mediador: string
  hoy: Date
}

/**
 * El correo a la compañía con la anulación firmada (pieza 2-d-3). La carta firmada va ADJUNTA y no
 * se edita (su huella es la de la firma); esto es solo la nota que la acompaña.
 *
 * Caduca con la fecha de efecto (pasada, ya no hay nada que anular a tiempo) y como mucho a 30 días:
 * una comunicación a la compañía no se pierde a la semana como un aviso al cliente.
 */
export function borradorAnulacionCompania(e: EntradaAnulacionCompania): Borrador {
  const que = e.tipo === 'no_renovacion'
    ? `su oposición a la prórroga de la póliza, con efecto al vencimiento del ${fechaEs(e.fechaEfecto)}`
    : `la anulación de la póliza con efecto el ${fechaEs(e.fechaEfecto)}`
  const texto = [
    'Buenos días:',
    '',
    `En nombre de nuestro cliente ${e.tomador}, tomador de la póliza nº ${e.numeroPoliza}, les trasladamos ${que}.`,
    '',
    `Adjuntamos la solicitud firmada por el tomador el ${fechaEs(e.firmadaEl)} con firma electrónica avanzada ` +
      `(huella SHA-256 del texto firmado: ${e.docHash}; la respalda el fichero de texto adjunto).`,
    '',
    'Les rogamos que confirmen la recepción y la fecha en que queda anulada.',
    '',
    'Un saludo,',
    e.mediador,
  ].join('\n')
  const efecto = new Date(Date.parse(`${e.fechaEfecto}T00:00:00Z`) - 2 * 3_600_000)
  const mes = caducaEn(e.hoy, 30)
  // Un efecto pasado o de hoy (anulación inmediata con efecto retroactivo) se propone igual, con unos
  // días para decidir: si caducara al nacer, desaparecería sin que nadie la viera.
  const minimo = caducaEn(e.hoy, 3)
  const dias = (Date.parse(`${e.fechaEfecto}T00:00:00Z`) - e.hoy.getTime()) / 86_400_000
  const caduca = efecto < mes ? efecto : mes
  return {
    asunto: `Solicitud de ${e.tipo === 'no_renovacion' ? 'no renovación' : 'anulación'} · póliza nº ${e.numeroPoliza} · ${e.tomador}`,
    texto,
    // Con el efecto a menos de 45 días, el plazo de un mes del art. 22 LCS ya aprieta.
    urgente: dias < 45,
    caduca: caduca < minimo ? minimo : caduca,
  }
}

export type EntradaCartaMediadorCompania = {
  tomador: string
  compania: string
  numeroPoliza: string
  /** Cuándo firmó el cliente, `YYYY-MM-DD`. */
  firmadaEl: string
  /** Huella SHA-256 del texto firmado (la de `seguros.firma.doc_hash`). */
  docHash: string
  mediador: string
  hoy: Date
}

/**
 * El correo a la compañía con la carta de nombramiento de mediador firmada (PR 6, salida B). La carta
 * va ADJUNTA y no se edita; esto es la nota que la acompaña. Sin fecha de efecto que apriete: caduca
 * a los 30 días, y si caduca se repropone (como la anulación).
 */
export function borradorCartaMediadorCompania(e: EntradaCartaMediadorCompania): Borrador {
  const texto = [
    'Buenos días:',
    '',
    `Nuestro cliente ${e.tomador}, tomador de la póliza nº ${e.numeroPoliza}, nos ha designado mediador de dicha póliza.`,
    '',
    `Adjuntamos la carta de nombramiento firmada por el tomador el ${fechaEs(e.firmadaEl)} con firma electrónica ` +
      `(huella SHA-256 del texto firmado: ${e.docHash}; la respalda el fichero de texto adjunto). El nombramiento no modifica el contrato.`,
    '',
    'Les rogamos que lo apliquen y nos confirmen la fecha desde la que figuramos como mediador.',
    '',
    'Un saludo,',
    e.mediador,
  ].join('\n')
  return {
    asunto: `Nombramiento de mediador · póliza nº ${e.numeroPoliza} · ${e.tomador}`,
    texto,
    urgente: false,
    caduca: caducaEn(e.hoy, 30),
  }
}

export type BuzonCompania = { id: string; activo: boolean; email: string | null; orden: number; recibeAnulaciones: boolean }

/**
 * El buzón de la compañía que se PRESELECCIONA para mandarle una anulación (o una carta de
 * nombramiento: el llamador pasa en `recibeAnulaciones` la marca de ESE tipo de envío): el que ya
 * recibió uno (lo marca el envío que Alberto aprueba). NO se deduce por área: con los contactos reales, el de
 * «administración» de una compañía es el de recibos impagados y el de otra rebota. `null` = no hay
 * ninguno marcado, y lo elige Alberto en la tarjeta.
 */
export function buzonSugerido(contactos: BuzonCompania[]): string | null {
  const c = contactos
    .filter((x) => x.activo && x.recibeAnulaciones && x.email && x.email.includes('@'))
    .sort((a, b) => a.orden - b.orden)[0]
  return c ? c.id : null
}

export type Decision =
  /** `contactoId`: el buzón de la compañía elegido en la tarjeta (solo para `enviar_correo_compania`). */
  | { decision: 'aprobar'; asunto: string; texto: string; contactoId?: string }
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
  if (o.contactoId !== undefined && o.contactoId !== null) {
    if (typeof o.contactoId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o.contactoId)) return null
    return { decision: 'aprobar', asunto, texto, contactoId: o.contactoId }
  }
  return { decision: 'aprobar', asunto, texto }
}
