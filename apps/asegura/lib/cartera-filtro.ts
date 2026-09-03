/**
 * El LISTADO FILTRABLE de la cartera — la consulta que surte a
 * `/api/operador/cartera`, que a su vez surte a `/correduria` en plataforma.
 *
 * Reglas que gobiernan este fichero (las mismas de `lib/cartera.ts`, más las
 * propias de un listado paginado):
 *
 * - **`correduria_id` SIEMPRE explícito.** El rol tiene BYPASSRLS: si el WHERE
 *   no acota, el fallo no es un error sino «se ve todo».
 * - **Las lápidas de fusión se excluyen SIEMPRE** (`merged_into_*_id is null`).
 *   Sin eso un cliente fusionado sale dos veces y el recuento miente.
 * - **La definición de cartera viva NO se escribe aquí.** Sale de
 *   `sqlCarteraViva`/`sqlVolcadoHistorico` de `@central/module-seguros`, que es
 *   la única fuente de esa verdad (y que ya tapa el agujero de las pólizas del
 *   volcado que CIMA mantiene al día).
 * - **El GRUPO se deriva, no se lee.** `clientes.tipo` dice 2.742 «cliente» y
 *   29.860 «lead» cuando la cartera viva son 80 clientes: es un campo del
 *   volcado que nadie mantiene. Aquí «viva» = el cliente tiene al menos una
 *   póliza de cartera viva; «leads» = no tiene ninguna (incluidos los que no
 *   tienen ninguna póliza en absoluto).
 * - **`null` no es 0 ni «no hay».** `prima` es null cuando ni `prima_bruta` ni
 *   `prima_anual` traen dato — jamás 0,00 €, que se leería como «gratis».
 *   `tieneEmail`/`tieneTelefono` son null cuando la comprobación de contactos
 *   no se ha podido hacer, que no es lo mismo que «no tiene».
 * - **Se pagina en SQL.** El grupo `leads` son ~32.471 fichas: traerlas y
 *   cortar en JS es la forma de tumbar la función serverless con la lista
 *   pintada como si nada.
 */

import {
  sqlCarteraViva,
  sqlVolcadoHistorico,
  diasDeVentana,
  type FiltroCartera,
  type GrupoCartera,
  type VentanaVencimiento,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'

// ─── Cotas de seguridad ──────────────────────────────────────────────────────
// Ninguna consulta escanea sin techo. Las dos cotas están MUY por encima de lo
// medido (03/09/2026: máximo 20 pólizas por cliente; 52 provincias distintas y
// 31 aseguradoras en el volcado), así que hoy no muerden — pero si algún día
// mordieran, la respuesta lo DICE (`truncado`) en vez de devolver una lista
// recortada con pinta de completa.
export const MAX_POLIZAS_POR_CLIENTE = 50
export const MAX_VALORES_POR_FACETA = 60

export type PolizaListado = {
  id: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  /** 'YYYY-MM-DD'. `null` = la compañía no ha informado la fecha, NO «no vence». */
  fechaVencimiento: string | null
  estado: string
  /** `prima_bruta ?? prima_anual`. `null` = SIN DATO (Allianz no la informa por EIAC). */
  prima: number | null
}

export type ClienteListado = {
  id: string
  nombre: string
  apellidos: string
  provincia: string | null
  ciudad: string | null
  /** `null` = NO se ha podido comprobar (la consulta de contactos falló). */
  tieneEmail: boolean | null
  tieneTelefono: boolean | null
  polizasVivas: number
  /** Ramos distintos de sus pólizas VIVAS. En el grupo `leads` es `[]` de verdad. */
  ramosVivos: string[]
  /** Las pólizas del GRUPO pedido de este cliente — todas, no solo las que casan
   *  con el filtro: ver a un cliente filtrado por «Mapfre» con su póliza de
   *  Allianz al lado es justo lo que hace útil la lista. */
  polizas: PolizaListado[]
}

export type Facetas = {
  ramos: { v: string; n: number }[]
  companias: { v: string; n: number }[]
  provincias: { v: string; n: number }[]
  estados: { v: string; n: number }[]
}

export type ListadoCartera = {
  /** Clientes que cumplen el filtro (COUNT real en SQL, no `clientes.length`). */
  total: number
  clientes: ClienteListado[]
  facetas: Facetas
  /** `true` si alguna cota de seguridad ha recortado algo (ver las constantes de
   *  arriba). Nunca se devuelve un recuento recortado como si fuera el total. */
  truncado: boolean
}

// ─── Ventana de vencimiento (lógica pura, testeada) ──────────────────────────

export type RangoVencimiento =
  /** `sin_fecha` NO es «no vence»: son pólizas cuya fecha la compañía no ha
   *  informado (1.194 medidas el 31/08). Poder pedirlas es lo que las hace
   *  reclamables, así que es un modo de primera y no un residuo. */
  | { modo: 'sin_fecha' }
  | { modo: 'vencidas'; antesDe: string }
  | { modo: 'entre'; desde: string; hasta: string }

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Medianoche UTC de hoy: el mismo criterio que `lib/cartera.ts`, para que dos
 *  pantallas de la misma cartera no discrepen por la zona horaria del servidor. */
export function hoyUtc(ahora: Date = new Date()): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))
}

/**
 * La ventana de vencimiento traducida a fechas concretas.
 *
 * Se resuelve en JS (y no con `current_date`) para que el rango sea el mismo
 * que se puede enseñar en la pantalla y el mismo que se prueba en el test: con
 * `current_date` el límite depende de la zona horaria del servidor de BD y no
 * hay forma de verlo desde fuera.
 */
export function rangoVentana(v: VentanaVencimiento, ahora: Date = new Date()): RangoVencimiento {
  if (v === 'sin_fecha') return { modo: 'sin_fecha' }
  const hoy = hoyUtc(ahora)
  if (v === 'vencidas') return { modo: 'vencidas', antesDe: iso(hoy) }
  if (v === 'anio') {
    const a = hoy.getUTCFullYear()
    return { modo: 'entre', desde: `${a}-01-01`, hasta: `${a}-12-31` }
  }
  const dias = diasDeVentana(v)
  // `diasDeVentana` solo devuelve null para 'anio' y 'sin_fecha', ya tratados.
  const hasta = new Date(hoy)
  hasta.setUTCDate(hasta.getUTCDate() + (dias ?? 0))
  return { modo: 'entre', desde: iso(hoy), hasta: iso(hasta) }
}

// ─── Fragmentos de SQL ───────────────────────────────────────────────────────

/** `p` es el alias de `polizas`. La cadena es constante y no lleva nada del
 *  usuario: `Prisma.raw` aquí no abre ninguna puerta. */
function condGrupoPoliza(grupo: GrupoCartera): Prisma.Sql {
  return Prisma.raw(grupo === 'viva' ? sqlCarteraViva('p') : sqlVolcadoHistorico('p'))
}

const CARTERA_VIVA_P = Prisma.raw(sqlCarteraViva('p'))

/** Lista de literales como `in (…)`, cada valor PARAMETRIZADO. `compania` y
 *  `provincia` son texto libre del usuario y nunca se interpolan. */
function enLista(valores: readonly string[]): Prisma.Sql {
  return Prisma.join(valores.map((v) => Prisma.sql`${v}`))
}

/**
 * ¿Se le puede escribir o llamar? Mira el campo de la ficha Y las tablas de
 * contactos múltiples. `nullif(btrim(...), '')` porque una cadena vacía es tan
 * «sin canal» como un NULL, y colarla como dato diría que sí hay por dónde
 * contactar (el «no lo sé disfrazado de valor»).
 */
const TIENE_EMAIL = Prisma.sql`(
  nullif(btrim(c.email), '') is not null
  or exists (select 1 from cliente_emails e where e.cliente_id = c.id and nullif(btrim(e.email), '') is not null)
)`

const TIENE_TELEFONO = Prisma.sql`(
  nullif(btrim(c.telefono), '') is not null
  or exists (select 1 from cliente_telefonos t where t.cliente_id = c.id and nullif(btrim(t.telefono), '') is not null)
)`

/** El recuento de pólizas VIVAS del cliente y sus ramos. Es lo que deriva el
 *  grupo (`> 0` = cartera viva, `= 0` = lead) y de paso llena las dos columnas
 *  del listado, sin una segunda pasada. */
const LATERAL_VIVAS = Prisma.sql`
  join lateral (
    select
      count(*)::int as polizas_vivas,
      coalesce(array_agg(distinct p.tipo::text), '{}'::text[]) as ramos_vivos
    from polizas p
    where p.cliente_id = c.id
      and p.correduria_id = c.correduria_id
      and p.merged_into_poliza_id is null
      and ${CARTERA_VIVA_P}
  ) v on true`

function condVencimiento(r: RangoVencimiento): Prisma.Sql {
  if (r.modo === 'sin_fecha') return Prisma.sql`p.fecha_vencimiento is null`
  if (r.modo === 'vencidas') {
    return Prisma.sql`p.fecha_vencimiento is not null and p.fecha_vencimiento < ${r.antesDe}::date`
  }
  return Prisma.sql`p.fecha_vencimiento is not null
    and p.fecha_vencimiento >= ${r.desde}::date and p.fecha_vencimiento <= ${r.hasta}::date`
}

/**
 * Las condiciones sobre el CLIENTE.
 *
 * `soloGrupoYTexto` es lo que separa la lista de las facetas: las facetas se
 * calculan sobre el grupo + el texto e IGNORAN el resto de filtros (ver
 * `facetasDe`), así que comparten este constructor y no pueden discrepar.
 */
function condicionesCliente(
  correduriaId: string,
  f: FiltroCartera,
  hoy: Date,
  soloGrupoYTexto: boolean,
): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [
    Prisma.sql`c.correduria_id = ${correduriaId}::uuid`,
    Prisma.sql`c.merged_into_cliente_id is null`,
    // El GRUPO, derivado de las pólizas vivas. Nunca de `clientes.tipo`.
    f.grupo === 'viva' ? Prisma.sql`v.polizas_vivas > 0` : Prisma.sql`v.polizas_vivas = 0`,
  ]

  // `q` viene ya validado por `parseFiltroCartera` (menos de 3 letras llega
  // vacío y la respuesta lo declara con `buscable`), y va parametrizado.
  if (f.q) conds.push(Prisma.sql`concat_ws(' ', c.nombre, c.apellidos) ilike ${'%' + f.q + '%'}`)

  if (soloGrupoYTexto) return conds

  if (f.provincias.length) {
    conds.push(Prisma.sql`btrim(coalesce(c.provincia, '')) in (${enLista(f.provincias)})`)
  }

  if (f.canal === 'con') conds.push(Prisma.sql`(${TIENE_EMAIL} or ${TIENE_TELEFONO})`)
  if (f.canal === 'sin') conds.push(Prisma.sql`(not ${TIENE_EMAIL} and not ${TIENE_TELEFONO})`)

  // Los filtros de PÓLIZA van juntos en un solo EXISTS: «tiene una póliza que
  // es de auto Y de Mapfre Y vence en 30 días». Repartidos en varios EXISTS
  // devolverían clientes cuyo auto es de otra compañía y cuya Mapfre es de otro
  // ramo — una lista más ancha de la pedida, que es la mentira barata de todo
  // buscador.
  const dePoliza: Prisma.Sql[] = []
  if (f.ramos.length) dePoliza.push(Prisma.sql`p.tipo::text in (${enLista(f.ramos)})`)
  if (f.companias.length) dePoliza.push(Prisma.sql`p.aseguradora in (${enLista(f.companias)})`)
  if (f.estados.length) dePoliza.push(Prisma.sql`p.estado::text in (${enLista(f.estados)})`)
  if (f.vence) dePoliza.push(condVencimiento(rangoVentana(f.vence, hoy)))
  if (dePoliza.length) {
    conds.push(Prisma.sql`exists (
      select 1 from polizas p
      where p.cliente_id = c.id and p.correduria_id = c.correduria_id
        and p.merged_into_poliza_id is null and ${condGrupoPoliza(f.grupo)}
        and ${Prisma.join(dePoliza, ' and ')}
    )`)
  }

  // Venta cruzada: el cliente NO tiene NINGUNA póliza VIVA de ese ramo. Siempre
  // contra la cartera viva, aunque el grupo fuera otro — «le falta el hogar»
  // significa que no lo tiene HOY, no que no lo tuviera en 2015.
  // (`parseFiltroCartera` ya lo anula sobre leads, donde no significaría nada.)
  if (f.sinRamos.length) {
    conds.push(Prisma.sql`not exists (
      select 1 from polizas p
      where p.cliente_id = c.id and p.correduria_id = c.correduria_id
        and p.merged_into_poliza_id is null and ${CARTERA_VIVA_P}
        and p.tipo::text in (${enLista(f.sinRamos)})
    )`)
  }

  return conds
}

// ─── Consulta ────────────────────────────────────────────────────────────────

type FilaCliente = {
  id: string
  nombre: string
  apellidos: string
  provincia: string | null
  ciudad: string | null
  polizas_vivas: number
  ramos_vivos: string[]
}

type FilaPoliza = {
  id: string
  cliente_id: string
  tipo: string
  aseguradora: string
  numero_poliza: string | null
  fecha_vencimiento: string | null
  estado: string
  prima: number | null
}

type FilaFaceta = { faceta: string; v: string; n: number }

/**
 * El listado con su total, sus pólizas y sus facetas.
 *
 * @param hoy inyectable para poder probar las ventanas de vencimiento.
 */
export async function listarCartera(
  correduriaId: string,
  f: FiltroCartera,
  hoy: Date = new Date(),
): Promise<ListadoCartera> {
  const db = prismaAsegura()
  const donde = Prisma.join(condicionesCliente(correduriaId, f, hoy, false), ' and ')
  const offset = (f.pagina - 1) * f.porPagina

  const [filasTotal, filas, facetas] = await Promise.all([
    db.$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n
      from clientes c
      ${LATERAL_VIVAS}
      where ${donde}
    `,
    db.$queryRaw<FilaCliente[]>`
      select
        c.id::text as id, c.nombre, c.apellidos, c.provincia, c.ciudad,
        v.polizas_vivas, v.ramos_vivos
      from clientes c
      ${LATERAL_VIVAS}
      where ${donde}
      order by c.apellidos, c.nombre, c.id
      limit ${f.porPagina} offset ${offset}
    `,
    facetasDe(correduriaId, f, hoy),
  ])

  const ids = filas.map((x) => x.id)
  const [porCliente, contactos] = await Promise.all([
    polizasDeClientes(correduriaId, f.grupo, ids),
    contactosDeClientes(correduriaId, ids),
  ])

  const clientes: ClienteListado[] = filas.map((x) => {
    const contacto = contactos?.get(x.id)
    return {
      id: x.id,
      nombre: x.nombre,
      apellidos: x.apellidos,
      provincia: x.provincia,
      ciudad: x.ciudad,
      // `contactos === null` = la consulta no se pudo hacer → «no se sabe».
      // Un `false` aquí diría «este cliente es ilocalizable», que es una
      // afirmación que nadie ha comprobado.
      tieneEmail: contactos === null ? null : (contacto?.email ?? false),
      tieneTelefono: contactos === null ? null : (contacto?.telefono ?? false),
      polizasVivas: x.polizas_vivas,
      ramosVivos: x.ramos_vivos ?? [],
      polizas: porCliente.polizas.get(x.id) ?? [],
    }
  })

  return {
    total: Number(filasTotal[0]?.n ?? 0),
    clientes,
    facetas: facetas.facetas,
    truncado: porCliente.truncado || facetas.truncado,
  }
}

/** Las pólizas del grupo, de los clientes de ESTA página. Nunca de toda la cartera. */
async function polizasDeClientes(
  correduriaId: string,
  grupo: GrupoCartera,
  ids: string[],
): Promise<{ polizas: Map<string, PolizaListado[]>; truncado: boolean }> {
  const polizas = new Map<string, PolizaListado[]>()
  if (!ids.length) return { polizas, truncado: false }
  const db = prismaAsegura()
  const filas = await db.$queryRaw<FilaPoliza[]>`
    select
      id::text as id, cliente_id::text as cliente_id, tipo::text as tipo, aseguradora,
      numero_poliza, to_char(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
      estado::text as estado,
      -- Las dos primas son la MISMA magnitud en dos columnas distintas; si
      -- ninguna trae dato, el resultado es null. Nunca 0: «no informada» y
      -- «gratis» no se pueden confundir en una lista de comisiones.
      coalesce(prima_bruta, prima_anual)::float8 as prima
    from (
      select p.*, row_number() over (
        partition by p.cliente_id order by p.fecha_vencimiento desc nulls last, p.id
      ) as rn
      from polizas p
      where p.correduria_id = ${correduriaId}::uuid
        and p.merged_into_poliza_id is null
        and ${condGrupoPoliza(grupo)}
        and p.cliente_id in (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
    ) z
    where rn <= ${MAX_POLIZAS_POR_CLIENTE + 1}
    order by cliente_id, rn
  `
  let truncado = false
  for (const p of filas) {
    const lista = polizas.get(p.cliente_id) ?? []
    if (lista.length >= MAX_POLIZAS_POR_CLIENTE) {
      truncado = true
      continue
    }
    lista.push({
      id: p.id,
      tipo: p.tipo,
      aseguradora: p.aseguradora,
      numeroPoliza: p.numero_poliza,
      fechaVencimiento: p.fecha_vencimiento,
      estado: p.estado,
      prima: p.prima === null ? null : Number(p.prima),
    })
    polizas.set(p.cliente_id, lista)
  }
  return { polizas, truncado }
}

/**
 * Si se puede contactar con cada cliente de la página.
 *
 * Va en su propia consulta y con su propio `catch` a propósito: si las tablas
 * de contactos no se pueden leer, la respuesta es «no se sabe» (`null`) para
 * todos, no «ninguno tiene email». Devolver `false` convertiría un fallo de
 * lectura en una lista de ilocalizables que nadie ha comprobado.
 */
async function contactosDeClientes(
  correduriaId: string,
  ids: string[],
): Promise<Map<string, { email: boolean; telefono: boolean }> | null> {
  if (!ids.length) return new Map()
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ id: string; tiene_email: boolean; tiene_telefono: boolean }[]>`
      select c.id::text as id, ${TIENE_EMAIL} as tiene_email, ${TIENE_TELEFONO} as tiene_telefono
      from clientes c
      where c.correduria_id = ${correduriaId}::uuid
        and c.merged_into_cliente_id is null
        and c.id in (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
    `
    const m = new Map<string, { email: boolean; telefono: boolean }>()
    for (const f of filas) m.set(f.id, { email: f.tiene_email, telefono: f.tiene_telefono })
    return m
  } catch (e) {
    registrarErrorCartera('cartera-filtro/contactos', e)
    return null
  }
}

/**
 * Las facetas de los desplegables.
 *
 * 🎯 **Decisión deliberada: se calculan sobre el GRUPO + el texto `q`, e IGNORAN
 * el resto de filtros.** Es lo que hace que, ya filtrando por «auto», el
 * desplegable de compañías siga ofreciendo Allianz y Occident en vez de
 * quedarse solo con lo que casa con la selección actual — o sea, que el usuario
 * pueda cambiar de idea sin tener que limpiar el filtro a ciegas. No es un
 * olvido: si algún día se quiere el comportamiento contrario (facetas
 * co-filtradas), es un cambio de producto, no un arreglo.
 *
 * Ramos, compañías y estados cuentan PÓLIZAS (auto 81 · hogar 19 · RC 9 · moto 1
 * de las 110 vivas, medido 03/09/2026); provincias cuenta CLIENTES, porque la
 * provincia es de la ficha y no de la póliza. Las provincias vacías NO salen:
 * no son un valor que se pueda pedir, y ofrecerlas como «(sin provincia)» sería
 * inventar un valor de cajón que el filtro no entiende.
 */
async function facetasDe(
  correduriaId: string,
  f: FiltroCartera,
  hoy: Date,
): Promise<{ facetas: Facetas; truncado: boolean }> {
  const db = prismaAsegura()
  const donde = Prisma.join(condicionesCliente(correduriaId, f, hoy, true), ' and ')
  const filas = await db.$queryRaw<FilaFaceta[]>`
    with cli as (
      select c.id, c.provincia
      from clientes c
      ${LATERAL_VIVAS}
      where ${donde}
    ),
    pol as (
      select p.tipo::text as tipo, p.aseguradora, p.estado::text as estado
      from polizas p
      join cli on cli.id = p.cliente_id
      where p.correduria_id = ${correduriaId}::uuid
        and p.merged_into_poliza_id is null
        and ${condGrupoPoliza(f.grupo)}
    ),
    crudo as (
                  select 'ramo'      as faceta, tipo         as v, count(*)::int as n from pol group by tipo
      union all   select 'compania',            aseguradora,       count(*)::int      from pol group by aseguradora
      union all   select 'estado',              estado,            count(*)::int      from pol group by estado
      union all   select 'provincia',           btrim(provincia),  count(*)::int
                    from cli where nullif(btrim(provincia), '') is not null group by 2
    )
    select faceta, v, n from (
      select faceta, v, n, row_number() over (partition by faceta order by n desc, v asc) as rn
      from crudo
    ) z
    where rn <= ${MAX_VALORES_POR_FACETA + 1}
    order by faceta, n desc, v asc
  `
  const facetas: Facetas = { ramos: [], companias: [], provincias: [], estados: [] }
  const cubo: Record<string, { v: string; n: number }[]> = {
    ramo: facetas.ramos,
    compania: facetas.companias,
    provincia: facetas.provincias,
    estado: facetas.estados,
  }
  let truncado = false
  for (const fila of filas) {
    const lista = cubo[fila.faceta]
    if (!lista) continue
    if (lista.length >= MAX_VALORES_POR_FACETA) {
      truncado = true
      continue
    }
    lista.push({ v: fila.v, n: Number(fila.n) })
  }
  return { facetas, truncado }
}
