// VOLCADO INICIAL (27/10/2026) — cuerpos TRANSACCIONALES, sin prisma ni sesión (el `tx` entra por parámetro con una forma
// mínima, como `facturas-tx.ts`), para probar con un `tx` falso el ORDEN de las sentencias y que TODO lo que se crea lleva el
// titular del VOLCADO (nunca uno de la petición).
//
// 🚨 Reglas que vigila `volcado-tx.test.ts`:
//   · reservar: bloqueo por TITULAR → recuento de lecturas con IA del mes (facturas + volcados) → inserción. Sin el bloqueo,
//     N subidas simultáneas leen el mismo recuento y todas pasan el cupo. El mismo bloqueo lo toma la subida de facturas.
//   · escribir: solo los elementos «nueva» de la evaluación; edificios antes que sus unidades, inmuebles antes que contratos
//     y gastos; cada `create` con `titularId: x.titularId`. Un edificio EXISTENTE se vuelve a buscar dentro del titular (y
//     la BD lo cierra otra vez con la FK compuesta `(inmueble_padre_id, titular_id)`); si no aparece, se aborta TODO.
import {
  componerDireccion,
  quedaCupoIa,
  type Destino,
  type EvaluacionVolcado,
  type InquilinoVolcado,
  type PropuestaVolcado,
} from '@central/module-patrimonio'

type Fila = Record<string, unknown>
type Delegado = {
  count(a: Fila): Promise<number>
  create(a: Fila): Promise<{ id: string }>
  findFirst(a: Fila): Promise<Fila | null>
}
/** Lo mínimo que se usa de `Prisma.TransactionClient` (se le pasa con un `as unknown as TxVolcado`). */
export interface TxVolcado {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  portalPatrimonioGasto: Pick<Delegado, 'count'>
  portalPatrimonioImportacion: Pick<Delegado, 'count' | 'create'>
  portalPatrimonioInmueble: Pick<Delegado, 'create' | 'findFirst'>
  portalPatrimonioContrato: Pick<Delegado, 'create'>
  portalPatrimonioPlantillaGasto: Pick<Delegado, 'create'>
}

/** Clave del bloqueo del CUPO de IA de un titular (la comparten facturas y volcados). */
export const claveCupoIa = (titularId: string) => `portal-cupo-ia:${titularId}`

/** Volcados creados por el titular desde `desdeMes` (cada uno es UNA lectura con IA, se descartara o no). */
export function contarVolcadosMesTx(tx: Pick<TxVolcado, 'portalPatrimonioImportacion'>, titularId: string, desdeMes: Date): Promise<number> {
  return tx.portalPatrimonioImportacion.count({ where: { titularId, volcado: true, creadoEn: { gte: desdeMes } } })
}

export async function reservarVolcadoTx(
  tx: TxVolcado,
  x: { identidadId: string; titularId: string; hash: string; nombre: string | null; cupoMes: number; desdeMes: Date },
): Promise<{ ok: true; id: string } | { ok: false; motivo: 'cupo' }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${claveCupoIa(x.titularId)}, 0))`
  const facturas = await tx.portalPatrimonioGasto.count({ where: { titularId: x.titularId, origen: 'factura', creadoEn: { gte: x.desdeMes } } })
  const volcados = await contarVolcadosMesTx(tx, x.titularId, x.desdeMes)
  if (!quedaCupoIa(facturas + volcados, x.cupoMes)) return { ok: false, motivo: 'cupo' }
  const v = await tx.portalPatrimonioImportacion.create({
    data: {
      identidadId: x.identidadId,
      titularId: x.titularId,
      volcado: true,
      ficheroHash: x.hash,
      ficheroNombre: x.nombre,
      creadoPorIdentidadId: x.identidadId,
    },
    select: { id: true },
  })
  return { ok: true, id: v.id }
}

const aFecha = (f: string): Date => new Date(`${f}T00:00:00.000Z`)

export type ResultadoEscritura = { creados: number; contratos: { ref: string; id: string; inquilino: InquilinoVolcado | null }[] }

/** Lo que el edificio pasa a sus unidades (como `crearUnidad` de `edificio-bd.ts`): dirección y comunidad; la RC NO. */
type Herencia = { cp: unknown; municipioIne: unknown; via: unknown; numero: unknown; resto: unknown; direccionNormalizada: unknown; enComunidad: unknown }

export async function escribirVolcadoTx(
  tx: TxVolcado,
  x: { titularId: string; identidadId: string; propuesta: PropuestaVolcado; evaluacion: EvaluacionVolcado },
): Promise<ResultadoEscritura> {
  const { propuesta: p, evaluacion: e } = x
  const creadosInm = new Map<string, string>()
  const herencia = new Map<string, Herencia>()
  let creados = 0
  const idDe = (d: Destino): string => {
    if ('id' in d) return d.id
    const id = creadosInm.get(d.ref)
    if (!id) throw new Error('volcado: referencia a un inmueble que no se ha creado')
    return id
  }

  // Orden: 1) edificios y sueltos (sin padre), 2) unidades.
  const orden = p.inmuebles.map((i, k) => ({ i, ev: e.inmuebles[k] })).filter(({ ev }) => ev.estado === 'nueva')
  const sinPadre = orden.filter(({ ev }) => ev.edificio === null)
  const unidades = orden.filter(({ ev }) => ev.edificio !== null)
  for (const { i, ev } of sinPadre) {
    const datos = {
      titularId: x.titularId,
      alias: (i.alias ?? i.direccion ?? i.referenciaCatastral) as string,
      uso: i.uso as string,
      referenciaCatastral: i.referenciaCatastral,
      cp: i.cp,
      // La calle NO se ha comprobado con el callejero: `via` nulo = «por validar»; el texto va entero en la normalizada.
      via: null,
      numero: null,
      resto: null,
      direccionNormalizada: ev.direccionNormalizada ?? componerDireccion({ direccion: i.direccion, cp: i.cp, municipio: i.municipio, provincia: i.provincia }),
      superficieM2: i.superficieM2,
      creadoPorIdentidadId: x.identidadId,
    }
    const c = await tx.portalPatrimonioInmueble.create({ data: datos, select: { id: true } })
    creadosInm.set(i.ref, c.id)
    herencia.set(c.id, { cp: datos.cp, municipioIne: null, via: null, numero: null, resto: null, direccionNormalizada: datos.direccionNormalizada, enComunidad: null })
    creados++
  }
  for (const { i, ev } of unidades) {
    const padreId = idDe(ev.edificio!)
    let h = herencia.get(padreId)
    if (!h) {
      // Edificio que YA existía: se busca DENTRO del titular del volcado. Si no está (otro titular, archivado, no es
      // edificio), se aborta toda la transacción: nada a medias.
      const ed = await tx.portalPatrimonioInmueble.findFirst({
        where: { id: padreId, titularId: x.titularId, uso: 'edificio', inmueblePadreId: null, archivadoEn: null },
        select: { cp: true, municipioIne: true, via: true, numero: true, resto: true, direccionNormalizada: true, enComunidad: true },
      })
      if (!ed) throw new Error('volcado: el edificio no es de este titular')
      h = ed as Herencia
      herencia.set(padreId, h)
    }
    const c = await tx.portalPatrimonioInmueble.create({
      data: {
        titularId: x.titularId,
        inmueblePadreId: padreId,
        alias: i.alias as string,
        uso: i.uso as string,
        superficieM2: i.superficieM2,
        ...h,
        creadoPorIdentidadId: x.identidadId,
      },
      select: { id: true },
    })
    creadosInm.set(i.ref, c.id)
    creados++
  }

  const contratos: ResultadoEscritura['contratos'] = []
  for (const [k, c] of p.contratos.entries()) {
    const ev = e.contratos[k]
    if (ev.estado !== 'nueva') continue
    const r = await tx.portalPatrimonioContrato.create({
      data: {
        titularId: x.titularId,
        inmuebleId: idDe(ev.inmueble!),
        inicio: aFecha(c.inicio as string),
        fin: c.fin === null ? null : aFecha(c.fin),
        rentaMensualCent: BigInt(c.rentaCent as number),
        clausula: c.indice === null ? 'ninguna' : 'indice',
        indice: c.indice,
        fianzaCent: c.fianzaCent === null ? null : BigInt(c.fianzaCent),
        creadoPorIdentidadId: x.identidadId,
      },
      select: { id: true },
    })
    contratos.push({ ref: c.ref, id: r.id, inquilino: c.inquilino })
    creados++
  }

  for (const [k, g] of p.gastos.entries()) {
    const ev = e.gastos[k]
    if (ev.estado !== 'nueva') continue
    await tx.portalPatrimonioPlantillaGasto.create({
      data: {
        titularId: x.titularId,
        inmuebleId: ev.inmueble === null ? null : idDe(ev.inmueble),
        comunidadId: null,
        concepto: g.concepto as string,
        categoria: g.categoria as string,
        periodicidad: g.periodicidad as string,
        diaMes: g.diaMes as number,
        inicio: aFecha(g.inicio as string),
        fin: null,
        importeCent: g.importeCent === null ? null : BigInt(g.importeCent),
        proveedor: null,
        activo: true,
        creadoPorIdentidadId: x.identidadId,
      },
      select: { id: true },
    })
    creados++
  }
  return { creados, contratos }
}
