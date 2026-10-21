// apps/asegura/lib/correo-documento-bd.ts
//
// La mitad con BD de los adjuntos de correo de compañía (F1 del agente de correo, 21/10/2026). Lo que se DECIDE
// (validación, a qué ficha va) está en `correo-documento.ts` (puro, con test); aquí se lee lo resuelto del MISMO
// correo, se comprueba que el destino es de esta correduría (`resolverDestino`, la misma guarda que una subida a mano)
// y se escribe en `seguros.documentos` con `subido_por = 'correo'` y su `mensaje_id`.
//
// Dedupe (SQL 2026-10-21, índice `documentos_correo_unico`): el mismo fichero (sha256) una vez por póliza, o una vez sin
// póliza. Si el mismo PDF llegó antes SIN asignar y ahora el correo sí casa, se ASIGNA aquel en vez de guardar otro.
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import { createHash } from 'node:crypto'
import { CODIGO_DGS_COMPANIA } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { resolverDestino } from './cartera-documentos'
import { esTablaInexistente } from './correo-avisos-intranet'
import { esColumnaAusente } from './pg-error'
import { nombreCompania } from './correo-evento'
import { elegirDestinoDocumento, notaDocumentoCorreo, type EntradaDocumentoCorreo, type EventoResuelto } from './correo-documento'

const SIN_POLIZA = '00000000-0000-0000-0000-000000000000'
const SQL_F1 = '2026-10-21_correo_agente_f1.sql'

export type ResultadoDocumentoCorreo =
  | { ok: true; estado: 'guardado' | 'repetido' | 'asignado_previo'; documentoId: string | null; asignado: boolean; clienteId: string | null; motivo: string }
  | { ok: false; estado: 'sin_migracion'; motivo: string }

type Db = ReturnType<typeof prismaAsegura>

/** ¿El error es «falta la migración F1»? (columna `mensaje_id`, el CHECK de `subido_por` o el índice del ON CONFLICT). */
export function esFaltaMigracionDocumentos(e: unknown): boolean {
  if (esColumnaAusente(e)) return true
  const msg = e instanceof Error ? e.message : String(e)
  const meta = (e as { meta?: { code?: unknown; message?: unknown } } | null)?.meta
  const texto = `${msg} ${typeof meta?.message === 'string' ? meta.message : ''}`
  return meta?.code === '42P10' || /42P10|no unique or exclusion constraint matching/i.test(texto)
    || /documentos_subido_por|documentos_colgado_de_algo/.test(texto)
}

async function eventosDelCorreo(db: Db, correduriaId: string, mensajeId: string): Promise<(EventoResuelto & { compania: string })[]> {
  let eventos: (EventoResuelto & { compania: string })[] = []
  try {
    eventos = await db.$queryRaw<(EventoResuelto & { compania: string })[]>(Prisma.sql`
      select estado, cliente_id::text as "clienteId", poliza_id::text as "polizaId", siniestro_id::text as "siniestroId", compania
      from correo_evento_entrante
      where correduria_id = ${correduriaId}::uuid and mensaje_id = ${mensajeId}
      limit 200`)
  } catch (e) {
    // Sin la tabla de eventos no hay nada resuelto: el adjunto queda sin asignar (no se adivina).
    if (!esTablaInexistente(e)) throw e
  }
  // Las DEVOLUCIONES de recibo van por su propia tabla (`recibo_devolucion`, con el mismo Message-ID): su póliza, si casó.
  try {
    const dev = await db.$queryRaw<{ polizaId: string | null; clienteId: string | null; dgs: string }[]>(Prisma.sql`
      select d.poliza_id::text as "polizaId", p.cliente_id::text as "clienteId", d.codigo_entidad_dgs as dgs
      from recibo_devolucion d
      left join polizas p on p.id = d.poliza_id and p.correduria_id = d.correduria_id
      where d.correduria_id = ${correduriaId}::uuid and d.mensaje_id = ${mensajeId}
      limit 200`)
    for (const d of dev) {
      eventos.push({ estado: d.clienteId ? 'aplicado' : 'sin_resolver', clienteId: d.clienteId, polizaId: d.clienteId ? d.polizaId : null, siniestroId: null, compania: companiaDeDgs(d.dgs) })
    }
  } catch (e) {
    if (!esTablaInexistente(e)) throw e
  }
  return eventos
}

/** Clave de compañía de los eventos por su código DGS (para el rótulo); otra, el propio código. */
function companiaDeDgs(dgs: string): string {
  return Object.entries(CODIGO_DGS_COMPANIA).find(([, c]) => c === dgs)?.[0] ?? dgs
}

async function anotar(db: Db, correduriaId: string, clienteId: string, polizaId: string | null, texto: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
    values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, cast('gestion' as tipo_historial_interno), ${texto.slice(0, 2000)})`)
}

/**
 * Guarda UN adjunto PDF de un correo de compañía. El destino sale de lo resuelto para ESE Message-ID; si no casa, queda
 * sin asignar (cliente/póliza/siniestro NULL) para la bandeja. `sin_migracion` = falta el SQL F1: no se ha escrito nada.
 */
export async function guardarDocumentoCorreo(correduriaId: string, entrada: EntradaDocumentoCorreo): Promise<ResultadoDocumentoCorreo> {
  const db = prismaAsegura()
  try {
    await db.$queryRaw(Prisma.sql`select mensaje_id from documentos where false`)
  } catch (e) {
    if (esColumnaAusente(e) || esTablaInexistente(e)) return { ok: false, estado: 'sin_migracion', motivo: `falta aplicar ${SQL_F1}: no se ha guardado nada` }
    throw e
  }
  const eventos = await eventosDelCorreo(db, correduriaId, entrada.mensajeId)
  const elegido = elegirDestinoDocumento(eventos)
  // La misma guarda que una subida a mano: el cliente/póliza/siniestro existe Y es de esta correduría.
  const destino = elegido.asignado ? await resolverDestino(correduriaId, elegido) : null
  const motivo = elegido.asignado && !destino ? 'la ficha resuelta no es de esta correduría: sin asignar' : elegido.motivo
  const compania = eventos[0]?.compania ? nombreCompania(eventos[0].compania) : null
  const sha256 = createHash('sha256').update(entrada.contenido).digest('hex')
  const polizaClave = destino?.polizaId ?? SIN_POLIZA
  try {
    // 1. ¿Ya está ESTE fichero para este destino (o, sin destino, en cualquier sitio)? → repetido, nada que escribir.
    const [ya] = await db.$queryRaw<{ id: string; clienteId: string | null }[]>(Prisma.sql`
      select id::text as id, cliente_id::text as "clienteId" from documentos
      where correduria_id = ${correduriaId}::uuid and subido_por = 'correo' and sha256 = ${sha256}
        and (${destino === null}::boolean or coalesce(poliza_id, ${SIN_POLIZA}::uuid) = ${polizaClave}::uuid)
      order by created_at asc limit 1`)
    if (ya) return { ok: true, estado: 'repetido', documentoId: ya.id, asignado: ya.clienteId !== null, clienteId: ya.clienteId, motivo: 'ese PDF ya estaba guardado' }

    // 2. Con destino: si el mismo PDF llegó antes SIN asignar, se asigna aquel (no se guarda otra copia).
    if (destino?.clienteId) {
      const [previo] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        update documentos set cliente_id = ${destino.clienteId}::uuid, poliza_id = ${destino.polizaId}::uuid, siniestro_id = ${destino.siniestroId}::uuid
        where id = (select id from documentos
                    where correduria_id = ${correduriaId}::uuid and subido_por = 'correo' and sha256 = ${sha256}
                      and cliente_id is null and poliza_id is null and siniestro_id is null
                    order by created_at asc limit 1)
        returning id::text as id`)
      if (previo) {
        anotarCambio({ entidad: 'documento', id: previo.id, campo: 'cliente_id', antes: null, despues: destino.clienteId })
        await anotar(db, correduriaId, destino.clienteId, destino.polizaId, notaDocumentoCorreo(compania, entrada.nombre, false))
        return { ok: true, estado: 'asignado_previo', documentoId: previo.id, asignado: true, clienteId: destino.clienteId, motivo }
      }
    }

    // 3. Fila nueva. El ON CONFLICT cubre dos pasadas a la vez (el índice es la verdad, no la lectura de arriba).
    const notas = `Adjunto de un correo de ${compania ?? 'compañía'}${destino ? '' : ' — sin asignar: '}${destino ? '' : motivo}`.slice(0, 500)
    const [fila] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into documentos (correduria_id, cliente_id, poliza_id, siniestro_id, tipo, estado, nombre_fichero, mime_type,
                              size_bytes, sha256, contenido, notas, subido_por, visible_por_cliente, mensaje_id)
      values (${correduriaId}::uuid, ${destino?.clienteId ?? null}::uuid, ${destino?.polizaId ?? null}::uuid, ${destino?.siniestroId ?? null}::uuid,
              'otro', 'recibido', ${entrada.nombre.slice(0, 255)}, ${entrada.mime}, ${entrada.contenido.length}, ${sha256},
              ${entrada.contenido}, ${notas}, 'correo', false, ${entrada.mensajeId})
      on conflict (correduria_id, sha256, coalesce(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid))
        where subido_por = 'correo' and sha256 is not null
      do nothing
      returning id::text as id`)
    if (!fila) return { ok: true, estado: 'repetido', documentoId: null, asignado: destino !== null, clienteId: destino?.clienteId ?? null, motivo: 'ese PDF ya estaba guardado' }
    anotarCambio({ entidad: 'documento', id: fila.id, campo: 'estado', antes: null, despues: 'recibido' })
    if (destino?.clienteId) await anotar(db, correduriaId, destino.clienteId, destino.polizaId, notaDocumentoCorreo(compania, entrada.nombre, false))
    return { ok: true, estado: 'guardado', documentoId: fila.id, asignado: destino !== null, clienteId: destino?.clienteId ?? null, motivo }
  } catch (e) {
    if (esFaltaMigracionDocumentos(e)) return { ok: false, estado: 'sin_migracion', motivo: `falta aplicar ${SQL_F1}: no se ha guardado nada` }
    throw e
  }
}

export type DocumentoSinAsignar = {
  id: string
  creado: string
  nombre: string | null
  bytes: number | null
  compania: string | null
  /** Message-ID del correo (la bandeja de plataforma lo casa con su `correo_triaje` para sugerir; no se pinta). */
  mensajeId: string
}

const TECHO_SIN_ASIGNAR = 200

/** Los adjuntos de correo SIN asignar (90 días). Lanza si falla: quien llama lo dice, nunca «no hay». */
export async function documentosCorreoSinAsignar(correduriaId: string): Promise<{ filas: DocumentoSinAsignar[]; truncado: boolean }> {
  const filas = await prismaAsegura().$queryRaw<(Omit<DocumentoSinAsignar, 'bytes'> & { bytes: number | null })[]>(Prisma.sql`
    select d.id::text as id, to_char(d.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as creado,
           d.nombre_fichero as nombre, d.size_bytes as bytes, d.mensaje_id as "mensajeId",
           (select e.compania from correo_evento_entrante e
             where e.correduria_id = d.correduria_id and e.mensaje_id = d.mensaje_id limit 1) as compania
    from documentos d
    where d.correduria_id = ${correduriaId}::uuid and d.subido_por = 'correo'
      and d.cliente_id is null and d.poliza_id is null and d.siniestro_id is null
      and d.created_at >= now() - interval '90 days'
    order by d.created_at desc
    limit ${TECHO_SIN_ASIGNAR + 1}`)
  return { filas: filas.slice(0, TECHO_SIN_ASIGNAR), truncado: filas.length > TECHO_SIN_ASIGNAR }
}

/** Asigna a mano UN documento sin asignar a un cliente de esta correduría. `false` = no existe, no es de correo o ya estaba asignado. */
export async function asignarDocumentoCorreo(correduriaId: string, id: string, clienteId: string, actor: string): Promise<'ok' | 'no_encontrado' | 'cliente_ajeno'> {
  const destino = await resolverDestino(correduriaId, { clienteId })
  if (!destino?.clienteId) return 'cliente_ajeno'
  const db = prismaAsegura()
  const [d] = await db.$queryRaw<{ id: string; nombre: string | null; compania: string | null }[]>(Prisma.sql`
    update documentos set cliente_id = ${destino.clienteId}::uuid
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and subido_por = 'correo'
      and cliente_id is null and poliza_id is null and siniestro_id is null
    returning id::text as id, nombre_fichero as nombre,
      (select e.compania from correo_evento_entrante e where e.correduria_id = documentos.correduria_id and e.mensaje_id = documentos.mensaje_id limit 1) as compania`)
  if (!d) return 'no_encontrado'
  anotarCambio({ entidad: 'documento', id: d.id, campo: 'cliente_id', antes: null, despues: destino.clienteId })
  await anotar(db, correduriaId, destino.clienteId, null, `${notaDocumentoCorreo(d.compania ? nombreCompania(d.compania) : null, d.nombre ?? 'adjunto.pdf', true)} (por ${actor.slice(0, 100)})`)
  return 'ok'
}

/**
 * Los adjuntos SIN asignar de un correo pasan a la ficha que se acaba de resolver para él (asignación a mano del aviso,
 * o una emisión que CIMA ya trae). Un fichero que ya estuviera en ese destino no se duplica (se deja sin asignar).
 * Devuelve cuántos se asignaron. Sin la migración F1 → 0.
 */
export async function asignarDocumentosDeMensaje(
  correduriaId: string, mensajeId: string, destino: { clienteId: string; polizaId: string | null },
): Promise<number> {
  const db = prismaAsegura()
  try {
    const filas = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      update documentos d set cliente_id = ${destino.clienteId}::uuid, poliza_id = ${destino.polizaId}::uuid
      where d.correduria_id = ${correduriaId}::uuid and d.subido_por = 'correo' and d.mensaje_id = ${mensajeId}
        and d.cliente_id is null and d.poliza_id is null and d.siniestro_id is null
        and not exists (
          select 1 from documentos o
          where o.correduria_id = d.correduria_id and o.subido_por = 'correo' and o.sha256 = d.sha256 and o.id <> d.id
            and coalesce(o.poliza_id, ${SIN_POLIZA}::uuid) = coalesce(${destino.polizaId}::uuid, ${SIN_POLIZA}::uuid))
      returning d.id::text as id`)
    for (const f of filas) anotarCambio({ entidad: 'documento', id: f.id, campo: 'cliente_id', antes: null, despues: destino.clienteId })
    return filas.length
  } catch (e) {
    if (esColumnaAusente(e)) return 0
    throw e
  }
}
