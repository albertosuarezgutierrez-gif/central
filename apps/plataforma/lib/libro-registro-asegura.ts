// Libro registro de pólizas intermediadas: lectura del puerto de asegura y CSV.
//   1. Lo PURO lo prueba `test/regression-libro-registro.test.ts`.
//   2. La RED, solo desde la ruta API.
import { cabecerasPuerto } from './puerto-actor.ts'

export type FilaLibro = {
  numeroPoliza: string | null
  compania: string | null
  ramo: string | null
  tomador: string | null
  efecto: string | null
  vencimiento: string | null
  estado: string | null
  prima: number | null
}

export type LecturaLibro = { estado: 'ok'; año: number; filas: FilaLibro[] } | { estado: 'error'; motivo: string }

const txtONull = (v: unknown) => v === null || typeof v === 'string'

export function interpretarLibro(status: number, json: unknown): LecturaLibro {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 404) return { estado: 'error', motivo: 'asegura_no_desplegado' }
  if (status !== 200 || o.estado !== 'ok' || typeof o.año !== 'number' || !Array.isArray(o.filas)) {
    return { estado: 'error', motivo: String(o.causa ?? o.motivo ?? o.estado ?? `HTTP ${status}`) }
  }
  const bien = o.filas.every((f) => {
    const x = (f ?? {}) as Record<string, unknown>
    return ['numeroPoliza', 'compania', 'ramo', 'tomador', 'efecto', 'vencimiento', 'estado'].every((k) => txtONull(x[k]))
      && (x.prima === null || (typeof x.prima === 'number' && Number.isFinite(x.prima)))
  })
  if (!bien) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return { estado: 'ok', año: o.año, filas: o.filas as FilaLibro[] }
}

const celda = (v: string | number | null) => {
  if (v === null) return ''
  if (typeof v === 'number') return v.toFixed(2).replace('.', ',')
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV (`;`, coma decimal). Una prima vacía es «no consta», y la cabecera lo dice. */
export function csvLibro(l: { año: number; filas: FilaLibro[] }): string {
  const lineas = [
    celda(`Libro registro de pólizas intermediadas en vigor en ${l.año} (cartera que gestiona CIMA). Prima vacía = no consta.`),
    'Nº póliza;Compañía;Ramo;Tomador;Efecto;Vencimiento;Estado;Prima',
    ...l.filas.map((f) => [f.numeroPoliza, f.compania, f.ramo, f.tomador, f.efecto, f.vencimiento, f.estado, f.prima].map(celda).join(';')),
  ]
  return lineas.join('\n') + '\n'
}

export async function libroRegistroAsegura(año: number): Promise<{ status: number; json: unknown }> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/operador/libro-registro?a%C3%B1o=${año}`, {
      headers: await cabecerasPuerto(secret),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
