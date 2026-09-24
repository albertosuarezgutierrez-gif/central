// Siniestros DESDE la ficha (visión del CRM, docs/CORREDURIA-CRM-VISION.md §9,
// punto 6): apertura, seguimiento y estado. Reglas puras; la escritura vive en
// `apps/asegura/lib/cartera-siniestros.ts` y siempre deja fila en
// `historial_interno`.
//
// Dos orígenes conviven en `seguros.siniestros` y NO son iguales:
//   · `cima`: los trae la ingesta (67 hoy, todos). CIMA sabe más que nosotros
//     y en cada pull REESCRIBE `estado`, `tipo`, `fecha_hora` y `lugar_*`
//     (legacy `persist-siniestro.ts:176-190`); NO toca `comentario`,
//     `referencia`, tramitador, perito, gravedad, reserva ni indemnización —
//     esos son «MANUAL del corredor; CIMA NO los provee». Por eso en uno de
//     CIMA se anota justo eso y el estado no se toca a mano: lo fija la compañía.
//   · `gestionado_correduria`: lo abre Alberto desde la ficha. CIMA empareja
//     por `(correduria_id, id_siniestro_entidad, codigo_entidad_dgs)` (índice
//     único parcial), así que cuando la compañía dé su referencia se guarda
//     TAMBIÉN en `id_siniestro_entidad`: el siguiente pull cae sobre nuestra
//     fila y la actualiza en vez de duplicarla. Misma idea que D2 de la spec
//     de emisión (§5 de la visión).
//
// Plazo legal: art. 16 LCS — el tomador/asegurado comunica el siniestro al
// asegurador en SIETE días desde que lo conoce. Se enseña como aviso, no
// bloquea: una comunicación tardía sigue siendo un siniestro que hay que
// gestionar.

import { descripcionEiacSiniestro } from './eiac-siniestros.ts'

export type EstadoSiniestro = 'abierto' | 'en_tramitacion' | 'cerrado' | 'rechazado'
export type OrigenSiniestro = 'cima' | 'gestionado_correduria'

export const ESTADOS_SINIESTRO: readonly EstadoSiniestro[] = ['abierto', 'en_tramitacion', 'cerrado', 'rechazado']

const ETIQUETA_ESTADO: Record<EstadoSiniestro, string> = {
  abierto: 'Abierto',
  en_tramitacion: 'En tramitación',
  cerrado: 'Cerrado',
  rechazado: 'Rechazado',
}

export function etiquetaEstadoSiniestro(estado: string): string {
  return (ETIQUETA_ESTADO as Record<string, string>)[estado] ?? estado.replace(/_/g, ' ')
}

/**
 * A qué estados puede pasar un siniestro NUESTRO desde cada uno. Un cerrado o
 * rechazado se puede reabrir (reclamación, nueva documentación) — vuelve a
 * «en tramitación», nunca a «abierto» (ya se comunicó una vez).
 */
export const TRANSICIONES_SINIESTRO: Record<EstadoSiniestro, readonly EstadoSiniestro[]> = {
  abierto: ['en_tramitacion', 'cerrado', 'rechazado'],
  en_tramitacion: ['cerrado', 'rechazado'],
  cerrado: ['en_tramitacion'],
  rechazado: ['en_tramitacion'],
}

export function esEstadoSiniestro(v: unknown): v is EstadoSiniestro {
  return typeof v === 'string' && (ESTADOS_SINIESTRO as readonly string[]).includes(v)
}

/** Si el paso `de → a` está permitido; devuelve el motivo cuando no. */
export function revisarTransicion(origen: OrigenSiniestro, de: string, a: string): { ok: true } | { ok: false; motivo: string } {
  if (origen === 'cima') return { ok: false, motivo: 'el estado de un siniestro de CIMA lo fija la compañía; anota el seguimiento, no lo cierres a mano' }
  if (!esEstadoSiniestro(de)) return { ok: false, motivo: `estado actual desconocido: ${de}` }
  if (!esEstadoSiniestro(a)) return { ok: false, motivo: `estado destino desconocido: ${a}` }
  if (de === a) return { ok: false, motivo: `ya está ${etiquetaEstadoSiniestro(a).toLowerCase()}` }
  if (!TRANSICIONES_SINIESTRO[de].includes(a)) {
    return { ok: false, motivo: `de ${etiquetaEstadoSiniestro(de).toLowerCase()} no se pasa a ${etiquetaEstadoSiniestro(a).toLowerCase()}` }
  }
  return { ok: true }
}

// ─── Tipo de siniestro ───────────────────────────────────────────────────────
//
// CIMA guarda en `tipo` un CÓDIGO EIAC (p. ej. «1107», «17»). Desde el
// 04/09/2026 SÍ tenemos la tabla oficial de TIREA (209_IAC_ESP_DOC «Documentos
// Estándar V07.1» v05, punto 10.2, clave 13.3.86 — transcrita en
// `eiac-siniestros.ts`), así que un código que esté en ella se pinta con su
// descripción oficial. El que NO esté sigue pintándose como «código CIMA NNNN»:
// no se le inventa nombre a lo que la tabla no explica. Los siniestros nuestros
// llevan una clave de este catálogo, legible.

export const TIPOS_SINIESTRO = [
  { clave: 'colision', etiqueta: 'Colisión / accidente de circulación', ramo: 'auto' },
  { clave: 'lunas', etiqueta: 'Lunas y cristales', ramo: 'auto' },
  { clave: 'robo_vehiculo', etiqueta: 'Robo del vehículo o de sus piezas', ramo: 'auto' },
  { clave: 'danos_propios', etiqueta: 'Daños propios (sin contrario)', ramo: 'auto' },
  { clave: 'asistencia_viaje', etiqueta: 'Asistencia en viaje / grúa', ramo: 'auto' },
  { clave: 'danos_agua', etiqueta: 'Daños por agua', ramo: 'hogar' },
  { clave: 'incendio', etiqueta: 'Incendio / explosión', ramo: 'hogar' },
  { clave: 'robo_hogar', etiqueta: 'Robo o hurto en la vivienda', ramo: 'hogar' },
  { clave: 'rotura_cristales', etiqueta: 'Rotura de cristales, loza o mármol', ramo: 'hogar' },
  { clave: 'electrico', etiqueta: 'Daños eléctricos', ramo: 'hogar' },
  { clave: 'fenomenos', etiqueta: 'Fenómenos atmosféricos', ramo: 'hogar' },
  { clave: 'rc', etiqueta: 'Responsabilidad civil (daños a terceros)', ramo: 'general' },
  { clave: 'defensa_juridica', etiqueta: 'Defensa jurídica / reclamación', ramo: 'general' },
  { clave: 'salud', etiqueta: 'Asistencia sanitaria / reembolso', ramo: 'salud' },
  { clave: 'fallecimiento', etiqueta: 'Fallecimiento / invalidez', ramo: 'vida' },
  { clave: 'otro', etiqueta: 'Otro (describir)', ramo: 'general' },
] as const

export type ClaveTipoSiniestro = (typeof TIPOS_SINIESTRO)[number]['clave']

export function esTipoSiniestro(v: unknown): v is ClaveTipoSiniestro {
  return typeof v === 'string' && TIPOS_SINIESTRO.some((t) => t.clave === v)
}

/**
 * Cómo se pinta el `tipo`: nuestro catálogo → su etiqueta; un código EIAC que
 * está en la tabla oficial de TIREA → su descripción; un código numérico que NO
 * está en ella → «código CIMA 1107» (no se le pone nombre a lo que la tabla no
 * explica); vacío → «sin tipo».
 */
export function etiquetaTipoSiniestro(tipo: string | null | undefined): string {
  if (tipo === null || tipo === undefined || tipo.trim() === '') return 'sin tipo'
  const t = TIPOS_SINIESTRO.find((x) => x.clave === tipo)
  if (t) return t.etiqueta
  const oficial = descripcionEiacSiniestro(tipo)
  if (oficial !== null) return oficial
  if (/^\d{1,6}$/.test(tipo.trim())) return `código CIMA ${tipo.trim()}`
  return tipo
}

// ─── Plazo de comunicación (art. 16 LCS) ─────────────────────────────────────

export const DIAS_COMUNICACION_LCS = 7
const DIA_MS = 86_400_000

export type PlazoComunicacion = {
  /** Último día para comunicar (ISO fecha). */
  limite: string
  /** Días que quedan (negativo = pasados de plazo). */
  diasRestantes: number
  vencido: boolean
}

/**
 * Plazo para comunicar a la compañía desde la fecha del siniestro. `null` si
 * no hay fecha (no se afirma «en plazo» de lo que no se sabe cuándo pasó).
 */
export function plazoComunicacion(fechaHora: string | Date | null | undefined, hoy: Date = new Date()): PlazoComunicacion | null {
  if (fechaHora === null || fechaHora === undefined) return null
  const f = fechaHora instanceof Date ? fechaHora : new Date(fechaHora)
  if (Number.isNaN(f.getTime())) return null
  const inicio = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())
  const limiteMs = inicio + DIAS_COMUNICACION_LCS * DIA_MS
  const hoyMs = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  const diasRestantes = Math.round((limiteMs - hoyMs) / DIA_MS)
  return { limite: new Date(limiteMs).toISOString().slice(0, 10), diasRestantes, vencido: diasRestantes < 0 }
}

// ─── Apertura ────────────────────────────────────────────────────────────────

export type AperturaSiniestro = {
  polizaId: string
  tipo: string
  /** Fecha (y hora si se sabe) del hecho, ISO. */
  fechaHora: string
  /** Qué ha pasado, en palabras del cliente. Va a `comentario` (no cifrado a propósito). */
  descripcion: string
  lugarCp?: string | null
  lugarCiudad?: string | null
  lugarProvincia?: string | null
  /** Dirección exacta del hecho; se cifra en asegura. */
  lugarDireccion?: string | null
  seConsideraCulpable?: boolean | null
  gravedad?: string | null
  /** Referencia que ya haya dado la compañía (si se comunicó por teléfono antes). */
  referencia?: string | null
}

export type AperturaRevisada = {
  polizaId: string
  tipo: ClaveTipoSiniestro
  fechaHora: string
  descripcion: string
  lugarCp: string | null
  lugarCiudad: string | null
  lugarProvincia: string | null
  lugarDireccion: string | null
  seConsideraCulpable: boolean | null
  gravedad: 'leve' | 'moderado' | 'grave' | 'muy_grave' | null
  referencia: string | null
  /** Aviso del art. 16 LCS si la fecha ya pasa de 7 días; no bloquea. */
  aviso: string | null
}

export const GRAVEDADES_SINIESTRO = ['leve', 'moderado', 'grave', 'muy_grave'] as const

function limpia(v: unknown, max = 255): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s.slice(0, max)
}

export function revisarApertura(
  a: AperturaSiniestro,
  hoy: Date = new Date(),
): { ok: true; apertura: AperturaRevisada } | { ok: false; motivo: string } {
  const polizaId = limpia(a.polizaId, 64)
  if (!polizaId) return { ok: false, motivo: 'falta la póliza' }
  if (!esTipoSiniestro(a.tipo)) return { ok: false, motivo: 'tipo de siniestro desconocido' }
  const descripcion = typeof a.descripcion === 'string' ? a.descripcion.trim() : ''
  if (descripcion.length < 5) return { ok: false, motivo: 'describe qué ha pasado (mínimo 5 caracteres)' }
  if (descripcion.length > 4000) return { ok: false, motivo: 'la descripción es demasiado larga (máx. 4000)' }
  const fecha = typeof a.fechaHora === 'string' ? new Date(a.fechaHora) : new Date(NaN)
  if (Number.isNaN(fecha.getTime())) return { ok: false, motivo: 'fecha del siniestro no válida' }
  if (fecha.getTime() > hoy.getTime() + DIA_MS) return { ok: false, motivo: 'la fecha del siniestro está en el futuro' }
  if (hoy.getTime() - fecha.getTime() > 5 * 365 * DIA_MS) return { ok: false, motivo: 'la fecha del siniestro es de hace más de cinco años' }
  const cp = limpia(a.lugarCp, 10)
  if (cp !== null && !/^\d{5}$/.test(cp)) return { ok: false, motivo: 'código postal no válido' }
  const gravedad = limpia(a.gravedad, 20)
  if (gravedad !== null && !(GRAVEDADES_SINIESTRO as readonly string[]).includes(gravedad)) return { ok: false, motivo: 'gravedad desconocida' }
  const plazo = plazoComunicacion(fecha, hoy)
  const aviso =
    plazo && plazo.vencido
      ? `Han pasado ${-plazo.diasRestantes + DIAS_COMUNICACION_LCS} días desde el hecho: el art. 16 LCS da ${DIAS_COMUNICACION_LCS} para comunicarlo. Se abre igual; la compañía puede reclamar los daños de la demora.`
      : null
  return {
    ok: true,
    apertura: {
      polizaId,
      tipo: a.tipo,
      fechaHora: fecha.toISOString(),
      descripcion,
      lugarCp: cp,
      lugarCiudad: limpia(a.lugarCiudad, 100),
      lugarProvincia: limpia(a.lugarProvincia, 100),
      lugarDireccion: limpia(a.lugarDireccion, 500),
      seConsideraCulpable: typeof a.seConsideraCulpable === 'boolean' ? a.seConsideraCulpable : null,
      gravedad: gravedad as AperturaRevisada['gravedad'],
      referencia: limpia(a.referencia, 100),
      aviso,
    },
  }
}

// ─── Seguimiento ─────────────────────────────────────────────────────────────
//
// Lo que se puede anotar en un siniestro ya abierto. En uno de CIMA, todo lo
// que CIMA no manda (tramitador, perito, gravedad, reserva, indemnización,
// notas); en uno nuestro, además la referencia de la compañía — que es la
// llave para que CIMA lo case (ver cabecera).

export type SeguimientoSiniestro = {
  referencia?: string | null
  gravedad?: string | null
  tramitadorNombre?: string | null
  tramitadorTelefono?: string | null
  tramitadorEmail?: string | null
  peritoNombre?: string | null
  peritoTelefono?: string | null
  peritoEmail?: string | null
  reservaImporte?: number | null
  indemnizacionImporte?: number | null
  /** Nota de seguimiento: se AÑADE al comentario con fecha, no lo sustituye. */
  nota?: string | null
}

export const CAMPOS_SEGUIMIENTO_CIMA: readonly (keyof SeguimientoSiniestro)[] = [
  'tramitadorNombre', 'tramitadorTelefono', 'tramitadorEmail', 'peritoNombre', 'peritoTelefono', 'peritoEmail',
  'gravedad', 'reservaImporte', 'indemnizacionImporte', 'nota',
]
export const CAMPOS_SEGUIMIENTO_PROPIO: readonly (keyof SeguimientoSiniestro)[] = [...CAMPOS_SEGUIMIENTO_CIMA, 'referencia']

export type SeguimientoRevisado = {
  cambios: Partial<Record<Exclude<keyof SeguimientoSiniestro, 'nota'>, string | number | null>>
  nota: string | null
  /** Campos que venían y NO se aplican por ser un siniestro de CIMA. */
  ignorados: (keyof SeguimientoSiniestro)[]
}

function importe(v: unknown): number | null | undefined {
  if (v === null) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
  return Math.round(v * 100) / 100
}

export function revisarSeguimiento(origen: OrigenSiniestro, s: SeguimientoSiniestro): { ok: true; seguimiento: SeguimientoRevisado } | { ok: false; motivo: string } {
  const permitidos = origen === 'cima' ? CAMPOS_SEGUIMIENTO_CIMA : CAMPOS_SEGUIMIENTO_PROPIO
  const cambios: SeguimientoRevisado['cambios'] = {}
  const ignorados: (keyof SeguimientoSiniestro)[] = []
  let nota: string | null = null
  for (const k of Object.keys(s) as (keyof SeguimientoSiniestro)[]) {
    if (s[k] === undefined) continue
    if (!permitidos.includes(k)) { ignorados.push(k); continue }
    if (k === 'nota') { nota = limpia(s.nota, 2000); continue }
    if (k === 'reservaImporte' || k === 'indemnizacionImporte') {
      const n = importe(s[k])
      if (n === undefined) return { ok: false, motivo: `${k === 'reservaImporte' ? 'reserva' : 'indemnización'} no válida` }
      cambios[k] = n
      continue
    }
    if (k === 'gravedad') {
      const g = limpia(s.gravedad, 20)
      if (g !== null && !(GRAVEDADES_SINIESTRO as readonly string[]).includes(g)) return { ok: false, motivo: 'gravedad desconocida' }
      cambios.gravedad = g
      continue
    }
    if (k === 'tramitadorEmail' || k === 'peritoEmail') {
      const e = limpia(s[k], 255)
      if (e !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, motivo: 'email no válido' }
      cambios[k] = e ? e.toLowerCase() : null
      continue
    }
    cambios[k] = limpia(s[k], k === 'referencia' ? 100 : k.endsWith('Telefono') ? 30 : 255)
  }
  if (Object.keys(cambios).length === 0 && nota === null) {
    return { ok: false, motivo: ignorados.length ? 'la referencia de un siniestro de CIMA la pone la compañía, no se cambia aquí' : 'nada que anotar' }
  }
  return { ok: true, seguimiento: { cambios, nota, ignorados } }
}

/** El comentario con una nota más al final, fechada. `previo` vacío → solo la nota. */
export function anadirNota(previo: string | null | undefined, nota: string, cuando: Date = new Date()): string {
  const fecha = cuando.toISOString().slice(0, 10).split('-').reverse().join('/')
  const linea = `[${fecha}] ${nota.trim()}`
  const base = (previo ?? '').trimEnd()
  return base === '' ? linea : `${base}\n${linea}`
}

// ─── Historial ───────────────────────────────────────────────────────────────
//
// Sin datos personales ni la descripción del hecho: qué se hizo y sobre qué.

export function textoHistorialSiniestro(
  evento:
    | { accion: 'apertura'; tipo: string; fechaHora: string; numeroPoliza: string | null; aviso: string | null }
    | { accion: 'estado'; referencia: string | null; de: string; a: string }
    | { accion: 'seguimiento'; referencia: string | null; campos: string[]; conNota: boolean },
): string {
  const ref = (r: string | null) => (r ? ` ${r}` : '')
  switch (evento.accion) {
    case 'apertura': {
      const dia = evento.fechaHora.slice(0, 10).split('-').reverse().join('/')
      return `Siniestro abierto desde la ficha: ${etiquetaTipoSiniestro(evento.tipo)} del ${dia}${evento.numeroPoliza ? ` (póliza ${evento.numeroPoliza})` : ''}${evento.aviso ? ' · fuera del plazo de 7 días del art. 16 LCS' : ''}`
    }
    case 'estado':
      return `Siniestro${ref(evento.referencia)}: ${etiquetaEstadoSiniestro(evento.de).toLowerCase()} → ${etiquetaEstadoSiniestro(evento.a).toLowerCase()}`
    case 'seguimiento': {
      const partes = [...evento.campos.map(nombreCampo), ...(evento.conNota ? ['nota'] : [])]
      return `Siniestro${ref(evento.referencia)}: seguimiento (${partes.join(', ')})`
    }
  }
}

function nombreCampo(k: string): string {
  return k
    .replace(/Importe$/, '')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim()
}
