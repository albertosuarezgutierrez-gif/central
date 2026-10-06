// «Precio Allianz (bot)» — lo PURO (06/10/2026): sin red, sin envs, importable desde `'use client'`.
//
// 🚨 TARIFICAR ≠ EMITIR: esto pide un PRECIO al portal de la compañía. Nada de aquí contrata.

export const COMPANIA_BOT = 'allianz'

/**
 * Los selects de ePAC «Comunidades 2020» viajan como texto LIBRE (el adaptador intenta etiqueta y luego
 * `value`; si no casa, error `datos`). No hay catálogo cerrado: estas son las etiquetas ya vistas en el
 * portal (TODO(valores admitidos) en `module-tarificacion`). El formulario las sugiere y deja escribir otra.
 */
export const OPCIONES_TIPO_VIVIENDA = ['Viviendas Pisos en Alto'] as const
export const OPCIONES_USO = ['Habitual'] as const
export const OPCIONES_LISTA_PROPIETARIOS = ['> 50%'] as const

export type FormularioRiesgo = {
  fechaEfecto: string
  fechaTermino: string
  m2Construidos: string
  anioConstruccion: string
  tipoVivienda: string
  uso: string
  plantas: string
  numEdificios: string
  numViviendasYLocales: string
  listaPropietarios: string
  codigoPostal: string
  via: string
  numero: string
  municipio: string
  provincia: string
  ascensor: '' | 'si' | 'no'
  piscina: '' | 'si' | 'no'
  calidadConstruccion: '' | 'normal' | 'alta' | 'lujo'
}

const dos = (n: number) => String(n).padStart(2, '0')
const aIso = (d: Date) => `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`

/** Mañana y mañana + 1 año (ISO `AAAA-MM-DD`, en UTC: la fecha es un día de calendario, no un instante). */
export function fechasPorDefecto(hoy: Date = new Date()): { fechaEfecto: string; fechaTermino: string } {
  const efecto = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 1))
  const termino = new Date(Date.UTC(efecto.getUTCFullYear() + 1, efecto.getUTCMonth(), efecto.getUTCDate()))
  return { fechaEfecto: aIso(efecto), fechaTermino: aIso(termino) }
}

/** Formulario inicial. Prefill SOLO con lo que la ficha tiene (CP válido de 5 dígitos, ciudad, provincia, calle). */
export function formularioInicial(
  c: { codigoPostal?: string | null; ciudad?: string | null; provincia?: string | null; direccion?: string | null } | null | undefined,
  hoy: Date = new Date(),
): FormularioRiesgo {
  const cp = (c?.codigoPostal ?? '').trim()
  return {
    ...fechasPorDefecto(hoy),
    m2Construidos: '', anioConstruccion: '', tipoVivienda: OPCIONES_TIPO_VIVIENDA[0], uso: OPCIONES_USO[0],
    plantas: '', numEdificios: '1', numViviendasYLocales: '', listaPropietarios: OPCIONES_LISTA_PROPIETARIOS[0],
    codigoPostal: /^\d{5}$/.test(cp) ? cp : '',
    via: (c?.direccion ?? '').trim(), numero: '',
    municipio: (c?.ciudad ?? '').trim(), provincia: (c?.provincia ?? '').trim(),
    ascensor: '', piscina: '', calidadConstruccion: '',
  }
}

const entero = (s: string): number | null => (/^\d{1,9}$/.test(s.trim()) ? Number(s.trim()) : null)
const texto = (s: string): string | null => (s.trim() ? s.trim() : null)
const triestado = (v: '' | 'si' | 'no'): boolean | null => (v === 'si' ? true : v === 'no' ? false : null)

/**
 * Formulario → `riesgo` para asegura. Vacío = `null`/ausente («no se ha preguntado»), nunca 0 ni false.
 * Los errores que da son de FORMA (campo vacío o no numérico); la validación de dominio la hace asegura.
 */
export function riesgoDesdeFormulario(f: FormularioRiesgo): { ok: true; riesgo: Record<string, unknown> } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const num = (etiqueta: string, s: string): number | null => {
    const n = entero(s)
    if (n === null) errores.push(`${etiqueta}: pon un número entero`)
    return n
  }
  const req = (etiqueta: string, s: string): string | null => {
    const t = texto(s)
    if (t === null) errores.push(`${etiqueta}: obligatorio`)
    return t
  }
  const fechaEfecto = req('Fecha de efecto', f.fechaEfecto)
  const fechaTermino = req('Fecha de término', f.fechaTermino)
  if (fechaEfecto && fechaTermino && fechaTermino <= fechaEfecto) errores.push('La fecha de término tiene que ser posterior a la de efecto')
  const m2 = num('Metros cuadrados', f.m2Construidos)
  const anio = num('Año de construcción', f.anioConstruccion)
  const plantas = num('Plantas sobre la calle', f.plantas)
  const nEdif = num('Nº de edificios', f.numEdificios)
  const nViv = num('Nº de viviendas y locales', f.numViviendasYLocales)
  const tipoVivienda = req('Tipo de vivienda', f.tipoVivienda)
  const uso = req('Uso', f.uso)
  const lista = req('Lista de propietarios', f.listaPropietarios)
  const cp = texto(f.codigoPostal)
  if (!cp || !/^\d{5}$/.test(cp)) errores.push('Código postal: 5 dígitos')
  if (errores.length) return { ok: false, errores }
  const riesgo: Record<string, unknown> = {
    ramo: 'comunidades',
    direccion: { via: texto(f.via), numero: texto(f.numero), codigoPostal: cp, municipio: texto(f.municipio), provincia: texto(f.provincia) },
    fechaEfecto, fechaTermino, m2Construidos: m2, anioConstruccion: anio, tipoVivienda, uso,
    plantas, numEdificios: nEdif, numViviendasYLocales: nViv, listaPropietarios: lista,
    ascensor: triestado(f.ascensor), piscina: triestado(f.piscina),
    calidadConstruccion: f.calidadConstruccion || null,
  }
  return { ok: true, riesgo }
}

// ─── Lo que devuelve asegura ────────────────────────────────────────────────

export type OfertaBot = {
  compania: string; producto: string; primaTotalAnual: number
  primaNeta: number | null; impuestos: number | null; pdfIndice: number | null
}
export type TrabajoBot = {
  estado: string; creadoEn: string; actualizadoEn: string
  error: { tipo: string; mensaje: string } | null
  ofertas: OfertaBot[]; pdfs: { indice: number; nombre: string }[]
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** `null` = no tiene forma de trabajo (versión de asegura distinta o error): no se pinta nada inventado. */
export function leerTrabajoBot(v: unknown): TrabajoBot | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.estado !== 'string') return null
  const e = o.error && typeof o.error === 'object' ? (o.error as Record<string, unknown>) : null
  const ofertas: OfertaBot[] = []
  for (const x of Array.isArray(o.ofertas) ? o.ofertas : []) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    const total = num(r.primaTotalAnual)
    if (total === null) continue
    ofertas.push({
      compania: typeof r.compania === 'string' ? r.compania : '', producto: typeof r.producto === 'string' ? r.producto : '',
      primaTotalAnual: total, primaNeta: num(r.primaNeta), impuestos: num(r.impuestos), pdfIndice: num(r.pdfIndice),
    })
  }
  const pdfs: { indice: number; nombre: string }[] = []
  for (const x of Array.isArray(o.pdfs) ? o.pdfs : []) {
    const r = x as Record<string, unknown> | null
    const i = num(r?.indice)
    if (i !== null) pdfs.push({ indice: i, nombre: typeof r?.nombre === 'string' ? r.nombre : `oferta-${i + 1}.pdf` })
  }
  return {
    estado: o.estado, creadoEn: String(o.creadoEn ?? ''), actualizadoEn: String(o.actualizadoEn ?? ''),
    error: e ? { tipo: typeof e.tipo === 'string' ? e.tipo : 'desconocido', mensaje: typeof e.mensaje === 'string' ? e.mensaje : '' } : null,
    ofertas, pdfs,
  }
}

/** ¿Hay que seguir sondeando? Pendiente, en curso y el reintento de infraestructura. */
export function sigueEnCurso(estado: string): boolean {
  return estado === 'pendiente' || estado === 'en_curso' || estado === 'error_reintentable'
}

export const SONDEO_MS = 5_000
export const SONDEO_MAX_MS = 6 * 60_000

export type Vista = { tono: 'curso' | 'ok' | 'error'; titulo: string; detalle: string | null }

/** Frase legible de un trabajo. `requiere_humano` ≠ error del bot: Allianz pide a una persona. */
export function vistaTrabajo(t: TrabajoBot): Vista {
  switch (t.estado) {
    case 'pendiente': return { tono: 'curso', titulo: 'En cola', detalle: 'El bot aún no ha empezado.' }
    case 'en_curso': return { tono: 'curso', titulo: 'El bot está cotizando en Allianz', detalle: 'Suele tardar un par de minutos.' }
    case 'error_reintentable': return { tono: 'curso', titulo: 'Reintentando', detalle: 'Falló por un problema de conexión; el bot lo intenta otra vez.' }
    case 'ok': return t.ofertas.length
      ? { tono: 'ok', titulo: 'Precio listo', detalle: null }
      : { tono: 'error', titulo: 'El bot terminó pero no devolvió ninguna oferta', detalle: null }
    case 'requiere_humano': return { tono: 'error', titulo: 'Allianz pide verificación humana', detalle: t.error?.mensaje || null }
    case 'cancelado': return { tono: 'error', titulo: 'Cancelado', detalle: null }
    case 'error_definitivo': return { tono: 'error', titulo: 'El bot no ha podido sacar el precio', detalle: t.error ? `${t.error.tipo}${t.error.mensaje ? `: ${t.error.mensaje}` : ''}` : null }
    default: return { tono: 'error', titulo: `Estado desconocido (${t.estado})`, detalle: null }
  }
}

/** Respuesta de encolar de asegura → texto para Alberto. */
export function mensajeEncolar(status: number, json: unknown): { ok: true; trabajoId: string } | { ok: false; mensaje: string } {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  if (status === 202 && typeof j.trabajoId === 'string') return { ok: true, trabajoId: j.trabajoId }
  if (status === 503 && j.estado === 'apagado') return { ok: false, mensaje: 'El bot está apagado (TARIFICADOR_RPA_ACTIVO)' }
  if (status === 503 && j.estado === 'sin_configurar') return { ok: false, mensaje: 'Falta ASEGURA_OPERADOR_SECRET en plataforma' }
  if (status === 409) return { ok: false, mensaje: `Allianz no está autorizada para el bot${typeof j.motivo === 'string' ? ` (${j.motivo})` : ''}` }
  if (status === 400 && Array.isArray(j.errores)) return { ok: false, mensaje: `Datos no válidos: ${j.errores.filter((x) => typeof x === 'string').join('; ')}` }
  if (status === 401) return { ok: false, mensaje: 'asegura rechazó el secreto de operador' }
  if (status === 502) return { ok: false, mensaje: 'asegura no ha respondido: vuelve a intentarlo' }
  return { ok: false, mensaje: `asegura respondió ${status}${typeof j.mensaje === 'string' ? `: ${j.mensaje}` : typeof j.motivo === 'string' ? `: ${j.motivo}` : ''}` }
}
