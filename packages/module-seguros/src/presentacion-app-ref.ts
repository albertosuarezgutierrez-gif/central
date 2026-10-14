// El identificador OPACO del enlace `?r=` de la campaña «presentación de la app».
//
// 🔒 En la BD solo se guarda su HASH (`campana_envio.ref_hash`); en claro solo existe dentro del correo.
// Es SHA-256 sin pimienta a propósito: son 128 bits aleatorios (no hay diccionario que probar) y así las
// DOS apps (asegura lo crea, el portal lo resuelve) calculan lo mismo sin compartir otro secreto más.
// No es el `cliente_id` ni se deriva de él: quien vea el enlace no aprende a quién se mandó.
import { createHash, randomBytes } from 'node:crypto'

import { esRefValido } from './presentacion-app.ts'

export function generarRef(): string {
  return randomBytes(16).toString('base64url')
}

/** `null` si no tiene forma de ref (no se hashea basura). */
export function hashRef(ref: unknown): string | null {
  if (!esRefValido(ref)) return null
  return createHash('sha256').update(ref).digest('hex')
}
