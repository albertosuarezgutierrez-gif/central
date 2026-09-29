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
 *    `poliza_intervinientes` (con su `cliente_id`), y la oportunidad queda enlazada a su póliza.
 *
 * La decisión es PURA (`cambiosDeFiguras`, `confirmacionesExigidas`, `faltanConfirmaciones`); la BD
 * solo lee y escribe, siempre acotada a la correduría.
 */
import { prisma } from '@/lib/tenant'

import {
  cambiosDeFiguras,
  confirmacionesExigidas,
  type CambioRiesgo,
  type Confirmacion,
} from './emision-figuras-reglas'
export { faltanConfirmaciones, type CambioRiesgo, type Confirmacion } from './emision-figuras-reglas'

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const id = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export type CambiosLeidos = {
  oportunidadId: string
  cambios: Array<CambioRiesgo & { antesNombre: string | null; despuesNombre: string | null }>
  exigidas: Confirmacion[]
}

/**
 * Lee la variante del proyecto y la primera de su riesgo. `null` = la tarificación no cuelga de
 * ningún riesgo (o es la primera): no hay nada que confirmar. Lanza si la BD falla: quien llama
 * NO emite sin saberlo.
 */
export async function leerCambiosDeFiguras(correduriaId: string, tarificacionId: string): Promise<CambiosLeidos | null> {
  const filas = await prisma.$queryRaw<Array<{ id: string; oportunidad_id: string | null; figuras: unknown; cliente_id: string | null; peticion: unknown }>>`
    select t.id::text as id, t.oportunidad_id::text as oportunidad_id, t.figuras, coalesce(t.cliente_id, pol.cliente_id)::text as cliente_id, t.peticion
    from seguros.tarificaciones t
    left join seguros.polizas pol on pol.id = t.poliza_id and pol.correduria_id = t.correduria_id
    where t.id = ${tarificacionId}::uuid and t.correduria_id = ${correduriaId}::uuid`
  const esta = filas[0]
  if (!esta?.oportunidad_id) return null
  const primeras = await prisma.$queryRaw<Array<{ id: string; figuras: unknown; cliente_id: string | null; peticion: unknown }>>`
    select t.id::text as id, t.figuras, coalesce(t.cliente_id, pol.cliente_id)::text as cliente_id, t.peticion
    from seguros.tarificaciones t
    left join seguros.polizas pol on pol.id = t.poliza_id and pol.correduria_id = t.correduria_id
    where t.oportunidad_id = ${esta.oportunidad_id}::uuid and t.correduria_id = ${correduriaId}::uuid and t.simulado = false
    order by t.creado_at asc limit 1`
  const primera = primeras[0]
  if (!primera || primera.id === esta.id) return null
  const cambios = cambiosDeFiguras(
    { figuras: primera.figuras, clienteId: primera.cliente_id, peticion: primera.peticion },
    { figuras: esta.figuras, clienteId: esta.cliente_id, peticion: esta.peticion },
  )
  if (cambios.length === 0) return null
  const ids = [...new Set(cambios.flatMap((c) => (c.campo === 'cp' ? [] : [c.antes, c.despues])).filter((x): x is string => !!x))]
  const nombres = ids.length
    ? await prisma.$queryRaw<Array<{ id: string; nombre: string | null; apellidos: string | null }>>`
        select id::text as id, nombre, apellidos from seguros.clientes
        where id = any(${ids}::uuid[]) and correduria_id = ${correduriaId}::uuid`
    : []
  const nombreDe = (x: string | null) => {
    if (!x) return null
    const n = nombres.find((f) => f.id === x)
    return n ? [n.nombre, n.apellidos].filter(Boolean).join(' ').trim() || null : null
  }
  return {
    oportunidadId: esta.oportunidad_id,
    cambios: cambios.map((c) => (c.campo === 'cp' ? { ...c, antesNombre: null, despuesNombre: null } : { ...c, antesNombre: nombreDe(c.antes), despuesNombre: nombreDe(c.despues) })),
    exigidas: confirmacionesExigidas(cambios),
  }
}

/** Deja constancia en el historial del riesgo ANTES del Submit: quién confirmó, qué marcó y qué cambiaba. */
export async function registrarConfirmacion(
  correduriaId: string,
  e: { oportunidadId: string; tarificacionId: string; cambios: CambioRiesgo[]; marcadas: Confirmacion[]; actor: string },
): Promise<void> {
  // Sin nombres ni DNI: ids de ficha y CP bastan para reconstruirlo.
  const detalle = {
    tarificacionId: e.tarificacionId,
    marcadas: e.marcadas,
    cambios: e.cambios.map((c) => ({ campo: c.campo, antes: c.antes, despues: c.despues })),
  }
  await prisma.$executeRaw`
    insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
    select ${correduriaId}::uuid, o.id, 'figuras_confirmadas', ${JSON.stringify(detalle)}::jsonb, ${e.actor}
    from seguros.oportunidades o
    where o.id = ${e.oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
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
      update seguros.oportunidades set poliza_id = coalesce(poliza_id, ${e.polizaId}::uuid)
      where id = ${t.oportunidad_id}::uuid and correduria_id = ${correduriaId}::uuid`
    await prisma.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${t.oportunidad_id}::uuid, 'emitida_con_figuras',
              ${JSON.stringify({ polizaId: e.polizaId, tarificacionId: e.tarificacionId, copiadas })}::jsonb, ${e.actor})`
  }
  return { copiadas, oportunidadId: t.oportunidad_id }
}
