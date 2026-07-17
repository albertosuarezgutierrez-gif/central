// Lógica PURA de la correduría de seguros (sin red ni BD → testeable con `node --test`).
// La consumen tanto la matriz (`app/api/correduria/route.ts`) como el detalle clicable
// (`app/api/correduria/detalle/route.ts`), para que ambos agrupen EXACTAMENTE igual.

// Extensión .ts explícita (habilitada por `allowImportingTsExtensions` en la tsconfig base) para
// que `node --test` resuelva la cadena de imports al testear este módulo; webpack hace match exacto.
import { RE_SEGUROS, RE_COMISIONES } from './destino.ts'

// Etiqueta visible de la categoría cajón-de-sastre. El valor interno sigue siendo 'Otras'
// (no se toca el agrupador), solo la etiqueta que ve el usuario.
export const COMPANIA_OTRAS = 'Otras'
export const COMPANIA_OTRAS_LABEL = 'Sin identificar (revisar)'

// Compañías que el selector ofrece al confirmar "es de seguros" (mismas que detecta
// detectarCompania). El usuario puede además teclear "Otra…" o dejarlo sin asignar.
export const COMPANIAS_CONOCIDAS = [
  'Generali', 'Allianz', 'Mapfre', 'Caser', 'AXA', 'Occident', 'Zürich', 'Reale',
  'Mutua', 'Línea Directa', 'Helvetia', 'Pelayo', 'Liberty', 'Plus Ultra', 'Salud', 'Asisa', 'Aegon',
] as const

export function companiaLabel(compania: string): string {
  return compania === COMPANIA_OTRAS ? COMPANIA_OTRAS_LABEL : compania
}

// Detecta la compañía aseguradora a partir del concepto/contraparte del movimiento.
// Lo que no casa con ninguna conocida cae en 'Otras' (cajón por descarte).
export function detectarCompania(concepto: string, conceptoNorm: string, contraparte: string): string {
  const txt = `${concepto} ${conceptoNorm} ${contraparte}`.toUpperCase()
  if (txt.includes('GENERALI')) return 'Generali'
  if (txt.includes('ALLIANZ')) return 'Allianz'
  if (txt.includes('MAPFRE') || /LIQ\.COMISIONES|LIQ\. COMISIONES/.test(txt)) return 'Mapfre'
  if (txt.includes('CASER') || txt.includes('FRA-COMIS')) return 'Caser'
  if (/\bAXA\b/.test(txt) || /LIQ\.?\s*SALDO CUENTA/.test(txt)) return 'AXA'
  if (txt.includes('ZURICH')) return 'Zürich'
  if (txt.includes('REALE') || /LIQUIDACION DE COMISIONES/.test(txt)) return 'Reale'
  if (txt.includes('MUTUA')) return 'Mutua'
  if (txt.includes('LINEA DIRECTA') || txt.includes('LÍNEA DIRECTA')) return 'Línea Directa'
  if (txt.includes('OCCIDENT') || txt.includes('CATALANA') || txt.includes('M00171') || txt.includes('8/92361')) return 'Occident'
  if (txt.includes('HELVETIA')) return 'Helvetia'
  if (txt.includes('PELAYO') || /^COMISIONES /.test(txt)) return 'Pelayo'
  if (txt.includes('LIBERTY')) return 'Liberty'
  if (txt.includes('PLUS ULTRA')) return 'Plus Ultra'
  if (txt.includes('SANITAS') || txt.includes('ADESLAS') || txt.includes('DKV') || txt.includes('ASISA')) return 'Salud'
  if (txt.includes('REMSALDO')) return 'Aegon'
  if (/PAGO SALDO CTA/.test(txt)) return 'Generali'
  return COMPANIA_OTRAS
}

// "Clave de referencia" del concepto: el código que identifica a la compañía pagadora en los
// abonos de la correduría (p.ej. "M1454", "M00171", "8/92361"). Se usa para APRENDER reglas
// (clave → compañía): cuando el dueño asigna a mano una compañía, se guarda la regla con esta
// clave y se aplica a todos los movimientos con el mismo código.
// Sólo devuelve una clave "válida" (≥4 chars y con letra+dígito, o que contenga '/') para evitar
// crear reglas a partir de números tipo fecha ("202604") o importes.
export function claveReferencia(concepto: string | null): string | null {
  if (!concepto) return null
  let s = concepto.toUpperCase()
  if (s.includes('//')) s = s.split('//').pop() ?? s
  s = s
    .replace(/\b(SALDO|SALDOS|TRANSFERENCIA|TRANSFERENCIAS|RECIBIDA|REALIZADA|REEMBOLSO|PAGO|ABONO|DE|DEL|POR|EN|A|SU|FAVOR|RECIBIDO)\b/g, ' ')
    .replace(/[.,:;()]/g, ' ')
  for (const tok of s.split(/\s+/)) {
    if (tok.length < 4) continue
    const tieneLetra = /[A-Z]/.test(tok)
    const tieneDigito = /\d/.test(tok)
    const tieneBarra = tok.includes('/')
    if ((tieneLetra && tieneDigito) || tieneBarra) return tok
  }
  return null
}

// Palabras de relleno que NO identifican a un comercio (verbos del banco, formas jurídicas, dominios,
// y los apellidos del titular para no colisionar con sus traspasos "SUAREZ GUTIERREZ").
const FILLER_COMERCIO = new Set([
  'COMPRA', 'PAGO', 'RECIBO', 'ADEUDO', 'CARGO', 'DIRECTO', 'SEPA', 'TARJETA', 'TARJ', 'ONLINE',
  'COM', 'WWW', 'HTTP', 'HTTPS', 'PAYPAL', 'SUAREZ', 'GUTIERREZ', 'ALBERTO',
])

// "Clave de comercio": token que identifica al COMERCIO en compras de tarjeta / recibos
// ("COMPRA EN PETROPRIX GINES" → "PETROPRIX", "COMPRA EN PAYPAL *IONOS CLOUD" → "IONOS",
// "COMPRA EN NETFLIX.COM" → "NETFLIX", "RECIBO GUTIERREZ ALCALA" → "ALCALA"). Se usa para APRENDER
// reglas por comercio (clave → destino) cuando el concepto NO trae código de referencia. Devuelve
// null si no hay un comercio claro. La regla luego se aplica por substring (concepto ILIKE %clave%).
export function claveComercio(concepto: string | null): string | null {
  if (!concepto) return null
  let s = concepto.toUpperCase()
  if (s.includes('//')) {
    const segs = s.split('//').map(x => x.trim()).filter(Boolean)
    // Formato del banco: "<descr genérica> // <tipo de operación> // <detalle>". En las COMPRAS DE
    // TARJETA el comercio REAL es el ÚLTIMO segmento (la contraparte que añade el banco); el PRIMERO
    // es una descripción genérica del TIPO de comercio ("COMPRA EN COMERCIO EXTRANJERO…", "PAGO CON
    // TARJETA EN GRANDES SUPERFICIES…") que como clave crearía una regla-trampa (casa por substring
    // TODA compra del extranjero / gran superficie). Fuera de tarjeta se mantiene el comportamiento
    // previo (el segmento con el verbo de la operación).
    s = /PAGO CON TARJETA/.test(s)
      ? (segs[segs.length - 1] || s)
      : (segs.find(x => /COMPRA|PAGO|RECIBO|ADEUDO/.test(x)) ?? segs[0])
  }
  if (s.includes('*')) s = s.split('*').pop() ?? s          // PAYPAL *IONOS, SUMUP *BAR… → tras el '*'
  s = s.replace(/\.(COM|ES|NET|ORG)\b/g, ' ').replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, ' ')
  for (const tok of s.split(/\s+/)) {
    if (tok.length < 4) continue
    if (/^\d+$/.test(tok)) continue
    if (!/[A-ZÁÉÍÓÚÑ]/.test(tok)) continue
    if (FILLER_COMERCIO.has(tok)) continue
    if (CLAVE_GENERICA.has(tok)) continue   // descriptores genéricos del banco (COMERCIO, GRANDES…)
    return tok
  }
  return null
}

// Términos GENÉRICOS que NUNCA deben ser clave de una regla clave→destino: aparecen en el concepto de
// casi cualquier movimiento del banco, así que como substring "secuestran" a los demás. Raíz del
// incidente de la correduría (jul-2026): una regla `"TRANSF" → turistico_pisos` se tragaba TODA
// transferencia recibida de BBVA (incluidas las comisiones de seguros) porque se aplica por substring.
const CLAVE_GENERICA = new Set([
  'TRANSF', 'TRANSFER', 'TRANSFERENCIA', 'TRANSFERENCIAS', 'TRASPASO', 'TRASPASOS',
  'ABONO', 'ABONOS', 'PAGO', 'PAGOS', 'RECIBO', 'RECIBOS', 'RECEIPT', 'ADEUDO', 'ADEUDOS',
  'CARGO', 'CARGOS', 'SALDO', 'SALDOS', 'INGRESO', 'INGRESOS', 'COMPRA', 'COMPRAS',
  'MOVIMIENTO', 'MOVIMIENTOS', 'DOMICILIACION', 'SEPA', 'TARJETA', 'TARJ', 'TOTAL',
  'VARIOS', 'OTROS', 'OTRO', 'GASTO', 'GASTOS', 'MODA', 'RESTAURANTE', 'RESTAURANTES',
  'RECIBIDA', 'RECIBIDO', 'REALIZADA', 'REALIZADO', 'FAVOR', 'EUROS', 'BIZUM',
  // Descriptores del banco que encabezan el concepto de las compras (NO son el comercio): sin esto,
  // "COMPRA EN COMERCIO EXTRANJERO…" o "…EN GRANDES SUPERFICIES…" crearían reglas-trampa por substring.
  'COMERCIO', 'EXTRANJERO', 'GRANDES', 'SUPERFICIES', 'SUPERFICIE',
])

// ¿Es SEGURA esta clave para aprender una regla clave→destino (que se aplica por substring)? Rechaza
// las trampa: demasiado cortas, sin ninguna letra útil, números cortos, o compuestas SOLO de términos
// genéricos/relleno del banco. Un comercio/código específico (PETROPRIX, IONOS, M00171, TOTALENERGIES)
// SÍ pasa; "TRANSF", "TOTAL", "MODA", "TRANSFERENCIA RECIBIDA" NO. Se usa como guardia en TODOS los
// puntos que insertan en `banca_destino_reglas` y como filtro al aplicarlas (lib/categorizar.ts).
export function claveReglaValida(clave: string | null | undefined): boolean {
  if (!clave) return false
  const norm = clave.toUpperCase().trim()
  if (norm.length < 4) return false
  const tieneLetra = /[A-ZÁÉÍÓÚÑ]/.test(norm)
  // Solo dígitos/símbolos: admisible únicamente si es un código largo (≥6 dígitos), específico de verdad.
  if (!tieneLetra) return norm.replace(/\D/g, '').length >= 6
  // Debe quedar al menos un token que NO sea genérico ni relleno (si no, es un cajón de sastre).
  const toks = norm.split(/[^A-ZÁÉÍÓÚÑ0-9/]+/).filter(Boolean)
  return toks.some(t => !CLAVE_GENERICA.has(t) && !FILLER_COMERCIO.has(t))
}

export type MotivoSeguros = 'nombre' | 'descarte'

// Explica POR QUÉ un ABONO en BBVA quedó como 'seguros': porque el concepto trae el nombre de
// una aseguradora / liquidación de comisiones ('nombre' → alta confianza), o porque cayó por el
// fallback de descarte de BBVA ('descarte' → sospechoso, hay que confirmar a mano).
// Devuelve 'nombre' por defecto fuera de BBVA (en Kutxa solo entra a seguros si casó por nombre).
export function motivoSeguros(banco: string | null, concepto: string | null, contraparte: string | null): MotivoSeguros {
  const txt = `${concepto ?? ''} ${contraparte ?? ''}`
  if (RE_SEGUROS.test(txt) || RE_COMISIONES.test(txt)) return 'nombre'
  return 'descarte'
}
