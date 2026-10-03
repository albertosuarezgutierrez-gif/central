// ─────────────────────────────────────────────────────────────────────────────
// Parte del portal ↔ siniestro, y alta manual ↔ siniestro de CIMA: las reglas
// puras del EMPAREJAMIENTO y de la FUSIÓN (encargo de Alberto, 03/10/2026,
// ideas 2+3). La BD vive en `apps/asegura/lib/siniestros-vinculo.ts`.
//
// Tres resultados y solo tres: `fuerte` (se vincula/fusiona solo), `ambiguo`
// (hay candidatos pero no UNO claro → se deja como SUGERENCIA y decide
// Alberto) y `ninguno`. 🚨 Nunca se adivina: ante la duda, `ambiguo`.
//
//   · Parte → siniestro: misma póliza + fecha del hecho a ±3 días + UN único
//     candidato. Un siniestro de esa póliza SIN fecha no se descarta: podría
//     ser el mismo, así que vuelve el caso ambiguo (null = «no se sabe», no
//     «no es»).
//   · Alta manual → CIMA: (1) misma póliza + mismo nº de siniestro de la
//     compañía (normalizado: Allianz manda ceros delante); (2) si no hay nº
//     que case, misma póliza + fecha ±3 días + UN único candidato SIN un nº
//     distinto del nuestro (un nº distinto = otro siniestro).
//   · Unicidad en los DOS sentidos: si dos partes (o dos altas manuales)
//     apuntan al mismo siniestro, ninguno se vincula solo.
//
// Fusión: el siniestro de CIMA es el que queda (la ingesta lo sigue
// actualizando por su clave). Lo que CIMA manda (estado, tipo, fecha, lugar,
// tramitación `*_cima`) MANDA sobre lo declarado; lo que CIMA NUNCA manda
// (referencia, tramitador, perito, gravedad, reserva/indemnización del
// corredor, notas, campos del ramo) se conserva del alta manual si el de CIMA
// no lo tiene. Las notas se SUMAN, no se pisan.
// ─────────────────────────────────────────────────────────────────────────────

export const DIAS_VENTANA_VINCULO = 3
const DIA_MS = 86_400_000

export type EmparejamientoSiniestro =
  | { tipo: 'fuerte'; siniestroId: string }
  | { tipo: 'ambiguo'; candidatos: string[] }
  | { tipo: 'ninguno' }

/** Un siniestro tal y como lo necesita el emparejamiento. */
export type SiniestroCandidato = {
  id: string
  polizaId: string
  /** `null` = no se sabe cuándo pasó: NO se descarta, se trata como «podría ser». */
  fechaHora: Date | string | null
  origen: 'cima' | 'gestionado_correduria'
  /** Nº de la compañía (`id_siniestro_entidad`). */
  idSiniestroEntidad?: string | null
  /** Referencia anotada (en los nuestros, el nº que dio la compañía). */
  referencia?: string | null
}

export type ParteParaVincular = {
  id: string
  polizaId: string | null
  /** `YYYY-MM-DD` o Date (columna `date`). */
  fechaHecho: Date | string
}

function aDiaUtc(f: Date | string | null | undefined): number | null {
  if (f === null || f === undefined) return null
  const d = f instanceof Date ? f : new Date(f)
  if (Number.isNaN(d.getTime())) return null
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Días naturales entre dos fechas (valor absoluto), o `null` si alguna falta. */
export function diasEntre(a: Date | string | null | undefined, b: Date | string | null | undefined): number | null {
  const x = aDiaUtc(a)
  const y = aDiaUtc(b)
  if (x === null || y === null) return null
  return Math.round(Math.abs(x - y) / DIA_MS)
}

/**
 * Nº de siniestro de la compañía, comparable: mayúsculas, sin separadores y sin
 * ceros a la izquierda (Allianz numera `061048939` en CIMA y `61048939` a mano).
 * `null` si no queda nada.
 */
export function normalizarNumeroSiniestro(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=.)/, '')
  return s === '' || /^0+$/.test(s) ? null : s
}

/**
 * Los siniestros que PODRÍAN ser el del parte: misma póliza y fecha a ±3 días,
 * o misma póliza sin fecha (no se sabe → podría).
 */
export function candidatosDeParte(parte: ParteParaVincular, siniestros: readonly SiniestroCandidato[], dias = DIAS_VENTANA_VINCULO): SiniestroCandidato[] {
  if (parte.polizaId === null) return []
  return siniestros.filter((s) => {
    if (s.polizaId !== parte.polizaId) return false
    const d = diasEntre(parte.fechaHecho, s.fechaHora)
    return d === null || d <= dias
  })
}

/**
 * EmparejamientoSiniestro de UN parte contra los siniestros. Fuerte solo con un único
 * candidato y CON fecha (uno sin fecha nunca se vincula solo).
 */
export function emparejarParte(parte: ParteParaVincular, siniestros: readonly SiniestroCandidato[], dias = DIAS_VENTANA_VINCULO): EmparejamientoSiniestro {
  const c = candidatosDeParte(parte, siniestros, dias)
  if (c.length === 0) return { tipo: 'ninguno' }
  if (c.length === 1 && diasEntre(parte.fechaHecho, c[0].fechaHora) !== null) return { tipo: 'fuerte', siniestroId: c[0].id }
  return { tipo: 'ambiguo', candidatos: c.map((s) => s.id) }
}

/**
 * Vínculos AUTOMÁTICOS de un lote de partes sin vincular: solo los fuertes,
 * cuyo siniestro destino es de CIMA (la compañía lo confirma), que nadie más
 * reclama en el lote y que no tiene ya otro parte vinculado (`yaVinculados`).
 * Lo que no pasa el filtro NO se vincula: queda como sugerencia en la ficha.
 */
export function vinculosAutomaticos(
  partes: readonly ParteParaVincular[],
  siniestros: readonly SiniestroCandidato[],
  yaVinculados: ReadonlySet<string> = new Set(),
  dias = DIAS_VENTANA_VINCULO,
): { parteId: string; siniestroId: string }[] {
  const porId = new Map(siniestros.map((s) => [s.id, s]))
  const fuertes: { parteId: string; siniestroId: string }[] = []
  for (const p of partes) {
    const e = emparejarParte(p, siniestros, dias)
    if (e.tipo === 'fuerte') fuertes.push({ parteId: p.id, siniestroId: e.siniestroId })
  }
  const veces = new Map<string, number>()
  for (const f of fuertes) veces.set(f.siniestroId, (veces.get(f.siniestroId) ?? 0) + 1)
  return fuertes.filter(
    (f) => veces.get(f.siniestroId) === 1 && !yaVinculados.has(f.siniestroId) && porId.get(f.siniestroId)?.origen === 'cima',
  )
}

/**
 * 🚨 ¿La COMPAÑÍA conoce este siniestro? Es lo único que autoriza a pasar un parte
 * vinculado a `abierto_en_compania` (lo que el portal enseña como «tu compañía ya
 * lo sabe»): es de CIMA, o tiene el nº que dio la compañía. Un alta manual sin nº
 * puede estar aún sin comunicar → el parte se queda en `recibido`.
 */
export function conocidoPorCompania(s: { origen: unknown; idSiniestroEntidad?: string | null; referencia?: string | null }): boolean {
  return String(s.origen) === 'cima' || (s.idSiniestroEntidad ?? '').trim() !== '' || (s.referencia ?? '').trim() !== ''
}

// ─── Alta manual ↔ CIMA ──────────────────────────────────────────────────────

function numerosDe(s: SiniestroCandidato): Set<string> {
  const out = new Set<string>()
  for (const v of [s.idSiniestroEntidad, s.referencia]) {
    const n = normalizarNumeroSiniestro(v)
    if (n !== null) out.add(n)
  }
  return out
}

/**
 * ¿Qué siniestro de CIMA es el mismo que este alta manual? `cimas` = los de
 * CIMA candidatos (sin fusionar). Por nº primero; por fecha solo si el nº no
 * resuelve, y descartando los que traen un nº DISTINTO del nuestro.
 */
export function emparejarManualConCima(
  manual: SiniestroCandidato,
  cimas: readonly SiniestroCandidato[],
  dias = DIAS_VENTANA_VINCULO,
): EmparejamientoSiniestro {
  const misma = cimas.filter((c) => c.origen === 'cima' && c.polizaId === manual.polizaId && c.id !== manual.id)
  const nuestros = numerosDe(manual)
  if (nuestros.size > 0) {
    const porNumero = misma.filter((c) => [...numerosDe(c)].some((n) => nuestros.has(n)))
    if (porNumero.length === 1) return { tipo: 'fuerte', siniestroId: porNumero[0].id }
    if (porNumero.length > 1) return { tipo: 'ambiguo', candidatos: porNumero.map((c) => c.id) }
  }
  if (aDiaUtc(manual.fechaHora) === null) return { tipo: 'ninguno' }
  const porFecha = misma.filter((c) => {
    const suyos = numerosDe(c)
    if (nuestros.size > 0 && suyos.size > 0) return false // dos nº distintos = dos siniestros
    const d = diasEntre(manual.fechaHora, c.fechaHora)
    return d === null || d <= dias
  })
  if (porFecha.length === 0) return { tipo: 'ninguno' }
  if (porFecha.length === 1 && diasEntre(manual.fechaHora, porFecha[0].fechaHora) !== null) {
    return { tipo: 'fuerte', siniestroId: porFecha[0].id }
  }
  return { tipo: 'ambiguo', candidatos: porFecha.map((c) => c.id) }
}

/**
 * Fusiones de un lote: alta manual → siniestro de CIMA, solo las fuertes y con
 * el siniestro de CIMA reclamado por UN solo alta manual.
 */
export function fusionesAutomaticas(
  manuales: readonly SiniestroCandidato[],
  cimas: readonly SiniestroCandidato[],
  dias = DIAS_VENTANA_VINCULO,
): { manualId: string; cimaId: string }[] {
  const fuertes: { manualId: string; cimaId: string }[] = []
  for (const m of manuales) {
    if (m.origen !== 'gestionado_correduria') continue
    const e = emparejarManualConCima(m, cimas, dias)
    if (e.tipo === 'fuerte') fuertes.push({ manualId: m.id, cimaId: e.siniestroId })
  }
  const veces = new Map<string, number>()
  for (const f of fuertes) veces.set(f.cimaId, (veces.get(f.cimaId) ?? 0) + 1)
  return fuertes.filter((f) => veces.get(f.cimaId) === 1)
}

// ─── Fusión ──────────────────────────────────────────────────────────────────

/** Lo que el CORREDOR anota y CIMA nunca manda. Es lo único que la fusión mueve. */
export type CamposCorredor = {
  referencia: string | null
  comentario: string | null
  tramitadorNombre: string | null
  tramitadorTelefono: string | null
  tramitadorEmail: string | null
  peritoNombre: string | null
  peritoTelefono: string | null
  peritoEmail: string | null
  gravedad: string | null
  reservaImporte: number | null
  indemnizacionImporte: number | null
  seConsideraCulpable: boolean | null
  /** Solo se copia si el de CIMA no tiene; `null` = no hay. */
  datosRamo: Record<string, unknown> | null
  fechaDeclaracion: string | null
}

const CAMPOS_HUECO: readonly (keyof CamposCorredor)[] = [
  'referencia', 'tramitadorNombre', 'tramitadorTelefono', 'tramitadorEmail', 'peritoNombre', 'peritoTelefono',
  'peritoEmail', 'gravedad', 'reservaImporte', 'indemnizacionImporte', 'seConsideraCulpable', 'datosRamo', 'fechaDeclaracion',
]

function vacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

/**
 * Qué escribir en el siniestro de CIMA al fusionarle un alta manual. Solo
 * RELLENA huecos (lo que ya tiene el de CIMA, incluida una anotación previa del
 * corredor, gana) y SUMA las notas. Nunca devuelve estado/tipo/fecha/lugar:
 * eso lo manda la compañía. Devuelve solo los campos que cambian.
 */
export function cambiosDeFusion(cima: CamposCorredor, manual: CamposCorredor, cuando: Date = new Date(), dia?: string): Partial<CamposCorredor> {
  const out: Partial<CamposCorredor> = {}
  for (const k of CAMPOS_HUECO) {
    if (vacio(cima[k]) && !vacio(manual[k])) (out as Record<string, unknown>)[k] = manual[k]
  }
  const fecha = cuando.toISOString().slice(0, 10).split('-').reverse().join('/')
  const sello = `[${fecha}] Unido al siniestro de la compañía (CIMA): venía de un alta manual${dia ? ` del ${dia}` : ''}${manual.referencia ? ` con nº ${manual.referencia}` : ''}.`
  const notas = [cima.comentario?.trimEnd(), manual.comentario?.trim(), sello].filter((t): t is string => typeof t === 'string' && t !== '')
  out.comentario = notas.join('\n')
  return out
}
