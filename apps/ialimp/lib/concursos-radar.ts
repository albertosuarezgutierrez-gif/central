// Parser PURO de la sindicación ATOM de PLACSP (CODICE) → anuncios normalizados,
// y clave de deduplicación estable. Sin red ni BD: testeable con `node --test`.
import { XMLParser } from 'fast-xml-parser'
import type { AnuncioRadar } from '@iarest/module-concursos'

/** Anuncio captado del radar + identificador estable del expediente. */
export interface AnuncioPlacsp extends AnuncioRadar {
  expediente?: string   // ContractFolderID (id estable del expediente)
  atom_id?: string      // <id> del entry (fallback de dedupe)
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,   // 'cac:ProcurementProject' -> 'ProcurementProject'
  trimValues: true,
})

/** Normaliza un valor a array (fast-xml-parser colapsa nodos únicos). */
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/** Texto de un nodo que puede ser string o `{ '#text': ... }`. */
function texto(v: any): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'object') return v['#text'] !== undefined ? String(v['#text']) : undefined
  return String(v)
}

/** href del <link> (puede ser uno o varios; coge el primero con href). */
function hrefDe(link: any): string | undefined {
  for (const l of asArray(link)) {
    const h = l?.['@_href']
    if (h) return String(h)
  }
  return undefined
}

/** Parsea un ATOM de PLACSP a anuncios normalizados. Tolerante a campos ausentes. */
export function parsearAtomPlacsp(xml: string): AnuncioPlacsp[] {
  if (!xml || !xml.trim()) return []
  let doc: any
  try { doc = parser.parse(xml) } catch { return [] }
  const entries = asArray(doc?.feed?.entry)

  const out: AnuncioPlacsp[] = []
  for (const e of entries) {
    const cfs = e?.ContractFolderStatus
    const pp = cfs?.ProcurementProject

    const titulo = texto(pp?.Name) || texto(e?.title) || 'Licitación'
    const organo = texto(cfs?.LocatedContractingParty?.Party?.PartyName?.Name)

    const cpv: string[] = []
    for (const rcc of asArray(pp?.RequiredCommodityClassification)) {
      const code = texto(rcc?.ItemClassificationCode)
      if (code) cpv.push(code)
    }

    const presupRaw = texto(pp?.BudgetAmount?.TotalAmount)
    const presupuesto = presupRaw !== undefined && presupRaw !== '' && Number.isFinite(Number(presupRaw))
      ? Number(presupRaw)
      : undefined

    out.push({
      titulo,
      objeto: titulo,
      cpv: cpv.length ? cpv : undefined,
      presupuesto,
      organo,
      url: hrefDe(e?.link),
      expediente: texto(cfs?.ContractFolderID),
      atom_id: texto(e?.id),
    })
  }
  return out
}

/** Clave de dedupe estable: expediente > atom_id > url > título. */
export function dedupeKey(a: AnuncioPlacsp): string {
  return (a.expediente || a.atom_id || a.url || a.titulo || '').trim()
}
