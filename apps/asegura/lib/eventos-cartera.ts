// Eventos de cartera deducidos por foto (Fase 2 de ASegura OS, pieza 2-a).
//
// `detectarYGuardar()` saca la foto ACTUAL de la cartera viva (pólizas, sus recibos y los
// siniestros), la compara con la última guardada (`detectarCambios`, puro, en module-seguros), mete
// los eventos nuevos (la `clave` UNIQUE hace que repetir una pasada no duplique nada) y guarda la
// foto nueva — todo en UNA transacción: si falla a medias, la próxima pasada ve los mismos cambios.
//
// `fugasPendientes()` es lo que pinta «Hoy» en plataforma: bajas, anulaciones al vencimiento y
// desapariciones SIN sustitución registrada que nadie ha revisado. `revisarEvento()` las cierra con
// una resolución cerrada (pérdida con motivo, o no es pérdida), sin texto libre.
//
// Las tablas van sin prefijo de schema: la conexión ya trae `?schema=seguros`.

import { Prisma } from './generated/asegura-client'
import {
  MOTIVOS_PERDIDA,
  TIPOS_FUGA,
  detectarCambios,
  esFugaSinExplicar,
  nombreEvento,
  sqlCarteraViva,
  type EventoCartera,
  type Foto,
  type TipoEventoCartera,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'

export async function fotoActual(correduriaId: string): Promise<Foto> {
  const db = prismaAsegura()
  const viva = Prisma.raw(sqlCarteraViva('p'))
  const [polizas, recibos, siniestros] = await Promise.all([
    db.$queryRaw<{ id: string; cliente_id: string; estado: string; vencimiento: string | null; sustituida: boolean; fusionada: boolean }[]>`
      select p.id, p.cliente_id, p.estado::text as estado, to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento,
             -- «Sustituida» = hay a dónde se fue: sustitución registrada, o una póliza que la tiene como
             -- madre (renovación como póliza nueva) u origen (cambio de compañía). Su baja no es pérdida.
             (p.sustituida_at is not null or exists (
               select 1 from polizas h where h.merged_into_poliza_id is null
                 and (h.poliza_padre_id = p.id or h.poliza_origen_id = p.id))) as sustituida,
             p.merged_into_poliza_id is not null as fusionada
      from polizas p where p.correduria_id = ${correduriaId}::uuid and ${viva}`,
    db.$queryRaw<{ id: string; poliza_id: string; cliente_id: string; situacion: string | null }[]>`
      select r.id, r.poliza_id, p.cliente_id, r.situacion::text as situacion
      from poliza_recibos r join polizas p on p.id = r.poliza_id
      where p.correduria_id = ${correduriaId}::uuid and ${viva}`,
    db.$queryRaw<{ id: string; cliente_id: string; poliza_id: string | null; estado: string }[]>`
      select s.id, s.cliente_id, s.poliza_id, s.estado::text as estado
      from siniestros s where s.correduria_id = ${correduriaId}::uuid`,
  ])
  return {
    polizas: Object.fromEntries(polizas.map((p) => [p.id, { id: p.id, clienteId: p.cliente_id, estado: p.estado, vencimiento: p.vencimiento, sustituida: p.sustituida, fusionada: p.fusionada }])),
    recibos: Object.fromEntries(recibos.map((r) => [r.id, { id: r.id, polizaId: r.poliza_id, clienteId: r.cliente_id, situacion: r.situacion }])),
    siniestros: Object.fromEntries(siniestros.map((s) => [s.id, { id: s.id, clienteId: s.cliente_id, polizaId: s.poliza_id, estado: s.estado }])),
  }
}

export type FugaNueva = {
  id: string
  tipo: TipoEventoCartera
  titulo: string
  clienteId: string
  cliente: string | null
  polizaNumero: string | null
  aseguradora: string | null
  estado: string | null
}

export type ResultadoDeteccion = {
  primeraVez: boolean
  detectados: number
  nuevos: number
  porTipo: Partial<Record<TipoEventoCartera, number>>
  /** Pérdidas SIN sustitución que acaban de aparecer: lo que merece un aviso. */
  fugasNuevas: FugaNueva[]
  polizasEnFoto: number
}

export async function detectarYGuardar(correduriaId: string): Promise<ResultadoDeteccion> {
  const db = prismaAsegura()
  const actual = await fotoActual(correduriaId)
  return db.$transaction(async (tx) => {
    // Bloqueo de la fila de la foto: dos pasadas a la vez compararían contra la misma foto vieja.
    const previa = await tx.$queryRaw<{ foto: Foto }[]>`
      select foto from cartera_foto where correduria_id = ${correduriaId}::uuid for update`
    const d = detectarCambios(previa[0]?.foto ?? null, actual)
    const insertados: EventoCartera[] = []
    for (const e of d.eventos) {
      const r = await tx.$queryRaw<{ id: string }[]>`
        insert into evento (correduria_id, tipo, entidad, entidad_id, cliente_id, datos, clave)
        values (${correduriaId}::uuid, ${e.tipo}, ${e.entidad}, ${e.id}::uuid, ${e.clienteId}::uuid, ${JSON.stringify(e.datos)}::jsonb, ${e.clave})
        on conflict (clave) do nothing
        returning id`
      if (r[0]) insertados.push(e)
    }
    await tx.$executeRaw`
      insert into cartera_foto (correduria_id, foto, tomada_at) values (${correduriaId}::uuid, ${JSON.stringify(actual)}::jsonb, now())
      on conflict (correduria_id) do update set foto = excluded.foto, tomada_at = excluded.tomada_at`

    const porTipo: Partial<Record<TipoEventoCartera, number>> = {}
    for (const e of insertados) porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1
    const fugas = insertados.filter(esFugaSinExplicar)
    const fugasNuevas = fugas.length ? await describirFugas(tx, correduriaId, fugas.map((f) => f.clave)) : []
    return {
      primeraVez: d.primeraVez,
      detectados: d.eventos.length,
      nuevos: insertados.length,
      porTipo,
      fugasNuevas,
      polizasEnFoto: Object.keys(actual.polizas).length,
    }
  }, { timeout: 30_000 })
}

type Consultor = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw'>

/** Lo mínimo para reconocer la póliza: nombre del tomador, número y compañía. Nada de contacto. */
async function describirFugas(db: Consultor, correduriaId: string, claves: string[] | null, limite = 100): Promise<FugaNueva[]> {
  const tipos = TIPOS_FUGA as readonly string[]
  const filas = await db.$queryRaw<{ id: string; tipo: TipoEventoCartera; cliente_id: string; nombre: string | null; apellidos: string | null; numero_poliza: string | null; aseguradora: string | null; despues: string | null }[]>`
    select e.id, e.tipo, e.cliente_id, c.nombre, c.apellidos, p.numero_poliza, p.aseguradora, e.datos->>'despues' as despues
    from evento e
    left join clientes c on c.id = e.cliente_id
    left join polizas p on p.id = e.entidad_id
    where e.correduria_id = ${correduriaId}::uuid and e.tipo = any(${tipos}::text[])
      and coalesce((e.datos->>'sustituida')::boolean, false) = false
      and ${claves ? Prisma.sql`e.clave = any(${claves}::text[])` : Prisma.sql`e.estado = 'pendiente'`}
    order by e.created_at desc
    limit ${limite}`
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    titulo: nombreEvento(f.tipo),
    clienteId: f.cliente_id,
    cliente: [f.nombre, f.apellidos].filter(Boolean).join(' ') || null,
    polizaNumero: f.numero_poliza,
    aseguradora: f.aseguradora,
    estado: f.despues,
  }))
}

export async function fugasPendientes(correduriaId: string): Promise<FugaNueva[] | null> {
  try {
    return await describirFugas(prismaAsegura(), correduriaId, null)
  } catch (e) {
    console.error('[eventos-cartera] no se pudieron leer las fugas pendientes:', e instanceof Error ? e.message : e)
    return null
  }
}

export type Revision = { resolucion: 'perdida'; motivo: string } | { resolucion: 'no_es_perdida' }

export function revisionValida(v: unknown): Revision | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.resolucion === 'no_es_perdida') return { resolucion: 'no_es_perdida' }
  if (o.resolucion === 'perdida' && typeof o.motivo === 'string' && (MOTIVOS_PERDIDA as readonly string[]).includes(o.motivo)) {
    return { resolucion: 'perdida', motivo: o.motivo }
  }
  return null
}

/** `true` si se revisó; `false` si no existe o ya estaba revisado (no se pisa una revisión). */
export async function revisarEvento(correduriaId: string, id: string, r: Revision, actor: string): Promise<boolean> {
  const motivo = r.resolucion === 'perdida' ? r.motivo : null
  const n = await prismaAsegura().$executeRaw`
    update evento set estado = 'revisado', resolucion = ${r.resolucion}, motivo = ${motivo},
           revisado_at = now(), revisado_por = ${actor.slice(0, 100)}
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`
  if (n > 0) anotarCambio({ entidad: 'evento', id, campo: 'estado', antes: 'pendiente', despues: r.resolucion })
  return n > 0
}
