// Vínculo SALIENTE PREVISTO ↔ ECHO ↔ respuesta del cliente (spec 2026-11-04 §4). PURO, sin BD.
//
//   1. Alberto pulsa un `wa.me` en plataforma → `POST /api/operador/whatsapp/saliente-previsto` guarda el origen
//      (recibo devuelto, lead, presupuesto…) con el sha256 del texto NORMALIZADO y el índice ciego del teléfono.
//   2. Alberto lo envía desde el móvil → llega el echo (`smb_message_echoes`) → `casarEcho` decide con QUÉ previsto:
//        · mismo teléfono (hash) y echo dentro de las 24 h desde que se abrió (con 2 min de holgura de reloj);
//        · `exacto` si el hash del texto coincide (si hay varios iguales, el abierto más reciente);
//        · `aproximado` (Alberto editó el texto) SOLO si hay UN único previsto candidato;
//        · dos o más candidatos sin hash exacto → NINGUNO (no se elige a ciegas).
//   3. La respuesta del cliente se interpreta contra el saliente vinculado MÁS RECIENTE anterior a ella (≤14 días).
// Sin vínculo, el analizador trabaja como antes.

import { createHash } from 'node:crypto'

export const ORIGENES_SALIENTE = ['recibo_devuelto', 'lead', 'recaptacion', 'solicitud_datos', 'presupuesto', 'renovacion', 'generico'] as const
export type OrigenSaliente = (typeof ORIGENES_SALIENTE)[number]

export const VENTANA_ECHO_MS = 24 * 60 * 60 * 1000
export const HOLGURA_RELOJ_MS = 2 * 60 * 1000
export const VENTANA_RESPUESTA_MS = 14 * 24 * 60 * 60 * 1000

/**
 * El texto tal como lo compararemos: NFKC (el móvil puede recomponer acentos y espacios raros), sin saltos de línea
 * distintos, espacios colapsados, sin espacios en los extremos y en minúsculas. Los emojis se quedan.
 */
export function normalizarTextoSaliente(texto: string): string {
  return texto
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es')
}

/** sha256 hex del texto normalizado. Texto vacío tras normalizar → null (no hay nada que comparar). */
export function hashTextoSaliente(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null
  const n = normalizarTextoSaliente(texto)
  return n === '' ? null : createHash('sha256').update(n, 'utf8').digest('hex')
}

export type PrevistoCandidato = { id: string; telefonoHash: string; textoHash: string | null; abiertoAt: Date; casado: boolean }
export type Echo = { telefonoHash: string; fecha: Date; textoHash: string | null }
export type Casado = { previstoId: string; tipo: 'exacto' | 'aproximado' }

export function casarEcho(echo: Echo, previstos: readonly PrevistoCandidato[]): Casado | null {
  const t = echo.fecha.getTime()
  const candidatos = previstos.filter(
    (p) =>
      !p.casado &&
      p.telefonoHash === echo.telefonoHash &&
      t >= p.abiertoAt.getTime() - HOLGURA_RELOJ_MS &&
      t <= p.abiertoAt.getTime() + VENTANA_ECHO_MS,
  )
  if (candidatos.length === 0) return null
  if (echo.textoHash !== null) {
    const exactos = candidatos.filter((p) => p.textoHash === echo.textoHash).sort((a, b) => b.abiertoAt.getTime() - a.abiertoAt.getTime())
    if (exactos.length > 0) return { previstoId: exactos[0].id, tipo: 'exacto' }
  }
  return candidatos.length === 1 ? { previstoId: candidatos[0].id, tipo: 'aproximado' } : null
}

export type SalienteVinculado = {
  id: string
  origen: OrigenSaliente
  reciboId: string | null
  oportunidadId: string | null
  polizaId: string | null
  /** Cuándo se ENVIÓ (fecha del echo). */
  enviadoAt: Date
}

/** El vinculado más reciente ENVIADO antes de `respuestaAt` y como mucho 14 días antes. */
export function salienteDeLaRespuesta<T extends { enviadoAt: Date }>(respuestaAt: Date, vinculados: readonly T[]): T | null {
  const r = respuestaAt.getTime()
  const validos = vinculados
    .filter((v) => v.enviadoAt.getTime() <= r && r - v.enviadoAt.getTime() <= VENTANA_RESPUESTA_MS)
    .sort((a, b) => b.enviadoAt.getTime() - a.enviadoAt.getTime())
  return validos[0] ?? null
}

// ── Entrada del endpoint de plataforma ───────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EntradaSalientePrevisto = {
  telefono: string
  origen: OrigenSaliente
  texto: string | null
  clienteId: string | null
  reciboId: string | null
  oportunidadId: string | null
  polizaId: string | null
  solicitudId: string | null
}

/**
 * Valida el cuerpo de `POST /api/operador/whatsapp/saliente-previsto`. El TEXTO entra solo para hashearlo (no se guarda).
 * Un origen con ancla exige su ancla (recibo_devuelto → reciboId; lead/presupuesto/renovacion → oportunidadId;
 * solicitud_datos → solicitudId): sin ella el vínculo no serviría para nada y se rechaza.
 */
export function validarSalientePrevisto(b: unknown): { ok: true; entrada: EntradaSalientePrevisto } | { ok: false; motivo: string } {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, motivo: 'cuerpo no válido' }
  const o = b as Record<string, unknown>
  const telefono = typeof o.telefono === 'string' ? o.telefono.trim() : ''
  if (!/^\+?[\d\s().-]{6,25}$/.test(telefono)) return { ok: false, motivo: 'telefono no válido' }
  if (typeof o.origen !== 'string' || !(ORIGENES_SALIENTE as readonly string[]).includes(o.origen)) return { ok: false, motivo: 'origen no válido' }
  const origen = o.origen as OrigenSaliente
  const id = (k: string): string | null | 'mal' => {
    const v = o[k]
    if (v === undefined || v === null || v === '') return null
    return typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : 'mal'
  }
  const ids = { clienteId: id('clienteId'), reciboId: id('reciboId'), oportunidadId: id('oportunidadId'), polizaId: id('polizaId'), solicitudId: id('solicitudId') }
  for (const [k, v] of Object.entries(ids)) if (v === 'mal') return { ok: false, motivo: `${k} no válido` }
  const texto = typeof o.texto === 'string' && o.texto.trim() !== '' ? o.texto.slice(0, 4000) : null
  if (origen !== 'generico' && texto === null) return { ok: false, motivo: 'falta el texto del mensaje' }
  if (origen === 'recibo_devuelto' && ids.reciboId === null) return { ok: false, motivo: 'recibo_devuelto exige reciboId' }
  if ((origen === 'lead' || origen === 'presupuesto' || origen === 'renovacion') && ids.oportunidadId === null) return { ok: false, motivo: `${origen} exige oportunidadId` }
  if (origen === 'solicitud_datos' && ids.solicitudId === null) return { ok: false, motivo: 'solicitud_datos exige solicitudId' }
  return { ok: true, entrada: { telefono, origen, texto, ...(ids as Record<keyof typeof ids, string | null>) } }
}
