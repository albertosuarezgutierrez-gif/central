// lib/sivra/agente-huesped/graduacion.ts
// Auto-graduación de categorías básicas: cuando una categoría acumula N respuestas
// aprobadas SIN corrección, pasa a auto-responderse sola (mensajes_auto_config).
// Las categorías sensibles NUNCA se gradúan.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const N_APROBACIONES = 5
const SENSIBLES = new Set(['queja', 'incidencia', 'reembolso', 'cambio_fechas', 'emergencia', 'recomendacion'])

export async function graduarCategoria(categoria: string, on = true, umbral = 0.85): Promise<void> {
  if (!categoria || SENSIBLES.has(categoria)) return
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_auto_config (categoria, auto_enabled, umbral)
    VALUES (${categoria}, ${on}, ${umbral})
    ON CONFLICT (categoria) DO UPDATE SET auto_enabled = ${on}
  `).catch(() => {})
}

// Tras una aprobación sin corregir, comprueba si la categoría ya es fiable y la gradúa.
export async function evaluarGraduacion(categoria: string): Promise<boolean> {
  if (!categoria || SENSIBLES.has(categoria)) return false
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
