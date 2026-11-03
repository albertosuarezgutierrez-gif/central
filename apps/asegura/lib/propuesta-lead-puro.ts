// F4 — la PROPUESTA de un lead de correo (19/10/2026, spec lead → propuesta §F4 y §3.4). Parte PURA de
// `propuesta-lead.ts`: validación del puerto, precio de la BD → opción comparada, decisión de envío y el correo en el hilo.
// Las reglas de negocio (necesidades IDD, encaje, recomendación, información previa) viven en `@central/module-seguros`
// (`propuesta-lead.ts`); aquí solo se encajan las filas de asegura en ellas.
//
// 🚨 Precio elegido = EXACTAMENTE el pulsado: se identifica por su clave estable (el id de la oferta) Y su prima. Si ya no
//    está o la prima cambió, no se envía ninguno (ni «el más parecido»): se avisa.
// 🚨 Solo sale lo ENVIABLE: precio de bot (RPA) no caducado, sin bloqueo anunciado, que ENCAJA con las necesidades
//    completas del cliente. Avant2 se enseña si ya hay precio, pero desde aquí no se envía (se manda desde su ficha).
import {
  bloqueoCompania, clasificarCoberturas, coberturasIncluidas, encajeOpcion, huellaPropuesta, ramoDeCatalogo, recomendarOpcion,
  type EstadoGarantia, type NecesidadesLead, type OpcionComparada, type Recomendacion,
} from '@central/module-seguros'
import { firmezaOfertaRpaGuardada } from '@central/module-tarificacion'
import { messageIdValido, type EnRespuestaA } from './correo-hilo.ts'
import { eur } from './dinero.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Estados del hilo con precio pedido (F3a) en los que se monta la propuesta. */
export const ESTADOS_HILO_CON_PRECIO = ['tarificando', 'tarificada'] as const
/** Estados del hilo desde los que un precio REAL de Avant2 (💶 `clp_cds`) lo pasa a `tarificada`. Ni antes (faltan datos)
 *  ni después (propuesta ya enviada): un precio pedido a mano no deshace el expediente. */
export const HILO_ANTES_DE_PRECIO = ['lista_para_tarificar', 'tarificando'] as const
/** Tras enviar la propuesta (SQL 2026-10-19e). F5 lee este estado y `propuesta_enviada_at` para el seguimiento. */
export const ESTADO_HILO_PROPUESTA_ENVIADA = 'propuesta_enviada'
/** Tipo del correo en `correo_envio` (y etiqueta en Resend). */
export const TIPO_CORREO_PROPUESTA_LEAD = 'presupuesto_aviso'

// ─── Validación del puerto ────────────────────────────────────────────────────────────────────────────────────────

export type PeticionPropuesta =
  | { accion: 'pendientes'; actor: string }
  | { accion: 'revisar'; hiloId: string; actor: string }
  | {
      accion: 'enviar'; hiloId: string; clave: string; primaEur: number; to: string; asunto: string; texto: string
      enRespuestaA: EnRespuestaA; idempotencia: string; actor: string
    }

/** Valida el cuerpo de `POST /api/operador/correo/propuesta-lead`. PURA. */
export function validarPeticionPropuesta(b: unknown): { ok: true; valor: PeticionPropuesta } | { ok: false; motivo: string } {
  const o = esObj(b) ? b : {}
  const actor = txt(o.actor).slice(0, 120)
  if (!/^[a-z][a-z0-9_.:@-]{2,119}$/i.test(actor)) return { ok: false, motivo: 'actor inválido' }
  if (o.accion === 'pendientes') return { ok: true, valor: { accion: 'pendientes', actor } }
  const hiloId = txt(o.hiloId)
  if (!/^\d{1,18}$/.test(hiloId)) return { ok: false, motivo: 'hiloId inválido' }
  if (o.accion === 'revisar') return { ok: true, valor: { accion: 'revisar', hiloId, actor } }
  if (o.accion !== 'enviar') return { ok: false, motivo: 'accion desconocida' }
  const clave = txt(o.clave)
  // Solo una oferta de la oportunidad (uuid): un precio de Avant2 (`cds:…`) no se envía desde aquí.
  if (!UUID.test(clave)) return { ok: false, motivo: 'clave de opción inválida' }
  const prima = typeof o.primaEur === 'number' && Number.isFinite(o.primaEur) && o.primaEur > 0 ? o.primaEur : null
  if (prima === null) return { ok: false, motivo: 'primaEur inválida' }
  const to = txt(o.to).toLowerCase()
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) return { ok: false, motivo: 'to no es una dirección simple' }
  const asunto = txt(o.asunto).replace(/[\r\n]+/g, ' ')
  if (!asunto || asunto.length > 300) return { ok: false, motivo: 'falta el asunto' }
  const texto = typeof o.texto === 'string' ? o.texto.trim() : ''
  if (texto.length < 20 || texto.length > 20_000) return { ok: false, motivo: 'el texto está vacío o es demasiado largo' }
  const en = esObj(o.enRespuestaA) ? o.enRespuestaA : null
  // Este puerto responde EN EL HILO: sin Message-ID válido no se manda (un correo suelto lo manda Alberto).
  if (!en || !messageIdValido(en.messageId)) return { ok: false, motivo: 'enRespuestaA.messageId no válido' }
  const refs = Array.isArray(en.references) ? en.references.filter(messageIdValido) : []
  const references = refs.length > 50 ? [refs[0], ...refs.slice(-49)] : refs
  const idempotencia = txt(o.idempotencia)
  if (!/^[A-Za-z0-9_:-]{4,128}$/.test(idempotencia)) return { ok: false, motivo: 'idempotencia no válida' }
  return {
    ok: true,
    valor: { accion: 'enviar', hiloId, clave: clave.toLowerCase(), primaEur: prima, to, asunto, texto, enRespuestaA: { messageId: en.messageId as string, references }, idempotencia, actor },
  }
}

// ─── Filas de la BD → opción comparada ────────────────────────────────────────────────────────────────────────────

const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

/** Coberturas de una oferta del bot (`OfertaNormalizada.coberturas`) → catálogo. `null` = no se pudieron leer. PURA. */
export function garantiasDeCoberturasRpa(ramo: string | null | undefined, coberturas: unknown, producto: string | null): Record<string, EstadoGarantia> | null {
  const r = ramoDeCatalogo(ramo)
  if (!r || !Array.isArray(coberturas) || coberturas.length === 0) return null
  const lista = coberturas.filter(esObj).map((c) => ({
    nombre: txt(c.literal) || txt(c.clave),
    incluida: c.estado === 'incluida' ? true : c.estado === 'excluida' ? false : null,
    texto: null,
  })).filter((c) => c.nombre)
  if (!lista.length) return null
  return clasificarCoberturas(r, lista, null, { categoria: null, modalidad: producto }).porClave
}

/** Lo que se lee de una oferta del bot (`oportunidad_oferta` + su respuesta del portal). */
export type FilaOfertaRpa = {
  id: string
  compania: string | null
  producto: string | null
  primaTotal: unknown
  estado: string
  datosExtra: unknown
  /** La oferta tal como la guardó el worker (`tarificaciones.respuesta.ofertas[i]`). `null` = no se encontró. */
  oferta: { coberturas: unknown; avisos: unknown; producto?: unknown; polizaAnteriorTecleada?: unknown } | null
  /** Código de compañía del trabajo (`tarificaciones.respuesta.compania`: `mapfre`, `occident`…). Ausente = no se sabe → `estimado`. */
  companiaTrabajo?: string | null
}

/** Oferta del bot → opción comparada (prima, franquicia general, firmeza «estimado», catálogo, bloqueo, caducidad). PURA. */
export function opcionDeOfertaRpa(ramo: string | null | undefined, f: FilaOfertaRpa, hoy: string): OpcionComparada | null {
  const prima = numero(f.primaTotal)
  if (prima === null || prima <= 0) return null
  const extra = esObj(f.datosExtra) ? f.datosExtra : {}
  const franquicia = numero(extra.franquiciaGeneral)
  const avisos = Array.isArray(f.oferta?.avisos) ? f.oferta!.avisos.filter((a): a is string => typeof a === 'string') : []
  const validez = txt(extra.validezHasta)
  return {
    clave: f.id.toLowerCase(),
    origen: 'rpa',
    compania: f.compania?.trim() || 'Compañía sin nombre',
    producto: f.producto?.trim() || null,
    primaEur: Math.round(prima * 100) / 100,
    franquiciaEur: franquicia !== null && franquicia >= 0 ? franquicia : null,
    // Precio de portal: una OFERTA estimada (la compañía lo confirma al emitir), como en el borrador del bot; `firme` solo con la regla
    // SINCO (30/10/2026: compañía ≠ Occident, auto, el bot tecleó el nº de póliza anterior que traía el riesgo).
    firmeza: firmezaOfertaRpaGuardada(f.companiaTrabajo, ramo, f.oferta ? { ...(f.oferta.polizaAnteriorTecleada === true ? { polizaAnteriorTecleada: true as const } : {}) } : null),
    garantias: f.oferta ? garantiasDeCoberturasRpa(ramo, f.oferta.coberturas, f.producto) : null,
    bloqueo: bloqueoCompania(avisos),
    caducada: /^\d{4}-\d{2}-\d{2}/.test(validez) ? validez.slice(0, 10) < hoy : false,
  }
}

/** Lo que se lee de un precio de Avant2 (`tarificacion_precios` de la última tarificación REAL de la oportunidad). */
export type FilaPrecioAvant2 = {
  id: string; compania: string | null; producto: string | null; prima_eur: unknown; franquicia_eur: unknown; firmeza: string | null
  avisos: unknown; garantias: unknown
}

/** Precio de Avant2 → opción comparada (solo para enseñarla: no se envía desde F4). PURA. */
export function opcionDePrecioAvant2(f: FilaPrecioAvant2): OpcionComparada | null {
  const prima = numero(f.prima_eur)
  if (prima === null || prima <= 0) return null
  const franquicia = numero(f.franquicia_eur)
  const avisos = Array.isArray(f.avisos) ? f.avisos.map((a) => (typeof a === 'string' ? a : esObj(a) ? txt(a.texto) || txt(a.text) : '')).filter(Boolean) : []
  const g = esObj(f.garantias) && esObj(f.garantias.porClave) ? (f.garantias.porClave as Record<string, EstadoGarantia>) : null
  return {
    clave: `cds:${f.id.toLowerCase()}`,
    origen: 'avant2',
    compania: f.compania?.trim() || 'Compañía sin nombre',
    producto: f.producto?.trim() || null,
    primaEur: Math.round(prima * 100) / 100,
    franquiciaEur: franquicia !== null && franquicia >= 0 ? franquicia : null,
    // Sin firmeza guardada NO es firme: es «estimado» (nunca se supone lo mejor).
    firmeza: f.firmeza === 'firme' || f.firmeza === 'condicionado' ? f.firmeza : 'estimado',
    garantias: g,
    bloqueo: bloqueoCompania(avisos),
    caducada: false,
  }
}

// ─── La propuesta ─────────────────────────────────────────────────────────────────────────────────────────────────

export type OpcionPropuesta = OpcionComparada & {
  enviable: boolean
  /** Por qué no se puede enviar desde Telegram (`null` si se puede). */
  motivoNoEnviable: string | null
  encaja: boolean
  falla: string[]
  /** Coberturas del catálogo que el precio AFIRMA (etiquetas). */
  coberturas: string[]
}

export type CabeceraPropuesta = {
  hiloId: string; clienteId: string; oportunidadId: string; ramo: string; pila: string | null; estadoDatos: string
  messageIdRaiz: string; messageIds: string[]
}

export type Propuesta = CabeceraPropuesta & {
  necesidades: NecesidadesLead
  opciones: OpcionPropuesta[]
  recomendada: Recomendacion
  huella: string
}

/** Arma la propuesta: encaje de cada precio, enviables, recomendada y huella. Orden: de la prima más baja a la más alta. PURA. */
export function armarPropuesta(cab: CabeceraPropuesta, necesidades: NecesidadesLead, precios: readonly OpcionComparada[]): Propuesta {
  const opciones: OpcionPropuesta[] = [...precios]
    .sort((a, b) => a.primaEur - b.primaEur || a.clave.localeCompare(b.clave))
    .map((o) => {
      const e = encajeOpcion(cab.ramo, o, necesidades)
      const motivoNoEnviable = o.origen !== 'rpa'
        ? 'precio de Avant2: se envía desde su ficha'
        : !necesidades.completas
          ? 'faltan necesidades del cliente'
          : !e.encaja ? `no encaja: ${e.falla.join(', ')}` : null
      return { ...o, enviable: motivoNoEnviable === null, motivoNoEnviable, encaja: e.encaja, falla: e.falla, coberturas: coberturasIncluidas(cab.ramo, o) }
    })
  const recomendada = recomendarOpcion(cab.ramo, opciones, necesidades)
  return { ...cab, necesidades, opciones, recomendada, huella: huellaPropuesta(opciones, necesidades.respuestas) }
}

export type DecisionEnvio =
  | { ok: true; opcion: OpcionPropuesta }
  | { ok: false; estado: 'ya_enviada' | 'necesidades_incompletas' | 'opcion_no_esta' | 'precio_cambiado' | 'no_enviable'; detalle: string }

/**
 * ¿Se puede enviar ESA opción? Con la propuesta recalculada AHORA (los precios y las necesidades pueden haber cambiado
 * desde que Alberto vio el aviso). Nunca sustituye la pulsada por otra. PURA.
 */
export function decidirEnvio(p: Pick<Propuesta, 'estadoDatos' | 'necesidades' | 'opciones'>, clave: string, primaEur: number): DecisionEnvio {
  if (p.estadoDatos === ESTADO_HILO_PROPUESTA_ENVIADA) return { ok: false, estado: 'ya_enviada', detalle: 'A este lead ya se le envió una propuesta.' }
  if (!p.necesidades.completas) return { ok: false, estado: 'necesidades_incompletas', detalle: `Faltan ${p.necesidades.faltan.length} necesidades del cliente: sin ellas no se le propone nada.` }
  const o = p.opciones.find((x) => x.clave === clave.toLowerCase())
  if (!o) return { ok: false, estado: 'opcion_no_esta', detalle: 'Ese precio ya no está en la comparativa: no se envía otro en su lugar.' }
  if (Math.abs(o.primaEur - primaEur) >= 0.005) return { ok: false, estado: 'precio_cambiado', detalle: `La prima de ${o.compania} ha cambiado desde el aviso: no se envía.` }
  if (!o.enviable) return { ok: false, estado: 'no_enviable', detalle: o.motivoNoEnviable ?? 'No se puede enviar.' }
  return { ok: true, opcion: o }
}

// ─── El correo en el hilo ─────────────────────────────────────────────────────────────────────────────────────────

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * El aviso del presupuesto (`correoPresupuesto`, con el enlace al portal) como RESPUESTA en el hilo: el texto que aprobó
 * Alberto va delante (con la información previa del mediador ya garantizada) y el asunto es el del hilo. PURA.
 */
export function correoEnHilo(c: { asunto: string; texto: string; html: string }, h: { asunto: string; intro: string }): { asunto: string; texto: string; html: string } {
  const intro = h.intro.replace(/\r\n/g, '\n').trim()
  const parrafos = intro.split(/\n{2,}/).map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapar(p).replace(/\n/g, '<br>')}</p>`).join('')
  return {
    asunto: h.asunto,
    texto: `${intro}\n\n${c.texto}`,
    html: `<div style="max-width:560px;margin:0 auto;padding:16px 12px;font-family:'Nunito Sans',system-ui,sans-serif;color:#1d2340">${parrafos}</div>${c.html}`,
  }
}

/** Texto del historial de la ficha (sin importes de terceros ni datos del cliente: compañía, prima y quién lo aprobó). PURA. */
export function textoHistorialPropuesta(a: { compania: string; primaEur: number; actor: string; asunto: string }): string {
  return `Propuesta enviada por correo en el hilo de su mensaje («${a.asunto.slice(0, 160)}»): ${a.compania} ${eur(a.primaEur)}, con el portal y la aceptación firmada. OK de ${a.actor}.`.slice(0, 2000)
}
