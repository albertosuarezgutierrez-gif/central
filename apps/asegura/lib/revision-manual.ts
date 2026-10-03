// Bandeja de REVISIÓN MANUAL de pólizas (03/10/2026). Parte PURA: forma de los eventos y validación
// del POST. Sin tabla nueva: los casos viven en `seguros.operational_events`.
//
//   abrir    → event_name 'poliza_revision_manual'   payload { poliza_ids: string[], numero, motivo }
//   resolver → event_name 'poliza_revision_resuelta' payload { caso_id, decision, nota? }
//
// Caso ABIERTO = sin resolución posterior. «Son la misma» NO fusiona: solo registra la decisión; la
// fusión la aplica después una sesión con el método CTE y el OK de Alberto.

import { z } from 'zod'

export const EVENTO_ABRIR = 'poliza_revision_manual'
export const EVENTO_RESOLVER = 'poliza_revision_resuelta'
export const DECISIONES = ['misma', 'distintas', 'descartar'] as const
export type DecisionRevision = (typeof DECISIONES)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Cuerpo del POST. `casoId` es el id del evento que abrió el caso. */
export const resolverSchema = z.object({
  // Minúsculas: `source_event_id` (idempotencia) y `payload->>'caso_id'` se comparan como texto contra `e.id::text`.
  casoId: z.string().regex(UUID).transform((s) => s.toLowerCase()),
  decision: z.enum(DECISIONES),
  nota: z.string().trim().max(500).optional(),
})
export type ResolverEntrada = z.infer<typeof resolverSchema>

export function validarResolver(body: unknown): { ok: true; datos: ResolverEntrada } | { ok: false; motivo: string } {
  const r = resolverSchema.safeParse(body)
  if (!r.success) return { ok: false, motivo: 'casoId (uuid) y decision (misma | distintas | descartar) son obligatorios' }
  return { ok: true, datos: r.data }
}

export type PayloadCaso = { polizaIds: string[]; numero: string; motivo: string }

/** Lee el payload de un caso abierto. Una forma rara → `null` (el caso no se pinta a medias). */
export function leerPayloadCaso(payload: unknown): PayloadCaso | null {
  if (typeof payload !== 'object' || payload === null) return null
  const o = payload as Record<string, unknown>
  if (!Array.isArray(o.poliza_ids)) return null
  const ids = o.poliza_ids.filter((x): x is string => typeof x === 'string' && UUID.test(x))
  if (ids.length === 0 || ids.length !== o.poliza_ids.length) return null
  return {
    polizaIds: ids,
    numero: typeof o.numero === 'string' ? o.numero.slice(0, 100) : '',
    motivo: typeof o.motivo === 'string' ? o.motivo.slice(0, 300) : '',
  }
}

/** Payload del evento de resolución, tal como se guarda. */
export function payloadResolucion(d: ResolverEntrada): { caso_id: string; decision: DecisionRevision; nota?: string } {
  return { caso_id: d.casoId, decision: d.decision, ...(d.nota ? { nota: d.nota } : {}) }
}
