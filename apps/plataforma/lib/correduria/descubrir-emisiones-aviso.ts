// ────────────────────────────────────────────────────────────────────────────
// Descubrimiento AUTOMÁTICO de emisiones de Avant2 — lectura de la respuesta de asegura, latido y
// aviso de Telegram (03/10/2026). PURO (sin BD ni red): la ruta del cron solo cablea.
//
// asegura (`POST /api/operador/codeoscopic/descubrir-emisiones`) mira cada ~30 min los proyectos con
// solicitud presentada, registra solos los de auto/moto con el tomador demostrado por documento y
// deja el resto en una cola de revisión. Aquí se decide qué se cuenta a Alberto:
//   · 🔴 Codeoscopic rechaza las credenciales (401/403) — una vez por avería, no cada media hora.
//   · 🔴 más de 6 h sin una pasada buena — una vez, al cruzar el umbral.
//   · 🟡 estado de solicitud desconocido NUEVO, o cola de revisión con algo NUEVO — resumen.
//   · ✅ pólizas registradas solas — resumen.
//   · Recordatorio diario (pasada de las 07:10 de Madrid) si la cola sigue con algo.
// 🚨 Sin PII: ni nombres, ni documentos, ni nº de póliza. Solo cifras y el enlace a /correduria.
// 🚨 Un fallo de lectura NUNCA es «0 emisiones»: el latido va en rojo.
// ────────────────────────────────────────────────────────────────────────────
import { URL_PLATAFORMA_POR_DEFECTO } from '../correduria-emision-tg.ts'

export const AGENTE_DESCUBRIR = 'correduria_descubrir_emisiones'
export const HORAS_SIN_EXITO = 6
/** El detalle del latido empieza así cuando la avería es de credenciales (para no repetir el aviso). */
export const PREFIJO_CREDENCIALES = 'credenciales de Codeoscopic rechazadas'

export type MotivoRevision =
  | 'sin_cliente' | 'varios_clientes' | 'sin_documento' | 'ramo_sin_acunar'
  | 'emitida_sin_acunar' | 'estado_desconocido' | 'bloqueada'

const TEXTO_MOTIVO: Record<MotivoRevision, string> = {
  sin_cliente: 'tomador sin ficha en la cartera',
  varios_clientes: 'tomador con varias fichas (no se elige)',
  sin_documento: 'proyecto sin documento del tomador',
  ramo_sin_acunar: 'emitidas en un ramo que no se acuña solo',
  emitida_sin_acunar: 'aprobadas que no se pudieron acuñar',
  estado_desconocido: 'estado que no se reconoce en Avant2',
  bloqueada: 'bloqueadas al registrar',
}

export type Descubrimiento =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | { estado: 'credenciales_rechazadas'; motivo: string | null }
  | { estado: 'error_vendor'; motivo: string | null }
  | {
      estado: 'ok'
      revisados: number
      acunadas: number
      registradas: number
      revisionNuevas: number
      desconocidosNuevos: number
      colaAbierta: number
      colaPorMotivo: Partial<Record<MotivoRevision, number>>
      errores: number
      pendientesPorTope: number
      truncado: boolean
    }

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/** La respuesta de asegura, sin suponer nada: un campo que falta es «ilegible», nunca 0. */
export function interpretarDescubrimiento(status: number, json: unknown): Descubrimiento {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = objeto(json)
  if (o?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o?.estado === 'vendor_sin_configurar') return { estado: 'error', motivo: 'Codeoscopic sin configurar en asegura' }
  if (status !== 200 || !o) return { estado: 'error', motivo: cadena(o?.mensaje) ?? (status === 200 ? 'respuesta_ilegible' : `asegura_error ${status}`) }
  if (o.estado === 'credenciales_rechazadas') return { estado: 'credenciales_rechazadas', motivo: cadena(o.motivo) }
  if (o.estado === 'error_vendor') return { estado: 'error_vendor', motivo: cadena(o.motivo) }
  if (o.estado !== 'ok') return { estado: 'error', motivo: cadena(o.mensaje) ?? 'asegura_error' }

  const campos = ['revisados', 'acunadas', 'registradas', 'revisionNuevas', 'desconocidosNuevos', 'colaAbierta', 'pendientesPorTope'] as const
  const n: Partial<Record<(typeof campos)[number], number>> = {}
  for (const c of campos) {
    const v = entero(o[c])
    if (v === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    n[c] = v
  }
  if (!Array.isArray(o.errores) || typeof o.truncado !== 'boolean') return { estado: 'error', motivo: 'respuesta_ilegible' }
  const colaPorMotivo: Partial<Record<MotivoRevision, number>> = {}
  for (const [k, v] of Object.entries(objeto(o.colaPorMotivo) ?? {})) {
    const x = entero(v)
    if (k in TEXTO_MOTIVO && x !== null) colaPorMotivo[k as MotivoRevision] = x
  }
  return {
    estado: 'ok',
    revisados: n.revisados!, acunadas: n.acunadas!, registradas: n.registradas!, revisionNuevas: n.revisionNuevas!,
    desconocidosNuevos: n.desconocidosNuevos!, colaAbierta: n.colaAbierta!, pendientesPorTope: n.pendientesPorTope!,
    colaPorMotivo, errores: o.errores.length, truncado: o.truncado,
  }
}

/** El latido ANTERIOR de este agente. `null` = no se pudo leer (se avisa como si fuera la primera vez). */
export type LatidoPrevio = { ok: boolean | null; detalle: string | null; ultimoAt: Date | null; ultimoOkAt: Date | null } | null

/** ¿Es la primera pasada del día (07:10 de Madrid)? Solo ahí se recuerda la cola aunque no haya nada nuevo. */
export function esPrimeraPasadaDelDia(ahora: Date): boolean {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ahora)
  const h = Number(partes.find((p) => p.type === 'hour')?.value)
  const m = Number(partes.find((p) => p.type === 'minute')?.value)
  return h === 7 && m < 30
}

export type DecisionDescubrimiento = { latidoOk: boolean; latidoDetalle: string; mensaje: string | null }

const horas = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 3_600_000

function enlace(base: string): string {
  return `<a href="${base.replace(/\/$/, '')}/correduria">Abrir la correduría</a>`
}

export function decidirDescubrimiento(p: {
  r: Descubrimiento
  previo: LatidoPrevio
  ahora: Date
  base?: string
}): DecisionDescubrimiento {
  const base = p.base ?? (process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO)
  const { r, previo, ahora } = p
  const lineas: string[] = []

  let latidoOk: boolean
  let latidoDetalle: string
  if (r.estado === 'sin_configurar') {
    latidoOk = false
    latidoDetalle = 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)'
  } else if (r.estado === 'error') {
    latidoOk = false
    latidoDetalle = `no se pudo mirar: ${r.motivo}`
  } else if (r.estado === 'credenciales_rechazadas') {
    latidoOk = false
    latidoDetalle = `${PREFIJO_CREDENCIALES} (401/403)${r.motivo ? `: ${r.motivo}` : ''}`
    const yaAvisado = previo?.ok === false && (previo.detalle ?? '').startsWith(PREFIJO_CREDENCIALES)
    if (!yaAvisado) {
      lineas.push('🔴 <b>Codeoscopic rechaza nuestras credenciales</b> (401/403): no se están descubriendo emisiones de Avant2. Revisa CODEOSCOPIC_CLIENT_ID/SECRET en asegura.')
    }
  } else if (r.estado === 'error_vendor') {
    latidoOk = false
    latidoDetalle = `no se pudo leer la lista de Avant2${r.motivo ? `: ${r.motivo}` : ''}`
  } else {
    latidoOk = r.errores === 0 && !r.truncado
    const partes = [`${r.revisados} revisado(s)`, `${r.acunadas} acuñada(s)`, `${r.colaAbierta} en revisión`]
    if (r.errores > 0) partes.push(`${r.errores} sin poder revisar`)
    if (r.truncado) partes.push('lista TRUNCADA (no se vio entera)')
    if (r.pendientesPorTope > 0) partes.push(`${r.pendientesPorTope} para la próxima pasada`)
    latidoDetalle = partes.join(', ')

    if (r.acunadas > 0) lineas.push(`✅ <b>${r.acunadas}</b> póliza(s) emitida(s) en Avant2 registrada(s) sola(s) en la cartera.`)
    if (r.desconocidosNuevos > 0) lineas.push(`🟡 <b>${r.desconocidosNuevos}</b> emisión(es) con un estado que no se reconoce: hay que mirarlas en Avant2.`)
    const recordar = esPrimeraPasadaDelDia(ahora) && r.colaAbierta > 0
    if (r.revisionNuevas > 0 || recordar) {
      const cabecera = r.revisionNuevas > 0
        ? `🟡 <b>${r.revisionNuevas}</b> emisión(es) nueva(s) que no se pueden registrar solas. En revisión: <b>${r.colaAbierta}</b>.`
        : `🟡 Siguen <b>${r.colaAbierta}</b> emisión(es) de Avant2 esperando revisión.`
      const desglose = (Object.entries(r.colaPorMotivo) as [MotivoRevision, number][])
        .filter(([, n]) => n > 0)
        .map(([m, n]) => `   · ${n} ${TEXTO_MOTIVO[m]}`)
      lineas.push([cabecera, ...desglose].join('\n'))
    }
  }

  // Más de 6 h sin una pasada BUENA: se avisa UNA vez, al cruzar el umbral.
  if (!latidoOk && previo?.ultimoOkAt) {
    const ahoraH = horas(ahora, previo.ultimoOkAt)
    const antesH = previo.ultimoAt ? horas(previo.ultimoAt, previo.ultimoOkAt) : 0
    if (ahoraH > HORAS_SIN_EXITO && antesH <= HORAS_SIN_EXITO) {
      lineas.push(`🔴 El descubrimiento de emisiones lleva <b>más de ${HORAS_SIN_EXITO} h</b> sin una pasada buena. Último motivo: ${escapar(latidoDetalle)}.`)
    }
  }

  const mensaje = lineas.length > 0 ? `🛡️ <b>Emisiones de Avant2</b>\n${lineas.join('\n')}\n${enlace(base)}` : null
  return { latidoOk, latidoDetalle, mensaje }
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
