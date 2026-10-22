// PATRIMONIO (22/10/2026) — cuerpos TRANSACCIONALES de los documentos, sin prisma ni sesión (el cliente de transacción se
// recibe por parámetro con una forma mínima). Existen aparte de `documentos-bd.ts` para poder probar con un `tx` falso el
// ORDEN de las sentencias (bloqueo → recuento → inserción): sin el bloqueo, N subidas simultáneas leen el mismo recuento
// y todas pasan el tope.

type Fila = Record<string, unknown>
type Delegado = {
  count(a: Fila): Promise<number>
  create(a: Fila): Promise<{ id: string }>
  findFirst(a: Fila): Promise<Fila | null>
  updateMany(a: Fila): Promise<{ count: number }>
}
/** Lo mínimo que se usa de `Prisma.TransactionClient` (se le pasa con un `as unknown as TxMin`). */
export interface TxMin {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  portalPatrimonioDocumento: Delegado
  portalPatrimonioGasto: Delegado
}

export type OwnerTx = { tipo: 'inmueble' | 'contrato' | 'inquilino'; id: string }

/** Columna FK de cada owner. */
export const COLUMNA_OWNER = { inmueble: 'inmuebleId', contrato: 'contratoId', inquilino: 'inquilinoId' } as const

/**
 * Inserta el documento DENTRO de una transacción ya abierta (la usan `guardarConTope`, la subida de facturas y el traslado
 * de una factura a otro inmueble). No comprueba el tope: lo hace quien la llama con SU bloqueo. La BD exige un único owner
 * del mismo titular.
 */
export async function crearDocumentoTx(
  tx: TxMin,
  x: { titularId: string; identidadId: string; owner: OwnerTx; carpeta: string; nombre: string; mime: string; sha256: string; contenido: Buffer },
): Promise<string> {
  const d = await tx.portalPatrimonioDocumento.create({
    data: {
      titularId: x.titularId,
      [COLUMNA_OWNER[x.owner.tipo]]: x.owner.id,
      carpeta: x.carpeta,
      nombre: x.nombre,
      mime: x.mime,
      sizeBytes: x.contenido.length,
      sha256: x.sha256,
      contenido: x.contenido,
      creadoPorIdentidadId: x.identidadId,
    },
    select: { id: true },
  })
  return d.id
}

/** Tope diario ATÓMICO: bloqueo asesor por identidad → recuento (también borrados) → inserción, todo en la misma transacción. */
export async function guardarConTope(
  tx: TxMin,
  x: { identidadId: string; titularId: string; owner: OwnerTx; carpeta: string; nombre: string; mime: string; sha256: string; contenido: Buffer; desde: Date; max: number },
): Promise<{ ok: true; id: string } | { ok: false; motivo: 'tope' }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`portal-documento:${x.identidadId}`}, 0))`
  const hoy = await tx.portalPatrimonioDocumento.count({ where: { creadoPorIdentidadId: x.identidadId, creadoEn: { gte: x.desde } } })
  if (hoy >= x.max) return { ok: false, motivo: 'tope' }
  const id = await crearDocumentoTx(tx, x)
  return { ok: true, id }
}
