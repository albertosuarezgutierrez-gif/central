// Aviso por Telegram a la correduría cuando una baja FIRMADA por el cliente no sale sola y se queda en
// «Hoy · Esperan tu OK». PURO (el envío y la consulta viven en `aprobaciones.ts`).
// El texto va en HTML de `tgSend`: todo lo que viene de la BD, escapado.

import { escapeHtml } from '@central/core-telegram'

export type EntradaAvisoAnulacionEnCola = {
  tomador: string
  compania: string | null
  numeroPoliza: string | null
  tipo: string
  /** `YYYY-MM-DD` */
  fechaEfecto: string
  /** Día de la firma, `YYYY-MM-DD` (hora de Madrid). */
  firmadaEl: string
  /** Caducidad de la aprobación pendiente, `YYYY-MM-DD` (hora de Madrid). */
  caducaEl: string
}

const TIPOS: Record<string, string> = { no_renovacion: 'no renovación', inmediata: 'baja inmediata', sustitucion: 'sustitución' }

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

/** ¿El efecto cae ANTES del día de la firma? (YYYY-MM-DD compara bien como cadena.) */
export function efectoRetroactivo(fechaEfecto: string, firmadaEl: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(fechaEfecto) && /^\d{4}-\d{2}-\d{2}$/.test(firmadaEl) && fechaEfecto < firmadaEl
}

export function textoAvisoAnulacionEnCola(e: EntradaAvisoAnulacionEnCola): string {
  const poliza = [e.compania, e.numeroPoliza ? `nº ${e.numeroPoliza}` : null].filter(Boolean).join(' · ') || 'póliza sin datos'
  const lineas = [
    '📝 <b>Baja firmada esperando tu OK</b>',
    `${escapeHtml(e.tomador || 'Cliente sin nombre')} · ${escapeHtml(poliza)}`,
    `Tipo: ${escapeHtml(TIPOS[e.tipo] ?? e.tipo)} · efecto ${fechaEs(e.fechaEfecto)}`,
  ]
  if (efectoRetroactivo(e.fechaEfecto, e.firmadaEl)) lineas.push('⚠️ efecto retroactivo')
  lineas.push(`Caduca el ${fechaEs(e.caducaEl)}. Se aprueba en plataforma /correduria → Hoy.`)
  return lineas.join('\n')
}
