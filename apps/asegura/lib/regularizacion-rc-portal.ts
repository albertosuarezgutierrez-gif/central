/**
 * Regularización de RC (03/11/2026), lado PORTAL (lo que llega por el puente con el token). Sin BD directa: recibe un
 * `RepoRegularizacionToken` (la implementación Prisma vive en `regularizacion-rc.ts`; los tests usan una en memoria), así
 * que el aislamiento por token se prueba de verdad (`regularizacion-rc-portal.test.ts`).
 *
 * 🚨 Aislamiento (lo da el CÓDIGO: asegura conecta con BYPASSRLS y el portal sin sesión):
 *  - La fila sale SOLO del hash del token. Ningún id (póliza, cliente, solicitud) entra desde la request.
 *  - Toda escritura va condicionada por `id` de la fila leída Y el MISMO `token_hash` Y `estado = 'pendiente'` Y sin caducar:
 *    un token no puede completar otra solicitud ni una ya completada (de un solo uso).
 *  - Lo que vuelve al portal NO lleva nada de la póliza ni del cliente: ni nº, ni nombre, ni importe guardado. Solo el
 *    periodo y el nombre de la compañía (para que el formulario se entienda). `vistaPublica` es la ÚNICA salida.
 */
import { createHash } from 'node:crypto'
import {
  nombreCompania,
  normalizarPeriodoRegularizacion,
  validarRespuestaRegularizacion,
  type PeriodoRegularizacion,
  type RespuestaRegularizacion,
} from '@central/module-seguros/regularizacion-rc'

export const RE_TOKEN_REGULARIZACION = /^[A-Za-z0-9_-]{40,60}$/

export function hashTokenRegularizacion(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** La fila tal como la lee el lado del token (por `token_hash`). */
export type FilaRegularizacionToken = {
  id: string
  correduriaId: string
  polizaId: string
  clienteId: string
  compania: string
  periodoDesde: string
  periodoHasta: string
  estado: string
  caduca: Date | null
  documentoId: string | null
}

export interface RepoRegularizacionToken {
  porTokenHash(hash: string): Promise<FilaRegularizacionToken | null>
  /** UPDATE … WHERE id AND correduria_id AND token_hash AND estado='pendiente' AND caduca_at > now(). Devuelve filas tocadas. */
  completar(f: { id: string; correduriaId: string; tokenHash: string; respuestaCifrada: string }): Promise<number>
  /** Igual de condicionado: solo una pendiente viva SIN documento todavía. */
  fijarDocumento(f: { id: string; correduriaId: string; tokenHash: string; documentoId: string }): Promise<number>
}

/** Lo ÚNICO que ve la página pública. */
export type VistaPublicaRegularizacion =
  | { estado: 'ok'; motivo: 'regularizacion_rc'; periodo: PeriodoRegularizacion; compania: string; documento: boolean }
  | { estado: 'completada'; motivo: 'regularizacion_rc' }
  | { estado: 'muerta' }

function viva(f: FilaRegularizacionToken, ahora: Date): boolean {
  return f.estado === 'pendiente' && f.caduca !== null && f.caduca.getTime() > ahora.getTime()
}

/** Fila → lo que puede salir por el puente. PURA. Un periodo ilegible = muerta (no se pinta un formulario a medias). */
export function vistaPublica(f: FilaRegularizacionToken | null, ahora = new Date()): VistaPublicaRegularizacion {
  if (!f) return { estado: 'muerta' }
  if (f.estado === 'completada') return { estado: 'completada', motivo: 'regularizacion_rc' }
  if (!viva(f, ahora)) return { estado: 'muerta' }
  const periodo = normalizarPeriodoRegularizacion(f.periodoDesde, f.periodoHasta)
  if (!periodo) return { estado: 'muerta' }
  return { estado: 'ok', motivo: 'regularizacion_rc', periodo, compania: nombreCompania(f.compania), documento: f.documentoId !== null }
}

/** `null` = el token no es de una regularización (el puente prueba entonces la solicitud de presupuesto). */
export async function regularizacionPorToken(repo: RepoRegularizacionToken, token: string, ahora = new Date()): Promise<VistaPublicaRegularizacion | null> {
  if (!RE_TOKEN_REGULARIZACION.test(token)) return null
  const f = await repo.porTokenHash(hashTokenRegularizacion(token))
  return f ? vistaPublica(f, ahora) : null
}

export type ResultadoRespuestaRegularizacion =
  | { ok: true; fila: FilaRegularizacionToken; respuesta: RespuestaRegularizacion }
  | { ok: false; estado: 'muerta' | 'completada' }
  | { ok: false; estado: 'errores'; errores: Record<string, string> }

/**
 * El cliente contesta. Se valida, se cifra y se completa con UNA sentencia condicionada (un doble envío = el segundo es
 * `completada`). El aviso a Alberto lo manda quien llama, con la fila devuelta.
 */
export async function responderRegularizacionConRepo(
  repo: RepoRegularizacionToken,
  token: string,
  entrada: unknown,
  cifrar: (claro: string) => string,
  ahora = new Date(),
): Promise<ResultadoRespuestaRegularizacion> {
  if (!RE_TOKEN_REGULARIZACION.test(token)) return { ok: false, estado: 'muerta' }
  const hash = hashTokenRegularizacion(token)
  const f = await repo.porTokenHash(hash)
  if (!f) return { ok: false, estado: 'muerta' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (!viva(f, ahora)) return { ok: false, estado: 'muerta' }
  const v = validarRespuestaRegularizacion(entrada)
  if (!v.ok) return { ok: false, estado: 'errores', errores: v.errores as Record<string, string> }
  const n = await repo.completar({ id: f.id, correduriaId: f.correduriaId, tokenHash: hash, respuestaCifrada: cifrar(JSON.stringify(v.respuesta)) })
  if (n !== 1) return { ok: false, estado: 'completada' }
  return { ok: true, fila: f, respuesta: v.respuesta }
}

/** Lee la respuesta cifrada. `null` = ilegible (clave PII distinta o forma rara): nunca se inventa un 0. PURA salvo `descifrar`. */
export function leerRespuestaCifrada(v: string | null, descifrar: (c: string) => string): RespuestaRegularizacion | null {
  if (v === null) return null
  try {
    const o = JSON.parse(descifrar(v)) as Record<string, unknown>
    const entero = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null)
    const fact = entero(o.facturacionCent)
    if (fact === null) return null
    return { facturacionCent: fact, empleados: entero(o.empleados), masaSalarialCent: entero(o.masaSalarialCent) }
  } catch {
    return null
  }
}
