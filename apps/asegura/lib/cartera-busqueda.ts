// El buscador de TODO: nombre, matrícula, nº de póliza, DNI, teléfono, email,
// ciudad o código postal. Un solo cuadro; aquí se ejecuta lo que
// `planBusqueda()` haya decidido que se puede mirar.
//
// ─── Lo que se puede buscar y lo que NO (medido el 01/09/2026) ─────────────
//   nombre/apellidos  EN CLARO   32.600 / 32.600  → parcial, fiable
//   matrícula         EN CLARO    4.504 pólizas   → parcial
//   nº de póliza      EN CLARO    6.895 pólizas   → parcial
//   ciudad            EN CLARO    4.482 fichas    → parcial (la del CLIENTE)
//   código postal     EN CLARO   16.398 fichas    → parcial (el del CLIENTE)
//   riesgo (loc/CP)   EN CLARO   179 / 328 pólizas → parcial, en `datos_especificos`
//   DNI               CIFRADO     3.904 fichas    → EXACTO por índice ciego
//   teléfono          CIFRADO     5.377 fichas    → EXACTO por índice ciego
//   email             CIFRADO     4.308 fichas    → EXACTO por índice ciego
//   dirección (calle) CIFRADA     170 pólizas     → se DESCIFRA EN MEMORIA y se filtra
//
// 🚨 Las tres búsquedas por índice ciego son la trampa de esta pantalla. Solo
// el 12% de las fichas tiene calculado el hash del DNI, así que un «no aparece»
// es casi siempre «esa ficha no tiene hash», no «ese DNI no está en la cartera».
// Y si la clave del índice se desincronizara, la búsqueda NO daría error:
// devolvería vacío. Por eso cada bloque de resultados viaja con su COBERTURA y
// la pantalla dice sobre cuántas fichas ha podido mirar de verdad.
//
// La calle NO tiene arreglo por SQL: va cifrada entera (`v1:`). Pero son ~170
// pólizas y esta app tiene la clave, así que se traen, se descifran en memoria
// y se comparan normalizadas. Si la clave falta, `decryptField` devuelve el
// cifrado tal cual: eso se cuenta como «ilegible» y se DICE — un vacío ahí no
// es «nadie vive en esa calle». (Corrección del 02/09/2026: el CRM de Manuel
// pinta «CL SAN VICENTE, 40» en claro; declararlo «imposible» era falso.)
//
// Y el segundo hueco que destapó el mismo caso: `localidad`/`cp` del RIESGO van
// en claro en `datos_especificos`, y el buscador solo miraba la ciudad/CP del
// cliente. La casa de Rota de un cliente de Sevilla no salía por «rota».

import {
  avisoDireccion,
  avisoHermanas,
  direccionCoincide,
  explicarVacio,
  planBusqueda,
  vitalidadFicha,
  type Aviso,
  type AvisoHermanas,
  type Criterio,
  type Hermana,
  type TipoCriterio,
  type Vitalidad,
} from '@central/module-seguros'
import {
  computeDniLookupHash,
  computeEmailLookupHash,
  computeTelefonoLookupHash,
  decryptField,
} from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/** Un resultado: siempre lleva a la ficha de un cliente. */
export type Hallazgo = {
  clienteId: string
  nombre: string
  /**
   * El enum `clientes.tipo` de la BD. 🚨 NO sirve para saber si es un cliente
   * de hoy: el volcado de junio marcó `tipo='cliente'` fichas cuyo último
   * vencimiento es de 2016. Para eso está `vitalidad`.
   */
  tipo: string
  polizas: number
  /** Por qué ha salido: «matrícula 1234BCD», «CP 41003»… */
  porque: string
  /** Pólizas que entran por CIMA. `null` = no se pudo contar, NO 0. */
  polizasCima: number | null
  /** Vencimiento más lejano. `null` = ninguna póliza informa fecha. */
  ultimoVencimiento: string | null
  /** Cartera viva / volcado histórico / no se sabe. Derivado, no del enum. */
  vitalidad: Vitalidad
  /** Otras fichas sin fusionar con su mismo teléfono. `null` = no se miró. */
  hermanas: Hermana[] | null
  /** Qué decir de esas hermanas, o `null` si no hay nada que decir. */
  aviso: AvisoHermanas | null
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

  // La calle se ha intentado descifrar: si había direcciones y NINGUNA se pudo
  // leer, se avisa. Un bloque vacío ahí no es «nadie vive en esa calle».
  const avisos = [...plan.avisos]
  const calle = conAlgo.find((b) => b.tipo === 'direccion')
  if (calle?.cobertura && calle.cobertura.total > 0 && calle.cobertura.alcanzables === 0) {
    avisos.push(avisoDireccion(calle.cobertura.total))
  }

  await enriquecer(correduriaId, conAlgo)

  const ids = new Set<string>()
  for (const b of conAlgo) for (const h of b.hallazgos) ids.add(h.clienteId)

  return { ...vacio, bloques: conAlgo, avisos, distintos: ids.size }
}

async function ejecutar(correduriaId: string, c: Criterio): Promise<BloqueResultados | null> {
  switch (c.tipo) {
    case 'nombre':
      return porNombre(correduriaId, c)
    case 'ciudad':
      return porCiudad(correduriaId, c)
    case 'codigo_postal':
      return porCodigoPostal(correduriaId, c)
    case 'riesgo':
      return porRiesgo(correduriaId, c)
    case 'direccion':
      return porDireccion(correduriaId, c)
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

/**
 * El hallazgo SIN enriquecer. Nace en «desconocida» a propósito: si el paso de
 * enriquecimiento falla, la pantalla dirá «sin comprobar» en vez de heredar un
 * «cartera viva» que nadie ha verificado.
 */
function aHallazgo(f: FilaCliente, porque: string): Hallazgo {
  return {
    clienteId: f.id,
    nombre: `${f.nombre} ${f.apellidos}`.trim(),
    tipo: String(f.tipo),
    polizas: f._count.polizas,
    porque,
    polizasCima: null,
    ultimoVencimiento: null,
    vitalidad: 'desconocida',
    hermanas: null,
    aviso: null,
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
  const hallazgos: Hallazgo[] = filas.map((f) => ({
    clienteId: f.id,
    nombre: `${f.nombre} ${f.apellidos}`.trim(),
    tipo: f.tipo,
    polizas: conteos.get(f.id) ?? 0,
    porque: `matrícula ${f.matricula}`,
    polizasCima: null,
    ultimoVencimiento: null,
    vitalidad: 'desconocida',
    hermanas: null,
    aviso: null,
  }))
  return bloque(c, hallazgos, await coberturaMatricula(correduriaId))
}

/**
 * Localidad o CP del RIESGO: viven en claro en `datos_especificos` de la
 * póliza (`localidad`, `cp`), no en la ficha del cliente. Es lo que hace que
 * la casa de la playa salga buscando el pueblo, aunque el cliente viva en
 * Sevilla. Un CP de 5 dígitos se compara exacto; un texto, por fragmento.
 */
async function porRiesgo(correduriaId: string, c: Criterio): Promise<BloqueResultados> {
  const db = prismaAsegura()
  const esCp = /^\d{5}$/.test(c.valor)
  const filas = await db.$queryRaw<
    { id: string; nombre: string; apellidos: string; tipo: string; donde: string; numero: string | null }[]
  >`
    select distinct on (cl.id)
      cl.id, cl.nombre, cl.apellidos, cl.tipo::text as tipo,
      concat_ws(' ', p.datos_especificos->>'localidad', p.datos_especificos->>'cp') as donde,
      p.numero_poliza as numero
    from polizas p
    join clientes cl on cl.id = p.cliente_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      and cl.merged_into_cliente_id is null
      and (
        ${esCp} and p.datos_especificos->>'cp' = ${c.valor}
        or (not ${esCp}) and unaccent(p.datos_especificos->>'localidad') ilike unaccent(${'%' + c.valor + '%'})
      )
    limit ${LIMITE}
  `.catch(async () => {
    // `unaccent` puede no estar instalada en el origen: se reintenta sin ella
    // antes que devolver vacío. Vacío aquí diría «nadie asegura nada ahí».
    return db.$queryRaw<
      { id: string; nombre: string; apellidos: string; tipo: string; donde: string; numero: string | null }[]
    >`
      select distinct on (cl.id)
        cl.id, cl.nombre, cl.apellidos, cl.tipo::text as tipo,
        concat_ws(' ', p.datos_especificos->>'localidad', p.datos_especificos->>'cp') as donde,
        p.numero_poliza as numero
      from polizas p
      join clientes cl on cl.id = p.cliente_id
      where p.correduria_id = ${correduriaId}::uuid
        and p.merged_into_poliza_id is null
        and cl.merged_into_cliente_id is null
        and (
          ${esCp} and p.datos_especificos->>'cp' = ${c.valor}
          or (not ${esCp}) and p.datos_especificos->>'localidad' ilike ${'%' + c.valor + '%'}
        )
      limit ${LIMITE}
    `
  })
  const conteos = await polizasDe(filas.map((f) => f.id))
  const hallazgos: Hallazgo[] = filas.map((f) => ({
    ...aHallazgo({ ...f, _count: { polizas: conteos.get(f.id) ?? 0 } }, ''),
    porque: `riesgo en ${f.donde.trim()}${f.numero ? ` · póliza ${f.numero}` : ''}`,
  }))
  return bloque(c, hallazgos, await coberturaRiesgo(correduriaId, esCp ? 'cp' : 'localidad'))
}

async function coberturaRiesgo(
  correduriaId: string,
  campo: 'cp' | 'localidad',
): Promise<{ alcanzables: number; total: number } | null> {
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ con: bigint; total: bigint }[]>`
      select
        count(*) filter (where nullif(btrim(datos_especificos->>${campo}), '') is not null)::bigint as con,
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

/** Tope de direcciones que se traen para descifrar. Hoy son 170; el tope es por si crece. */
const MAX_DIRECCIONES = 2000

/**
 * La calle del riesgo, DESCIFRADA EN MEMORIA. Por SQL es imposible (cifrado
 * autenticado, sin índice ciego), pero son ~170 pólizas y la app tiene la
 * clave: se traen todas, se descifran y se comparan sin acentos ni signos.
 *
 * La cobertura del bloque es «cuántas se han podido leer de cuántas hay»:
 * sin clave, `decryptField` devuelve el `v1:…` tal cual y eso cuenta como
 * ilegible, no como «esa póliza no tiene calle».
 */
async function porDireccion(correduriaId: string, c: Criterio): Promise<BloqueResultados> {
  const db = prismaAsegura()
  const filas = await db.$queryRaw<
    {
      id: string
      nombre: string
      apellidos: string
      tipo: string
      direccion: string
      localidad: string | null
      numero: string | null
    }[]
  >`
    select cl.id, cl.nombre, cl.apellidos, cl.tipo::text as tipo,
           p.datos_especificos->>'direccion' as direccion,
           p.datos_especificos->>'localidad' as localidad,
           p.numero_poliza as numero
    from polizas p
    join clientes cl on cl.id = p.cliente_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      and cl.merged_into_cliente_id is null
      and nullif(btrim(p.datos_especificos->>'direccion'), '') is not null
    limit ${MAX_DIRECCIONES}
  `
  let legibles = 0
  const vistos = new Set<string>()
  const encontrados: { f: (typeof filas)[number]; claro: string }[] = []
  for (const f of filas) {
    const claro = descifrarCalle(f.direccion)
    if (claro === null) continue
    legibles++
    if (vistos.has(f.id) || !direccionCoincide(claro, c.valor)) continue
    vistos.add(f.id)
    encontrados.push({ f, claro })
    if (encontrados.length >= LIMITE) break
  }
  const conteos = await polizasDe(encontrados.map((e) => e.f.id))
  const hallazgos: Hallazgo[] = encontrados.map(({ f, claro }) => ({
    ...aHallazgo({ ...f, _count: { polizas: conteos.get(f.id) ?? 0 } }, ''),
    porque: `riesgo en ${claro}${f.localidad ? `, ${f.localidad}` : ''}${f.numero ? ` · póliza ${f.numero}` : ''}`,
  }))
  return bloque(c, hallazgos, { alcanzables: legibles, total: filas.length })
}

/** `null` = no se ha podido leer (sin clave, o cifrado corrupto). Nunca se inventa. */
function descifrarCalle(v: string): string | null {
  if (!v.startsWith('v1:')) return v
  try {
    const claro = decryptField(v)
    // Sin clave, `decryptField` devuelve el cifrado tal cual: eso NO es legible.
    return claro.startsWith('v1:') ? null : claro
  } catch {
    return null
  }
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

// ── Enriquecimiento: ¿esta ficha es de HOY? ─────────────────────────────────
//
// 🚨 El problema que resuelve, medido el 02/09/2026 sobre «suarez salas»: el
// buscador devolvía DOS fichas idénticas a la vista, las dos rotuladas
// «✅ cliente», una con 14 pólizas y otra con 7. La de 14 es el volcado de
// junio (último vencimiento: 2016). La de 7 es la viva (vence en 2027). El
// número más grande está en la ficha muerta, así que es la que atrae el clic.
//
// No se fusiona nada: el rol de esta app es SELECT-only sobre la BD de Manuel,
// y además 203 de los 740 grupos que comparten teléfono llevan nombres
// distintos (familias, empresas) y NO son duplicados. Se mide y se dice.

type Senales = { polizasCima: number | null; ultimoVencimiento: string | null }

/** `null` = la consulta falló. Un Map vacío = se miró y no hay nada. */
async function senalesDe(
  correduriaId: string,
  ids: string[],
): Promise<Map<string, Senales> | null> {
  if (ids.length === 0) return new Map()
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ cliente_id: string; cima: number; ultimo: Date | null }[]>`
      select cliente_id::text as cliente_id,
             count(*) filter (where import_ref is null)::int as cima,
             max(fecha_vencimiento) as ultimo
      from polizas
      where correduria_id = ${correduriaId}::uuid
        and merged_into_poliza_id is null
        and cliente_id::text = any(${ids}::text[])
      group by cliente_id
    `
    return new Map(
      filas.map((f) => [
        f.cliente_id,
        {
          polizasCima: Number(f.cima),
          ultimoVencimiento: f.ultimo === null ? null : f.ultimo.toISOString().slice(0, 10),
        },
      ]),
    )
  } catch {
    return null
  }
}

type HermanaCruda = { de: string; id: string; nombre: string; mismoNombre: boolean }

/**
 * Otras fichas SIN fusionar que comparten el índice ciego del teléfono. Es el
 * único vínculo fiable que hay: el DNI solo lo tiene el 12% de las fichas, y
 * la ficha histórica de este caso ni siquiera lo tiene calculado.
 */
async function hermanasDe(correduriaId: string, ids: string[]): Promise<HermanaCruda[] | null> {
  if (ids.length === 0) return []
  try {
    const db = prismaAsegura()
    return await db.$queryRaw<HermanaCruda[]>`
      select c.id::text as "de", o.id::text as id,
             btrim(o.nombre || ' ' || o.apellidos) as nombre,
             (lower(btrim(o.nombre)) = lower(btrim(c.nombre))
              and lower(btrim(o.apellidos)) = lower(btrim(c.apellidos))) as "mismoNombre"
      from clientes c
      join clientes o
        on o.telefono_lookup_hash = c.telefono_lookup_hash
       and o.id <> c.id
       and o.correduria_id = c.correduria_id
       and o.merged_into_cliente_id is null
      where c.correduria_id = ${correduriaId}::uuid
        and c.telefono_lookup_hash is not null
        and c.id::text = any(${ids}::text[])
      limit 200
    `
  } catch {
    // NO se devuelve []: eso diría «no tiene duplicados», que es lo que
    // tranquiliza. `null` deja el aviso en silencio sin afirmar nada.
    return null
  }
}

async function enriquecer(correduriaId: string, bloques: BloqueResultados[]): Promise<void> {
  const ids = [...new Set(bloques.flatMap((b) => b.hallazgos.map((h) => h.clienteId)))]
  if (ids.length === 0) return

  const crudas = await hermanasDe(correduriaId, ids)
  // Las señales se piden también de las hermanas: para poder decir «la otra es
  // la viva» hay que saber si de verdad lo es.
  const todos = [...new Set([...ids, ...(crudas ?? []).map((h) => h.id)])]
  const senales = await senalesDe(correduriaId, todos)

  const senalDe = (id: string): Senales =>
    senales === null ? { polizasCima: null, ultimoVencimiento: null } : (senales.get(id) ?? { polizasCima: 0, ultimoVencimiento: null })

  const porFicha = new Map<string, Hermana[]>()
  for (const h of crudas ?? []) {
    const lista = porFicha.get(h.de) ?? []
    lista.push({
      clienteId: h.id,
      nombre: h.nombre,
      mismoNombre: h.mismoNombre,
      vitalidad: vitalidadFicha(senalDe(h.id)),
    })
    porFicha.set(h.de, lista)
  }

  for (const b of bloques) {
    for (const h of b.hallazgos) {
      const s = senalDe(h.clienteId)
      h.polizasCima = s.polizasCima
      h.ultimoVencimiento = s.ultimoVencimiento
      h.vitalidad = vitalidadFicha(s)
      h.hermanas = crudas === null ? null : (porFicha.get(h.clienteId) ?? [])
      h.aviso = avisoHermanas(h.vitalidad, h.hermanas)
    }
  }
}
