// Compuerta ATÓMICA del acuñado: un proyecto de Codeoscopic → como mucho UNA póliza (03/10/2026).
//
// Antes, `registrarPolizaEmitida` miraba «¿el proyecto ya está `emitida`?» con un SELECT y DESPUÉS
// abría la transacción que creaba la póliza. Entre las dos cosas, el cron de descubrimiento
// (`descubrir-emisiones.ts`), el webhook (`after()`) y el botón (`/emitir`) podían pasar los tres la
// lectura y acuñar dos pólizas del mismo proyecto. Lo tapaba `en_vuelo` (<15 min), que es tiempo,
// no exclusión.
//
// Ahora la PRIMERA sentencia de la transacción es un upsert sobre `codeoscopic_projects` que solo
// escribe si el proyecto NO está `emitida`:
//
//   insert … values (…, 'emitida')
//   on conflict (correduria_id, project_id_codeoscopic) do update set estado = 'emitida' …
//     where codeoscopic_projects.estado <> 'emitida'
//   returning id
//
// Postgres bloquea la fila (o la entrada del índice único `codeoscopic_projects_correduria_proyecto_idx`
// si aún no existe) hasta el COMMIT. La segunda transacción espera y, al soltarse el bloqueo, vuelve a
// evaluar el WHERE contra la fila YA confirmada: ve `emitida`, no devuelve nada, y aquí se responde
// «ya acuñada» con la póliza que ganó. Si la primera hace ROLLBACK (falla la creación de la póliza),
// el `emitida` se deshace con ella y la segunda acuña con normalidad. Nada de esto depende de relojes.
//
// Puro (sin Prisma importado): el tipo de la transacción es el mínimo que se usa, para poder probar
// la orquestación sin BD (`acunado-unico.test.ts`).

/** Lo único que la compuerta necesita de la transacción. `Prisma.TransactionClient` lo cumple. */
export type TxCompuerta = {
  $queryRaw<T = unknown>(consulta: TemplateStringsArray, ...valores: unknown[]): PromiseLike<T>
}

export type ProyectoAReclamar = {
  correduriaId: string
  projectIdCodeoscopic: string
  /** `tipo_seguro` de la póliza que se va a acuñar: solo se usa si la fila del proyecto no existía. */
  producto: string
  clienteId: string
}

export type Reclamo = { tipo: 'reclamado' } | { tipo: 'ya_acunada'; polizaId: string | null }

/**
 * Reclama el proyecto para acuñarlo DENTRO de la transacción que va a crear la póliza. Tiene que ser
 * la primera escritura: el bloqueo de fila que toma es la exclusión. `ya_acunada` = otra operación lo
 * acuñó (ya confirmada); `polizaId` es la suya (`null` solo si la fila no la enlaza, que no debería
 * pasar: `poliza_id` se escribe en la misma transacción que `estado = 'emitida'`).
 */
export async function reclamarProyectoParaAcunar(tx: TxCompuerta, p: ProyectoAReclamar): Promise<Reclamo> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    insert into codeoscopic_projects (correduria_id, project_id_codeoscopic, producto, cliente_id, estado)
    values (${p.correduriaId}::uuid, ${p.projectIdCodeoscopic}, ${p.producto}::tipo_seguro, ${p.clienteId}::uuid, 'emitida')
    on conflict (correduria_id, project_id_codeoscopic) do update
      set estado = 'emitida', error_mensaje = null, updated_at = now()
      where codeoscopic_projects.estado <> 'emitida'
    returning id::text as id`
  if (filas.length > 0) return { tipo: 'reclamado' }
  const [ya] = await tx.$queryRaw<{ poliza_id: string | null }[]>`
    select poliza_id::text as poliza_id from codeoscopic_projects
    where correduria_id = ${p.correduriaId}::uuid and project_id_codeoscopic = ${p.projectIdCodeoscopic}
    limit 1`
  return { tipo: 'ya_acunada', polizaId: ya?.poliza_id ?? null }
}

export type DesenlaceAcunado = { tipo: 'acunada'; polizaId: string } | { tipo: 'ya_acunada'; polizaId: string | null }

/**
 * Orquesta el acuñado: abre la transacción, reclama el proyecto y SOLO si lo ha reclamado llama a
 * `crear` (que inserta la póliza y enlaza `poliza_id` con la misma `tx`). Si no lo reclama, `crear`
 * no corre y no se escribe nada.
 */
export async function acunarUnaVez<Tx extends TxCompuerta>(
  transaccion: <R>(fn: (tx: Tx) => Promise<R>) => Promise<R>,
  proyecto: ProyectoAReclamar,
  crear: (tx: Tx) => Promise<string>,
): Promise<DesenlaceAcunado> {
  return transaccion(async (tx) => {
    const reclamo = await reclamarProyectoParaAcunar(tx, proyecto)
    if (reclamo.tipo === 'ya_acunada') return reclamo
    return { tipo: 'acunada' as const, polizaId: await crear(tx) }
  })
}
