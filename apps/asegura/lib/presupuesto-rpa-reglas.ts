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

/** Reparto de los avisos de una oferta: los que ve el cliente y los internos (notas de la oferta). */
export function repartirAvisos(avisos: readonly string[]): { cliente: string[]; internos: string[] } {
  const cliente: string[] = []
  const internos: string[] = []
  for (const a of avisos) {
    const t = a.trim()
    if (!t) continue
    ;(avisoParaCliente(t) ? cliente : internos).push(t)
  }
  return { cliente, internos }
}

/** El aviso fijo de cada opción RPA (se enseña SIEMPRE, delante de los de la compañía/bot). */
export const AVISO_OPCION_RPA =
  'Precio obtenido por nuestro tarificador en el portal de la compañía: es una oferta ESTIMADA, no un precio cerrado. ' +
  'La compañía lo confirma al emitir y tu corredor lo revisa antes de enviártelo.'

/** Avisos VISIBLES de la opción: el fijo + solo los de la lista permitida (los supuestos, como supuestos, nunca como dato). */
export function avisosOpcionRpa(avisos: readonly string[]): string[] {
  return [AVISO_OPCION_RPA, ...repartirAvisos(avisos).cliente]
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
      avisos: repartirAvisos(o.avisos).cliente,
      // Lo que el bot anotó para nosotros (lectura de la pantalla, iconos…): notas internas, nunca al cliente.
      avisosInternos: repartirAvisos(o.avisos).internos,
      supuestos: supuestosDe(o.avisos),
      // `true` = el portal no dio ninguna cobertura legible: NO CONSTAN (no «no cubre»).
      coberturasNoConstan: o.coberturas.length === 0,
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
}

/** El Telegram para Alberto (parse_mode HTML: todo lo variable, escapado). Solo nombre de pila o referencia: sin NIF ni teléfono. */
export function textoAvisoPresupuestoRpa(e: EntradaAvisoRpa): string {
  const quien = e.cliente ? `${e.cliente} · ${e.referencia}` : e.referencia
  const rango = rangoPrimas(e.primas)
  const companias = [...new Set(e.companias)].join(', ')
  return [
    `🤖 <b>Presupuesto en BORRADOR</b> preparado por el tarificador (${escapeHtml(e.ramo)})`,
    `Cliente: ${escapeHtml(quien)}`,
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
