// Cuadro de comisiones PACTADO (`seguros.comision_pactada`) contra la comisión que la compañía HA
// APLICADO en cada recibo de CIMA. Puro: asegura lee las dos fuentes y esto las cruza.
//
// Tres cosas que no se colapsan:
// · sin cuadro apuntado ≠ comisión correcta → 'sin-cuadro', nunca 'cuadra'.
// · sin recibos que comparar ≠ cuadra → 'sin-recibos'.
// · modalidades a % distintos: el recibo no dice de qué modalidad es → 'por-modalidad', sin veredicto.

import { importeEiac } from './importe-eiac.ts'

export const ACUERDO_DIRECTO = 'directo'
/** Puntos de diferencia que se toleran por redondeo a céntimos antes de decir que descuadra. */
export const TOLERANCIA_PUNTOS = 0.5

export type CuadroFila = {
  companiaCodigo: string
  producto: string
  productoNombre: string | null
  /** `null` = todo el producto. */
  modalidad: string | null
  /** 'directo' o el nombre de la asociación. */
  acuerdo: string
  pctNueva: number
  pctCartera: number
  /** YYYY-MM-DD */
  vigenteDesde: string
  fuente: string
}

export type ReciboComision = {
  companiaCodigo: string
  producto: string
  productoNombre: string | null
  /** Fecha de efecto, YYYY-MM-DD. */
  fecha: string
  /** Clase del recibo en CIMA: NP (nueva producción), CA (cartera), SU (suplemento)… */
  clase: string | null
  comision: string | null
  prima: string | null
}

export type EntradaCuadro = {
  modalidad: string | null
  acuerdo: string
  /** Lo que aplica HOY (`null` = aún no ha entrado en vigor ningún cuadro de esta clave). */
  vigente: CuadroFila | null
  /** El próximo cuadro ya comunicado, si lo hay. */
  proximo: CuadroFila | null
}

export type ExtraAcuerdo = { modalidad: string | null; acuerdo: string; puntosNueva: number; puntosCartera: number }

export type VeredictoComision = 'sin-cuadro' | 'sin-recibos' | 'por-modalidad' | 'varios-acuerdos' | 'cuadra' | 'descuadra'

export type LineaComision = {
  companiaCodigo: string
  producto: string
  productoNombre: string | null
  cuadro: EntradaCuadro[]
  /** Acuerdos contra los que se comparan los recibos: por modalidad, la asociación vigente si la hay, si no
   *  el directo. Vacío = ningún cuadro en vigor. */
  acuerdosAplicados: string[]
  /** Lo que da cada asociación vigente por encima (o por debajo) del directo vigente. */
  extras: ExtraAcuerdo[]
  real: { recibos: number; pctMin: number; pctMax: number; pctMedio: number } | null
  veredicto: VeredictoComision
  /** Recibos NP/CA cuyo % se sale del pactado más de la tolerancia. */
  fuera: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** % de comisión del recibo sobre prima neta, o `null` si falta o no se puede leer alguno de los dos. */
export function pctRecibo(r: Pick<ReciboComision, 'comision' | 'prima'>): number | null {
  const c = importeEiac(r.comision)
  const p = importeEiac(r.prima)
  if (c === null || p === null || p <= 0) return null
  return (c / p) * 100
}

/** Por cada (modalidad, acuerdo) de un producto: el cuadro que aplica en `hoy` y el siguiente comunicado. */
export function resolverCuadro(filas: readonly CuadroFila[], hoy: string): EntradaCuadro[] {
  const grupos = new Map<string, CuadroFila[]>()
  for (const f of filas) {
    const k = `${f.modalidad ?? ''}|${f.acuerdo}`
    grupos.set(k, [...(grupos.get(k) ?? []), f])
  }
  return [...grupos.values()].map((g) => {
    const orden = [...g].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
    const pasadas = orden.filter((f) => f.vigenteDesde <= hoy)
    return {
      modalidad: g[0].modalidad,
      acuerdo: g[0].acuerdo,
      vigente: pasadas.at(-1) ?? null,
      proximo: orden.find((f) => f.vigenteDesde > hoy) ?? null,
    }
  })
}

/**
 * El cuadro que aplica HOY en cada modalidad: la asociación vigente si la hay, si no el directo. Se decide
 * POR MODALIDAD: una asociación que solo cubre una modalidad no desplaza al directo de las demás.
 * `null` si alguna modalidad tiene dos asociaciones vigentes a la vez (no se sabe bajo cuál se emitió).
 */
function aplicablesPorModalidad(cuadro: readonly EntradaCuadro[]): CuadroFila[] | null {
  const porModalidad = new Map<string, EntradaCuadro[]>()
  for (const e of cuadro) {
    if (!e.vigente) continue
    const k = e.modalidad ?? ''
    porModalidad.set(k, [...(porModalidad.get(k) ?? []), e])
  }
  const out: CuadroFila[] = []
  for (const es of porModalidad.values()) {
    const asociaciones = es.filter((e) => e.acuerdo !== ACUERDO_DIRECTO)
    if (asociaciones.length > 1) return null
    out.push((asociaciones[0] ?? es[0]).vigente as CuadroFila)
  }
  return out
}

function extras(cuadro: readonly EntradaCuadro[]): ExtraAcuerdo[] {
  const out: ExtraAcuerdo[] = []
  for (const e of cuadro) {
    if (e.acuerdo === ACUERDO_DIRECTO || !e.vigente) continue
    const base = cuadro.find((d) => d.acuerdo === ACUERDO_DIRECTO && d.modalidad === e.modalidad && d.vigente)?.vigente
    if (!base) continue
    out.push({
      modalidad: e.modalidad,
      acuerdo: e.acuerdo,
      puntosNueva: r2(e.vigente.pctNueva - base.pctNueva),
      puntosCartera: r2(e.vigente.pctCartera - base.pctCartera),
    })
  }
  return out
}

/** Una línea por (compañía, producto) que aparezca en el cuadro o en los recibos. */
export function lineasComision(filas: readonly CuadroFila[], recibos: readonly ReciboComision[], hoy: string): LineaComision[] {
  const productos = new Map<string, { companiaCodigo: string; producto: string; productoNombre: string | null }>()
  for (const x of [...filas, ...recibos]) {
    const k = `${x.companiaCodigo}|${x.producto}`
    const prev = productos.get(k)
    productos.set(k, { companiaCodigo: x.companiaCodigo, producto: x.producto, productoNombre: prev?.productoNombre ?? x.productoNombre })
  }

  return [...productos.entries()]
    .map(([k, p]) => {
      const cuadro = resolverCuadro(filas.filter((f) => `${f.companiaCodigo}|${f.producto}` === k), hoy)
      const resueltos = aplicablesPorModalidad(cuadro)
      const aplicables = resueltos ?? []
      // Solo los recibos emitidos bajo el cuadro que se compara: uno anterior se cobró con otro cuadro.
      const desde = aplicables.reduce((m, f) => (f.vigenteDesde > m ? f.vigenteDesde : m), '')
      const conPct = recibos
        .filter((r) => `${r.companiaCodigo}|${r.producto}` === k && r.fecha >= desde)
        .map((r) => ({ r, pct: pctRecibo(r) }))
        .filter((x): x is { r: ReciboComision; pct: number } => x.pct !== null)

      const real = conPct.length
        ? (() => {
            const pcts = conPct.map((x) => x.pct)
            const com = conPct.reduce((s, x) => s + (importeEiac(x.r.comision) as number), 0)
            const pri = conPct.reduce((s, x) => s + (importeEiac(x.r.prima) as number), 0)
            return { recibos: conPct.length, pctMin: r2(Math.min(...pcts)), pctMax: r2(Math.max(...pcts)), pctMedio: r2((com / pri) * 100) }
          })()
        : null

      let veredicto: VeredictoComision
      let fuera = 0
      const tramos = new Set(aplicables.map((f) => `${f.pctNueva}|${f.pctCartera}`))
      if (resueltos === null) veredicto = 'varios-acuerdos'
      else if (aplicables.length === 0) veredicto = 'sin-cuadro'
      else if (tramos.size > 1) veredicto = 'por-modalidad'
      else {
        const f = aplicables[0]
        // El suplemento (SU) no dice si es de primer año o de cartera: no se usa para el veredicto.
        const comparables = conPct.filter((x) => x.r.clase === 'NP' || x.r.clase === 'CA')
        if (comparables.length === 0) veredicto = 'sin-recibos'
        else {
          fuera = comparables.filter((x) => Math.abs(x.pct - (x.r.clase === 'NP' ? f.pctNueva : f.pctCartera)) > TOLERANCIA_PUNTOS).length
          veredicto = fuera > 0 ? 'descuadra' : 'cuadra'
        }
      }

      const acuerdosAplicados = [...new Set(aplicables.map((f) => f.acuerdo))].sort()
      return { ...p, cuadro, acuerdosAplicados, extras: extras(cuadro), real, veredicto, fuera }
    })
    .sort((a, b) => a.companiaCodigo.localeCompare(b.companiaCodigo) || a.producto.localeCompare(b.producto))
}
