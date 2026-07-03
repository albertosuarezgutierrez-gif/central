// apps/plataforma/lib/contable/memoria.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Aprendizaje } from './parse'

export type MemoriaRow = { clave: string; insight: string }
export type TurnoRow = { rol: string; mensaje: string }

export async function getMemoria(cuentaId: string): Promise<MemoriaRow[]> {
  return prisma.$queryRaw<MemoriaRow[]>(Prisma.sql`
    SELECT clave, insight FROM contable_memoria
    WHERE cuenta_id = ${cuentaId}::uuid
    ORDER BY updated_at DESC LIMIT 40`).catch(() => [])
}

export async function guardarInsight(cuentaId: string, a: Aprendizaje): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO contable_memoria (cuenta_id, clave, insight, metricas, updated_at)
    VALUES (${cuentaId}::uuid, ${a.clave}, ${a.insight},
            ${JSON.stringify({ source: 'chat', at: new Date().toISOString() })}::jsonb, now())
    ON CONFLICT (cuenta_id, clave) DO UPDATE
    SET insight = EXCLUDED.insight, metricas = EXCLUDED.metricas, updated_at = now()`).catch(() => {})
}

// Historial en orden cronológico (los N más recientes, ascendente).
export async function getHistorial(cuentaId: string, n = 8): Promise<TurnoRow[]> {
  const rows = await prisma.$queryRaw<TurnoRow[]>(Prisma.sql`
    SELECT rol, mensaje FROM contable_log
    WHERE cuenta_id = ${cuentaId}::uuid AND mensaje IS NOT NULL
    ORDER BY created_at DESC LIMIT ${n}`).catch(() => [])
  return rows.reverse()
}

export async function logTurno(
  cuentaId: string, canal: string, rol: 'user' | 'assistant', mensaje: string,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO contable_log (cuenta_id, canal, rol, mensaje)
    VALUES (${cuentaId}::uuid, ${canal}, ${rol}, ${mensaje})`).catch(() => {})
}
