// Documentos de aseguradora sobre pólizas de CLIENTES de la correduría (recibos, liquidaciones de
// prima, avisos de cobro). NO son un gasto de Alberto: la compañía le liquida la comisión en NETO,
// y esa comisión ya entra como ingreso de la correduría por el banco. Caso fundacional (03/11/2026):
// un documento de 659,43 € «Póliza 061145138», categoría SEGURO y sin proveedor, entró como gasto.
//
// Los seguros PROPIOS (Occident de los pisos, ASISA de salud, cualquier póliza cuyo tomador sea
// Alberto o Pilar) SÍ son gasto.
//
// Tres estados (regla del monorepo): true = de cliente · false = no aplica / propio · 'duda' =
// parece de seguros pero no se sabe a nombre de quién. Con 'duda' NO se descarta: queda pendiente.
//
// Módulo PURO para poder testearlo con `node --test`.
import { normalizaNifReceptor, normalizaNombreReceptor, type Titular } from './receptor.ts'

export interface ExtraccionPoliza {
  proveedor?: string | null
  concepto?: string | null
  categoria?: string | null
  numero_factura?: string | null
  nif_proveedor?: string | null
  /** Tomador / cliente que consta en el documento. */
  cliente?: string | null
  nif_cliente?: string | null
}

export const MOTIVO_POLIZA_CLIENTE = 'Póliza de cliente de la correduría: no es gasto'
export const MOTIVO_POLIZA_DUDA = 'Posible póliza de cliente (correduría): confirma si es gasto propio'

/** Titulares fijos: Alberto (NIF) y Pilar (por nombre; su NIF llega vía `titulares`). */
const NIF_ALBERTO = '28823484E'

const RE_ASEGURADORA =
  /\b(allianz|mapfre|occident|asisa|axa|generali|mutua\s+madrile[nñ]a|sanitas|adeslas|segurcaixa|zurich|catalana\s+occidente|reale|plus\s*ultra|ergo|liberty|hdi|helvetia|santalucia|santa\s+luc[ií]a|aegon|nn\s+seguros|dkv|fiatc|pelayo|l[ií]nea\s+directa|aseguradora|compa[ñn][ií]a\s+de\s+seguros|seguros)\b/i
/** Vocabulario de la relación de MEDIACIÓN: Alberto figura como corredor/comisionista, no como tomador. */
const RE_MEDIACION =
  /\bliquidaci[oó]n(?:es)?\b|\bcomisi[oó]n(?:es)?\b|\bmediador\b|\bcorredor(?:[ií]a)?\b|\bagente\b|\bextracto\b|\bresumen\s+(?:de\s+)?operaciones\b|\bresumen\b|\bc[oó]d(?:igo|\.)?\s+(?:de\s+)?mediador\b/i
/** Lista blanca de seguros PROPIOS (Occident de los pisos, ASISA de salud). Ampliable con `polizasPropias`. */
const RE_PROPIA_BLANCA = /\b(occident|asisa)\b/i
const RE_DOC_POLIZA =
  /\bp[oó]liza\b|\brecibo\s+(?:de\s+)?(?:prima|seguro)|\bliquidaci[oó]n\s+(?:de\s+)?prima|\baviso\s+de\s+cobro\b|\bprima\s+(?:neta|total|pendiente)/i

function nombreEsPropio(nombre: string, titulares: Titular[]): boolean {
  const toks = new Set(nombre.split(' '))
  if (toks.has('alberto') && toks.has('suarez')) return true
  if (toks.has('pilar') && toks.has('pina')) return true
  return titulares.map((t) => normalizaNombreReceptor(t.nombre)).filter(Boolean).some((t) => t === nombre)
}

const NOMBRE_VACIO = /^(varios|cliente|cliente varios|particular|contado|s n|sn|na|n a|-+)$/

/**
 * @param polizasPropias números de póliza de `gastos_fijos` activos (ampliación de la lista blanca).
 * El nombre/NIF de Alberto NO convierte una póliza en propia: en las liquidaciones de las
 * aseguradoras figura como comisionista (caso «Allianz Moto» 251,47 € y 113,33 €, 03/11/2026).
 */
export function esDocumentoPolizaCliente(e: ExtraccionPoliza, titulares: Titular[] = [], polizasPropias: string[] = []): boolean | 'duda' {
  const categoriaSeguro = /^seguro$/i.test((e.categoria ?? '').trim())
  const textoDoc = `${e.concepto ?? ''} ${e.numero_factura ?? ''}`
  const senal = RE_ASEGURADORA.test(e.proveedor ?? '') || RE_DOC_POLIZA.test(textoDoc) || RE_ASEGURADORA.test(e.concepto ?? '')
  if (!senal && !categoriaSeguro) return false
  if (!senal && categoriaSeguro) return 'duda'

  // 1) Liquidación/comisión/mediador…: no es gasto aunque lleve el nombre de Alberto.
  if (RE_MEDIACION.test(`${e.proveedor ?? ''} ${textoDoc}`)) return true

  const nif = normalizaNifReceptor(e.nif_cliente)
  const nifsPropios = [NIF_ALBERTO, ...titulares.map((t) => normalizaNifReceptor(t.nif))].filter(Boolean)
  const nombre = normalizaNombreReceptor(e.cliente)
  let tomador: 'propio' | 'ajeno' | 'desconocido' = 'desconocido'
  if (nif && nif !== normalizaNifReceptor(e.nif_proveedor)) tomador = nifsPropios.includes(nif) ? 'propio' : 'ajeno'
  else if (nombre && !NOMBRE_VACIO.test(nombre)) tomador = nombreEsPropio(nombre, titulares) ? 'propio' : 'ajeno'

  // 2) Tomador claramente de un tercero → póliza de cliente.
  if (tomador === 'ajeno') return true

  // 3) Solo la lista blanca es gasto propio.
  const blanca = RE_PROPIA_BLANCA.test(`${e.proveedor ?? ''} ${e.concepto ?? ''}`)
    || polizasPropias.some((n) => n && textoDoc.replace(/\s/g, '').includes(n.replace(/\s/g, '')))
  if (blanca) return false

  // 4) Cualquier otro documento de aseguradora (aunque lleve el nombre de Alberto) → duda.
  return 'duda'
}
