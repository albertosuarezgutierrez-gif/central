// «Mi resumen {año}» — agregación PURA (sin Prisma) de lo que se pagó en seguros y los siniestros del año.
//
// Para qué: la persona lo imprime para la declaración de la renta o para ver cuánto gasta al año.
// Reglas (CLAUDE.md del portal, «Visibilidad»):
//  1. `anulado` no entra en ningún cubo. `pendiente`/`emitido`/`devuelto` NO son pagado: solo `cobrado`.
//  2. `null` = «no consta», jamás 0,00€. Un recibo cobrado sin importe o sin fecha de cobro NO suma ni
//     se asigna al año por la emisión (sería un dato falso con forma de dato): se cuenta aparte y se dice.
//  3. Tres estados por póliza: `no_visible` (el nivel no enseña recibos) · `sin_datos` (no consta ningún
//     cobro en ese año) · `dato`.
//  4. Dos bloques que NUNCA se mezclan en una cifra: GESTIONADO por Grupo ASegura (recibos reales de la
//     cartera) y APORTADO por la persona (prima anual que ella declaró: una estimación, no un cobro).
//  5. Solo las pólizas PROPIAS: es un documento personal, sin datos de terceros (autorizadas/intervinientes
//     quedan fuera aunque la bóveda se las enseñe).
import { reciboAnulado } from '@central/module-seguros-portal'

/**
 * Las pólizas que entran en el resumen: las de los titulares PROPIOS, menos las de OTRO tomador en las que
 * la ficha solo figura (`figuraTitular` definido; misma regla que el cron `avisos-cima`): no las paga ella.
 */
export function polizasDelResumen<P extends { figuraTitular?: unknown }>(titulares: readonly { polizas: readonly P[] }[]): P[] {
  return titulares.flatMap((t) => t.polizas.filter((p) => p.figuraTitular === undefined))
}

export type ReciboEntrada = {
  situacion: string
  importe: number | null
  /** Cuándo pasó a su situación actual; en un `cobrado`, el COBRO. `null` = no consta. */
  fechaSituacion: Date | null
}

export type SiniestroEntrada = {
  id: string
  /** Fecha del hecho. `null` = no consta. */
  fechaHora: Date | null
  /** Indemnización que informa la compañía. `null` = no la ha informado. */
  indemnizacion: number | null
}

export type PolizaGestionadaEntrada = {
  id: string
  compania: string
  ramo: string
  /** Texto que identifica la póliza para la persona (bien asegurado, o el nº como último recurso). */
  etiqueta: string
  /** `null` = no visible en este nivel. */
  recibos: ReciboEntrada[] | null
  /** `null` = no visible en este nivel. `[]` = no nos consta ninguno. */
  siniestros: SiniestroEntrada[] | null
}

export type PolizaAportadaEntrada = {
  id: string
  compania: string | null
  ramo: string | null
  etiqueta: string
  /** `PortalProcedencia`: solo `declarado` suma. */
  procedencia: string
  primaAnual: number | null
  fechaVencimiento: Date | null
}

export type EstadoPoliza = 'no_visible' | 'sin_datos' | 'dato'

export type FilaGestionada = {
  id: string
  compania: string
  ramo: string
  etiqueta: string
  estado: EstadoPoliza
  /** Suma de cobrados del año. `null` salvo en `dato`. */
  pagado: number | null
  recibosCobrados: number
  /** Cobrados del año sin importe: NO suman y se dicen. */
  cobradosSinImporte: number
  /** Cobrados sin fecha de cobro: no se pueden asignar a un año y se dicen. */
  cobradosSinFecha: number
}

export type SiniestrosDelAnio = {
  /** `null` = ninguna póliza deja ver siniestros (nivel). */
  total: number | null
  /** Pólizas cuyo nivel no enseña siniestros. */
  polizasNoVisibles: number
  /** Siniestros sin fecha del hecho: no se pueden asignar a un año. */
  sinFecha: number
  /** Suma de indemnizaciones INFORMADAS; `null` = ninguna informada. */
  indemnizado: number | null
  /** Siniestros del año cuya indemnización la compañía no ha informado. */
  sinIndemnizacionInformada: number
  lista: { id: string; polizaId: string; etiqueta: string; fechaHora: Date | null; indemnizacion: number | null }[]
}

export type FilaAportada = {
  id: string
  compania: string | null
  ramo: string | null
  etiqueta: string
  prima: number
}

export type ResumenAnual = {
  anio: number
  gestionado: {
    filas: FilaGestionada[]
    /** `null` = no consta ningún cobro del año (no es 0,00€). */
    total: number | null
    porRamo: { ramo: string; total: number }[]
    polizasNoVisibles: number
    polizasSinDatos: number
    /** Hay recibos cobrados que no se han podido sumar (sin importe o sin fecha): el total es un mínimo. */
    totalIncompleto: boolean
    siniestros: SiniestrosDelAnio
  }
  aportado: {
    filas: FilaAportada[]
    /** `null` = ninguna prima declarada. */
    total: number | null
    /** Aportadas que no suman (sin prima declarada, prima de otra procedencia o ya vencidas antes del año). */
    noIncluidas: number
  }
}

/** Año por defecto: enero-marzo → el anterior (la renta se prepara con el año cerrado); si no, el actual. */
export function anioPorDefecto(hoy: Date): number {
  return hoy.getUTCMonth() <= 2 ? hoy.getUTCFullYear() - 1 : hoy.getUTCFullYear()
}

/** Años seleccionables, del más reciente al más antiguo. Nunca uno futuro. */
export function aniosSeleccionables(hoy: Date, atras = 5): number[] {
  const actual = hoy.getUTCFullYear()
  return Array.from({ length: atras + 1 }, (_, i) => actual - i)
}

/** Valida el `?anio=`: entero de 4 cifras dentro de la lista; cualquier otra cosa → el de por defecto. */
export function anioDePeticion(valor: string | string[] | undefined, hoy: Date): number {
  const v = Array.isArray(valor) ? valor[0] : valor
  const n = v !== undefined && /^\d{4}$/.test(v) ? Number(v) : NaN
  return aniosSeleccionables(hoy).includes(n) ? n : anioPorDefecto(hoy)
}

const esCobrado = (s: string) => s.trim().toLowerCase() === 'cobrado'
const redondear = (n: number) => Math.round(n * 100) / 100

export function resumenAnual(entrada: {
  anio: number
  gestionadas: readonly PolizaGestionadaEntrada[]
  aportadas: readonly PolizaAportadaEntrada[]
}): ResumenAnual {
  const { anio } = entrada

  const filas: FilaGestionada[] = entrada.gestionadas.map((p) => {
    const base = { id: p.id, compania: p.compania, ramo: p.ramo, etiqueta: p.etiqueta, recibosCobrados: 0, cobradosSinImporte: 0, cobradosSinFecha: 0 }
    if (p.recibos === null) return { ...base, estado: 'no_visible' as const, pagado: null }
    let suma = 0
    let con = 0
    let sinImporte = 0
    let sinFecha = 0
    for (const r of p.recibos) {
      if (reciboAnulado(r.situacion) || !esCobrado(r.situacion)) continue
      if (r.fechaSituacion === null) { sinFecha++; continue }
      if (r.fechaSituacion.getUTCFullYear() !== anio) continue
      if (r.importe === null) { sinImporte++; continue }
      suma += r.importe
      con++
    }
    const estado: EstadoPoliza = con > 0 ? 'dato' : 'sin_datos'
    return {
      ...base,
      estado,
      pagado: con > 0 ? redondear(suma) : null,
      recibosCobrados: con,
      cobradosSinImporte: sinImporte,
      cobradosSinFecha: sinFecha,
    }
  })

  const conDato = filas.filter((f) => f.estado === 'dato')
  const total = conDato.length > 0 ? redondear(conDato.reduce((a, f) => a + (f.pagado ?? 0), 0)) : null
  const ramos = new Map<string, number>()
  for (const f of conDato) ramos.set(f.ramo, (ramos.get(f.ramo) ?? 0) + (f.pagado ?? 0))
  const porRamo = [...ramos].map(([ramo, t]) => ({ ramo, total: redondear(t) })).sort((a, b) => b.total - a.total)

  // Siniestros (de la cartera): solo los del año por fecha del hecho.
  const visibles = entrada.gestionadas.filter((p) => p.siniestros !== null)
  const lista: SiniestrosDelAnio['lista'] = []
  let sinFechaS = 0
  for (const p of visibles) {
    for (const s of p.siniestros ?? []) {
      if (s.fechaHora === null) { sinFechaS++; continue }
      if (s.fechaHora.getUTCFullYear() !== anio) continue
      lista.push({ id: s.id, polizaId: p.id, etiqueta: p.etiqueta, fechaHora: s.fechaHora, indemnizacion: s.indemnizacion })
    }
  }
  lista.sort((a, b) => (a.fechaHora?.getTime() ?? 0) - (b.fechaHora?.getTime() ?? 0))
  const informadas = lista.filter((s) => s.indemnizacion !== null)
  const siniestros: SiniestrosDelAnio = {
    total: visibles.length > 0 ? lista.length : null,
    polizasNoVisibles: entrada.gestionadas.length - visibles.length,
    sinFecha: sinFechaS,
    indemnizado: informadas.length > 0 ? redondear(informadas.reduce((a, s) => a + (s.indemnizacion ?? 0), 0)) : null,
    sinIndemnizacionInformada: lista.length - informadas.length,
    lista,
  }

  // Aportado: solo `declarado` con prima, y no vencida antes del año consultado.
  const inicioAnio = Date.UTC(anio, 0, 1)
  const aportadas: FilaAportada[] = []
  let noIncluidas = 0
  for (const a of entrada.aportadas) {
    const vencidaAntes = a.fechaVencimiento !== null && a.fechaVencimiento.getTime() < inicioAnio
    if (a.procedencia !== 'declarado' || a.primaAnual === null || vencidaAntes) { noIncluidas++; continue }
    aportadas.push({ id: a.id, compania: a.compania, ramo: a.ramo, etiqueta: a.etiqueta, prima: a.primaAnual })
  }

  return {
    anio,
    gestionado: {
      filas,
      total,
      porRamo,
      polizasNoVisibles: filas.filter((f) => f.estado === 'no_visible').length,
      polizasSinDatos: filas.filter((f) => f.estado === 'sin_datos').length,
      totalIncompleto: filas.some((f) => f.cobradosSinImporte > 0 || f.cobradosSinFecha > 0),
      siniestros,
    },
    aportado: {
      filas: aportadas,
      total: aportadas.length > 0 ? redondear(aportadas.reduce((a, f) => a + f.prima, 0)) : null,
      noIncluidas,
    },
  }
}
