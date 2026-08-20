// lib/sivra/agente-huesped/hechos.ts — hechos permanentes del piso.
//
// `mensajes_aprendizaje` guarda EJEMPLOS DE ESTILO (tono, cortesías) y solo se inyectan los 8
// últimos del piso. Eso está bien para el tono y fatal para el conocimiento: el único hecho real que
// Alberto llegó a enseñar («las llaves se dejan en la mesa alta de la cocina», 20/07/2026) quedó
// sepultado bajo los «gracias a ti» y el agente lo perdió. Los HECHOS viven aquí, no caducan y van
// TODOS al prompt.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export type Hecho = { id: number; pregunta: string; hecho: string; origen: string }

const MAX_HECHOS = 40

// Hechos CONFIRMADOS del piso, del más reciente al más antiguo. El tope existe para no reventar el
// prompt; si algún piso llegara a acercarse, es señal de que esos hechos deberían estar en la guía.
export async function listarHechos(propertyId: string): Promise<Hecho[]> {
  return await prisma.$queryRaw<Hecho[]>(Prisma.sql`
    SELECT id::int AS id, pregunta, hecho, origen FROM mensajes_hechos
    WHERE property_id = ${propertyId} AND estado = 'confirmado'
    ORDER BY created_at DESC LIMIT ${MAX_HECHOS}
  `).catch(() => [])
}

// Guarda un hecho. `estado` = 'confirmado' cuando lo enseña Alberto; 'propuesto' cuando sale del
// minado del histórico y todavía tiene que confirmarlo (un hecho falso aprendido del histórico se
// propagaría a TODOS los huéspedes futuros).
export async function guardarHecho(p: {
  propertyId: string
  pregunta: string
  hecho: string
  origen?: 'alberto' | 'historico'
  estado?: 'confirmado' | 'propuesto'
  bookingRef?: string
}): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    INSERT INTO mensajes_hechos (property_id, pregunta, hecho, origen, estado, booking_ref)
    VALUES (${p.propertyId}, ${(p.pregunta || '').slice(0, 300)}, ${p.hecho}, ${p.origen || 'alberto'},
            ${p.estado || 'confirmado'}, ${p.bookingRef || null})
    ON CONFLICT (property_id, md5(lower(hecho))) DO NOTHING
    RETURNING id::int AS id
  `).catch(() => [])
  return rows[0]?.id ?? null
}

// Confirma o descarta un hecho propuesto (botones de Telegram del minado del histórico).
export async function resolverHecho(id: number, estado: 'confirmado' | 'descartado'): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ hecho: string }[]>(Prisma.sql`
    UPDATE mensajes_hechos SET estado = ${estado} WHERE id = ${id} AND estado = 'propuesto'
    RETURNING hecho
  `).catch(() => [])
  return rows[0]?.hecho ?? null
}
