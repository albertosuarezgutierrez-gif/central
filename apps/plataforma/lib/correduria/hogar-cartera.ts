// Punto de partida de una oportunidad de HOGAR desde la CARTERA (20/10/2026). PURO: sin red ni envs ('use client' y `node --test`).
//
// Si el cliente ya tiene una póliza de hogar EN VIGOR (`esCarteraEnVigor`, nunca `clientes.tipo`), se PROPONE su compañía, su
// vencimiento y los capitales que conste (si la ficha de CIMA los trae) como punto de partida. Solo se propone: nada se escribe
// sin que una persona pulse. Tres estados + «varias»: `pendiente` (no se han podido leer las pólizas) ≠ `sin_poliza` (se miró y no
// hay); con varias de hogar en vigor NO se adivina cuál es la de esta vivienda: se listan.
import { esCarteraEnVigor, numeroDesdeTexto } from '@central/module-seguros'

export type PolizaParaHogarCartera = {
  tipo: string
  aseguradora: string | null | undefined
  numeroPoliza: string | null | undefined
  estado: string | null | undefined
  fechaVencimiento: string | null | undefined
  viva: boolean
  confirmadaCima: boolean
  sustituida: boolean
  objeto?: { direccion?: string | null; ficha?: Array<{ etiqueta: string; valor: string }> | null } | null
}

export type PolizaHogarVigor = { aseguradora: string | null; numeroPoliza: string | null; fechaVencimiento: string | null; direccion: string | null }

export type PropuestaCarteraHogar =
  | { estado: 'pendiente' }
  | { estado: 'sin_poliza' }
  | { estado: 'varias'; polizas: PolizaHogarVigor[] }
  | (PolizaHogarVigor & { estado: 'dato'; capitalContinente: number | null; capitalContenido: number | null })

const limpio = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Importe de la ficha de CIMA cuya etiqueta contiene `palabra` (continente/contenido). Sin él, o ilegible, o ≤ 0 → `null` (no se sabe). */
function importeDeFicha(ficha: Array<{ etiqueta: string; valor: string }> | null | undefined, palabra: RegExp): number | null {
  const f = (ficha ?? []).find((x) => palabra.test(x.etiqueta))
  if (!f) return null
  const n = numeroDesdeTexto(f.valor)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** `polizas: null` = no se han podido leer → `pendiente`. Solo cuentan las de tipo hogar, confirmadas por CIMA y EN VIGOR. PURA. */
export function propuestaCarteraHogar(polizas: readonly PolizaParaHogarCartera[] | null): PropuestaCarteraHogar {
  if (polizas === null) return { estado: 'pendiente' }
  const vigor = polizas.filter((p) =>
    p.tipo === 'hogar' && p.confirmadaCima
    && esCarteraEnVigor({ importRef: p.viva ? null : 'volcado', eiacXmlHash: null, estado: p.estado, sustituidaAt: p.sustituida ? 'sustituida' : null }))
  if (vigor.length === 0) return { estado: 'sin_poliza' }
  const base = (p: PolizaParaHogarCartera): PolizaHogarVigor => ({
    aseguradora: limpio(p.aseguradora), numeroPoliza: limpio(p.numeroPoliza), fechaVencimiento: limpio(p.fechaVencimiento), direccion: limpio(p.objeto?.direccion),
  })
  if (vigor.length > 1) return { estado: 'varias', polizas: vigor.map(base) }
  const p = vigor[0]
  return {
    estado: 'dato', ...base(p),
    capitalContinente: importeDeFicha(p.objeto?.ficha, /continente/i),
    capitalContenido: importeDeFicha(p.objeto?.ficha, /contenido/i),
  }
}
