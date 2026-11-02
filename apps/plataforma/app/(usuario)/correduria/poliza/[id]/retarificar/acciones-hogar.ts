'use server'

// La precalificación de HOGAR de una póliza ya existente. Aparte de
// `acciones.ts` (auto) por el tipo que devuelve, pero misma disciplina: es un
// `GET` gratis, así que no necesita ninguna de las cautelas de dinero de sus
// vecinas.

import { limitesHogarAsegura, type RespuestaLimitesHogar } from '@/lib/retarificar-asegura'
import {
  precalificarHogarRetarificarAsegura,
  type RespuestaPrecalificacionHogar,
} from '@/lib/hogar-retarificar-asegura'
import { exigirCorreduria } from '@/lib/correduria-acceso'

// 🚨 Una acción de servidor es un POST que no pasa por el layout: cada export exige la correduría
// (cepo `test/regression-correduria-acciones-guarda.test.ts`).
const SIN_ACCESO = 'No tienes acceso a la correduría.'

export async function pedirPrecalificacionHogar(entrada: {
  polizaId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  referencia?: string
}): Promise<RespuestaPrecalificacionHogar> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'sin_configurar', mensaje: SIN_ACCESO }
  return precalificarHogarRetarificarAsegura(entrada)
}

/**
 * IMPORTANTE: **Pide a Codeoscopic los capitales recomendados** (`POST /home/recommend-limits`).
 * No es gratis de forma confirmada: asegura la cuenta en el libro de consumo y la
 * pone detrás del interruptor de tarificar. Solo se llama desde un botón.
 */
export async function pedirLimitesHogar(entrada: {
  polizaId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  referencia?: string
}): Promise<RespuestaLimitesHogar> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'sin_configurar', mensaje: SIN_ACCESO }
  return limitesHogarAsegura(entrada)
}
