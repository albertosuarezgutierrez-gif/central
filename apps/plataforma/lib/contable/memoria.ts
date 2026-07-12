// apps/plataforma/lib/contable/memoria.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Aprendizaje } from './parse'

export type MemoriaRow = { clave: string; insight: string }
export type TurnoRow = { rol: string; mensaje: string }

// Prefijo de clave para los sinónimos de negocio APRENDIDOS por el clasificador IA. Se guardan en la
// MISMA tabla contable_memoria (sin migración nueva), pero se excluyen del contexto del LLM: no son
// "hábitos" que contarle al modelo, son vocabulario para el router determinista.
const PREFIJO_SINONIMO = 'sinonimo_negocio:'

export async function getMemoria(cuentaId: string): Promise<MemoriaRow[]> {
  return prisma.$queryRaw<MemoriaRow[]>(Prisma.sql`
    SELECT clave, insight FROM contable_memoria
    WHERE cuenta_id = ${cuentaId}::uuid AND clave NOT LIKE ${PREFIJO_SINONIMO + '%'}
    ORDER BY updated_at DESC LIMIT 40`).catch(() => [])
}

// Sinónimos de negocio aprendidos → forma que consume detectarIntencion (`extras`). Una palabra que
// la IA resolvió una vez a un segmento pasa a ser determinista (instantánea y gratis) la próxima.
export async function getSinonimosNegocio(
  cuentaId: string,
): Promise<{ etiqueta: string; destinos: string[]; terminos: string[] }[]> {
  const rows = await prisma.$queryRaw<{ clave: string; insight: string }[]>(Prisma.sql`
    SELECT clave, insight FROM contable_memoria
    WHERE cuenta_id = ${cuentaId}::uuid AND clave LIKE ${PREFIJO_SINONIMO + '%'}
    ORDER BY updated_at DESC LIMIT 200`).catch(() => [])
  const out: { etiqueta: string; destinos: string[]; terminos: string[] }[] = []
  for (const r of rows) {
    const termino = r.clave.slice(PREFIJO_SINONIMO.length)
    try {
      const v = JSON.parse(r.insight) as { destinos?: unknown; etiqueta?: unknown }
      const destinos = Array.isArray(v.destinos) ? v.destinos.filter((d): d is string => typeof d === 'string') : []
      if (termino && destinos.length) {
        out.push({ terminos: [termino], destinos, etiqueta: typeof v.etiqueta === 'string' ? v.etiqueta : termino })
      }
    } catch { /* fila mal formada: ignorar */ }
  }
  return out
}

// Aprende (upsert) que `termino` (una palabra que Alberto usó) se refiere a estos `destinos`.
export async function guardarSinonimoNegocio(
  cuentaId: string, termino: string, destinos: string[], etiqueta: string,
): Promise<void> {
  const t = termino.trim().toLowerCase().slice(0, 40)
  if (!t || !destinos.length) return
  const insight = JSON.stringify({ destinos, etiqueta })
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO contable_memoria (cuenta_id, clave, insight, metricas, updated_at)
    VALUES (${cuentaId}::uuid, ${PREFIJO_SINONIMO + t}, ${insight},
            ${JSON.stringify({ source: 'clasificador-ia', at: new Date().toISOString() })}::jsonb, now())
    ON CONFLICT (cuenta_id, clave) DO UPDATE
    SET insight = EXCLUDED.insight, updated_at = now()`).catch(() => {})
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

// Registra un 👎: Alberto marca una respuesta como mala (pregunta + respuesta + nota opcional). Es la
// entrada del bucle de mejora: el entrenador (o una sesión) lo convierte en cobertura nueva + test.
export async function guardarFeedback(
  cuentaId: string, pregunta: string, respuesta: string, nota?: string,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO contable_feedback (cuenta_id, pregunta, respuesta, nota)
    VALUES (${cuentaId}::uuid, ${pregunta.slice(0, 2000)}, ${respuesta.slice(0, 4000)}, ${nota ? nota.slice(0, 2000) : null})`).catch(() => {})
}
