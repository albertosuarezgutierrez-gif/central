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
const RE_DOC_POLIZA =
  /\bp[oó]liza\b|\brecibo\s+(?:de\s+)?(?:prima|seguro)|\bliquidaci[oó]n\s+(?:de\s+)?prima|\baviso\s+de\s+cobro\b|\bprima\s+(?:neta|total|pendiente)/i

function nombreEsPropio(nombre: string, titulares: Titular[]): boolean {
  const toks = new Set(nombre.split(' '))
  if (toks.has('alberto') && toks.has('suarez')) return true
  if (toks.has('pilar') && toks.has('pina')) return true
  return titulares.map((t) => normalizaNombreReceptor(t.nombre)).filter(Boolean).some((t) => t === nombre)
}

const NOMBRE_VACIO = /^(varios|cliente|cliente varios|particular|contado|s n|sn|na|n a|-+)$/

export function esDocumentoPolizaCliente(e: ExtraccionPoliza, titulares: Titular[] = []): boolean | 'duda' {
  // Sin señal de seguros ni categoría SEGURO: no es asunto de este filtro.
  const categoriaSeguro = /^seguro$/i.test((e.categoria ?? '').trim())
  const senal = RE_ASEGURADORA.test(e.proveedor ?? '') || RE_DOC_POLIZA.test(`${e.concepto ?? ''} ${e.numero_factura ?? ''}`) || RE_ASEGURADORA.test(e.concepto ?? '')
  if (!senal && !categoriaSeguro) return false
  if (!senal && categoriaSeguro) return 'duda'

  const nif = normalizaNifReceptor(e.nif_cliente)
  const nifsPropios = [NIF_ALBERTO, ...titulares.map((t) => normalizaNifReceptor(t.nif))].filter(Boolean)
  // NIF del cliente igual al del proveedor = el extractor los confundió: dato inservible.
  if (nif && nif !== normalizaNifReceptor(e.nif_proveedor)) return nifsPropios.includes(nif) ? false : true

  const nombre = normalizaNombreReceptor(e.cliente)
  if (nombre && !NOMBRE_VACIO.test(nombre)) return nombreEsPropio(nombre, titulares) ? false : true

  return 'duda'
}
