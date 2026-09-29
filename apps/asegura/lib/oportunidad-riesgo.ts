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
      nota: string | null; simulado: boolean; fecha_efecto: Date | null; peticion: unknown
      n_precios: number; mejor_compania: string | null; mejor_prima: string | null
      p_id: string | null; enviado_at: Date | null; visto_at: Date | null; elegido_at: Date | null
      aceptado_at: Date | null; emitido_at: Date | null; retirado_at: Date | null
    }>
  >`
    select t.id::text as id, t.creado_at, t.cliente_id::text as cliente_id, c.nombre, c.apellidos, t.nota, t.simulado,
           t.fecha_efecto, t.peticion,
           (select count(*)::int from seguros.tarificacion_precios x where x.tarificacion_id = t.id and x.prima_eur is not null) as n_precios,
           m.compania as mejor_compania, m.prima_eur::text as mejor_prima,
           p.id::text as p_id, p.enviado_at, p.visto_at, p.elegido_at, p.aceptado_at, p.emitido_at, p.retirado_at
    from seguros.tarificaciones t
    left join seguros.clientes c on c.id = t.cliente_id and c.correduria_id = t.correduria_id
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
    select id::text as id from seguros.oportunidades where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!op) return { ok: false, motivo: 'la oportunidad no es de esta correduría' }
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
