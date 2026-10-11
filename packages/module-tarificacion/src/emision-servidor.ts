// EMISIÓN — la parte de SERVIDOR (hash, token y HMAC con `node:crypto`). Subpath `@central/module-tarificacion/servidor`.
// 🚨 NUNCA se reexporta desde `index.ts`: el index llega al bundle del navegador de plataforma (PedirPresupuestoBot →
//    lib/presupuestos-companias) y `node:crypto` rompió el build de webpack (PR #4483, 11/10/2026). Guardián:
//    `test/regression-tarificacion-index-sin-node.test.ts`. Las reglas puras siguen en `emision.ts`.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  ENV_FIRMA_AUTORIZACION,
  FUTURO_FIRMA_S,
  VENTANA_FIRMA_S,
  camposFirmaAutorizacion,
  canonicoFirma,
  pareceTokenEmision,
  secretoFirmaValido,
  type CamposFirmaAutorizacion,
  type DatosEmision,
  type DecisionCanje,
  type FilaAutorizacion,
  type VerificacionFirma,
} from './emision.ts'
import { claveCompania } from './registro.ts'

// ─── Hash de datos ───────────────────────────────────────────────────────────

function canonico(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
    .join(',')}}`
}

const normDoc = (d: string | null): string | null => (d ? d.toUpperCase().replace(/[\s.\-/]/g, '') || null : null)

/** SHA-256 canónico de lo que se autoriza. Cambia una coma del riesgo, un céntimo o el botón → otro hash. */
export function hashDatosEmision(d: DatosEmision): string {
  const base = {
    v: 1,
    compania: claveCompania(d.compania),
    ramo: String(d.ramo).trim().toLowerCase(),
    presupuestoId: String(d.presupuestoId).toLowerCase(),
    opcionId: String(d.opcionId).toLowerCase(),
    primaCents: d.primaCents,
    tomador: normDoc(d.tomadorDocumento),
    riesgo: d.riesgo ?? null,
    boton: { id: d.boton.id, texto: d.boton.texto },
  }
  return createHash('sha256').update(canonico(base), 'utf8').digest('hex')
}

// ─── Token de un solo uso ────────────────────────────────────────────────────

/** 32 bytes aleatorios (base64url). En claro solo viaja una vez, al worker; en BD solo su SHA-256. */
export function generarTokenEmision(): string {
  return randomBytes(32).toString('base64url')
}

export function hashTokenEmision(token: string): string {
  return createHash('sha256').update(String(token), 'utf8').digest('hex')
}

// ─── Firma de la pulsación de Telegram ───────────────────────────────────────

/** HMAC-SHA256 (hex) de la pulsación. Lanza sin secreto válido o con campos mal formados (fail-closed). */
export function firmarAutorizacionEmision(secreto: string, c: CamposFirmaAutorizacion): string {
  if (!secretoFirmaValido(secreto)) throw new Error(`${ENV_FIRMA_AUTORIZACION} ausente o corto (mín. 32)`)
  const v = camposFirmaAutorizacion(c)
  if (!v) throw new Error('campos de la autorización mal formados')
  return createHmac('sha256', secreto).update(canonicoFirma(v)).digest('hex')
}

/** Verifica la firma del cuerpo (`trabajoId, decision, hashCorto, autorizadoPor, ts, firma`) en tiempo constante. */
export function verificarFirmaAutorizacionEmision(secreto: string | null | undefined, cuerpo: unknown, ahoraMs: number): VerificacionFirma {
  if (!secretoFirmaValido(secreto)) return { ok: false, motivo: 'sin_secreto' }
  const c = camposFirmaAutorizacion(cuerpo)
  if (!c) return { ok: false, motivo: 'campos' }
  const firma = (cuerpo as { firma?: unknown }).firma
  if (typeof firma !== 'string' || !/^[0-9a-f]{64}$/.test(firma)) return { ok: false, motivo: 'sin_firma' }
  const esperada = Buffer.from(createHmac('sha256', secreto).update(canonicoFirma(c)).digest('hex'), 'hex')
  const recibida = Buffer.from(firma, 'hex')
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return { ok: false, motivo: 'firma_distinta' }
  const ahoraS = Math.floor(ahoraMs / 1000)
  if (c.ts > ahoraS + FUTURO_FIRMA_S) return { ok: false, motivo: 'futura' }
  if (ahoraS - c.ts > VENTANA_FIRMA_S) return { ok: false, motivo: 'caducada' }
  return { ok: true, campos: c }
}

// ─── Canje (espejo puro del UPDATE atómico de asegura) ───────────────────────

/**
 * Lo que decide el canje: el SQL (`UPDATE … WHERE token_hash = $ AND trabajo_id = $ AND consumido_at IS NULL AND
 * expira_at > now() AND hash_datos = $`) y esta función tienen que decir lo mismo (lo vigila el test).
 */
export function decidirCanje(f: FilaAutorizacion | null, p: { trabajoId: string; token: string | null | undefined; hashDatos: string; ahora: Date }): DecisionCanje {
  if (!f || !pareceTokenEmision(p.token) || !f.tokenHash) return { ok: false, motivo: 'sin_token' }
  if (f.trabajoId !== p.trabajoId) return { ok: false, motivo: 'otro_trabajo' }
  if (f.tokenHash !== hashTokenEmision(p.token)) return { ok: false, motivo: 'token_distinto' }
  if (f.consumidoAt) return { ok: false, motivo: 'ya_usado' }
  if (f.expiraAt.getTime() <= p.ahora.getTime()) return { ok: false, motivo: 'caducado' }
  if (f.hashDatos !== p.hashDatos) return { ok: false, motivo: 'hash_distinto' }
  return { ok: true }
}
