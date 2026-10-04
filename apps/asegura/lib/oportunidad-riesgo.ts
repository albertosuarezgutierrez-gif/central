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
import { carnetDeNuevaPersona } from './carnet-nueva-persona'
import { encryptField } from '@central/module-seguros-pii'
import { altaCliente } from '@/lib/cartera-edicion'
import { crearRelacion } from '@/lib/cartera-relaciones'
import { clienteOrigenDe } from '@/lib/cartera-ficha'
import { partirApellidos, sexoDeSaludo, carnetBDeFicha, carnetMotoDeFicha } from '@/lib/codeoscopic/desde-cartera'
import type { DatosEmpresa, DatosPersona } from '@/lib/codeoscopic/persona'
import { resolverConfig } from '@/lib/codeoscopic/config'
import { municipiosPorCp, tiposDeVia } from '@/lib/codeoscopic/catalogos'
import { partirDireccion, tipoViaDeFicha } from '@/lib/codeoscopic/direccion'
import { anotarCambio } from '@/lib/auditoria'
import {
  admiteDatosVehiculo,
  calcularEdicionRiesgo,
  claveDatosDeRamo,
  datosCapitalDeCotizacion,
  datosVehiculoDeCotizacion,
  datosVehiculoDeInfoRiesgo,
  datosViviendaDeCotizacion,
  diferenciasVariante,
  esRolFigura,
  faltanDatosVehiculo,
  leerBloqueDeRamo,
  leerDatosVehiculo,
  objetoAsegurado,
  precargaDePoliza,
  ramoTarificable,
  rolesDelRamo,
  type CampoVehiculo,
  type ClaveDatosRiesgo,
  type DatosVehiculoRiesgo,
  type Diferencia,
  type FigurasVariante,
  type RamoCapital,
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
  /** Su ficha es una EMPRESA (`tipo_persona = juridica`): va con CIF, sin estado civil, y no conduce. */
  empresa: boolean
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
    /** `true` = `aseguradora` es la de la póliza que tiene HOY (competencia), no la de nuestra oferta. */
    aseguradoraActual: boolean
    prima: number | null
  }
  roles: readonly RolFigura[]
  figuras: FiguraRiesgo[]
  vinculos: Array<{ clienteId: string; nombre: string; tipo: string }>
  variantes: VarianteRiesgo[]
  /**
   * Los datos del vehículo (30/09/2026), solo en auto/moto. De `info_riesgo.datosVehiculo`, con
   * FALLBACK de lectura a las claves antiguas (`matricula`, `vehiculo` texto, `marca`, `modelo`).
   * `null` = el ramo no es de vehículo. Un campo sin dato es `null`, nunca `''` ni `0`.
   */
  datosVehiculo: DatosVehiculoRiesgo | null
  /** Qué falta para poder pedir precio. `null` = el ramo no es de vehículo. */
  faltanVehiculo: CampoVehiculo[] | null
  /**
   * Los datos del riesgo de CUALQUIER ramo (30/09/2026), con el mismo patrón que el vehículo: qué clave de
   * `info_riesgo` es (`datosVehiculo` | `datosVivienda` | `datosCapital` | `datosComercio` | `datosRiesgoLibre`), los datos
   * (`null` = no se sabe, nunca `''`/`0`), los campos que faltan para pedir precio (vacío en los ramos sin
   * tarifa) y si lo que se ve es la PRECARGA de la póliza de la que nace (`dePoliza`, nunca confirmada).
   */
  datosRiesgo: { clave: ClaveDatosRiesgo; datos: Record<string, unknown>; faltan: string[]; dePoliza: boolean; tarifica: boolean }
}

const nombreDe = (n: string | null, a: string | null) => `${n ?? ''} ${a ?? ''}`.trim() || 'Sin nombre'

type ConsultaSql = { $queryRaw: typeof prisma.$queryRaw }

/**
 * La precarga del bloque de datos desde la póliza de la que nace la oportunidad (`datos_especificos` + objeto
 * asegurado): solo para los ramos donde el bien vive ahí (vivienda, comercio y libres) y solo si la oportunidad tiene
 * póliza. Una lectura que falla es «sin precarga» (`null`), nunca un dato inventado ni un error de pantalla.
 */
async function precargaDePolizaDeOportunidad(
  db: ConsultaSql,
  correduriaId: string,
  polizaId: string | null,
  ramo: string,
): Promise<Record<string, unknown> | null> {
  if (!polizaId || !UUID.test(polizaId)) return null
  const clave = claveDatosDeRamo(ramo)
  if (clave !== 'datosVivienda' && clave !== 'datosComercio' && clave !== 'datosRiesgoLibre') return null
  try {
    const [p] = await db.$queryRaw<Array<{ datos: Record<string, unknown> | null }>>`
      select datos_especificos as datos from seguros.polizas
      where id = ${polizaId}::uuid and correduria_id = ${correduriaId}::uuid`
    if (!p) return null
    const objeto = objetoAsegurado({ tipo: ramo, datos: p.datos })
    return precargaDePoliza(ramo, p.datos, objeto)?.valor ?? null
  } catch (err) {
    console.error('[oportunidad-riesgo] precarga de la póliza sin leer:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function leerRiesgo(correduriaId: string, oportunidadId: string): Promise<Riesgo | null> {
  if (!UUID.test(oportunidadId)) return null
  const [op] = await prisma.$queryRaw<
    Array<{
      id: string; cliente_id: string; nombre: string | null; apellidos: string | null; tipo: string; estado: string
      poliza_id: string | null; info_riesgo: Record<string, unknown> | null; fecha_fin_vigencia: Date | null
      aseguradora: string | null; aseguradora_actual: boolean; prima: string | null
    }>
  >`
    select o.id::text as id, o.cliente_id::text as cliente_id, c.nombre, c.apellidos, o.tipo::text as tipo,
           o.estado::text as estado, o.poliza_id::text as poliza_id, o.info_riesgo, o.fecha_fin_vigencia,
           coalesce(o.poliza_competencia->>'aseguradora', o.aseguradora_ganadora) as aseguradora,
           (o.poliza_competencia->>'aseguradora') is not null as aseguradora_actual,
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
  const claveRamo = claveDatosDeRamo(op.tipo)
  const precarga = info[claveRamo] === undefined ? await precargaDePolizaDeOportunidad(prisma, correduriaId, op.poliza_id, op.tipo) : null
  const bloque = leerBloqueDeRamo(op.tipo, info, precarga)
  const texto = (k: string) => (typeof info[k] === 'string' && (info[k] as string).trim() !== '' ? (info[k] as string).trim() : null)
  const conVehiculo = admiteDatosVehiculo(op.tipo)
  const datosVehiculo = conVehiculo ? datosVehiculoDeInfoRiesgo(info) : null
  const propios = conVehiculo ? leerDatosVehiculo(info.datosVehiculo) : null
  // Lo estructurado manda; la clave `vehiculo` de texto queda como fallback de LECTURA (no se pisa).
  const deMarcaModelo = [propios?.marca ?? null, propios?.modelo ?? null].filter(Boolean).join(' ')
  const vehiculo = (deMarcaModelo || null) ?? texto('vehiculo') ?? ([texto('marca'), texto('modelo')].filter(Boolean).join(' ') || null)

  const figuras: FiguraRiesgo[] = figs
    .filter((f) => esRolFigura(f.rol))
    .map((f) => ({
      rol: f.rol as RolFigura,
      clienteId: f.cliente_id,
      nombre: nombreDe(f.nombre, f.apellidos),
      vinculo: f.cliente_id === op.cliente_id ? null : f.vinculo,
      porDefecto: false,
      faltan: null,
      empresa: false,
    }))
  if (!figuras.some((f) => f.rol === 'tomador')) {
    figuras.unshift({ rol: 'tomador', clienteId: op.cliente_id, nombre: nombreDe(op.nombre, op.apellidos), vinculo: null, porDefecto: true, faltan: null, empresa: false })
  }
  for (const f of figuras) {
    const p = await personaDeFicha(correduriaId, f.clienteId, op.tipo === 'moto' ? 'moto' : 'auto').catch(() => null)
    // El carné solo cuenta en un riesgo de vehículo: a un tomador de hogar no se le pide.
    // El tomador solo conduce si no hay un conductor habitual en otra ficha (una empresa tomadora lo necesita).
    const hayConductor = figuras.some((g) => g.rol === 'conductor_habitual' && g.clienteId !== f.clienteId)
    const conduce =
      (op.tipo === 'auto' || op.tipo === 'moto') &&
      (f.rol === 'conductor_habitual' || f.rol === 'conductor_ocasional' || (f.rol === 'tomador' && !hayConductor))
    f.empresa = p !== null && p.tipo === 'juridica'
    f.faltan = p === null ? null : faltanDeFigura(p, conduce)
  }

  return {
    oportunidad: {
      id: op.id,
      clienteId: op.cliente_id,
      clienteNombre: nombreDe(op.nombre, op.apellidos),
      ramo: op.tipo,
      estado: op.estado,
      polizaId: op.poliza_id,
      matricula: propios?.matricula ?? texto('matricula'),
      vehiculo,
      vence: op.fecha_fin_vigencia ? op.fecha_fin_vigencia.toISOString().slice(0, 10) : null,
      aseguradora: op.aseguradora,
      aseguradoraActual: op.aseguradora_actual === true,
      prima: op.prima !== null ? Number(op.prima) : null,
    },
    roles: rolesDelRamo(op.tipo),
    figuras,
    vinculos: vinculos.map((v) => ({ clienteId: v.cliente_id, nombre: nombreDe(v.nombre, v.apellidos), tipo: v.tipo })),
    variantes,
    datosVehiculo,
    faltanVehiculo: datosVehiculo ? faltanDatosVehiculo(datosVehiculo) : null,
    datosRiesgo: { clave: bloque.clave, datos: bloque.datos, faltan: bloque.faltan, dePoliza: bloque.dePoliza, tarifica: ramoTarificable(op.tipo) },
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
  e: {
    oportunidadId: string
    rol: unknown
    clienteId: string
    actor: string
    /**
     * Solo si el rol está LIBRE (03/10/2026, la subida de una póliza): `on conflict do nothing`, así
     * una asignación a mano o simultánea no se pisa nunca. Ocupado → 409 sin tocar nada.
     */
    soloSiLibre?: boolean
  },
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
    if (e.soloSiLibre) {
      const n = await tx.$executeRaw`
        insert into seguros.oportunidad_figura (correduria_id, oportunidad_id, rol, cliente_id, actor)
        values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, ${rol}, ${e.clienteId}::uuid, ${e.actor})
        on conflict (oportunidad_id, rol) do nothing`
      if (n === 0) return { ok: false as const, status: 409, motivo: 'ese rol ya lo tiene otra persona' }
    } else {
      await tx.$executeRaw`
        insert into seguros.oportunidad_figura (correduria_id, oportunidad_id, rol, cliente_id, actor)
        values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, ${rol}, ${e.clienteId}::uuid, ${e.actor})
        on conflict (oportunidad_id, rol) do update set cliente_id = excluded.cliente_id, actor = excluded.actor, creado_at = now()`
    }
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
): Promise<
  | { ok: true; clienteId: string; existente: boolean; carnet: 'guardado' | 'ya_tenia' | 'no_guardado' | null }
  | { ok: false; status: number; motivo: string; conflicto?: unknown }
> {
  if (!UUID.test(e.oportunidadId)) return { ok: false, status: 400, motivo: 'id no válido' }
  if (!esRolFigura(e.rol)) return { ok: false, status: 422, motivo: 'rol desconocido' }
  // El carné se valida ANTES del alta: uno mal tecleado no puede dejar la ficha creada sin él.
  const car = carnetDeNuevaPersona(e.persona, new Date().toISOString().slice(0, 10))
  if (!car.ok) return { ok: false, status: 422, motivo: car.motivo }
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

  // Su carné, en `cliente_carnets_conducir` (cifrado). Uno del mismo tipo que ya esté en la ficha NO
  // se pisa: lo tecleado aquí no manda sobre lo que trae CIMA o se anotó antes. La persona ya está
  // dada de alta y asignada; si el carné no se guarda, se dice en vez de fallar el alta entera.
  let carnet: 'guardado' | 'ya_tenia' | 'no_guardado' | null = null
  if (car.carnet) {
    try {
      const n = await prisma.$executeRaw`
        insert into seguros.cliente_carnets_conducir (cliente_id, correduria_id, tipo, fecha_carnet)
        select ${clienteId}::uuid, ${correduriaId}::uuid, ${car.carnet.tipo}, ${encryptField(car.carnet.fecha)}
        where not exists (
          select 1 from seguros.cliente_carnets_conducir
          where cliente_id = ${clienteId}::uuid and correduria_id = ${correduriaId}::uuid
            and upper(replace(tipo, ' ', '')) = ${car.carnet.tipo})`
      carnet = n > 0 ? 'guardado' : 'ya_tenia'
    } catch (err) {
      console.error('[oportunidad-riesgo] carné de la nueva persona sin guardar', err)
      carnet = 'no_guardado'
    }
  }
  return { ok: true, clienteId, existente, carnet }
}

/**
 * Comprueba lo que manda la pantalla para cotizar una VARIANTE: la oportunidad es de esta
 * correduría y cada figura es una ficha de ella. Gratis, antes de gastar.
 */
export async function validarVariante(
  correduriaId: string,
  e: { oportunidadId: string; figuras: FigurasVariante | null; ramo?: string },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!UUID.test(e.oportunidadId)) return { ok: false, motivo: 'oportunidad no válida' }
  const [op] = await prisma.$queryRaw<Array<{ id: string }>>`
    select id::text as id from seguros.oportunidades where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
      and estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and (${e.ramo ?? null}::text is null or tipo::text = ${e.ramo ?? null}::text)`
  // Un riesgo ganado o perdido no se sigue: pedir precio ahí es pagar 0,50€ por nada. Y un presupuesto de hogar
  // no se cuelga de una oportunidad de auto: el ramo de la variante es el de la oportunidad.
  if (!op) return { ok: false, motivo: 'la oportunidad no es de esta correduría, ya está cerrada o es de otro ramo' }
  const ids = Object.values(e.figuras ?? {}).filter((x): x is string => typeof x === 'string')
  if (ids.length > 0) {
    const [n] = await prisma.$queryRaw<Array<{ n: number }>>`
      select count(distinct id)::int as n from seguros.clientes
      where id = any(${ids}::uuid[]) and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
    if (!n || n.n !== new Set(ids).size) return { ok: false, motivo: 'alguna figura no es una ficha de esta correduría' }
  }
  return { ok: true }
}

type PersonaFigura = Partial<DatosPersona> & { tipo?: undefined; fechaCarnet?: string; tipoCarnet?: string; fechaCarnetB?: string }
/** Una EMPRESA de la cartera (`tipo_persona = juridica`), con su dirección aún en texto. */
type EmpresaFigura = Partial<DatosEmpresa> & { tipo: 'juridica'; direccion?: string }

/**
 * Los datos de una figura sacados de SU ficha, para armar la petición en el servidor (el DNI no
 * viaja a la pantalla). Lo que la ficha no tiene se queda sin poner y lo completa el corredor: aquí
 * no se supone nada de una persona.
 */
export async function personaDeFicha(
  correduriaId: string,
  clienteId: string,
  ramo: string = 'auto',
): Promise<PersonaFigura | EmpresaFigura | null> {
  const o = await clienteOrigenDe(correduriaId, clienteId)
  if (!o) return null
  const c = o.cliente
  const limpio = (v: string | null | undefined) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
  // Una empresa guarda la razón social en `nombre` (+ `apellidos`, vacío en las 72 de la cartera).
  if (c.tipoPersona === 'juridica') {
    return {
      tipo: 'juridica',
      cif: limpio(c.dni)?.toUpperCase().replace(/[\s-]/g, ''),
      razonSocial: limpio([c.nombre, c.apellidos].filter(Boolean).join(' ')),
      telefono: limpio(c.telefono)?.replace(/\s/g, ''),
      email: limpio(c.email),
      cpResidencia: limpio(c.codigoPostal),
      direccion: limpio(c.direccion),
    }
  }
  // En MOTO el carné que cuenta es el de moto (A > A2 > A1 > AM) si consta; si no, el B con su tipo
  // declarado, y el servidor corta antes de gastar si esa moto exige carné de moto.
  const deMoto = ramo === 'moto' ? carnetMotoDeFicha(c.carnets) : null
  const carnetB = limpio(c.fechaCarnet) ?? carnetBDeFicha(c.carnets) ?? undefined
  const carnet = deMoto
    ? { fechaCarnet: deMoto.fecha, tipoCarnet: deMoto.tipo, fechaCarnetB: carnetBDeFicha(c.carnets) ?? undefined }
    : { fechaCarnet: carnetB, ...(ramo === 'moto' && carnetB ? { tipoCarnet: 'B' } : {}) }
  const { primero, segundo } = partirApellidos(c.apellidos)
  return {
    dni: limpio(c.dni),
    nombre: limpio(c.nombre),
    apellido1: primero ?? undefined,
    apellido2: segundo ?? undefined,
    fechaNacimiento: limpio(c.fechaNacimiento),
    sexo: sexoDeSaludo(c.saludo) ?? undefined,
    telefono: limpio(c.telefono)?.replace(/\s/g, ''),
    ...carnet,
  }
}

/** Qué le falta a una figura para poder cotizar (el estado civil lo elige el corredor del catálogo). */
export function faltanDeFigura(p: PersonaFigura | EmpresaFigura | null, conCarnet: boolean): string[] {
  if (!p) return ['ficha']
  const f: string[] = []
  // Empresa: CIF y razón social (en los campos de la pantalla, `dni` y `nombre`). Conducir, nunca:
  // el vendor solo admite Dni/Nie/Passport en el conductor — `empresa_no_conduce` bloquea la figura.
  if (p.tipo === 'juridica') {
    if (conCarnet) f.push('empresa_no_conduce')
    if (!p.cif) f.push('dni')
    if (!p.razonSocial) f.push('nombre')
    return f
  }
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
 * Prepara una cotización que es VARIANTE de un riesgo (auto-, moto-, hogar-, vida-, salud- o decesos-nuevo con
 * `oportunidadId`; 30/09/2026: los cuatro últimos, con solo el tomador como figura). Gratis. Si no viene oportunidad, devuelve el cuerpo tal cual: el camino de siempre.
 * Las figuras distintas del tomador se arman desde sus fichas, en auto y en moto (entrega 2, 29/09/2026:
 * en moto, propietario y conductor habitual; el carné del conductor es el de moto de su ficha).
 */
export async function prepararVariante(
  correduriaId: string,
  e: { tomadorId: string; ramo: 'auto' | 'moto' | 'hogar' | 'vida' | 'salud' | 'decesos'; cuerpo: Record<string, unknown>; correcciones: Record<string, unknown> | undefined },
): Promise<{ ok: true; v: VarianteEntrada } | { ok: false; motivo: string }> {
  const oportunidadId = typeof e.cuerpo.oportunidadId === 'string' ? e.cuerpo.oportunidadId.trim() : ''
  if (oportunidadId === '') return { ok: true, v: { contexto: null, correcciones: e.correcciones } }
  // Fuera de auto/moto el riesgo solo tiene tomador (`rolesDelRamo`): un rol de más en el cuerpo no se cuela.
  const figuras = limpiarFigurasEntrada(e.cuerpo.figuras, e.tomadorId, !admiteDatosVehiculo(e.ramo))
  const val = await validarVariante(correduriaId, { oportunidadId, figuras, ramo: e.ramo })
  if (!val.ok) return val
  const nota = typeof e.cuerpo.nota === 'string' && e.cuerpo.nota.trim() !== '' ? e.cuerpo.nota.trim().slice(0, 200) : null

  // Moto no tiene conductor ocasional (el vendor no lo admite): declararlo sería perderlo en silencio.
  if (e.ramo === 'moto' && figuras?.conductor_ocasional) {
    return { ok: false, motivo: 'en moto no hay conductor ocasional: quítalo del riesgo o cotiza sin él' }
  }

  let correcciones = e.correcciones
  if (figuras) {
    correcciones = { ...(correcciones ?? {}) }
    for (const [rol, clave] of Object.entries(CLAVE_DATOS) as Array<[RolFigura, string]>) {
      const id = figuras[rol]
      if (!id || id === e.tomadorId) continue
      const deFicha = await personaDeFicha(correduriaId, id, e.ramo)
      if (!deFicha) return { ok: false, motivo: `no se pudo leer la ficha de la figura ${rol}` }
      const tecleado = typeof correcciones[clave] === 'object' && correcciones[clave] !== null ? (correcciones[clave] as Record<string, unknown>) : {}
      const soloConValor = Object.fromEntries(Object.entries(tecleado).filter(([, v]) => v !== '' && v !== null && v !== undefined))
      if (deFicha.tipo === 'juridica') {
        // El vendor no admite un CIF de conductor: se corta aquí, gratis, no tras pagar.
        if (rol !== 'propietario') return { ok: false, motivo: 'una empresa solo puede ser propietaria: el conductor tiene que ser una persona' }
        const empresa = await empresaParaCotizar(deFicha, soloConValor)
        // Sin la dirección entera, la compañía la pide al EMITIR y no se puede corregir en un proyecto
        // ya creado: habría que pagar otra tarificación (29/09/2026, moto de un cliente con su empresa
        // de propietaria). Se corta aquí, gratis, diciendo qué falta y dónde se arregla.
        const faltaDir = faltaDireccionEmpresa(empresa)
        if (faltaDir.length > 0) {
          return {
            ok: false,
            motivo:
              `la dirección de la empresa propietaria (${empresa.razonSocial || 'sin nombre'}) está incompleta: falta ${faltaDir.join(', ')}. ` +
              'Corrígela en su ficha, con el tipo de vía delante (p. ej. «Calle Patines, 1»), y vuelve a pedir precio. No se ha gastado nada.',
          }
        }
        correcciones[clave] = empresa
        continue
      }
      correcciones[clave] = { ...deFicha, ...soloConValor }
      // Moto: un conductor con fecha de carné y sin tipo (tecleada a mano) se declara B EXPLÍCITO,
      // para que `reparoCarnetMoto` lo cruce con la cilindrada antes de pagar en vez de dejarlo pasar.
      const c = correcciones[clave] as Record<string, unknown>
      if (e.ramo === 'moto' && clave === 'conductor' && c.fechaCarnet && !c.tipoCarnet) c.tipoCarnet = 'B'
    }
  }
  return { ok: true, v: { contexto: { oportunidadId, figuras, nota }, correcciones } }
}

/**
 * La empresa propietaria lista para la petición: lo tecleado en la pantalla (`dni`/`nombre`, los
 * mismos campos que una persona) manda sobre la ficha, y la dirección se resuelve contra los
 * catálogos del vendor (GET gratis). Lo que no se resuelve no viaja: nunca se inventa un municipio
 * ni un tipo de vía.
 */
async function empresaParaCotizar(f: EmpresaFigura, tecleado: Record<string, unknown>): Promise<DatosEmpresa> {
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
  const { direccion, ...ficha } = f
  const empresa: DatosEmpresa = {
    ...ficha,
    tipo: 'juridica',
    cif: (txt(tecleado.dni) ?? ficha.cif ?? '').toUpperCase().replace(/[\s-]/g, ''),
    razonSocial: txt(tecleado.nombre) ?? ficha.razonSocial ?? '',
    telefono: txt(tecleado.telefono) ?? ficha.telefono,
  }
  const cfg = resolverConfig(process.env, { ignorarInterruptor: true })
  if (cfg.estado !== 'lista' || !empresa.cpResidencia) return empresa
  try {
    const municipios = await municipiosPorCp(cfg.config, empresa.cpResidencia)
    // Un CP con varios municipios no se elige a ciegas: sin municipio no viaja la dirección.
    if (municipios.length === 1 && Number.isFinite(Number(municipios[0].id))) {
      empresa.municipioResidenciaId = Number(municipios[0].id)
      const partida = direccion ? partirDireccion(direccion) : null
      if (partida?.nombre) empresa.nombreVia = partida.nombre
      if (partida?.numero) empresa.numeroVia = partida.numero
      const via = direccion ? tipoViaDeFicha(direccion, await tiposDeVia(cfg.config).catch(() => [])) : null
      if (via) empresa.tipoVia = via.id
    }
  } catch {
    // Catálogo caído: la empresa viaja sin dirección, que es lo mismo que no tenerla.
  }
  return empresa
}

/** Qué le falta a la dirección de una empresa propietaria para poder EMITIR. Puro. */
export function faltaDireccionEmpresa(e: Pick<DatosEmpresa, 'municipioResidenciaId' | 'nombreVia' | 'numeroVia' | 'tipoVia'>): string[] {
  const f: string[] = []
  if (e.municipioResidenciaId === undefined || e.municipioResidenciaId === null) f.push('el municipio (revisa el código postal)')
  if (!e.tipoVia) f.push('el tipo de vía')
  if (!e.nombreVia) f.push('el nombre de la calle')
  if (!e.numeroVia) f.push('el número')
  return f
}

/** Solo roles conocidos y uuids; el tomador siempre es quien cotiza (el cliente de la ruta). */
function limpiarFigurasEntrada(v: unknown, tomadorId: string, soloTomador: boolean): FigurasVariante | null {
  const out: FigurasVariante = { tomador: tomadorId }
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!esRolFigura(k) || k === 'tomador' || soloTomador) continue
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
    // Lo que la póliza ya sabe del bien (vivienda, riesgo libre) se precarga en la clave NUEVA de su ramo, sin
    // confirmar y sin inventar: lo que no hay queda `null`. Auto/moto siguen con las tres claves sueltas de siempre.
    const pre = precargaDePoliza(pol.tipo, d, objetoAsegurado({ tipo: pol.tipo, datos: d }))
    const info: Record<string, unknown> = {
      origen: 'poliza:riesgo', polizaId: e.polizaId, matricula: txt('matricula'), marca: txt('marca'), modelo: txt('modelo'), aseguradora: pol.aseguradora,
      ...(pre ? { [pre.clave]: { ...pre.valor, confirmadoAt: null } } : {}),
    }
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


// ─── Datos del riesgo por ramo (30/09/2026) ─────────────────────────────────

export type ResultadoDatosRiesgo =
  | { ok: true; clave: ClaveDatosRiesgo; datos: Record<string, unknown>; faltan: string[]; cambios: number }
  | { ok: false; status: number; motivo: string; errores?: Array<{ campo: string; motivo: string }> }

/** Prefijo de la fila de historial y de la auditoría: `datos_vehiculo`, `datos_vivienda`… */
const PREFIJO_HISTORIAL: Record<ClaveDatosRiesgo, string> = {
  datosVehiculo: 'datos_vehiculo',
  datosVivienda: 'datos_vivienda',
  datosCapital: 'datos_capital',
  datosComercio: 'datos_comercio',
  datosRiesgoLibre: 'datos_riesgo_libre',
}

/**
 * Edita (y/o confirma) los datos del riesgo de una oportunidad, de CUALQUIER ramo. `clave` dice qué bloque
 * (`datosVehiculo` | `datosVivienda` | `datosCapital` | `datosComercio` | `datosRiesgoLibre`) y TIENE que ser el del ramo de la
 * oportunidad (400 si no). Se guarda bajo esa clave NUEVA de `info_riesgo`: el resto de claves se conservan tal
 * cual (la `vehiculo` de texto, `presupuestoCodeoscopic`…). Con `confirmar` se sella `confirmadoAt`; cualquier
 * edición sin confirmar lo borra. Fila en `oportunidad_historial` con qué cambió; la de `auditoria` la pone
 * `auditado()` en la ruta. Lectura + escritura en UNA transacción con la fila bloqueada; toda la lógica (validar,
 * aplicar, sello, fusión) es `calcularEdicionRiesgo` de module-seguros, con test.
 */
export async function editarDatosRiesgo(
  correduriaId: string,
  e: { oportunidadId: string; clave: ClaveDatosRiesgo; datos: unknown; confirmar: boolean; actor: string },
): Promise<ResultadoDatosRiesgo> {
  if (!UUID.test(e.oportunidadId)) return { ok: false, status: 400, motivo: 'id no válido' }
  const ahora = new Date().toISOString()
  return prisma.$transaction(async (tx) => {
    const [op] = await tx.$queryRaw<Array<{ tipo: string; info_riesgo: Record<string, unknown> | null; poliza_id: string | null }>>`
      select o.tipo::text as tipo, o.info_riesgo, o.poliza_id::text as poliza_id from seguros.oportunidades o
      where o.id = ${e.oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid
      for update`
    if (!op) return { ok: false as const, status: 404, motivo: 'la oportunidad no es de esta correduría' }
    // Se parte de lo ESTRUCTURADO que hay y, sin ello, de la precarga de la póliza (para no perder lo que se veía).
    const precarga = op.info_riesgo?.[e.clave] === undefined ? await precargaDePolizaDeOportunidad(tx, correduriaId, op.poliza_id, op.tipo) : null
    const r = calcularEdicionRiesgo({ ramo: op.tipo, clave: e.clave, info: op.info_riesgo, parcial: e.datos ?? {}, confirmar: e.confirmar, ahora, precarga })
    if (!r.ok) return { ok: false as const, status: r.status, motivo: r.motivo, errores: r.errores }
    if (!r.hayQueEscribir) return { ok: true as const, clave: r.clave, datos: r.datos, faltan: r.faltan, cambios: 0 }
    await tx.$executeRaw`
      update seguros.oportunidades set info_riesgo = ${JSON.stringify(r.infoNueva)}::jsonb
      where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`
    const pref = PREFIJO_HISTORIAL[r.clave]
    await tx.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, ${e.confirmar ? `${pref}_confirmados` : `${pref}_editados`},
              ${JSON.stringify({ cambios: r.cambios, confirmado: r.datos.confirmadoAt !== null })}::jsonb, ${e.actor})`
    for (const c of r.cambios) anotarCambio({ entidad: 'oportunidad', id: e.oportunidadId, campo: `${pref}.${c.campo}` })
    if (e.confirmar) anotarCambio({ entidad: 'oportunidad', id: e.oportunidadId, campo: `${pref}.confirmado` })
    return { ok: true as const, clave: r.clave, datos: r.datos, faltan: r.faltan, cambios: r.cambios.length }
  })
}

/**
 * Write-back de una cotización con `?oportunidad=`: anota en el riesgo lo que se USÓ para pedir precio (sin sellar
 * `confirmadoAt`; si algo cambió respecto a lo guardado, el sello se borra). Solo claves con valor: lo que la
 * cotización no trae no borra lo que ya había.
 *
 * 🚨 Se llama DESPUÉS de guardar la tarificación y NUNCA lanza: la cotización ya está pagada (0,50€, no
 * idempotente, regla 20) y un fallo aquí no puede romperla ni hacer que se repita.
 */
async function anotarBloqueDeCotizacion(
  correduriaId: string,
  e: { oportunidadId: string; clave: ClaveDatosRiesgo; valor: Record<string, unknown>; actor: string },
): Promise<void> {
  try {
    if (Object.keys(e.valor).length === 0) return
    const r = await editarDatosRiesgo(correduriaId, { oportunidadId: e.oportunidadId, clave: e.clave, datos: e.valor, confirmar: false, actor: e.actor })
    if (!r.ok) console.error(`[oportunidad-riesgo] write-back de ${e.clave} no guardado:`, r.status, r.motivo)
  } catch (err) {
    console.error(`[oportunidad-riesgo] write-back de ${e.clave} falló (la cotización ya está guardada):`, err instanceof Error ? err.message : err)
  }
}

export async function anotarVehiculoDeCotizacion(
  correduriaId: string,
  e: { oportunidadId: string; cuerpo: unknown; actor: string },
): Promise<void> {
  await anotarBloqueDeCotizacion(correduriaId, { oportunidadId: e.oportunidadId, clave: 'datosVehiculo', valor: datosVehiculoDeCotizacion(e.cuerpo), actor: e.actor })
}

/** Hogar: `catastro` es lo que la ruta acaba de leer del Catastro (m², año, CP), que rellena lo que no se tecleó. */
export async function anotarViviendaDeCotizacion(
  correduriaId: string,
  e: { oportunidadId: string; cuerpo: unknown; catastro?: { metrosCuadrados?: number | null; anioConstruccion?: number | null; codigoPostal?: string | null } | null; actor: string },
): Promise<void> {
  await anotarBloqueDeCotizacion(correduriaId, { oportunidadId: e.oportunidadId, clave: 'datosVivienda', valor: datosViviendaDeCotizacion(e.cuerpo, e.catastro), actor: e.actor })
}

export async function anotarCapitalDeCotizacion(
  correduriaId: string,
  e: { oportunidadId: string; ramo: RamoCapital; cuerpo: unknown; actor: string },
): Promise<void> {
  await anotarBloqueDeCotizacion(correduriaId, { oportunidadId: e.oportunidadId, clave: 'datosCapital', valor: datosCapitalDeCotizacion(e.cuerpo, e.ramo), actor: e.actor })
}
