// lib/correo/lead-correduria-respuesta.ts — la RESPUESTA del cliente en el hilo de su lead (19/10/2026, spec lead →
// propuesta F2). PURO: sin red, sin BD, sin env (lo usa `lead-correduria-respuesta-proceso.ts`; test al lado).
//
// Qué se le dice a Alberto y qué se le contesta al cliente:
//   · «📥 Ana ha respondido · Hogar» + ✔️ lo recibido · ⚠️ lo que no vale o no cuadra · ❌ lo que falta · 📎 adjuntos.
//     SOLO etiquetas y conteos: ni un valor (ni DNI, ni fecha, ni dirección) llega a Telegram.
//   · Si falta algo: borrador de REPREGUNTA solo con lo que falta (y lo que no vale), con ✅/✏️/❌ y el mismo envío en el
//     hilo que la F1. Nada sale sin el ✅.
//   · Si está todo: «✅ Datos completos para Hogar — listo para tarificar» (la F3 tarificará; aquí no se tarifica).
// Un fallo (IA caída, asegura sin responder) NUNCA se lee como «no mandó nada»: se dice que no se ha podido leer.
import { escapeHtml, type Boton } from '@central/core-telegram'
import { MEDIADOR, etiquetasDe, nombreDePila, preguntasConcretas, preguntasRepregunta } from '@central/module-seguros'
import type { RamoOportunidad } from '@central/module-seguros'
import { etiquetaRamo, pieLegalLeadCorreo } from './lead-correduria.ts'

export const AVISO_RESPUESTA_LEAD = 'correduria.lead-respuesta'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 80) : [])

// ─── Lo que contesta asegura ──────────────────────────────────────────────────────────────────────────────────────

export type CasadoLead =
  | { estado: 'ok'; hiloId: string; clienteId: string; pila: string | null; oportunidades: { id: string; ramo: string }[] }
  /** No casa (0 hilos), casa con varios clientes, falta el SQL o no se pudo preguntar: NO se lee nada. */
  | { estado: 'sin_hilo' | 'ambiguo' | 'sin_tabla' | 'error'; motivo: string }

/** Respuesta de `accion:'casar'`. Lo desconocido es `error` (no se lee), nunca «casa». PURA. */
export function leerCasar(status: number, json: unknown): CasadoLead {
  const o = obj(json)
  if (status === 200 && o.estado === 'ok' && typeof o.hiloId === 'string' && /^\d{1,15}$/.test(o.hiloId) && typeof o.clienteId === 'string' && UUID.test(o.clienteId)) {
    const ops = Array.isArray(o.oportunidades)
      ? o.oportunidades.map(obj).filter((x) => typeof x.id === 'string' && UUID.test(x.id) && typeof x.ramo === 'string').map((x) => ({ id: x.id as string, ramo: x.ramo as string }))
      : []
    return { estado: 'ok', hiloId: o.hiloId, clienteId: o.clienteId, pila: typeof o.pila === 'string' ? o.pila : null, oportunidades: ops }
  }
  if (status === 200 && o.estado === 'sin_hilo') return { estado: 'sin_hilo', motivo: 'no casa con el hilo de ningún lead con ese remitente' }
  if (status === 200 && o.estado === 'ambiguo') return { estado: 'ambiguo', motivo: 'casa con hilos de varios clientes: no lo leo para no escribir en la ficha equivocada' }
  if (status === 503 && o.estado === 'sin_tabla') return { estado: 'sin_tabla', motivo: 'falta el SQL del hilo en asegura' }
  return { estado: 'error', motivo: `asegura no ha contestado bien (HTTP ${status})` }
}

export type OportunidadLeida = {
  id: string; ramo: string
  nuevos: string[]; iguales: string[]; discrepancias: string[]; protegidos: string[]; sinClave: string[]; invalidos: string[]; faltan: string[]
  guardado: boolean
  /** F3b: discrepancias que esperan la elección de Alberto (con alguna, NO está completa). */
  pendientes: string[]
}
export type GuardadoLead =
  | { estado: 'ok'; oportunidades: OportunidadLeida[]; completo: boolean }
  | { estado: 'no'; motivo: string }

/** Respuesta de `accion:'guardar'`. Sin un `ok` legible no se da NADA por guardado ni por completo. PURA. */
export function leerGuardar(status: number, json: unknown): GuardadoLead {
  const o = obj(json)
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.oportunidades)) {
    return { estado: 'no', motivo: typeof o.estado === 'string' ? `asegura: ${String(o.estado).slice(0, 40)}` : `HTTP ${status}` }
  }
  const ops = o.oportunidades.map(obj).filter((x) => typeof x.id === 'string' && typeof x.ramo === 'string').map((x) => ({
    id: x.id as string, ramo: x.ramo as string, nuevos: lista(x.nuevos), iguales: lista(x.iguales), discrepancias: lista(x.discrepancias),
    protegidos: lista(x.protegidos), sinClave: lista(x.sinClave), invalidos: lista(x.invalidos), faltan: lista(x.faltan), guardado: x.guardado === true,
    pendientes: lista(x.pendientes),
  }))
  if (!ops.length) return { estado: 'no', motivo: 'sin oportunidades' }
  // «Completo» lo dice asegura Y se comprueba aquí: una oportunidad no guardada o con algo pendiente no lo es.
  const completo = o.completo === true && ops.every((x) => x.guardado && x.faltan.length === 0 && x.pendientes.length === 0)
  return { estado: 'ok', oportunidades: ops, completo }
}

// ─── Adjuntos ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type CuentaAdjuntos = { guardados: number; repetidos: number; sinClave: number; sinTabla: number; fallidos: number; omitidos: number }

/** Respuesta de `POST /api/operador/correo/adjunto` → a qué cubo va. Lo desconocido es fallo (no «guardado»). PURA. */
export function cuboAdjunto(status: number, json: unknown): keyof Omit<CuentaAdjuntos, 'omitidos'> {
  const e = obj(json).estado
  if (status === 200 && e === 'guardado') return 'guardados'
  if (status === 200 && e === 'repetido') return 'repetidos'
  if (status === 503 && e === 'sin_clave') return 'sinClave'
  if (status === 503 && e === 'sin_tabla') return 'sinTabla'
  return 'fallidos'
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** La línea 📎 (o `null` si no mandó adjuntos). Nunca nombres de fichero ni contenido. PURA. */
export function lineaAdjuntos(c: CuentaAdjuntos): string | null {
  const partes: string[] = []
  const ok = c.guardados + c.repetidos
  if (ok) partes.push(`📎 ${plural(ok, 'adjunto guardado', 'adjuntos guardados')} en su ficha (sin leer, cifrados)`)
  if (c.sinClave) partes.push(`📎 ${plural(c.sinClave, 'adjunto NO guardado', 'adjuntos NO guardados')}: asegura no tiene la clave de cifrado`)
  if (c.sinTabla) partes.push(`📎 ${plural(c.sinTabla, 'adjunto NO guardado', 'adjuntos NO guardados')}: falta el SQL 2026-10-19c en asegura`)
  if (c.fallidos) partes.push(`📎 ${plural(c.fallidos, 'adjunto que no se ha podido guardar', 'adjuntos que no se han podido guardar')}: están en su correo`)
  if (c.omitidos) partes.push(`📎 ${plural(c.omitidos, 'adjunto más se ha quedado', 'adjuntos más se han quedado')} sin guardar (tamaño o número): están en su correo`)
  return partes.length ? partes.join('\n') : null
}

// ─── El aviso de Telegram ─────────────────────────────────────────────────────────────────────────────────────────

const ramoTitulo = (r: string) => { const e = etiquetaRamo(r as RamoOportunidad); return e.charAt(0).toUpperCase() + e.slice(1) }
const etiquetas = (ramos: readonly string[], claves: Iterable<string>) => etiquetasDe(ramos, new Set(claves))
const y = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

export type ResumenRespuesta = {
  /** Claves que faltan (obligatorias) en alguna oportunidad + las inválidas: lo que pide la repregunta. */
  faltan: string[]
  invalidos: { clave: string; motivo: string }[]
  completo: boolean
  /** No se pudo leer o guardar: NO se repregunta a ciegas (podría pedir lo que ya mandó). */
  sinLeer: boolean
}

/** Lo que se sabe tras leer: qué falta, qué no vale y si está completo. PURA. */
export function resumirRespuesta(g: GuardadoLead, invalidosIa: readonly { clave: string; motivo: string }[], iaFallo: boolean): ResumenRespuesta {
  if (g.estado !== 'ok') return { faltan: [], invalidos: [...invalidosIa], completo: false, sinLeer: true }
  // Lo que MANDÓ pero asegura no pudo guardar por falta de clave (`sinClave`) no «falta»: repreguntarlo sería pedirle
  // otra vez lo que ya escribió. Se dice aparte («recibidos pero NO guardados») y el expediente no queda completo.
  const sinClave = new Set(g.oportunidades.flatMap((o) => o.sinClave))
  const faltan = new Set(g.oportunidades.flatMap((o) => o.faltan).filter((k) => !sinClave.has(k)))
  const invalidos = new Map(invalidosIa.map((x) => [x.clave, x]))
  for (const o of g.oportunidades) for (const k of o.invalidos) if (!invalidos.has(k)) invalidos.set(k, { clave: k, motivo: 'no tiene un formato válido' })
  return { faltan: [...faltan], invalidos: [...invalidos.values()], completo: g.completo && !iaFallo, sinLeer: iaFallo || g.oportunidades.some((o) => !o.guardado) }
}

/**
 * «📥 Ana ha respondido · Hogar» con ✔️/⚠️/❌/📎. Solo etiquetas (nada de valores). `iaFallo`: no se pudo leer el
 * correo; `guardado.estado === 'no'`: asegura no lo guardó. En ambos casos se dice y NO se da nada por recibido. PURA.
 */
export function textoRespuestaTelegram(a: {
  pila: string | null; ramos: readonly string[]; guardado: GuardadoLead; resumen: ResumenRespuesta; iaFallo: boolean; adjuntos: string | null
}): string {
  const quien = a.pila ? escapeHtml(a.pila) : 'El cliente'
  const ramos = a.ramos.length ? a.ramos.map(ramoTitulo).join(' y ') : 'sin ramo'
  const l: string[] = [`📥 <b>${quien} ha respondido</b> · ${escapeHtml(ramos)} (en su hilo de ${escapeHtml(MEDIADOR.identidad.email)})`]
  if (a.iaFallo) l.push('⚠️ <b>No he podido leer su respuesta</b> (la IA no ha contestado): no doy nada por recibido. Míralo en su correo.')
  if (a.guardado.estado !== 'ok') {
    l.push(`⚠️ <b>No se ha guardado nada</b> (${escapeHtml(a.guardado.motivo)}): míralo en su correo.`)
  } else {
    const ops = a.guardado.oportunidades
    const recibidos = etiquetas(a.ramos, ops.flatMap((o) => [...o.nuevos, ...o.iguales]))
    if (recibidos.length) l.push(`✔️ ${escapeHtml(y(recibidos))}`)
    else if (!a.iaFallo) l.push('✔️ <i>ningún dato nuevo que se pueda leer</i>')
    if (a.resumen.invalidos.length) {
      l.push(`⚠️ no valen: ${escapeHtml(a.resumen.invalidos.map((x) => `${etiquetas(a.ramos, [x.clave])[0] ?? x.clave} (${x.motivo})`).join(', '))}`)
    }
    const disc = etiquetas(a.ramos, ops.flatMap((o) => o.discrepancias))
    if (disc.length) l.push(`⚖️ no cuadran con lo que ya había (no lo piso; elige cuál vale con los botones, hasta entonces no está completo): ${escapeHtml(y(disc))}`)
    const prot = etiquetas(a.ramos, ops.flatMap((o) => o.protegidos))
    if (prot.length) l.push(`🔒 de un riesgo que ya confirmaste (guardado aparte, el riesgo no se toca): ${escapeHtml(y(prot))}`)
    const sinClave = etiquetas(a.ramos, ops.flatMap((o) => o.sinClave))
    if (sinClave.length) l.push(`⚠️ recibidos pero NO guardados (asegura no tiene la clave de cifrado): ${escapeHtml(y(sinClave))}`)
    for (const o of ops) if (!o.guardado) l.push(`⚠️ No he podido guardar lo de ${escapeHtml(ramoTitulo(o.ramo))}: no doy nada por sabido.`)
    if (a.resumen.completo) l.push(`✅ <b>Datos completos para ${escapeHtml(ramos)} — listo para tarificar</b>`)
    else if (a.resumen.faltan.length) l.push(`❌ faltan: ${escapeHtml(y(etiquetas(a.ramos, a.resumen.faltan)))}`)
  }
  if (a.adjuntos) l.push(a.adjuntos)
  return l.join('\n')
}

// ─── La repregunta ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * El borrador: SOLO lo que falta y lo que no vale (con el motivo, sin repetir el valor). Asunto «Re: …» del correo del
 * cliente; pie legal del mediador siempre. `null` si no hay nada que preguntar. PURA.
 */
export function plantillaRepregunta(a: {
  pila: string | null; ramos: readonly string[]; faltan: readonly string[]; invalidos: readonly { clave: string; motivo: string }[]; asuntoOriginal: string
  /**
   * F3b: códigos de pregunta CONCRETA (`PREGUNTAS_CONCRETAS`): lo que el cliente ya contestó pero no se lee con certeza. Su
   * clave se pregunta con ESA frase y no con la general del contrato.
   */
  concretas?: readonly string[]
}): { asunto: string; cuerpo: string; preguntas: number } | null {
  const concretas = preguntasConcretas(a.concretas ?? [])
  const conConcreta = new Set(concretas.map((c) => c.clave))
  const pedir = new Set([...a.faltan, ...a.invalidos.map((x) => x.clave)].filter((k) => !conConcreta.has(k)))
  if (!pedir.size && !concretas.length) return null
  const generales = pedir.size ? preguntasRepregunta(a.ramos, pedir) : []
  const bloques = concretas.length ? [...generales, { titulo: 'Sobre lo que me contestaste, para no equivocarme', preguntas: concretas.map((c) => c.pregunta) }] : generales
  const n = bloques.reduce((s, b) => s + b.preguntas.length, 0)
  if (!n) return null
  const pila = a.pila ? nombreDePila(a.pila) ?? a.pila : null
  const asunto = (/^\s*re:/i.test(a.asuntoOriginal) ? a.asuntoOriginal.trim() : `Re: ${a.asuntoOriginal.trim()}`).slice(0, 200)
  const queRamos = a.ramos.length ? a.ramos.map((r) => etiquetaRamo(r as RamoOportunidad)).join(' y ') : null
  const noValen = a.invalidos.map((x) => `- ${(etiquetas(a.ramos, [x.clave])[0] ?? x.clave).replace(/^./, (c) => c.toUpperCase())}: ${x.motivo}.`)
  const cuerpo = [
    pila ? `Hola ${pila}:` : 'Hola:',
    '',
    `Gracias por los datos. Para terminar la comparativa${queRamos ? ` del seguro de ${queRamos}` : ''} me falta poco:`,
    ...(noValen.length ? ['', 'Hay algo que no me cuadra, ¿me lo revisas?', ...noValen] : []),
    ...bloques.flatMap((b) => ['', ...(b.titulo ? [`${b.titulo}:`] : []), ...b.preguntas.map((p) => `- ${p}`)]),
    '',
    'Con eso te preparo la propuesta y te la envío.',
    '',
    'Un saludo,',
    '',
    pieLegalLeadCorreo(),
  ].join('\n')
  return { asunto, cuerpo, preguntas: n }
}

// ─── F3b: discrepancias (ficha ↔ correo) ─────────────────────────────────────────────────────────────────────────

export type Discrepancia = { oportunidadId: string; ramo: string; clave: string; elegida?: 'ficha' | 'correo' }

/** Las discrepancias pendientes de la respuesta guardada, en orden estable (el de los botones). Máximo 10. PURA. */
export function discrepanciasPendientes(g: GuardadoLead): Discrepancia[] {
  if (g.estado !== 'ok') return []
  return g.oportunidades.flatMap((o) => o.pendientes.map((clave) => ({ oportunidadId: o.id, ramo: o.ramo, clave }))).slice(0, 10)
}

/**
 * «⚖️ No cuadran» con un par de botones por dato: 📇 lo que ya había (la ficha) · ✉️ lo del correo. Solo ETIQUETAS (ni un
 * valor: Alberto los compara en su correo y en la ficha). `callback_data` = `clp_dis:<p>:<i>:f|c` (≤ 64 bytes). PURA.
 */
export function textoDiscrepancias(a: { id: number | string; pila: string | null; lista: readonly Discrepancia[] }): string {
  const quien = a.pila ? escapeHtml(a.pila) : 'el cliente'
  const l = [`⚖️ <b>Datos de ${quien} que no cuadran con los que había</b>: elige cuál vale en cada uno (el expediente no está completo hasta entonces; nada se envía al cliente).`]
  a.lista.forEach((d, i) => {
    const etq = etiquetasDe([d.ramo], new Set([d.clave]))[0] ?? d.clave
    l.push(`${i + 1}. ${escapeHtml(etq)}${d.elegida ? ` — elegido: ${d.elegida === 'ficha' ? 'lo que había' : 'el del correo'}` : ''}`)
  })
  l.push('<i>Míralos en su correo y en la ficha. «El del correo» no corrige la ficha: si es el bueno, corrígela también. #clp' + escapeHtml(String(a.id)) + '</i>')
  return l.join('\n')
}

export function botonesDiscrepancias(id: number | string, lista: readonly Discrepancia[]): Boton[][] {
  return lista.flatMap((d, i) => (d.elegida ? [] : [[
    { texto: `${i + 1}. 📇 Lo que había`, callback: `clp_dis:${id}:${i}:f` },
    { texto: `${i + 1}. ✉️ El del correo`, callback: `clp_dis:${id}:${i}:c` },
  ]]))
}

export type ResultadoElegir =
  | { estado: 'ok'; pendientes: string[]; completo: boolean; corregirFicha: boolean }
  | { estado: 'no_pendiente'; motivo: string }
  | { estado: 'no_encontrada'; motivo: string }
  | { estado: 'error'; motivo: string }

/** Respuesta de `accion:'elegir'`. Lo desconocido es `error` (no se da nada por elegido). PURA. */
export function leerElegir(status: number, json: unknown): ResultadoElegir {
  const o = obj(json)
  if (status === 200 && o.estado === 'ok' && Array.isArray(o.pendientes)) {
    return { estado: 'ok', pendientes: lista(o.pendientes), completo: o.completo === true, corregirFicha: o.corregirFicha === true }
  }
  if (status === 409 && o.estado === 'no_pendiente') return { estado: 'no_pendiente', motivo: 'ya estaba elegido' }
  if (status === 404) return { estado: 'no_encontrada', motivo: 'la oportunidad ya no es de esta ficha' }
  return { estado: 'error', motivo: typeof o.estado === 'string' ? `asegura: ${String(o.estado).slice(0, 40)}` : `HTTP ${status}` }
}
