// Las OFERTAS de una oportunidad (05/10/2026, F2): subirlas (PDF → documento → IA → fila), listarlas
// con su matriz comparativa y editarlas/revisarlas. La consolidación en presupuesto vive en
// `presupuesto.ts` (`prepararPresupuestoDeOfertas`). Reglas puras en `ofertas-reglas.ts`.
//
// 🛡️ Todo filtrado por `correduriaId`: con BYPASSRLS un id ajeno no falla, devuelve los datos de otro.
// 🚨 Nada de esto gasta Codeoscopic ni sale al cliente. La IA (pasarela, tope mensual) solo LEE el PDF.

import { compararOfertas, ramoOfertaDe, type RamoOferta, type ResultadoComparacion } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { guardarDocumento } from './cartera-documentos'
import { leerOferta } from './documentos/extraer-oferta'
import { ofertaNormalizadaDeFila } from './documentos/oferta-leida'
import { aplicarEdicion, validarEdicionOferta, type FilaOferta, type RolOferta } from './ofertas-reglas'

export type OportunidadParaOfertas = {
  id: string
  clienteId: string
  /** `oportunidades.tipo` tal cual (`comunidades`, `hogar`…). `null` = sin ramo. */
  ramo: string | null
  ramoOferta: RamoOferta
  polizaId: string | null
  /** m² de la vivienda si el riesgo los tiene (`info_riesgo.datosVivienda`). `null` = no constan. */
  superficieM2: number | null
}

/** La oportunidad, solo si es de esta correduría. `null` = no existe aquí. Un fallo de consulta LANZA. */
export async function leerOportunidadParaOfertas(correduriaId: string, oportunidadId: string): Promise<OportunidadParaOfertas | null> {
  const [o] = await prismaAsegura().$queryRaw<{ id: string; cliente_id: string; ramo: string | null; poliza_id: string | null; m2: unknown }[]>`
    select o.id::text as id, o.cliente_id::text as cliente_id, o.tipo::text as ramo, o.poliza_id::text as poliza_id,
           o.info_riesgo->'datosVivienda'->'metrosCuadrados' as m2
    from oportunidades o
    where o.id = ${oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
  if (!o) return null
  const m2 = typeof o.m2 === 'number' && Number.isFinite(o.m2) && o.m2 > 0 ? o.m2 : null
  return { id: o.id, clienteId: o.cliente_id, ramo: o.ramo, ramoOferta: ramoOfertaDe(o.ramo), polizaId: o.poliza_id, superficieM2: m2 }
}

const SELECT_OFERTA = {
  id: true, oportunidadId: true, documentoId: true, rol: true, compania: true, producto: true, primaNeta: true, primaTotal: true,
  garantias: true, datosExtra: true, estado: true, recomendada: true, revisadaAt: true, revisadaPor: true, createdAt: true,
} as const

/** Las ofertas de la oportunidad (también las descartadas: se enseñan aparte), de la más antigua a la más nueva. */
export async function ofertasDeOportunidad(correduriaId: string, oportunidadId: string): Promise<FilaOferta[]> {
  return prismaAsegura().oportunidadOferta.findMany({
    where: { correduriaId, oportunidadId },
    orderBy: { createdAt: 'asc' },
    select: SELECT_OFERTA,
  })
}

/** La matriz de las NO descartadas (las extraídas también: es lo que el corredor revisa). */
export function comparacionDe(op: OportunidadParaOfertas, filas: readonly FilaOferta[], superficieM2?: number | null): ResultadoComparacion {
  const vivas = filas.filter((f) => f.estado !== 'descartada')
  return compararOfertas({
    ramo: op.ramoOferta,
    ofertas: vivas.map(ofertaNormalizadaDeFila),
    superficieM2: superficieM2 ?? op.superficieM2,
  })
}

export type ResultadoListar =
  | { estado: 'ok'; oportunidad: OportunidadParaOfertas; ofertas: ReturnType<typeof aSalida>[]; comparacion: ResultadoComparacion }
  | { estado: 'no_encontrado' }

/** Lo que cruza el puerto de una oferta: sin el fichero, con su número de dinero ya en `number`. */
export function aSalida(f: FilaOferta) {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)))
  return {
    id: f.id, documentoId: f.documentoId, rol: f.rol, compania: f.compania, producto: f.producto,
    primaNeta: n(f.primaNeta), primaTotal: n(f.primaTotal), garantias: f.garantias, datosExtra: f.datosExtra,
    estado: f.estado, recomendada: f.recomendada, revisadaAt: f.revisadaAt, revisadaPor: f.revisadaPor, createdAt: f.createdAt,
  }
}

export async function listarOfertas(correduriaId: string, oportunidadId: string): Promise<ResultadoListar> {
  const op = await leerOportunidadParaOfertas(correduriaId, oportunidadId)
  if (!op) return { estado: 'no_encontrado' }
  const filas = await ofertasDeOportunidad(correduriaId, oportunidadId)
  return { estado: 'ok', oportunidad: op, ofertas: filas.map(aSalida), comparacion: comparacionDe(op, filas) }
}

export type ResultadoSubir =
  | { estado: 'ok'; oferta: ReturnType<typeof aSalida>; leida: boolean; motivo: string | null; repetido: boolean }
  | { estado: 'error'; status: 400 | 404 | 409 | 415 | 500; motivo: string }

/**
 * Sube un PDF a la oportunidad: lo guarda como documento del cliente (`cartera-documentos`), lo lee
 * con IA y deja la oferta en `extraida`. Si la IA no puede leerla, la fila nace igual con los datos a
 * NULL (y el motivo en `datos_extra.lectura`): el corredor la rellena a mano. Nunca se pierde el fichero.
 */
export async function subirOferta(
  correduriaId: string,
  entrada: { oportunidadId: string; rol: RolOferta; fichero: { contenido: Buffer; mime: string; nombre: string }; actor: string },
): Promise<ResultadoSubir> {
  const op = await leerOportunidadParaOfertas(correduriaId, entrada.oportunidadId)
  if (!op) return { estado: 'error', status: 404, motivo: 'Esa oportunidad no existe en esta correduría.' }
  const db = prismaAsegura()
  if (entrada.rol === 'actual') {
    const ya = await db.oportunidadOferta.count({ where: { correduriaId, oportunidadId: op.id, rol: 'actual', estado: { not: 'descartada' } } })
    if (ya > 0) return { estado: 'error', status: 409, motivo: 'Esta oportunidad ya tiene la póliza actual subida. Descarta la anterior si quieres cambiarla.' }
  }

  const doc = await guardarDocumento(correduriaId, {
    clienteId: op.clienteId,
    tipo: 'otro',
    nombre: entrada.fichero.nombre,
    mime: entrada.fichero.mime,
    contenido: entrada.fichero.contenido,
    notas: entrada.rol === 'actual' ? 'Póliza actual subida a una oportunidad (comparativa de ofertas)' : 'Oferta de compañía subida a una oportunidad',
    subidoPor: 'corredor',
  })
  if (!doc.ok) return { estado: 'error', status: doc.status, motivo: doc.motivo }

  const lectura = await leerOferta(entrada.fichero.contenido, entrada.fichero.mime, entrada.fichero.nombre, { ramo: op.ramoOferta, rol: entrada.rol })
  const fila = await db.oportunidadOferta.create({
    data: {
      correduriaId,
      oportunidadId: op.id,
      documentoId: doc.documento.id,
      rol: entrada.rol,
      creadoPor: entrada.actor,
      ...(lectura.ok
        ? {
            compania: lectura.oferta.compania,
            producto: lectura.oferta.producto,
            primaNeta: lectura.oferta.primaNeta,
            primaTotal: lectura.oferta.primaTotal,
            garantias: lectura.oferta.garantias as Prisma.InputJsonValue,
            datosExtra: { ...lectura.oferta.extra, lectura: { ok: true, paginas: lectura.paginas, ramo: op.ramoOferta } } as Prisma.InputJsonValue,
          }
        : {
            // NULL = no se ha podido leer (no «sin garantías»): el corredor la rellena a mano.
            datosExtra: { lectura: { ok: false, motivo: lectura.motivo } } as Prisma.InputJsonValue,
          }),
    },
    select: SELECT_OFERTA,
  })
  anotarCambio({ entidad: 'oferta', id: fila.id, campo: 'estado', antes: null, despues: 'extraida' })
  return { estado: 'ok', oferta: aSalida(fila), leida: lectura.ok, motivo: lectura.ok ? null : lectura.motivo, repetido: doc.repetido }
}

export type ResultadoEditar =
  | { estado: 'ok'; oferta: ReturnType<typeof aSalida> }
  | { estado: 'error'; status: 400 | 404 | 409; motivo: string }

/** PATCH de una oferta: datos, revisar, descartar, recomendar (una sola recomendada por oportunidad). */
export async function editarOferta(correduriaId: string, cuerpo: unknown, actor: string): Promise<ResultadoEditar> {
  const v = validarEdicionOferta(cuerpo)
  if (!v.ok) return { estado: 'error', status: 400, motivo: v.motivo }
  const e = v.edicion
  const db = prismaAsegura()
  const actual = await db.oportunidadOferta.findFirst({ where: { id: e.ofertaId, correduriaId }, select: SELECT_OFERTA })
  if (!actual) return { estado: 'error', status: 404, motivo: 'Esa oferta no existe en esta correduría.' }
  const r = aplicarEdicion(actual, e)
  if (!r.ok) return { estado: 'error', status: 409, motivo: r.motivo }
  const c = r.cambios
  if (c.rol === 'actual' && actual.rol !== 'actual' && c.estado !== 'descartada') {
    const ya = await db.oportunidadOferta.count({
      where: { correduriaId, oportunidadId: actual.oportunidadId, rol: 'actual', estado: { not: 'descartada' }, id: { not: actual.id } },
    })
    if (ya > 0) return { estado: 'error', status: 409, motivo: 'Ya hay otra póliza actual en esta oportunidad: descártala antes.' }
  }
  const extraPrevio = actual.datosExtra && typeof actual.datosExtra === 'object' && !Array.isArray(actual.datosExtra) ? (actual.datosExtra as Record<string, unknown>) : {}
  const ahora = new Date()
  const fila = await db.$transaction(async (tx) => {
    // Una sola recomendada por oportunidad (índice único): se quita a la que lo fuera antes.
    if (c.recomendada && !actual.recomendada) {
      await tx.oportunidadOferta.updateMany({
        where: { correduriaId, oportunidadId: actual.oportunidadId, recomendada: true, id: { not: actual.id } },
        data: { recomendada: false, updatedAt: ahora },
      })
    }
    return tx.oportunidadOferta.update({
      where: { id: actual.id },
      data: {
        ...(c.compania !== undefined ? { compania: c.compania } : {}),
        ...(c.producto !== undefined ? { producto: c.producto } : {}),
        ...(c.primaNeta !== undefined ? { primaNeta: c.primaNeta } : {}),
        ...(c.primaTotal !== undefined ? { primaTotal: c.primaTotal } : {}),
        ...(c.garantias !== undefined ? { garantias: c.garantias as Prisma.InputJsonValue } : {}),
        ...(c.franquiciaGeneral !== undefined ? { datosExtra: { ...extraPrevio, franquiciaGeneral: c.franquiciaGeneral } as Prisma.InputJsonValue } : {}),
        ...(c.rol !== undefined ? { rol: c.rol } : {}),
        estado: c.estado,
        recomendada: c.recomendada,
        // El sello es de la revisión VIGENTE: si deja de estar revisada, se quita (lo revisado era otra cosa).
        ...(c.revisar ? { revisadaAt: ahora, revisadaPor: actor } : c.estado !== 'revisada' ? { revisadaAt: null, revisadaPor: null } : {}),
        updatedAt: ahora,
      },
      select: SELECT_OFERTA,
    })
  })
  if (fila.estado !== actual.estado) anotarCambio({ entidad: 'oferta', id: fila.id, campo: 'estado', antes: actual.estado, despues: fila.estado })
  if (fila.recomendada !== actual.recomendada) anotarCambio({ entidad: 'oferta', id: fila.id, campo: 'recomendada', antes: actual.recomendada, despues: fila.recomendada })
  return { estado: 'ok', oferta: aSalida(fila) }
}
