// Motor GENÉRICO de informes. Funciones PURAS (sin BD): reciben las filas crudas que devuelve
// `consultas.ts` y calculan filas proyectadas + subtotales por grupo + total general.
//
// Regla del repo: null = «no se sabe», nunca 0. Las sumas y medias ignoran los null y cuentan
// cuántas filas quedaron fuera (`sinDato`); si no hay ningún valor, la métrica es null («—»),
// no 0. Así un fichaje en curso (sin salida → horas null) no suma 0 h: queda «en curso».

import { LIMITE_FILAS, type AgrupacionDef, type ColumnaDef, type EntidadDef, type MetricaDef, type ModoAgrupacion, type TipoColumna } from './catalogo'
import { fechaEs } from './formato'
import type { PeticionInforme } from './validador'

export type Valor = string | number | boolean | null
export type Fila = Record<string, Valor>

export type ResultadoMetrica = {
  clave: string
  etiqueta: string
  tipo: MetricaDef['tipo']
  formato: TipoColumna | 'recuento'
  /** Campo sobre el que se calcula (suma/media/recuento_nulos). */
  campo: string | null
  valor: number | null
  /** Filas cuyo valor era null y NO entraron en la suma/media. */
  sinDato: number
}

export type Grupo = {
  clave: string
  etiqueta: string
  n: number
  metricas: ResultadoMetrica[]
  /** Rango [desde, hasta) del grupo dentro de `filas`. */
  desde: number
  hasta: number
}

export type ResultadoInforme = {
  entidad: string
  etiquetaEntidad: string
  columnas: ColumnaDef[]
  agrupacion: { clave: string; etiqueta: string } | null
  filas: Fila[]
  grupos: Grupo[] | null
  total: { n: number; metricas: ResultadoMetrica[] }
  /** true si había más filas que el límite: filas y totales son de las primeras `limite`. */
  truncado: boolean
  limite: number
}

const SIN_DATO = '(sin dato)'

/** Normaliza lo que devuelve Prisma ($queryRaw): Date → ISO, bigint/Decimal → number. */
export function normalizarValor(v: unknown): Valor {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'object' && typeof (v as { toNumber?: unknown }).toNumber === 'function') {
    const n = (v as { toNumber: () => number }).toNumber()
    return Number.isFinite(n) ? n : null
  }
  return String(v)
}

export function normalizarFila(f: Record<string, unknown>): Fila {
  const out: Fila = {}
  for (const [k, v] of Object.entries(f)) out[k] = normalizarValor(v)
  return out
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Semana ISO-8601 de una fecha 'YYYY-MM-DD': { anio, semana, lunes 'YYYY-MM-DD' }. */
export function semanaIso(fecha: string): { anio: number; semana: number; lunes: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const dow = (d.getUTCDay() + 6) % 7 // 0 = lunes
  const lunes = new Date(d); lunes.setUTCDate(d.getUTCDate() - dow)
  const jueves = new Date(d); jueves.setUTCDate(d.getUTCDate() - dow + 3)
  const anio = jueves.getUTCFullYear()
  const ene4 = new Date(Date.UTC(anio, 0, 4))
  const lunesSem1 = new Date(ene4); lunesSem1.setUTCDate(ene4.getUTCDate() - ((ene4.getUTCDay() + 6) % 7))
  const semana = 1 + Math.round((lunes.getTime() - lunesSem1.getTime()) / (7 * 86400000))
  return { anio, semana, lunes: lunes.toISOString().slice(0, 10) }
}

/** Clave de orden + etiqueta del grupo al que pertenece un valor. null → «(sin dato)». */
export function claveGrupo(valor: Valor, modo: ModoAgrupacion, etiqueta?: Valor): { clave: string; etiqueta: string } {
  if (valor === null || valor === '') return { clave: '￿', etiqueta: SIN_DATO }
  if (modo === 'valor') {
    const et = etiqueta ?? valor
    const txt = typeof et === 'boolean' ? (et ? 'Sí' : 'No') : String(et)
    // Ordena por la etiqueta visible, desempata por la identidad (nunca se funden dos ids).
    return { clave: `${txt.toLocaleLowerCase('es')}\u0000${String(valor)}`, etiqueta: txt }
  }
  const s = String(valor)
  const fecha = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
  if (!fecha) return { clave: '￿', etiqueta: SIN_DATO }
  switch (modo) {
    case 'dia': return { clave: fecha, etiqueta: fechaEs(fecha) }
    case 'mes': return { clave: fecha.slice(0, 7), etiqueta: `${MESES[+fecha.slice(5, 7) - 1]} ${fecha.slice(0, 4)}` }
    case 'anio': return { clave: fecha.slice(0, 4), etiqueta: fecha.slice(0, 4) }
    case 'semana': {
      const w = semanaIso(fecha)!
      return { clave: `${w.anio}-W${String(w.semana).padStart(2, '0')}`, etiqueta: `Semana ${w.semana} de ${w.anio} (desde el ${fechaEs(w.lunes)})` }
    }
  }
}

/** Calcula las métricas de la entidad sobre un conjunto de filas crudas. */
export function calcularMetricas(defs: MetricaDef[], filas: Fila[]): ResultadoMetrica[] {
  return defs.map(m => {
    if (m.tipo === 'recuento') {
      return { clave: m.clave, etiqueta: m.etiqueta, tipo: m.tipo, formato: 'recuento', campo: null, valor: filas.length, sinDato: 0 }
    }
    if (m.tipo === 'recuento_nulos') {
      const n = filas.filter(f => f[m.campo] === null || f[m.campo] === undefined).length
      return { clave: m.clave, etiqueta: m.etiqueta, tipo: m.tipo, formato: 'recuento', campo: m.campo, valor: n, sinDato: 0 }
    }
    let suma = 0, conDato = 0, sinDato = 0
    for (const f of filas) {
      const v = f[m.campo]
      if (typeof v === 'number' && Number.isFinite(v)) { suma += v; conDato++ } else sinDato++
    }
    const valor = conDato === 0 ? null : m.tipo === 'suma' ? redondear(suma) : redondear(suma / conDato)
    return { clave: m.clave, etiqueta: m.etiqueta, tipo: m.tipo, formato: m.formato, campo: m.campo, valor, sinDato }
  })
}

/** Evita la deriva de coma flotante (0,1 + 0,2) sin perder precisión útil. */
function redondear(n: number): number { return Math.round(n * 1e6) / 1e6 }

/**
 * Ejecuta el informe sobre las filas crudas (ya filtradas por empresa y filtros en la consulta).
 * `filasCrudas` puede traer una fila de más que `limite` para detectar el truncado.
 */
export function calcularInforme(ent: EntidadDef, pet: PeticionInforme, filasCrudas: Record<string, unknown>[], limite = LIMITE_FILAS): ResultadoInforme {
  const truncado = filasCrudas.length > limite
  let filas = filasCrudas.slice(0, limite).map(normalizarFila)

  // Columnas en el orden del catálogo (estable entre pantalla, Excel y PDF).
  const columnas = ent.columnas.filter(c => pet.columnas.includes(c.clave))
  const agr: AgrupacionDef | null = pet.agrupacion ? ent.agrupaciones.find(a => a.clave === pet.agrupacion) ?? null : null

  let grupos: Grupo[] | null = null
  if (agr) {
    const conClave = filas.map((f, i) => ({ f, i, g: claveGrupo(f[agr.campo] ?? null, agr.modo, agr.campoEtiqueta ? f[agr.campoEtiqueta] ?? null : undefined) }))
    // Orden estable: por clave de grupo, y dentro del grupo el orden original de la consulta.
    conClave.sort((a, b) => (a.g.clave < b.g.clave ? -1 : a.g.clave > b.g.clave ? 1 : a.i - b.i))
    filas = conClave.map(x => x.f)
    grupos = []
    let ini = 0
    for (let i = 1; i <= conClave.length; i++) {
      if (i === conClave.length || conClave[i].g.clave !== conClave[ini].g.clave) {
        const trozo = filas.slice(ini, i)
        grupos.push({ clave: conClave[ini].g.clave, etiqueta: conClave[ini].g.etiqueta, n: trozo.length, metricas: calcularMetricas(ent.metricas, trozo), desde: ini, hasta: i })
        ini = i
      }
    }
  }

  const total = { n: filas.length, metricas: calcularMetricas(ent.metricas, filas) }
  const proyectadas = filas.map(f => Object.fromEntries(columnas.map(c => [c.clave, f[c.clave] ?? null])) as Fila)

  return {
    entidad: ent.clave,
    etiquetaEntidad: ent.etiqueta,
    columnas,
    agrupacion: agr ? { clave: agr.clave, etiqueta: agr.etiqueta } : null,
    filas: proyectadas,
    grupos,
    total,
    truncado,
    limite,
  }
}

/** Recorta las filas para la vista previa SIN tocar grupos ni totales (que son de todo). */
export function recortarParaVista(r: ResultadoInforme, max: number): ResultadoInforme & { filasTotales: number } {
  return { ...r, filas: r.filas.slice(0, max), filasTotales: r.filas.length }
}
