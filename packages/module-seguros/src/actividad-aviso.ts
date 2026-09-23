// packages/module-seguros/src/actividad-aviso.ts
//
// El aviso por Telegram de lo que hacen los clientes en el portal (pieza 1-7 de
// ASegura OS, 23/09/2026). Alberto: «que cuando entre cliente me llegue aviso
// por Telegram; al principio hay que hacer seguimiento de todo».
//
// Puro: decide qué eventos son nuevos, dónde queda la marca de agua y qué dice
// el mensaje. La lectura del puerto y el envío viven en el cron
// `correduria-actividad` de plataforma, que copia el patrón de
// `correduria-siniestros` (la marca NO avanza si el Telegram no ha salido).
//
// ─── Por qué hay una VENTANA y no un «después de X» ──────────────────────────
// `acceso_fallido` (pidió el código y no entró) solo aparece en el feed 60
// minutos DESPUÉS de su fecha: antes podría estar tecleándolo. Con un corte
// estricto «fecha > última pasada» nacería siempre por detrás de la marca y no
// sonaría jamás. Por eso cada pasada vuelve a mirar las últimas
// `VENTANA_MINUTOS` y descarta lo ya avisado por su clave `tipo:id`.
//
// ─── Lo que el mensaje NO dice, a propósito ──────────────────────────────────
// Ni teléfono, ni correo, ni DNI, ni dirección, ni el TEXTO LIBRE del cliente
// (descripción de un parte, motivo de una supresión): un Telegram se lee con
// gente delante y no es un canal para datos personales. Va quién, qué hizo
// (el rótulo del muro) y el enlace a su ficha; el detalle se ve dentro.

import { etiquetaActividad, riesgoActividad, type EventoActividad } from './actividad.ts'

/**
 * Tipos que el portal YA avisa al instante (póliza declarada, sugerencia):
 * aquí se saltan para no llegar dos veces. El PRIMER acceso también lo avisa el
 * portal, pero los siguientes no, así que `acceso` sí va (el primero llega
 * duplicado: decisión de Alberto, 23/09/2026).
 */
export const TIPOS_YA_AVISADOS: ReadonlySet<string> = new Set(['poliza_declarada', 'sugerencia'])

/** Cuánto hacia atrás mira cada pasada. Holgado sobre los 60 min de `acceso_fallido`. */
export const VENTANA_MINUTOS = 180

/** Tope de caracteres del mensaje (Telegram corta en 4.096). */
const TOPE_MENSAJE = 3500

export type MarcaActividad = {
  /** Hasta dónde se miró en la última pasada que avisó (o ancló). ISO UTC. */
  instante: string
  /** Claves `tipo:id` ya avisadas que siguen dentro de la ventana. */
  claves: string[]
}

export type DecisionActividad =
  | { avisar: false; motivo: 'primera_vez'; marca: MarcaActividad; anteriores: number }
  | { avisar: false; motivo: 'sin_novedades'; marca: MarcaActividad }
  | { avisar: true; motivo: 'nuevos'; nuevos: EventoActividad[]; marca: MarcaActividad }

const MS_VENTANA = VENTANA_MINUTOS * 60_000

export function claveEvento(e: Pick<EventoActividad, 'tipo' | 'id'>): string {
  return `${e.tipo}:${e.id}`
}

/** El `desde` que hay que pedir al puerto: la marca menos la ventana (o ahora menos la ventana, la primera vez). */
export function desdeConsulta(marca: MarcaActividad | null, ahora: Date): string {
  const base = marca ? new Date(marca.instante).getTime() : ahora.getTime()
  return new Date(base - MS_VENTANA).toISOString()
}

/**
 * Qué hay que avisar y dónde queda la marca.
 *
 * - Primera vez (sin marca): ancla y NO avisa — mandar el histórico de golpe
 *   no es seguimiento, es ruido.
 * - `truncado` (el puerto tenía más de los que devolvió): la marca solo avanza
 *   hasta el último evento VISTO, no hasta ahora; los que faltan entran en la
 *   pasada siguiente.
 * - La marca que se devuelve es la que hay que guardar SI el aviso sale. Si no
 *   sale, quien llama conserva la anterior.
 */
export function decidirAvisosActividad(p: {
  marca: MarcaActividad | null
  eventos: EventoActividad[]
  ahora: Date
  truncado: boolean
}): DecisionActividad {
  const avisables = p.eventos.filter(e => !TIPOS_YA_AVISADOS.has(String(e.tipo)))
  const fechas = p.eventos.map(e => new Date(e.fecha).getTime()).filter(Number.isFinite)
  const hasta = p.truncado && fechas.length > 0 ? Math.max(...fechas) : p.ahora.getTime()
  const instante = new Date(hasta).toISOString()
  // Solo se recuerdan las claves que la PRÓXIMA consulta puede volver a traer.
  const dentroDeVentana = (e: EventoActividad) => new Date(e.fecha).getTime() >= hasta - MS_VENTANA

  if (p.marca === null) {
    const claves = avisables.filter(dentroDeVentana).map(claveEvento)
    return { avisar: false, motivo: 'primera_vez', marca: { instante, claves }, anteriores: avisables.length }
  }

  const yaAvisadas = new Set(p.marca.claves)
  const nuevos = avisables.filter(e => !yaAvisadas.has(claveEvento(e)))
  const claves = avisables.filter(dentroDeVentana).map(claveEvento)
  const marca = { instante, claves }
  if (nuevos.length === 0) return { avisar: false, motivo: 'sin_novedades', marca }
  return { avisar: true, motivo: 'nuevos', nuevos, marca }
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function horaMadrid(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * El mensaje: UNO por pasada, agrupado por cliente (varias acciones seguidas
 * del mismo cliente son un bloque, no N avisos). HTML de Telegram.
 * `urlFicha(clienteId)` la pone quien llama (la base de la URL es de plataforma).
 */
export function mensajeActividad(nuevos: EventoActividad[], urlFicha: (clienteId: string) => string): string {
  const grupos = new Map<string, EventoActividad[]>()
  for (const e of [...nuevos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const k = e.clienteId ?? `sin-ficha:${e.id}`
    grupos.set(k, [...(grupos.get(k) ?? []), e])
  }

  const cabecera = `👤 <b>Actividad de clientes en el portal</b> (${nuevos.length})`
  const bloques: string[] = []
  for (const [, eventos] of grupos) {
    const primero = eventos[0]
    const nombre = primero.cliente ? escapar(primero.cliente) : 'Sin ficha vinculada'
    const enlace = primero.clienteId ? ` · <a href="${escapar(urlFicha(primero.clienteId))}">abrir ficha</a>` : ''
    const lineas = eventos.map(e => {
      const riesgo = riesgoActividad(String(e.tipo))
      return `• ${horaMadrid(e.fecha)} ${escapar(etiquetaActividad(String(e.tipo)))}` + (riesgo ? `\n  ⚠️ ${escapar(riesgo)}` : '')
    })
    bloques.push(`<b>${nombre}</b>${enlace}\n${lineas.join('\n')}`)
  }

  let texto = cabecera
  let incluidos = 0
  for (const b of bloques) {
    if ((texto + '\n\n' + b).length > TOPE_MENSAJE) break
    texto += '\n\n' + b
    incluidos++
  }
  if (incluidos < bloques.length) {
    texto += `\n\n… y ${bloques.length - incluidos} cliente(s) más: míralos en /correduria → Actividad.`
  }
  return texto
}

export function detalleActividad(
  d: DecisionActividad | { avisar: false; motivo: 'sin_datos'; causa?: string | null },
): string {
  if (d.motivo === 'sin_datos') {
    return `actividad del portal: NO se ha podido mirar${d.causa ? ` (${d.causa})` : ''} — esto NO significa que no haya habido`
  }
  if (d.motivo === 'primera_vez') {
    return `actividad del portal: primera pasada, marca puesta en ${d.marca.instante} · ${d.anteriores} anterior(es) NO avisados a propósito`
  }
  if (d.motivo === 'sin_novedades') return 'actividad del portal: nada nuevo (comprobado)'
  return `actividad del portal: ${d.nuevos.length} evento(s) avisado(s)`
}

// ── Serialización de la marca (vive en el `detalle` del latido, como siniestros) ──

const SEP = ' · '

export function serializarMarcaActividad(marca: MarcaActividad, detalle: string): string {
  return `${marca.instante}|${marca.claves.join(',')}${SEP}${detalle}`
}

/** `null` = no consta o ilegible → se trata como primera vez (ancla sin avisar). */
export function leerMarcaActividad(detalle: string | null | undefined): MarcaActividad | null {
  if (typeof detalle !== 'string') return null
  const cabeza = detalle.split(SEP)[0] ?? ''
  const corte = cabeza.indexOf('|')
  if (corte < 0) return null
  const instante = cabeza.slice(0, corte)
  if (Number.isNaN(new Date(instante).getTime())) return null
  const claves = cabeza.slice(corte + 1).split(',').map(s => s.trim()).filter(s => s !== '')
  return { instante, claves }
}
