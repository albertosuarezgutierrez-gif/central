// Emisión por Codeoscopic — la parte de BD de la spec
// docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md (D2).
//
// `registrarPolizaEmitida` acuña en `polizas` la fila de una emisión YA HECHA en
// el vendor, con la marca `origen = emitida_codeoscopic`, el código DGS y el
// nombre exacto que CIMA usa (de `companias_dgs`), en la MISMA transacción que
// `codeoscopic_projects.poliza_id`. Nada de aquí llama a Codeoscopic ni gasta:
// el envío (PR3, `POST /insurances/{id}/policy-applications`) queda tras
// `CODEOSCOPIC_EMISION_ACTIVA` y su prueba de idempotencia, que hoy no se puede
// correr (no hay sandbox). Sin ese envío, esta función solo la llamará el
// webhook/polling del día que exista.
//
// Reglas puras en `@central/module-seguros` (`emision.ts`, con tests).

import { prepararPolizaEmitida, type CompaniaDgs, type ProyectoEmitido } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

/** Catálogo de compañías por código DGS. `null` = no se pudo leer (no es «vacío»). */
export async function catalogoCompanias(): Promise<CompaniaDgs[] | null> {
  try {
    const filas = await prismaAsegura().companiaDgs.findMany({ where: { activa: true }, orderBy: { codigoDgs: 'asc' } })
    return filas.map((c) => ({ codigoDgs: c.codigoDgs, nombreComun: c.nombreComun, nombreCima: c.nombreCima, enCima: c.enCima, activa: c.activa }))
  } catch {
    return null
  }
}

export type ResultadoEmision =
  | { ok: true; polizaId: string; avisos: string[] }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'conflicto' | 'error'; motivo: string; status: 404 | 409 | 422 | 500 }

export async function registrarPolizaEmitida(
  correduriaId: string,
  entrada: { clienteId: string; proyecto: ProyectoEmitido; actor: string },
): Promise<ResultadoEmision> {
  const db = prismaAsegura()
  const cliente = await db.cliente.findFirst({ where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null }, select: { id: true, dniLookupHash: true } })
  if (!cliente) return { ok: false, estado: 'no_encontrado', motivo: 'El tomador no existe en esta correduría.', status: 404 }
  // Antes de emitir se verifica la identidad (fase 2 del principio «presupuesto rápido,
  // verificación al emitir»): sin DNI, CIMA resolverá otro cliente y la póliza se irá a review.
  if (!cliente.dniLookupHash) return { ok: false, estado: 'invalido', motivo: 'El tomador no tiene DNI en la ficha: CIMA no podrá casarlo. Pídelo documentado antes de emitir.', status: 422 }

  const catalogo = await catalogoCompanias()
  if (catalogo === null) return { ok: false, estado: 'error', motivo: 'No se pudo leer companias_dgs.', status: 500 }
  const r = prepararPolizaEmitida({ correduriaId, clienteId: cliente.id, proyecto: entrada.proyecto, catalogo })
  if (!r.ok) return { ok: false, estado: 'invalido', motivo: r.motivo, status: 422 }

  const yaAcunada = await db.$queryRaw<{ poliza_id: string | null }[]>`
    select poliza_id from codeoscopic_projects
    where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${entrada.proyecto.projectIdCodeoscopic}
    limit 1`.catch(() => [] as { poliza_id: string | null }[])
  if (yaAcunada[0]?.poliza_id) return { ok: false, estado: 'conflicto', motivo: 'Ese proyecto ya tiene póliza acuñada.', status: 409 }

  const f = r.fila
  const polizaId = await db.$transaction(async (tx) => {
    const creada = await tx.poliza.create({
      data: {
        correduriaId: f.correduriaId,
        clienteId: f.clienteId,
        tipo: f.tipo,
        aseguradora: f.aseguradora,
        codigoEntidadDgs: f.codigoEntidadDgs,
        numeroPoliza: f.numeroPoliza,
        estado: f.estado,
        origen: f.origen,
        importRef: null,
        idPolizaEntidad: null,
        fechaInicio: new Date(f.fechaInicio),
        fechaVencimiento: new Date(f.fechaVencimiento),
        primaAnual: f.primaAnual,
        fraccionamiento: f.fraccionamiento as 'anual' | 'semestral' | 'trimestral' | 'mensual' | null,
        datosEspecificos: f.datosEspecificos as object,
      },
      select: { id: true },
    })
    // Si el proyecto existe en la tabla del CRM, se enlaza; si no, no pasa nada (0 filas).
    await tx.$executeRaw`
      update codeoscopic_projects set poliza_id = ${creada.id}::uuid, estado = 'emitida', updated_at = now()
      where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${entrada.proyecto.projectIdCodeoscopic} and poliza_id is null`
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${cliente.id}::uuid, ${creada.id}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Póliza emitida por Codeoscopic (proyecto ${entrada.proyecto.projectIdCodeoscopic}) en ${f.aseguradora}${f.numeroPoliza ? ` nº ${f.numeroPoliza}` : ''}; pendiente de confirmación por CIMA. ${r.avisos.length ? `Avisos: ${r.avisos.join(' · ')}` : ''} Por ${entrada.actor}`})`
    return creada.id
  })
  return { ok: true, polizaId, avisos: r.avisos }
}
