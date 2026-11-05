// RENOVACIÓN CON ALTERNATIVAS (05/11/2026, Alberto): el AUTORIZADO por el tomador con Gestión o Total ve la renovación,
// recibe el aviso en la campana y puede ELEGIR (caso real: tomadora = cónyuge; quien usa la app es él, autorizado).
//
// 🛡️ Aislamiento por CÓDIGO (el rol no tiene RLS): todo parte de la identidad de la COOKIE (`requireIdentidad`/
// `getIdentidad` de `lib/session`), nunca de un id de la petición. Las autorizaciones que se leen son SOLO las que llegan a
// esa identidad: a ella (`autorizadoIdentidadId`) o a una ficha suya de `portalVinculo` (con el nivel de ese vínculo). La
// regla (vigente, alcance Gestión/Total, esa póliza o la ficha entera, vínculo que opera) es la PURA y ÚNICA
// `identidadesQueEligenRenovacion` de `@central/module-seguros-portal`, la misma que aplica asegura al escribir.
// 🚨 Solo para presupuestos en modo RENOVACIÓN: un presupuesto de siempre no se abre a un autorizado por aquí.
// Un fallo de lectura LANZA (quien llama lo trata como error, nunca como «no hay»).
import { identidadesQueEligenRenovacion, nivelPuedeOperar, type FilaAutorizacionRenovacion, type PresupuestoParaAviso } from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad, requireIdentidad } from './session'

type Concesion = {
  id: string; correduriaId: string; otorganteClienteId: string; autorizadoClienteId: string | null; autorizadoIdentidadId: string | null
  polizaId: string | null; alcance: string; aceptadoEn: Date | null; caducaEn: Date | null; revocadoEn: Date | null
}

/** Las autorizaciones NO revocadas que llegan a ESTA identidad (opcional: solo las de un tomador), ya como filas de la regla. */
async function filasDeIdentidad(identidadId: string, otorganteClienteId: string | null): Promise<{ filas: FilaAutorizacionRenovacion[]; concesiones: Concesion[] }> {
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true, nivel: true, origen: true },
  })
  const porFicha = new Map(vinculos.map((v) => [v.clienteId, v]))
  const fichas = [...porFicha.keys()]
  const concesiones: Concesion[] = await prisma.portalAutorizacion.findMany({
    where: {
      revocadoEn: null,
      ...(otorganteClienteId ? { otorganteClienteId } : {}),
      OR: [{ autorizadoIdentidadId: identidadId }, ...(fichas.length > 0 ? [{ autorizadoClienteId: { in: fichas } }] : [])],
    },
    select: {
      id: true, correduriaId: true, otorganteClienteId: true, autorizadoClienteId: true, autorizadoIdentidadId: true,
      polizaId: true, alcance: true, aceptadoEn: true, caducaEn: true, revocadoEn: true,
    },
  })
  const concedidas = [...new Set(concesiones.map((c) => c.polizaId).filter((x): x is string => x !== null))]
  const fusion = new Map<string, string | null>()
  if (concedidas.length > 0) {
    for (const p of await prisma.poliza.findMany({ where: { id: { in: concedidas } }, select: { id: true, mergedIntoPolizaId: true } })) {
      fusion.set(p.id, p.mergedIntoPolizaId)
    }
  }
  const filas: FilaAutorizacionRenovacion[] = []
  for (const c of concesiones) {
    const base = {
      autorizacionId: c.id, alcance: c.alcance, aceptadoEn: c.aceptadoEn, caducaEn: c.caducaEn, revocadoEn: c.revocadoEn,
      polizaId: c.polizaId, polizaFusionadaEn: c.polizaId ? fusion.get(c.polizaId) ?? null : null, identidadId, nombre: null,
    }
    if (c.autorizadoIdentidadId === identidadId) filas.push({ ...base, nivelVinculo: null })
    const v = c.autorizadoClienteId ? porFicha.get(c.autorizadoClienteId) : undefined
    // Cinturón: el vínculo y la autorización tienen que ser de la MISMA correduría.
    if (v && v.correduriaId === c.correduriaId) {
      filas.push({ ...base, nivelVinculo: v.nivel, vinculoDeCorredor: v.origen === 'corredor' })
    }
  }
  return { filas, concesiones }
}

/**
 * ¿Puede la identidad de la SESIÓN ver y elegir ESTA renovación como autorizada? Solo si NO entra ya con la ficha del
 * tomador con nivel de operar (esa es la vía del tomador). `false` también cuando no es una renovación.
 */
export async function autorizadoEligeRenovacion(identidadId: string, p: { correduriaId: string; clienteId: string; polizaId: string | null }): Promise<boolean> {
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId || sesion.corredor) return false
  const propio = await prisma.portalVinculo.findFirst({ where: { identidadId, clienteId: p.clienteId }, select: { nivel: true } })
  if (propio && nivelPuedeOperar(propio.nivel)) return false
  const { filas, concesiones } = await filasDeIdentidad(identidadId, p.clienteId)
  const deEsta = new Set(concesiones.filter((c) => c.correduriaId === p.correduriaId).map((c) => c.id))
  return identidadesQueEligenRenovacion(filas.filter((f) => deEsta.has(f.autorizacionId)), p.polizaId, new Date()).has(identidadId)
}

/** El nombre de pila del tomador, para decirle al autorizado de quién es. `null` = no se pudo leer (se dice sin nombre). */
export async function tomadorParaAutorizado(clienteId: string, correduriaId: string): Promise<string | null> {
  try {
    const c = await prisma.cliente.findFirst({ where: { id: clienteId, correduriaId }, select: { nombre: true } })
    const n = c?.nombre?.trim().split(/\s+/)[0] ?? ''
    return n === '' ? null : n
  } catch {
    return null
  }
}

/**
 * La campana: renovaciones PUBLICADAS, sin elegir y vigentes de los tomadores que autorizan a la identidad de la SESIÓN con
 * Gestión o Total sobre esa póliza. Sin la migración no puede haber ninguna: `[]`. Cualquier otro fallo LANZA.
 */
export async function renovacionesParaAutorizado(identidadId: string): Promise<PresupuestoParaAviso[]> {
  const sesion = await requireIdentidad()
  if (sesion.id !== identidadId || sesion.corredor) return []
  const { filas, concesiones } = await filasDeIdentidad(identidadId, null)
  // Los tomadores con los que ya entra con su ficha (nivel de operar): su aviso sale por la vía del tomador.
  const propios = new Set((await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true, nivel: true } }))
    .filter((v) => nivelPuedeOperar(v.nivel)).map((v) => v.clienteId))
  const otorgantes = new Map<string, string>()
  for (const c of concesiones) if (!propios.has(c.otorganteClienteId)) otorgantes.set(c.otorganteClienteId, c.correduriaId)
  const out: PresupuestoParaAviso[] = []
  for (const [otorgante, correduriaId] of otorgantes) {
    let pres: { id: string; ramo: string | null; poliza_id: string | null }[]
    try {
      pres = await prisma.$queryRaw<{ id: string; ramo: string | null; poliza_id: string | null }[]>`
        select p.id::text as id, p.ramo, p.poliza_id::text as poliza_id from seguros.presupuesto p
        where p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${otorgante}::uuid
          and p.modo = 'renovacion' and p.enviado_at is not null and p.retirado_at is null
          and p.aceptado_at is null and p.emitido_at is null and p.eleccion_cliente is null and p.vence_el > now()
        order by p.enviado_at desc limit 5`
    } catch (e) {
      if (/42703|does not exist|no existe/i.test(e instanceof Error ? e.message : String(e))) return []
      throw e
    }
    const deEste = new Set(concesiones.filter((c) => c.otorganteClienteId === otorgante && c.correduriaId === correduriaId).map((c) => c.id))
    const suyas = filas.filter((f) => deEste.has(f.autorizacionId))
    for (const p of pres) {
      if (identidadesQueEligenRenovacion(suyas, p.poliza_id, new Date()).has(identidadId)) out.push({ id: p.id, ramo: p.ramo })
    }
  }
  return out
}
