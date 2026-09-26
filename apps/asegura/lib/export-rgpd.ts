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
 *
 * 🚨 Y una identidad puede tener MÁS DE UN VÍNCULO con la cartera (una persona
 * y su sociedad; una fusión de fichas pendiente). La guarda que las crea es un
 * `findUnique` sobre el par identidad+cliente, no sobre la identidad, así que
 * varios vínculos no son un caso raro: son el diseño. Hasta el 20/09/2026 este
 * fichero exportaba TODOS los vínculos y luego leía la ficha y las pólizas
 * **solo del primero** (`vinculos?.[0]`), y el paquete salía marcado
 * `completo: true` porque nada había fallado: un documento que enseñaba dos
 * enlaces y una sola ficha, sin un solo hueco que delatara lo que faltaba. Se
 * recorren los N, y si uno no se puede leer cae la categoría entera con
 * `no_consultable` — que es lo que pone `completo` en `false`.
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

/** Un bloque que no se ha podido mirar. NO es «no tienes». */
function noConsultable(categoria: CategoriaExport): BloqueExport {
  return { categoria, incluida: false, motivo: 'no_consultable' }
}

/**
 * Una ficha de la cartera enlazada con esta identidad.
 *
 * 🚨 La correduría sale del VÍNCULO, y toda lectura de la cartera la lleva. Con
 * BYPASSRLS un `clienteId` de otra correduría no da error: da sus datos. En un
 * export eso sería entregarle a alguien el expediente de otra persona.
 */
type FichaEnlazada = { clienteId: string; correduriaId: string }

/**
 * De quién es la póliza sobre la que se abrió un parte.
 *
 * `PortalParteSiniestro.polizaId` puede apuntar a la póliza de OTRA persona que
 * le autorizó a verla. El parte es actividad SUYA y se le entrega entero —
 * esconderlo sería responder de menos al art. 15—, pero el contrato del tercero
 * no viaja: ni su id, que es la llave para cruzarlo con cualquier otra cosa.
 *
 * `no_comprobada` es el tercer estado de siempre: no se ha podido averiguar de
 * quién es, así que tampoco se afirma que sea suya. `null` es el parte que no
 * cuelga de ninguna póliza de la cartera (va sobre una declarada, o sobre una
 * que ya se desligó).
 */
type PolizaDelParte = 'propia' | 'de_un_tercero_que_te_autorizo' | 'no_comprobada' | null

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

  // Los vínculos con la cartera, TODOS. `null` = no se han podido leer, que no
  // es «no tiene ninguno»: de esa diferencia depende que los dos apartados de
  // cartera salgan como «no procede» (una afirmación) o como «no se ha podido
  // mirar» (que además deja el paquete marcado incompleto).
  const vinculos = await db.portalVinculo
    .findMany({
      where: { identidadId },
      select: {
        id: true,
        correduriaId: true,
        clienteId: true,
        nivel: true,
        origen: true,
        creadoEn: true,
      },
      orderBy: { creadoEn: 'asc' },
    })
    .catch(() => null)

  // Las parejas ficha+correduría a recorrer, sin repetir (el índice único es
  // por identidad+cliente, así que dos filas con el mismo cliente no deberían
  // existir; si las hubiera, no se exportaría dos veces la misma ficha).
  const fichas: FichaEnlazada[] | null =
    vinculos === null
      ? null
      : [...new Map(vinculos.map((v) => [`${v.correduriaId}:${v.clienteId}`, v])).values()].map((v) => ({
          clienteId: v.clienteId,
          correduriaId: v.correduriaId,
        }))

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

    // 🚨 Con `select` explícito, no con la fila entera. Una columna nueva en la
    // tabla entraría sola en un documento que se le manda a una persona, sin
    // que nadie lo decidiera. La IP y el navegador SÍ van: son datos suyos y el
    // propio paquete dice que se guardan y por qué (art. 19 de la Ley 16/2018),
    // así que quitarlos dejaría la descripción mintiendo y le negaría algo a lo
    // que el art. 15 le da derecho.
    await bloque('acreditaciones', () =>
      db.portalConsentimiento.findMany({
        where: { identidadId },
        select: {
          id: true,
          tipo: true,
          otorgado: true,
          versionTexto: true,
          ip: true,
          userAgent: true,
          creadoEn: true,
        },
        orderBy: { creadoEn: 'asc' },
      }),
    ),

    await bloque('bienes', () =>
      db.portalBien.findMany({
        where: { identidadId },
        select: { id: true, tipo: true, nombre: true, datos: true, creadoEn: true },
        orderBy: { creadoEn: 'asc' },
      }),
    ),

    await bloque('polizas_declaradas', () =>
      db.portalPolizaDeclarada.findMany({ where: { identidadId }, orderBy: { creadaEn: 'asc' } }),
    ),

    await bloque('partes', () => partesDeIdentidad(db, identidadId, fichas)),

    vinculos === null
      ? noConsultable('vinculos')
      : vinculos.length > 0
        ? {
            categoria: 'vinculos',
            incluida: true,
            // `correduriaId` no sale: es el mismo para todas las filas y no dice
            // nada sobre él, solo sobre nosotros.
            filas: vinculos.map(({ correduriaId: _correduria, ...resto }) => resto),
          }
        : { categoria: 'vinculos', incluida: false, motivo: 'sin_datos' },

    fichas === null
      ? // No se sabe si tiene ficha: decir «no procede» sería afirmar que no la
        // tiene, y encima dejaría el paquete marcado como completo.
        noConsultable('ficha_cartera')
      : fichas.length === 0
        ? noAplica('ficha_cartera')
        : await bloque('ficha_cartera', async () => {
            const filas = []
            for (const f of fichas) {
              const c = await db.cliente.findFirst({
                where: { id: f.clienteId, correduriaId: f.correduriaId },
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
              if (c) filas.push(c)
            }
            return filas
          }),

    fichas === null
      ? noConsultable('polizas_cartera')
      : fichas.length === 0
        ? noAplica('polizas_cartera')
        : await bloque('polizas_cartera', async () => {
            const filas = []
            for (const f of fichas) {
              const suyas = await db.poliza.findMany({
                where: { clienteId: f.clienteId, correduriaId: f.correduriaId },
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
              })
              filas.push(...suyas)
            }
            return filas
          }),
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

/**
 * Los partes que ha abierto, con la póliza de cartera RESUELTA en vez del id
 * crudo (ver `PolizaDelParte`).
 *
 * El cotejo de propiedad va en su propio `try`: que no se pueda comprobar de
 * quién es una póliza no puede borrar el parte entero del paquete — el parte es
 * suyo y se le entrega igual, diciendo que esa parte no se ha podido comprobar.
 */
async function partesDeIdentidad(
  db: ReturnType<typeof prismaAsegura>,
  identidadId: string,
  fichas: FichaEnlazada[] | null,
): Promise<readonly unknown[]> {
  const filas = await db.portalParteSiniestro.findMany({
    where: { identidadId },
    // 🚨 `select` explícito: sin él viajaba la fila entera, y con ella el
    // `poliza_id` de un contrato que puede no ser suyo.
    select: {
      id: true,
      polizaId: true,
      polizaDeclaradaId: true,
      descripcion: true,
      fechaHecho: true,
      horaAproximada: true,
      tipoSiniestro: true,
      lugar: true,
      hayHeridos: true,
      hayTerceros: true,
      estado: true,
      siniestroId: true,
      recibidoAt: true,
      abiertoEnCompaniaAt: true,
      descartadoAt: true,
      motivoDescarte: true,
      polizaDesligadaAt: true,
      polizaDesligadaCompania: true,
      polizaDesligadaNumero: true,
      polizaDesligadaRamo: true,
      creadoEn: true,
      actualizadoEn: true,
    },
    orderBy: { creadoEn: 'asc' },
  })

  const propias = await polizasPropias(
    db,
    fichas,
    filas.map((f) => f.polizaId),
  )

  return filas.map(({ polizaId, ...resto }) => {
    let poliza: PolizaDelParte = null
    if (polizaId !== null) {
      poliza = propias === null ? 'no_comprobada' : propias.has(polizaId) ? 'propia' : 'de_un_tercero_que_te_autorizo'
    }
    return {
      ...resto,
      // Solo se devuelve el id de la póliza cuando es SUYA: así se cruza con el
      // apartado «Tus pólizas contratadas», que ya la lleva entera.
      polizaId: poliza === 'propia' ? polizaId : null,
      polizaCartera: poliza,
    }
  })
}

/**
 * De las pólizas que citan sus partes, cuáles son de SUS fichas.
 *
 * `null` = no se ha podido comprobar (los vínculos no se leyeron, o falló la
 * consulta). Un `Set` vacío es otra cosa: se comprobó y ninguna es suya.
 */
async function polizasPropias(
  db: ReturnType<typeof prismaAsegura>,
  fichas: FichaEnlazada[] | null,
  polizaIds: readonly (string | null)[],
): Promise<Set<string> | null> {
  const ids = [...new Set(polizaIds.filter((p): p is string => p !== null))]
  if (ids.length === 0) return new Set()
  if (fichas === null) return null
  // Sin ninguna ficha enlazada no hay póliza de la cartera que pueda ser suya.
  // Se contesta sin consultar (y sin un `OR: []`, que en Prisma no filtra nada).
  if (fichas.length === 0) return new Set()
  try {
    const suyas = await db.poliza.findMany({
      where: {
        id: { in: ids },
        OR: fichas.map((f) => ({ clienteId: f.clienteId, correduriaId: f.correduriaId })),
      },
      select: { id: true },
    })
    return new Set(suyas.map((p) => p.id))
  } catch (e) {
    registrarErrorCartera('export-rgpd/partes-poliza', e)
    return null
  }
}
