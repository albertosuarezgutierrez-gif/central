// Aprendizaje de las propuestas de WhatsApp: las CONSULTAS (las reglas puras están en `aprendizaje-reglas.ts`).
// Tabla `whatsapp_aprendizaje` (SQL 2026-11-04b). Fail-closed sin ella: registrar es no-op, los casos son `null`
// (= «no se pudo leer», nunca «no hay») y la racha es `null` (= nunca autónomo).
// 🛡️ Toda sentencia filtra `correduria_id`.

import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import { calcularRacha, type CasoAprendido, type EventoRacha, type Resolucion } from './aprendizaje-reglas'
import type { TipoPropuesta } from './propuestas-reglas'

const faltaMigracion = (e: unknown) => esTablaAusente(e) || esColumnaAusente(e)

/** Cuántas resoluciones se leen para la racha / los casos. Basta con que supere el umbral máximo razonable. */
const LECTURA_RACHA = 300
const LECTURA_CASOS = 200

function silencioso(donde: string, e: unknown): void {
  if (!faltaMigracion(e)) console.error(`[whatsapp-ia] aprendizaje (${donde}):`, e instanceof Error ? e.name : 'error')
}

/** Al crear la propuesta: su contexto (ya redactado). Best effort, nunca lanza. */
export async function registrarContexto(
  correduriaId: string,
  c: { propuestaId: string; conversacionId: string; tipo: TipoPropuesta; origenSaliente: string | null; extracto: string | null; propuesto: { fecha?: string } },
): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into whatsapp_aprendizaje (correduria_id, propuesta_id, conversacion_id, tipo, origen_saliente, extracto, propuesta_original)
      select ${correduriaId}::uuid, ${c.propuestaId}::uuid, ${c.conversacionId}::uuid, ${c.tipo}, ${c.origenSaliente?.slice(0, 40) ?? null},
             ${c.extracto?.slice(0, 300) ?? null}, ${JSON.stringify(c.propuesto)}::jsonb
       where exists (select 1 from whatsapp_propuestas where id = ${c.propuestaId}::uuid and correduria_id = ${correduriaId}::uuid)
      on conflict (propuesta_id) where propuesta_id is not null do nothing`)
  } catch (e) {
    silencioso('contexto', e)
  }
}

/** Al resolver (✅/✏️/❌ o aplicada sola). Upsert: si la fila de contexto no existe (SQL aplicado después), la crea. */
export async function registrarResolucion(
  correduriaId: string,
  r: {
    propuestaId: string; tipo: TipoPropuesta; resolucion: Resolucion; autonoma: boolean; actor: string
    propuesto: { fecha?: string }; final: { fecha?: string } | null; observacion: string | null
  },
): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into whatsapp_aprendizaje (correduria_id, propuesta_id, conversacion_id, tipo, propuesta_original, version_final, observacion,
                                        resolucion, autonoma, resuelta_at, resuelta_por)
      select ${correduriaId}::uuid, w.id, w.conversacion_id, ${r.tipo}, ${JSON.stringify(r.propuesto)}::jsonb,
             ${r.final ? JSON.stringify(r.final) : null}::jsonb, ${r.observacion?.slice(0, 300) ?? null},
             ${r.resolucion}, ${r.autonoma}, now(), ${r.actor.slice(0, 120)}
        from whatsapp_propuestas w where w.id = ${r.propuestaId}::uuid and w.correduria_id = ${correduriaId}::uuid
      on conflict (propuesta_id) where propuesta_id is not null do update
         set version_final = excluded.version_final, observacion = excluded.observacion, resolucion = excluded.resolucion,
             autonoma = excluded.autonoma, resuelta_at = excluded.resuelta_at, resuelta_por = excluded.resuelta_por
       where whatsapp_aprendizaje.correduria_id = ${correduriaId}::uuid and whatsapp_aprendizaje.resolucion is null`)
  } catch (e) {
    silencioso('resolución', e)
  }
}

/** ↩️ Deshacer de una autónoma: queda como reinicio de la racha. Best effort. */
export async function registrarDeshecha(correduriaId: string, propuestaId: string, actor: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      update whatsapp_aprendizaje set deshecha_at = now(), deshecha_por = ${actor.slice(0, 120)}
       where correduria_id = ${correduriaId}::uuid and propuesta_id = ${propuestaId}::uuid and autonoma and deshecha_at is null`)
  } catch (e) {
    silencioso('deshacer', e)
  }
}

/** Racha de aprobadas seguidas de ese tipo. `null` = no se pudo leer (→ nunca autónomo). */
export async function rachaDe(correduriaId: string, tipo: TipoPropuesta): Promise<number | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ resolucion: Resolucion; autonoma: boolean; deshecha_at: Date | null; resuelta_at: Date }[]>(Prisma.sql`
      select resolucion, autonoma, deshecha_at, resuelta_at from whatsapp_aprendizaje
       where correduria_id = ${correduriaId}::uuid and tipo = ${tipo} and resolucion is not null
       order by coalesce(deshecha_at, resuelta_at) desc
       limit ${LECTURA_RACHA}`)
    const eventos: EventoRacha[] = filas.map((f) => ({ resolucion: f.resolucion, autonoma: f.autonoma, deshechaAt: f.deshecha_at, resueltaAt: f.resuelta_at }))
    return calcularRacha(eventos)
  } catch (e) {
    silencioso('racha', e)
    return null
  }
}

/** Casos resueltos con contexto (para elegir los parecidos). `null` = no se pudo leer (≠ «no hay ninguno»). */
export async function casosResueltos(correduriaId: string): Promise<CasoAprendido[] | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{
      tipo: TipoPropuesta; origen_saliente: string | null; extracto: string | null; resolucion: Resolucion; autonoma: boolean
      deshecha: boolean; propuesta_original: { fecha?: string } | null; version_final: { fecha?: string } | null; observacion: string | null; resuelta_at: Date
    }[]>(Prisma.sql`
      select tipo, origen_saliente, extracto, resolucion, autonoma, deshecha_at is not null as deshecha, propuesta_original, version_final,
             observacion, resuelta_at
        from whatsapp_aprendizaje
       where correduria_id = ${correduriaId}::uuid and resolucion is not null and extracto is not null
       order by resuelta_at desc limit ${LECTURA_CASOS}`)
    return filas.map((f) => ({
      tipo: f.tipo, origenSaliente: f.origen_saliente, extracto: f.extracto, resolucion: f.resolucion, autonoma: f.autonoma,
      deshecha: f.deshecha, propuesto: f.propuesta_original ?? {}, final: f.version_final, observacion: f.observacion, resueltaAt: f.resuelta_at,
    }))
  } catch (e) {
    silencioso('casos', e)
    return null
  }
}

