// CASE A TRES BANDAS: pedido – albarán (lo recibido) – factura del proveedor. PURO, en CÉNTIMOS y MILÉSIMAS (enteros).
//
// Qué se comprueba (cada problema es una `Diferencia`; `bloquea` decide si impide que la factura quede «lista»):
//   · Cabecera: NIF del emisor = NIF del proveedor (desconocido en cualquiera de los dos lados → bloquea), divisa EUR, nº y fecha.
//   · Líneas: cada línea de factura empareja con UNA línea del albarán (referencia → referencia dentro de la descripción →
//     descripción igual). Línea de factura sin pareja = «línea de más»; línea del albarán sin facturar = «sin facturar».
//   · Por pareja: cantidad facturada = recibida; precio = el del PEDIDO (o el del albarán si el pedido no lo tiene) dentro de la
//     tolerancia; IVA = el esperado; importe de línea coherente con cantidad × precio.
//   · Totales: Σ líneas por tipo de IVA = bases declaradas, cuota = base × tipo, total = Σ bases + Σ cuotas − retención.
//   · Recibido ≠ pedido es un AVISO (entregas parciales son normales), no bloquea.
// Un dato que falta (null) NUNCA se da por bueno: bloquea con su propio tipo de diferencia.
import type { BorradorFacturaRecibida } from './borrador.ts'

export interface LineaPedidoBanda { id: string; clave: string | null; descripcion: string; cantidadMil: number; precioUnitCent: number | null; ivaPb: number | null }
export interface LineaAlbaranBanda extends LineaPedidoBanda { pedidoLineaId: string | null }

export interface Tolerancias {
  /** Diferencia de precio unitario admitida, en céntimos. */
  precioUnitCent: number
  /** … o en puntos básicos sobre el precio de referencia (se usa la MAYOR de las dos). */
  precioPb: number
  /** Coherencia cantidad × precio vs importe de línea de la factura. */
  importeLineaCent: number
  /** Bases, cuotas y total. */
  totalCent: number
  /** Cantidad facturada vs recibida, en milésimas. */
  cantidadMil: number
  /** true = sin precio de referencia (ni pedido ni albarán) la línea NO casa. */
  exigirPrecioReferencia: boolean
  /** false = una retención en la factura bloquea (el puerto contable de compras no la representa). */
  admiteRetencion: boolean
}
export const TOLERANCIAS_POR_DEFECTO: Tolerancias = {
  precioUnitCent: 1, precioPb: 0, importeLineaCent: 1, totalCent: 2, cantidadMil: 0, exigirPrecioReferencia: true, admiteRetencion: false,
}
const TECHO = { precioUnitCent: 10_000, precioPb: 2_000, importeLineaCent: 10_000, totalCent: 10_000, cantidadMil: 1_000_000 }

/** Normaliza las tolerancias que vengan de la config del cliente: enteros ≥ 0 con techo (un valor absurdo no lo deja pasar todo). */
export function tolerancias(o: Partial<Tolerancias> | null | undefined): Tolerancias {
  const t = { ...TOLERANCIAS_POR_DEFECTO, ...(o ?? {}) }
  const ent = (v: unknown, def: number, techo: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(techo, Math.trunc(v)) : def)
  return {
    precioUnitCent: ent(t.precioUnitCent, 1, TECHO.precioUnitCent), precioPb: ent(t.precioPb, 0, TECHO.precioPb),
    importeLineaCent: ent(t.importeLineaCent, 1, TECHO.importeLineaCent), totalCent: ent(t.totalCent, 2, TECHO.totalCent),
    cantidadMil: ent(t.cantidadMil, 0, TECHO.cantidadMil),
    exigirPrecioReferencia: t.exigirPrecioReferencia !== false, admiteRetencion: t.admiteRetencion === true,
  }
}

export type TipoDiferencia =
  | 'nif' | 'nif_desconocido' | 'nif_no_leido' | 'divisa' | 'falta_numero' | 'falta_fecha'
  | 'linea_de_mas' | 'linea_sin_facturar'
  | 'cantidad' | 'cantidad_desconocida' | 'precio' | 'precio_desconocido' | 'precio_sin_referencia'
  | 'iva' | 'iva_desconocido' | 'iva_sin_referencia' | 'importe_linea'
  | 'suma_bases' | 'cuota_iva' | 'total' | 'total_desconocido' | 'retencion'
  | 'recibido_distinto_de_pedido'
export interface Diferencia {
  tipo: TipoDiferencia
  bloquea: boolean
  /** Índice de la línea de la factura y/o id de la línea del albarán afectadas. */
  facturaLinea?: number
  albaranLineaId?: string
  ivaPb?: number
  esperado?: number | string | null
  encontrado?: number | string | null
  texto: string
}
export interface Pareja {
  facturaLinea: number
  albaranLineaId: string
  pedidoLineaId: string | null
  cantidadMil: number | null
  /** Precio de la FACTURA (o derivado de importe/cantidad). */
  precioUnitCent: number | null
  ivaPb: number | null
}
export interface ResultadoCase {
  cuadra: boolean
  diferencias: Diferencia[]
  parejas: Pareja[]
  totales: { porIva: { ivaPb: number; baseCent: number; cuotaCent: number }[]; retencionCent: number; totalCent: number }
}

/** Dinero en formato español: 2.162,49€ (puntos de miles también con 4 cifras). */
export const eur = (c: number | null | undefined): string => {
  if (c == null) return '—'
  const a = Math.abs(Math.round(c))
  return `${c < 0 ? '-' : ''}${String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(a % 100).padStart(2, '0')}€`
}
const pct = (pb: number | null | undefined) => (pb == null ? '—' : `${(pb / 100).toString().replace('.', ',')} %`)
const cant = (m: number | null | undefined) => (m == null ? '—' : (m / 1000).toString().replace('.', ','))

export const normalizarClave = (s: string | null | undefined): string | null => {
  const r = (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return r.length >= 3 ? r : null
}
export const normalizarTexto = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Importe de línea en céntimos: cantidad (milésimas) × precio (céntimos por unidad) / 1000, redondeo comercial. */
export const importeLinea = (cantidadMil: number, precioUnitCent: number): number => Math.round((cantidadMil * precioUnitCent) / 1000)
/** Cuota de IVA de una base, en céntimos (redondeo comercial). */
export const cuotaIva = (baseCent: number, ivaPb: number): number => Math.round((baseCent * ivaPb) / 10_000)

function emparejar(factura: BorradorFacturaRecibida, albaran: readonly LineaAlbaranBanda[]): Map<number, LineaAlbaranBanda> {
  const libres = new Set(albaran.map((a) => a.id))
  const r = new Map<number, LineaAlbaranBanda>()
  const pasada = (cmp: (f: BorradorFacturaRecibida['lineas'][number], a: LineaAlbaranBanda) => boolean) => {
    factura.lineas.forEach((f, i) => {
      if (r.has(i)) return
      const a = albaran.find((x) => libres.has(x.id) && cmp(f, x))
      if (a) { r.set(i, a); libres.delete(a.id) }
    })
  }
  // 1) referencia = referencia
  pasada((f, a) => { const x = normalizarClave(f.clave), y = normalizarClave(a.clave); return x != null && x === y })
  // 2) referencia del albarán dentro de la descripción (o de la referencia) de la factura, como palabra completa
  pasada((f, a) => {
    const y = normalizarClave(a.clave)
    if (!y) return false
    const palabras = `${f.clave ?? ''} ${f.descripcion}`.toUpperCase().split(/[^A-Z0-9]+/)
    return palabras.includes(y)
  })
  // 3) descripción igual (normalizada)
  pasada((f, a) => { const x = normalizarTexto(f.descripcion); return x.length > 0 && x === normalizarTexto(a.descripcion) })
  return r
}

export function casarTresBandas(e: {
  nifProveedor: string | null
  pedido: readonly LineaPedidoBanda[]
  albaran: readonly LineaAlbaranBanda[]
  factura: BorradorFacturaRecibida
  tolerancias?: Partial<Tolerancias>
}): ResultadoCase {
  const tol = tolerancias(e.tolerancias)
  const f = e.factura
  const dif: Diferencia[] = []
  const d = (x: Diferencia) => dif.push(x)

  // ── Cabecera ──
  const nifProv = (e.nifProveedor ?? '').toUpperCase().replace(/[\s.\-/]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '') || null
  if (!nifProv) d({ tipo: 'nif_desconocido', bloquea: true, encontrado: f.nifEmisor, texto: 'El proveedor no tiene NIF registrado: no se puede comprobar quién emite la factura' })
  else if (!f.nifEmisor) d({ tipo: 'nif_no_leido', bloquea: true, esperado: nifProv, texto: 'No se ha podido leer el NIF del emisor de la factura' })
  else if (f.nifEmisor !== nifProv) d({ tipo: 'nif', bloquea: true, esperado: nifProv, encontrado: f.nifEmisor, texto: `El NIF de la factura (${f.nifEmisor}) no es el del proveedor (${nifProv})` })
  if (f.divisa != null && f.divisa !== 'EUR') d({ tipo: 'divisa', bloquea: true, encontrado: f.divisa, texto: `Factura en ${f.divisa}, no en euros` })
  if (!f.numero) d({ tipo: 'falta_numero', bloquea: true, texto: 'Falta el número de factura' })
  if (!f.fecha) d({ tipo: 'falta_fecha', bloquea: true, texto: 'Falta la fecha de la factura' })

  // ── Líneas ──
  const pedidoPorId = new Map(e.pedido.map((p) => [p.id, p]))
  const parejasMap = emparejar(f, e.albaran)
  const parejas: Pareja[] = []
  const usadas = new Set<string>()
  f.lineas.forEach((fl, i) => {
    const a = parejasMap.get(i)
    if (!a) {
      d({ tipo: 'linea_de_mas', bloquea: true, facturaLinea: i, texto: `«${fl.descripcion}» está en la factura pero no en lo recibido` })
      return
    }
    usadas.add(a.id)
    const p = a.pedidoLineaId ? pedidoPorId.get(a.pedidoLineaId) ?? null : null
    const base = { facturaLinea: i, albaranLineaId: a.id }
    // Cantidad
    if (fl.cantidadMil == null) d({ ...base, tipo: 'cantidad_desconocida', bloquea: true, esperado: a.cantidadMil, texto: `«${fl.descripcion}»: no se lee la cantidad facturada` })
    else if (Math.abs(fl.cantidadMil - a.cantidadMil) > tol.cantidadMil) {
      d({ ...base, tipo: 'cantidad', bloquea: true, esperado: a.cantidadMil, encontrado: fl.cantidadMil, texto: `«${fl.descripcion}»: facturadas ${cant(fl.cantidadMil)}, recibidas ${cant(a.cantidadMil)}` })
    }
    // Precio (el de la factura; si no viene, derivado de importe/cantidad)
    const precioF = fl.precioUnitCent ?? (fl.importeCent != null && fl.cantidadMil ? Math.round((fl.importeCent * 1000) / fl.cantidadMil) : null)
    const ref = p?.precioUnitCent ?? a.precioUnitCent
    if (precioF == null) d({ ...base, tipo: 'precio_desconocido', bloquea: true, esperado: ref, texto: `«${fl.descripcion}»: no se lee el precio` })
    else if (ref == null) {
      if (tol.exigirPrecioReferencia) d({ ...base, tipo: 'precio_sin_referencia', bloquea: true, encontrado: precioF, texto: `«${fl.descripcion}»: el pedido no tenía precio; comprueba ${eur(precioF)}` })
    } else {
      const margen = Math.max(tol.precioUnitCent, Math.floor((Math.abs(ref) * tol.precioPb) / 10_000))
      if (Math.abs(precioF - ref) > margen) d({ ...base, tipo: 'precio', bloquea: true, esperado: ref, encontrado: precioF, texto: `«${fl.descripcion}»: precio ${eur(precioF)}, pedido a ${eur(ref)}` })
    }
    // IVA
    const ivaRef = a.ivaPb ?? p?.ivaPb ?? null
    if (fl.ivaPb == null) d({ ...base, tipo: 'iva_desconocido', bloquea: true, esperado: ivaRef, texto: `«${fl.descripcion}»: no se lee el IVA` })
    else if (ivaRef == null) d({ ...base, tipo: 'iva_sin_referencia', bloquea: true, encontrado: fl.ivaPb, texto: `«${fl.descripcion}»: el artículo no tiene IVA asignado; la factura dice ${pct(fl.ivaPb)}` })
    else if (fl.ivaPb !== ivaRef) d({ ...base, tipo: 'iva', bloquea: true, esperado: ivaRef, encontrado: fl.ivaPb, texto: `«${fl.descripcion}»: IVA ${pct(fl.ivaPb)}, esperado ${pct(ivaRef)}` })
    // Coherencia del importe de la línea
    if (fl.importeCent != null && fl.cantidadMil != null && fl.precioUnitCent != null) {
      const calc = importeLinea(fl.cantidadMil, fl.precioUnitCent)
      if (Math.abs(calc - fl.importeCent) > tol.importeLineaCent) {
        d({ ...base, tipo: 'importe_linea', bloquea: true, esperado: calc, encontrado: fl.importeCent, texto: `«${fl.descripcion}»: importe ${eur(fl.importeCent)} no es cantidad × precio (${eur(calc)})` })
      }
    }
    // Recibido vs pedido: aviso
    if (p && p.cantidadMil !== a.cantidadMil) {
      d({ ...base, tipo: 'recibido_distinto_de_pedido', bloquea: false, esperado: p.cantidadMil, encontrado: a.cantidadMil, texto: `«${a.descripcion}»: pedidas ${cant(p.cantidadMil)}, recibidas ${cant(a.cantidadMil)}` })
    }
    parejas.push({ ...base, pedidoLineaId: p?.id ?? null, cantidadMil: fl.cantidadMil, precioUnitCent: precioF, ivaPb: fl.ivaPb })
  })
  for (const a of e.albaran) {
    if (!usadas.has(a.id)) d({ tipo: 'linea_sin_facturar', bloquea: true, albaranLineaId: a.id, texto: `«${a.descripcion}» se recibió pero no aparece en la factura` })
  }

  // ── Totales ──
  const calc = new Map<number, number>()
  let lineasSinImporte = false
  f.lineas.forEach((fl, i) => {
    const pj = parejas.find((x) => x.facturaLinea === i)
    const imp = fl.importeCent ?? (fl.cantidadMil != null && (fl.precioUnitCent ?? pj?.precioUnitCent) != null ? importeLinea(fl.cantidadMil, (fl.precioUnitCent ?? pj!.precioUnitCent)!) : null)
    if (imp == null || fl.ivaPb == null) { lineasSinImporte = true; return }
    calc.set(fl.ivaPb, (calc.get(fl.ivaPb) ?? 0) + imp)
  })
  const declaradas = new Map(f.bases.map((b) => [b.ivaPb, b]))
  const tipos = [...new Set([...calc.keys(), ...declaradas.keys()])].sort((x, y) => x - y)
  const porIva: ResultadoCase['totales']['porIva'] = []
  for (const pb of tipos) {
    const c = calc.get(pb)
    const b = declaradas.get(pb)
    const base = b?.baseCent ?? c ?? 0
    if (f.bases.length > 0 && !lineasSinImporte && (c == null || b == null || Math.abs(c - b.baseCent) > tol.totalCent)) {
      d({ tipo: 'suma_bases', bloquea: true, ivaPb: pb, esperado: c ?? null, encontrado: b?.baseCent ?? null, texto: `Base al ${pct(pb)}: la factura dice ${eur(b?.baseCent)}, las líneas suman ${eur(c)}` })
    }
    const cuotaCalc = cuotaIva(base, pb)
    if (b?.cuotaCent != null && Math.abs(b.cuotaCent - cuotaCalc) > tol.totalCent) {
      d({ tipo: 'cuota_iva', bloquea: true, ivaPb: pb, esperado: cuotaCalc, encontrado: b.cuotaCent, texto: `Cuota de IVA al ${pct(pb)}: ${eur(b.cuotaCent)}, debería ser ${eur(cuotaCalc)}` })
    }
    porIva.push({ ivaPb: pb, baseCent: base, cuotaCent: b?.cuotaCent ?? cuotaCalc })
  }
  const retencion = f.retencionCent ?? 0
  if (retencion !== 0 && !tol.admiteRetencion) d({ tipo: 'retencion', bloquea: true, encontrado: retencion, texto: `La factura lleva retención (${eur(retencion)}): revísala a mano` })
  const totalCalc = porIva.reduce((s, x) => s + x.baseCent + x.cuotaCent, 0) - retencion
  if (f.totalCent == null) d({ tipo: 'total_desconocido', bloquea: true, esperado: totalCalc, texto: 'No se lee el total de la factura' })
  else if (Math.abs(f.totalCent - totalCalc) > tol.totalCent) d({ tipo: 'total', bloquea: true, esperado: totalCalc, encontrado: f.totalCent, texto: `Total ${eur(f.totalCent)}, debería ser ${eur(totalCalc)}` })

  return {
    cuadra: f.lineas.length > 0 && !dif.some((x) => x.bloquea),
    diferencias: dif, parejas,
    totales: { porIva, retencionCent: retencion, totalCent: f.totalCent ?? totalCalc },
  }
}
