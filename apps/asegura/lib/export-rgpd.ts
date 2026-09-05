import {
  construirExport,
  MEDIADOR,
  VERSION_TEXTOS_LEGALES,
  type BloqueExport,
  type CategoriaExport,
  type ExportRgpd,
} from '@central/module-seguros'

import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { registrarErrorCartera } from './error-cartera'

/**
 * Monta el paquete del **derecho de acceso (art. 15 RGPD)** y de
 * **portabilidad (art. 20)** de una persona.
 *
 * 🚨 Se sirve desde ESTA app y no desde el portal a propósito. El rol del
 * portal (`prisma_asegura_portal`) es estrecho por diseño —sin BYPASSRLS, con
 * GRANT por columnas— y **no alcanza la cartera**. Ampliarlo para un export
 * abriría de par en par, y de forma permanente, lo que está cerrado el resto
 * del tiempo: quien robara una sesión del portal se llevaría de golpe todo lo
 * que hoy no puede ni mirar. Aquí se lee con `prisma_seguros`, detrás del
 * puerto de operador, que solo habla con `plataforma`.
 *
 * 🚨 Cada categoría se consulta por separado y en su propio `try`. No es
 * paranoia: si una consulta falla y el bloque entero se cae, el interesado
 * recibiría un paquete sin ese apartado — indistinguible del de alguien que no
 * tiene nada de eso. Un fallo se marca `no_consultable` y **eso marca el
 * paquete como incompleto**, que es lo que hay que decirle.
 */

/** Lee una categoría y la convierte en bloque, sin dejar que un fallo lo tumbe todo. */
async function bloque(
  categoria: CategoriaExport,
  leer: () => Promise<readonly unknown[]>,
): Promise<BloqueExport> {
  try {
    const filas = await leer()
    return filas.length > 0
      ? { categoria, incluida: true, filas }
      : { categoria, incluida: false, motivo: 'sin_datos' }
  } catch (e) {
    registrarErrorCartera(`export-rgpd/${categoria}`, e)
    return { categoria, incluida: false, motivo: 'no_consultable' }
  }
}

/** Un bloque que no procede (p. ej. la cartera de quien no tiene ficha). */
function noAplica(categoria: CategoriaExport): BloqueExport {
  return { categoria, incluida: false, motivo: 'no_aplica' }
}

export type ResultadoExport =
  | { estado: 'sin_configurar' }
  | { estado: 'no_encontrado' }
  | { estado: 'ok'; paquete: ExportRgpd }

/**
 * @param identidadId La identidad del portal cuyo titular ejerce el derecho.
 * @param ahora Se inyecta para que el test no dependa del reloj.
 */
export async function exportRgpdDeIdentidad(
  identidadId: string,
  ahora: Date = new Date(),
): Promise<ResultadoExport> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  const db = prismaAsegura()

  const identidad = await db.portalIdentidad.findUnique({ where: { id: identidadId } })
  if (!identidad) return { estado: 'no_encontrado' }

  // La ficha de la cartera, si la hay. Sin vínculo no hay nada que enseñar de
  // la cartera, y eso es «no aplica», no un fallo.
  const vinculos = await db.portalVinculo.findMany({ where: { identidadId } }).catch(() => null)
  const vinculo = vinculos?.[0] ?? null
  const clienteId = vinculo?.clienteId ?? null
  // 🚨 La correduría sale del VÍNCULO, y toda lectura de la cartera la lleva. Con
  // BYPASSRLS un `clienteId` de otra correduría no da error: da sus datos. En un
  // export eso sería entregarle a alguien el expediente de otra persona.
  const correduriaId = vinculo?.correduriaId ?? null

  const bloques: BloqueExport[] = [
    { categoria: 'identidad_portal', incluida: true, filas: [identidad] },

    await bloque('canales', () =>
      db.portalCanal.findMany({
        where: { identidadId },
        // `valor_hash` ni se pide: es un HMAC del correo y no se puede deshacer.
        select: { id: true, tipo: true, verificadoEn: true, creadoEn: true },
        orderBy: { creadoEn: 'asc' },
      }),
    ),

    await bloque('acreditaciones', () =>
      db.portalConsentimiento.findMany({ where: { identidadId }, orderBy: { creadoEn: 'asc' } }),
    ),

    await bloque('bienes', () =>
      db.portalBien.findMany({ where: { identidadId }, orderBy: { creadoEn: 'asc' } }),
    ),

    await bloque('polizas_declaradas', () =>
      db.portalPolizaDeclarada.findMany({ where: { identidadId }, orderBy: { creadaEn: 'asc' } }),
    ),

    await bloque('partes', () =>
      db.portalParteSiniestro.findMany({ where: { identidadId }, orderBy: { creadoEn: 'asc' } }),
    ),

    vinculos === null
      ? { categoria: 'vinculos', incluida: false, motivo: 'no_consultable' }
      : vinculos.length > 0
        ? { categoria: 'vinculos', incluida: true, filas: vinculos }
        : { categoria: 'vinculos', incluida: false, motivo: 'sin_datos' },

    clienteId === null
      ? noAplica('ficha_cartera')
      : await bloque('ficha_cartera', async () => {
          const c = await db.cliente.findFirst({
            where: { id: clienteId, correduriaId: correduriaId! },
            select: {
              id: true,
              nombre: true,
              apellidos: true,
              tipo: true,
              segmento: true,
              email: true,
              telefono: true,
              createdAt: true,
            },
          })
          return c ? [c] : []
        }),

    clienteId === null
      ? noAplica('polizas_cartera')
      : await bloque('polizas_cartera', () =>
          db.poliza.findMany({
            where: { clienteId, correduriaId: correduriaId! },
            select: {
              id: true,
              tipo: true,
              aseguradora: true,
              numeroPoliza: true,
              fechaInicio: true,
              fechaVencimiento: true,
              primaAnual: true,
              estado: true,
              situacion: true,
            },
            orderBy: { fechaVencimiento: 'desc' },
          }),
        ),
  ]

  return {
    estado: 'ok',
    paquete: construirExport({
      bloques,
      generadoEn: ahora,
      versionTextosLegales: VERSION_TEXTOS_LEGALES,
      mediador: {
        nombre: MEDIADOR.identidad.nombre,
        nif: MEDIADOR.identidad.nif,
        claveDgsfp: MEDIADOR.identidad.claveDgsfp,
        contacto: MEDIADOR.identidad.email,
      },
    }),
  }
}
