// Las FIGURAS de una póliza de motor subida (03/10/2026, Alberto): cada persona que no es el
// tomador —propietario, conductor habitual, conductores ocasionales— tiene su ficha (lead), queda
// vinculada a la oportunidad con su rol y al tomador con una relación. Sustituye a la nota
// «Conductor principal en la póliza: …» del historial.
//
// Qué personas hay, quién es el tomador, qué rol lleva cada una y qué lead sin DNI se reutiliza lo
// decide `@central/module-seguros` (`figuras-poliza.ts`, puro y con tests). Aquí solo se orquesta.
//
// - Nunca lanza: una figura que falla NO tumba la oportunidad; se dice en `avisos` (sin nombres).
// - Con DNI válido: la ficha de ese DNI (índice ciego) o una nueva. Si el DNI está en una ficha con
//   OTRO nombre, no se vincula (un DNI mal leído apunta a otra persona).
// - Sin DNI: un lead nuevo por nombre; solo se reutiliza un lead sin DNI que se llama EXACTAMENTE
//   igual y que YA está relacionado con ESTE tomador (`leadSinDniReutilizable`). Nunca un cliente
//   ni una ficha con DNI. Guardián: `test/regression-figuras-poliza.test.ts`.
// - Un rol que la oportunidad ya tiene asignado a otra persona no se pisa (lo puso Alberto).
import { Prisma } from './generated/asegura-client'
import {
  DETALLE_ROL_FIGURA,
  NOTA_CONDUCTOR_JOVEN_NOVEL,
  conductoresDelPlan,
  detalleRelacionFigura,
  hayConductorJovenONovel,
  leadSinDniReutilizable,
  type CandidatoLeadSinDni,
  type PersonaFigura,
  type PlanFiguras,
  type RolFigura,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { altaCliente, altaLeadSinContacto, coincidencias } from './cartera-edicion'
import { crearRelacion } from './cartera-relaciones'
import { asignarFigura } from './oportunidad-riesgo'
import { volcarFiguraEnFicha } from './ficha-desde-poliza'
import { mismoNombre } from './oportunidad-documento-reglas'

/** Lo que cruza el puerto: rol, ficha y si se ha creado ahora. Sin nombres ni DNI. */
export type FiguraResultado = { rol: RolFigura | null; clienteId: string; creada: boolean }
export type ResultadoFiguras = { figuras: FiguraResultado[]; avisos: string[] }

const queEs = (p: PersonaFigura) => (p.rolesLeidos[0] ? DETALLE_ROL_FIGURA[p.rolesLeidos[0]] : 'Figura de la póliza')

export async function figurasDesdePoliza(e: {
  correduriaId: string
  oportunidadId: string
  /** La ficha del tomador (la de la oportunidad). */
  tomadorId: string
  ramo: string
  plan: PlanFiguras
  numeroPoliza: string | null
  actor: string
  origen: string
  hoy: Date
}): Promise<ResultadoFiguras> {
  const figuras: FiguraResultado[] = []
  const avisos: string[] = []
  if (e.plan.personas.length === 0) return { figuras, avisos }
  // Lo que la oportunidad ya tiene asignado (`null` = no se pudo mirar: entonces no se asigna nada).
  const yaAsignadas = await prismaAsegura()
    .$queryRaw<{ rol: string; cliente_id: string }[]>(Prisma.sql`
      select rol, cliente_id::text as cliente_id from oportunidad_figura
      where oportunidad_id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid`)
    .then((filas) => new Map(filas.map((f) => [f.rol, f.cliente_id])))
    .catch(() => null)
  if (yaAsignadas === null) avisos.push('no se pudieron leer las figuras de la oportunidad: no se ha asignado ningún rol')

  const vistas = new Set<string>()
  for (const p of e.plan.personas) {
    const que = queEs(p)
    try {
      const ficha = await fichaDeFigura(e, p)
      if ('aviso' in ficha) {
        if (ficha.aviso) avisos.push(`${que}: ${ficha.aviso}`)
        continue
      }
      const { clienteId, creada } = ficha

      // Relación tomador → figura («la figura es Otra de tomador»). Ya relacionadas (409) vale igual.
      if (!vistas.has(clienteId)) {
        const rel = await crearRelacion(e.correduriaId, e.tomadorId, {
          relacionadoId: clienteId,
          tipo: 'Otra',
          observaciones: detalleRelacionFigura(p.rolesLeidos, e.numeroPoliza),
          actor: e.actor,
        }).catch(() => null)
        if (!rel || (!rel.ok && rel.estado !== 'conflicto')) {
          // `altaLeadSinContacto`/`altaCliente` y `crearRelacion` no comparten transacción: el lead
          // recién abierto queda suelto y se dice cuál, para no perderlo en silencio.
          avisos.push(creada
            ? `${que}: se ha abierto la ficha ${clienteId}, pero no se ha podido vincular al tomador: vincúlala a mano o descártala`
            : `${que}: ficha encontrada (${clienteId}), pero no se ha podido vincular al tomador`)
          figuras.push({ rol: null, clienteId, creada })
          continue
        }
      }
      vistas.add(clienteId)

      const asignados: RolFigura[] = []
      for (const rol of p.roles) {
        if (yaAsignadas === null) break
        const otro = yaAsignadas.get(rol)
        if (otro === clienteId) { asignados.push(rol); continue }
        if (otro) { avisos.push(`${DETALLE_ROL_FIGURA[rol as keyof typeof DETALLE_ROL_FIGURA] ?? rol}: la oportunidad ya tenía otra persona en ese rol; no se ha cambiado`); continue }
        // `soloSiLibre`: si otro (Alberto, otra subida a la vez) lo ha asignado entre medias, no se pisa.
        const a = await asignarFigura(e.correduriaId, { oportunidadId: e.oportunidadId, rol, clienteId, actor: e.actor, soloSiLibre: true }).catch(() => null)
        if (a?.ok) { asignados.push(rol); yaAsignadas.set(rol, clienteId) }
        else avisos.push(`${que}: no se ha podido asignar a la oportunidad${a && !a.ok ? ` (${a.motivo})` : ''}`)
      }
      if (p.extra) avisos.push(`${que}: figura de más en la póliza (el rol ya lo tenía otra persona o este ramo no lo tiene): ficha y relación, sin rol`)

      // Su fecha de nacimiento y su carné, a SU ficha (solo huecos).
      const v = await volcarFiguraEnFicha({
        correduriaId: e.correduriaId, clienteId, persona: p, ramo: e.ramo, queEs: que, actor: e.actor, origen: e.origen, hoy: e.hoy,
      })
      for (const a of v.avisos) avisos.push(`${que}: ${a}`)

      if (asignados.length === 0) figuras.push({ rol: null, clienteId, creada })
      else for (const rol of asignados) figuras.push({ rol, clienteId, creada })
    } catch (err) {
      console.error('[oportunidad-figuras] figura sin procesar:', err instanceof Error ? err.message : err)
      avisos.push(`${que}: no se ha podido procesar`)
    }
  }
  return { figuras, avisos }
}

/**
 * La ficha de la figura: la que ya existe o una nueva. `{ aviso }` = no se vincula (y por qué;
 * `null` = es el propio tomador, no hay nada que decir).
 */
async function fichaDeFigura(
  e: { correduriaId: string; tomadorId: string; actor: string; origen: string },
  p: PersonaFigura,
): Promise<{ clienteId: string; creada: boolean } | { aviso: string | null }> {
  if (p.dni) {
    const conDni = await coincidencias(e.correduriaId, { dni: p.dni }).then((cs) => cs.filter((c) => c.por === 'dni')).catch(() => null)
    if (conDni === null) return { aviso: 'no se ha podido buscar su DNI en la cartera; no se ha abierto ficha' }
    if (conDni.length > 1) return { aviso: 'su DNI está en varias fichas (posible duplicado): no se ha vinculado ninguna' }
    const suya = conDni[0]
    if (suya) return fichaPorDni(e.tomadorId, suya, p)
    const alta = await altaCliente(e.correduriaId, { nombre: p.nombre, apellidos: '', dni: p.dni, fuente: 'venta_directa' }, e.actor)
    if (alta.ok) return { clienteId: alta.id, creada: true }
    // El DNI ya estaba en una ficha que la búsqueda no vio (carrera): la misma comprobación de nombre.
    const porDni = 'coincidencias' in alta ? alta.coincidencias?.find((c) => c.por === 'dni') : undefined
    if (porDni) return fichaPorDni(e.tomadorId, porDni, p)
    return { aviso: `no se ha podido abrir su ficha (${alta.motivo})` }
  }
  // Sin DNI: solo un lead sin DNI, con el mismo nombre EXACTO y ya relacionado con este tomador.
  // `null` = no se pudo mirar: no se abre otro (sería un duplicado), se dice.
  const candidatos = await candidatosSinDni(e.correduriaId, e.tomadorId)
  if (candidatos === null) return { aviso: 'no se han podido consultar sus leads ya vinculados al tomador; no se ha abierto ficha' }
  const previo = leadSinDniReutilizable(candidatos, p.nombre)
  if (previo) return previo === e.tomadorId ? { aviso: null } : { clienteId: previo, creada: false }
  const lead = await altaLeadSinContacto(e.correduriaId, { nombre: p.nombre, apellidos: '', tipoPersona: null }, e.actor, `${e.origen}, ${queEs(p).toLowerCase()} de la póliza`)
  if (lead.ok) return { clienteId: lead.id, creada: true }
  return { aviso: `no se ha podido abrir su lead (${lead.motivo})` }
}

function fichaPorDni(tomadorId: string, f: { id: string; nombre: string }, p: PersonaFigura): { clienteId: string; creada: boolean } | { aviso: string | null } {
  // Su DNI es el del tomador: no es otra persona (el nombre leído variaba).
  if (f.id === tomadorId) return { aviso: null }
  // El DNI identifica, pero uno mal leído apunta a OTRA persona: con otro nombre, no se funde.
  if (!mismoNombre(f.nombre, p.nombre)) return { aviso: 'su DNI ya está en una ficha con otro nombre: no se ha vinculado (revisa el DNI de la póliza)' }
  return { clienteId: f.id, creada: false }
}

/**
 * Los leads SIN DNI ya relacionados con ESTE tomador (en cualquier sentido de la relación): los
 * únicos que una figura sin DNI puede reutilizar. El nombre se compara en JS (`leadSinDniReutilizable`,
 * sin tildes ni mayúsculas). `null` = no se ha podido consultar (no es «no hay ninguno»).
 */
async function candidatosSinDni(correduriaId: string, tomadorId: string): Promise<CandidatoLeadSinDni[] | null> {
  return prismaAsegura()
    .$queryRaw<CandidatoLeadSinDni[]>(Prisma.sql`
      select c.id::text as id, c.nombre, c.apellidos, c.tipo::text as tipo,
             (nullif(trim(coalesce(c.dni, '')), '') is not null) as "tieneDni",
             true as "relacionadoConTomador"
      from clientes c
      where c.correduria_id = ${correduriaId}::uuid and c.merged_into_cliente_id is null and c.tipo::text = 'lead'
        and nullif(trim(coalesce(c.dni, '')), '') is null
        and exists (
          select 1 from cliente_relaciones r
          where r.correduria_id = c.correduria_id
            and ((r.cliente_a_id = ${tomadorId}::uuid and r.cliente_b_id = c.id)
              or (r.cliente_b_id = ${tomadorId}::uuid and r.cliente_a_id = c.id)))
      order by c.created_at asc
      limit 200`)
    .catch((err) => {
      console.error('[oportunidad-figuras] no se pudieron leer los leads vinculados al tomador:', err instanceof Error ? err.message : err)
      return null
    })
}

/**
 * «Hay un conductor joven/novel» en el historial de la OPORTUNIDAD, una sola vez (la misma póliza
 * subida dos veces no lo repite). Solo con fechas conocidas; sin datos personales. Nunca lanza.
 */
export async function anotarConductorJoven(e: { correduriaId: string; oportunidadId: string; plan: PlanFiguras; hoy: Date; actor: string }): Promise<boolean> {
  try {
    if (!hayConductorJovenONovel(conductoresDelPlan(e.plan), e.hoy.toISOString().slice(0, 10))) return false
    const n = await prismaAsegura().$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      select ${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, 'conductor_joven_novel', ${JSON.stringify({ nota: NOTA_CONDUCTOR_JOVEN_NOVEL })}::jsonb, ${e.actor}
      where not exists (
        select 1 from oportunidad_historial
        where oportunidad_id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid and accion = 'conductor_joven_novel')`)
    return n > 0
  } catch (err) {
    console.error('[oportunidad-figuras] no se pudo anotar el conductor joven/novel:', err instanceof Error ? err.message : err)
    return false
  }
}
