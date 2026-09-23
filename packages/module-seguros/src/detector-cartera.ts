// packages/module-seguros/src/detector-cartera.ts
//
// Detector de cambios de la cartera viva (Fase 2 de ASegura OS, 23/09/2026). PURO.
//
// La ingesta de CIMA vive FUERA de central (CRM de Manuel → `seguros` con `crm_seguros`), así que
// central no puede emitir eventos en el origen. En su lugar compara una FOTO de la cartera viva con
// la anterior y deduce qué pasó: una póliza que se da de baja, una que anuncia que no renovará, un
// recibo devuelto, un siniestro nuevo. Cada cambio es un evento con una clave de idempotencia: la
// misma transición vista dos veces es UN evento.
//
// Regla NULL≠0: la primera pasada (sin foto previa) NO emite nada — solo ancla. Sin foto anterior
// no se sabe qué es nuevo, y emitir «110 pólizas creadas» sería mentir.

import { esEstadoVigente } from './vigencia.ts'

export const TIPOS_EVENTO_CARTERA = [
  'POLIZA_CREADA',
  'POLIZA_RENOVADA',
  'POLIZA_ANULA_AL_VENCIMIENTO',
  'POLIZA_BAJA',
  'POLIZA_DESAPARECIDA',
  'RECIBO_DEVUELTO',
  'RECIBO_COBRADO',
  'SINIESTRO_ABIERTO',
  'SINIESTRO_CERRADO',
] as const
export type TipoEventoCartera = (typeof TIPOS_EVENTO_CARTERA)[number]

/** Las que pueden ser una PÉRDIDA de cartera: las mira una persona. */
export const TIPOS_FUGA: readonly TipoEventoCartera[] = ['POLIZA_ANULA_AL_VENCIMIENTO', 'POLIZA_BAJA', 'POLIZA_DESAPARECIDA']

export type HuellaPoliza = {
  id: string
  clienteId: string
  estado: string
  /** `YYYY-MM-DD` o null. */
  vencimiento: string | null
  /** Tiene una sustitución registrada (`sustituida_at`): su baja NO es una pérdida. */
  sustituida: boolean
  /** Lápida de fusión: si desaparece por eso, no es una pérdida. */
  fusionada: boolean
}
export type HuellaRecibo = { id: string; polizaId: string; clienteId: string; situacion: string | null }
export type HuellaSiniestro = { id: string; clienteId: string; polizaId: string | null; estado: string }

export type Foto = {
  polizas: Record<string, HuellaPoliza>
  recibos: Record<string, HuellaRecibo>
  siniestros: Record<string, HuellaSiniestro>
}

export type EventoCartera = {
  tipo: TipoEventoCartera
  entidad: 'poliza' | 'recibo' | 'siniestro'
  id: string
  clienteId: string
  /** Sin datos personales: estados, fechas y el motivo de por qué NO es una pérdida. */
  datos: Record<string, string | boolean | null>
  /** Idempotencia: la misma transición vista dos veces es la misma clave. */
  clave: string
}

export type Deteccion = { primeraVez: true; eventos: [] } | { primeraVez: false; eventos: EventoCartera[] }

const ESTADOS_CERRADOS_SINIESTRO = new Set(['cerrado', 'rechazado'])

export function fotoVacia(f: Foto | null | undefined): boolean {
  return !f || (Object.keys(f.polizas).length === 0 && Object.keys(f.recibos).length === 0 && Object.keys(f.siniestros).length === 0)
}

export function detectarCambios(anterior: Foto | null, actual: Foto): Deteccion {
  if (fotoVacia(anterior)) return { primeraVez: true, eventos: [] }
  const antes = anterior as Foto
  const eventos: EventoCartera[] = []
  const ev = (e: Omit<EventoCartera, 'clave'>, sufijo: string) => eventos.push({ ...e, clave: `${e.tipo}:${e.id}:${sufijo}` })

  // ── Pólizas ──
  for (const p of Object.values(actual.polizas)) {
    const a = antes.polizas[p.id]
    if (!a) {
      ev({ tipo: 'POLIZA_CREADA', entidad: 'poliza', id: p.id, clienteId: p.clienteId, datos: { estado: p.estado, vencimiento: p.vencimiento } }, 'alta')
      continue
    }
    const eraVigente = esEstadoVigente(a.estado)
    if (eraVigente && !esEstadoVigente(p.estado)) {
      const tipo = p.estado === 'anula_al_vencimiento' ? 'POLIZA_ANULA_AL_VENCIMIENTO' : 'POLIZA_BAJA'
      ev({ tipo, entidad: 'poliza', id: p.id, clienteId: p.clienteId, datos: { antes: a.estado, despues: p.estado, vencimiento: p.vencimiento, sustituida: p.sustituida } }, p.estado)
    }
    if (a.vencimiento && p.vencimiento && p.vencimiento > a.vencimiento) {
      ev({ tipo: 'POLIZA_RENOVADA', entidad: 'poliza', id: p.id, clienteId: p.clienteId, datos: { antes: a.vencimiento, despues: p.vencimiento } }, p.vencimiento)
    }
  }
  for (const a of Object.values(antes.polizas)) {
    if (actual.polizas[a.id]) continue
    // Una lápida de fusión o una póliza ya dada de baja que deja de verse no es una pérdida nueva.
    if (a.fusionada || !esEstadoVigente(a.estado)) continue
    ev({ tipo: 'POLIZA_DESAPARECIDA', entidad: 'poliza', id: a.id, clienteId: a.clienteId, datos: { ultimoEstado: a.estado, vencimiento: a.vencimiento, sustituida: a.sustituida } }, 'baja')
  }

  // ── Recibos ──
  for (const r of Object.values(actual.recibos)) {
    const a = antes.recibos[r.id]
    const previa = a ? a.situacion : null
    if (r.situacion === previa) continue
    // Un recibo nuevo que llega ya cobrado es lo normal: solo se avisa del paso a cobrado desde otra cosa.
    if (r.situacion === 'devuelto') {
      ev({ tipo: 'RECIBO_DEVUELTO', entidad: 'recibo', id: r.id, clienteId: r.clienteId, datos: { polizaId: r.polizaId, antes: previa } }, 'devuelto')
    } else if (r.situacion === 'cobrado' && a && previa !== null) {
      ev({ tipo: 'RECIBO_COBRADO', entidad: 'recibo', id: r.id, clienteId: r.clienteId, datos: { polizaId: r.polizaId, antes: previa } }, 'cobrado')
    }
  }

  // ── Siniestros ──
  for (const s of Object.values(actual.siniestros)) {
    const a = antes.siniestros[s.id]
    if (!a) {
      ev({ tipo: 'SINIESTRO_ABIERTO', entidad: 'siniestro', id: s.id, clienteId: s.clienteId, datos: { estado: s.estado, polizaId: s.polizaId } }, 'alta')
    } else if (!ESTADOS_CERRADOS_SINIESTRO.has(a.estado) && ESTADOS_CERRADOS_SINIESTRO.has(s.estado)) {
      ev({ tipo: 'SINIESTRO_CERRADO', entidad: 'siniestro', id: s.id, clienteId: s.clienteId, datos: { antes: a.estado, despues: s.estado } }, s.estado)
    }
  }

  return { primeraVez: false, eventos }
}

/**
 * ¿Es una PÉRDIDA sin explicar? Una baja con sustitución registrada (el cliente se quedó con
 * nosotros en otra compañía) no lo es; todo lo demás de `TIPOS_FUGA` sí, hasta que alguien lo mire.
 */
export function esFugaSinExplicar(e: Pick<EventoCartera, 'tipo' | 'datos'>): boolean {
  return TIPOS_FUGA.includes(e.tipo) && e.datos.sustituida !== true
}

const NOMBRE_EVENTO: Record<TipoEventoCartera, string> = {
  POLIZA_CREADA: 'Póliza nueva',
  POLIZA_RENOVADA: 'Póliza renovada',
  POLIZA_ANULA_AL_VENCIMIENTO: 'Anula al vencimiento',
  POLIZA_BAJA: 'Póliza dada de baja',
  POLIZA_DESAPARECIDA: 'Póliza desaparecida de CIMA',
  RECIBO_DEVUELTO: 'Recibo devuelto',
  RECIBO_COBRADO: 'Recibo cobrado',
  SINIESTRO_ABIERTO: 'Siniestro nuevo',
  SINIESTRO_CERRADO: 'Siniestro cerrado',
}

export function nombreEvento(t: TipoEventoCartera): string {
  return NOMBRE_EVENTO[t]
}
