/**
 * Emitir una VARIANTE del riesgo con otras personas (29/09/2026, diseño
 * docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md §6).
 *
 * Dos cosas, las dos en la emisión:
 *
 * 1. **El aviso legal.** Si la variante que se emite cambia el tomador, el propietario, el conductor
 *    habitual o el CP de circulación respecto a la PRIMERA del riesgo (P1), el corredor confirma
 *    antes del Submit que eso es la realidad. Declarar a otro conductor o domicilio para pagar menos
 *    es ocultación del riesgo (arts. 10 y 89 LCS): la compañía puede reducir o negar la
 *    indemnización. La confirmación queda en el historial del riesgo (quién, cuándo, qué marcó).
 * 2. **Emisión → intervinientes.** Tras acuñar, las figuras de la variante pasan a
 *    `poliza_intervinientes` (con su `cliente_id`), y la oportunidad apunta a su póliza GANADA
 *    (`poliza_ganada_id`; `poliza_id` es la póliza que se retarifica, y no se toca).
 *
 * La decisión es PURA (`cambiosDeFiguras`, `confirmacionesExigidas`, `faltanConfirmaciones`); la BD
 * solo lee y escribe, siempre acotada a la correduría.
 */
import { prisma } from '@/lib/tenant'

import { cambiosDePeticion, conductorHabitualDe, confirmacionesExigidas, mismoVehiculo, type CambioRiesgo, type Confirmacion } from './emision-figuras-reglas'
export { faltanConfirmaciones, type CambioRiesgo, type Confirmacion } from './emision-figuras-reglas'

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const id = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export type CambiosLeidos = {
  oportunidadId: string
  cambios: CambioRiesgo[]
  exigidas: Confirmacion[]
  /** El conductor habitual de la variante que se emite, para la casilla (aunque no cambie). */
  conductorHabitual: string | null
}

/**
 * Lee la variante del proyecto y la PRIMERA del mismo vehículo en su riesgo, y compara lo que viajó
 * a la compañía. `null` = no cuelga de ningún riesgo, es la primera o no hay nada que confirmar.
 * Lanza si la BD falla: quien llama NO emite sin saberlo.
 */
export async function leerCambiosDeFiguras(correduriaId: string, tarificacionId: string): Promise<CambiosLeidos | null> {
  const filas = await prisma.$queryRaw<Array<{ oportunidad_id: string | null; peticion: unknown }>>`
    select t.oportunidad_id::text as oportunidad_id, t.peticion
    from seguros.tarificaciones t
    where t.id = ${tarificacionId}::uuid and t.correduria_id = ${correduriaId}::uuid`
  const esta = filas[0]
  if (!esta?.oportunidad_id) return null
  const anteriores = await prisma.$queryRaw<Array<{ id: string; peticion: unknown }>>`
    select t.id::text as id, t.peticion
    from seguros.tarificaciones t
    where t.oportunidad_id = ${esta.oportunidad_id}::uuid and t.correduria_id = ${correduriaId}::uuid and t.simulado = false
    order by t.creado_at asc limit 200`
  // La primera cotización del MISMO vehículo: la oportunidad agrupa el ramo y puede tener dos.
  const primera = anteriores.find((t) => mismoVehiculo(t.peticion, esta.peticion))
  if (!primera || primera.id === tarificacionId) return null
  const cambios = cambiosDePeticion(primera.peticion, esta.peticion)
  if (cambios.length === 0) return null
  return {
    oportunidadId: esta.oportunidad_id,
    cambios,
    exigidas: confirmacionesExigidas(cambios),
    conductorHabitual: conductorHabitualDe(esta.peticion),
  }
}

/** Deja constancia en el historial del riesgo ANTES del Submit: quién confirmó, qué marcó y qué cambiaba. */
export async function registrarConfirmacion(
  correduriaId: string,
  e: { oportunidadId: string; tarificacionId: string; cambios: CambioRiesgo[]; marcadas: Confirmacion[]; actor: string },
): Promise<void> {
  // Sin DNI: el papel, los nombres que se enseñaron y el CP, que es lo que se confirmó.
  const detalle = {
    tarificacionId: e.tarificacionId,
    marcadas: e.marcadas,
    cambios: e.cambios.map((c) => ({ campo: c.campo, antes: c.antes, despues: c.despues })),
  }
  const n = await prisma.$executeRaw`
    insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
    select ${correduriaId}::uuid, o.id, 'figuras_confirmadas', ${JSON.stringify(detalle)}::jsonb, ${e.actor}
    from seguros.oportunidades o
    where o.id = ${e.oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
  // Sin la fila no hay constancia: quien llama no emite.
  if (n !== 1) throw new Error(`la confirmación no quedó en el historial (${n} filas)`)
}

/**
 * Tras acuñar: las figuras de la variante pasan a la póliza y el riesgo queda enlazado a ella.
 * Solo las figuras DECLARADAS aparte (el tomador ya es `polizas.cliente_id`) y sin repetir una fila
 * que ya exista. Best-effort: quien llama registra el fallo, la póliza ya está emitida.
 */
export async function copiarFigurasAPoliza(
  correduriaId: string,
  e: { polizaId: string; tarificacionId: string; actor: string },
): Promise<{ copiadas: number; oportunidadId: string | null }> {
  const filas = await prisma.$queryRaw<Array<{ oportunidad_id: string | null; figuras: unknown }>>`
    select t.oportunidad_id::text as oportunidad_id, t.figuras from seguros.tarificaciones t
    where t.id = ${e.tarificacionId}::uuid and t.correduria_id = ${correduriaId}::uuid`
  const t = filas[0]
  if (!t) return { copiadas: 0, oportunidadId: null }
  const f = esObjeto(t.figuras) ? t.figuras : {}
  const tomador = id(f.tomador)
  let copiadas = 0
  for (const rol of ['propietario', 'conductor_habitual', 'conductor_ocasional'] as const) {
    const cliente = id(f[rol])
    if (!cliente || cliente === tomador) continue
    copiadas += await prisma.$executeRaw`
      insert into seguros.poliza_intervinientes (poliza_id, correduria_id, rol, cliente_id, origen)
      select pol.id, pol.correduria_id, ${rol}::seguros.interviniente_rol, c.id, 'manual'::seguros.interviniente_origen
      from seguros.polizas pol
      join seguros.clientes c on c.id = ${cliente}::uuid and c.correduria_id = pol.correduria_id and c.merged_into_cliente_id is null
      where pol.id = ${e.polizaId}::uuid and pol.correduria_id = ${correduriaId}::uuid
        and not exists (
          select 1 from seguros.poliza_intervinientes i
          where i.poliza_id = pol.id and i.rol = ${rol}::seguros.interviniente_rol and i.cliente_id = c.id
        )`
  }
  if (t.oportunidad_id) {
    await prisma.$executeRaw`
      update seguros.oportunidades set poliza_ganada_id = coalesce(poliza_ganada_id, ${e.polizaId}::uuid)
      where id = ${t.oportunidad_id}::uuid and correduria_id = ${correduriaId}::uuid`
    await prisma.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${t.oportunidad_id}::uuid, 'emitida_con_figuras',
              ${JSON.stringify({ polizaId: e.polizaId, tarificacionId: e.tarificacionId, copiadas })}::jsonb, ${e.actor})`
  }
  return { copiadas, oportunidadId: t.oportunidad_id }
}
