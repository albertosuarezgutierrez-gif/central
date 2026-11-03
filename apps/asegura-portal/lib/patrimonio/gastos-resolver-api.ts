// PATRIMONIO (27/10/2026) — confirmar o descartar un gasto `propuesto` GENERADO (cron mensual de plantillas, cuotas de
// derrama). Las facturas leídas con IA tienen su propio PATCH (`facturas-api.ts`). Reglas PURAS con puertos, sin prisma.
//
//  · Solo quien puede GESTIONAR ese titular (`gestionar_gastos_documentos`); titular ajeno o sin nivel = la MISMA 404.
//  · Cuerpo estricto: `titular` y `gasto` (uuid), `accion` = confirmar|descartar, `importeCent` entero > 0 o ausente.
//  · «Descartar» es el estado `descartado` (no hay DELETE). Idempotente: lo ya confirmado/descartado no cambia (409).
//  · Un gasto de importe variable (`null`) no se puede confirmar sin importe (CHECK de BD): 400 `importe_requerido`.
import { puede } from '@central/module-patrimonio'

import type { AccesosMapa, Respuesta } from './gastos-api.ts'

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (c: unknown) => (c && typeof c === 'object' ? c : {}) as Record<string, unknown>

export type ResultadoResolver = 'ok' | 'no_encontrado' | 'ya_resuelto' | 'importe_requerido'

export interface PuertosResolverGasto {
  accesos(): Promise<AccesosMapa>
  /** Solo se llama con un `clienteId` que salió de `accesos()` con nivel de gestión. Busca el gasto DENTRO de ese titular. */
  resolver(x: { clienteId: string; gastoId: string; accion: 'confirmar' | 'descartar'; importeCent: number | null }): Promise<ResultadoResolver>
}

export async function responderResolverGasto(p: PuertosResolverGasto, cuerpo: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const b = obj(cuerpo)
  const titular = b.titular
  if (typeof titular !== 'string' || !accesos.has(titular) || !puede(accesos.get(titular), 'gestionar_gastos_documentos')) return NO_ENCONTRADO
  if (typeof b.gasto !== 'string' || !UUID.test(b.gasto)) return NO_ENCONTRADO
  if (b.accion !== 'confirmar' && b.accion !== 'descartar') return { status: 400, body: { error: 'datos_invalidos', campo: 'accion' } }
  let importeCent: number | null = null
  if (b.importeCent !== undefined && b.importeCent !== null) {
    if (typeof b.importeCent !== 'number' || !Number.isSafeInteger(b.importeCent) || b.importeCent <= 0) return { status: 400, body: { error: 'datos_invalidos', campo: 'importe' } }
    importeCent = b.importeCent
  }
  const r = await p.resolver({ clienteId: titular, gastoId: b.gasto, accion: b.accion, importeCent: b.accion === 'confirmar' ? importeCent : null })
  if (r === 'no_encontrado') return NO_ENCONTRADO
  if (r === 'ya_resuelto') return { status: 409, body: { error: 'ya_resuelto' } }
  if (r === 'importe_requerido') return { status: 400, body: { error: 'datos_invalidos', campo: 'importe', motivo: 'importe_requerido' } }
  return { status: 200, body: { id: b.gasto } }
}
