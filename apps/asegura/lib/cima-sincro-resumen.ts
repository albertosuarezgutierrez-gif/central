// Resumen diario de la sincro ficha ↔ CIMA (03/10/2026), para poder DIAGNOSTICAR el aviso sin descifrar
// nada: el cron de plataforma lo manda al puerto y aquí se guarda en `operational_events`
// (`cima_sincro_resumen`). Solo nº de póliza, campo y motivo/tipo: NUNCA un valor, un nombre ni un DNI.

import { z } from 'zod'
import { CAMPOS_CIMA } from '@central/module-seguros'

export const EVENTO_RESUMEN_SINCRO = 'cima_sincro_resumen'
const TOPE = 500

const campo = z.enum(CAMPOS_CIMA as unknown as [string, ...string[]])
const poliza = z.string().trim().min(1).max(60).nullable()

export const resumenSchema = z.object({
  copiados: z.array(z.object({ poliza, campo, motivo: z.enum(['hueco', 'nuevo', 'mas_completo', 'formato', 'errata']) }).strict()).max(TOPE),
  conflictos: z.array(z.object({ poliza, campo, tipo: z.enum(['distinto', 'aviso']) }).strict()).max(TOPE),
}).strict()
export type ResumenSincro = z.infer<typeof resumenSchema>

export function validarResumen(body: unknown): { ok: true; datos: ResumenSincro } | { ok: false } {
  const r = resumenSchema.safeParse(body)
  return r.success ? { ok: true, datos: r.data } : { ok: false }
}
