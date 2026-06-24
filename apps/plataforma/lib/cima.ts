// Cliente CIMA WSE Estándar (TIREA).
// Descarga ficheros LIQ (liquidaciones de comisiones) vía SOAP y los parsea.
// Credenciales: CIMA_WSE_USER, CIMA_WSE_PASSWORD, CIMA_WSE_PLATAFORMA (Vercel env).

const WSE_ENDPOINT = 'https://ws.cimaseg.es/wsEstandar/'
const WSE_USER     = process.env.CIMA_WSE_USER      ?? 'cima.albertocsf0170ws'
const WSE_PLAT     = process.env.CIMA_WSE_PLATAFORMA ?? 'ALBERTOSUAREZ_6393'
const WSE_PASS     = process.env.CIMA_WSE_PASSWORD  ?? ''

export interface LiqFichero {
  nombreFichero: string
  compania:      string   // nombre legible detectado del código CIMA
  periodo:       string   // 'YYYY-MM'
  importeBruto:  number
  importeNeto:   number
  fechaFichero:  string | null
  rawCabecera:   string
}

// --- SOAP helper ----------------------------------------------------------

function buildSoapEnvelope(tipoFichero: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wse="http://www.tirea.es/WSEstandar/">
  <soapenv:Header/>
  <soapenv:Body>
    <wse:recibirFicherosPendientes>
      <wse:securityCredentialsUser>${WSE_USER}</wse:securityCredentialsUser>
      <wse:securityCredentialsPassword>${escapeXml(WSE_PASS)}</wse:securityCredentialsPassword>
      <wse:codigoPlataforma>${WSE_PLAT}</wse:codigoPlataforma>
      <wse:tipoFichero>${tipoFichero}</wse:tipoFichero>
    </wse:recibirFicherosPendientes>
  </soapenv:Body>
</soapenv:Envelope>`
}

function buildConfirmarEnvelope(nombreFichero: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wse="http://www.tirea.es/WSEstandar/">
  <soapenv:Header/>
  <soapenv:Body>
    <wse:confirmarFicherosRecibidos>
      <wse:securityCredentialsUser>${WSE_USER}</wse:securityCredentialsUser>
      <wse:securityCredentialsPassword>${escapeXml(WSE_PASS)}</wse:securityCredentialsPassword>
      <wse:codigoPlataforma>${WSE_PLAT}</wse:codigoPlataforma>
      <wse:nombreFichero>${escapeXml(nombreFichero)}</wse:nombreFichero>
    </wse:confirmarFicherosRecibidos>
  </soapenv:Body>
</soapenv:Envelope>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Extrae el texto de un tag XML simple del response SOAP.
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<[^>]*${tag}[^>]*>([^<]*)<`, 'i'))
  return m?.[1]?.trim() ?? ''
}

// Extrae todos los bloques de un tag repetido.
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)<\/[^>]*${tag}>`, 'gi')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim())
  return results
}

// --- Parser EIAC 6.0 LIQ --------------------------------------------------
// Los ficheros LIQ son texto plano de ancho fijo.
// Tipo 0 (cabecera): pos 0-1 tipo, pos 2-5 entidad compañía, pos 6-11 mediador, pos 12-17 periodo AAAAMM
// Tipo 1 (detalle):  pos 0-1 tipo, importes en posiciones variables
// Tipo 9 (pie):      pos 0-1 tipo, importe total bruto y neto

const CODIGO_COMPANIA: Record<string, string> = {
  '0131': 'Mapfre',
  '0507': 'Allianz',
  '0245': 'Reale',
  '0311': 'Generali',
  '0588': 'Occident',
  '0038': 'AXA',
  '0253': 'Zürich',
  '0061': 'Caser',
  '0151': 'Mutua',
  '0094': 'Helvetia',
  '0122': 'Liberty',
  '0236': 'Pelayo',
}

function parseLiq(contenido: string, nombreFichero: string): Omit<LiqFichero, 'compania' | 'periodo'> & { codigoCompania: string; periodoRaw: string } {
  const lineas = contenido.replace(/\r/g, '').split('\n').filter(Boolean)
  const cabecera = lineas.find(l => l.startsWith('0')) ?? lineas[0] ?? ''
  const pie      = lineas.find(l => l.startsWith('9')) ?? ''

  // Cabecera: TIPO(2) + ENTIDAD(4) + MEDIADOR(6) + PERIODO(6=AAAAMM) + ...
  const codigoCompania = cabecera.slice(2, 6).trim()
  const periodoRaw     = cabecera.slice(12, 18).trim()   // AAAAMM

  // Pie: TIPO(2) + ... importes totales (posición varía según versión EIAC)
  // Intentamos extraer el mayor número del pie como importe total.
  const nums = pie.match(/\d{5,}/g) ?? []
  const importeBruto = nums.length >= 1 ? parseInt(nums[0]) / 100 : 0
  const importeNeto  = nums.length >= 2 ? parseInt(nums[1]) / 100 : importeBruto

  return { nombreFichero, codigoCompania, periodoRaw, importeBruto, importeNeto, fechaFichero: null, rawCabecera: cabecera.slice(0, 80) }
}

function periodoToISO(periodoRaw: string): string {
  // AAAAMM → YYYY-MM
  if (periodoRaw.length === 6) return `${periodoRaw.slice(0, 4)}-${periodoRaw.slice(4, 6)}`
  return periodoRaw
}

// --- API pública ----------------------------------------------------------

export async function descargarLiquidaciones(): Promise<LiqFichero[]> {
  if (!WSE_PASS) throw new Error('CIMA_WSE_PASSWORD no configurada')

  const res = await fetch(WSE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'SOAPAction':   '"recibirFicherosPendientes"',
    },
    body: buildSoapEnvelope('LIQ'),
  })

  if (!res.ok) throw new Error(`CIMA WSE HTTP ${res.status}: ${await res.text()}`)

  const xml = await res.text()

  // Detectar fault SOAP
  if (xml.includes('faultstring') || xml.includes('Fault')) {
    const msg = extractTag(xml, 'faultstring') || extractTag(xml, 'message')
    throw new Error(`CIMA SOAP fault: ${msg || xml.slice(0, 200)}`)
  }

  // Los ficheros vienen en bloques <fichero> o <ficheros> con <nombre> y <contenido> (base64 o texto)
  const bloquesFichero = extractAll(xml, 'fichero')

  if (bloquesFichero.length === 0) {
    // Sin ficheros pendientes
    return []
  }

  const resultado: LiqFichero[] = []

  for (const bloque of bloquesFichero) {
    const nombreFichero = extractTag(bloque, 'nombre') || extractTag(bloque, 'nombreFichero')
    const contenidoB64  = extractTag(bloque, 'contenido') || extractTag(bloque, 'contenidoFichero')
    const fechaStr      = extractTag(bloque, 'fecha') || extractTag(bloque, 'fechaGeneracion')

    if (!nombreFichero || !contenidoB64) continue

    // Decodificar base64
    let contenido: string
    try {
      contenido = Buffer.from(contenidoB64, 'base64').toString('latin1')
    } catch {
      contenido = contenidoB64  // ya viene como texto plano
    }

    const parsed = parseLiq(contenido, nombreFichero)
    const compania = CODIGO_COMPANIA[parsed.codigoCompania] ?? `Cía ${parsed.codigoCompania}`
    const periodo  = periodoToISO(parsed.periodoRaw)

    resultado.push({
      ...parsed,
      compania,
      periodo,
      fechaFichero: fechaStr || null,
    })

    // Confirmar recepción para que CIMA no lo vuelva a servir
    await confirmarFichero(nombreFichero).catch(() => null)
  }

  return resultado
}

async function confirmarFichero(nombreFichero: string): Promise<void> {
  await fetch(WSE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'SOAPAction':   '"confirmarFicherosRecibidos"',
    },
    body: buildConfirmarEnvelope(nombreFichero),
  })
}
