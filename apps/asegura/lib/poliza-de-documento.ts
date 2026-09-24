// Guardar una póliza que el corredor ha recibido por su cuenta y ha subido él.
//
// El mapeo de lo leído a ficha y a póliza declarada vive puro y testeado en
// `@central/module-seguros` (`poliza-de-documento.ts`). Aquí está solo la mitad
// de base de datos: a qué tablas va y en qué orden.
//
// ─── Las cuatro filas que deja, y por qué en ese orden ──────────────────────
//
//   1. `seguros.clientes`            — la ficha, si no se eligió una existente.
//   2. `seguros.portal_identidad`    — la carpeta a la que cuelga una declarada.
//   3. `seguros.portal_vinculo`      — ata esa carpeta a la ficha (`origen: 'corredor'`).
//   4. `seguros.documentos`          — el PDF o la foto.
//   5. `seguros.portal_poliza_declarada` — la póliza (`procedencia: 'documento'`).
//
// El orden importa porque no hay una transacción única: `altaCliente` y
// `guardarDocumento` traen la suya. Si algo se rompe a mitad, lo que queda
// tiene que ser un estado que el corredor pueda ver y entender. Con este
// orden, el peor caso es **ficha + PDF adjunto sin póliza declarada**: se ve
// entero en la ficha del cliente y se puede repetir la subida. Al revés
// —declarada sin documento— sería un lead sin el papel del que salió.
//
// 🚨 **La identidad se crea SIN canal a propósito, y eso es lo que impide que
// esto abra una puerta.** Al portal se entra con un código de un solo uso
// enviado a un `portal_canal` verificado; una identidad sin canal no tiene a
// dónde recibirlo, así que no da acceso a nadie. Es una carpeta, no una
// cuenta. El día que el corredor le mande el acceso a esa persona, se le crea
// el canal y se encuentra su póliza ya dentro.
//
// 🚨 Y NO se escribe en `seguros.polizas`: esa póliza no la ha mediado la casa.
// Una fila ahí con `import_ref` a NULL contaría como cartera viva, y su número
// real colisionaría con el emparejamiento de CIMA. Ver el módulo puro.

import {
  prepararAltaDesdeDocumento,
  prepararDeclaradaDesdeDocumento,
  type AvisoDocumento,
  type Coincidencia,
  type LecturaPoliza,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { altaCliente, anotarHistorialCliente } from './cartera-edicion'
import { guardarDocumento } from './cartera-documentos'

export type EntradaPolizaDocumento = {
  lectura: LecturaPoliza
  /** Ficha ya elegida por el corredor. `null` = ábrele una nueva. */
  clienteId?: string | null
  /** Contacto que el corredor teclea: el documento casi nunca lo trae. */
  telefono?: string | null
  email?: string | null
  /** Repetir el alta aceptando que el teléfono o el email están en otra ficha. */
  forzar?: boolean
  fichero: { nombre: string; mime: string; contenido: Buffer }
  actor: string
}

export type ResultadoPolizaDocumento =
  | {
      ok: true
      clienteId: string
      /** `true` si la ficha se ha creado ahora; `false` si ya existía. */
      clienteNuevo: boolean
      declaradaId: string | null
      documentoId: string | null
      /** Ya había un documento idéntico en esa ficha: no se ha duplicado nada. */
      repetido: boolean
      avisos: AvisoDocumento[]
    }
  | {
      ok: false
      motivo: string
      status: 400 | 404 | 409 | 415 | 422 | 500
      /** Fichas que ya tienen ese DNI, teléfono o email. */
      coincidencias?: Coincidencia[]
      /** El alta se puede repetir con `forzar` (teléfono/email repetido, no DNI). */
      forzable?: boolean
      avisos?: AvisoDocumento[]
    }

/**
 * La carpeta del portal de esa ficha. Se reutiliza la que ya tenga: si esa
 * persona ya entra al portal, su póliza nueva tiene que aparecerle a ella, no
 * en una carpeta paralela que no verá nunca.
 */
async function identidadDeLaFicha(correduriaId: string, clienteId: string, nombre: string): Promise<string> {
  const db = prismaAsegura()
  const vinculo = await db.portalVinculo.findFirst({
    where: { correduriaId, clienteId },
    select: { identidadId: true },
  })
  if (vinculo) return vinculo.identidadId

  const identidad = await db.portalIdentidad.create({
    data: { nombre: nombre.slice(0, 200) || null },
    select: { id: true },
  })
  await db.portalVinculo.create({
    data: {
      identidadId: identidad.id,
      correduriaId,
      clienteId,
      nivel: 'gestionar',
      origen: 'corredor',
    },
  })
  return identidad.id
}

export async function guardarPolizaDeDocumento(
  correduriaId: string,
  entrada: EntradaPolizaDocumento,
): Promise<ResultadoPolizaDocumento> {
  const { alta, avisos: avisosAlta } = prepararAltaDesdeDocumento(entrada.lectura)
  const { declarada, avisos: avisosPoliza } = prepararDeclaradaDesdeDocumento(entrada.lectura)
  const avisos = [...avisosAlta, ...avisosPoliza]

  let clienteId = entrada.clienteId?.trim() || null
  let clienteNuevo = false
  let nombreFicha = alta ? `${alta.nombre} ${alta.apellidos}`.trim() : ''

  if (!clienteId) {
    // Sin tomador no se abre ficha: inventar un nombre crearía una persona que
    // no existe, y esa persona luego se fusiona a mano.
    if (!alta) {
      return {
        ok: false,
        status: 422,
        motivo: 'El documento no trae el tomador. Elige una ficha o escribe el nombre a mano.',
        avisos,
      }
    }
    const r = await altaCliente(
      correduriaId,
      {
        ...alta,
        telefono: entrada.telefono ?? null,
        email: entrada.email ?? null,
        forzar: entrada.forzar === true,
      },
      entrada.actor,
    )
    if (!r.ok) {
      return {
        ok: false,
        motivo: r.motivo,
        status: r.status,
        coincidencias: 'coincidencias' in r ? r.coincidencias : undefined,
        forzable: 'forzable' in r ? r.forzable : undefined,
        avisos,
      }
    }
    clienteId = r.id
    clienteNuevo = true
  } else {
    const ficha = await prismaAsegura().cliente.findFirst({
      where: { id: clienteId, correduriaId },
      select: { nombre: true, apellidos: true },
    })
    if (!ficha) return { ok: false, status: 404, motivo: 'Esa ficha no existe en esta correduría.', avisos }
    nombreFicha = `${ficha.nombre} ${ficha.apellidos}`.trim()
  }

  // El PDF antes que la póliza: si algo falla aquí, el corredor se queda con la
  // ficha y el papel, que es de lo que puede tirar.
  const doc = await guardarDocumento(correduriaId, {
    clienteId,
    tipo: 'poliza',
    nombre: entrada.fichero.nombre,
    mime: entrada.fichero.mime,
    contenido: entrada.fichero.contenido,
    subidoPor: 'corredor',
    notas: 'Póliza recibida directamente y leída del documento.',
  })
  if (!doc.ok) return { ok: false, motivo: doc.motivo, status: doc.status, avisos }

  // Mismo fichero, misma ficha: ya estaba. No se vuelve a crear la póliza —
  // dos filas iguales serían dos vencimientos y dos avisos por lo mismo.
  if (doc.repetido) {
    return {
      ok: true,
      clienteId,
      clienteNuevo,
      declaradaId: null,
      documentoId: doc.documento.id,
      repetido: true,
      avisos,
    }
  }

  const identidadId = await identidadDeLaFicha(correduriaId, clienteId, nombreFicha)
  const fila = await prismaAsegura().portalPolizaDeclarada.create({
    data: {
      identidadId,
      compania: declarada.compania,
      numeroPoliza: declarada.numeroPoliza,
      ramo: declarada.ramo,
      primaAnual: declarada.primaAnual,
      fechaVencimiento: declarada.fechaVencimiento ? new Date(declarada.fechaVencimiento) : null,
      matricula: declarada.matricula,
      fechaMatriculacion: declarada.fechaMatriculacion ? new Date(declarada.fechaMatriculacion) : null,
      referenciaCatastral: declarada.referenciaCatastral,
      datosRamo: declarada.datosRamo ?? undefined,
      procedencia: 'documento',
      // 🚨 `false` NO es «el dato está mal»: es «lo leyó una máquina y nadie lo
      // ha confirmado». Es lo que hace que salga etiquetada `sin_confirmar` en
      // la pantalla de leads, y sobre esa fecha se decide a quién se llama.
      confirmadaPorUsuario: false,
      documentoNombre: entrada.fichero.nombre.slice(0, 255),
    },
    select: { id: true },
  })

  await anotarHistorialCliente(
    correduriaId,
    clienteId,
    'gestion',
    `Póliza recibida y leída del documento «${entrada.fichero.nombre}»${
      declarada.compania ? ` (${declarada.compania}` : ''
    }${declarada.compania && declarada.fechaVencimiento ? `, vence ${declarada.fechaVencimiento}` : ''}${
      declarada.compania ? ')' : ''
    }.`,
  )

  return {
    ok: true,
    clienteId,
    clienteNuevo,
    declaradaId: fila.id,
    documentoId: doc.documento.id,
    repetido: false,
    avisos,
  }
}
