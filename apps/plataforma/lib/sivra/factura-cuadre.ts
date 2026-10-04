// lib/sivra/factura-cuadre.ts — cuadre de la factura mensual de Sique Brilla contra las salidas (puro).
//
// La factura llega por correo (limpiezascruzz@gmail.com, PDF VeriFactu) con una línea por piso
// («LUXURY / DUPLEX / CASA SOCORRO / BUSTOS REFORMA», Unidades = nº de cambios) y una de lavandería
// («SERVICIO DE LAVANDERIA 56.25KG X 1.70»). Este módulo la LEE del texto del PDF por filas
// (`textoPdfPorFilas`), comprueba su aritmética y la cuadra con los checkouts de reservas NO
// canceladas del mes facturado. Sin red ni BD: el borde sucio está en `factura-cuadre-correo.ts`.
//
// Nunca afirma lo que no ha podido leer: texto ilegible → `leida: null` y el mensaje dice «no he
// podido leer la factura», jamás «cuadra». Una línea con un concepto desconocido es discrepancia.
import { eur } from '../dinero.ts'
import { IVA_LIMPIEZA } from './reparto-siquebrilla.ts'
import { pisoDeConcepto } from './factura-limpieza.ts'

export const REMITENTE_SIQUE_BRILLA = 'limpiezascruzz@gmail.com'

/** Nombre humano de cada piso facturado (el de la ficha de SIVRA). */
export const NOMBRE_PISO: Record<string, string> = {
  prop_luxury_busto: 'Luxury Busto',
  prop_duplex_center: 'Duplex Center',
  prop_house_sevillana: 'House Sevillana',
  prop_busto_reform: 'Busto Reform',
}
export const PISOS_FACTURADOS = Object.keys(NOMBRE_PISO)

const TOL = 0.02

const r2 = (n: number) => Math.round(n * 100) / 100
/** «1.128,48» → 1128.48 */
const numEs = (s: string): number => Number(s.replace(/\./g, '').replace(',', '.'))

export interface LineaFactura {
  descripcion: string
  unidades: number
  precio: number
  dto: number
  ivaPct: number
  total: number
  tipo: 'limpieza' | 'lavanderia' | 'desconocida'
  /** Solo en `limpieza`. */
  propertyId: string | null
}

export interface FacturaLeida {
  numero: string
  /** YYYY-MM-DD */
  fecha: string
  base: number
  iva: number
  total: number
  lineas: LineaFactura[]
}

/** Remitente exacto de la factura (no el dominio: gmail.com es de todo el mundo). */
export function esCorreoFacturaSique(from: string, subject: string): boolean {
  return from.trim().toLowerCase() === REMITENTE_SIQUE_BRILLA && /factura/i.test(subject)
}

const LINEA_RE = /^(?:\d+\s+)?(.+?)\s+(\d+(?:,\d+)?)\s+([\d.]+,\d{2})\s*€\s+([\d.,]+)%\s+([\d.,]+)%\s+([\d.]+,\d{2})\s*€\s*$/

/**
 * Lee la factura del texto por filas del PDF. `null` = no se ha podido leer (falta número, fecha,
 * importes del pie o ninguna línea): quien llama debe decir «no he podido leerla», no «cuadra».
 */
export function parsearFacturaSique(texto: string | null | undefined): FacturaLeida | null {
  if (!texto) return null
  const m = (re: RegExp) => texto.match(re)?.[1]
  const numero = m(/N[ºo°]\s*factura:\s*(\S+)/i)
  const f = m(/(?:^|\n)\s*Fecha:\s*(\d{2})\/(\d{2})\/(\d{4})/)
    ? texto.match(/(?:^|\n)\s*Fecha:\s*(\d{2})\/(\d{2})\/(\d{4})/)!
    : null
  const base = m(/Base imponible:\s*([\d.]+,\d{2})/i)
  const iva = m(/(?<![%\w])IVA:\s*([\d.]+,\d{2})/)
  const total = m(/(?<![\w])Total:\s*([\d.]+,\d{2})/)
  if (!numero || !f || !base || !iva || !total) return null

  const lineas: LineaFactura[] = []
  for (const linea of texto.split('\n')) {
    const x = linea.match(LINEA_RE)
    if (!x) continue
    const descripcion = x[1].trim()
    const propertyId = pisoDeConcepto(descripcion)
    const tipo: LineaFactura['tipo'] = propertyId ? 'limpieza' : /lavander/i.test(descripcion) ? 'lavanderia' : 'desconocida'
    lineas.push({
      descripcion,
      unidades: numEs(x[2]),
      precio: numEs(x[3]),
      dto: numEs(x[4]),
      ivaPct: numEs(x[5]),
      total: numEs(x[6]),
      tipo,
      propertyId,
    })
  }
  if (!lineas.length) return null
  return { numero, fecha: `${f[3]}-${f[2]}-${f[1]}`, base: numEs(base), iva: numEs(iva), total: numEs(total), lineas }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Mes de SERVICIO ('YYYY-MM'): el del asunto («FACTURA LIMPIEZAS SEPTIEMBRE») con el año de la
 * fecha de emisión (si el mes cae después de la emisión, es del año anterior: diciembre facturado
 * en enero). Sin mes en el asunto → el mes anterior a la emisión (se factura mes vencido).
 */
export function periodoFacturado(asunto: string, fechaFactura: string): string {
  const anio = Number(fechaFactura.slice(0, 4))
  const mesEmision = Number(fechaFactura.slice(5, 7))
  const norm = asunto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const idx = MESES.findIndex((mes) => new RegExp(`\\b${mes}\\b`).test(norm))
  let a = anio
  let mes: number
  if (idx >= 0) {
    mes = idx + 1
    if (mes > mesEmision) a -= 1
  } else {
    mes = mesEmision - 1
    if (mes < 1) { mes = 12; a -= 1 }
  }
  return `${a}-${String(mes).padStart(2, '0')}`
}

/** Límites [desde, hasta) del mes en fecha civil de Madrid, para filtrar `checkOut::date` en SQL. */
export function limitesDelPeriodo(periodo: string): { desde: string; hasta: string } {
  const [a, m] = periodo.split('-').map(Number)
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
  return { desde: `${periodo}-01`, hasta: `${sig}-01` }
}

export interface Salida {
  propertyId: string
  /** Fecha civil de Madrid YYYY-MM-DD (el SQL ya la ha convertido). */
  fecha: string
}

export interface FilaPiso {
  propertyId: string
  nombre: string
  facturado: number
  salidas: number
  /** dd/mm de cada salida, ordenadas. */
  fechas: string[]
}

/** Reserva no cancelada de `incomes` sin `checkOut`: podría haber salido en el mes y no se sabe. */
export interface SinSalida {
  propertyId: string
}

export interface ResultadoCuadre {
  /** `null` = PDF ilegible: no se afirma nada. */
  leida: FacturaLeida | null
  periodo: string | null
  pisos: FilaPiso[]
  /** Errores aritméticos de la propia factura. */
  aritmetica: string[]
  /** Líneas que no se reconocen (nunca se ignoran). */
  desconocidas: string[]
  /** Reservas sin fecha de salida por piso (null = «no se sabe» ≠ no hay salida): impiden el ✅. */
  sinFechaSalida: Array<{ propertyId: string; nombre: string; n: number }>
  cuadra: boolean
  totalFacturado: number
  totalSalidas: number
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Aritmética de la factura: unidades×precio, base, IVA 21 %, total. */
export function comprobarAritmetica(f: FacturaLeida): string[] {
  const err: string[] = []
  for (const l of f.lineas) {
    const esperado = r2(l.unidades * l.precio * (1 - l.dto / 100))
    if (Math.abs(esperado - l.total) > TOL) {
      err.push(`${l.descripcion}: ${l.unidades} × ${eur(l.precio)} = ${eur(esperado)}, la factura pone ${eur(l.total)}`)
    }
    if (Math.abs(l.ivaPct - IVA_LIMPIEZA * 100) > 0.001) {
      err.push(`${l.descripcion}: IVA del ${l.ivaPct}% (se esperaba el 21%)`)
    }
    if (l.tipo === 'lavanderia') {
      const k = l.descripcion.match(/([\d.,]+)\s*KG\s*X\s*([\d.,]+)/i)
      if (k) {
        const kg = Number(k[1].replace(',', '.'))
        const pk = Number(k[2].replace(',', '.'))
        const esp = r2(kg * pk)
        if (Math.abs(esp - l.precio) > TOL) err.push(`Lavandería: ${kg} kg × ${eur(pk)} = ${eur(esp)}, la factura pone ${eur(l.precio)}`)
      }
    }
  }
  const sumaLineas = r2(f.lineas.reduce((s, l) => s + l.total, 0))
  if (Math.abs(sumaLineas - f.base) > TOL) err.push(`Base: las líneas suman ${eur(sumaLineas)}, la factura pone ${eur(f.base)}`)
  const ivaEsp = r2(f.base * IVA_LIMPIEZA)
  if (Math.abs(ivaEsp - f.iva) > TOL) err.push(`IVA: el 21% de ${eur(f.base)} es ${eur(ivaEsp)}, la factura pone ${eur(f.iva)}`)
  const totalEsp = r2(f.base + f.iva)
  if (Math.abs(totalEsp - f.total) > TOL) err.push(`Total: ${eur(f.base)} + ${eur(f.iva)} = ${eur(totalEsp)}, la factura pone ${eur(f.total)}`)
  return err
}

/** Cuadra unidades facturadas por piso con las salidas del mes. `leida: null` → no cuadra. */
export function cuadrarFactura(leida: FacturaLeida | null, periodo: string | null, salidas: Salida[], sinSalida: SinSalida[] = []): ResultadoCuadre {
  if (!leida) {
    return { leida: null, periodo, pisos: [], aritmetica: [], desconocidas: [], sinFechaSalida: [], cuadra: false, totalFacturado: 0, totalSalidas: 0 }
  }
  const aritmetica = comprobarAritmetica(leida)
  const desconocidas = leida.lineas.filter((l) => l.tipo === 'desconocida').map((l) => l.descripcion)

  const ids = new Set<string>(PISOS_FACTURADOS)
  for (const l of leida.lineas) if (l.propertyId) ids.add(l.propertyId)
  for (const s of salidas) ids.add(s.propertyId)

  const pisos: FilaPiso[] = [...ids].map((propertyId) => {
    const fechas = salidas.filter((s) => s.propertyId === propertyId).map((s) => s.fecha).sort()
    return {
      propertyId,
      nombre: NOMBRE_PISO[propertyId] ?? propertyId,
      facturado: leida.lineas.filter((l) => l.propertyId === propertyId).reduce((s, l) => s + l.unidades, 0),
      salidas: fechas.length,
      fechas: fechas.map(ddmm),
    }
  })
  const totalFacturado = pisos.reduce((s, p) => s + p.facturado, 0)
  const totalSalidas = pisos.reduce((s, p) => s + p.salidas, 0)
  const sinFechaSalida = [...new Set(sinSalida.map((x) => x.propertyId))].map((propertyId) => ({
    propertyId,
    nombre: NOMBRE_PISO[propertyId] ?? propertyId,
    n: sinSalida.filter((x) => x.propertyId === propertyId).length,
  }))
  const cuadra = !aritmetica.length && !desconocidas.length && !sinFechaSalida.length && pisos.every((p) => p.facturado === p.salidas)
  return { leida, periodo, pisos, aritmetica, desconocidas, sinFechaSalida, cuadra, totalFacturado, totalSalidas }
}

/**
 * ¿Se puede guardar en `limpieza_facturas`? Solo si su aritmética es sana y no hay líneas
 * desconocidas: el P&L usa el desglose para repartir el gasto, y uno con la aritmética rota
 * lo contaminaría. Una discrepancia de UNIDADES sí se guarda (es lo facturado de verdad).
 */
export function esGuardable(r: ResultadoCuadre): boolean {
  return !!r.leida && !r.aritmetica.length && !r.desconocidas.length && r.leida.lineas.some((l) => l.tipo === 'limpieza')
}

/** Nombre del mes en español con mayúscula: '2026-09' → 'Septiembre 2026'. */
export function mesLegible(periodo: string | null): string {
  if (!periodo) return 'mes sin determinar'
  const m = MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo
  return `${m[0].toUpperCase()}${m.slice(1)} ${periodo.slice(0, 4)}`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Texto del aviso de Telegram (HTML). Importes en formato español. */
export function mensajeCuadre(r: ResultadoCuadre): string {
  const mes = mesLegible(r.periodo)
  if (!r.leida) {
    return `⚠️ No he podido leer la factura de Sique Brilla (${esc(mes)}). No la he cuadrado ni guardado: revísala a mano.`
  }
  const f = r.leida
  if (r.cuadra) {
    return `✅ Factura Sique Brilla ${esc(mes)} cuadra: ${r.totalFacturado} cambios = ${r.totalSalidas} salidas, total ${eur(f.total)} (nº ${esc(f.numero)})`
  }
  const soloSinFecha = r.pisos.every((p) => p.facturado === p.salidas) && !r.aritmetica.length && !r.desconocidas.length
  const lineas = [`⚠️ <b>${soloSinFecha ? 'Cuadre no verificable' : 'Discrepancia'}</b> en la factura Sique Brilla ${esc(mes)} (nº ${esc(f.numero)}, total ${eur(f.total)})`]
  for (const p of r.pisos) {
    const ok = p.facturado === p.salidas
    const fechas = p.fechas.length ? ` (${p.fechas.join(', ')})` : ''
    lineas.push(`${ok ? '✔' : '✖'} ${esc(p.nombre)}: facturado ${p.facturado} vs ${p.salidas} salidas${fechas}`)
  }
  lineas.push(`Total: ${r.totalFacturado} cambios facturados vs ${r.totalSalidas} salidas`)
  for (const x of r.sinFechaSalida) {
    lineas.push(`⚠️ ${x.n} ${x.n === 1 ? 'reserva sin fecha' : 'reservas sin fecha'} de salida en ${esc(x.nombre)}, no verificables`)
  }
  for (const d of r.desconocidas) lineas.push(`❓ Línea desconocida: «${esc(d)}»`)
  for (const a of r.aritmetica) lineas.push(`🧮 ${esc(a)}`)
  return lineas.join('\n')
}
