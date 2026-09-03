// Los ficheros que el CLIENTE adjunta a un parte de siniestro: fotos del golpe,
// el PDF del amistoso, el presupuesto del taller.
//
// ─── Dónde viven, y por qué no hay tabla nueva ───────────────────────────────
// En `seguros.documentos`, la MISMA tabla que ya usa el panel del corredor, con
// la columna `portal_parte_id` (03/09/2026). Una tabla propia del portal habría
// dejado a Alberto con dos bandejas de documentos y ninguna completa.
//
// 🔒 Aislamiento por CÓDIGO. No hay RLS que rescate un olvido: el rol
// `prisma_asegura_portal` conecta como aplicación, así que un `findMany` sin
// filtro respondería 200 con los adjuntos de todo el mundo. La regla de este
// fichero, sin excepciones: **ningún adjunto se lee ni se escribe sin haber
// comprobado antes que su PARTE es de esta `identidadId`**, y la identidad sale
// siempre de la cookie (`lib/session`). Por eso todas las funciones reciben el
// `identidadId` ya resuelto y ninguna acepta un `parteId` como única prueba.
//
// 🚫 Y un tercero con autorización NO llega aquí, ni por descuido: lo que una
// autorización abre son PÓLIZAS de la cartera (`lib/cartera-lectura.ts`), y
// `camposDeAlcance` pone `documentos: false` para toda persona física. Este
// fichero no ofrece ni un solo camino que parta de un `clienteId` o de un
// `polizaId`: se entra por el parte, y el parte es de quien lo escribió. Por lo
// mismo el adjunto se guarda SIN `poliza_id` — colgarlo de la póliza lo metería
// en la carpeta de un titular que puede no ser quien mandó la foto.
//
// 🚫 Sin UPDATE ni DELETE, igual que el propio parte: lo adjuntado es prueba de
// lo que se declaró, y el rol tampoco tiene esos GRANT.
import { createHash } from 'node:crypto'

import {
  MAX_ADJUNTOS_POR_PARTE,
  MIMES_DOCUMENTO,
  estadoDocumento,
  mimeDocumento,
  revisarDocumento,
  tipoAdjuntoParte,
  tipoDocumento,
  type EstadoDocumento,
  type MimeDocumento,
  type TipoDocumento,
} from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

// El tope vive en el módulo puro para que la pantalla y el servidor usen el
// MISMO número: dos topes distintos son un rechazo que el usuario no vio venir.
export { MAX_ADJUNTOS_POR_PARTE }

/** Un adjunto tal y como se enseña. NUNCA lleva el `contenido`: eso se pide de uno en uno. */
export type AdjuntoParte = {
  id: string
  /** `null` = la fila no guardó nombre. La UI dice «documento sin nombre», no un hueco. */
  nombre: string | null
  /** Uno de `MIMES_DOCUMENTO`. Nunca el que mandó el navegador. */
  mime: string | null
  bytes: number | null
  tipo: TipoDocumento
  estado: EstadoDocumento
  creadoEn: Date
}

export type GuardadoAdjunto =
  | { ok: true; adjunto: AdjuntoParte }
  | { ok: false; motivo: string; status: 403 | 404 | 409 | 413 | 415 | 500 }

const SELECT_ADJUNTO = {
  id: true,
  nombreFichero: true,
  mimeType: true,
  sizeBytes: true,
  tipo: true,
  estado: true,
  createdAt: true,
} as const

type FilaAdjunto = {
  id: string
  nombreFichero: string | null
  mimeType: string | null
  sizeBytes: number | null
  tipo: string
  estado: string
  createdAt: Date
}

function aAdjunto(f: FilaAdjunto): AdjuntoParte {
  return {
    id: f.id,
    nombre: f.nombreFichero,
    // Se vuelve a filtrar por la lista al LEER, no solo al escribir: si algún
    // día entrara una fila con otro mime (una migración, otra app), aquí se
    // corta antes de que llegue a una cabecera `Content-Type`.
    mime: mimeGuardado(f.mimeType),
    bytes: f.sizeBytes,
    tipo: tipoDocumento(f.tipo),
    estado: estadoDocumento(f.estado),
    creadoEn: f.createdAt,
  }
}

/** El mime de la fila, SOLO si está en la lista cerrada. Cualquier otro → `null`. */
function mimeGuardado(v: string | null): MimeDocumento | null {
  return v !== null && (MIMES_DOCUMENTO as readonly string[]).includes(v) ? (v as MimeDocumento) : null
}

/**
 * De qué correduría (y de qué ficha, si la sabemos) es este documento.
 *
 * `correduria_id` es NOT NULL en la tabla y no hay forma de esquivarlo, así que
 * se resuelve por este orden:
 *
 *   1. **El vínculo de la identidad** (`portal_vinculo`). Es el caso normal:
 *      quien da parte es cliente y sabemos de qué ficha.
 *   2. **La correduría ÚNICA de la base.** El portal está abierto a quien NO es
 *      cliente —los ~32.520 leads— y esa persona puede dar parte de una póliza
 *      que aportó ella misma. Si no cayera aquí, no podría adjuntar nada.
 *      Mismo patrón (y mismo cepo) que `correduriaUnica()` de `apps/asegura`:
 *      **lanza** si hubiera más de una, porque entonces elegir sería adivinar.
 *
 * `clienteId` se queda a `null` cuando la identidad tiene MÁS de un vínculo: no
 * se elige una ficha a cara o cruz. `null` significa aquí «no lo sabemos», y el
 * adjunto sigue colgando del parte, que es lo que lo identifica.
 */
async function ambitoDeIdentidad(identidadId: string): Promise<{ correduriaId: string; clienteId: string | null }> {
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, correduriaId: true },
    orderBy: { creadoEn: 'asc' },
  })

  if (vinculos.length > 0) {
    if (vinculos.length > 1) {
      // Se dice, con ids y sin un solo dato personal: puede ser una fusión de
      // fichas pendiente, y el adjunto no es el sitio donde resolverla.
      console.warn(
        `[portal/adjuntos] la identidad ${identidadId} tiene ${vinculos.length} vínculos; ` +
          'el adjunto se guarda sin cliente_id.',
      )
    }
    return {
      correduriaId: vinculos[0].correduriaId,
      clienteId: vinculos.length === 1 ? vinculos[0].clienteId : null,
    }
  }

  const corredurias = await prisma.correduria.findMany({ select: { id: true }, take: 2 })
  if (corredurias.length === 0) throw new Error('sin_correduria: no hay ninguna correduría en la base')
  if (corredurias.length > 1) {
    throw new Error('correduria_ambigua: hay más de una correduría y este parte no está vinculado a ninguna')
  }
  return { correduriaId: corredurias[0].id, clienteId: null }
}

/** El parte, SOLO si es de esta identidad. `null` = no existe o no es suyo — y las dos se responden igual. */
async function parteDeIdentidad(identidadId: string, parteId: string): Promise<{ id: string } | null> {
  return prisma.portalParteSiniestro.findFirst({ where: { id: parteId, identidadId }, select: { id: true } })
}

/**
 * Guarda UN fichero contra un parte. De uno en uno a propósito: si el cuarto
 * falla, los tres primeros ya están dentro y la pantalla puede decir cuál es el
 * que falta. Un envío todo-o-nada pierde las tres fotos buenas por culpa de la
 * cuarta, que es justo lo que no se puede volver a hacer con el coche ya
 * retirado.
 *
 * El parte se crea ANTES (`POST /api/siniestros`) y esto cuelga de él. Nunca al
 * revés: un fichero huérfano, sin parte, no lo ve nadie.
 */
export async function guardarAdjunto(
  identidadId: string,
  parteId: string,
  entrada: { nombre: string; mime: string; contenido: Buffer },
): Promise<GuardadoAdjunto> {
  // 1. Pertenencia ANTES que nada: los ids viajan en la URL y no los firma nadie.
  const parte = await parteDeIdentidad(identidadId, parteId)
  if (!parte) {
    // «No existe» y «no es tuyo» se responden IGUAL: distinguirlas convierte la
    // ruta en un oráculo de uuids de partes ajenos.
    return { ok: false, motivo: 'Ese parte no es tuyo.', status: 404 }
  }

  // 2. Qué fichero se acepta lo decide el módulo puro, el mismo que revisa la
  //    pantalla antes de subir y el mismo que usa el panel del corredor.
  const reparo = revisarDocumento({ type: entrada.mime, size: entrada.contenido.length, name: entrada.nombre })
  if (reparo) return { ok: false, motivo: reparo, status: 415 }

  // 3. 🚨 El mime que se GUARDA sale de la lista cerrada, jamás del navegador.
  //    Es lo que impide que el fichero se devuelva luego con un Content-Type
  //    que el navegador ejecute en nuestro dominio.
  const mime = mimeDocumento({ type: entrada.mime, name: entrada.nombre })
  if (mime === null) return { ok: false, motivo: 'Tipo de fichero no admitido. Sube un PDF o una foto.', status: 415 }

  try {
    const yaHay = await prisma.documento.count({ where: { portalParteId: parteId } })
    if (yaHay >= MAX_ADJUNTOS_POR_PARTE) {
      return {
        ok: false,
        motivo: `Este parte ya tiene ${MAX_ADJUNTOS_POR_PARTE} ficheros, que es el máximo. Si falta algo importante, dínoslo y lo vemos.`,
        status: 409,
      }
    }

    const ambito = await ambitoDeIdentidad(identidadId)
    const fila = await prisma.documento.create({
      data: {
        correduriaId: ambito.correduriaId,
        clienteId: ambito.clienteId,
        // Sin `poliza_id` ni `siniestro_id`: ver la cabecera. El parte es el
        // único sitio del que cuelga, y con él viaja de quién es.
        portalParteId: parteId,
        tipo: tipoAdjuntoParte(mime),
        // `recibido` = está el fichero. `pedido` es la fila sin fichero que abre
        // el corredor cuando pide un papel, y no es este caso.
        estado: 'recibido',
        nombreFichero: entrada.nombre.slice(0, 255),
        mimeType: mime,
        sizeBytes: entrada.contenido.length,
        sha256: createHash('sha256').update(entrada.contenido).digest('hex'),
        contenido: entrada.contenido,
        // El vocabulario de la columna es cerrado (`corredor|cliente|agente`,
        // CHECK en la BD). `cliente` = lo mandó quien está al otro lado del
        // portal; QUIÉN exactamente lo dice el parte del que cuelga, que lleva
        // la `identidad_id`. La ficha de la cartera puede no existir siquiera.
        subidoPor: 'cliente',
        // Lo ha mandado él: tiene que poder volver a verlo y descargarlo.
        visiblePorCliente: true,
      },
      select: SELECT_ADJUNTO,
    })
    return { ok: true, adjunto: aAdjunto(fila) }
  } catch (e) {
    // El motivo sube tal cual para el log del servidor; a la pantalla va un
    // texto que no promete nada. Un `{ ok: true }` de consuelo dejaría a alguien
    // creyendo que ha mandado la foto del atestado.
    console.error('[portal/adjuntos] no se pudo guardar:', e instanceof Error ? e.message : e)
    return { ok: false, motivo: 'No hemos podido guardar el fichero. Inténtalo otra vez.', status: 500 }
  }
}

/**
 * Los adjuntos de VARIOS partes de esta identidad, agrupados por parte.
 *
 * 🚨 Devuelve `null` cuando la consulta FALLA, nunca un mapa vacío: un mapa
 * vacío se pinta como «no adjuntó nada», que es afirmar algo que no se ha
 * mirado. Tres estados, como manda la regla de la casa: `null` = no se ha
 * podido consultar · lista vacía = se miró y no hay · con datos.
 */
export async function adjuntosPorParte(
  identidadId: string,
  parteIds: readonly string[],
): Promise<Map<string, AdjuntoParte[]> | null> {
  if (parteIds.length === 0) return new Map()
  try {
    // Los ids se vuelven a acotar contra la identidad: quien llama ya los sacó
    // de una consulta suya, pero esta función no depende de que lo haya hecho.
    const propios = await prisma.portalParteSiniestro.findMany({
      where: { id: { in: [...parteIds] }, identidadId },
      select: { id: true },
    })
    if (propios.length === 0) return new Map()

    const filas = await prisma.documento.findMany({
      where: { portalParteId: { in: propios.map((p) => p.id) }, visiblePorCliente: true },
      select: { ...SELECT_ADJUNTO, portalParteId: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_ADJUNTOS_POR_PARTE * propios.length,
    })

    const mapa = new Map<string, AdjuntoParte[]>()
    for (const f of filas) {
      if (f.portalParteId === null) continue
      const lista = mapa.get(f.portalParteId) ?? []
      lista.push(aAdjunto(f))
      mapa.set(f.portalParteId, lista)
    }
    return mapa
  } catch (e) {
    console.error('[portal/adjuntos] no se pudieron leer:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Igual que `adjuntosPorParte`, abriendo la puerta aquí. `null` = no hay sesión. */
export async function adjuntosDeSesion(parteIds: readonly string[]): Promise<Map<string, AdjuntoParte[]> | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return adjuntosPorParte(identidad.id, parteIds)
}

/**
 * UN fichero entero, para devolvérselo a quien lo mandó.
 *
 * `null` = no existe, no es de un parte de esta identidad, no está marcado
 * `visible_por_cliente` o es una fila `pedido` (sin fichero). Todas se
 * responden con el mismo 404: separarlas diría qué uuids existen.
 *
 * El `mime` que sale ya viene filtrado por `MIMES_DOCUMENTO`; quien lo sirva
 * tiene que mandarlo como **descarga** (`Content-Disposition: attachment`).
 */
export async function leerAdjunto(
  identidadId: string,
  parteId: string,
  documentoId: string,
): Promise<{ nombre: string; mime: MimeDocumento; contenido: Buffer } | null> {
  const parte = await parteDeIdentidad(identidadId, parteId)
  if (!parte) return null

  const f = await prisma.documento.findFirst({
    where: { id: documentoId, portalParteId: parteId, visiblePorCliente: true },
    select: { nombreFichero: true, mimeType: true, contenido: true },
  })
  if (!f || !f.contenido) return null

  const mime = mimeGuardado(f.mimeType)
  // Sin un mime de la lista NO se sirve. Adivinarlo —o caer a
  // `application/octet-stream`— sería devolver bytes de origen desconocido con
  // una cabecera puesta por nosotros, y ese es exactamente el riesgo.
  if (mime === null) {
    console.error(`[portal/adjuntos] el documento ${documentoId} tiene un mime fuera de la lista; no se sirve.`)
    return null
  }

  return { nombre: f.nombreFichero ?? 'documento', mime, contenido: Buffer.from(f.contenido) }
}
