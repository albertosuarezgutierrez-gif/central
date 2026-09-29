/**
 * El riesgo como pantalla (29/09/2026, diseño docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md).
 *
 * «Nosotros aseguramos riesgos: el riesgo no cambia, lo que cambia es la persona» (Alberto). Una
 * oportunidad es un riesgo; dentro tiene FIGURAS (tomador, propietario, conductores) y VARIANTES
 * (cada tarificación que se ha hecho sobre él, quizá con otro tomador). Aquí se leen y se escriben.
 *
 * - Toda consulta va acotada a la correduría: con BYPASSRLS un id ajeno no falla, da los datos de otro.
 * - Cada figura es una FICHA (cliente_id): agrupar por identidad, nunca por el nombre.
 * - El DNI no sale de aquí: la pantalla recibe nombres; la petición al vendor la arma el servidor.
 * - Una lectura que falla devuelve `null`, nunca una lista vacía que diría «no hay variantes».
 */
import { prisma } from '@/lib/tenant'
import { mismaPersonaPorNombre } from './misma-persona'
import { altaCliente } from '@/lib/cartera-edicion'
import { crearRelacion } from '@/lib/cartera-relaciones'
import { clienteOrigenDe } from '@/lib/cartera-ficha'
import { partirApellidos, sexoDeSaludo, carnetBDeFicha } from '@/lib/codeoscopic/desde-cartera'
import type { DatosPersona } from '@/lib/codeoscopic/persona'
import {
  diferenciasVariante,
  esRolFigura,
  rolesDelRamo,
  type Diferencia,
  type FigurasVariante,
  type RolFigura,
} from '@central/module-seguros'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FiguraRiesgo = {
  rol: RolFigura
  clienteId: string
  nombre: string
  /** Vínculo con quien lleva la oportunidad («Padre/Madre»). NULL = es él mismo o no hay vínculo anotado. */
  vinculo: string | null
  /** true = no hay fila: es quien lleva la oportunidad (tomador por defecto). */
  porDefecto: boolean
  /** Qué le falta en su ficha para cotizar (sin contar el estado civil). NULL = no se pudo leer. */
  faltan: string[] | null
}

export type VarianteRiesgo = {
  id: string
  /** P1, P2… por orden de creación dentro del riesgo. */
  referencia: string
  creadoAt: string
  tomador: { clienteId: string | null; nombre: string | null }
  /** La póliza que se retarificó en esta variante (renovación). NULL = presupuesto de cliente nuevo. */
  polizaId: string | null
  nota: string | null
  simulado: boolean
  fechaEfecto: string | null
  nPrecios: number
  mejor: { compania: string | null; primaEur: number } | null
  presupuesto: {
    id: string
    enviadoAt: string | null
    vistoAt: string | null
    elegidoAt: string | null
    aceptadoAt: string | null
    emitidoAt: string | null
    retiradoAt: string | null
  } | null
  /** Lo que cambió respecto a la variante ANTERIOR. `null` = no se puede comparar; `[]` en la primera. */
  cambios: Diferencia[] | null
}

export type Riesgo = {
  oportunidad: {
    id: string
    clienteId: string
    clienteNombre: string
    ramo: string
    estado: string
    polizaId: string | null
    matricula: string | null
    vehiculo: string | null
    vence: string | null
    aseguradora: string | null
    prima: number | null
  }
  roles: readonly RolFigura[]
  figuras: FiguraRiesgo[]
  vinculos: Array<{ clienteId: string; nombre: string; tipo: string }>
  variantes: VarianteRiesgo[]
}

const nombreDe = (n: string | null, a: string | null) => `${n ?? ''} ${a ?? ''}`.trim() || 'Sin nombre'

export async function leerRiesgo(correduriaId: string, oportunidadId: string): Promise<Riesgo | null> {
  if (!UUID.test(oportunidadId)) return null
  const [op] = await prisma.$queryRaw<
    Array<{
      id: string; cliente_id: string; nombre: string | null; apellidos: string | null; tipo: string; estado: string
      poliza_id: string | null; info_riesgo: Record<string, unknown> | null; fecha_fin_vigencia: Date | null
      aseguradora: string | null; prima: string | null
    }>
  >`
    select o.id::text as id, o.cliente_id::text as cliente_id, c.nombre, c.apellidos, o.tipo::text as tipo,
           o.estado::text as estado, o.poliza_id::text as poliza_id, o.info_riesgo, o.fecha_fin_vigencia,
           coalesce(o.poliza_competencia->>'aseguradora', o.aseguradora_ganadora) as aseguradora,
           o.prima_bruta::text as prima
    from seguros.oportunidades o
    join seguros.clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    where o.id = ${oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
  if (!op) return null

  const figs = await prisma.$queryRaw<Array<{ rol: string; cliente_id: string; nombre: string | null; apellidos: string | null; vinculo: string | null }>>`
    select f.rol, f.cliente_id::text as cliente_id, c.nombre, c.apellidos,
           (select r.tipo_relacion from seguros.cliente_relaciones r
             where r.correduria_id = f.correduria_id and r.cliente_a_id = ${op.cliente_id}::uuid and r.cliente_b_id = f.cliente_id
             limit 1) as vinculo
    from seguros.oportunidad_figura f
    join seguros.clientes c on c.id = f.cliente_id and c.correduria_id = f.correduria_id
    where f.oportunidad_id = ${op.id}::uuid and f.correduria_id = ${correduriaId}::uuid`

  const vinculos = await prisma.$queryRaw<Array<{ cliente_id: string; nombre: string | null; apellidos: string | null; tipo: string }>>`
    select distinct on (r.cliente_b_id) r.cliente_b_id::text as cliente_id, c.nombre, c.apellidos, r.tipo_relacion as tipo
    from seguros.cliente_relaciones r
    join seguros.clientes c on c.id = r.cliente_b_id and c.correduria_id = r.correduria_id and c.merged_into_cliente_id is null
    where r.correduria_id = ${correduriaId}::uuid and r.cliente_a_id = ${op.cliente_id}::uuid and r.tipo_relacion <> 'Sin vínculo'
    order by r.cliente_b_id, r.tipo_relacion`

  const vars = await prisma.$queryRaw<
    Array<{
      id: string; creado_at: Date; cliente_id: string | null; nombre: string | null; apellidos: string | null
      poliza_id: string | null; nota: string | null; simulado: boolean; fecha_efecto: Date | null; peticion: unknown
      n_precios: number; mejor_compania: string | null; mejor_prima: string | null
      p_id: string | null; enviado_at: Date | null; visto_at: Date | null; elegido_at: Date | null
      aceptado_at: Date | null; emitido_at: Date | null; retirado_at: Date | null
    }>
  >`
    select t.id::text as id, t.creado_at, coalesce(t.cliente_id, pol.cliente_id)::text as cliente_id, c.nombre, c.apellidos, t.poliza_id::text as poliza_id, t.nota, t.simulado,
           t.fecha_efecto, t.peticion,
           (select count(*)::int from seguros.tarificacion_precios x where x.tarificacion_id = t.id and x.prima_eur is not null) as n_precios,
           m.compania as mejor_compania, m.prima_eur::text as mejor_prima,
           p.id::text as p_id, p.enviado_at, p.visto_at, p.elegido_at, p.aceptado_at, p.emitido_at, p.retirado_at
    from seguros.tarificaciones t
    -- Una retarificación de póliza no guarda cliente_id: el tomador es el de la póliza.
    left join seguros.polizas pol on pol.id = t.poliza_id and pol.correduria_id = t.correduria_id
    left join seguros.clientes c on c.id = coalesce(t.cliente_id, pol.cliente_id) and c.correduria_id = t.correduria_id
    left join lateral (
      select x.compania, x.prima_eur from seguros.tarificacion_precios x
      where x.tarificacion_id = t.id and x.prima_eur is not null order by x.prima_eur asc limit 1
    ) m on true
    left join lateral (
      select * from seguros.presupuesto pr
      where pr.tarificacion_id = t.id and pr.correduria_id = t.correduria_id order by pr.creado_at desc limit 1
    ) p on true
    where t.oportunidad_id = ${op.id}::uuid and t.correduria_id = ${correduriaId}::uuid
    order by t.creado_at asc`

  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  const variantes: VarianteRiesgo[] = vars.map((v, i) => ({
    id: v.id,
    referencia: `P${i + 1}`,
    creadoAt: v.creado_at.toISOString(),
    tomador: { clienteId: v.cliente_id, nombre: v.cliente_id ? nombreDe(v.nombre, v.apellidos) : null },
    polizaId: v.poliza_id,
    nota: v.nota,
    simulado: v.simulado,
    fechaEfecto: v.fecha_efecto ? v.fecha_efecto.toISOString().slice(0, 10) : null,
    nPrecios: Number(v.n_precios),
    mejor: v.mejor_prima !== null ? { compania: v.mejor_compania, primaEur: Number(v.mejor_prima) } : null,
    presupuesto: v.p_id
      ? {
          id: v.p_id, enviadoAt: iso(v.enviado_at), vistoAt: iso(v.visto_at), elegidoAt: iso(v.elegido_at),
          aceptadoAt: iso(v.aceptado_at), emitidoAt: iso(v.emitido_at), retiradoAt: iso(v.retirado_at),
        }
      : null,
    cambios: i === 0 ? [] : diferenciasVariante(vars[i - 1].peticion, v.peticion),
  }))
  // La más reciente primero: es la que se está trabajando.
  variantes.reverse()

  const info = op.info_riesgo ?? {}
  const texto = (k: string) => (typeof info[k] === 'string' && (info[k] as string).trim() !== '' ? (info[k] as string).trim() : null)
  const vehiculo = texto('vehiculo') ?? ([texto('marca'), texto('modelo')].filter(Boolean).join(' ') || null)

  const figuras: FiguraRiesgo[] = figs
    .filter((f) => esRolFigura(f.rol))
    .map((f) => ({
      rol: f.rol as RolFigura,
      clienteId: f.cliente_id,
      nombre: nombreDe(f.nombre, f.apellidos),
      vinculo: f.cliente_id === op.cliente_id ? null : f.vinculo,
      porDefecto: false,
      faltan: null,
    }))
  if (!figuras.some((f) => f.rol === 'tomador')) {
    figuras.unshift({ rol: 'tomador', clienteId: op.cliente_id, nombre: nombreDe(op.nombre, op.apellidos), vinculo: null, porDefecto: true, faltan: null })
  }
  for (const f of figuras) {
    const p = await personaDeFicha(correduriaId, f.clienteId).catch(() => null)
    f.faltan = p === null ? null : faltanDeFigura(p, f.rol === 'conductor_habitual' || f.rol === 'conductor_ocasional' || f.rol === 'tomador')
  }

  return {
    oportunidad: {
      id: op.id,
      clienteId: op.cliente_id,
      clienteNombre: nombreDe(op.nombre, op.apellidos),
      ramo: op.tipo,
      estado: op.estado,
      polizaId: op.poliza_id,
      matricula: texto('matricula'),
      vehiculo,
      vence: op.fecha_fin_vigencia ? op.fecha_fin_vigencia.toISOString().slice(0, 10) : null,
      aseguradora: op.aseguradora,
      prima: op.prima !== null ? Number(op.prima) : null,
    },
    roles: rolesDelRamo(op.tipo),
    figuras,
    vinculos: vinculos.map((v) => ({ clienteId: v.cliente_id, nombre: nombreDe(v.nombre, v.apellidos), tipo: v.tipo })),
    variantes,
  }
}

export type ResultadoFigura = { ok: true } | { ok: false; status: number; motivo: string }

/**
 * Asigna una ficha a un rol del riesgo. La persona tiene que ser quien lleva la oportunidad o
 * alguien VINCULADO a ella (relaciones, sin «Sin vínculo»): así nadie acaba de tomador de un
 * riesgo ajeno por un id tecleado.
 */
export async function asignarFigura(
  correduriaId: string,
  e: { oportunidadId: string; rol: unknown; clienteId: string; actor: string },
): Promise<ResultadoFigura> {
  if (!UUID.test(e.oportunidadId) || !UUID.test(e.clienteId)) return { ok: false, status: 400, motivo: 'ids no válidos' }
  if (!esRolFigura(e.rol)) return { ok: false, status: 422, motivo: 'rol desconocido' }
  const rol = e.rol
  return prisma.$transaction(async (tx) => {
    const [op] = await tx.$queryRaw<Array<{ cliente_id: string; tipo: string }>>`
      select cliente_id::text as cliente_id, tipo::text as tipo from seguros.oportunidades
      where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
    if (!op) return { ok: false as const, status: 404, motivo: 'la oportunidad no es de esta correduría' }
    if (!rolesDelRamo(op.tipo).includes(rol)) return { ok: false as const, status: 422, motivo: `en ${op.tipo} no hay ${rol}` }
    if (e.clienteId !== op.cliente_id) {
      const [v] = await tx.$queryRaw<Array<{ n: number }>>`
        select count(*)::int as n from seguros.cliente_relaciones r
        join seguros.clientes c on c.id = r.cliente_b_id and c.correduria_id = r.correduria_id and c.merged_into_cliente_id is null
        where r.correduria_id = ${correduriaId}::uuid and r.cliente_a_id = ${op.cliente_id}::uuid
          and r.cliente_b_id = ${e.clienteId}::uuid and r.tipo_relacion <> 'Sin vínculo'`
      if (!v || v.n === 0) return { ok: false as const, status: 422, motivo: 'esa persona no está vinculada al cliente: añádela como familiar primero' }
    }
    await tx.$executeRaw`
      insert into seguros.oportunidad_figura (correduria_id, oportunidad_id, rol, cliente_id, actor)
      values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, ${rol}, ${e.clienteId}::uuid, ${e.actor})
      on conflict (oportunidad_id, rol) do update set cliente_id = excluded.cliente_id, actor = excluded.actor, creado_at = now()`
    await tx.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, 'figura_asignada',
              ${JSON.stringify({ rol, clienteId: e.clienteId })}::jsonb, ${e.actor})`
    return { ok: true as const }
  })
}

/** Quita una figura: ese rol vuelve a ser «el mismo que el tomador» (o el cliente, si es el tomador). */
export async function quitarFigura(
  correduriaId: string,
  e: { oportunidadId: string; rol: unknown; actor: string },
): Promise<ResultadoFigura> {
  if (!UUID.test(e.oportunidadId)) return { ok: false, status: 400, motivo: 'id no válido' }
  if (!esRolFigura(e.rol)) return { ok: false, status: 422, motivo: 'rol desconocido' }
  const n = await prisma.$executeRaw`
    delete from seguros.oportunidad_figura
    where oportunidad_id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and rol = ${e.rol}`
  if (n > 0) {
    await prisma.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, 'figura_quitada', ${JSON.stringify({ rol: e.rol })}::jsonb, ${e.actor})`
  }
  return { ok: true }
}

/**
 * «Mírame a nombre de mi padre»: da de alta a la persona (lead), la vincula al cliente de la
 * oportunidad y la asigna al rol, sin salir de la pantalla. Si el DNI ya existe, no se crea: se
 * devuelve la ficha que lo tiene para asignarla (vinculándola si hace falta).
 */
export async function nuevaPersonaEnRiesgo(
  correduriaId: string,
  e: { oportunidadId: string; rol: unknown; tipoRelacion: unknown; persona: Record<string, unknown>; actor: string },
): Promise<{ ok: true; clienteId: string; existente: boolean } | { ok: false; status: number; motivo: string; conflicto?: unknown }> {
  if (!UUID.test(e.oportunidadId)) return { ok: false, status: 400, motivo: 'id no válido' }
  if (!esRolFigura(e.rol)) return { ok: false, status: 422, motivo: 'rol desconocido' }
  const [op] = await prisma.$queryRaw<Array<{ cliente_id: string }>>`
    select cliente_id::text as cliente_id from seguros.oportunidades
    where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!op) return { ok: false, status: 404, motivo: 'la oportunidad no es de esta correduría' }

  const alta = await altaCliente(correduriaId, { ...e.persona }, e.actor)
  let clienteId: string
  let existente = false
  if (alta.ok) clienteId = alta.id
  else {
    // DNI repetido = la misma persona: se usa la ficha que ya existe.
    const f = alta as { estado?: string; coincidencias?: Array<{ id: string; por: string }> }
    const mismoDni = f.estado === 'conflicto' ? f.coincidencias?.find((c) => c.por === 'dni') : undefined
    if (!mismoDni) return { ok: false, status: 'status' in alta && typeof alta.status === 'number' ? alta.status : 422, motivo: 'motivo' in alta ? String(alta.motivo) : 'no se pudo dar de alta', conflicto: f.coincidencias }
    // El DNI identifica, pero un DNI mal tecleado apunta a OTRA persona: si el nombre de esa ficha no
    // casa con lo escrito, no se usa (se vincularía y cotizaría a un desconocido).
    const [ficha] = await prisma.$queryRaw<Array<{ nombre: string | null; apellidos: string | null }>>`
      select nombre, apellidos from seguros.clientes where id = ${mismoDni.id}::uuid and correduria_id = ${correduriaId}::uuid`
    if (!ficha || !mismaPersonaPorNombre(e.persona, ficha)) {
      const suyo = ficha ? [ficha.nombre, ficha.apellidos].filter(Boolean).join(' ') : null
      return { ok: false, status: 409, motivo: `ese DNI ya está en la ficha de ${suyo ?? 'otra persona'}: revisa el DNI o el nombre` }
    }
    clienteId = mismoDni.id
    existente = true
  }

  // Lo que la compañía exige y el alta no guarda: sexo (saludo) y estado civil. Solo si viene.
  const sexo = e.persona.sexo === 'hombre' ? '1' : e.persona.sexo === 'mujer' ? '2' : null
  const estadoCivil = typeof e.persona.estadoCivil === 'string' && e.persona.estadoCivil.trim() !== '' ? e.persona.estadoCivil.trim().slice(0, 40) : null
  if (!existente && (sexo || estadoCivil)) {
    await prisma.$executeRaw`
      update seguros.clientes set saludo = coalesce(${sexo}, saludo), estado_civil = coalesce(${estadoCivil}, estado_civil), updated_at = now()
      where id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid`
  }

  if (clienteId !== op.cliente_id) {
    const rel = await crearRelacion(correduriaId, op.cliente_id, { relacionadoId: clienteId, tipo: e.tipoRelacion, actor: e.actor })
    // 409 = ya estaban vinculados: vale igual.
    if (!rel.ok && rel.status !== 409) return { ok: false, status: rel.status, motivo: `ficha creada, pero no se pudo vincular: ${rel.motivo}` }
  }
  const asig = await asignarFigura(correduriaId, { oportunidadId: e.oportunidadId, rol: e.rol, clienteId, actor: e.actor })
  if (!asig.ok) return asig
  return { ok: true, clienteId, existente }
}

/**
 * Comprueba lo que manda la pantalla para cotizar una VARIANTE: la oportunidad es de esta
 * correduría y cada figura es una ficha de ella. Gratis, antes de gastar.
 */
export async function validarVariante(
  correduriaId: string,
  e: { oportunidadId: string; figuras: FigurasVariante | null },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!UUID.test(e.oportunidadId)) return { ok: false, motivo: 'oportunidad no válida' }
  const [op] = await prisma.$queryRaw<Array<{ id: string }>>`
    select id::text as id from seguros.oportunidades where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
      and estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')`
  // Un riesgo ganado o perdido no se sigue: pedir precio ahí es pagar 0,50€ por nada.
  if (!op) return { ok: false, motivo: 'la oportunidad no es de esta correduría o ya está cerrada' }
  const ids = Object.values(e.figuras ?? {}).filter((x): x is string => typeof x === 'string')
  if (ids.length > 0) {
    const [n] = await prisma.$queryRaw<Array<{ n: number }>>`
      select count(distinct id)::int as n from seguros.clientes
      where id = any(${ids}::uuid[]) and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
    if (!n || n.n !== new Set(ids).size) return { ok: false, motivo: 'alguna figura no es una ficha de esta correduría' }
  }
  return { ok: true }
}

type PersonaFigura = Partial<DatosPersona> & { fechaCarnet?: string }

/**
 * Los datos de una figura sacados de SU ficha, para armar la petición en el servidor (el DNI no
 * viaja a la pantalla). Lo que la ficha no tiene se queda sin poner y lo completa el corredor: aquí
 * no se supone nada de una persona.
 */
export async function personaDeFicha(correduriaId: string, clienteId: string): Promise<PersonaFigura | null> {
  const o = await clienteOrigenDe(correduriaId, clienteId)
  if (!o) return null
  const c = o.cliente
  const { primero, segundo } = partirApellidos(c.apellidos)
  const limpio = (v: string | null | undefined) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
  return {
    dni: limpio(c.dni),
    nombre: limpio(c.nombre),
    apellido1: primero ?? undefined,
    apellido2: segundo ?? undefined,
    fechaNacimiento: limpio(c.fechaNacimiento),
    sexo: sexoDeSaludo(c.saludo) ?? undefined,
    telefono: limpio(c.telefono)?.replace(/\s/g, ''),
    fechaCarnet: limpio(c.fechaCarnet) ?? carnetBDeFicha(c.carnets) ?? undefined,
  }
}

/** Qué le falta a una figura para poder cotizar (el estado civil lo elige el corredor del catálogo). */
export function faltanDeFigura(p: PersonaFigura | null, conCarnet: boolean): string[] {
  if (!p) return ['ficha']
  const f: string[] = []
  for (const k of ['dni', 'nombre', 'apellido1', 'fechaNacimiento', 'sexo', 'telefono'] as const) if (!p[k]) f.push(k)
  if (conCarnet && !p.fechaCarnet) f.push('fechaCarnet')
  return f
}

/** Qué rol de figura va a qué clave de `DatosAuto` (lo que ya sabe construir la petición). */
const CLAVE_DATOS: Partial<Record<RolFigura, 'propietario' | 'conductor' | 'conductorOcasional'>> = {
  propietario: 'propietario',
  conductor_habitual: 'conductor',
  conductor_ocasional: 'conductorOcasional',
}

export type VarianteEntrada = {
  /** Lo que se añade al contexto de la cotización: de qué riesgo es y con qué figuras. */
  contexto: { oportunidadId: string; figuras: FigurasVariante | null; nota: string | null } | null
  /** Correcciones con las figuras rellenas desde SUS fichas (lo tecleado por el corredor manda encima). */
  correcciones: Record<string, unknown> | undefined
}

/**
 * Prepara una cotización que es VARIANTE de un riesgo (auto-nuevo / moto-nuevo con `oportunidadId`).
 * Gratis. Si no viene oportunidad, devuelve el cuerpo tal cual: el camino de siempre.
 * Para auto, las figuras distintas del tomador se arman desde sus fichas; moto aún manda la misma
 * persona en todos los papeles (entrega 2), así que ahí solo se guarda la foto.
 */
export async function prepararVariante(
  correduriaId: string,
  e: { tomadorId: string; ramo: 'auto' | 'moto'; cuerpo: Record<string, unknown>; correcciones: Record<string, unknown> | undefined },
): Promise<{ ok: true; v: VarianteEntrada } | { ok: false; motivo: string }> {
  const oportunidadId = typeof e.cuerpo.oportunidadId === 'string' ? e.cuerpo.oportunidadId.trim() : ''
  if (oportunidadId === '') return { ok: true, v: { contexto: null, correcciones: e.correcciones } }
  const figuras = limpiarFigurasEntrada(e.cuerpo.figuras, e.tomadorId)
  const val = await validarVariante(correduriaId, { oportunidadId, figuras })
  if (!val.ok) return val
  const nota = typeof e.cuerpo.nota === 'string' && e.cuerpo.nota.trim() !== '' ? e.cuerpo.nota.trim().slice(0, 200) : null

  let correcciones = e.correcciones
  if (e.ramo === 'auto' && figuras) {
    correcciones = { ...(correcciones ?? {}) }
    for (const [rol, clave] of Object.entries(CLAVE_DATOS) as Array<[RolFigura, string]>) {
      const id = figuras[rol]
      if (!id || id === e.tomadorId) continue
      const deFicha = await personaDeFicha(correduriaId, id)
      if (!deFicha) return { ok: false, motivo: `no se pudo leer la ficha de la figura ${rol}` }
      const tecleado = typeof correcciones[clave] === 'object' && correcciones[clave] !== null ? (correcciones[clave] as Record<string, unknown>) : {}
      const soloConValor = Object.fromEntries(Object.entries(tecleado).filter(([, v]) => v !== '' && v !== null && v !== undefined))
      correcciones[clave] = { ...deFicha, ...soloConValor }
    }
  }
  return { ok: true, v: { contexto: { oportunidadId, figuras, nota }, correcciones } }
}

/** Solo roles conocidos y uuids; el tomador siempre es quien cotiza (el cliente de la ruta). */
function limpiarFigurasEntrada(v: unknown, tomadorId: string): FigurasVariante | null {
  const out: FigurasVariante = { tomador: tomadorId }
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!esRolFigura(k) || k === 'tomador') continue
      if (typeof x === 'string' && UUID.test(x)) out[k] = x
    }
  }
  return out
}

// ─── Comparar dos variantes ─────────────────────────────────────────────────

export type PrecioComparado = { primaEur: number; modalidad: string | null } | null
export type Comparacion = {
  a: string
  b: string
  /** Qué cambia de `a` a `b`. `null` = alguna petición no se puede leer. */
  cambios: Diferencia[] | null
  /** Mejor prima de cada compañía en cada variante; `null` = esa compañía no dio precio ahí. */
  companias: Array<{ compania: string; a: PrecioComparado; b: PrecioComparado }>
}

/** Dos variantes del MISMO riesgo, campo a campo y compañía a compañía. Gratis, solo lectura. */
export async function compararVariantes(correduriaId: string, oportunidadId: string, a: string, b: string): Promise<Comparacion | null> {
  if (![oportunidadId, a, b].every((x) => UUID.test(x)) || a === b) return null
  const ts = await prisma.$queryRaw<Array<{ id: string; peticion: unknown }>>`
    select id::text as id, peticion from seguros.tarificaciones
    where id = any(${[a, b]}::uuid[]) and oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
  const ta = ts.find((t) => t.id === a)
  const tb = ts.find((t) => t.id === b)
  if (!ta || !tb) return null
  const precios = await prisma.$queryRaw<Array<{ tarificacion_id: string; compania: string | null; modalidad: string | null; prima_eur: string }>>`
    select distinct on (x.tarificacion_id, x.compania) x.tarificacion_id::text as tarificacion_id, x.compania, x.modalidad, x.prima_eur::text as prima_eur
    from seguros.tarificacion_precios x
    join seguros.tarificaciones t on t.id = x.tarificacion_id and t.correduria_id = ${correduriaId}::uuid
    where x.tarificacion_id = any(${[a, b]}::uuid[]) and x.prima_eur is not null
    order by x.tarificacion_id, x.compania, x.prima_eur asc`
  const porCompania = new Map<string, { a: PrecioComparado; b: PrecioComparado }>()
  for (const p of precios) {
    const nombre = p.compania?.trim() || 'Sin compañía'
    const fila = porCompania.get(nombre) ?? { a: null, b: null }
    fila[p.tarificacion_id === a ? 'a' : 'b'] = { primaEur: Number(p.prima_eur), modalidad: p.modalidad }
    porCompania.set(nombre, fila)
  }
  const companias = [...porCompania.entries()]
    .map(([compania, v]) => ({ compania, ...v }))
    .sort((x, y) => Math.min(x.a?.primaEur ?? Infinity, x.b?.primaEur ?? Infinity) - Math.min(y.a?.primaEur ?? Infinity, y.b?.primaEur ?? Infinity))
  return { a, b, cambios: diferenciasVariante(ta.peticion, tb.peticion), companias }
}

// ─── El riesgo de una póliza (renovación / retención) ───────────────────────

const ROL_DESDE_INTERVINIENTE: Record<string, RolFigura> = {
  propietario: 'propietario',
  conductor_habitual: 'conductor_habitual',
  conductor_ocasional: 'conductor_ocasional',
}

/**
 * Abre (o devuelve la abierta) la oportunidad de ESTA póliza para retarificarla, con las figuras que
 * CIMA/la ficha ya tienen enlazadas a una persona. Gratis. Nunca toca la póliza.
 */
export async function abrirRiesgoDePoliza(
  correduriaId: string,
  e: { polizaId: string; actor: string },
): Promise<{ ok: true; oportunidadId: string; nueva: boolean } | { ok: false; status: number; motivo: string }> {
  if (!UUID.test(e.polizaId)) return { ok: false, status: 400, motivo: 'id no válido' }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`riesgo-poliza:${e.polizaId}`}))`
    const [pol] = await tx.$queryRaw<Array<{ cliente_id: string; tipo: string; aseguradora: string | null; datos: Record<string, unknown> | null }>>`
      select p.cliente_id::text as cliente_id, p.tipo::text as tipo, p.aseguradora, p.datos_especificos as datos
      from seguros.polizas p
      join seguros.clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id and c.merged_into_cliente_id is null
      where p.id = ${e.polizaId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null`
    if (!pol) return { ok: false as const, status: 404, motivo: 'la póliza no es de esta correduría' }

    // La abierta de esta póliza: por `poliza_id` o, si la abrió una retarificación de antes (que solo
    // anotaba `info_riesgo.polizaId`), esa misma — se le pone el `poliza_id` en vez de abrir otra.
    const [ya] = await tx.$queryRaw<Array<{ id: string; poliza_id: string | null }>>`
      select id::text as id, poliza_id::text as poliza_id from seguros.oportunidades
      where correduria_id = ${correduriaId}::uuid
        and (poliza_id = ${e.polizaId}::uuid or (poliza_id is null and info_riesgo->>'polizaId' = ${e.polizaId}))
        and estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      order by (poliza_id is not null) desc, created_at desc limit 1`
    if (ya) {
      if (ya.poliza_id === null) {
        await tx.$executeRaw`
          update seguros.oportunidades set poliza_id = ${e.polizaId}::uuid, updated_at = now()
          where id = ${ya.id}::uuid and correduria_id = ${correduriaId}::uuid`
      }
      return { ok: true as const, oportunidadId: ya.id, nueva: false }
    }

    const d = pol.datos ?? {}
    const txt = (k: string) => (typeof d[k] === 'string' && (d[k] as string).trim() !== '' ? (d[k] as string).trim() : null)
    const info = { origen: 'poliza:riesgo', polizaId: e.polizaId, matricula: txt('matricula'), marca: txt('marca'), modelo: txt('modelo'), aseguradora: pol.aseguradora }
    const [o] = await tx.$queryRaw<Array<{ id: string }>>`
      insert into seguros.oportunidades (correduria_id, cliente_id, tipo, fuente, estado, info_riesgo, poliza_id)
      values (${correduriaId}::uuid, ${pol.cliente_id}::uuid, cast(${pol.tipo} as seguros.tipo_seguro), 'renovacion', 'en_negociacion',
              ${JSON.stringify(info)}::jsonb, ${e.polizaId}::uuid)
      returning id::text as id`

    const roles = rolesDelRamo(pol.tipo)
    const ints = await tx.$queryRaw<Array<{ rol: string; cliente_id: string }>>`
      select distinct on (pi.rol) pi.rol::text as rol, pi.cliente_id::text as cliente_id
      from seguros.poliza_intervinientes pi
      join seguros.clientes c on c.id = pi.cliente_id and c.correduria_id = pi.correduria_id and c.merged_into_cliente_id is null
      where pi.poliza_id = ${e.polizaId}::uuid and pi.correduria_id = ${correduriaId}::uuid and pi.cliente_id is not null
      order by pi.rol, (pi.origen::text = 'cima') desc, pi.created_at desc`
    let figuras = 0
    for (const i of ints) {
      const rol = ROL_DESDE_INTERVINIENTE[i.rol]
      if (!rol || !roles.includes(rol) || i.cliente_id === pol.cliente_id) continue
      await tx.$executeRaw`
        insert into seguros.oportunidad_figura (correduria_id, oportunidad_id, rol, cliente_id, actor)
        values (${correduriaId}::uuid, ${o.id}::uuid, ${rol}, ${i.cliente_id}::uuid, ${e.actor})
        on conflict (oportunidad_id, rol) do nothing`
      figuras++
    }
    await tx.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${o.id}::uuid, 'riesgo_desde_poliza', null, 'en_negociacion',
              ${JSON.stringify({ polizaId: e.polizaId, figuras })}::jsonb, ${e.actor})`
    return { ok: true as const, oportunidadId: o.id, nueva: true }
  })
}

/**
 * Retarificar la póliza DENTRO de su riesgo: la oportunidad tiene que ser de esta correduría y de
 * ESTA póliza. Gratis, antes de gastar. Devuelve el contexto que cuelga la tarificación de ella.
 */
export async function validarRiesgoDePoliza(
  correduriaId: string,
  oportunidadId: string,
  polizaId: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!UUID.test(oportunidadId) || !UUID.test(polizaId)) return { ok: false, motivo: 'ids no válidos' }
  const [o] = await prisma.$queryRaw<Array<{ id: string }>>`
    select id::text as id from seguros.oportunidades
    where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and poliza_id = ${polizaId}::uuid
      and estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')`
  return o ? { ok: true } : { ok: false, motivo: 'ese riesgo no es de esta póliza o ya está cerrado' }
}
