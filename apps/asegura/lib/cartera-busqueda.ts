// El buscador de TODO: nombre, matrícula, nº de póliza, DNI, teléfono, email,
// ciudad o código postal. Un solo cuadro; aquí se ejecuta lo que
// `planBusqueda()` haya decidido que se puede mirar.
//
// ─── Lo que se puede buscar y lo que NO (medido el 01/09/2026) ─────────────
//   nombre/apellidos  EN CLARO   32.600 / 32.600  → parcial, fiable
//   matrícula         EN CLARO    4.504 pólizas   → parcial
//   nº de póliza      EN CLARO    6.895 pólizas   → parcial
//   ciudad            EN CLARO    4.482 fichas    → parcial
//   código postal     EN CLARO   16.398 fichas    → parcial
//   DNI               CIFRADO     3.904 fichas    → EXACTO por índice ciego
//   teléfono          CIFRADO     5.377 fichas    → EXACTO por índice ciego
//   email             CIFRADO     4.308 fichas    → EXACTO por índice ciego
//   dirección         CIFRADA     0 buscables     → 🚫 IMPOSIBLE
//
// 🚨 Las tres búsquedas por índice ciego son la trampa de esta pantalla. Solo
// el 12% de las fichas tiene calculado el hash del DNI, así que un «no aparece»
// es casi siempre «esa ficha no tiene hash», no «ese DNI no está en la cartera».
// Y si la clave del índice se desincronizara, la búsqueda NO daría error:
// devolvería vacío. Por eso cada bloque de resultados viaja con su COBERTURA y
// la pantalla dice sobre cuántas fichas ha podido mirar de verdad.
//
// La dirección NO tiene arreglo por SQL: va cifrada entera. Se declara y se
// ofrece ciudad/CP, que es lo más cercano que sí funciona.

import {
  avisoDireccion,
  explicarVacio,
  planBusqueda,
  type Aviso,
  type Criterio,
  type TipoCriterio,
} from '@central/module-seguros'
import { computeDniLookupHash, computeEmailLookupHash, computeTelefonoLookupHash } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/** Un resultado: siempre lleva a la ficha de un cliente. */
export type Hallazgo = {
  clienteId: string
  nombre: string
  /** `cliente` = entra por CIMA · `lead` = ficha histórica. */
  tipo: string
  polizas: number
  /** Por qué ha salido: «matrícula 1234BCD», «CP 41003»… */
  porque: string
}

export type BloqueResultados = {
  tipo: TipoCriterio
  valor: string
  hallazgos: Hallazgo[]
  /**
   * Sobre cuántas fichas alcanza ESTE criterio. `null` = no se ha podido
   * contar, y entonces no se afirma nada sobre el alcance.
   */
  cobertura: { alcanzables: number; total: number } | null
  /** La frase que explica un vacío. Solo se pinta si no hay hallazgos. */
  explicacion: string
}

export type Resultados = {
  termino: string
  buscable: boolean
  bloques: BloqueResultados[]
  avisos: Aviso[]
  /** Total de fichas distintas encontradas, para el titular. */
  distintos: number
}

/** Las claves cifradas pueden faltar en desarrollo: eso NO es «no hay nadie». */
function hashSeguro(fn: () => string | null): string | null {
  try {
    return fn()
  } catch {
    return null
  }
}

export async function buscarEnCartera(
  correduriaId: string,
  termino: string,
): Promise<Resultados> {
  const plan = planBusqueda(termino)
  const vacio: Resultados = {
    termino: plan.termino,
    buscable: plan.buscable,
    bloques: [],
    avisos: plan.avisos,
    distintos: 0,
  }
  if (!aseguraConfigurada() || !plan.buscable) return vacio

  const bloques = await Promise.all(
    plan.criterios.map((c) => ejecutar(correduriaId, c)),
  )
  const conAlgo = bloques.filter((b) => b !== null) as BloqueResultados[]

  // Si nada ha salido y el término parece una calle, se dice por qué.
  const avisos = [...plan.avisos]
  const nadaEncontrado = conAlgo.every((b) => b.hallazgos.length === 0)
  if (nadaEncontrado && pareceDireccion(plan.termino)) avisos.push(avisoDireccion())

  const ids = new Set<string>()
  for (const b of conAlgo) for (const h of b.hallazgos) ids.add(h.clienteId)

  return { ...vacio, bloques: conAlgo, avisos, distintos: ids.size }
}

/**
 * Un término con sigla de vía o número de portal es casi seguro una dirección.
 * No se usa para BUSCAR (no se puede), sino para explicar el vacío bien.
 */
function pareceDireccion(t: string): boolean {
  return /\b(calle|c\/|avda?|avenida|plaza|pza|paseo|camino|carretera|ctra|urb|urbanizaci)/i.test(t)
}

async function ejecutar(correduriaId: string, c: Criterio): Promise<BloqueResultados | null> {
  switch (c.tipo) {
    case 'nombre':
      return porNombre(correduriaId, c)
    case 'ciudad':
      return porCiudad(correduriaId, c)
    case 'codigo_postal':
      return porCodigoPostal(correduriaId, c)
    case 'matricula':
      return porMatricula(correduriaId, c)
    case 'poliza':
      return porNumeroPoliza(correduriaId, c)
    case 'dni':
      return porHash(correduriaId, c, 'dniLookupHash', hashSeguro(() => computeDniLookupHash(c.valor)))
    case 'telefono':
      return porHash(correduriaId, c, 'telefonoLookupHash', hashSeguro(() => computeTelefonoLookupHash(c.valor)))
    case 'email':
      return porHash(correduriaId, c, 'emailLookupHash', hashSeguro(() => computeEmailLookupHash(c.valor)))
  }
}

const LIMITE = 25

/** Cuenta cuántas fichas pueden salir por un campo, para no mentir con el vacío. */
async function cobertura(
  correduriaId: string,
  where: Record<string, unknown>,
): Promise<{ alcanzables: number; total: number } | null> {
  try {
    const db = prismaAsegura()
    const base = { correduriaId, mergedIntoClienteId: null }
    const [alcanzables, total] = await Promise.all([
      db.cliente.count({ where: { ...base, ...where } }),
      db.cliente.count({ where: base }),
    ])
    return { alcanzables, total }
  } catch {
    // No se ha podido contar. NO se devuelve {0,0}: eso diría «no alcanza a
    // nadie», que es una afirmación, y aquí no se sabe.
    return null
  }
}

type FilaCliente = {
  id: string
  nombre: string
  apellidos: string
  tipo: unknown
  _count: { polizas: number }
}

const SELECT_CLIENTE = {
  id: true,
  nombre: true,
  apellidos: true,
  tipo: true,
  _count: { select: { polizas: true } },
} as const

function aHallazgo(f: FilaCliente, porque: string): Hallazgo {
  return {
    clienteId: f.id,
    nombre: `${f.nombre} ${f.apellidos}`.trim(),
    tipo: String(f.tipo),
    polizas: f._count.polizas,
    porque,
  }
}

function bloque(
  c: Criterio,
  hallazgos: Hallazgo[],
  cob: { alcanzables: number; total: number } | null,
): BloqueResultados {
  return {
    tipo: c.tipo,
    valor: c.valor,
    hallazgos,
    cobertura: cob,
    explicacion: explicarVacio(c.tipo, cob),
  }
}

async function porNombre(correduriaId: string, c: Criterio): Promise<BloqueResultados> {
  const db = prismaAsegura()
  const palabras = c.valor.split(/\s+/).slice(0, 4)
  const filas = await db.cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      AND: palabras.map((p) => ({
        OR: [
          { nombre: { contains: p, mode: 'insensitive' as const } },
          { apellidos: { contains: p, mode: 'insensitive' as const } },
        ],
      })),
    },
    select: SELECT_CLIENTE,
    orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
    take: LIMITE,
  })
  // El nombre está en claro en las 32.600: alcanza a toda la cartera.
  const total = await db.cliente
    .count({ where: { correduriaId, mergedIntoClienteId: null } })
    .catch(() => null)
  return bloque(
    c,
    filas.map((f) => aHallazgo(f, 'nombre o apellidos')),
    total === null ? null : { alcanzables: total, total },
  )
}

async function porCiudad(correduriaId: string, c: Criterio): Promise<BloqueResultados> {
  const db = prismaAsegura()
  const filas = await db.cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      ciudad: { contains: c.valor, mode: 'insensitive' },
    },
    select: SELECT_CLIENTE,
    orderBy: [{ apellidos: 'asc' }],
    take: LIMITE,
  })
  return bloque(
    c,
    filas.map((f) => aHallazgo(f, `ciudad «${c.valor}»`)),
    await cobertura(correduriaId, { ciudad: { not: null } }),
  )
}

async function porCodigoPostal(correduriaId: string, c: Criterio): Promise<BloqueResultados> {
  const db = prismaAsegura()
  const filas = await db.cliente.findMany({
    where: { correduriaId, mergedIntoClienteId: null, codigoPostal: c.valor },
    select: SELECT_CLIENTE,
    orderBy: [{ apellidos: 'asc' }],
    take: LIMITE,
  })
  return bloque(
    c,
    filas.map((f) => aHallazgo(f, `código postal ${c.valor}`)),
    await cobertura(correduriaId, { codigoPostal: { not: null } }),
  )
}

/**
 * La matrícula vive EN CLARO dentro de `datos_especificos`, así que se busca
 * con SQL crudo sobre el JSON — Prisma no filtra por `->>` con `contains`.
 */
async function porMatricula(correduriaId: string, c: Criterio): Promise<BloqueResultados> {
  const db = prismaAsegura()
  const filas = await db.$queryRaw<
    { id: string; nombre: string; apellidos: string; tipo: string; matricula: string }[]
  >`
    select distinct on (cl.id)
      cl.id, cl.nombre, cl.apellidos, cl.tipo::text as tipo,
      upper(regexp_replace(p.datos_especificos->>'matricula', '[^A-Za-z0-9]', '', 'g')) as matricula
    from polizas p
    join clientes cl on cl.id = p.cliente_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      and cl.merged_into_cliente_id is null
      and upper(regexp_replace(p.datos_especificos->>'matricula', '[^A-Za-z0-9]', '', 'g'))
          like ${'%' + c.valor + '%'}
    limit ${LIMITE}
  `
  const conteos = await polizasDe(filas.map((f) => f.id))
  const hallazgos = filas.map((f) => ({
    clienteId: f.id,
    nombre: `${f.nombre} ${f.apellidos}`.trim(),
    tipo: f.tipo,
    polizas: conteos.get(f.id) ?? 0,
    porque: `matrícula ${f.matricula}`,
  }))
  return bloque(c, hallazgos, await coberturaMatricula(correduriaId))
}

async function porNumeroPoliza(correduriaId: string, c: Criterio): Promise<BloqueResultados> {
  const db = prismaAsegura()
  const filas = await db.poliza.findMany({
    where: {
      correduriaId,
      mergedIntoPolizaId: null,
      numeroPoliza: { contains: c.valor, mode: 'insensitive' },
      cliente: { mergedIntoClienteId: null },
    },
    select: {
      numeroPoliza: true,
      aseguradora: true,
      cliente: { select: SELECT_CLIENTE },
    },
    take: LIMITE,
  })
  const hallazgos = filas.map((f) =>
    aHallazgo(f.cliente, `póliza ${f.numeroPoliza ?? '?'} · ${f.aseguradora}`),
  )
  return bloque(c, hallazgos, await coberturaPolizas(correduriaId, { numeroPoliza: { not: null } }))
}

/**
 * Búsqueda por índice ciego. `hash === null` significa que la clave no está
 * configurada: NO se consulta y NO se devuelve una lista vacía, porque eso se
 * leería como «ese DNI no está en la cartera».
 */
async function porHash(
  correduriaId: string,
  c: Criterio,
  campo: 'dniLookupHash' | 'telefonoLookupHash' | 'emailLookupHash',
  hash: string | null,
): Promise<BloqueResultados | null> {
  if (hash === null) return null
  const db = prismaAsegura()
  const filas = await db.cliente.findMany({
    where: { correduriaId, mergedIntoClienteId: null, [campo]: hash },
    select: SELECT_CLIENTE,
    take: LIMITE,
  })
  const etiqueta =
    c.tipo === 'dni' ? `DNI ${c.valor}` : c.tipo === 'telefono' ? `teléfono ${c.valor}` : `email ${c.valor}`
  return bloque(
    c,
    filas.map((f) => aHallazgo(f, etiqueta)),
    await cobertura(correduriaId, { [campo]: { not: null } }),
  )
}

async function polizasDe(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const db = prismaAsegura()
  const filas = await db.poliza.groupBy({
    by: ['clienteId'],
    where: { clienteId: { in: ids }, mergedIntoPolizaId: null },
    _count: { _all: true },
  })
  return new Map(filas.map((f) => [f.clienteId, f._count._all]))
}

async function coberturaMatricula(
  correduriaId: string,
): Promise<{ alcanzables: number; total: number } | null> {
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ con: bigint; total: bigint }[]>`
      select
        count(*) filter (where datos_especificos->>'matricula' is not null)::bigint as con,
        count(*)::bigint as total
      from polizas
      where correduria_id = ${correduriaId}::uuid and merged_into_poliza_id is null
    `
    const f = filas[0]
    return f ? { alcanzables: Number(f.con), total: Number(f.total) } : null
  } catch {
    return null
  }
}

async function coberturaPolizas(
  correduriaId: string,
  where: Record<string, unknown>,
): Promise<{ alcanzables: number; total: number } | null> {
  try {
    const db = prismaAsegura()
    const base = { correduriaId, mergedIntoPolizaId: null }
    const [alcanzables, total] = await Promise.all([
      db.poliza.count({ where: { ...base, ...where } }),
      db.poliza.count({ where: base }),
    ])
    return { alcanzables, total }
  } catch {
    return null
  }
}
