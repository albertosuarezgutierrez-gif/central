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
// - El nombre se PARTE en nombre y apellidos (`partirNombre`, como el del tomador); un lead antiguo
//   con todo el nombre en `nombre` se sigue reutilizando (`leadSinDniReutilizable` compara el entero).
// - Su «persona de contacto» (tomador empresa) recibe también el teléfono y el email del tomador.
// - Un conductor que se queda sin DNI o sin carné deja UNA tarea «Pedir DNI y carné…» en la
//   oportunidad (sin nombre, colgada de su ficha). Nada se envía a nadie.
import { Prisma } from './generated/asegura-client'
import {
  CAMPOS_FIGURA,
  DETALLE_ROL_FIGURA,
  NOTA_CONDUCTOR_JOVEN_NOVEL,
  accionFiguraSinNombre,
  conductoresDelPlan,
  contactoSoloDelTomador,
  detalleRelacionFigura,
  faltaDniOCarne,
  hayConductorJovenONovel,
  leadSinDniReutilizable,
  notaFiguraSinNombre,
  partirNombre,
  tareaPedirDniYCarne,
  type CamposFigura,
  type CandidatoLeadSinDni,
  type PersonaFigura,
  type PlanFiguras,
  type RolFigura,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { altaCliente, altaLeadSinContacto, anadirContacto, coincidencias, listarContactos } from './cartera-edicion'
import { crearRelacion } from './cartera-relaciones'
import { asignarFigura } from './oportunidad-riesgo'
import { volcarFiguraEnFicha } from './ficha-desde-poliza'
import { mismoNombre } from './oportunidad-documento-reglas'

/**
 * Lo que cruza el puerto: rol, ficha, si se ha creado ahora y qué tiene su ficha tras la subida
 * (`campos`: solo booleanos, `null` = no se pudo mirar). Sin nombres, DNI ni valores.
 */
export type FiguraResultado = { rol: RolFigura | null; clienteId: string; creada: boolean; campos?: CamposFigura }
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
  /** Teléfono y email del TOMADOR leídos (ya normalizados): van también a su persona de contacto. */
  contactoTomador?: { telefono: string | null; email: string | null }
  /** Fecha de la tarea «Pedir DNI y carné» (la de la llamada de la oportunidad). */
  fechaTarea?: string
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
          observaciones: detalleRelacionFigura(p.rolesLeidos, e.numeroPoliza, p.personaContacto),
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

      // Su fecha de nacimiento, su domicilio y su carné, a SU ficha (solo huecos).
      const v = await volcarFiguraEnFicha({
        correduriaId: e.correduriaId, clienteId, persona: p, ramo: e.ramo, queEs: que, actor: e.actor, origen: e.origen, hoy: e.hoy,
      })
      for (const a of v.avisos) avisos.push(`${que}: ${a}`)
      // Persona de contacto del tomador empresa: su teléfono y email también a ella (la empresa los conserva).
      if (p.personaContacto && e.contactoTomador) {
        for (const a of await contactoDelTomador(e, clienteId, e.contactoTomador)) avisos.push(`${que}: ${a}`)
      }

      // Qué tiene su ficha ahora (para la pantalla y para la tarea). Nunca valores.
      const estado = await estadoFicha(e.correduriaId, clienteId)
      const texto = tareaPedirDniYCarne(p)
      if (texto && e.fechaTarea && faltaDniOCarne(estado)) {
        const t = await tareaDeFigura({ correduriaId: e.correduriaId, oportunidadId: e.oportunidadId, clienteId, texto, fecha: e.fechaTarea, actor: e.actor })
        if (t === null) avisos.push(`${que}: no se ha podido dejar la tarea de pedirle DNI y carné`)
      }

      if (asignados.length === 0) figuras.push({ rol: null, clienteId, creada, campos: estado.campos })
      else for (const rol of asignados) figuras.push({ rol, clienteId, creada, campos: estado.campos })
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
    const alta = await altaCliente(e.correduriaId, { ...partirNombre(p.nombre), dni: p.dni, fuente: 'venta_directa' }, e.actor)
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
  const lead = await altaLeadSinContacto(e.correduriaId, { ...partirNombre(p.nombre), tipoPersona: null }, e.actor, `${e.origen}, ${queEs(p).toLowerCase()} de la póliza`)
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
 * únicos que una figura sin DNI puede reutilizar. El SQL no filtra por nombre: trae `nombre` y
 * `apellidos` y `leadSinDniReutilizable` compara el nombre ENTERO (`nombre + apellidos`, sin tildes,
 * mayúsculas ni orden), así que casan igual el lead antiguo con todo en `nombre` y el nuevo partido.
 * `null` = no se ha podido consultar (no es «no hay ninguno»).
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

/**
 * Una línea por cada figura con rol y SIN nombre («Hay un conductor adicional sin nombre en la póliza:
 * complétalo a mano.»), una sola vez por oportunidad y rol (el patrón de `anotarConductorJoven`). Sin
 * datos personales; no abre ficha. Nunca lanza: devuelve cuántas se han escrito.
 */
export async function anotarFigurasSinNombre(e: { correduriaId: string; oportunidadId: string; plan: PlanFiguras; actor: string }): Promise<number> {
  let n = 0
  for (const rol of new Set(e.plan.sinNombre.map((x) => x.rol))) {
    try {
      const accion = accionFiguraSinNombre(rol)
      n += await prismaAsegura().$executeRaw(Prisma.sql`
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
        select ${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, ${accion}, ${JSON.stringify({ nota: notaFiguraSinNombre(rol) })}::jsonb, ${e.actor}
        where not exists (
          select 1 from oportunidad_historial
          where oportunidad_id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid and accion = ${accion})`)
    } catch (err) {
      console.error('[oportunidad-figuras] no se pudo anotar la figura sin nombre:', err instanceof Error ? err.message : err)
    }
  }
  return n
}

/**
 * Lo que tiene la ficha de la figura tras la subida: booleanos por campo (`null` = no se pudo mirar)
 * y, para la tarea, si tiene DNI y cuántos carnés. Nunca valores. Nunca lanza.
 */
async function estadoFicha(correduriaId: string, clienteId: string): Promise<{ campos: CamposFigura; tieneDni: boolean | null; carnets: number | null }> {
  const lleno = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== ''
  const db = prismaAsegura()
  const [c, carnets, contactos] = await Promise.all([
    db.cliente.findFirst({
      where: { id: clienteId, correduriaId, mergedIntoClienteId: null },
      select: { nombre: true, apellidos: true, dni: true, fechaNacimiento: true, direccion: true },
    }).catch(() => null),
    db.clienteCarnetConducir.count({ where: { clienteId, correduriaId } }).catch(() => null),
    listarContactos(correduriaId, clienteId).catch(() => null),
  ])
  const campos = Object.fromEntries(CAMPOS_FIGURA.map((k) => [k, null])) as CamposFigura
  if (c) {
    campos.nombre = lleno(c.nombre) || lleno(c.apellidos)
    campos.nacimiento = lleno(c.fechaNacimiento)
    campos.domicilio = lleno(c.direccion)
    campos.dni = lleno(c.dni)
  }
  // Un contacto que no se descifra también es «tiene» (hay algo; no se afirma que falte).
  if (contactos) {
    campos.telefono = contactos.telefonos.length > 0
    campos.email = contactos.emails.length > 0
  }
  campos.carne = carnets === null ? null : carnets > 0
  return { campos, tieneDni: c ? lleno(c.dni) : null, carnets }
}

/**
 * Teléfono y email del TOMADOR a la ficha de su persona de contacto, por la puerta de siempre
 * (`anadirContacto`): sin duplicar en la ficha, nunca principales (el email principal enlaza el
 * portal; un papel no entrega cuentas) y SIN forzar si otra ficha ya los tiene. Única excepción:
 * que esa otra sea SOLO el propio tomador (`contactoSoloDelTomador`), que los acaba de recibir de
 * esta misma póliza. Devuelve los avisos (sin valores).
 */
async function contactoDelTomador(
  e: { correduriaId: string; tomadorId: string; actor: string },
  clienteId: string,
  contacto: { telefono: string | null; email: string | null },
): Promise<string[]> {
  const avisos: string[] = []
  for (const tipo of ['telefono', 'email'] as const) {
    const valor = contacto[tipo]
    if (!valor) continue
    const que = tipo === 'telefono' ? 'el teléfono del tomador' : 'el email del tomador'
    const otros = await coincidencias(e.correduriaId, { [tipo]: valor }, clienteId).then((cs) => cs.map((c) => c.id)).catch(() => null)
    if (otros === null) { avisos.push(`no se pudo comprobar si ${que} ya estaba en otra ficha: no se le ha añadido`); continue }
    const soloTomador = contactoSoloDelTomador(otros, e.tomadorId)
    if (otros.length > 0 && !soloTomador) { avisos.push(`${que} ya está en otra ficha (${otros.join(', ')}): no se le ha añadido`); continue }
    const a = await anadirContacto(e.correduriaId, clienteId, {
      tipo, valor, principal: false, nuncaPrincipal: true, forzar: soloTomador, actor: e.actor, etiqueta: 'trabajo',
    }).catch(() => null)
    // Ya lo tenía su ficha (409 «no se duplica») o no vale: nada que decir.
    if (a && !a.ok && a.estado === 'invalido') continue
    if (!a?.ok) avisos.push(`no se le pudo guardar ${que}`)
  }
  return avisos
}

/**
 * UNA tarea pendiente «Pedir DNI y carné del conductor …» en la oportunidad (`gestiones`, la de
 * siempre: `central:seguimiento`), colgada de la ficha de la figura (`cliente_id`) y con su línea
 * `tarea_creada` en el historial. Sin nombre. La misma póliza subida otra vez no la repite (ni si
 * ya se cerró: misma oportunidad, misma persona y mismo texto: dos ocasionales tienen una cada uno). Una oportunidad ganada o perdida no recibe tareas.
 * No envía nada a nadie. `true` = creada; `false` = ya estaba (o la oportunidad está cerrada);
 * `null` = no se pudo.
 */
async function tareaDeFigura(e: { correduriaId: string; oportunidadId: string; clienteId: string; texto: string; fecha: string; actor: string }): Promise<boolean | null> {
  try {
    return await prismaAsegura().$transaction(async (tx) => {
      // Dos subidas a la vez: en fila por oportunidad + persona + texto (el `not exists` solo no basta).
      await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`tarea-figura:${e.oportunidadId}:${e.clienteId}:${e.texto}`}))`)
      const n = await tx.$executeRaw(Prisma.sql`
        with o as (
          select id, estado from oportunidades
          where id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid
            and estado::text not in ('ganada', 'perdida')
            and not exists (
              select 1 from gestiones g
              where g.oportunidad_id = ${e.oportunidadId}::uuid and g.correduria_id = ${e.correduriaId}::uuid
                and g.cliente_id = ${e.clienteId}::uuid
                and g.origen_trigger = 'central:seguimiento' and g.observaciones = ${e.texto})
        ), nueva as (
          insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
          select ${e.correduriaId}::uuid, cast('tarea' as gestion_tipo), cast('media' as gestion_prioridad), 'pendiente', ${e.texto},
                 (${e.fecha}::date + time '23:59:59') at time zone 'Europe/Madrid', ${e.clienteId}::uuid, o.id, 'central:seguimiento'
          from o
          returning id
        )
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
        select ${e.correduriaId}::uuid, o.id, 'tarea_creada', o.estado, o.estado,
               jsonb_build_object('tareaId', nueva.id::text, 'tipo', 'tarea', 'fechaLimite', ${e.fecha}::text, 'clienteId', ${e.clienteId}::text),
               ${e.actor}
        from o, nueva`)
      return n > 0
    })
  } catch (err) {
    console.error('[oportunidad-figuras] no se pudo crear la tarea de la figura:', err instanceof Error ? err.message : err)
    return null
  }
}
