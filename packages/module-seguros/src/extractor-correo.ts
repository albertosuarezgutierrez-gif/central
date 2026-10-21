// packages/module-seguros/src/extractor-correo.ts
//
// F2 del agente corredor de correo (21/10/2026, docs/CORREDURIA-AGENTE-CORREO.md §3 capa 3 y §9 F2): el EXTRACTOR LLM
// para la cola larga de correos de compañía que ningún lector determinista reconoce. PURO: prompt, esquema, validación
// literal y comparación con el lector. La llamada al modelo, los topes y el guardado viven en plataforma
// (`apps/plataforma/lib/correo/extractor-llm.ts`).
//
// Reglas (vinculantes):
// - El LLM PROPONE; nunca decide una acción. En F2 todo es MODO SOMBRA: la ficha se guarda para medir y no toca la cartera.
// - LITERALIDAD: cada nº, importe, fecha, tomador o estado tiene que aparecer TAL CUAL en el texto que vio el modelo
//   (normalizado: espacios, mayúsculas y puntos de miles). Lo que no aparece → `null`. Nunca se «arregla» un valor.
// - `null` = no se sabe (el modelo no lo dio o no casó con el texto). No es «no hay».
// - El texto que va al modelo pasa ANTES por `sinDatosSensibles` (IBAN, CCC, NIF fuera). La exclusión de credenciales
//   (`exclusionSeguridad` de plataforma) va antes que todo esto: un correo excluido no llega aquí.
// - Lo que se GUARDA no lleva el nombre del tomador (spec §8: 0 PII en la lectura del LLM): solo si se leyó o no.

import { sinDatosSensibles, type EventoAseguradora } from './evento-correo-aseguradora.ts'
import type { LecturaCorreoDevolucion } from './devolucion-correo.ts'

export const TIPOS_FICHA_LLM = [
  'recibo', 'poliza', 'solicitud', 'siniestro', 'suplemento', 'anulacion', 'liquidacion', 'comunicado',
] as const
export type TipoFichaLLM = (typeof TIPOS_FICHA_LLM)[number]

export const CONCEPTOS_IMPORTE = ['prima', 'recibo', 'comision', 'franquicia', 'indemnizacion', 'otro'] as const
export type ConceptoImporte = (typeof CONCEPTOS_IMPORTE)[number]

/** Campos de la ficha que se validan contra el texto (los que el modelo podría inventar). */
export const CAMPOS_LITERALES = [
  'numeroPoliza', 'numeroSolicitud', 'numeroRecibo', 'numeroSiniestro', 'tomador', 'estado',
  'fechaEfecto', 'fechaVencimiento', 'fechaLimite', 'importes',
] as const
export type CampoLiteral = (typeof CAMPOS_LITERALES)[number]

export type ImporteFicha = { concepto: ConceptoImporte; valor: number }

/** Ficha VALIDADA: todo lo que no es `null` aparece literalmente en el texto. */
export type FichaCorreoLLM = {
  tipo: TipoFichaLLM | null
  numeroPoliza: string | null
  numeroSolicitud: string | null
  numeroRecibo: string | null
  numeroSiniestro: string | null
  /** 🚨 Solo en memoria: NO se guarda (ver `fichaParaGuardar`). */
  tomador: string | null
  /** `YYYY-MM-DD`. */
  fechaEfecto: string | null
  fechaVencimiento: string | null
  fechaLimite: string | null
  /** Vacío = el modelo no dio ninguno que casara (no es «sin importes»: eso no se puede afirmar). */
  importes: ImporteFicha[]
  /** Estado como lo escribe la compañía («PTE DOCUMENTACION»), literal. */
  estado: string | null
  /** Autoevaluación del modelo, 0..1. `null` = no la dio o no es un número. */
  confianza: number | null
}

export type ValidacionFicha = {
  ficha: FichaCorreoLLM
  /** Campos en los que el modelo dio un valor que NO aparece en el texto (posible alucinación): se anularon. */
  noLiterales: CampoLiteral[]
}

// ── Texto que ve el modelo ───────────────────────────────────────────────────

export const MAX_CUERPO_LLM = 6_000
export const MAX_ADJUNTOS_LLM = 6_000

function recortar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n[…recortado]` : s
}

/**
 * El texto EXACTO que se manda al modelo (y contra el que se valida su respuesta). Sin IBAN/CCC/NIF; del remitente,
 * solo el dominio. `null` = no hay nada que leer.
 */
export function textoParaExtractor(c: { remitente: string; asunto: string; cuerpoTexto: string; textoAdjuntos?: string | null }): string | null {
  const dominio = (c.remitente.split('@')[1] ?? '').trim().toLowerCase()
  const asunto = sinDatosSensibles((c.asunto ?? '').replace(/\s+/g, ' ').trim())
  const cuerpo = sinDatosSensibles((c.cuerpoTexto ?? '').trim())
  const adjuntos = sinDatosSensibles((c.textoAdjuntos ?? '').trim())
  if (!asunto && !cuerpo && !adjuntos) return null
  const partes = [`Remitente (dominio): ${dominio || 'desconocido'}`, `Asunto: ${asunto}`, '', 'Cuerpo:', recortar(cuerpo, MAX_CUERPO_LLM)]
  if (adjuntos) partes.push('', 'Adjuntos (texto):', recortar(adjuntos, MAX_ADJUNTOS_LLM))
  return partes.join('\n')
}

export const SYSTEM_EXTRACTOR = [
  'Eres un lector de correos de compañías aseguradoras para una correduría de seguros española.',
  'Devuelve SOLO un objeto JSON (sin markdown) con esta forma exacta:',
  '{"tipo": "recibo|poliza|solicitud|siniestro|suplemento|anulacion|liquidacion|comunicado",',
  ' "numero_poliza": string|null, "numero_solicitud": string|null, "numero_recibo": string|null, "numero_siniestro": string|null,',
  ' "tomador": string|null, "fecha_efecto": string|null, "fecha_vencimiento": string|null, "fecha_limite": string|null,',
  ' "importes": [{"concepto": "prima|recibo|comision|franquicia|indemnizacion|otro", "valor": string}],',
  ' "estado": string|null, "confianza": número entre 0 y 1}',
  '',
  'Reglas OBLIGATORIAS:',
  '- Copia cada valor EXACTAMENTE como aparece en el texto (mismos dígitos, mismo formato de fecha e importe). No conviertas,',
  '  no completes, no deduzcas. Si un dato no aparece escrito en el texto, pon null (o deja la lista vacía).',
  '- Importes con el formato del texto (p. ej. "1.234,56"), sin inventar decimales. Fechas como estén escritas.',
  '- "estado" es la frase literal de la compañía sobre la situación (p. ej. "PTE DOCUMENTACION"), o null.',
  '- "tipo": recibo (cobro, devolución o impago de un recibo), poliza (emisión o envío de póliza), solicitud (estado de una',
  '  solicitud/proyecto), siniestro, suplemento, anulacion, liquidacion (comisiones), comunicado (informativo sin dato).',
  '- Los textos "[retirado]" son datos protegidos: no los copies.',
  '- Si dudas, baja "confianza"; nunca rellenes por rellenar.',
].join('\n')

// ── Respuesta del modelo ─────────────────────────────────────────────────────

/** El primer objeto JSON de la respuesta, o `null` si no hay uno legible. */
export function parsearRespuestaExtractor(texto: string): Record<string, unknown> | null {
  const limpio = (texto ?? '').replace(/```(?:json)?/gi, '')
  const ini = limpio.indexOf('{')
  const fin = limpio.lastIndexOf('}')
  if (ini < 0 || fin <= ini) return null
  try {
    const v = JSON.parse(limpio.slice(ini, fin + 1)) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ── Literalidad ──────────────────────────────────────────────────────────────

/** Normaliza para cotejar: NFKC, espacios raros a espacio, espacios colapsados, minúsculas. */
export function normalizarCotejo(s: string): string {
  return (s ?? '').normalize('NFKC').replace(/[   \t\r\n]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function escaparRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** ¿Aparece `valor` en `texto` como pieza entera (sin pegarse a otra letra o cifra)? Ambos ya normalizados. */
function aparece(valorNorm: string, textoNorm: string, estricto = false): boolean {
  if (!valorNorm) return false
  // Estricto (importes e identificadores): un separador (. , / -) pegado a una cifra por fuera indica que el valor es un
  // trozo de otro mayor («234,56» dentro de «1.234,56», «512345» dentro de «0094/512345»).
  const izq = estricto ? '(?:^|[^\\p{L}\\p{N}.,/-]|(?<!\\p{N})[.,/-])' : '(?:^|[^\\p{L}\\p{N}])'
  const der = estricto ? '(?:$|[^\\p{L}\\p{N}.,/-]|[.,/-](?!\\p{N}))' : '(?:$|[^\\p{L}\\p{N}])'
  return new RegExp(`${izq}${escaparRe(valorNorm)}${der}`, 'u').test(textoNorm)
}

/** ¿El valor aparece literalmente en el texto (normalizado)? */
export function apareceLiteral(valor: string, texto: string, estricto = false): boolean {
  return aparece(normalizarCotejo(valor), normalizarCotejo(texto), estricto)
}

function cadena(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s && s.toLowerCase() !== 'null' ? s : null
}

const RE_ID = /^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$/

/** Nº de póliza/solicitud/recibo/siniestro: forma de identificador (≥3 cifras) y literal en el texto. */
export function identificadorLiteral(v: unknown, texto: string): string | null {
  const s = cadena(v)
  if (!s || !RE_ID.test(s) || (s.match(/\d/g) ?? []).length < 3) return null
  return apareceLiteral(s, texto, true) ? s : null
}

const RE_IMPORTE_ES = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/

function sinMiles(s: string): string {
  return s.replace(/\./g, '')
}

function conMiles(s: string): string {
  const [ent, dec] = s.split(',')
  const e = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return dec !== undefined ? `${e},${dec}` : e
}

/**
 * Importe en formato español, literal en el texto. Además de aparecer, tiene que PARECER dinero en el texto: con
 * decimales («120,00») o pegado a «€»/«EUR»/«euros». Así un «2026» del asunto no pasa por importe. Devuelve euros.
 */
export function importeLiteral(v: unknown, texto: string): number | null {
  const bruto = cadena(v)
  if (!bruto) return null
  const s = bruto.replace(/€|eur(?:os)?/gi, '').replace(/\s+/g, '')
  if (!RE_IMPORTE_ES.test(s)) return null
  const textoNorm = normalizarCotejo(texto)
  const variantes = [...new Set([s, sinMiles(s), conMiles(sinMiles(s))])]
  const pareceDinero = (lit: string): boolean => {
    if (!aparece(lit, textoNorm, true)) return false
    if (/,\d{1,2}$/.test(lit)) return true
    const e = escaparRe(lit)
    return new RegExp(`(?:^|[^\\p{N}.,])${e}\\s?(?:€|eur\\b|euros\\b)|(?:€|eur)\\s?${e}(?:$|[^\\p{N}.,])`, 'u').test(textoNorm)
  }
  if (!variantes.some(pareceDinero)) return null
  const n = Number(sinMiles(s).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

function isoValida(a: number, m: number, d: number): string | null {
  if (a < 1990 || a > 2100) return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Fecha escrita (`15/09/2026`, `15-09-26`, `15.09.2026`, `2026-09-15`, `15 de septiembre de 2026`) → ISO. */
export function fechaEscritaAIso(s: string): string | null {
  const t = normalizarCotejo(s)
  let m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4}|\d{2})$/.exec(t)
  if (m) return isoValida(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return isoValida(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2}) de ([a-z]+) de (\d{4})$/.exec(t.normalize('NFD').replace(/[̀-ͯ]/g, ''))
  if (m && MESES[m[2]]) return isoValida(Number(m[3]), MESES[m[2]], Number(m[1]))
  return null
}

/** Fecha literal en el texto y válida en el calendario → ISO. */
export function fechaLiteral(v: unknown, texto: string): string | null {
  const s = cadena(v)
  if (!s) return null
  const iso = fechaEscritaAIso(s)
  return iso && apareceLiteral(s, texto) ? iso : null
}

/** Texto libre corto (tomador, estado): con letras, sin marcas de dato retirado, literal en el texto. */
export function textoLiteral(v: unknown, texto: string, max: number): string | null {
  const s = cadena(v)
  if (!s || s.length < 2 || s.length > max || !/\p{L}/u.test(s) || /\[retirado\]/i.test(s)) return null
  return apareceLiteral(s, texto) ? s : null
}

const MAX_PALABRAS_ESTADO = 6

/** Estado de la compañía: texto corto literal, sin datos sensibles y de ≤6 palabras (una frase larga puede llevar un nombre). */
export function estadoLiteral(v: unknown, texto: string): string | null {
  const s = textoLiteral(v, texto, 80)
  if (!s) return null
  if (s.split(/\s+/).length > MAX_PALABRAS_ESTADO) return null
  const limpio = sinDatosSensibles(s)
  return limpio === s ? s : null
}

function confianza(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) / 100 : null
}

function tipoFicha(v: unknown): TipoFichaLLM | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : ''
  return (TIPOS_FICHA_LLM as readonly string[]).includes(s) ? (s as TipoFichaLLM) : null
}

function conceptoImporte(v: unknown): ConceptoImporte {
  const s = typeof v === 'string' ? v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : ''
  return (CONCEPTOS_IMPORTE as readonly string[]).includes(s) ? (s as ConceptoImporte) : 'otro'
}

const MAX_IMPORTES = 5

/**
 * Valida la respuesta del modelo CONTRA EL TEXTO que vio (`textoParaExtractor`). Lo que no aparece literal → `null`
 * y cuenta en `noLiterales`. `raw = null` (respuesta ilegible) → ficha vacía, sin `noLiterales`.
 */
export function validarFichaLLM(raw: Record<string, unknown> | null, texto: string): ValidacionFicha {
  const r = raw ?? {}
  const noLiterales: CampoLiteral[] = []
  const campo = <T>(nombre: CampoLiteral, clave: string, f: (v: unknown) => T | null): T | null => {
    // Un nº que llega como número JSON se coteja como texto (sin ceros a la izquierda: si el texto los lleva, no casa).
    const bruto = typeof r[clave] === 'number' ? String(r[clave]) : r[clave]
    const out = f(bruto)
    if (out === null && cadena(bruto) !== null) noLiterales.push(nombre)
    return out
  }
  const importes: ImporteFicha[] = []
  let importeDescartado = false
  if (Array.isArray(r.importes)) {
    for (const it of r.importes.slice(0, MAX_IMPORTES)) {
      const o: Record<string, unknown> = it && typeof it === 'object' ? (it as Record<string, unknown>) : { valor: it }
      const valor = importeLiteral(typeof o.valor === 'number' ? String(o.valor) : o.valor, texto)
      if (valor === null) { if (o.valor !== null && o.valor !== undefined && o.valor !== '') importeDescartado = true; continue }
      if (!importes.some((x) => x.valor === valor)) importes.push({ concepto: conceptoImporte(o.concepto), valor })
    }
  }
  const ficha: FichaCorreoLLM = {
    tipo: tipoFicha(r.tipo),
    numeroPoliza: campo('numeroPoliza', 'numero_poliza', (v) => identificadorLiteral(v, texto)),
    numeroSolicitud: campo('numeroSolicitud', 'numero_solicitud', (v) => identificadorLiteral(v, texto)),
    numeroRecibo: campo('numeroRecibo', 'numero_recibo', (v) => identificadorLiteral(v, texto)),
    numeroSiniestro: campo('numeroSiniestro', 'numero_siniestro', (v) => identificadorLiteral(v, texto)),
    tomador: campo('tomador', 'tomador', (v) => textoLiteral(v, texto, 120)),
    fechaEfecto: campo('fechaEfecto', 'fecha_efecto', (v) => fechaLiteral(v, texto)),
    fechaVencimiento: campo('fechaVencimiento', 'fecha_vencimiento', (v) => fechaLiteral(v, texto)),
    fechaLimite: campo('fechaLimite', 'fecha_limite', (v) => fechaLiteral(v, texto)),
    importes,
    estado: campo('estado', 'estado', (v) => estadoLiteral(v, texto)),
    confianza: confianza(r.confianza),
  }
  if (importeDescartado) noLiterales.push('importes')
  return { ficha, noLiterales }
}

// ── Lo que se guarda (sin datos personales) ──────────────────────────────────

export type FichaGuardable = Omit<FichaCorreoLLM, 'tomador'> & { tomadorLeido: boolean }

/** La ficha SIN el nombre del tomador (spec §8: 0 PII en la lectura guardada). El estado vuelve a pasar por el filtro. */
export function fichaParaGuardar(f: FichaCorreoLLM): FichaGuardable {
  const { tomador, ...resto } = f
  return { ...resto, estado: resto.estado ? sinDatosSensibles(resto.estado) : null, tomadorLeido: tomador !== null }
}

// ── Comparación con el lector determinista (métrica de precisión) ────────────

export type ResultadoCampo = 'acierto' | 'fallo' | 'omitido' | 'sin_referencia'
export const CAMPOS_COMPARADOS = ['tipo', 'numeroPoliza', 'numeroSolicitud', 'numeroRecibo', 'numeroSiniestro', 'importes', 'fechas'] as const
export type CampoComparado = (typeof CAMPOS_COMPARADOS)[number]

export type ComparacionLector = {
  /** El lector gana SIEMPRE (spec §3): la lectura del LLM solo se mide. */
  ganador: 'lector'
  tipoLector: string
  campos: Record<CampoComparado, ResultadoCampo>
  aciertos: number
  fallos: number
}

type HuellaLector = {
  tipo: TipoFichaLLM
  tipoLector: string
  polizas: Set<string>
  solicitudes: Set<string>
  recibos: Set<string>
  siniestros: Set<string>
  importes: Set<number>
  fechas: Set<string>
}

/** Clave para comparar nºs: sin separadores, mayúsculas y sin ceros a la izquierda. */
export function claveIdentificador(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=.)/, '')
}

function huella(lector: EventoAseguradora | LecturaCorreoDevolucion): HuellaLector {
  const h: HuellaLector = {
    tipo: 'comunicado', tipoLector: '', polizas: new Set(), solicitudes: new Set(), recibos: new Set(),
    siniestros: new Set(), importes: new Set(), fechas: new Set(),
  }
  const pol = (v: string | null | undefined) => { if (v) h.polizas.add(claveIdentificador(v)) }
  const rec = (v: string | null | undefined) => { if (v) h.recibos.add(claveIdentificador(v)) }
  const imp = (v: number | null | undefined) => { if (typeof v === 'number') h.importes.add(Math.round(v * 100) / 100) }
  const fec = (v: string | null | undefined) => { if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) h.fechas.add(v) }
  if ('devoluciones' in lector) {
    h.tipo = 'recibo'; h.tipoLector = 'devolucion'
    for (const d of lector.devoluciones) { pol(d.numeroPoliza); rec(d.idRecibo); imp(d.importe); fec(d.fechaEfecto); fec(d.fechaDevolucion) }
    for (const i of lector.incidencias) rec(i.idRecibo)
    return h
  }
  h.tipoLector = lector.tipo
  switch (lector.tipo) {
    case 'siniestro':
      h.tipo = 'siniestro'
      for (const s of lector.siniestros) { h.siniestros.add(claveIdentificador(s.numeroSiniestro)); pol(s.numeroPoliza); fec(s.fechaOcurrencia); fec(s.fechaAccion) }
      break
    case 'pre_anulacion':
    case 'impago':
      h.tipo = 'recibo'
      for (const r of lector.recibos) { pol(r.numeroPoliza); rec(r.idRecibo); imp(r.importe); fec(r.fechaLimite) }
      break
    case 'anulacion':
      h.tipo = 'anulacion'
      pol(lector.numeroPoliza); fec(lector.fechaEfecto)
      for (const r of lector.recibos ?? []) { pol(r.numeroPoliza); rec(r.idRecibo); fec(r.fechaAnulacion) }
      break
    case 'suplemento':
      h.tipo = 'suplemento'
      pol(lector.numeroPoliza); fec(lector.periodoDesde); fec(lector.periodoHasta)
      break
    case 'emision':
      h.tipo = 'poliza'
      for (const p of lector.polizas) { pol(p.numeroPoliza); rec(p.idRecibo); imp(p.prima); fec(p.fechaEfecto) }
      break
    case 'solicitud':
      h.tipo = 'solicitud'
      h.solicitudes.add(claveIdentificador(lector.numeroSolicitud)); pol(lector.numeroPoliza)
      break
  }
  return h
}

function compararId(valor: string | null, ref: Set<string>): ResultadoCampo {
  if (ref.size === 0) return 'sin_referencia'
  if (valor === null) return 'omitido'
  return ref.has(claveIdentificador(valor)) ? 'acierto' : 'fallo'
}

function compararConjunto<T>(valores: T[], ref: Set<T>): ResultadoCampo {
  if (ref.size === 0) return 'sin_referencia'
  if (valores.length === 0) return 'omitido'
  return valores.every((v) => ref.has(v)) ? 'acierto' : 'fallo'
}

/**
 * Compara la ficha del LLM con lo que leyó un lector determinista del MISMO correo. Un campo que el lector no trae no
 * cuenta (`sin_referencia`); uno que el LLM no dio es `omitido` (no es fallo: es prudencia). Gana siempre el lector.
 */
export function compararConLector(ficha: FichaCorreoLLM, lector: EventoAseguradora | LecturaCorreoDevolucion): ComparacionLector {
  const h = huella(lector)
  const fechas = [ficha.fechaEfecto, ficha.fechaVencimiento, ficha.fechaLimite].filter((f): f is string => f !== null)
  const campos: Record<CampoComparado, ResultadoCampo> = {
    tipo: ficha.tipo === null ? 'omitido' : ficha.tipo === h.tipo ? 'acierto' : 'fallo',
    numeroPoliza: compararId(ficha.numeroPoliza, h.polizas),
    numeroSolicitud: compararId(ficha.numeroSolicitud, h.solicitudes),
    numeroRecibo: compararId(ficha.numeroRecibo, h.recibos),
    numeroSiniestro: compararId(ficha.numeroSiniestro, h.siniestros),
    importes: compararConjunto(ficha.importes.map((i) => i.valor), h.importes),
    fechas: compararConjunto(fechas, h.fechas),
  }
  const vals = Object.values(campos)
  return {
    ganador: 'lector', tipoLector: h.tipoLector, campos,
    aciertos: vals.filter((v) => v === 'acierto').length,
    fallos: vals.filter((v) => v === 'fallo').length,
  }
}
