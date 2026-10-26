// Lo que la comparativa de la oportunidad sabe de cada PRECIO DE BOT (26/10/2026): ver `proyecto-comparativa-reglas.ts`.
// Solo lectura, todo por `correduria_id`. Sin la tabla de coberturas (SQL 2026-10-07c) o sin extracción: verificación `null`.
import { prisma } from './tenant'
import { esSinTablaFichas } from './tarificador-fichas-reglas'
import { claveRpaDeFila } from './presupuesto-rpa-reglas'
import { infoOfertaBot, type FilaBot, type InfoOfertaBot } from './proyecto-comparativa-reglas'
export type { InfoOfertaBot }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export async function infoOfertasBot(correduriaId: string, filas: readonly FilaBot[], hoy: string): Promise<InfoOfertaBot[]> {
  const bots = filas.filter((f) => claveRpaDeFila(f.datosExtra))
  if (bots.length === 0) return []
  const tid = (f: FilaBot) => txt(obj(f.datosExtra)?.tarificacionId)
  const ids = [...new Set(bots.map(tid).filter((x): x is string => x !== null))]
  const fecha = new Map<string, string>()
  const pdf = new Map<string, unknown>()
  if (ids.length > 0) {
    const t = await prisma.$queryRaw<{ id: string; dia: string }[]>`
      select id::text as id, to_char(created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as dia
      from seguros.tarificaciones where correduria_id = ${correduriaId}::uuid and id = any(${ids}::uuid[])`
    for (const r of t) fecha.set(r.id, r.dia)
    try {
      const c = await prisma.$queryRaw<{ tarificacion_id: string; p: unknown }[]>`
        select tarificacion_id::text as tarificacion_id, valores->'proyectoPdf' as p
        from seguros.tarificador_coberturas_presupuesto
        where correduria_id = ${correduriaId}::uuid and tarificacion_id = any(${ids}::uuid[])`
      for (const r of c) pdf.set(r.tarificacion_id, r.p)
    } catch (e) {
      if (!esSinTablaFichas(e)) throw e
    }
  }
  return bots.flatMap((f) => {
    const k = tid(f)
    const i = infoOfertaBot(f, k ? { guardadoEn: fecha.get(k) ?? null, proyectoPdf: pdf.get(k) ?? null } : null, hoy)
    return i ? [i] : []
  })
}
