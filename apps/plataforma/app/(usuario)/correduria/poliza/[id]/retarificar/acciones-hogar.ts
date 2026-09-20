'use server'

// La precalificación de HOGAR de una póliza ya existente. Aparte de
// `acciones.ts` (auto) por el tipo que devuelve, pero misma disciplina: es un
// `GET` gratis, así que no necesita ninguna de las cautelas de dinero de sus
// vecinas.

import {
  precalificarHogarRetarificarAsegura,
  type RespuestaPrecalificacionHogar,
} from '@/lib/hogar-retarificar-asegura'

export async function pedirPrecalificacionHogar(entrada: {
  polizaId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaPrecalificacionHogar> {
  return precalificarHogarRetarificarAsegura(entrada)
}
