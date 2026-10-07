// Panel del tarificador RPA (`/correduria/tarificador`, 07/10/2026) — lo PURO: lectura defensiva de la
// respuesta de `/api/correduria/tarificador/panel` y formatos. Sin red ni envs: importable desde 'use client'.
//
// 🚨 Tres estados: `null` = no consta (se pinta «—» o se dice), nunca 0 ni 0 %.

export type EstadoRenovacion = 'cotizada' | 'en_cola' | 'fallida' | 'pendiente' | 'faltan_datos'

export type MetricasPeriodo = {
  dias: number
  total: number
  ok: number
  fallidos: number
  enCurso: number
  cancelados: number
  tasaExito: number | null
  tiempoMedioSeg: number | null
}

export type FalloAgrupado = { paso: string; mensaje: string; veces: number; ultimo: string }

export type Renovacion = {
  polizaId: string
  clienteId: string
  cliente: string
  numeroPoliza: string | null
  compania: string
  vencimiento: string
  dias: number
  primaActual: number | null
  estado: EstadoRenovacion
  trabajoId: string | null
  primaAllianz: number | null
  faltan: string[]
}

export type AlertaTarifa = {
  hash: string
  modalidad: string
  producto: string
  etiqueta: string
  antes: { trabajoId: string; fecha: string; prima: number }
  despues: { trabajoId: string; fecha: string; prima: number }
  diferencia: number
  porcentaje: number
}

export type PanelTarificador = {
  generadoEn: string
  interruptores: { rpa: boolean; renovaciones: boolean; topeDia: number }
  metricas: { d7: MetricasPeriodo; d30: MetricasPeriodo; fallos: FalloAgrupado[] }
  intervenciones:
    | { disponible: true; intervenciones: number; llamadasIA: number; trabajosConIA: number; costeEstimado: number | null }
    | { disponible: false; motivo: string }
  renovaciones: { porEstado: Record<EstadoRenovacion, number>; lista: Renovacion[] }
  alertasTarifa: AlertaTarifa[]
  /** Opcional: asegura de una versión anterior no lo manda. */
  coste?: CostePanel | { disponible: false; motivo: string }
}

export type FilaCoste = {
  dia: string
  compania: string
  trabajos: number
  ok: number
  segundos: number | null
  flyEur: number | null
  iaEur: number | null
  totalEur: number | null
}
export type CostePanel = {
  disponible: true
  tarifaFlyEurPorSeg: number
  resumen: {
    mes: string
    costeMesEur: number | null
    trabajosMes: number
    costeMedioEur: number | null
    flyMedioPorTrabajoEur: number | null
    iaIncluida: boolean
    proyeccion100Eur: number | null
    proyeccion1000Eur: number | null
  }
  filas: FilaCoste[]
}

export type LecturaPanel = { ok: true; panel: PanelTarificador } | { ok: false; mensaje: string }

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** La respuesta del proxy → panel, o un mensaje que dice POR QUÉ no hay panel (nunca un panel vacío). */
export function leerRespuestaPanel(status: number, json: unknown): LecturaPanel {
  const o = obj(json)
  if (status === 503 && o?.estado === 'sin_configurar') return { ok: false, mensaje: 'Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET) en plataforma.' }
  if (status === 502) return { ok: false, mensaje: 'No se ha podido hablar con asegura (red). Prueba en un rato.' }
  if (status === 401 || status === 403) return { ok: false, mensaje: 'Sin permiso para leer el panel del tarificador.' }
  if (status !== 200 || !o) {
    const causa = typeof o?.causa === 'string' ? ` (${o.causa})` : typeof o?.mensaje === 'string' ? ` (${o.mensaje})` : ''
    return { ok: false, mensaje: `Asegura no ha podido leer el panel${causa}.` }
  }
  const m = obj(o.metricas)
  const r = obj(o.renovaciones)
  if (!m || !obj(m.d7) || !obj(m.d30) || !Array.isArray(m.fallos) || !r || !Array.isArray(r.lista) || !obj(r.porEstado) || !Array.isArray(o.alertasTarifa) || !obj(o.intervenciones) || !obj(o.interruptores)) {
    return { ok: false, mensaje: 'La respuesta de asegura no tiene la forma esperada (¿versiones desacompasadas?).' }
  }
  return { ok: true, panel: o as unknown as PanelTarificador }
}

/** 66,7 % · `null` → «—». */
export function porcentaje(n: number | null): string {
  return n === null || !Number.isFinite(n) ? '—' : `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
}

/** 185 → «3 min 5 s» · `null` → «—». */
export function duracion(seg: number | null): string {
  if (seg === null || !Number.isFinite(seg) || seg < 0) return '—'
  const s = Math.round(seg)
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  const resto = s % 60
  return resto ? `${min} min ${resto} s` : `${min} min`
}

/** Allianz − actual (negativo = Allianz más barata). Sin uno de los dos datos → `null` (no se compara). */
export function diferenciaPrima(actual: number | null, allianz: number | null): number | null {
  if (actual === null || allianz === null) return null
  return Math.round((allianz - actual) * 100) / 100
}

export const ROTULO_ESTADO: Record<EstadoRenovacion, string> = {
  cotizada: 'Cotizada',
  en_cola: 'En cola',
  fallida: 'Falló (mirar)',
  pendiente: 'Pendiente de cotizar',
  faltan_datos: 'Faltan datos',
}

/** Los tres grupos de la pantalla: cotizadas · pendientes (en cola, por cotizar o fallidas) · faltan datos. */
export function agruparRenovaciones(lista: Renovacion[]): { cotizadas: Renovacion[]; pendientes: Renovacion[]; faltanDatos: Renovacion[] } {
  return {
    cotizadas: lista.filter((r) => r.estado === 'cotizada'),
    pendientes: lista.filter((r) => r.estado === 'pendiente' || r.estado === 'en_cola' || r.estado === 'fallida'),
    faltanDatos: lista.filter((r) => r.estado === 'faltan_datos'),
  }
}
