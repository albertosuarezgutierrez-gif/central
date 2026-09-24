// Registro de quejas y reclamaciones del SAC (Servicio de Atención al Cliente del mediador).
//
// El plazo de respuesta que se publica al cliente es de un mes; esto es el reloj que lo vigila. La
// regla vive en `@central/module-seguros` (queja.ts); aquí solo se lee y se escribe `seguros.queja`.
//
// 🚨 `detalle` y `respuesta` se guardan CIFRADOS y se devuelven descifrados solo por el puerto del
// operador. Si la clave no abre uno, se dice (`ilegible`), nunca se pinta como vacío.

import {
  ESTADOS_QUEJA, ESTADOS_QUEJA_CERRADA, estadoPlazoQueja, diasHastaPlazo, informeSac, plazoQueja,
  transicionQuejaValida, validarAltaQueja, validarCierreQueja, validarFechaResolucion,
  type EstadoQueja, type InformeSac, type MotivoQueja, type PlazoQueja,
} from '@central/module-seguros'
import { encryptField } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { campoIlegible, descifrarCampo } from './cartera-edicion'

/** Tope de la cola en pantalla. El informe anual NO lo lleva: un informe recortado mentiría. */
const LIMITE_COLA = 500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ABIERTOS: string[] = ESTADOS_QUEJA.filter((e) => !ESTADOS_QUEJA_CERRADA.includes(e))

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export type QuejaVista = {
  id: string
  clienteId: string | null
  clienteNombre: string | null
  polizaId: string | null
  numeroPoliza: string | null
  reclamante: string
  canal: string
  motivo: MotivoQueja
  /** null = no se pudo descifrar (ver `detalleIlegible`). */
  detalle: string | null
  detalleIlegible: boolean
  recibidaEl: string
  plazoEl: string
  estado: EstadoQueja
  plazo: PlazoQueja | null
  diasRestantes: number | null
  /** `null` con `respuestaIlegible` = la clave no la abre; NO es «sin respuesta». */
  respuesta: string | null
  respuestaIlegible: boolean
  resueltaEl: string | null
  creadaPor: string
}

type Fila = {
  id: string; clienteId: string | null; clienteNombre: string | null; polizaId: string | null; numeroPoliza: string | null
  reclamante: string; canal: string; motivo: string; detalle: string; recibidaEl: string; plazoEl: string; estado: string
  respuesta: string | null; resueltaEl: string | null; creadaPor: string
}

const ORDEN: Record<PlazoQueja, number> = { vencida: 0, urgente: 1, en_plazo: 2, cerrada: 3 }

function vista(f: Fila, hoy: string): QuejaVista {
  const estado = f.estado as EstadoQueja
  return {
    id: f.id,
    clienteId: f.clienteId,
    clienteNombre: f.clienteNombre,
    polizaId: f.polizaId,
    numeroPoliza: f.numeroPoliza,
    reclamante: f.reclamante,
    canal: f.canal,
    motivo: f.motivo as MotivoQueja,
    detalle: descifrarCampo(f.detalle),
    detalleIlegible: campoIlegible(f.detalle),
    recibidaEl: f.recibidaEl,
    plazoEl: f.plazoEl,
    estado,
    plazo: estadoPlazoQueja({ estado, plazoEl: f.plazoEl }, hoy),
    diasRestantes: ESTADOS_QUEJA_CERRADA.includes(estado) ? null : diasHastaPlazo(f.plazoEl, hoy),
    respuesta: descifrarCampo(f.respuesta),
    respuestaIlegible: campoIlegible(f.respuesta),
    resueltaEl: f.resueltaEl,
    creadaPor: f.creadaPor,
  }
}

async function leer(correduriaId: string, where: 'abiertas' | 'todas' | { id: string } | { año: number }): Promise<Fila[]> {
  const db = prismaAsegura()
  return db.$queryRaw<Fila[]>`
    select q.id::text as id, q.cliente_id::text as "clienteId",
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as "clienteNombre",
           q.poliza_id::text as "polizaId", p.numero_poliza as "numeroPoliza",
           q.reclamante, q.canal, q.motivo, q.detalle,
           to_char(q.recibida_el, 'YYYY-MM-DD') as "recibidaEl", to_char(q.plazo_el, 'YYYY-MM-DD') as "plazoEl",
           q.estado, q.respuesta, to_char(q.resuelta_el, 'YYYY-MM-DD') as "resueltaEl", q.creada_por as "creadaPor"
    from queja q
      left join clientes c on c.id = q.cliente_id
      left join polizas p on p.id = q.poliza_id
    where q.correduria_id = ${correduriaId}::uuid
      and (${where === 'abiertas'} = false or q.estado = any(${ABIERTOS}::text[]))
      and (${typeof where === 'object' && 'id' in where ? where.id : null}::uuid is null
           or q.id = ${typeof where === 'object' && 'id' in where ? where.id : null}::uuid)
      and (${typeof where === 'object' && 'año' in where ? where.año : null}::int is null
           or extract(year from q.recibida_el) = ${typeof where === 'object' && 'año' in where ? where.año : null}::int)
    order by q.plazo_el asc
    limit ${typeof where === 'object' && 'año' in where ? 100000 : LIMITE_COLA}`
}

export type ResultadoCola = {
  estado: 'ok'
  quejas: QuejaVista[]
  /** La cola llegó al tope: hay más de las que se ven. */
  truncada: boolean
  resumen: { abiertas: number; urgentes: number; vencidas: number }
  informe: InformeSac
}

/** Las abiertas (o todas con `todas`), ordenadas por el RELOJ, más el informe del año en curso. */
export async function colaQuejas(correduriaId: string, todas = false): Promise<ResultadoCola> {
  const hoy = hoyMadrid()
  const año = Number(hoy.slice(0, 4))
  const [filas, delAño] = await Promise.all([leer(correduriaId, todas ? 'todas' : 'abiertas'), leer(correduriaId, { año })])
  const quejas = filas.map((f) => vista(f, hoy))
  quejas.sort((a, b) => ORDEN[a.plazo ?? 'en_plazo'] - ORDEN[b.plazo ?? 'en_plazo'] || a.plazoEl.localeCompare(b.plazoEl))
  const abiertas = quejas.filter((q) => q.plazo !== 'cerrada')
  return {
    estado: 'ok',
    quejas,
    truncada: filas.length >= LIMITE_COLA,
    resumen: {
      abiertas: abiertas.length,
      urgentes: abiertas.filter((q) => q.plazo === 'urgente').length,
      vencidas: abiertas.filter((q) => q.plazo === 'vencida').length,
    },
    informe: informeSac(
      delAño.map((f) => ({ estado: f.estado as EstadoQueja, motivo: f.motivo as MotivoQueja, recibidaEl: f.recibidaEl, plazoEl: f.plazoEl, resueltaEl: f.resueltaEl })),
      año,
    ),
  }
}

export type ResultadoAlta =
  | { estado: 'creada'; queja: QuejaVista }
  | { estado: 'invalida'; motivos: string[] }
  | { estado: 'no_encontrada'; motivo: string }

export async function registrarQueja(correduriaId: string, cuerpo: Record<string, unknown> | null, actor: string): Promise<ResultadoAlta> {
  const txt = (k: string) => (typeof cuerpo?.[k] === 'string' ? (cuerpo[k] as string).trim() : '')
  const hoy = hoyMadrid()
  const alta = { reclamante: txt('reclamante'), canal: txt('canal'), motivo: txt('motivo'), recibidaEl: txt('recibidaEl') || hoy, detalle: txt('detalle') }
  const motivos = validarAltaQueja(alta, hoy)
  const clienteId = txt('clienteId') || null
  const polizaId = txt('polizaId') || null
  if (clienteId && !UUID.test(clienteId)) motivos.push('El cliente no es válido.')
  if (polizaId && !UUID.test(polizaId)) motivos.push('La póliza no es válida.')
  if (alta.reclamante.length > 200) motivos.push('El nombre es demasiado largo.')
  if (alta.detalle.length > 8000) motivos.push('El detalle es demasiado largo.')
  if (motivos.length) return { estado: 'invalida', motivos }

  const db = prismaAsegura()
  // El cliente y la póliza, si vienen, tienen que ser de ESTA correduría y cuadrar entre sí.
  if (clienteId || polizaId) {
    const [ok] = await db.$queryRaw<{ cliente: boolean; poliza: boolean }[]>`
      select (${clienteId}::uuid is null or exists (select 1 from clientes where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid)) as cliente,
             (${polizaId}::uuid is null or exists (select 1 from polizas where id = ${polizaId}::uuid and correduria_id = ${correduriaId}::uuid
                and (${clienteId}::uuid is null or cliente_id = ${clienteId}::uuid))) as poliza`
    if (!ok?.cliente) return { estado: 'no_encontrada', motivo: 'Ese cliente no está en la cartera.' }
    if (!ok?.poliza) return { estado: 'no_encontrada', motivo: 'Esa póliza no está en la cartera (o no es de ese cliente).' }
  }

  const plazo = plazoQueja(alta.recibidaEl) as string
  const [r] = await db.$queryRaw<{ id: string }[]>`
    insert into queja (correduria_id, cliente_id, poliza_id, reclamante, canal, motivo, detalle, recibida_el, plazo_el, creada_por)
    values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, ${alta.reclamante}, ${alta.canal}, ${alta.motivo},
            ${encryptField(alta.detalle)}, ${alta.recibidaEl}::date, ${plazo}::date, ${actor.slice(0, 100)})
    returning id::text as id`
  anotarCambio({ entidad: 'queja', id: r.id, campo: 'estado', antes: null, despues: 'recibida' })
  if (clienteId) {
    await historial(correduriaId, clienteId, polizaId, `Queja registrada (${alta.motivo}, recibida el ${alta.recibidaEl}; contestar antes del ${plazo}) por ${actor.slice(0, 100)}.`)
  }
  const [f] = await leer(correduriaId, { id: r.id })
  return { estado: 'creada', queja: vista(f, hoy) }
}

export type ResultadoCambio =
  | { estado: 'hecho'; queja: QuejaVista }
  | { estado: 'no_encontrada' }
  | { estado: 'no_permitida'; motivo: string }
  | { estado: 'invalida'; motivo: string }

/** Pasar a trámite, resolver (con la respuesta que se dio) o marcar que el cliente desiste. */
export async function cambiarQueja(correduriaId: string, cuerpo: Record<string, unknown> | null, actor: string): Promise<ResultadoCambio> {
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id : ''
  const a = cuerpo?.estado as EstadoQueja
  if (!UUID.test(id)) return { estado: 'no_encontrada' }
  if (!ESTADOS_QUEJA.includes(a)) return { estado: 'invalida', motivo: 'Estado no válido.' }
  const respuesta = typeof cuerpo?.respuesta === 'string' ? cuerpo.respuesta.trim() : ''
  const falta = validarCierreQueja(a, respuesta)
  if (falta) return { estado: 'invalida', motivo: falta }
  if (respuesta.length > 8000) return { estado: 'invalida', motivo: 'La respuesta es demasiado larga.' }
  const resueltaPedida = typeof cuerpo?.resueltaEl === 'string' ? cuerpo.resueltaEl.trim() : ''

  const db = prismaAsegura()
  const hoy = hoyMadrid()
  const [actual] = await leer(correduriaId, { id })
  if (!actual) return { estado: 'no_encontrada' }
  if (!transicionQuejaValida(actual.estado as EstadoQueja, a)) {
    return { estado: 'no_permitida', motivo: `No se puede pasar de «${actual.estado}» a «${a}».` }
  }
  const cierra = ESTADOS_QUEJA_CERRADA.includes(a)
  // La fecha en que se CONTESTÓ (puede ser anterior al clic); por defecto, hoy.
  const resueltaEl = cierra && resueltaPedida ? resueltaPedida : hoy
  if (cierra && resueltaPedida) {
    const mal = validarFechaResolucion(actual.recibidaEl, resueltaPedida, hoy)
    if (mal) return { estado: 'invalida', motivo: mal }
  }
  const n = await db.$executeRaw`
    update queja set estado = ${a},
      respuesta = case when ${respuesta} = '' then respuesta else ${respuesta ? encryptField(respuesta) : null} end,
      resuelta_el = case when ${cierra} then ${resueltaEl}::date else resuelta_el end,
      updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = ${actual.estado}`
  // Otro clic lo cambió entre la lectura y la escritura: no se pisa.
  if (n === 0) return { estado: 'no_permitida', motivo: 'La queja cambió mientras tanto; recarga.' }
  anotarCambio({ entidad: 'queja', id, campo: 'estado', antes: actual.estado, despues: a })
  if (respuesta) anotarCambio({ entidad: 'queja', id, campo: 'respuesta' })
  if (actual.clienteId) {
    await historial(correduriaId, actual.clienteId, actual.polizaId, `Queja → ${a}${cierra ? ` el ${resueltaEl}` : ''} (${actor.slice(0, 100)}).`)
  }
  const [f] = await leer(correduriaId, { id })
  return { estado: 'hecho', queja: vista(f, hoy) }
}

async function historial(correduriaId: string, clienteId: string, polizaId: string | null, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    // La nota es un extra: la queja ya está registrada y su reloj corre igual.
    console.error('[quejas] no se pudo anotar en el historial:', e instanceof Error ? e.message : e)
  }
}
