// ALARMA «una compañía ha dejado de dar precio» (04/11/2026) — la parte PURA. Entra la agregación del panel de estado
// (`tarificador-estado-reglas.ts`) más los últimos trabajos por compañía × ramo; sale la lista de alertas y el texto.
//
// Solo parejas con bot ACTIVO. Dos motivos (pueden darse a la vez):
//   · sin_precio: ningún precio en los últimos 3 días HABIENDO habido trabajos en esos 3 días (sin trabajos no hay nada
//     que alarmar: nadie ha pedido precio).
//   · errores_seguidos: ≥3 errores seguidos en sus últimos trabajos (los trabajos aún abiertos o cancelados no cuentan
//     ni cortan la racha).
// 🔒 Sin datos de clientes: el motivo del error sale ya REDACTADO (tipo + clave + origen/ruta) como en el panel.

import { causaDominante, type CausaCuenta, type ErrorRedactado, type FilaEstado } from './tarificador-estado-reglas.ts'

export const DIAS_SIN_PRECIO = 3
export const ERRORES_SEGUIDOS = 3
export const MAX_LINEAS_ALARMA = 15
/** Hora (Madrid) del aviso diario. Dos entradas UTC en `vercel.json` + esta guarda resuelven verano/invierno. */
export const HORA_ALARMA = 9
export const ESTADOS_ERROR_ALARMA = ['error_definitivo', 'requiere_humano', 'atascado'] as const

/** Interruptor por entorno (apagado por defecto). */
export function alarmaActiva(env: Record<string, string | undefined>): boolean {
  return (env.TARIFICADOR_ALARMA_ACTIVA ?? '').trim() === '1'
}

export type TrabajoReciente = { compania: string; ramo: string; estado: string; creadoAt: Date | string }
export type MotivoAlarma = 'sin_precio' | 'errores_seguidos'
export type Alerta = {
  compania: string
  ramo: string
  motivos: MotivoAlarma[]
  /** Errores seguidos al final de la racha (0 si el motivo es solo sin_precio). */
  erroresSeguidos: number
  ultimoError: ErrorRedactado | null
  /** Causa que más se repite en los errores de 7 días (05/11/2026). `null` = sin errores o no se pudo leer. */
  causaDominante: CausaCuenta | null
}

const k2 = (c: string, r: string) => `${c}\u0000${r}`
const ms = (d: Date | string) => (d instanceof Date ? d : new Date(d)).getTime()
const esError = (e: string) => (ESTADOS_ERROR_ALARMA as readonly string[]).includes(e)

export function calcularAlertas(filas: FilaEstado[], trabajos: TrabajoReciente[], ahora: Date): Alerta[] {
  const corte = ahora.getTime() - DIAS_SIN_PRECIO * 24 * 3600 * 1000
  const porPareja = new Map<string, TrabajoReciente[]>()
  for (const t of trabajos) {
    const k = k2(t.compania, t.ramo)
    const l = porPareja.get(k)
    if (l) l.push(t)
    else porPareja.set(k, [t])
  }
  const out: Alerta[] = []
  for (const f of filas) {
    if (f.estadoBot !== 'activo') continue
    const ts = (porPareja.get(k2(f.compania, f.ramo)) ?? []).sort((a, b) => ms(b.creadoAt) - ms(a.creadoAt))
    const motivos: MotivoAlarma[] = []

    const huboTrabajos = ts.some((t) => ms(t.creadoAt) >= corte)
    const precioReciente = f.ultimoPrecio !== null && ms(f.ultimoPrecio.fecha) >= corte
    if (huboTrabajos && !precioReciente) motivos.push('sin_precio')

    let racha = 0
    for (const t of ts) {
      if (t.estado === 'ok') break
      if (esError(t.estado)) racha++
    }
    if (racha >= ERRORES_SEGUIDOS) motivos.push('errores_seguidos')

    if (motivos.length) out.push({ compania: f.compania, ramo: f.ramo, motivos, erroresSeguidos: racha >= ERRORES_SEGUIDOS ? racha : 0, ultimoError: f.ultimoError ? { tipo: f.ultimoError.tipo, codigo: f.ultimoError.codigo, clave: f.ultimoError.clave, origen: f.ultimoError.origen, ruta: f.ultimoError.ruta } : null, causaDominante: causaDominante(f.causas7d ?? null) })
  }
  return out.sort((a, b) => a.compania.localeCompare(b.compania) || a.ramo.localeCompare(b.ramo))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Motivo corto del último error, igual de redactado que en el panel. */
export function textoMotivoError(e: ErrorRedactado | null): string {
  if (!e) return ''
  const partes = [e.codigo, e.tipo, e.clave, e.origen && e.ruta ? `${e.origen}${e.ruta}` : e.origen ?? e.ruta].filter((x): x is string => !!x)
  return partes.join(' · ')
}

/** Un solo mensaje agrupado. `null` = nada que avisar. Sin datos de clientes. */
export function textoAlarma(alertas: Alerta[]): string | null {
  if (alertas.length === 0) return null
  const lineas = alertas.slice(0, MAX_LINEAS_ALARMA).map((a) => {
    const que = [
      a.motivos.includes('sin_precio') ? `sin precio en ${DIAS_SIN_PRECIO} días` : '',
      a.erroresSeguidos > 0 ? `${a.erroresSeguidos} errores seguidos` : '',
    ].filter(Boolean).join(', ')
    const m = textoMotivoError(a.ultimoError)
    const causa = a.causaDominante ? `; causa más repetida en 7 días: ${a.causaDominante.codigo} (${a.causaDominante.n})` : ''
    return `· <b>${esc(a.compania)}</b> ${esc(a.ramo)}: ${que}${m ? ` (${esc(m)})` : ''}${esc(causa)}`
  })
  if (alertas.length > MAX_LINEAS_ALARMA) lineas.push(`… y ${alertas.length - MAX_LINEAS_ALARMA} más`)
  const n = alertas.length
  return `⚠️ <b>Tarificador: ${n} ${n === 1 ? 'compañía ha dejado' : 'compañías han dejado'} de dar precio</b>\n${lineas.join('\n')}`
}
