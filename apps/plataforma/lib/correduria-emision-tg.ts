// Emitir desde el asistente de la correduría por Telegram (fase 3a, 26/09/2026) — parte PURA
// (sin `@/` ni prisma → node --test). La parte con BD y red vive en `correduria-asistente-telegram.ts`.
//
// Principio (spec `docs/superpowers/specs/2026-09-26-importar-avant2-y-emitir-telegram-design.md`):
// **la IA nunca emite ni escribe el resumen.** El resumen lo construye esto con lo que devuelve la
// lectura GRATIS del proyecto (`GET /api/operador/codeoscopic/importar`); la IA solo decide cuándo
// pedirlo. El único camino a `/emitir` es el botón `cas_emitir`, de un solo uso, que rehace esta
// misma lectura y compara la HUELLA: si algo cambió desde que Alberto leyó el resumen, no se emite.
import { createHash } from 'node:crypto'
import type { OfertaImportable, RespuestaEmitir, VistaImportacion } from './retarificar-asegura.ts'
import { lineasTrasEmision } from './tras-emision-texto.ts'
export { lineasTrasEmision }

/** Minutos que vale un resumen: pasado eso, el botón no emite y hay que pedirlo otra vez. */
export const MINUTOS_PROPUESTA = 15

/** Quien firma la emisión en el rastro de asegura (`solicitadoPor`, auditoría). */
export const ACTOR_EMISION_TG = 'agente:asistente-telegram'

/** ¿Está encendida la emisión por Telegram? Apagada por defecto: solo un «sí» explícito la enciende. */
export function emisionTgActiva(valor: string | undefined): boolean {
  return /^(1|true|s[ií]|on)$/i.test((valor ?? '').trim())
}

export const URL_PLATAFORMA_POR_DEFECTO = 'https://plataforma-ten-flame.vercel.app'

/** Enlace a la ficha de la póliza en la intranet (misma base que los avisos de leads). */
export function urlPoliza(polizaId: string, base: string = process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO): string {
  return `${base.replace(/\/$/, '')}/correduria/poliza/${encodeURIComponent(polizaId)}`
}

/** Número de proyecto de Avant2: solo cifras (lo que se ve en `/production/NÚMERO/`). */
export function proyectoValido(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isInteger(v) ? String(v) : ''
  return /^\d{1,12}$/.test(s) ? s : null
}

/**
 * Lo que Alberto confirma. Todo sale de asegura; los `null` son «no consta» y se pintan así. El
 * documento y la cuenta llegan YA enmascarados del puerto: el dato completo no pasa por aquí.
 */
export interface ResumenEmision {
  polizaId: string
  projectId: string
  quoteId: string
  compania: string
  categoria: string
  pago: string | null
  primaEur: number | null
  primerReciboEur: number | null
  efecto: string | null
  caduca: string | null
  titular: { nombre: string | null; documento: string | null; direccion: string | null; codigoPostal: string | null }
  /** La calle que irá a la compañía y de dónde sale (`ficha` = el proyecto la traía a medias). */
  direccionEmision: { texto: string | null; origen: 'proyecto' | 'ficha' }
  matricula: string | null
  cuenta: { enmascarada: string; descripcion: string | null }
}

export type Preparacion =
  | { tipo: 'resumen'; resumen: ResumenEmision }
  /** No se puede proponer: el texto va a la IA para que se lo diga a Alberto. */
  | { tipo: 'no'; motivo: string }
  /** Hay varios precios emitibles y no se ha dicho cuál: la IA pregunta. */
  | { tipo: 'elegir'; ofertas: OfertaImportable[] }

/**
 * De la lectura del proyecto al resumen, o al motivo por el que no hay botón. Conservador: cualquier
 * cosa que la intranet enseñaría como aviso aquí impide el botón, porque en un chat no hay pantalla
 * donde verlo antes de pulsar.
 */
/**
 * Lo que trae el PROYECTO de Avant2, para que un «no coincide» diga con qué no coincide: sin esto Alberto
 * no distingue un proyecto de otro cliente de un dato mal tecleado. El documento ya llega enmascarado.
 */
function loQueTraeElProyecto(vista: Extract<VistaImportacion, { estado: 'ok' }>): string {
  const partes: string[] = []
  if (vista.tomador === 'distinto' || vista.tomador === 'sin_dato') {
    const t = vista.titular
    partes.push(t ? `tomador ${t.nombre ?? 'sin nombre'}, documento ${t.documento ?? 'no consta'}` : 'tomador no legible')
  }
  if (vista.vehiculo === 'distinto' || vista.vehiculo === 'sin_dato') partes.push(`matrícula ${vista.matricula ?? 'no consta'}`)
  return partes.length ? ` (en el proyecto: ${partes.join('; ')})` : ''
}

export function prepararResumen(polizaId: string, vista: VistaImportacion, quoteId: string | null): Preparacion {
  if (vista.estado === 'sin_configurar') return { tipo: 'no', motivo: `la emisión no está disponible: ${vista.mensaje}` }
  if (vista.estado === 'error') return { tipo: 'no', motivo: `no he podido leer el proyecto: ${vista.mensaje}` }
  if (vista.bloqueos.length > 0) return { tipo: 'no', motivo: `no se puede emitir: ${vista.bloqueos.join(' · ')}${loQueTraeElProyecto(vista)}` }
  if (vista.tomador !== 'coincide' || vista.vehiculo !== 'coincide') {
    return { tipo: 'no', motivo: `no se ha podido comprobar que tomador y vehículo sean los de esta póliza${loQueTraeElProyecto(vista)}` }
  }
  if (!vista.cuentaInformada || vista.titular === null) {
    return { tipo: 'no', motivo: 'asegura no manda todavía el tomador o la cuenta para el resumen: emite desde la intranet' }
  }
  if (vista.ofertas.length === 0) {
    return {
      tipo: 'no',
      motivo: `ningún precio del proyecto se puede emitir todavía (${vista.otras} sin confirmar en Avant2 o caducados). Confírmalo en Avant2 y vuelve a pedírmelo`,
    }
  }
  let oferta: OfertaImportable | undefined
  if (quoteId) {
    oferta = vista.ofertas.find((o) => o.quoteId === quoteId)
    if (!oferta) return { tipo: 'no', motivo: `el precio ${quoteId} no está entre los emitibles del proyecto` }
  } else if (vista.ofertas.length === 1) {
    oferta = vista.ofertas[0]
  } else {
    return { tipo: 'elegir', ofertas: vista.ofertas }
  }
  const categoria = oferta.categoria ?? oferta.modalidad
  if (!oferta.compania || !categoria) return { tipo: 'no', motivo: 'el precio no trae compañía o modalidad legibles: emite desde la intranet' }
  // Sin prima o sin fecha de efecto no hay botón: Alberto firmaría un contrato cuyo precio no ha visto.
  if (oferta.primaEur === null || !oferta.efecto) {
    return { tipo: 'no', motivo: 'el precio no trae la prima o la fecha de efecto legibles: míralo en Avant2 o emite desde la intranet' }
  }
  // La calle: si el proyecto la trae a medias, `/emitir` la completa ENTERA desde la ficha; si tampoco
  // la ficha la tiene, no hay botón (la compañía la exige y se mandaría una dirección inservible).
  if (vista.direccion?.origen === 'falta') {
    const faltan = vista.direccion.faltan.length ? ` (${vista.direccion.faltan.join(', ')})` : ''
    return {
      tipo: 'no',
      motivo: `la dirección del tomador está incompleta en Avant2 y la ficha tampoco la tiene completa${faltan}: corrígela en la ficha del cliente y pídeme el resumen otra vez`,
    }
  }
  const direccionEmision = vista.direccion?.origen === 'ficha'
    ? { texto: vista.direccion.texto, origen: 'ficha' as const }
    : { texto: vista.direccion?.origen === 'proyecto' ? vista.direccion.texto : vista.titular.direccion, origen: 'proyecto' as const }
  if (!vista.cuenta) {
    const porque =
      vista.cuentaAviso === 'no_comprobada' ? 'no se ha podido leer la cuenta de la ficha'
        : vista.cuentaAviso === 'ilegible' ? 'la cuenta de la ficha está cifrada y no se puede leer'
          : vista.cuentaAviso === 'invalida' ? 'la cuenta de la ficha no pasa los dígitos de control'
            : 'la ficha no tiene cuenta de cargo'
    // Por Telegram no se teclea un IBAN (fase 3a): sin cuenta confirmable no hay botón.
    return { tipo: 'no', motivo: `${porque}: ponla en la ficha del cliente o emite desde la intranet, donde se puede teclear` }
  }
  return {
    tipo: 'resumen',
    resumen: {
      polizaId,
      projectId: vista.projectId,
      quoteId: oferta.quoteId,
      compania: oferta.compania,
      categoria,
      pago: oferta.pago,
      primaEur: oferta.primaEur,
      primerReciboEur: oferta.primerReciboEur,
      efecto: oferta.efecto,
      caduca: oferta.caduca,
      titular: vista.titular,
      direccionEmision,
      matricula: vista.matricula,
      cuenta: { enmascarada: vista.cuenta.enmascarada, descripcion: vista.cuenta.descripcion },
    },
  }
}

/** JSON con las claves ordenadas: el mismo resumen da siempre la misma cadena. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** Huella del resumen: si cambia un céntimo, la fecha o la cuenta, cambia la huella. */
export function huellaResumen(r: ResumenEmision): string {
  return createHash('sha256').update(canonico(r)).digest('hex')
}

// ── Texto para Telegram ──────────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

function fecha(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'no consta'
}

const oNoConsta = (v: string | null) => (v ? esc(v) : '<i>no consta</i>')

/** El resumen que va encima de los botones. Solo datos del puerto; nada escrito por la IA. */
export function textoResumen(r: ResumenEmision): string {
  const prima = r.primaEur !== null ? eur(r.primaEur) : 'no consta'
  const recibo = r.primerReciboEur !== null && r.primerReciboEur !== r.primaEur ? ` · primer recibo ${eur(r.primerReciboEur)}` : ''
  return [
    '🛡️ <b>Emisión lista para confirmar</b>',
    '',
    `<b>${esc(r.compania)}</b> · ${esc(r.categoria)}`,
    `Prima ${prima}${recibo}${r.pago ? ` · pago ${esc(r.pago)}` : ''}`,
    `Efecto ${fecha(r.efecto)} · el precio caduca ${fecha(r.caduca)}`,
    '',
    `Tomador: ${oNoConsta(r.titular.nombre)} (${oNoConsta(r.titular.documento)})`,
    `Dirección: ${oNoConsta(r.direccionEmision.texto)}${r.titular.codigoPostal ? `, ${esc(r.titular.codigoPostal)}` : ''}${
      r.direccionEmision.origen === 'ficha' ? ' <i>(de la ficha: en Avant2 estaba incompleta; se corrige antes de enviar)</i>' : ''}`,
    `Vehículo: ${oNoConsta(r.matricula)}`,
    `Cuenta de cargo: ${esc(r.cuenta.enmascarada)}${r.cuenta.descripcion ? ` (${esc(r.cuenta.descripcion)})` : ''}`,
    '',
    `Proyecto Avant2 ${esc(r.projectId)} · precio ${esc(r.quoteId)}`,
    // Pulsar es también el OK de este correo concreto: se dice ANTES, no se descubre después.
    '📧 Al emitir, el cliente recibe un correo con su nuevo seguro y la carta de baja de la póliza anterior para firmar en el portal.',
    `⚠️ Emitir es IRREVERSIBLE: crea el contrato con la compañía. El botón vale ${MINUTOS_PROPUESTA} minutos y un solo uso.`,
  ].join('\n')
}

// ── Resultado del Submit ─────────────────────────────────────────────────────────────────────────

export type EstadoFinal = 'emitida' | 'rechazada' | 'incierta'

/**
 * ¿Consta que NO se ha emitido? Solo los rechazos que asegura da ANTES del Submit o que el vendor
 * da limpiamente (4xx declarado sin duda). Cualquier otra cosa —un 500 sin cuerpo, una red caída,
 * una respuesta rara— es «puede haberse emitido»: decir «no se ha emitido» sobre un Submit que
 * salió sería el error más caro (revisión de alto riesgo, 26/09/2026).
 */
function rechazoLimpio(r: Extract<RespuestaEmitir, { estado: 'error' }>): boolean {
  if (r.quizaEmitido === true || r.motivo === 'red' || r.motivo === 'respuesta_ilegible') return false
  if (r.motivo === 'secreto_rechazado') return true
  const st = r.status
  if (st === undefined) return false
  if (st === 502) return r.quizaDeclarado === false
  if (st === 503) return r.causa === 'sin_libro' || r.causa === 'apagado'
  if (st >= 500) return false
  if (st === 409) return r.causa !== 'ya_emitida' && r.causa !== 'reintento_sin_confirmar'
  return st >= 400
}

/**
 * Qué pasó y qué decir. **Nunca se ofrece reintentar**: el vendor no deduplica y un segundo Submit
 * puede ser la segunda póliza del mismo coche. Lo que no sea un «sí» o un «no» claro es `incierta`.
 */
export function resultadoEmision(r: RespuestaEmitir, urlIntranet: string): { estado: EstadoFinal; texto: string } {
  const mirar = `Míralo en la intranet antes de hacer nada: ${urlIntranet}`
  switch (r.estado) {
    case 'ok':
      return {
        estado: 'emitida',
        texto: `✅ Emitida${r.referenciaVendor ? `: póliza nº ${esc(r.referenciaVendor)}` : ' (la compañía aún no ha dado número)'}. Queda en la cartera y el PDF, si la compañía lo ha mandado, en la ficha: ${urlIntranet}${lineasTrasEmision(r.trasEmision)}`,
      }
    case 'emitido_sin_acunar':
      return { estado: 'emitida', texto: `✅ La compañía la ha aceptado, pero no se ha podido registrar sola en la cartera: ${esc(r.mensaje)} ${mirar}` }
    case 'faltan_campos':
      return {
        estado: 'rechazada',
        texto: `✖️ No se ha emitido nada: faltan datos (${esc(r.faltan.join(', ') || 'sin detallar')}).${r.mensaje ? ` ${esc(r.mensaje)}` : ''} Complétalos y emite desde la intranet: ${urlIntranet}`,
      }
    case 'sin_configurar':
      return { estado: 'rechazada', texto: `✖️ No se ha emitido nada: ${esc(r.mensaje)}` }
    case 'en_vuelo':
    case 'reintento_sin_confirmar':
      return { estado: 'incierta', texto: `⚠️ ${esc(r.mensaje)} Puede haberse emitido. ${mirar}` }
    case 'error': {
      const incierta = !rechazoLimpio(r)
      return incierta
        ? { estado: 'incierta', texto: `⚠️ No hay respuesta clara (${esc(r.mensaje)}). Puede haberse emitido: NO lo repitas. ${mirar}` }
        : { estado: 'rechazada', texto: `✖️ No se ha emitido: ${esc(r.mensaje)} ${mirar}` }
    }
  }
}
