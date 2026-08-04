// Ingesta de insiders desde los formularios 4 de la SEC (compras/ventas de directivos y >10%).
// El Form 4 es un XML público (`ownershipDocument`) con el ticker del emisor, el nombre del insider,
// su cargo y las transacciones. Nos quedamos SOLO con las de mercado abierto (código P = compra,
// S = venta): son la señal limpia (ignoramos A/M/G = premios, ejercicio de opciones, donaciones…).
// El parseo es PURO y testeado; el fetch corre desde el egress de Vercel (la SEC exige un User-Agent
// con contacto y bloquea IPs anónimas / al sandbox de las sesiones).
import type { TxInsider } from '@central/module-trading'

const SEC_UA = 'central-trading paper-research (contacto: alberto.suarez.gutierrez@gmail.com)'

// Extrae el texto del PRIMER <tag>…</tag> (o <tag><value>…</value>) del fragmento. Defensivo.
function tag(xml: string, nombre: string): string | undefined {
  const m = xml.match(new RegExp(`<${nombre}[^>]*>\\s*(?:<value>\\s*)?([^<]+?)\\s*(?:</value>)?\\s*</${nombre}>`, 'i'))
  return m ? m[1].trim() : undefined
}

// Parsea UN Form 4 (ownershipDocument XML) → transacciones de mercado abierto (P/S). Un filing puede
// traer varias. Rechaza los códigos que no son compra/venta directa. Devuelve [] si no hay ticker.
export function parseForm4Xml(xml: string): TxInsider[] {
  const simbolo = (tag(xml, 'issuerTradingSymbol') ?? '').toUpperCase().trim()
  if (!simbolo || simbolo === 'NONE') return []
  const insider = tag(xml, 'rptOwnerName') ?? 'desconocido'
  const rol = tag(xml, 'officerTitle')
    ?? (/(<isDirector>\s*(?:1|true)\s*<\/isDirector>)/i.test(xml) ? 'Director'
      : /(<isTenPercentOwner>\s*(?:1|true)\s*<\/isTenPercentOwner>)/i.test(xml) ? '10% owner' : undefined)

  const out: TxInsider[] = []
  // Cada transacción no-derivada (acciones comunes) es un bloque <nonDerivativeTransaction>…</…>.
  const bloques = xml.split(/<nonDerivativeTransaction[\s>]/i).slice(1)
  for (const b of bloques) {
    const frag = b.split(/<\/nonDerivativeTransaction>/i)[0]
    const codigo = (tag(frag, 'transactionCode') ?? '').toUpperCase()
    if (codigo !== 'P' && codigo !== 'S') continue   // solo compra/venta de mercado abierto
    const acciones = Number(tag(frag, 'transactionShares'))
    const precioUsd = Number(tag(frag, 'transactionPricePerShare'))
    if (!(acciones > 0)) continue
    out.push({
      simbolo, insider, rol,
      tipo: codigo === 'P' ? 'compra' : 'venta',
      acciones,
      precioUsd: precioUsd > 0 ? precioUsd : undefined,
    })
  }
  return out
}

// De un feed atom de la SEC saca {cik, accesion} de cada entrada. ⚠️ El feed `getcurrent` NO enlaza a
// /Archives/ en cada entrada: el <link> apunta a la ficha del filer (`?CIK=…`) y el nº de accession va
// en el <id> (`urn:tag:sec.gov,2008:accession-number=0000320193-26-000077`). Por eso parseamos por
// ENTRADA: accession desde el <id> + CIK desde el enlace. Se mantiene el formato /Archives/ como
// fallback (feeds/índices que sí lo traen). CIK sin ceros a la izquierda (formato de la ruta Archives).
export function extraerEntradasAtom(atom: string): Array<{ cik: string; accesion: string }> {
  const out: Array<{ cik: string; accesion: string }> = []
  const vistos = new Set<string>()
  const add = (cikRaw: string, accRaw: string) => {
    const accesion = accRaw.replace(/-/g, '')
    if (!/^\d{18}$/.test(accesion)) return          // 10+2+6 dígitos
    const cik = cikRaw.replace(/^0+/, '') || '0'
    const clave = `${cik}:${accesion}`
    if (vistos.has(clave)) return
    vistos.add(clave)
    out.push({ cik, accesion })
  }
  const entradas = atom.split(/<entry[\s>]/i).slice(1)
  for (const e of entradas) {
    const acc = e.match(/accession-number=([0-9]{10}-[0-9]{2}-[0-9]{6})/i)
    const cik = e.match(/CIK=0*([0-9]+)/i)
    if (acc && cik) { add(cik[1], acc[1]); continue }
    // Fallback dentro de la entrada: enlace directo /Archives/edgar/data/<cik>/<accesion>
    const arch = e.match(/\/Archives\/edgar\/data\/(\d+)\/([0-9-]{18,20})/i)
    if (arch) add(arch[1], arch[2])
  }
  // Fallback global: feed sin <entry> pero con rutas /Archives/ sueltas.
  if (out.length === 0) {
    for (const h of atom.match(/\/Archives\/edgar\/data\/(\d+)\/([0-9-]{18,20})/gi) ?? []) {
      const m = h.match(/\/data\/(\d+)\/([0-9-]{18,20})/)
      if (m) add(m[1], m[2])
    }
  }
  return out
}

// De la lista de ficheros del filing (index.json) elige el XML del Form 4 (descarta el rendered R*.xml
// y ficheros auxiliares). Devuelve el nombre del documento o null.
export function elegirDocForm4(indexJson: unknown): string | null {
  const items = (indexJson as { directory?: { item?: Array<{ name?: string }> } })?.directory?.item ?? []
  const xmls = items.map(i => i.name ?? '').filter(n => /\.xml$/i.test(n) && !/^R\d+\.xml$/i.test(n) && n.toLowerCase() !== 'metalinks.xml')
  // Prioriza el que parece el primario del Form 4 (contiene "form4" o "wf-form4" o "doc4").
  const primario = xmls.find(n => /(wf-?form4|form4|doc4|ownership)/i.test(n))
  return primario ?? xmls[0] ?? null
}

async function getJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': SEC_UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    return r.ok ? await r.json() : null
  } catch { return null }
}
async function getText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': SEC_UA }, signal: AbortSignal.timeout(timeoutMs) })
    return r.ok ? await r.text() : null
  } catch { return null }
}

// Descarga las transacciones de UN filing (resuelve el XML por index.json y lo parsea). Best-effort → [].
export async function transaccionesFiling(cik: string, accesion: string, timeoutMs = 8000): Promise<TxInsider[]> {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${accesion}`
  const idx = await getJson(`${base}/index.json`, timeoutMs)
  const doc = idx ? elegirDocForm4(idx) : null
  if (!doc) return []
  const xml = await getText(`${base}/${doc}`, timeoutMs)
  return xml ? parseForm4Xml(xml) : []
}

// Escanea los Form 4 MÁS RECIENTES de la SEC y devuelve sus transacciones de mercado abierto. Best-effort
// y ACOTADO (`limite` filings): la SEC pide cortesía en el rate. Corre SOLO en Vercel (la SEC bloquea el
// sandbox). Ojo: son 2 hops por filing (index.json + XML) → mantener `limite` bajo (default 40).
export async function insidersRecientes(limite = 40, timeoutMs = 8000): Promise<TxInsider[]> {
  const atom = await getText(
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=${Math.min(limite * 2, 100)}&output=atom`,
    timeoutMs,
  )
  if (!atom) return []
  const entradas = extraerEntradasAtom(atom).slice(0, limite)
  const lotes = await Promise.all(entradas.map(e => transaccionesFiling(e.cik, e.accesion, timeoutMs)))
  return lotes.flat()
}
