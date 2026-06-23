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
