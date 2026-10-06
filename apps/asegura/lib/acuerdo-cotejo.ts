// Cotejar un acuerdo con su documento original (fase 2, 06/10/2026): Alberto pulsa
// «Coincide con el PDF» en la ficha de la compañía y se sella `revisado_at`.
// Hasta entonces el acuerdo es un extracto SIN COTEJAR y ningún objetivo suyo se
// pinta en color (`evaluarObjetivo` → `sin_cotejar`).
//
// Solo SELLA: no deshace un cotejo ni lo re-sella (el primer cotejo es el que
// vale). Filtra SIEMPRE por `correduriaId`: con BYPASSRLS, un id de otra
// correduría se sellaría sin dar error.

import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultadoCotejo =
  | { estado: 'cotejado'; revisadoAt: string }
  | { estado: 'ya_cotejado'; revisadoAt: string }
  | { estado: 'no_encontrado' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: CausaErrorCartera }

export async function cotejarAcuerdo(correduriaId: string, acuerdoId: unknown, ahora: Date = new Date()): Promise<ResultadoCotejo> {
  if (typeof acuerdoId !== 'string' || !UUID.test(acuerdoId)) return { estado: 'invalido', motivo: 'acuerdoId no es un uuid' }
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const r = await db.acuerdoCompania.updateMany({
      where: { id: acuerdoId, correduriaId, revisadoAt: null },
      data: { revisadoAt: ahora, updatedAt: ahora },
    })
    if (r.count === 1) return { estado: 'cotejado', revisadoAt: ahora.toISOString() }
    const existente = await db.acuerdoCompania.findFirst({
      where: { id: acuerdoId, correduriaId },
      select: { revisadoAt: true },
    })
    if (!existente) return { estado: 'no_encontrado' }
    return { estado: 'ya_cotejado', revisadoAt: (existente.revisadoAt ?? ahora).toISOString() }
  } catch (e) {
    return { estado: 'error', causa: registrarErrorCartera('operador/companias/acuerdo/cotejar', e) }
  }
}
