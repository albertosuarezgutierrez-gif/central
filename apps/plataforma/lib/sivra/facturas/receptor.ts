// lib/sivra/facturas/receptor.ts — datos fiscales del HUÉSPED (destinatario de la factura). PURO.
//
// Lo usan el formulario público (/factura/[token]), el alta manual de Alberto y el servidor (que NUNCA se fía del
// navegador: vuelve a validar todo antes de guardar).
//
// Dirección:
//   · España: CP primero → provincia → municipio → calle (callejero del Catastro) → número. Todo obligatorio.
//   · Fuera de España: dirección LIBRE (líneas + ciudad + CP opcional). Es inevitable: no hay callejero común para
//     el resto del mundo. Se valida solo forma y longitud.
// Identificador fiscal:
//   · España: NIF/NIE/CIF con dígito de control (`validarNifCif` de core-fiscal). Vacío NO vale (allí vacío = ok).
//   · Fuera: VAT/identificador fiscal del país, forma alfanumérica 4-25. No hay validador universal: se documenta.

import { validarNifCif } from '@central/core-fiscal/validacion'

// Vocabulario CERRADO de países (ISO 3166-1 alfa-2 → nombre en español). Un país fuera de la lista no se acepta.
export const PAISES: ReadonlyArray<readonly [string, string]> = [
  ['ES', 'España'], ['DE', 'Alemania'], ['AR', 'Argentina'], ['AU', 'Australia'], ['AT', 'Austria'], ['BE', 'Bélgica'],
  ['BR', 'Brasil'], ['BG', 'Bulgaria'], ['CA', 'Canadá'], ['CL', 'Chile'], ['CN', 'China'], ['CO', 'Colombia'],
  ['KR', 'Corea del Sur'], ['HR', 'Croacia'], ['DK', 'Dinamarca'], ['US', 'Estados Unidos'], ['EE', 'Estonia'],
  ['FI', 'Finlandia'], ['FR', 'Francia'], ['GR', 'Grecia'], ['HU', 'Hungría'], ['IN', 'India'], ['IE', 'Irlanda'],
  ['IS', 'Islandia'], ['IL', 'Israel'], ['IT', 'Italia'], ['JP', 'Japón'], ['LV', 'Letonia'], ['LT', 'Lituania'],
  ['LU', 'Luxemburgo'], ['MT', 'Malta'], ['MA', 'Marruecos'], ['MX', 'México'], ['NO', 'Noruega'], ['NZ', 'Nueva Zelanda'],
  ['NL', 'Países Bajos'], ['PE', 'Perú'], ['PL', 'Polonia'], ['PT', 'Portugal'], ['GB', 'Reino Unido'],
  ['CZ', 'República Checa'], ['RO', 'Rumanía'], ['SK', 'Eslovaquia'], ['SI', 'Eslovenia'], ['SE', 'Suecia'],
  ['CH', 'Suiza'], ['TR', 'Turquía'], ['UA', 'Ucrania'], ['UY', 'Uruguay'], ['VE', 'Venezuela'], ['CY', 'Chipre'],
]
const NOMBRE_PAIS = new Map(PAISES.map(([c, n]) => [c, n]))
export function nombrePais(codigo: string): string | null { return NOMBRE_PAIS.get(codigo) ?? null }

export type DireccionEs = { pais: 'ES'; cp: string; provincia: string; municipio: string; via: string; numero: string; resto: string | null; viaCatastro: boolean }
export type DireccionExt = { pais: string; lineas: string; ciudad: string; cp: string | null }
export type Receptor = {
  tipo: 'empresa' | 'particular'
  nombre: string
  nif: string
  pais: string
  email: string
  direccion: DireccionEs | DireccionExt
}

export type ResultadoReceptor = { ok: true; receptor: Receptor } | { ok: false; errores: Record<string, string> }

/** Texto de una caja: sin caracteres de control, espacios colapsados, recortado. `''` si no es texto. */
function limpio(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

// El PDF usa Helvetica estándar (WinAnsi = Windows-1252). Lo que no está ahí saldría «?» en una factura INMUTABLE, así
// que se rechaza al validar (no se incrustan fuentes): Latin-1 imprimible + los 27 extra de Windows-1252 (€, Š, Œ, …).
const EXTRA_WIN1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ\u2018\u2019\u201c\u201d•–—˜™š›œžŸ'
export function enWinAnsi(t: string): boolean {
  for (const c of t.normalize('NFC')) {
    const n = c.codePointAt(0)!
    if ((n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || EXTRA_WIN1252.includes(c)) continue
    return false
  }
  return true
}
export const ERROR_ALFABETO = 'Escríbelo con el alfabeto latino, sin caracteres como ł, ő, α, я, 中 / Please write it in Latin characters'

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/
const ID_EXT = /^[A-Z0-9][A-Z0-9 .\-/]{3,24}$/

export function validarReceptor(entrada: unknown): ResultadoReceptor {
  const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>
  const d = (e.direccion && typeof e.direccion === 'object' ? e.direccion : {}) as Record<string, unknown>
  const errores: Record<string, string> = {}

  const tipo = e.tipo === 'empresa' || e.tipo === 'particular' ? e.tipo : null
  if (!tipo) errores.tipo = 'Indica si la factura va a nombre de una empresa o de un particular'
  const nombre = limpio(e.nombre, 150)
  if (nombre.length < 3) errores.nombre = tipo === 'empresa' ? 'Escribe la razón social' : 'Escribe el nombre completo'
  const pais = limpio(e.pais, 2).toUpperCase()
  if (!NOMBRE_PAIS.has(pais)) errores.pais = 'Elige el país de la lista'
  const email = limpio(e.email, 200).toLowerCase()
  if (!EMAIL.test(email)) errores.email = 'El correo no es válido'

  const nifBruto = limpio(e.nif, 30).toUpperCase().replace(/[\s-]/g, '')
  let nif = ''
  if (pais === 'ES') {
    const v = validarNifCif(nifBruto)
    if (!nifBruto) errores.nif = 'Escribe el NIF/NIE/CIF'
    else if (!v.ok) errores.nif = v.motivo || 'NIF/CIF no válido'
    else nif = nifBruto
  } else {
    const idExt = limpio(e.nif, 30).toUpperCase()
    if (!ID_EXT.test(idExt)) errores.nif = 'Escribe el número de identificación fiscal (VAT/Tax ID)'
    else nif = idExt
  }

  let direccion: DireccionEs | DireccionExt | null = null
  if (pais === 'ES') {
    const cp = limpio(d.cp, 5)
    const provincia = limpio(d.provincia, 60)
    const municipio = limpio(d.municipio, 80)
    const via = limpio(d.via, 120)
    const numero = limpio(d.numero, 12)
    const resto = limpio(d.resto, 60) || null
    if (!/^\d{5}$/.test(cp) || Number(cp.slice(0, 2)) < 1 || Number(cp.slice(0, 2)) > 52) errores['direccion.cp'] = 'Código postal de 5 cifras'
    if (provincia.length < 2) errores['direccion.provincia'] = 'Falta la provincia (sale del código postal)'
    if (municipio.length < 2) errores['direccion.municipio'] = 'Elige el municipio'
    if (via.length < 3) errores['direccion.via'] = 'Escribe la calle'
    if (!/^[0-9]{1,5}[A-Z]?$|^S\/?N$/i.test(numero)) errores['direccion.numero'] = 'Número de la calle (o S/N)'
    direccion = { pais: 'ES', cp, provincia, municipio, via, numero: numero.toUpperCase(), resto, viaCatastro: d.viaCatastro === true }
  } else if (NOMBRE_PAIS.has(pais)) {
    const lineas = limpio(d.lineas, 200)
    const ciudad = limpio(d.ciudad, 80)
    const cp = limpio(d.cp, 12) || null
    if (lineas.length < 5) errores['direccion.lineas'] = 'Escribe la dirección (calle y número)'
    if (ciudad.length < 2) errores['direccion.ciudad'] = 'Escribe la ciudad'
    direccion = { pais, lineas, ciudad, cp }
  }

  // Lo que va impreso en la factura: fuera de WinAnsi se rechaza (si no, saldría «???»).
  const impresos: Array<[string, string]> = [['nombre', nombre], ['nif', nif]]
  if (direccion && 'via' in direccion) impresos.push(['direccion.provincia', direccion.provincia], ['direccion.municipio', direccion.municipio], ['direccion.via', direccion.via], ['direccion.resto', direccion.resto ?? ''])
  else if (direccion) impresos.push(['direccion.lineas', direccion.lineas], ['direccion.ciudad', direccion.ciudad], ['direccion.cp', direccion.cp ?? ''])
  for (const [k, v] of impresos) if (!enWinAnsi(v)) errores[k] = ERROR_ALFABETO

  if (Object.keys(errores).length || !tipo || !direccion) return { ok: false, errores }
  return { ok: true, receptor: { tipo, nombre, nif, pais, email, direccion } }
}

/** Líneas de la dirección del receptor para el PDF y Telegram. */
export function lineasDireccion(r: Receptor): string[] {
  const d = r.direccion
  if (d.pais === 'ES' && 'via' in d) {
    return [`${d.via} ${d.numero}${d.resto ? `, ${d.resto}` : ''}`, `${d.cp} ${d.municipio} (${d.provincia})`, 'España']
  }
  const x = d as DireccionExt
  return [x.lineas, `${x.cp ? `${x.cp} ` : ''}${x.ciudad}`, nombrePais(x.pais) ?? x.pais]
}
