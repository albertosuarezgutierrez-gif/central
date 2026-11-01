// Presupuesto en BORRADOR tras el tarificador RPA (18/10/2026, decisión de Alberto: «todo con bot»). Reglas PURAS
// (sin BD ni red): la BD vive en `presupuesto-rpa.ts`. Test: `presupuesto-rpa-reglas.test.ts`.
//
// 🚨 NADA de aquí envía nada al cliente. El bot deja un borrador de origen `ofertas` cuyas opciones salen de filas de
//    `oportunidad_oferta` en estado `extraida`: el trigger `presupuesto_no_enviar_simulado()` NO deja que salga hasta que
//    Alberto revise cada oferta en la oportunidad, y el envío sigue siendo `accion:'avisar'` a mano.
// 🚨 Cobertura AUSENTE = no consta (`null`), nunca «no cubre». Solo `estado: 'excluida'` del portal es `incluida: false`.
// 🚨 Un supuesto del bot («Precio con supuestos: …») viaja como AVISO, nunca como dato del riesgo.

import { escapeHtml } from '@central/core-telegram'
import { nombreDePila } from '@central/module-seguros'
import { franquiciaGeneral as franquiciaGeneralRpa, garantiasComoRegistro, validarOfertas, type OfertaNormalizada } from '@central/module-tarificacion'
import type { SobreCoberturas } from './codeoscopic/coberturas-presupuesto.ts'
import { eur } from './dinero.ts'

/** Quién firma lo que hace el bot (columna `creado_por` de presupuesto y ofertas). Así se distinguen de los manuales. */
export const ACTOR_RPA = 'tarificador-rpa'

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

// ─── Coberturas ───────────────────────────────────────────────────────────────

/**
 * Las coberturas de una oferta RPA (`OfertaNormalizada.coberturas`, o el mismo array leído del jsonb
 * `tarificaciones.respuesta.ofertas[]`) en el SOBRE que ya entiende `coberturasDeSobre()` (Codeoscopic):
 * `{ estado: 'leidas', lista: [{ nombre, incluida, texto }], leidasAt }`.
 *
 * `null` = el portal no dio ninguna cobertura legible, o ninguna dice si cubre o no → NO CONSTA. No se escribe sobre: la columna se queda en su
 * default (`[]` desnudo = «no se intentó» → `lista: null`). Jamás `vacias`, que se leería como «no cubre nada».
 */
export function sobreCoberturasRpa(coberturas: unknown, leidasAt: string): SobreCoberturas | null {
  if (!Array.isArray(coberturas)) return null
  const lista: { nombre: string; incluida: boolean | null; texto: string | null }[] = []
  for (const c of coberturas) {
    const o = obj(c)
    const nombre = txt(o?.literal) ?? txt(o?.clave)
    if (!o || !nombre) continue
    const detalle = [
      num(o.capital) !== null ? `Capital ${eur(num(o.capital))}` : null,
      num(o.limite) !== null ? `Límite ${eur(num(o.limite))}` : null,
      num(o.franquicia) !== null ? `Franquicia ${eur(num(o.franquicia))}` : null,
    ].filter(Boolean).join(' · ')
    lista.push({
      nombre,
      // Solo lo que el portal AFIRMA: `excluida` → no cubre; `incluida` → cubre; sin estado → no consta en esa línea.
      incluida: o.estado === 'incluida' ? true : o.estado === 'excluida' ? false : null,
      texto: detalle || null,
    })
  }
  // Si NINGUNA línea dice si cubre o no, la lista no afirma nada: no constan (no un sobre «leídas» de puros «no consta»).
  if (!lista.some((c) => c.incluida !== null)) return null
  return { estado: 'leidas', lista, leidasAt }
}

/** Garantías en la forma de `oportunidad_oferta.garantias` (`ValorGarantia`). `null` = no constan (≠ `{}` «leída sin garantías»). */
export function garantiasRpa(o: OfertaNormalizada): Record<string, unknown> | null {
  if (o.coberturas.length === 0) return null
  const g = garantiasComoRegistro(o)
  return Object.keys(g).length > 0 ? g : null
}

/** El formato EXACTO con el que el bot declara lo que supuso (`textoSupuestos` de module-tarificacion). */
const PREFIJO_SUPUESTOS = /^Precio con supuestos: \S/

/** Los avisos del bot que son SUPUESTOS declarados (lo que el adaptador dio por hecho para poder tarificar). */
export function supuestosDe(avisos: readonly string[]): string[] {
  return avisos.map((a) => a.trim()).filter((a) => PREFIJO_SUPUESTOS.test(a))
}

/**
 * Avisos del bot que el CLIENTE puede ver en su opción (lista permitida, por forma exacta): los supuestos declarados y lo
 * que afecta a contratar o al vehículo tarificado. El resto (cómo se leyó la pantalla, iconos, «coberturas no leídas»…)
 * es interno: va a `datos_extra.avisosInternos` de la oferta, nunca al texto de la opción.
 */
const AVISOS_CLIENTE: readonly RegExp[] = [
  PREFIJO_SUPUESTOS,
  /^[A-ZÁÉÍÓÚ][\p{L} ]{1,40} exige la verificación del vehículo antes de contratar este producto\.$/u,
  /^Vehículo según el catálogo de [\p{L} ]{1,40}: .{1,200}\.$/u,
  /^Versión elegida por similitud con el vehículo confirmado en /,
]

export function avisoParaCliente(aviso: string): boolean {
  const a = aviso.trim()
  return a !== '' && AVISOS_CLIENTE.some((re) => re.test(a))
}

// ─── Supuestos: frase limpia para el cliente, detalle y alertas para Alberto (18/10/2026) ──────────────
//
// El texto crudo del bot («Precio con supuestos: vehículo/versión: el primero de la lista (supuesto, había 5), código
// postal fijado por Allianz (no editable), distinto de la ficha…») es jerga de pantalla: «había N», «fijado por
// Allianz», «no editable», «distinto de la ficha» no le dicen nada al cliente y SÍ le importan a Alberto. Se trocea
// por comas de primer nivel (las de dentro de paréntesis/comillas no cortan) y cada trozo se traduce por TABLA:
//   · traducción conocida → frase para el cliente;
//   · `null` → interno (dato de cómo se rellenó el portal);
//   · trozo desconocido → interno, y la frase del cliente lo reconoce sin inventarlo («y algún dato más…»).
// El crudo ENTERO va siempre a las notas internas. Un dato que la compañía usó DISTINTO de la ficha es ALERTA.

/** Lo que la frase del cliente dice del vehículo cuando el bot cogió la primera versión: la primera, no «la habitual». */
const VERSION_PRIMERA = 'la primera versión del vehículo que propone la compañía para tu matrícula'

/** Traducción por trozo (se prueba en orden; la primera que casa decide). `null` = interno. */
const TRADUCCION_SUPUESTOS: readonly (readonly [RegExp, string | null])[] = [
  [/^vehículo\/versión: el primero de la lista\b/i, VERSION_PRIMERA],
  [/^versión: la primera de la lista\b/i, VERSION_PRIMERA],
  [/^versión elegida por similitud\b/i, 'la versión del vehículo más parecida a la de tus datos'],
  [/^vehículo nuevo$/i, 'vehículo nuevo'],
  [/^uso diario$/i, 'uso diario del vehículo'],
  [/^garaje colectivo$/i, 'aparcado en garaje colectivo'],
  [/^sin 2º conductor$/i, 'sin segundo conductor'],
  [/^procede de otra compañía$/i, 'vienes de otra compañía'],
  [/^sin siniestros$/i, 'sin siniestros'],
  [/^años asegurado: 5 o más\b/i, '5 años o más asegurado'],
  [/^siniestros en 5 años: ninguno\b/i, 'ningún siniestro en los últimos 5 años'],
  [/^tiempo en la compañía: 5 años o más\b/i, '5 años o más en tu compañía actual'],
  [/^partes culpables: ninguno\b/i, 'ningún parte con culpa'],
  [/^tiempo como titular de un seguro: 9-10 años o más\b/i, 'más de 9 años con un seguro a tu nombre'],
  [/^el tomador es el propietario$/i, 'el tomador es también el propietario del vehículo'],
  [/^el tomador es el conductor$/i, 'el tomador es el conductor habitual'],
  // Internos: cómo estaba el portal, no algo que el cliente pueda confirmar o corregir.
  [/fijad[oa] por /i, null],
  [/^localidad: la que propone el portal\b/i, null],
  [/^compañía actual: sin indicar\b/i, null],
  [/^póliza actual:/i, null],
]

/** Trozos de primer nivel del texto de supuestos (sin el prefijo). «…, distinto de la ficha» se pega al trozo anterior. */
export function trozosSupuestos(aviso: string): string[] | null {
  const t = aviso.trim()
  if (!PREFIJO_SUPUESTOS.test(t)) return null
  const cuerpo = t.replace(/^Precio con supuestos:\s*/, '').replace(/\.\s*$/, '')
  const trozos: string[] = []
  let nivel = 0
  let actual = ''
  for (const ch of cuerpo) {
    if (ch === '(' || ch === '«') nivel++
    else if ((ch === ')' || ch === '»') && nivel > 0) nivel--
    if (ch === ',' && nivel === 0) { trozos.push(actual.trim()); actual = ''; continue }
    actual += ch
  }
  trozos.push(actual.trim())
  const out: string[] = []
  for (const x of trozos.filter(Boolean)) {
    if (/^distint[oa] de la ficha$/i.test(x) && out.length > 0) out[out.length - 1] = `${out[out.length - 1]}, ${x}`
    else out.push(x)
  }
  return out
}

export type SupuestosTraducidos = {
  /** La frase que ve el cliente. `null` = el aviso no es de supuestos. */
  cliente: string | null
  /** El texto crudo, para las notas internas de la oferta. */
  internos: string[]
  /** Datos que la compañía usó DISTINTOS de la ficha: alerta para Alberto (Telegram + oferta en plataforma). */
  alertas: string[]
}

/** Qué dato de la ficha cambió la compañía, en palabras de Alberto. */
function alertaDeTrozo(trozo: string, compania: string | null): string | null {
  if (!/distint[oa] de la ficha/i.test(trozo)) return null
  const quien = compania?.trim() || 'La compañía'
  if (/^código postal\b/i.test(trozo)) return `${quien} ha calculado el precio con un código postal DISTINTO del de la ficha (lo fija el portal y no se puede cambiar): revísalo antes de enviar.`
  if (/^localidad\b/i.test(trozo)) return `${quien} ha calculado el precio con una localidad DISTINTA de la de la ficha (la fija el portal y no se puede cambiar): revísalo antes de enviar.`
  return `${quien} ha calculado el precio con un dato DISTINTO de la ficha («${trozo}»): revísalo antes de enviar.`
}

/**
 * El aviso «Precio con supuestos: …» del bot → frase limpia para el cliente + crudo interno + alertas. PURA.
 * Un aviso que no tiene ese formato devuelve `cliente: null` y no se toca (lo reparte `repartirAvisos`).
 */
export function traducirSupuestos(aviso: string, compania: string | null = null): SupuestosTraducidos {
  const trozos = trozosSupuestos(aviso)
  if (!trozos) return { cliente: null, internos: [], alertas: [] }
  const frases: string[] = []
  const alertas: string[] = []
  let quedaAlgo = false
  for (const trozo of trozos) {
    const a = alertaDeTrozo(trozo, compania)
    if (a && !alertas.includes(a)) alertas.push(a)
    const regla = TRADUCCION_SUPUESTOS.find(([re]) => re.test(trozo))
    const frase = regla ? regla[1] : null
    if (frase === null) { quedaAlgo = true; continue }
    if (!frases.includes(frase)) frases.push(frase)
  }
  const resto = 'algún dato más que tu corredor confirmará antes de contratar'
  const cliente = frases.length > 0
    ? `Precio calculado con estas suposiciones: ${frases.join('; ')}${quedaAlgo ? `; y ${resto}` : ''}.`
    : `Precio calculado con ${resto}.`
  return { cliente, internos: [aviso.trim()], alertas }
}

/** Las alertas para Alberto de todos los avisos de una oferta (sin repetir). */
export function alertasDeAvisos(avisos: readonly string[], compania: string | null): string[] {
  const out: string[] = []
  for (const a of avisos) for (const x of traducirSupuestos(a, compania).alertas) if (!out.includes(x)) out.push(x)
  return out
}

/**
 * Reparto de los avisos de una oferta: los que ve el cliente y los internos (notas de la oferta). Los SUPUESTOS no
 * llegan crudos al cliente: él ve la frase limpia y el crudo va a las notas internas.
 */
export function repartirAvisos(avisos: readonly string[], compania: string | null = null): { cliente: string[]; internos: string[] } {
  const cliente: string[] = []
  const internos: string[] = []
  for (const a of avisos) {
    const t = a.trim()
    if (!t) continue
    const s = traducirSupuestos(t, compania)
    if (s.cliente !== null) {
      if (!cliente.includes(s.cliente)) cliente.push(s.cliente)
      internos.push(...s.internos)
      continue
    }
    ;(avisoParaCliente(t) ? cliente : internos).push(t)
  }
  return { cliente, internos }
}

/** El aviso fijo de cada opción RPA (se enseña SIEMPRE, delante de los de la compañía/bot). */
export const AVISO_OPCION_RPA =
  'Precio obtenido por nuestro tarificador en el portal de la compañía: es una oferta ESTIMADA, no un precio cerrado. ' +
  'La compañía lo confirma al emitir y tu corredor lo revisa antes de enviártelo.'

/** Avisos VISIBLES de la opción: el fijo + solo los de la lista permitida (los supuestos, como supuestos, nunca como dato). */
export function avisosOpcionRpa(avisos: readonly string[], compania: string | null = null): string[] {
  return [AVISO_OPCION_RPA, ...repartirAvisos(avisos, compania).cliente]
}

// ─── Ofertas guardadas → filas ────────────────────────────────────────────────

/** Una oferta RPA leída de `tarificaciones.respuesta`, con su clave estable `tarificacionId:indice`. */
export type OfertaRpaLeida = {
  clave: string
  tarificacionId: string
  trabajoId: string
  indice: number
  oferta: OfertaNormalizada
  /** El PDF del portal (`seguros.documentos`) si el worker lo trajo. `null` = no consta. */
  documentoId: string | null
}

/**
 * `tarificaciones.respuesta` (canal rpa) → ofertas validadas OTRA VEZ con `validarOfertas` (lo guardado vino del worker).
 * Si alguna no valida, la tarificación entera se descarta (devuelve `null`): mejor no presupuestarla que hacerlo a medias.
 * La clave `tarificacionId:indice` es la MISMA que usa `propuesta-oportunidad-reglas.ts` (índice en el array guardado).
 */
export function ofertasDeRespuesta(respuesta: unknown, ids: { tarificacionId: string; trabajoId: string }): OfertaRpaLeida[] | null {
  const r = obj(respuesta)
  const crudas = Array.isArray(r?.ofertas) ? (r!.ofertas as unknown[]) : null
  if (!crudas || crudas.length === 0) return null
  // `pdf.indice` apuntaba a los PDF del POST (ya no están): se valida sin él, el documento va en `documentoId`.
  const sinPdf = crudas.map((c) => { const o = obj(c); return o ? { ...o, pdf: null } : c })
  const v = validarOfertas(sinPdf, 0)
  if (!v.ok) return null
  return v.ofertas.map((oferta, indice) => ({
    clave: `${ids.tarificacionId}:${indice}`,
    tarificacionId: ids.tarificacionId,
    trabajoId: ids.trabajoId,
    indice,
    oferta,
    documentoId: txt(obj(crudas[indice])?.documentoId),
  }))
}

/** Lo que se escribe en `oportunidad_oferta` por cada oferta RPA (estado `extraida`: la revisión es de Alberto). */
export function filaOfertaRpa(l: OfertaRpaLeida): {
  compania: string
  producto: string
  primaNeta: number | null
  primaTotal: number
  garantias: Record<string, unknown> | null
  datosExtra: Record<string, unknown>
} {
  const o = l.oferta
  const literales: Record<string, string> = {}
  for (const c of o.coberturas) if (!literales[c.clave]) literales[c.clave] = c.literal
  return {
    compania: o.compania,
    producto: o.producto,
    primaNeta: o.primaNetaEur,
    primaTotal: o.primaAnualEur,
    garantias: garantiasRpa(o),
    datosExtra: {
      origen: 'rpa',
      rpaClave: l.clave,
      trabajoId: l.trabajoId,
      tarificacionId: l.tarificacionId,
      documentoPortalId: l.documentoId,
      referenciaPortal: o.referenciaPortal,
      fraccionamiento: o.fraccionamiento,
      importeReciboEur: o.importeReciboEur,
      // Mismo nombre que lee `caducidadOfertas()`: la validez que dio el portal (null = no la dio).
      validezHasta: o.validaHasta,
      franquiciaGeneral: franquiciaGeneralRpa(o),
      literales,
      avisos: repartirAvisos(o.avisos, o.compania).cliente,
      // Lo que el bot anotó para nosotros (lectura de la pantalla, iconos, el texto crudo de los supuestos…): notas
      // internas, nunca al cliente.
      avisosInternos: repartirAvisos(o.avisos, o.compania).internos,
      // Datos que la compañía usó DISTINTOS de la ficha (CP/localidad fijados por el portal…): ALERTA para Alberto.
      alertasCorredor: alertasDeAvisos(o.avisos, o.compania),
      supuestos: supuestosDe(o.avisos),
      // `true` = el portal no dio ninguna cobertura legible: NO CONSTAN (no «no cubre»).
      coberturasNoConstan: o.coberturas.length === 0,
      // 18/10/2026: CP, localidad y vehículo que la COMPAÑÍA usó, leídos de su portal (cada campo null = no se leyó; nunca la
      // ficha). `null` = el bot no los leyó.
      datosUsados: o.datosUsados ?? null,
    },
  }
}

/** La clave RPA guardada en `datos_extra.rpaClave` de una fila de `oportunidad_oferta` (`null` = no es del bot). */
export function claveRpaDeFila(datosExtra: unknown): string | null {
  const d = obj(datosExtra)
  return d?.origen === 'rpa' ? txt(d.rpaClave) : null
}

// ─── Cuándo se dispara ────────────────────────────────────────────────────────

/** Estados que todavía pueden traer ofertas solos (el reintentable vuelve a la cola sin que nadie lo toque). */
const ABIERTOS = new Set(['pendiente', 'en_curso', 'error_reintentable'])

export type TrabajoParaDisparo = { estado: string; modo: string | null; tarificacionId: string | null }

/**
 * ¿Se prepara ya el presupuesto de la oportunidad? Solo cuando NINGÚN trabajo de tarificar sigue abierto y hay al menos
 * un `ok` con tarificación. Exploraciones, humo y emisiones no cuentan. Un `atascado` espera a Alberto: no bloquea
 * (si luego da ofertas, su `ok` vuelve a disparar y el borrador del bot se sustituye).
 */
export function decidirDisparo(trabajos: readonly TrabajoParaDisparo[]): { disparar: true } | { disparar: false; motivo: 'abiertos' | 'sin_ok' } {
  const deTarificar = trabajos.filter((t) => (t.modo ?? 'tarificar') === 'tarificar')
  if (deTarificar.some((t) => ABIERTOS.has(t.estado))) return { disparar: false, motivo: 'abiertos' }
  if (!deTarificar.some((t) => t.estado === 'ok' && t.tarificacionId)) return { disparar: false, motivo: 'sin_ok' }
  return { disparar: true }
}

/**
 * ¿El cierre de ESTE trabajo puede ser el último de la oportunidad y disparar el borrador? (01/11/2026) Cualquier trabajo de tarificar
 * que ya NO está abierto: `ok`, pero también `error_definitivo`, `requiere_humano`, `cancelado`, `atascado`… Antes solo el `ok`: si el
 * último en cerrarse fallaba, el borrador con los `ok` de los demás no se creaba nunca. Después decide `decidirDisparo` (hace falta un
 * `ok` y ningún abierto). PURA.
 */
export function cierrePuedeDispararPresupuesto(estado: string, modo: string | null): boolean {
  return (modo ?? 'tarificar') === 'tarificar' && !ABIERTOS.has(estado)
}

/** Mismo conjunto de ids (orden indiferente). Para no duplicar un borrador con exactamente las mismas ofertas. */
export function mismoConjunto(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return s.size === new Set(b).size && b.every((x) => s.has(x))
}

// ─── Sustituir borradores anteriores del bot ─────────────────────────────────

export type EventoBorrador = { tipo: string; origen: string; detalle: unknown }
export type BorradorPrevio = { id: string; creadoAt: Date; ocultas: number; eventos: readonly EventoBorrador[] }

/**
 * ¿Alberto ya ha tocado este borrador del bot? Cualquier cosa que no sea lo que hace el propio bot al crearlo (`preparado`
 * del sistema y las necesidades DEDUCIDAS) cuenta: ocultar opciones, escribir necesidades, descargar el PDF… Ante la
 * duda, tocado (conservador: no se le retira trabajo hecho).
 */
export function borradorTocado(b: Pick<BorradorPrevio, 'ocultas' | 'eventos'>): boolean {
  if (b.ocultas > 0) return true
  return b.eventos.some((e) => {
    if (e.tipo === 'preparado' && e.origen === 'sistema') return false
    if (e.tipo === 'necesidades' && obj(e.detalle)?.deducido === true) return false
    return true
  })
}

/** Vía del presupuesto que monta la PROPUESTA de un lead (F4) al pulsar 📤: va en el detalle de su evento `preparado`. */
export const VIA_PROPUESTA_LEAD = 'propuesta_lead'

export type PresupuestoPrevio = Pick<BorradorPrevio, 'ocultas' | 'eventos'> & { creadoPor: string | null }

/**
 * Al enviar la propuesta de un lead (F4), ¿se retira este presupuesto de la MISMA oportunidad que no ha salido? Solo lo
 * que montó el propio flujo automático: el borrador del bot que Alberto no ha tocado (`borradorTocado`) o un presupuesto
 * de otro 📤 de la propuesta que no llegó a salir (sin opciones ocultas). Lo hecho a mano —y el borrador del bot que
 * Alberto ya ha tocado— NUNCA (revisión F4, 19/10/2026). Ante la duda, se conserva. PURA.
 */
export function sustituiblePorPropuestaLead(p: PresupuestoPrevio): boolean {
  if (p.creadoPor === ACTOR_RPA) return !borradorTocado(p)
  const deLaPropuesta = p.eventos.some((e) => e.tipo === 'preparado' && obj(e.detalle)?.via === VIA_PROPUESTA_LEAD)
  // 🚨 Solo si NADIE lo ha tocado después: cualquier evento que no sea del propio 📤 (Alberto editó necesidades, generó
  //    un enlace, lo descargó, salió o quedó incierto…) lo conserva. Lista CERRADA: un evento nuevo cuenta como tocado.
  return deLaPropuesta && p.ocultas === 0 && p.eventos.every(eventoPropioDeLaPropuesta)
}

/** Motivos de `envio_fallido` que aseguran que el correo NO salió (el `rechazado` antiguo podía ser un corte). */
const FALLO_SEGURO = new Set(['sin_proveedor', 'remitente_no_verificado', 'cancelado'])

/** ¿Lo escribió el propio flujo del 📤 (y no deja rastro en el cliente)? PURA. */
function eventoPropioDeLaPropuesta(e: EventoBorrador): boolean {
  const d = obj(e.detalle)
  if (e.tipo === 'preparado') return d?.via === VIA_PROPUESTA_LEAD
  if (e.tipo === 'necesidades') return d?.via === 'lead_correo' || d?.deducido === true
  if (e.tipo === 'envio_fallido') return typeof d?.motivo === 'string' && FALLO_SEGURO.has(d.motivo)
  return false
}

export type DecisionSustitucion =
  | { accion: 'abandonar' }
  | { accion: 'crear'; retirar: string[]; conservar: string[] }

/**
 * Qué hacer con los borradores vivos del bot (ya bajo el cerrojo). `inicio` = cuándo empezó ESTA ejecución (es también el
 * `creado_at` de lo que crea). Un borrador creado DESPUÉS de `inicio` es de una ejecución más nueva, que leyó datos más
 * recientes: esta abandona sin crear ni retirar. Los tocados por Alberto se conservan (y se le avisa); el resto se retira.
 */
export function decidirSustitucion(inicio: Date, previos: readonly BorradorPrevio[]): DecisionSustitucion {
  if (previos.some((p) => p.creadoAt.getTime() > inicio.getTime())) return { accion: 'abandonar' }
  const retirar: string[] = []
  const conservar: string[] = []
  for (const p of previos) (borradorTocado(p) ? conservar : retirar).push(p.id)
  return { accion: 'crear', retirar, conservar }
}

// ─── Tope de la IA (resumen del estudio) ─────────────────────────────────────

export const MAX_LLAMADAS_IA_24H = 12
export const MAX_EUR_IA_24H = 0.5
/** Coste ESTIMADO de una narrativa (≈900 tokens de salida + el cuadro, categoría `redaccion`). El real queda en `ai_usos`. */
export const EUR_ESTIMADO_NARRATIVA = 0.05

/**
 * ¿Se le pide la narrativa a la IA? Con ≥12 llamadas automáticas en 24 h, o si la siguiente pasaría de 0,50 €
 * estimados, NO: el estudio sale con la narrativa determinista y se dice. Entrada rara (NaN, negativo) → no (fail-closed).
 */
export function decidirIaAuto(e: { llamadas24h: number; eur24h: number }): { usar: true } | { usar: false; motivo: string } {
  if (!Number.isFinite(e.llamadas24h) || !Number.isFinite(e.eur24h) || e.llamadas24h < 0 || e.eur24h < 0) {
    return { usar: false, motivo: 'no se ha podido contar el gasto de IA de las últimas 24 h' }
  }
  if (e.llamadas24h >= MAX_LLAMADAS_IA_24H) return { usar: false, motivo: `tope de ${MAX_LLAMADAS_IA_24H} resúmenes IA en 24 h alcanzado` }
  if (e.eur24h + EUR_ESTIMADO_NARRATIVA > MAX_EUR_IA_24H + 1e-9) return { usar: false, motivo: `tope de ${eur(MAX_EUR_IA_24H)} de IA en 24 h alcanzado` }
  return { usar: true }
}

// ─── Aviso a Alberto (Telegram, interno) ─────────────────────────────────────

/** El nombre de pila (`nombreDePila` de module-seguros: `null` en cuanto duda). Nunca apellidos ni NIF. */
export { nombreDePila }

export function enlaceOportunidad(oportunidadId: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/correduria/oportunidad/${encodeURIComponent(oportunidadId)}`
}

/** «de 392,02€ a 1.212,65€» (o el único importe). `null` = no hay primas (no se inventa un rango). */
export function rangoPrimas(primas: readonly number[]): string | null {
  const v = primas.filter((p) => Number.isFinite(p) && p > 0)
  if (v.length === 0) return null
  const min = Math.min(...v)
  const max = Math.max(...v)
  return min === max ? eur(min) : `de ${eur(min)} a ${eur(max)}`
}

export type EntradaAvisoRpa = {
  /** Nombre de pila; `null` → se usa la referencia interna. */
  cliente: string | null
  referencia: string
  ramo: string
  companias: string[]
  primas: number[]
  enlace: string
  /** `ia` = resumen redactado por la IA; `determinista` = sin IA (motivo en `sinIa`). */
  narrativa: 'ia' | 'determinista'
  sinIa: string | null
  /** Compañías cuya respuesta no se pudo leer (no entran en el borrador). */
  sinLeer?: string[]
  /** Borradores anteriores del bot que Alberto ya había tocado: se dejan los dos. */
  conservados?: number
  /** Datos que la compañía usó DISTINTOS de la ficha (`alertasDeAvisos`): van arriba, en negrita. */
  alertas?: string[]
}

/** El Telegram para Alberto (parse_mode HTML: todo lo variable, escapado). Solo nombre de pila o referencia: sin NIF ni teléfono. */
export function textoAvisoPresupuestoRpa(e: EntradaAvisoRpa): string {
  const quien = e.cliente ? `${e.cliente} · ${e.referencia}` : e.referencia
  const rango = rangoPrimas(e.primas)
  const companias = [...new Set(e.companias)].join(', ')
  return [
    `🤖 <b>Presupuesto en BORRADOR</b> preparado por el tarificador (${escapeHtml(e.ramo)})`,
    `Cliente: ${escapeHtml(quien)}`,
    ...[...new Set(e.alertas ?? [])].map((a) => `⚠️ <b>Alerta</b>: ${escapeHtml(a)}`),
    `Ofertas: ${e.primas.length}${companias ? ` (${escapeHtml(companias)})` : ''}`,
    `Primas anuales: ${rango ? escapeHtml(rango) : 'no constan'}`,
    ...(e.sinLeer?.length ? [`Sin leer: ${escapeHtml([...new Set(e.sinLeer)].join(', '))} (no entran en el borrador).`] : []),
    ...(e.conservados ? [`Hay ${e.conservados === 1 ? 'otro borrador' : `${e.conservados} borradores`} del bot que ya habías tocado: lo${e.conservados === 1 ? '' : 's'} dejo. Mira cuál vale y retira el otro.`] : []),
    e.narrativa === 'ia'
      ? 'Estudio comparativo con resumen redactado por la IA (validado contra las cifras).'
      : `Estudio comparativo SIN resumen IA${e.sinIa ? ` (${escapeHtml(e.sinIa)})` : ''}: lleva el resumen determinista.`,
    'No se ha enviado NADA al cliente. Revisa cada oferta en la oportunidad y envíalo tú.',
    `<a href="${escapeHtml(e.enlace)}">Abrir la oportunidad</a>`,
  ].join('\n')
}

export type EntradaCorteRpa = {
  cliente: string | null
  referencia: string
  ramo: string
  /** Por qué no se ha preparado el borrador. */
  motivo: 'caducada' | 'todas_descartadas'
  /** Compañías caducadas (solo `caducada`). */
  companias?: string[]
  sinLeer?: string[]
  enlace: string
}

/** Telegram a Alberto cuando el proceso se CORTA (no hay borrador): que no crea que está hecho. */
export function textoAvisoCorteRpa(e: EntradaCorteRpa): string {
  const quien = e.cliente ? `${e.cliente} · ${e.referencia}` : e.referencia
  const porque = e.motivo === 'caducada'
    ? `la oferta de ${e.companias?.length ? [...new Set(e.companias)].join(', ') : 'una compañía'} ya ha caducado según la propia compañía`
    : 'todas las ofertas del bot están descartadas en la oportunidad'
  return [
    `⚠️ <b>Sin presupuesto</b>: el tarificador terminó pero NO se ha preparado el borrador (${escapeHtml(e.ramo)})`,
    `Cliente: ${escapeHtml(quien)}`,
    `Motivo: ${escapeHtml(porque)}.`,
    ...(e.sinLeer?.length ? [`Sin leer: ${escapeHtml([...new Set(e.sinLeer)].join(', '))}.`] : []),
    'No se ha enviado nada al cliente.',
    `<a href="${escapeHtml(e.enlace)}">Abrir la oportunidad</a>`,
  ].join('\n')
}
