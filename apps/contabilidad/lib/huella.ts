// Huellas SHA-256 de contenido canónico (claves ordenadas). Solo SERVIDOR (node:crypto).
import { createHash } from 'node:crypto'

function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => [k, canonico((v as Record<string, unknown>)[k])]))
  }
  return v
}

export const jsonCanonico = (v: unknown): string => JSON.stringify(canonico(v))

export const sha256 = (texto: string): string => createHash('sha256').update(texto).digest('hex')

export const huella = (v: unknown): string => sha256(jsonCanonico(v))
