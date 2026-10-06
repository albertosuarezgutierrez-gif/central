// FICHAS DE PRODUCTO y COBERTURAS — modelo y VALIDADOR anti-alucinación (07/10/2026). PURO.
//
// Una FICHA es lo que dice el condicionado de UN producto (compañía, ramo, producto, versión): por cada
// garantía del catálogo, si va incluida/opcional/excluida, su límite, sublímites, franquicia y notas,
// cada cosa con la CITA literal del PDF de la que sale. Aparte, los VALORES DEL PRESUPUESTO (capitales,
// franquicia elegida, prima) que son de ESE proyecto y no del producto.
//
// 🚨 Tres estados (CLAUDE.md raíz): `null` = no consta / no leído. NUNCA 0, nunca «excluida» por defecto,
//    nunca `[]` por defecto. Una clave AUSENTE de `garantias` = esa garantía no se ha leído.
// 🚨 La IA solo PROPONE. `validarExtraccion` es determinista: la cita tiene que estar en el texto del PDF y
//    cada importe/porcentaje tiene que estar escrito en SU cita; si no, ese valor se anula y queda un aviso.
//    Quitar esta validación es dejar que un número inventado llegue a un comparador que ve el cliente.

import { claveDeLiteral, garantiaFicha, normalizarLiteral } from './fichas-catalogo.ts'

export type EstadoCobertura = 'incluida' | 'opcional' | 'excluida'
export type Limite =
  | { tipo: 'importe'; eur: number }
  | { tipo: 'porcentaje'; pct: number; sobre: string | null }
  | { tipo: 'primer_riesgo'; eur: number }
export type Franquicia =
  | { tipo: 'importe'; eur: number }
  | { tipo: 'porcentaje'; pct: number; minimoEur: number | null; maximoEur: number | null }
  | { tipo: 'sin_franquicia' }
export type Sublimite = { concepto: string; limite: Limite; cita: string }

export type CondicionGarantia = {
  /** Literal de la compañía (cómo la llama el condicionado). */
  literal: string | null
  estado: EstadoCobertura | null
  limite: Limite | null
  /** `null` = no consta ninguno validado. Nunca `[]` «porque la IA no vio sublímites». */
  sublimites: Sublimite[] | null
  franquicia: Franquicia | null
  /** Texto LITERAL del condicionado (validado contra el PDF) o nota del humano. */
  notas: string | null
  cita: string | null
  /** Página donde está la cita, calculada por código (no la que diga la IA). */
  pagina: number | null
  origen: 'ia' | 'humano'
}

export type ExtraFicha = { literal: string; cita: string; pagina: number | null }
export type EstadoFicha = 'pendiente' | 'validada'

export type IdentidadProducto = { compania: string; ramo: string; producto: string; version: string | null }

export type CondicionesProducto = {
  /** Claves del catálogo del ramo. Ausente = no leída. */
  garantias: Record<string, CondicionGarantia>
  /** Garantías del condicionado que no casan con el catálogo (literal + cita). */
  extras: ExtraFicha[]
}

export type ValorCitado = { valor: number; cita: string; pagina: number | null }
export type ValoresPresupuesto = {
  primaTotalEur: ValorCitado | null
  primaNetaEur: ValorCitado | null
  /** clave del catálogo (continente, contenido, …) → capital de ESTE proyecto. Solo los validados. */
  capitales: Record<string, ValorCitado>
  franquiciaGeneral: { franquicia: Franquicia; cita: string; pagina: number | null } | null
}

export type MotivoAviso =
  | 'cita_ausente'
  | 'cita_no_encontrada'
  | 'importe_no_literal'
  | 'porcentaje_no_literal'
  | 'primer_riesgo_no_literal'
  | 'sin_franquicia_no_literal'
  | 'nota_no_literal'
  | 'clave_duplicada'
  | 'forma_invalida'
export type AvisoExtraccion = { donde: string; motivo: MotivoAviso; detalle: string | null }

export type ResultadoValidacion = {
  producto: string | null
  version: string | null
  condiciones: CondicionesProducto
  presupuesto: ValoresPresupuesto
  avisos: AvisoExtraccion[]
}

// ─── Texto ──────────────────────────────────────────────────────────────────

const MARCA_PAGINA = /\[\[Página (\d+)\]\]/g
const MAX_CITA = 400
const MAX_LITERAL = 160
const MAX_GARANTIAS = 120

/** Texto comparable: sin tildes, minúsculas, solo letras/números y espacios simples. */
export function textoPlano(s: string): string {
  return normalizarLiteral(s)
}

/** ¿Está la cita (≥ 8 caracteres útiles) en el texto? Comparación sobre texto plano. */
export function citaEnTexto(cita: string, texto: string): boolean {
  const c = textoPlano(cita)
  return c.length >= 8 && textoPlano(texto).includes(c)
}

/** Página («[[Página N]]») donde aparece la cita. `null` si el texto no trae marcas o no se encuentra. */
export function paginaDeCita(cita: string, texto: string): number | null {
  const c = textoPlano(cita)
  if (!c) return null
  const trozos = texto.split(MARCA_PAGINA)
  // split con grupo: [antes, n1, pág1, n2, pág2, …]
  for (let i = 1; i + 1 < trozos.length; i += 2) {
    if (textoPlano(trozos[i + 1]).includes(c)) return Number(trozos[i])
  }
  return null
}

function dosDecimales(n: number): [string, string] {
  const [e, d] = Math.abs(n).toFixed(2).split('.')
  return [e, d]
}
function miles(e: string, sep: string): string {
  return e.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

/** Formas en que un importe puede estar escrito en un PDF español (y alguna inglesa). Deterministas, sin ICU. */
export function formasImporte(n: number): string[] {
  const [e, d] = dosDecimales(n)
  const formas = [`${miles(e, '.')},${d}`, `${e},${d}`, `${miles(e, ',')}.${d}`, `${e}.${d}`]
  if (d === '00') formas.push(miles(e, '.'), e)
  return [...new Set(formas)]
}

/** Quita espacios entre cifras («1 000,00» → «1000,00») para comparar. */
function compactarCifras(s: string): string {
  // Solo el separador de miles con espacio («1 000»): un espacio seguido de EXACTAMENTE tres cifras.
  return s.replace(/(\d)[  ](?=\d{3}(?!\d))/g, '$1')
}

/** ¿Está el importe escrito, entero, en el texto? No vale un trozo de otra cifra («200» en «1.200»). */
export function importeEnTexto(n: number, texto: string): boolean {
  if (!Number.isFinite(n) || n < 0) return false
  const t = compactarCifras(texto)
  return formasImporte(n).some((f) => {
    let desde = 0
    for (;;) {
      const i = t.indexOf(f, desde)
      if (i < 0) return false
      const antes = t[i - 1] ?? ''
      const despues = t.slice(i + f.length, i + f.length + 2)
      if (!/[\d.,]/.test(antes) && !/^\d/.test(despues) && !/^[.,]\d/.test(despues)) return true
      desde = i + 1
    }
  })
}

/** ¿Está el porcentaje («10 %», «10%», «12,5 %», «10 por ciento») en el texto? */
export function porcentajeEnTexto(pct: number, texto: string): boolean {
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return false
  const entero = Number.isInteger(pct)
  const formas = entero ? [String(pct), `${pct},00`, `${pct}.00`] : [String(pct).replace('.', ','), String(pct)]
  const t = compactarCifras(texto)
  return formas.some((f) => {
    const re = new RegExp(`(^|[^\\d.,])${f.replace(/[.]/g, '\\.')}\\s*(%|por\\s*ciento)`, 'i')
    return re.test(t)
  })
}

// ─── Lectura defensiva de lo que manda la IA ────────────────────────────────

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

function cadena(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '' || /^(n\/?a|no consta|desconocid[oa]|null|-+|sin datos|ninguna?)$/i.test(t)) return null
  return t.slice(0, max)
}

/** Número positivo (acepta «1.234,56»). 0 y negativos → null (un 0 es un hueco disfrazado). */
export function numeroPositivo(v: unknown): number | null {
  let n: number | null = null
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    let s = v.replace(/[€%\s ]/g, '')
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
    n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : null
  }
  return n !== null && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function estadoCobertura(v: unknown): EstadoCobertura | null {
  return v === 'incluida' || v === 'opcional' || v === 'excluida' ? v : null
}

type Ctx = { texto: string; avisos: AvisoExtraccion[] }
const avisar = (ctx: Ctx, donde: string, motivo: MotivoAviso, detalle: string | null = null) => {
  ctx.avisos.push({ donde, motivo, detalle: detalle ? detalle.slice(0, 200) : null })
}

/** Límite validado contra SU cita. Lo que no está escrito en la cita → `null` + aviso. */
export function validarLimite(v: unknown, cita: string, donde: string, ctx: Ctx): Limite | null {
  if (v === null || v === undefined) return null
  if (!esObj(v)) { avisar(ctx, donde, 'forma_invalida', 'límite'); return null }
  if (v.tipo === 'importe') {
    const eur = numeroPositivo(v.eur)
    if (eur === null) return null
    if (!importeEnTexto(eur, cita)) { avisar(ctx, donde, 'importe_no_literal', String(eur)); return null }
    return { tipo: 'importe', eur }
  }
  if (v.tipo === 'primer_riesgo') {
    const eur = numeroPositivo(v.eur)
    if (eur === null) return null
    if (!importeEnTexto(eur, cita)) { avisar(ctx, donde, 'importe_no_literal', String(eur)); return null }
    if (!textoPlano(cita).includes('primer riesgo')) { avisar(ctx, donde, 'primer_riesgo_no_literal', null); return { tipo: 'importe', eur } }
    return { tipo: 'primer_riesgo', eur }
  }
  if (v.tipo === 'porcentaje') {
    const pct = numeroPositivo(v.pct)
    if (pct === null) return null
    if (!porcentajeEnTexto(pct, cita)) { avisar(ctx, donde, 'porcentaje_no_literal', `${pct}%`); return null }
    return { tipo: 'porcentaje', pct, sobre: cadena(v.sobre, 120) }
  }
  avisar(ctx, donde, 'forma_invalida', `tipo de límite ${String(v.tipo)}`)
  return null
}

const SIN_FRANQUICIA = /\b(sin franquicia|franquicia 0 00|franquicia 0|franquicia ninguna|no (se )?aplica franquicia|exento de franquicia|franquicia no aplicable)\b/

/** Franquicia validada contra SU cita. */
export function validarFranquicia(v: unknown, cita: string, donde: string, ctx: Ctx): Franquicia | null {
  if (v === null || v === undefined) return null
  if (!esObj(v)) { avisar(ctx, donde, 'forma_invalida', 'franquicia'); return null }
  if (v.tipo === 'sin_franquicia') {
    if (!SIN_FRANQUICIA.test(textoPlano(cita))) { avisar(ctx, donde, 'sin_franquicia_no_literal', null); return null }
    return { tipo: 'sin_franquicia' }
  }
  if (v.tipo === 'importe') {
    const eur = numeroPositivo(v.eur)
    if (eur === null) return null
    if (!importeEnTexto(eur, cita)) { avisar(ctx, donde, 'importe_no_literal', String(eur)); return null }
    return { tipo: 'importe', eur }
  }
  if (v.tipo === 'porcentaje') {
    const pct = numeroPositivo(v.pct)
    if (pct === null) return null
    if (!porcentajeEnTexto(pct, cita)) { avisar(ctx, donde, 'porcentaje_no_literal', `${pct}%`); return null }
    const tope = (x: unknown, nombre: string): number | null => {
      const n = numeroPositivo(x)
      if (n === null) return null
      if (!importeEnTexto(n, cita)) { avisar(ctx, `${donde}.${nombre}`, 'importe_no_literal', String(n)); return null }
      return n
    }
    return { tipo: 'porcentaje', pct, minimoEur: tope(v.minimoEur, 'minimo'), maximoEur: tope(v.maximoEur, 'maximo') }
  }
  avisar(ctx, donde, 'forma_invalida', `tipo de franquicia ${String(v.tipo)}`)
  return null
}

/** Cita del bruto, comprobada contra el texto del PDF. `null` = no hay cita válida (y se avisa). */
function citaValida(v: unknown, donde: string, ctx: Ctx): string | null {
  const cita = cadena(v, MAX_CITA)
  if (cita === null) { avisar(ctx, donde, 'cita_ausente'); return null }
  if (!citaEnTexto(cita, ctx.texto)) { avisar(ctx, donde, 'cita_no_encontrada', cita); return null }
  return cita
}

function validarGarantia(b: Obj, donde: string, ctx: Ctx): CondicionGarantia | null {
  const cita = citaValida(b.cita, donde, ctx)
  // Sin cita en el PDF no se acepta NADA de esa garantía (ni el estado): queda como no leída.
  if (cita === null) return null
  const subs: Sublimite[] = []
  if (Array.isArray(b.sublimites)) {
    b.sublimites.slice(0, 20).forEach((s, i) => {
      if (!esObj(s)) return
      const d = `${donde}.sublimites[${i}]`
      const concepto = cadena(s.concepto, MAX_LITERAL)
      const c = citaValida(s.cita, d, ctx)
      if (!concepto || !c) return
      const limite = validarLimite(s.limite, c, d, ctx)
      if (limite) subs.push({ concepto, limite, cita: c })
    })
  }
  let notas = cadena(b.notas, 600)
  if (notas !== null && !citaEnTexto(notas, ctx.texto)) {
    avisar(ctx, `${donde}.notas`, 'nota_no_literal', notas)
    notas = null
  }
  return {
    literal: cadena(b.literal, MAX_LITERAL),
    estado: estadoCobertura(b.estado),
    limite: validarLimite(b.limite, cita, `${donde}.limite`, ctx),
    sublimites: subs.length > 0 ? subs : null,
    franquicia: validarFranquicia(b.franquicia, cita, `${donde}.franquicia`, ctx),
    notas,
    cita,
    pagina: paginaDeCita(cita, ctx.texto),
    origen: 'ia',
  }
}

function valorCitado(v: unknown, donde: string, ctx: Ctx): ValorCitado | null {
  if (v === null || v === undefined) return null
  if (!esObj(v)) { avisar(ctx, donde, 'forma_invalida'); return null }
  const valor = numeroPositivo(v.valor)
  if (valor === null) return null
  const cita = citaValida(v.cita, donde, ctx)
  if (cita === null) return null
  if (!importeEnTexto(valor, cita)) { avisar(ctx, donde, 'importe_no_literal', String(valor)); return null }
  return { valor, cita, pagina: paginaDeCita(cita, ctx.texto) }
}

/** Solo los VALORES DEL PRESUPUESTO (lo que se extrae cuando la ficha del producto ya está validada). */
export function validarValoresPresupuesto(bruto: unknown, ramo: string, texto: string): { presupuesto: ValoresPresupuesto; avisos: AvisoExtraccion[] } {
  const ctx: Ctx = { texto, avisos: [] }
  return { presupuesto: presupuestoDe(bruto, ramo, ctx), avisos: ctx.avisos }
}

function presupuestoDe(bruto: unknown, ramo: string, ctx: Ctx): ValoresPresupuesto {
  const p = esObj(bruto) ? bruto : {}
  const capitales: Record<string, ValorCitado> = {}
  if (Array.isArray(p.capitales)) {
    p.capitales.slice(0, 40).forEach((c, i) => {
      if (!esObj(c)) return
      const literal = cadena(c.clave, MAX_LITERAL)
      const clave = literal && garantiaFicha(ramo, literal) ? literal : literal ? claveDeLiteral(ramo, literal) : null
      if (!clave) return
      if (clave in capitales) { avisar(ctx, `presupuesto.capitales[${i}]`, 'clave_duplicada', clave); return }
      const v = valorCitado(c, `presupuesto.capitales.${clave}`, ctx)
      if (v) capitales[clave] = v
    })
  }
  let franquiciaGeneral: ValoresPresupuesto['franquiciaGeneral'] = null
  if (esObj(p.franquiciaGeneral)) {
    const cita = citaValida(p.franquiciaGeneral.cita, 'presupuesto.franquiciaGeneral', ctx)
    const f = cita ? validarFranquicia(p.franquiciaGeneral.franquicia, cita, 'presupuesto.franquiciaGeneral', ctx) : null
    if (cita && f) franquiciaGeneral = { franquicia: f, cita, pagina: paginaDeCita(cita, ctx.texto) }
  }
  return {
    primaTotalEur: valorCitado(p.primaTotal, 'presupuesto.primaTotal', ctx),
    primaNetaEur: valorCitado(p.primaNeta, 'presupuesto.primaNeta', ctx),
    capitales,
    franquiciaGeneral,
  }
}

/**
 * La salida de la IA (JSON ya parseado) → condiciones del producto + valores del presupuesto, VALIDADOS
 * contra el texto del PDF. Nunca lanza. Lo que no se puede probar con el texto queda `null` + aviso.
 */
export function validarExtraccion(bruto: unknown, ramo: string, texto: string): ResultadoValidacion {
  const ctx: Ctx = { texto, avisos: [] }
  const b = esObj(bruto) ? bruto : {}
  const garantias: Record<string, CondicionGarantia> = {}
  const extras: ExtraFicha[] = []
  const lista = Array.isArray(b.garantias) ? b.garantias.slice(0, MAX_GARANTIAS) : []
  lista.forEach((crudo, i) => {
    if (!esObj(crudo)) return
    const literal = cadena(crudo.literal, MAX_LITERAL)
    const propuesta = cadena(crudo.clave, 60)
    // La clave de la IA solo vale si es del catálogo; si no, se intenta por el literal; si no, extra.
    const clave = propuesta && garantiaFicha(ramo, propuesta) ? propuesta : literal ? claveDeLiteral(ramo, literal) : null
    const donde = `garantias.${clave ?? literal ?? i}`
    if (clave === null || clave in garantias) {
      if (clave !== null) avisar(ctx, donde, 'clave_duplicada', literal)
      const cita = citaValida(crudo.cita, donde, ctx)
      if (literal && cita) extras.push({ literal, cita, pagina: paginaDeCita(cita, texto) })
      return
    }
    const g = validarGarantia(crudo, donde, ctx)
    if (g) garantias[clave] = { ...g, literal: g.literal ?? literal }
  })
  let version: string | null = null
  if (esObj(b.version)) {
    const v = cadena(b.version.valor, 80)
    const c = citaValida(b.version.cita, 'version', ctx)
    // La versión tiene que estar escrita en su cita (p. ej. «Condicionado general mod. CG-COM 01/2020»).
    if (v && c && textoPlano(c).includes(textoPlano(v))) version = v
    else if (v && c) avisar(ctx, 'version', 'cita_no_encontrada', v)
  }
  return {
    producto: cadena(b.producto, MAX_LITERAL),
    version,
    condiciones: { garantias, extras },
    presupuesto: presupuestoDe(b.presupuesto, ramo, ctx),
    avisos: ctx.avisos,
  }
}

// ─── Huella del condicionado ────────────────────────────────────────────────

/** FNV-1a de 64 bits (hex). Determinista y sin dependencias: no es criptográfico ni lo necesita. */
export function fnv1a64(s: string): string {
  let h = 0xcbf29ce484222325n
  const p = 0x100000001b3n
  const m = 0xffffffffffffffffn
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i))
    h = (h * p) & m
  }
  return h.toString(16).padStart(16, '0')
}

/** Citas de las condiciones del producto (garantías + sublímites + notas literales + extras), ordenadas. */
export function citasCondicionado(c: CondicionesProducto): { donde: string; cita: string }[] {
  const out: { donde: string; cita: string }[] = []
  for (const clave of Object.keys(c.garantias).sort()) {
    const g = c.garantias[clave]
    if (g.origen !== 'ia') continue
    if (g.cita) out.push({ donde: clave, cita: g.cita })
    g.sublimites?.forEach((s, i) => out.push({ donde: `${clave}.sublimites[${i}]`, cita: s.cita }))
  }
  for (const e of c.extras) out.push({ donde: `extra:${e.literal}`, cita: e.cita })
  return out
}

/** Huella del texto de garantías del condicionado: cambia si cambia cualquier cita del producto. */
export function huellaCondicionado(c: CondicionesProducto): string {
  return fnv1a64(citasCondicionado(c).map((x) => `${x.donde}\u0001${textoPlano(x.cita)}`).join('\u0002'))
}

/**
 * Con una ficha VALIDADA y un PDF nuevo del mismo producto: ¿sigue el condicionado diciendo lo mismo?
 * Cada cita de la ficha tiene que seguir estando en el texto nuevo. Las que falten = el condicionado cambió.
 */
export function comprobarCondicionado(c: CondicionesProducto, textoNuevo: string): { cambiado: boolean; citasAusentes: string[] } {
  const plano = textoPlano(textoNuevo)
  const ausentes = citasCondicionado(c).filter((x) => !plano.includes(textoPlano(x.cita))).map((x) => x.donde)
  return { cambiado: ausentes.length > 0, citasAusentes: ausentes }
}

// ─── Edición humana (plataforma) ────────────────────────────────────────────

export type EdicionGarantia = {
  estado: EstadoCobertura | null
  limite: Limite | null
  franquicia: Franquicia | null
  notas: string | null
}

function limiteHumano(v: unknown): Limite | null | false {
  if (v === null || v === undefined) return null
  if (!esObj(v)) return false
  const eur = numeroPositivo(v.eur)
  const pct = numeroPositivo(v.pct)
  if (v.tipo === 'importe') return eur === null ? false : { tipo: 'importe', eur }
  if (v.tipo === 'primer_riesgo') return eur === null ? false : { tipo: 'primer_riesgo', eur }
  if (v.tipo === 'porcentaje') return pct === null || pct > 100 ? false : { tipo: 'porcentaje', pct, sobre: cadena(v.sobre, 120) }
  return false
}

function franquiciaHumana(v: unknown): Franquicia | null | false {
  if (v === null || v === undefined) return null
  if (!esObj(v)) return false
  if (v.tipo === 'sin_franquicia') return { tipo: 'sin_franquicia' }
  if (v.tipo === 'importe') { const eur = numeroPositivo(v.eur); return eur === null ? false : { tipo: 'importe', eur } }
  if (v.tipo === 'porcentaje') {
    const pct = numeroPositivo(v.pct)
    if (pct === null || pct > 100) return false
    return { tipo: 'porcentaje', pct, minimoEur: numeroPositivo(v.minimoEur), maximoEur: numeroPositivo(v.maximoEur) }
  }
  return false
}

/** Valida lo que manda plataforma al editar UNA garantía. `null` en un campo = «no consta» (válido). */
export function validarEdicionGarantia(ramo: string, clave: unknown, bruto: unknown): { ok: true; clave: string; edicion: EdicionGarantia } | { ok: false; motivo: string } {
  if (typeof clave !== 'string' || !garantiaFicha(ramo, clave)) return { ok: false, motivo: 'garantía fuera del catálogo del ramo' }
  if (!esObj(bruto)) return { ok: false, motivo: 'edición sin forma' }
  if (bruto.estado !== null && bruto.estado !== undefined && estadoCobertura(bruto.estado) === null) return { ok: false, motivo: 'estado inválido' }
  const limite = limiteHumano(bruto.limite)
  if (limite === false) return { ok: false, motivo: 'límite inválido' }
  const franquicia = franquiciaHumana(bruto.franquicia)
  if (franquicia === false) return { ok: false, motivo: 'franquicia inválida' }
  return { ok: true, clave, edicion: { estado: estadoCobertura(bruto.estado), limite, franquicia, notas: cadena(bruto.notas, 600) } }
}

/** Aplica la edición humana: la cita de la IA se conserva como referencia, el origen pasa a `humano`. */
export function aplicarEdicion(c: CondicionesProducto, clave: string, e: EdicionGarantia): CondicionesProducto {
  const previa = c.garantias[clave]
  return {
    ...c,
    garantias: {
      ...c.garantias,
      [clave]: {
        literal: previa?.literal ?? null,
        estado: e.estado,
        limite: e.limite,
        sublimites: previa?.sublimites ?? null,
        franquicia: e.franquicia,
        notas: e.notas,
        cita: previa?.cita ?? null,
        pagina: previa?.pagina ?? null,
        origen: 'humano',
      },
    },
  }
}

/** Lee del jsonb guardado; lo que no tiene forma se descarta (no se inventa un valor). */
export function condicionesDeJson(v: unknown): CondicionesProducto {
  const o = esObj(v) ? v : {}
  const garantias: Record<string, CondicionGarantia> = {}
  if (esObj(o.garantias)) {
    for (const [k, x] of Object.entries(o.garantias)) {
      if (!esObj(x)) continue
      garantias[k] = {
        literal: typeof x.literal === 'string' ? x.literal : null,
        estado: estadoCobertura(x.estado),
        limite: (limiteHumano(x.limite) || null) as Limite | null,
        sublimites: Array.isArray(x.sublimites)
          ? x.sublimites.flatMap((s) => {
            if (!esObj(s) || typeof s.concepto !== 'string' || typeof s.cita !== 'string') return []
            const l = limiteHumano(s.limite)
            return l ? [{ concepto: s.concepto, limite: l, cita: s.cita }] : []
          })
          : null,
        franquicia: (franquiciaHumana(x.franquicia) || null) as Franquicia | null,
        notas: typeof x.notas === 'string' ? x.notas : null,
        cita: typeof x.cita === 'string' ? x.cita : null,
        pagina: typeof x.pagina === 'number' && Number.isInteger(x.pagina) ? x.pagina : null,
        origen: x.origen === 'humano' ? 'humano' : 'ia',
      }
      if (garantias[k].sublimites?.length === 0) garantias[k].sublimites = null
    }
  }
  const extras = Array.isArray(o.extras)
    ? o.extras.flatMap((e) => (esObj(e) && typeof e.literal === 'string' && typeof e.cita === 'string'
      ? [{ literal: e.literal, cita: e.cita, pagina: typeof e.pagina === 'number' ? e.pagina : null }] : []))
    : []
  return { garantias, extras }
}

/** Lee del jsonb guardado los valores del presupuesto. */
export function presupuestoDeJson(v: unknown): ValoresPresupuesto {
  const o = esObj(v) ? v : {}
  const vc = (x: unknown): ValorCitado | null =>
    esObj(x) && typeof x.valor === 'number' && x.valor > 0 && typeof x.cita === 'string'
      ? { valor: x.valor, cita: x.cita, pagina: typeof x.pagina === 'number' ? x.pagina : null } : null
  const capitales: Record<string, ValorCitado> = {}
  if (esObj(o.capitales)) for (const [k, x] of Object.entries(o.capitales)) { const c = vc(x); if (c) capitales[k] = c }
  let franquiciaGeneral: ValoresPresupuesto['franquiciaGeneral'] = null
  if (esObj(o.franquiciaGeneral) && typeof o.franquiciaGeneral.cita === 'string') {
    const f = franquiciaHumana(o.franquiciaGeneral.franquicia)
    if (f) franquiciaGeneral = { franquicia: f, cita: o.franquiciaGeneral.cita, pagina: typeof o.franquiciaGeneral.pagina === 'number' ? o.franquiciaGeneral.pagina : null }
  }
  return { primaTotalEur: vc(o.primaTotalEur), primaNetaEur: vc(o.primaNetaEur), capitales, franquiciaGeneral }
}

/** Clave de identidad del producto (compañía y producto normalizados; versión `null` = «sin versión»). */
export function claveProducto(p: IdentidadProducto): string {
  return [textoPlano(p.compania), p.ramo, textoPlano(p.producto), p.version ? textoPlano(p.version) : ''].join('|')
}
