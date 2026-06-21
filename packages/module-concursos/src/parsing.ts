// ────────────────────────────────────────────────────────────────────────────
// Parsing — PURO. Convierte la respuesta cruda del LLM en una FichaConcurso
// validada y normalizada. No importa core-ai (puerto AiRunner) ni toca red.
// ────────────────────────────────────────────────────────────────────────────

import type {
  FichaConcurso,
  CriterioValoracion,
  DocumentoRequerido,
  RequisitoSolvencia,
  Garantias,
  PlazosConcurso,
  TipoContrato,
  TipoProcedimiento,
  TipoSobre,
  TipoCriterio,
} from './types'

const TIPOS_CONTRATO: TipoContrato[] = ['servicios', 'suministros', 'obras', 'concesion_servicios', 'concesion_obras', 'mixto', 'otro']
const PROCEDIMIENTOS: TipoProcedimiento[] = ['abierto', 'abierto_simplificado', 'simplificado_sumario', 'restringido', 'negociado', 'dialogo_competitivo', 'otro']
const SOBRES: TipoSobre[] = ['administrativo', 'tecnico', 'economico']

/**
 * Limpia el texto del modelo: quita vallas markdown (```json … ```) y se queda
 * con el primer objeto JSON balanceado que encuentre.
 */
export function limpiarJSON(raw: string): string {
  let s = (raw || '').trim()
  // Quita una valla de código envolvente (```json ... ``` o ``` ... ```).
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) s = fence[1].trim()
  // Recorta a las llaves exteriores por si quedó texto suelto alrededor.
  const ini = s.indexOf('{')
  const fin = s.lastIndexOf('}')
  if (ini !== -1 && fin !== -1 && fin > ini) s = s.slice(ini, fin + 1)
  return s
}

/** Convierte a número tolerando strings con €, espacios y separador de miles. */
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string') return undefined
  // "1.234.567,89 €" → "1234567.89"
  let t = v.replace(/[€\s]/g, '')
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',')) t = t.replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : undefined
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length ? t : undefined
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.map(str).filter((x): x is string => !!x)
  return out.length ? out : undefined
}

function oneOf<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  const t = typeof v === 'string' ? (v.trim().toLowerCase() as T) : undefined
  return t && allowed.includes(t) ? t : fallback
}

function bool(v: unknown, fallback = true): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return !/^(no|false|0)$/i.test(v.trim())
  return fallback
}

function parseCriterios(v: unknown): CriterioValoracion[] {
  if (!Array.isArray(v)) return []
  return v.map((c: any): CriterioValoracion | null => {
    const nombre = str(c?.nombre)
    if (!nombre) return null
    const tipo = oneOf<TipoCriterio>(c?.tipo, ['automatico', 'juicio_valor'], 'juicio_valor')
    const item: CriterioValoracion = { nombre, puntos: num(c?.puntos) ?? 0, tipo }
    const sobre = typeof c?.sobre === 'string' ? oneOf<TipoSobre>(c.sobre, SOBRES, 'tecnico') : undefined
    if (sobre) item.sobre = sobre
    const formula = str(c?.formula)
    if (formula) item.formula = formula
    return item
  }).filter((x): x is CriterioValoracion => x !== null)
}

function parseDocumentos(v: unknown): DocumentoRequerido[] {
  if (!Array.isArray(v)) return []
  return v.map((d: any): DocumentoRequerido | null => {
    const nombre = str(d?.nombre)
    if (!nombre) return null
    const item: DocumentoRequerido = {
      nombre,
      sobre: oneOf<TipoSobre>(d?.sobre, SOBRES, 'administrativo'),
      obligatorio: bool(d?.obligatorio, true),
    }
    const modelo = str(d?.modelo)
    if (modelo) item.modelo = modelo
    return item
  }).filter((x): x is DocumentoRequerido => x !== null)
}

function parseSolvencia(v: unknown): RequisitoSolvencia[] {
  if (!Array.isArray(v)) return []
  return v.map((s: any): RequisitoSolvencia | null => {
    const descripcion = str(s?.descripcion)
    if (!descripcion) return null
    const item: RequisitoSolvencia = {
      ambito: oneOf<'economica' | 'tecnica'>(s?.ambito, ['economica', 'tecnica'], 'tecnica'),
      descripcion,
    }
    const importe = num(s?.importe_minimo)
    if (importe !== undefined) item.importe_minimo = importe
    return item
  }).filter((x): x is RequisitoSolvencia => x !== null)
}

function parseGarantias(v: any): Garantias {
  const g: Garantias = {}
  const p = num(v?.provisional_pct); if (p !== undefined) g.provisional_pct = p
  const d = num(v?.definitiva_pct); if (d !== undefined) g.definitiva_pct = d
  const c = num(v?.complementaria_pct); if (c !== undefined) g.complementaria_pct = c
  return g
}

function parsePlazos(v: any): PlazosConcurso {
  const p: PlazosConcurso = {}
  const pub = str(v?.publicacion); if (pub) p.publicacion = pub
  const fin = str(v?.fin_presentacion); if (fin) p.fin_presentacion = fin
  const acl = str(v?.fin_aclaraciones); if (acl) p.fin_aclaraciones = acl
  const ej = num(v?.ejecucion_meses); if (ej !== undefined) p.ejecucion_meses = ej
  return p
}

/**
 * Parsea y normaliza la respuesta del LLM a una FichaConcurso.
 * Lanza Error si el JSON no es válido; en lo demás aplica defaults seguros.
 */
export function parseFichaConcurso(raw: string): FichaConcurso {
  let obj: any
  try {
    obj = JSON.parse(limpiarJSON(raw))
  } catch {
    throw new Error('La respuesta del agente no es un JSON válido')
  }
  if (!obj || typeof obj !== 'object') throw new Error('La ficha extraída está vacía')

  const ficha: FichaConcurso = {
    objeto: str(obj.objeto) ?? '(objeto no detectado)',
    tipo_contrato: oneOf<TipoContrato>(obj.tipo_contrato, TIPOS_CONTRATO, 'otro'),
    procedimiento: oneOf<TipoProcedimiento>(obj.procedimiento, PROCEDIMIENTOS, 'otro'),
    lotes: num(obj.lotes) ?? 0,
    plazos: parsePlazos(obj.plazos),
    solvencia: parseSolvencia(obj.solvencia),
    garantias: parseGarantias(obj.garantias),
    criterios: parseCriterios(obj.criterios),
    documentos: parseDocumentos(obj.documentos),
  }

  const organo = str(obj.organo_contratacion); if (organo) ficha.organo_contratacion = organo
  const exp = str(obj.expediente); if (exp) ficha.expediente = exp
  const cpv = strArray(obj.cpv); if (cpv) ficha.cpv = cpv
  const pb = num(obj.presupuesto_base); if (pb !== undefined) ficha.presupuesto_base = pb
  const ve = num(obj.valor_estimado); if (ve !== undefined) ficha.valor_estimado = ve
  const avisos = strArray(obj.avisos); if (avisos) ficha.avisos = avisos

  return ficha
}
