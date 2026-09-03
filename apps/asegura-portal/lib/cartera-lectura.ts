// Fase 4 — lo que el portal LEE de la cartera para una identidad.
//
// 🔒 Aislamiento por CÓDIGO (no hay RLS: el rol es NOBYPASSRLS pero las tablas
// de la cartera no tienen políticas para él). Toda lectura parte de
// `portal_vinculo` filtrado por `identidadId`, que sale de la cookie por
// `lib/session`. Ningún `clienteId` entra desde fuera de este fichero.
//
// Tres estados que la UI tiene que poder decir por separado (regla global
// «dato que NO hay ≠ dato que NO se ha mirado»):
//   - `vinculada: false`         → esta identidad no tiene ficha en la cartera.
//   - vinculada y sin pólizas    → la ficha está, pero no tiene pólizas VIVAS.
//   - campo a `null`             → el dato existe pero el NIVEL no lo enseña.
//     (`prima: null` no es «sin prima»: es «no visible en tu nivel».)
//
// «Vivas» = las que entran o se MANTIENEN por CIMA, más lo que hemos emitido
// nosotros y CIMA aún no ha traído — el criterio único de `WHERE_CARTERA_VIVA`
// (`@central/module-seguros/cartera-viva`), y sin lápida de fusión.
//
// 🚨 Hasta el 03/09/2026 esto era solo `import_ref IS NULL`, y ese filtro tenía
// un agujero MEDIDO: cuando la ingesta de CIMA trae una póliza que YA existía en
// el volcado histórico no crea fila nueva — actualiza la vieja y le deja su
// `import_ref` de 2017. Esa póliza, que CIMA mantiene al día, desaparecía de la
// bóveda de su dueño: el cliente entraba y veía «no tienes pólizas» de un seguro
// que está pagando. Por eso el criterio es la UNIÓN de dos preguntas:
// `import_ref IS NULL` (nació fuera del volcado) O `eiac_xml_hash IS NOT NULL`
// (la ingesta EIAC la ha escrito alguna vez, venga de donde venga).
//
// Las ~28.700 del volcado histórico (vencimientos 2013-2018, sin hash) siguen SIN
// enseñarse: un cliente vería «tu seguro venció en 2016» de una póliza que no
// existe. `confirmadaCima` = CIMA la ha traído (`id_poliza_entidad`); una
// emitida por nosotros aún sin confirmar se dice como tal.
import { camposVisibles, NIVELES, type Nivel } from '@central/module-seguros-portal'
import {
  clientesVisiblesPara,
  importeEiac,
  vigenciaPoliza,
  WHERE_CARTERA_VIVA,
  type Vigencia,
} from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

export type ReciboPortal = {
  situacion: string
  /** `null` = el texto del EIAC no tenía forma de importe. No es 0€. */
  importe: number | null
  fechaEmision: Date | null
  fechaVencimiento: Date | null
  formaPago: string | null
}

export type RecibosPortal = {
  /** `0` = la compañía no ha informado recibos. NO es «al corriente». */
  total: number
  /** El siguiente al cobro (emitido/pendiente), el de vencimiento más próximo. */
  proximoAlCobro: ReciboPortal | null
  /** Devueltos: el cobro se intentó y falló. */
  devueltos: number
  ultimoCobrado: ReciboPortal | null
}

export type SiniestroPortal = {
  id: string
  estado: string
  referencia: string | null
  fechaHora: Date | null
  tramitadorNombre: string | null
  tramitadorTelefono: string | null
}

export type PolizaPortal = {
  id: string
  compania: string
  ramo: string
  numeroPoliza: string | null
  fechaInicio: Date | null
  fechaVencimiento: Date | null
  estado: string
  vigencia: Vigencia
  /** CIMA la ha traído. `false` = emitida por nosotros y la compañía aún no la confirma. */
  confirmadaCima: boolean
  /**
   * De dónde viene la fila, tal cual está en la BD. NO es para pintarlo: es lo
   * que necesitan aguas abajo (`lib/obligaciones.ts`) para volver a preguntar
   * «¿es cartera viva?» con los datos REALES en vez de darlo por hecho.
   */
  procedencia: { importRef: string | null; eiacXmlHash: string | null }
  /** `null` = no visible en este nivel (no «sin prima»). `anual: null` = la compañía no la ha informado. */
  prima: { anual: number | null; mensual: number | null; fraccionamiento: string | null } | null
  /** `total: 0` = ninguna cobertura informada. `null` = no visible en este nivel. */
  coberturas: { total: number; lista: string[] } | null
  /** `null` = no visible en este nivel. */
  recibos: RecibosPortal | null
  siniestrosAbiertos: SiniestroPortal[]
}

export type TitularPortal = {
  clienteId: string
  nombre: string
  nivel: Nivel
  polizas: PolizaPortal[]
}

export type CarteraPortal = {
  vinculada: boolean
  /** Nombre de la correduría del vínculo (única columna legible de `corredurias`). */
  correduria: string | null
  /** Fichas de la propia identidad, con el nivel de su vínculo. */
  propias: TitularPortal[]
  /** Fichas de OTROS que han autorizado a ver sus pólizas (`cliente_relaciones`). */
  autorizadas: TitularPortal[]
}

const SIN_VINCULO: CarteraPortal = { vinculada: false, correduria: null, propias: [], autorizadas: [] }

/** Coberturas que se listan en la card antes del «y N más». */
const COBERTURAS_EN_CARD = 4

/**
 * Nivel de lo AJENO. `cliente_relaciones.puede_ver_polizas` es un booleano: la
 * tabla del CRM no guarda un nivel por autorización. Se lee como `completo`
 * (prima y recibos sí; crear peticiones y autorizar a terceros, no): quien te
 * autoriza a ver sus seguros te enseña lo que paga, pero no te deja gestionarlos.
 * Cuando exista `portal_autorizacion` (Fase 5) el nivel vendrá de ahí.
 */
const NIVEL_AUTORIZADA: Nivel = 'completo'

/** `nivel` es `text` en la BD (CHECK). Un valor fuera del vocabulario cae al nivel MÁS bajo. */
function nivelDeVinculo(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

const SITUACIONES_AL_COBRO = new Set(['pendiente', 'emitido'])

export async function carteraDeSesion(): Promise<CarteraPortal | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return carteraDeIdentidad(identidad.id)
}

export async function carteraDeIdentidad(identidadId: string): Promise<CarteraPortal> {
  // El filtro por identidadId es la única frontera entre una bóveda y otra.
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true, nivel: true },
    orderBy: { creadoEn: 'asc' },
  })
  if (vinculos.length === 0) return SIN_VINCULO

  const correduria = await prisma.correduria.findUnique({
    where: { id: vinculos[0].correduriaId },
    select: { nombre: true },
  })

  const propiosIds = vinculos.map((v) => v.clienteId)
  const nivelPorCliente = new Map(vinculos.map((v) => [v.clienteId, nivelDeVinculo(v.nivel)]))

  // Quién me autoriza: filas A→(mi cliente) con el flag. `clientesVisiblesPara`
  // fija la semántica (A autoriza a B); `observaciones` no es legible por el
  // rol y el helper no la usa para decidir, así que va a null.
  const filasAutorizacion = await prisma.clienteRelacion.findMany({
    where: { clienteBId: { in: propiosIds }, puedeVerPolizas: true },
    select: { id: true, clienteAId: true, clienteBId: true, tipoRelacion: true, puedeVerPolizas: true },
  })
  const filas = filasAutorizacion.map((f) => ({
    id: f.id,
    clienteAId: f.clienteAId,
    clienteBId: f.clienteBId,
    tipo: f.tipoRelacion,
    puedeVerPolizas: f.puedeVerPolizas,
    observaciones: null,
  }))
  const autorizadosIds: string[] = []
  for (const mio of propiosIds) {
    for (const a of clientesVisiblesPara(filas, mio)) {
      if (!propiosIds.includes(a) && !autorizadosIds.includes(a)) autorizadosIds.push(a)
    }
  }

  const todosIds = [...propiosIds, ...autorizadosIds]
  const [clientes, polizas] = await Promise.all([
    prisma.cliente.findMany({
      where: { id: { in: todosIds }, mergedIntoClienteId: null },
      select: { id: true, nombre: true, apellidos: true },
    }),
    prisma.poliza.findMany({
      // `WHERE_CARTERA_VIVA` va DENTRO del `AND`: es un `OR` de dos brazos y
      // dejarlo suelto al lado del resto mezclaría las ramas (devolvería
      // pólizas de otros clientes con `import_ref IS NULL`).
      where: {
        AND: [{ clienteId: { in: todosIds }, mergedIntoPolizaId: null }, WHERE_CARTERA_VIVA],
      },
      orderBy: [{ fechaVencimiento: 'desc' }, { createdAt: 'desc' }],
    }),
  ])

  const polizaIds = polizas.map((p) => p.id)
  const [coberturas, recibos, siniestros] =
    polizaIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.polizaCobertura.findMany({
            where: { polizaId: { in: polizaIds } },
            select: { polizaId: true, descripcion: true, codigo: true, numeroOrden: true },
            orderBy: { numeroOrden: 'asc' },
          }),
          prisma.polizaRecibo.findMany({
            where: { polizaId: { in: polizaIds } },
            select: {
              polizaId: true,
              situacion: true,
              primaTotal: true,
              fechaEmision: true,
              fechaVencimiento: true,
              formaPago: true,
            },
            orderBy: { fechaEmision: 'desc' },
          }),
          prisma.siniestro.findMany({
            where: { polizaId: { in: polizaIds }, estado: { in: ['abierto', 'en_tramitacion'] } },
            select: {
              id: true,
              polizaId: true,
              estado: true,
              referencia: true,
              fechaHora: true,
              tramitadorNombre: true,
              tramitadorTelefono: true,
            },
            orderBy: { fechaHora: 'desc' },
          }),
        ])

  const agrupar = <T extends { polizaId: string }>(lista: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of lista) {
      const g = m.get(x.polizaId)
      if (g) g.push(x)
      else m.set(x.polizaId, [x])
    }
    return m
  }
  const coberturasPor = agrupar(coberturas)
  const recibosPor = agrupar(recibos)
  const siniestrosPor = agrupar(siniestros)
  const hoy = new Date()

  const aPortal = (p: (typeof polizas)[number], nivel: Nivel): PolizaPortal => {
    const ve = camposVisibles(nivel)
    const cobs = coberturasPor.get(p.id) ?? []
    const recs = recibosPor.get(p.id) ?? []
    return {
      id: p.id,
      compania: p.aseguradora,
      ramo: p.tipo,
      numeroPoliza: ve.numeroPoliza ? p.numeroPoliza : null,
      fechaInicio: p.fechaInicio,
      fechaVencimiento: p.fechaVencimiento,
      estado: p.estado,
      vigencia: vigenciaPoliza({ estado: p.estado, fechaVencimiento: p.fechaVencimiento }, hoy),
      confirmadaCima: p.idPolizaEntidad !== null,
      procedencia: { importRef: p.importRef, eiacXmlHash: p.eiacXmlHash },
      prima: ve.prima
        ? {
            // `Decimal` de Prisma → número ANTES de formatear; null se queda null.
            anual: p.primaAnual === null ? null : Number(p.primaAnual),
            mensual: p.primaMensual === null ? null : Number(p.primaMensual),
            fraccionamiento: p.fraccionamiento,
          }
        : null,
      coberturas: ve.coberturas
        ? {
            total: cobs.length,
            lista: cobs
              .map((c) => (c.descripcion ?? c.codigo ?? '').trim())
              .filter(Boolean)
              .slice(0, COBERTURAS_EN_CARD),
          }
        : null,
      recibos: ve.recibos ? resumirRecibosPortal(recs) : null,
      siniestrosAbiertos: (siniestrosPor.get(p.id) ?? []).map((s) => ({
        id: s.id,
        estado: s.estado,
        referencia: s.referencia,
        fechaHora: s.fechaHora,
        // Contacto de la COSA (tramitador de la compañía), visible en todos los niveles.
        tramitadorNombre: ve.telefonoSiniestros ? s.tramitadorNombre : null,
        tramitadorTelefono: ve.telefonoSiniestros ? s.tramitadorTelefono : null,
      })),
    }
  }

  const nombrePor = new Map(clientes.map((c) => [c.id, `${c.nombre} ${c.apellidos}`.trim()]))
  const titular = (clienteId: string, nivel: Nivel): TitularPortal | null => {
    // Una ficha fusionada o que ya no existe no se pinta: sin nombre no hay titular.
    const nombre = nombrePor.get(clienteId)
    if (nombre === undefined) return null
    return {
      clienteId,
      nombre,
      nivel,
      polizas: polizas.filter((p) => p.clienteId === clienteId).map((p) => aPortal(p, nivel)),
    }
  }

  return {
    vinculada: true,
    correduria: correduria?.nombre ?? null,
    propias: propiosIds.map((id) => titular(id, nivelPorCliente.get(id) ?? 'tarjeta')).filter((t): t is TitularPortal => t !== null),
    autorizadas: autorizadosIds.map((id) => titular(id, NIVEL_AUTORIZADA)).filter((t): t is TitularPortal => t !== null),
  }
}

type ReciboFila = {
  situacion: string | null
  primaTotal: string | null
  fechaEmision: Date | null
  fechaVencimiento: Date | null
  formaPago: string | null
}

/** Recibe la lista ordenada por emisión descendente. `anulado` no cuenta en ningún cubo. */
function resumirRecibosPortal(lista: ReciboFila[]): RecibosPortal {
  const aPortal = (r: ReciboFila): ReciboPortal => ({
    situacion: (r.situacion ?? '').trim() || 'sin_informar',
    importe: importeEiac(r.primaTotal),
    fechaEmision: r.fechaEmision,
    fechaVencimiento: r.fechaVencimiento,
    formaPago: r.formaPago,
  })
  const alCobro = lista
    .filter((r) => SITUACIONES_AL_COBRO.has(r.situacion ?? ''))
    .sort((a, b) => (a.fechaVencimiento?.getTime() ?? Infinity) - (b.fechaVencimiento?.getTime() ?? Infinity))
  const cobrado = lista.find((r) => r.situacion === 'cobrado')
  return {
    total: lista.length,
    proximoAlCobro: alCobro[0] ? aPortal(alCobro[0]) : null,
    devueltos: lista.filter((r) => r.situacion === 'devuelto').length,
    ultimoCobrado: cobrado ? aPortal(cobrado) : null,
  }
}
