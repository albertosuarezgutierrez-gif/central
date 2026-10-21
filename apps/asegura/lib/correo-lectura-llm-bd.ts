// apps/asegura/lib/correo-lectura-llm-bd.ts
//
// Guarda la lectura del extractor LLM en MODO SOMBRA (F2 del agente de correo, 21/10/2026). Una fila por correo
// (`correo_lectura_llm_unica`): releer el mismo correo no escribe dos veces. NO toca la cartera: ni pólizas, ni recibos,
// ni tareas, ni historial. Sin la migración `2026-10-21b_correo_lectura_llm.sql` → `sin_migracion`.

import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { esTablaInexistente } from './correo-avisos-intranet'
import type { EntradaLecturaLLM } from './correo-lectura-llm'

export const SQL_LECTURA_LLM = '2026-10-21b_correo_lectura_llm.sql'

export type ResultadoGuardarLectura =
  | { ok: true; repetido: boolean }
  | { ok: false; estado: 'sin_migracion'; motivo: string }

export async function guardarLecturaLLM(correduriaId: string, e: EntradaLecturaLLM): Promise<ResultadoGuardarLectura> {
  const db = prismaAsegura()
  try {
    const filas = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into correo_lectura_llm (correduria_id, mensaje_id, proposito, modo, modelo, tipo, confianza, ficha, no_literales,
                                      lector_tipo, comparacion, aciertos, fallos)
      values (${correduriaId}::uuid, ${e.mensajeId}, ${e.proposito}, 'sombra', ${e.modelo}, ${e.ficha?.tipo ?? null},
              ${e.ficha?.confianza ?? null}, ${e.ficha ? JSON.stringify(e.ficha) : null}::jsonb, ${e.noLiterales}::text[],
              ${e.comparacion?.tipoLector ?? null}, ${e.comparacion ? JSON.stringify(e.comparacion.campos) : null}::jsonb,
              ${e.comparacion?.aciertos ?? null}, ${e.comparacion?.fallos ?? null})
      on conflict (correduria_id, mensaje_id) do nothing
      returning id::text as id`)
    return { ok: true, repetido: filas.length === 0 }
  } catch (err) {
    if (esTablaInexistente(err)) return { ok: false, estado: 'sin_migracion', motivo: `falta aplicar ${SQL_LECTURA_LLM}` }
    throw err
  }
}
