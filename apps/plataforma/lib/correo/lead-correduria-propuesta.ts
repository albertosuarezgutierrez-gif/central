// lib/correo/lead-correduria-propuesta.ts — F4: la PROPUESTA de un lead aprobada desde Telegram (19/10/2026, spec
// lead → propuesta §F4 y §3.4). PURO: sin red, sin BD, sin env (lo usan el triaje y el webhook; test al lado).
//
// Con ≥1 precio del lead (bots; Avant2 si ya lo hay), un aviso con la comparativa (compañía · prima · franquicia ·
// firmeza · coberturas del catálogo · bloqueo) y la recomendada con su porqué (necesidades IDD), y los botones:
//   📤 `clp_pro:<p>:<n>` envía EXACTAMENTE el precio n · 🔀 `clp_eli:<p>` lista un botón por precio enviable ·
//   ✏️ `clp_edt:<p>` cambia el texto · 🚫 `clp_no:<p>` no se envía.
// 🚨 Falta UNA necesidad → no hay 📤 ni 🔀: se propone repreguntarle (F2) esas necesidades. Nada se inventa.
// 🚨 `n` es ESTABLE: un precio que ya tenía número lo conserva cuando llegan otros (el aviso se ACTUALIZA en sitio; un
//    botón viejo pulsado a la vez nunca apunta a otro precio). Y aun así asegura vuelve a comprobar clave + prima.
// 🚨 En Telegram solo nombre de pila, ramo, compañías, primas y coberturas: ni email, ni DNI, ni teléfono.
import { escapeHtml, type Boton } from '@central/core-telegram'
import { MEDIADOR, informacionPreviaMediador } from '@central/module-seguros'
import { eur } from '../dinero.ts'
import { DIAS_CADUCIDAD_PENDIENTE, PREFIJO_CLP } from './lead-correduria-peticion.ts'
import { pieLegalLeadCorreo } from './lead-correduria.ts'

/** Id del aviso en el catálogo (`lib/telegram/catalogo.ts`); el emisor lo escribe literal para que el guardián lo vea. */
export const AVISO_PROPUESTA_LEAD = 'correduria.lead-propuesta'
/** La clave del pendiente de la propuesta: UNO por hilo (el aviso se actualiza, no se duplica). */
export const clavePendientePropuesta = (hiloId: string) => `propuesta:${hiloId}`

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const txt = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_MSGID = /^<[^<>\s@]+@[^<>\s@]+>$/

// ─── Lo que manda asegura ─────────────────────────────────────────────────────────────────────────────────────────

export type OpcionLeida = {
  clave: string; origen: 'rpa' | 'avant2'; compania: string; producto: string | null; primaEur: number; franquiciaEur: number | null
  firmeza: string; coberturas: string[]; bloqueo: string | null; caducada: boolean; enviable: boolean; motivoNoEnviable: string | null
}
export type NecesidadesLeidas = {
  completas: boolean; total: number
  respondidas: { id: string; etiqueta: string; texto: string; fuente: 'respuesta' | 'deducida'; de: string | null }[]
  faltan: { id: string; etiqueta: string; pregunta: string; opciones: string[] }[]
}
export type PropuestaLeida = {
  hiloId: string; clienteId: string; oportunidadId: string; ramo: string; pila: string | null; estadoDatos: string
  messageIdRaiz: string; messageIds: string[]; necesidades: NecesidadesLeidas; opciones: OpcionLeida[]
  recomendada: { clave: string; justificacion: string } | null; huella: string
}

/** Una propuesta del puerto, sin fiarse. Algo esencial raro = `null` (no se avisa de lo que no se entiende). PURA. */
export function leerPropuesta(v: unknown): PropuestaLeida | null {
  const o = obj(v)
  const n = obj(o.necesidades)
  if (!/^\d{1,18}$/.test(txt(o.hiloId)) || !UUID.test(txt(o.clienteId)) || !UUID.test(txt(o.oportunidadId)) || !txt(o.huella)) return null
  const opciones: OpcionLeida[] = (Array.isArray(o.opciones) ? o.opciones : []).map(obj).flatMap((x) => {
    const prima = num(x.primaEur)
    if (!txt(x.clave) || prima === null || prima <= 0 || (x.origen !== 'rpa' && x.origen !== 'avant2')) return []
    return [{
      clave: txt(x.clave).toLowerCase(), origen: x.origen, compania: txt(x.compania) || 'Compañía sin nombre', producto: txt(x.producto) || null,
      primaEur: prima, franquiciaEur: num(x.franquiciaEur), firmeza: txt(x.firmeza) || 'estimado', coberturas: lista(x.coberturas),
      bloqueo: typeof x.bloqueo === 'string' ? x.bloqueo : null, caducada: x.caducada === true,
      // Enviable solo si asegura lo dice Y es un precio del bot con id de oferta (uuid): lo demás no tiene botón.
      enviable: x.enviable === true && x.origen === 'rpa' && UUID.test(txt(x.clave)),
      motivoNoEnviable: typeof x.motivoNoEnviable === 'string' ? x.motivoNoEnviable : null,
    }]
  })
  if (!opciones.length) return null
  const rec = obj(o.recomendada)
  const recomendada = txt(rec.clave) && opciones.some((x) => x.clave === txt(rec.clave).toLowerCase() && x.enviable)
    ? { clave: txt(rec.clave).toLowerCase(), justificacion: txt(rec.justificacion) }
    : null
  const respondidas = (Array.isArray(n.respondidas) ? n.respondidas : []).map(obj).filter((x) => txt(x.id)).map((x) => ({
    id: txt(x.id), etiqueta: txt(x.etiqueta), texto: txt(x.texto), fuente: x.fuente === 'deducida' ? 'deducida' as const : 'respuesta' as const, de: txt(x.de) || null,
  }))
  const faltan = (Array.isArray(n.faltan) ? n.faltan : []).map(obj).filter((x) => txt(x.id)).map((x) => ({
    id: txt(x.id), etiqueta: txt(x.etiqueta), pregunta: txt(x.pregunta), opciones: lista(x.opciones),
  }))
  return {
    hiloId: txt(o.hiloId), clienteId: txt(o.clienteId), oportunidadId: txt(o.oportunidadId), ramo: txt(o.ramo) || 'otros',
    pila: txt(o.pila) || null, estadoDatos: txt(o.estadoDatos), messageIdRaiz: txt(o.messageIdRaiz),
    messageIds: lista(o.messageIds).filter((m) => RE_MSGID.test(m)),
    // «Completas» solo si asegura lo dice Y no hay ninguna en falta (fail-closed).
    necesidades: { completas: n.completas === true && faltan.length === 0, total: num(n.total) ?? respondidas.length + faltan.length, respondidas, faltan },
    opciones, recomendada, huella: txt(o.huella),
  }
}

export function leerPendientesPropuesta(status: number, json: unknown): { estado: 'ok'; propuestas: PropuestaLeida[] } | { estado: 'error'; motivo: string } {
  const o = obj(json)
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.propuestas)) return { estado: 'error', motivo: typeof o.estado === 'string' ? o.estado : `HTTP ${status}` }
  return { estado: 'ok', propuestas: o.propuestas.map(leerPropuesta).filter((p): p is PropuestaLeida => p !== null) }
}

// ─── Números estables y lo que guarda el pendiente ────────────────────────────────────────────────────────────────

/** Lo que el pendiente guarda de cada precio (sin datos personales): para pintar y para enviar EXACTAMENTE ese. */
export type OpcionNumerada = Omit<OpcionLeida, 'producto'> & { n: number; producto: string | null }

/**
 * Número estable por PRECIO (clave + prima): lo que ya tenía número y no ha cambiado de prima lo conserva; lo nuevo —o
 * la misma oferta con OTRA prima— toma el siguiente libre (los números no se reutilizan). Lo que ya no está, fuera (su
 * botón ya no sirve). Así un botón viejo (p. ej. el mensaje 🔀, que no se edita) nunca envía una prima que Alberto no ha
 * visto: su número deja de existir y no sale nada (revisión F4). Orden de pintado: el de asegura. PURA.
 */
export function numerar(previas: readonly { n: number; clave: string; primaEur: number }[], opciones: readonly OpcionLeida[]): OpcionNumerada[] {
  const porClave = new Map(previas.map((p) => [p.clave, p]))
  let siguiente = Math.max(0, ...previas.map((p) => p.n)) + 1
  return opciones.map((o) => {
    const previa = porClave.get(o.clave)
    const n = previa && Math.abs(previa.primaEur - o.primaEur) < 0.005 ? previa.n : siguiente++
    return { ...o, n }
  })
}

export type DatosPropuesta = {
  tipo: 'propuesta'
  hiloId: string
  clienteId: string
  oportunidadIds: string[]
  /** El email del hilo (el From de su último correo): asegura solo envía si es el del hilo y el principal de la ficha. */
  to: string
  asunto: string
  messageId: string
  references: string[]
  pila: string | null
  ramos: string[]
  huella: string
  opciones: OpcionNumerada[]
  recomendada: { n: number; justificacion: string } | null
  necesidades: NecesidadesLeidas
}

/** El `datos` del pendiente, sin fiarse. Algo raro = `null` y no se envía nada. PURA. */
export function leerDatosPropuesta(v: unknown): DatosPropuesta | null {
  const o = obj(v)
  if (o.tipo !== 'propuesta' || !/^\d{1,18}$/.test(txt(o.hiloId)) || !UUID.test(txt(o.clienteId)) || !txt(o.to).includes('@') || !RE_MSGID.test(txt(o.messageId))) return null
  const ops = lista(o.oportunidadIds).filter((x) => UUID.test(x))
  if (ops.length !== 1) return null
  const opciones = (Array.isArray(o.opciones) ? o.opciones : []).map(obj).flatMap((x) => {
    const n = num(x.n)
    const prima = num(x.primaEur)
    if (n === null || !Number.isInteger(n) || n < 1 || prima === null || !txt(x.clave)) return []
    return [{
      n, clave: txt(x.clave), origen: x.origen === 'avant2' ? 'avant2' as const : 'rpa' as const, compania: txt(x.compania), producto: txt(x.producto) || null,
      primaEur: prima, franquiciaEur: num(x.franquiciaEur), firmeza: txt(x.firmeza) || 'estimado', coberturas: lista(x.coberturas),
      bloqueo: typeof x.bloqueo === 'string' ? x.bloqueo : null, caducada: x.caducada === true,
      enviable: x.enviable === true && x.origen === 'rpa' && UUID.test(txt(x.clave)), motivoNoEnviable: typeof x.motivoNoEnviable === 'string' ? x.motivoNoEnviable : null,
    }]
  })
  const rec = obj(o.recomendada)
  const nec = obj(o.necesidades)
  return {
    tipo: 'propuesta', hiloId: txt(o.hiloId), clienteId: txt(o.clienteId), oportunidadIds: ops, to: txt(o.to), asunto: txt(o.asunto) || 'Tu seguro',
    messageId: txt(o.messageId), references: lista(o.references).filter((m) => RE_MSGID.test(m)), pila: txt(o.pila) || null, ramos: lista(o.ramos),
    huella: txt(o.huella), opciones,
    recomendada: num(rec.n) !== null && opciones.some((x) => x.n === rec.n && x.enviable) ? { n: rec.n as number, justificacion: txt(rec.justificacion) } : null,
    necesidades: {
      completas: nec.completas === true && !(Array.isArray(nec.faltan) && nec.faltan.length),
      total: num(nec.total) ?? 0,
      respondidas: (Array.isArray(nec.respondidas) ? nec.respondidas : []).map(obj).map((x) => ({
        id: txt(x.id), etiqueta: txt(x.etiqueta), texto: txt(x.texto), fuente: x.fuente === 'deducida' ? 'deducida' as const : 'respuesta' as const, de: txt(x.de) || null,
      })),
      faltan: (Array.isArray(nec.faltan) ? nec.faltan : []).map(obj).map((x) => ({ id: txt(x.id), etiqueta: txt(x.etiqueta), pregunta: txt(x.pregunta), opciones: lista(x.opciones) })),
    },
  }
}

/** Arma `datos` desde la propuesta leída, el contacto del hilo y la numeración previa. PURA. */
export function datosDePropuesta(
  p: PropuestaLeida,
  contacto: { to: string; asunto: string; messageId: string },
  previas: readonly { n: number; clave: string; primaEur: number }[],
): DatosPropuesta {
  const opciones = numerar(previas, p.opciones)
  const rec = p.recomendada ? opciones.find((o) => o.clave === p.recomendada!.clave && o.enviable) : undefined
  return {
    tipo: 'propuesta', hiloId: p.hiloId, clienteId: p.clienteId, oportunidadIds: [p.oportunidadId], to: contacto.to, asunto: contacto.asunto,
    messageId: contacto.messageId, references: [...new Set([p.messageIdRaiz, ...p.messageIds].filter((m) => RE_MSGID.test(m)))].slice(0, 50),
    pila: p.pila, ramos: [p.ramo], huella: p.huella, opciones, recomendada: rec ? { n: rec.n, justificacion: p.recomendada!.justificacion } : null,
    necesidades: p.necesidades,
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────────────────────────────────────────

const RAMO = (r: string) => r.replace(/_/g, ' ')
const firmezaCorta = (f: string) => (f === 'firme' ? 'firme' : f === 'condicionado' ? 'condicionado' : 'estimado')
const franquicia = (f: number | null) => (f === null ? 'franquicia no consta' : f === 0 ? 'sin franquicia' : `franquicia ${eur(f)}`)

/** ¿Hay algo que se pueda enviar? Necesidades completas y al menos un precio enviable. PURA. */
export function hayEnviable(d: Pick<DatosPropuesta, 'necesidades' | 'opciones'>): boolean {
  return d.necesidades.completas && d.opciones.some((o) => o.enviable)
}

/** El aviso §3.4. Solo nombre de pila, ramo, compañías, primas y coberturas. PURA. */
export function textoPropuestaTelegram(a: { id: number | string; datos: DatosPropuesta; borrador: string; editado?: boolean; actualizado?: boolean }): string {
  const d = a.datos
  const quien = d.pila ? escapeHtml(d.pila) : 'sin nombre'
  const ramos = d.ramos.length ? escapeHtml(d.ramos.map(RAMO).join(', ')) : 'ramo sin identificar'
  const n = d.opciones.length
  const lineas = [`📊 <b>${quien} · ${ramos} · ${n} ${n === 1 ? 'precio' : 'precios'}</b>${a.actualizado ? ' <i>(actualizado)</i>' : ''}`]
  for (const o of d.opciones.slice(0, 10)) {
    const cob = o.coberturas.length ? ` · ${escapeHtml(o.coberturas.slice(0, 4).join(', '))}${o.coberturas.length > 4 ? '…' : ''}` : ' · coberturas no constan'
    const rec = d.recomendada?.n === o.n ? ` ← <b>recomendada</b> (${escapeHtml(d.recomendada.justificacion.slice(0, 220))})` : ''
    const no = !o.enviable && o.motivoNoEnviable ? ` <i>(${escapeHtml(o.motivoNoEnviable.slice(0, 120))})</i>` : ''
    lineas.push(`${o.n}. ${escapeHtml(o.compania)} ${eur(o.primaEur)} · ${franquicia(o.franquiciaEur)} · ${firmezaCorta(o.firmeza)}${cob}${rec}${no}`)
    if (o.bloqueo !== null) lineas.push(`   ⛔ La compañía la dejará BLOQUEADA${o.bloqueo ? ` (${escapeHtml(o.bloqueo)})` : ''}: no se envía.`)
  }
  if (n > 10) lineas.push(`<i>… y ${n - 10} más (en su ficha).</i>`)
  const nec = d.necesidades
  const deducidas = nec.respondidas.filter((r) => r.fuente === 'deducida').length
  lineas.push(nec.completas
    ? `IDD: necesidades ${nec.respondidas.length}/${nec.total} ✓${deducidas ? ` (${deducidas} deducida${deducidas === 1 ? '' : 's'} de sus datos)` : ''} · información previa ✓`
    : `IDD: necesidades ${nec.respondidas.length}/${nec.total} ✗ · faltan: ${escapeHtml(nec.faltan.map((f) => f.etiqueta.toLowerCase()).join(', '))}. Sin ellas no se le propone nada: te propongo repreguntárselas (mensaje aparte).`)
  if (!nec.completas || !hayEnviable(d)) {
    if (nec.completas) lineas.push('⚠️ Ningún precio de los bots encaja con lo que necesita: no hay nada que enviar desde aquí.')
  }
  if (nec.respondidas.length) {
    lineas.push(`<blockquote expandable>${escapeHtml(nec.respondidas.map((r) => `${r.etiqueta}: ${r.texto}${r.fuente === 'deducida' ? ` (deducido de «${r.de}»)` : ''}`).join('\n').slice(0, 900))}</blockquote>`)
  }
  if (hayEnviable(d)) {
    lineas.push(a.editado ? '✏️ Texto EDITADO por ti. Sale EN SU HILO con el enlace al portal.' : 'Texto del correo (sale EN SU HILO, con el enlace al portal y la aceptación firmada):')
    lineas.push(`<blockquote expandable>${escapeHtml(`Asunto: ${d.asunto}\n\n${a.borrador}`.slice(0, 1500))}</blockquote>`)
  }
  lineas.push(`<i>No sale nada sin pulsar · caduca en ${DIAS_CADUCIDAD_PENDIENTE} días · #clp${a.id}</i>`)
  return lineas.join('\n').slice(0, 4000)
}

/** Botones §3.4. Sin nada enviable: solo ✏️ y 🚫. PURA. */
export function botonesPropuesta(id: number | string, d: Pick<DatosPropuesta, 'necesidades' | 'opciones' | 'recomendada'>): Boton[][] {
  const filas: Boton[][] = []
  if (hayEnviable(d)) {
    const primera: Boton[] = []
    if (d.recomendada) primera.push({ texto: `📤 Enviar recomendada (${d.recomendada.n})`, callback: `${PREFIJO_CLP}_pro:${id}:${d.recomendada.n}` })
    primera.push({ texto: '🔀 Elegir otra', callback: `${PREFIJO_CLP}_eli:${id}` })
    filas.push(primera)
  }
  filas.push([{ texto: '✏️ Editar texto', callback: `${PREFIJO_CLP}_edt:${id}` }, { texto: '🚫 No enviar', callback: `${PREFIJO_CLP}_no:${id}` }])
  return filas
}

/** 🔀: un botón por precio ENVIABLE (y 🚫). Los no enviables no tienen botón. PURA. */
export function botonesElegir(id: number | string, d: Pick<DatosPropuesta, 'necesidades' | 'opciones'>): Boton[][] {
  const filas: Boton[][] = hayEnviable(d)
    ? d.opciones.filter((o) => o.enviable).slice(0, 8).map((o) => [{ texto: `📤 ${o.n}. ${o.compania.slice(0, 24)} ${eur(o.primaEur)}`, callback: `${PREFIJO_CLP}_pro:${id}:${o.n}` }])
    : []
  filas.push([{ texto: '🚫 No enviar', callback: `${PREFIJO_CLP}_no:${id}` }])
  return filas
}

// ─── El correo ────────────────────────────────────────────────────────────────────────────────────────────────────

const saludoDe = (pila: string | null) => (pila ? `Hola ${pila}:` : 'Hola:')

/**
 * El texto del correo de la propuesta (lo que Alberto puede editar). La opción elegida NO va aquí: se inserta al enviar
 * (`conOpcion`), para que «🔀 Elegir otra» nunca mande un texto que nombra otra compañía. Siempre con la información
 * previa del mediador y el pie legal (DGSFP, RGPD), desde `MEDIADOR`. PURA.
 */
export function borradorPropuesta(d: Pick<DatosPropuesta, 'pila' | 'necesidades'>): string {
  const nec = d.necesidades.respondidas.map((r) => `- ${r.etiqueta}: ${r.texto}`)
  return [
    saludoDe(d.pila),
    '',
    'Gracias por tus respuestas. Con lo que nos has contado he comparado las compañías y te propongo la opción que mejor encaja contigo.',
    ...(nec.length ? ['', 'Lo que nos has dicho que necesitas:', ...nec] : []),
    '',
    'Abajo tienes el enlace para verla con todo el detalle y, si te encaja, aceptarla con un código que te llegará al correo. Cualquier duda, responde a este correo.',
    '',
    'Un saludo,',
    '',
    informacionPreviaMediador(),
    '',
    pieLegalLeadCorreo(),
  ].join('\n')
}

/** La línea de la opción que sale (compañía, prima, franquicia y firmeza dicha en claro). PURA. */
export function lineaOpcion(o: Pick<OpcionNumerada, 'compania' | 'producto' | 'primaEur' | 'franquiciaEur' | 'firmeza'>): string {
  const fr = o.franquiciaEur === null ? '' : o.franquiciaEur === 0 ? ', sin franquicia' : `, con una franquicia de ${eur(o.franquiciaEur)}`
  const firmeza = o.firmeza === 'firme' ? 'Es un precio firme de la compañía.' : 'Es un precio estimado: la compañía lo confirma al emitir la póliza.'
  return `Te propongo ${o.compania}${o.producto ? ` (${o.producto})` : ''}: ${eur(o.primaEur)} al año${fr}. ${firmeza}`
}

/** El texto final con la opción ELEGIDA justo después del saludo (o al principio si no lo hay). PURA. */
export function conOpcion(borrador: string, o: Pick<OpcionNumerada, 'compania' | 'producto' | 'primaEur' | 'franquiciaEur' | 'firmeza'>): string {
  const t = borrador.replace(/\r\n/g, '\n').trim()
  const linea = lineaOpcion(o)
  const primera = t.split('\n')[0] ?? ''
  if (/^(hola|buen[oa]s|estimad)/i.test(primera.trim())) return `${primera}\n\n${linea}\n${t.slice(primera.length)}`
  return `${linea}\n\n${t}`
}

/**
 * La REPREGUNTA de las necesidades que faltan (cada una con sus opciones), con el pie legal. `null` si no falta nada. PURA.
 */
export function plantillaRepreguntaIdd(a: { pila: string | null; faltan: NecesidadesLeidas['faltan']; asuntoOriginal: string }): { asunto: string; cuerpo: string; preguntas: number } | null {
  if (!a.faltan.length) return null
  const asunto = (/^\s*re:/i.test(a.asuntoOriginal) ? a.asuntoOriginal.trim() : `Re: ${a.asuntoOriginal.trim()}`).slice(0, 200)
  const cuerpo = [
    saludoDe(a.pila),
    '',
    'Ya tengo los precios. Para recomendarte la opción que de verdad te encaja (y porque la normativa de seguros me pide conocer tus necesidades antes de proponerte nada), ¿me dices esto?',
    '',
    ...a.faltan.map((f) => `- ${f.pregunta}${f.opciones.length ? ` (${f.opciones.join(' / ')})` : ''}`),
    '',
    'Con eso te mando la propuesta.',
    '',
    'Un saludo,',
    '',
    pieLegalLeadCorreo(),
  ].join('\n')
  return { asunto, cuerpo, preguntas: a.faltan.length }
}

/** Clave estable del CONJUNTO de necesidades que faltan (una repregunta por conjunto, no una por pasada). PURA. */
export function claveRepreguntaIdd(hiloId: string, faltan: readonly { id: string }[]): string {
  return `idd:${hiloId}:${[...faltan.map((f) => f.id)].sort().join(',')}`.slice(0, 200)
}

// ─── Lo que contesta asegura al enviar ────────────────────────────────────────────────────────────────────────────

export type ResultadoEnvioPropuesta =
  | { estado: 'enviado'; repetido: boolean; hilo: string; historial: boolean }
  /** Seguro que NO salió. `refrescar`: los precios o las necesidades cambiaron → el pendiente vuelve y el aviso se rehace. */
  | { estado: 'no_enviado'; motivo: string; refrescar: boolean }
  /** No se sabe si salió: NUNCA se reintenta solo. */
  | { estado: 'incierto'; motivo: string }

const REFRESCAR = new Set(['precio_cambiado', 'opcion_no_esta', 'necesidades_incompletas', 'no_enviable'])

/** Respuesta de `accion:'enviar'` → qué pasó. Lo desconocido es «incierto», jamás «no salió». PURA. */
export function interpretarEnvioPropuesta(status: number, json: unknown): ResultadoEnvioPropuesta {
  const o = obj(json)
  if (status === 200 && o.estado === 'enviado') return { estado: 'enviado', repetido: o.repetido === true, hilo: txt(o.hilo) || 'desconocido', historial: o.historial === true }
  if ((status === 404 || status === 409 || status === 503 || status === 400) && (o.estado === 'no_enviado' || o.estado === 'invalido' || o.estado === 'sin_configurar')) {
    const m = txt(o.motivo)
    return { estado: 'no_enviado', motivo: (txt(o.detalle) || m || `HTTP ${status}`).slice(0, 240), refrescar: REFRESCAR.has(m) }
  }
  return { estado: 'incierto', motivo: (txt(o.detalle) || txt(o.motivo) || `HTTP ${status}`).slice(0, 160) }
}

/** La línea que sustituye a los botones tras 📤. PURA. */
export function lineaTrasPropuesta(r: ResultadoEnvioPropuesta | { estado: 'usado' } | { estado: 'ilegible' } | { estado: 'sin_opcion' }, o?: Pick<OpcionNumerada, 'n' | 'compania' | 'primaEur'>): string {
  const cual = o ? ` (${o.n}. ${escapeHtml(o.compania)} ${eur(o.primaEur)})` : ''
  switch (r.estado) {
    case 'enviado':
      if (r.repetido) return `✅ <b>Propuesta ya enviada antes${cual}</b>: no se repite.`
      return `✅ <b>Propuesta enviada en su hilo${cual}</b> desde ${escapeHtml(MEDIADOR.identidad.email)} (con copia a ese buzón), con el enlace al portal.${r.historial ? ' Anotada en su ficha.' : ' ⚠️ No se pudo anotar en su ficha: el correo SÍ salió, no lo repitas.'}${r.hilo === 'sin_sql' ? ' (Falta el SQL 2026-10-19e: el hilo no cambia de estado.)' : ''}`
    case 'no_enviado':
      return `❌ <b>No se ha enviado${cual}</b>: ${escapeHtml(r.motivo)}${r.refrescar ? ' Te actualizo la comparativa.' : ''}`
    case 'incierto':
      return `⚠️ <b>No sé si ha salido${cual}</b> (${escapeHtml(r.motivo)}). Míralo en su ficha ANTES de repetir: no se reintenta solo.`
    case 'usado':
      return '<i>Esa propuesta ya se envió, se descartó o ha caducado: no se ha enviado nada.</i>'
    case 'ilegible':
      return '⚠️ <i>La propuesta guardada no se entiende: no se ha enviado nada.</i>'
    case 'sin_opcion':
      return '❌ <b>Ese precio ya no está o no se puede enviar</b>: no se envía otro en su lugar.'
  }
}
