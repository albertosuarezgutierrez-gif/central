// lib/sivra/agente-huesped/graduacion.ts
// Auto-graduación de categorías básicas: cuando una categoría acumula N respuestas
// aprobadas SIN corrección, pasa a auto-responderse sola (mensajes_auto_config).
// SOLO se gradúan las categorías de la ALLOWLIST `GRADUABLES`: el catch-all 'general'
// y cualquier categoría sensible NUNCA se gradúan (Fase 1: Alberto revisa todo).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const N_APROBACIONES = 5
// Allowlist estricta de categorías básicas auto-graduables (coincide con telegram-msg.ts).
// Antes se usaba una blocklist de sensibles, pero 'general' (catch-all donde cae casi todo)
// no estaba bloqueado → tras 5 aprobaciones se graduó y empezó a auto-enviar TODO sin revisar.
const GRADUABLES = new Set(['wifi', 'acceso', 'checkin', 'checkout', 'parking', 'normas', 'contacto', 'faq'])

export async function graduarCategoria(categoria: string, on = true, umbral = 0.85): Promise<void> {
  if (!categoria || !GRADUABLES.has(categoria)) return
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_auto_config (categoria, auto_enabled, umbral)
    VALUES (${categoria}, ${on}, ${umbral})
    ON CONFLICT (categoria) DO UPDATE SET auto_enabled = ${on}
  `).catch(() => {})
}

// Tras una aprobación sin corregir, comprueba si la categoría ya es fiable y la gradúa.
export async function evaluarGraduacion(categoria: string): Promise<boolean> {
  if (!categoria || !GRADUABLES.has(categoria)) return false
  // ¿Ya está habilitada? entonces nada que hacer.
  const cfg = await prisma.$queryRaw<{ auto_enabled: boolean }[]>(Prisma.sql`
    SELECT auto_enabled FROM mensajes_auto_config WHERE categoria = ${categoria} LIMIT 1
  `)
  if (cfg[0]?.auto_enabled) return true

  // Últimas N resoluciones de la categoría: todas deben ser aprobadas sin corregir y no negativas.
  const ultimas = await prisma.$queryRaw<{ edited: boolean; sentimiento: string | null }[]>(Prisma.sql`
    SELECT edited, sentimiento FROM mensajes_log
    WHERE categoria = ${categoria}
    ORDER BY created_at DESC
    LIMIT ${N_APROBACIONES}
  `)
  if (ultimas.length < N_APROBACIONES) return false
  const todasLimpias = ultimas.every(r => r.edited === false && r.sentimiento !== 'negativo')
  if (!todasLimpias) return false

  await graduarCategoria(categoria, true)
  return true
}
