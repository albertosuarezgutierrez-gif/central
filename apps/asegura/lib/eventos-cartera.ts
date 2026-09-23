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
  ORIGEN_RETENCION,
  POLIZA_ESTADOS_VIGENTES,
  TIPOS_FUGA,
  decidirRetencion,
  detectarCambios,
  esFugaSinExplicar,
  fotoSospechosa,
  nombreEvento,
  sqlCarteraViva,
  type EventoCartera,
  type Foto,
  type TipoEventoCartera,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { proponerReciboDevuelto } from './aprobaciones'
import { confirmarAnulaciones } from './anulaciones'

type Consultor = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw'>

export async function fotoActual(correduriaId: string, db: Consultor = prismaAsegura()): Promise<Foto> {
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
  /** Oportunidades de retención abiertas en esta pasada (anulada con el vencimiento por delante). */
  retencionesAbiertas: number
  /** Retenciones o avisos que tocaba proponer y fallaron (el evento sí se guardó). */
  retencionesFallidas: number
  /** Avisos al cliente propuestos en esta pasada, pendientes de OK (recibos devueltos). */
  aprobacionesNuevas: number
  /** Avisos de recibo devuelto que no se pudieron proponer (no se reintentan: el evento ya consta). */
  aprobacionesFallidas: number
  /** Expedientes de anulación que CIMA ya refleja (la póliza ya no está vigente). */
  anulacionesConfirmadas: number
  /** Retenciones abiertas antes que se cierran porque ya no hacen falta. */
  retencionesCerradas: number
}

/** La foto actual parece rota (ha desaparecido de golpe una parte grande de la cartera). */
export class FotoSospechosa extends Error {}

export async function detectarYGuardar(correduriaId: string): Promise<ResultadoDeteccion> {
  const db = prismaAsegura()
  return db.$transaction(async (tx) => {
    // Candado por correduría y la foto DENTRO: dos pasadas a la vez (el cron y una manual) no
    // pueden comparar una foto vieja contra otra ya guardada. `for update` no basta la primera vez,
    // cuando la fila aún no existe.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`cartera_foto:${correduriaId}`}))`
    const actual = await fotoActual(correduriaId, tx)
    const previa = await tx.$queryRaw<{ foto: Foto }[]>`
      select foto from cartera_foto where correduria_id = ${correduriaId}::uuid`
    const anterior = previa[0]?.foto ?? null
    // Sin guardar la foto: la próxima pasada, con la foto ya completa, compara contra la buena.
    if (fotoSospechosa(anterior, actual)) {
      throw new FotoSospechosa(`la foto actual tiene ${Object.keys(actual.polizas).length} pólizas y la anterior ${Object.keys(anterior?.polizas ?? {}).length}: parece a medias`)
    }
    const d = detectarCambios(anterior, actual)
    const insertados: EventoCartera[] = []
    const idEvento = new Map<string, string>()
    for (const e of d.eventos) {
      const r = await tx.$queryRaw<{ id: string }[]>`
        insert into evento (correduria_id, tipo, entidad, entidad_id, cliente_id, datos, clave)
        values (${correduriaId}::uuid, ${e.tipo}, ${e.entidad}, ${e.id}::uuid, ${e.clienteId}::uuid, ${JSON.stringify(e.datos)}::jsonb, ${e.clave})
        on conflict (clave) do nothing
        returning id`
      if (r[0]) { insertados.push(e); idEvento.set(e.clave, r[0].id) }
    }
    // Anulaciones tramitadas que CIMA ya refleja: expediente confirmado y la baja, explicada (antes de
    // decidir retenciones: a quien pidió anularla no se le llama para «retenerle»).
    const anuladas = new Set(await confirmarAnulaciones(tx, correduriaId))
    // En la MISMA transacción que el evento: si la retención no se puede abrir, no se guarda la foto
    // y la próxima pasada lo reintenta (la clave del evento impide abrirla dos veces).
    const retenciones: Retencion[] = []
    let retencionesFallidas = 0
    for (const e of insertados) {
      // Con sustitución registrada (renueva como póliza nueva, cambio de compañía) no hay nadie a quien retener.
      // Baja y anula-al-vencimiento: CIMA no distingue una anulación a vencimiento de una inmediata.
      if (!RETENIBLES.has(e.tipo) || !esFugaSinExplicar(e)) continue
      // Punto de guardado por póliza: un fallo que se repite en UNA póliza no puede tumbar la detección
      // entera de la correduría en cada pasada. Se cuenta y se dice; el evento queda y se revisa en «Hoy».
      await tx.$executeRaw`savepoint retencion`
      try {
        const r = await abrirRetencion(tx, correduriaId, e.id, e.tipo)
        await tx.$executeRaw`release savepoint retencion`
        if (r) retenciones.push(r)
      } catch (err) {
        await tx.$executeRaw`rollback to savepoint retencion`
        retencionesFallidas++
        console.error('[eventos-cartera] retención no abierta para la póliza', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Recibo devuelto → aviso al cliente propuesto, pendiente del OK de Alberto (cola de aprobaciones).
    let aprobacionesNuevas = 0
    let aprobacionesFallidas = 0
    for (const e of insertados) {
      if (e.tipo !== 'RECIBO_DEVUELTO') continue
      await tx.$executeRaw`savepoint aprobacion`
      try {
        if (await proponerReciboDevuelto(tx, correduriaId, e.id, idEvento.get(e.clave) ?? null)) aprobacionesNuevas++
        await tx.$executeRaw`release savepoint aprobacion`
      } catch (err) {
        await tx.$executeRaw`rollback to savepoint aprobacion`
        aprobacionesFallidas++
        console.error('[eventos-cartera] propuesta de aviso no creada para el recibo', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Las abiertas en pasadas anteriores que ya no hacen falta: la sustitución llegó en un pull
    // posterior, CIMA la reactivó, o se revisó como «no es pérdida». Sin esto la llamada quedaría
    // vencida en «Tareas de hoy» para siempre, y alguien llamaría a «retener» a quien ya renovó.
    const retencionesCerradas = await cerrarRetencionesResueltas(tx, correduriaId)
    await tx.$executeRaw`
      insert into cartera_foto (correduria_id, foto, tomada_at) values (${correduriaId}::uuid, ${JSON.stringify(actual)}::jsonb, now())
      on conflict (correduria_id) do update set foto = excluded.foto, tomada_at = excluded.tomada_at`

    const porTipo: Partial<Record<TipoEventoCartera, number>> = {}
    for (const e of insertados) porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1
    // Una baja con su expediente de anulación ya está explicada: no se anuncia como fuga.
    const fugas = insertados.filter((e) => esFugaSinExplicar(e) && !anuladas.has(e.id))
    const fugasNuevas = fugas.length ? await describirFugas(tx, correduriaId, fugas.map((f) => f.clave)) : []
    return {
      primeraVez: d.primeraVez,
      detectados: d.eventos.length,
      nuevos: insertados.length,
      porTipo,
      fugasNuevas,
      polizasEnFoto: Object.keys(actual.polizas).length,
      retenciones,
      retencionesFallidas,
      retencionesCerradas,
      aprobacionesNuevas,
      aprobacionesFallidas,
      anulacionesConfirmadas: anuladas.size,
    }
  }, { timeout: 30_000 }).then(async (r) => {
    const { retenciones, ...resto } = r
    for (const x of retenciones) await anotarRetencion(correduriaId, x)
    return { ...resto, retencionesAbiertas: retenciones.length }
  })
}

type Retencion = { oportunidadId: string; clienteId: string; polizaId: string; texto: string }

const ACTOR_RETENCION = 'sistema:cima'
const RETENIBLES = new Set<string>(['POLIZA_ANULA_AL_VENCIMIENTO', 'POLIZA_BAJA'])
/** Una retención más vieja que esto no bloquea abrir otra (sería de la anualidad anterior). */
const DIAS_RETENCION_VIVA = 120

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/**
 * Pieza 2-b: CIMA anula una póliza con el vencimiento por delante → oportunidad de retención
 * (`en_negociacion`) + llamada de prioridad alta para hoy, que sale en «Hoy · Tareas de hoy».
 * `null` si no toca (ya vencida, póliza que no está, o ya hay una retención abierta para ella).
 */
async function abrirRetencion(tx: Consultor & Pick<ReturnType<typeof prismaAsegura>, '$executeRaw'>, correduriaId: string, polizaId: string, tipo: string): Promise<Retencion | null> {
  const [p] = await tx.$queryRaw<{ clienteId: string; ramo: string; compania: string | null; numeroPoliza: string | null; vencimiento: string | null; prima: string | null }[]>`
    select p.cliente_id::text as "clienteId", p.tipo::text as ramo, p.aseguradora as compania, p.numero_poliza as "numeroPoliza",
           to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento, nullif(coalesce(p.prima_bruta, p.prima_anual), 0)::text as prima
    from polizas p where p.id = ${polizaId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null
      and p.sustituida_at is null
      and not exists (select 1 from polizas h where h.merged_into_poliza_id is null and (h.poliza_padre_id = p.id or h.poliza_origen_id = p.id))
      -- Con expediente de anulación (lo pidió el cliente y se está tramitando) no hay a quién retener.
      and not exists (select 1 from anulacion a where a.poliza_id = p.id and a.estado <> 'desistida')`
  if (!p) return null
  const hoy = hoyMadrid()
  const d = decidirRetencion({ tipo, ramo: p.ramo, compania: p.compania, numeroPoliza: p.numeroPoliza, vencimiento: p.vencimiento, hoy })
  if (!d.abrir) return null
  const [ya] = await tx.$queryRaw<{ id: string }[]>`
    select o.id::text as id from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid and o.info_riesgo->>'polizaId' = ${polizaId}
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and o.created_at > now() - make_interval(days => ${DIAS_RETENCION_VIVA}::int)
    limit 1`
  // Cualquier oportunidad abierta de esa póliza (retención o «mejórame el precio» del portal): ya hay
  // quien la trabaja, y dos llamadas altas al mismo cliente por lo mismo es ruido.
  if (ya) return null
  const [o] = await tx.$queryRaw<{ id: string }[]>`
    insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, fecha_fin_vigencia, numero_poliza, prima_bruta, info_riesgo)
    values (${correduriaId}::uuid, ${p.clienteId}::uuid, cast(${p.ramo} as tipo_seguro), 'renovacion', 'en_negociacion',
            ${p.vencimiento}::date, ${p.numeroPoliza}, ${p.prima}::numeric, ${JSON.stringify({ origen: ORIGEN_RETENCION, polizaId })}::jsonb)
    returning id::text as id`
  await tx.$executeRaw`
    insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, poliza_id, oportunidad_id, origen_trigger)
    values (${correduriaId}::uuid, cast('llamada' as gestion_tipo), 'alta', 'pendiente', ${d.texto},
            (${hoy}::date + time '23:59:59') at time zone 'Europe/Madrid',
            ${p.clienteId}::uuid, ${polizaId}::uuid, ${o.id}::uuid, 'central:seguimiento')`
  await tx.$executeRaw`
    insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
    values (${correduriaId}::uuid, ${o.id}::uuid, 'creada_retencion', null, 'en_negociacion',
            ${JSON.stringify({ polizaId, diasRestantes: d.diasRestantes })}::jsonb, ${ACTOR_RETENCION})`
  return { oportunidadId: o.id, clienteId: p.clienteId, polizaId, texto: d.texto }
}

const ESTADOS_VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]

/** Cierra como `ganada` las retenciones abiertas cuya póliza ya no se pierde, y sus tareas. */
async function cerrarRetencionesResueltas(tx: Consultor & Pick<ReturnType<typeof prismaAsegura>, '$executeRaw'>, correduriaId: string): Promise<number> {
  const filas = await tx.$queryRaw<{ id: string; motivo: string; sustituta: string | null }[]>`
    select o.id::text as id,
           case when s.id is not null then 'sustituida'
                when p.estado::text = any(${ESTADOS_VIGENTES}::text[]) then 'vigente'
                else 'no_es_perdida' end as motivo,
           s.id::text as sustituta
    from oportunidades o
    join polizas p on p.id = (o.info_riesgo->>'polizaId')::uuid and p.correduria_id = o.correduria_id
    left join lateral (
      select h.id from polizas h where h.merged_into_poliza_id is null
        and (h.poliza_padre_id = p.id or h.poliza_origen_id = p.id)
      order by h.created_at desc limit 1) s on true
    where o.correduria_id = ${correduriaId}::uuid
      and o.info_riesgo->>'origen' = ${ORIGEN_RETENCION}
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and (s.id is not null or p.sustituida_at is not null
           or p.estado::text = any(${ESTADOS_VIGENTES}::text[])
           or exists (select 1 from evento e where e.correduria_id = o.correduria_id and e.entidad_id = p.id
                        and e.tipo in ('POLIZA_BAJA', 'POLIZA_ANULA_AL_VENCIMIENTO') and e.resolucion = 'no_es_perdida'
                        and e.created_at >= o.created_at - interval '1 minute'))
    for update of o`
  for (const f of filas) {
    await tx.$executeRaw`
      update oportunidades set estado = 'ganada', cerrada_at = now(), updated_at = now(),
             poliza_ganada_id = coalesce(${f.sustituta}::uuid, poliza_ganada_id)
      where id = ${f.id}::uuid`
    await tx.$executeRaw`
      update gestiones set estado = 'cerrada', updated_at = now(),
             observaciones = observaciones || ${`\n— Cerrada sola: ya no hay que retener (${f.motivo}).`}
      where oportunidad_id = ${f.id}::uuid and correduria_id = ${correduriaId}::uuid and estado <> 'cerrada'`
    await tx.$executeRaw`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${f.id}::uuid, 'retencion_resuelta', null, 'ganada',
              ${JSON.stringify({ motivo: f.motivo })}::jsonb, ${ACTOR_RETENCION})`
    anotarCambio({ entidad: 'oportunidad', id: f.id, campo: 'estado', antes: 'en_negociacion', despues: 'ganada' })
  }
  return filas.length
}

/** Best-effort y fuera de la transacción: la oportunidad y la llamada ya están guardadas. */
async function anotarRetencion(correduriaId: string, r: Retencion): Promise<void> {
  anotarCambio({ entidad: 'oportunidad', id: r.oportunidadId, campo: 'estado', antes: null, despues: 'en_negociacion' })
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${r.clienteId}::uuid, ${r.polizaId}::uuid, cast('gestion' as tipo_historial_interno), ${r.texto})`
  } catch (e) {
    console.error('[eventos-cartera] historial de la retención no anotado:', e instanceof Error ? e.message : e)
  }
}

/** Lo mínimo para reconocer la póliza: nombre del tomador, número y compañía. Nada de contacto. */
async function describirFugas(db: Consultor, correduriaId: string, claves: string[] | null): Promise<FugaNueva[]> {
  const limite = claves ? claves.length : 100
  const tipos = TIPOS_FUGA as readonly string[]
  const filas = await db.$queryRaw<{ id: string; tipo: TipoEventoCartera; cliente_id: string; nombre: string | null; apellidos: string | null; numero_poliza: string | null; aseguradora: string | null; despues: string | null }[]>`
    select e.id, e.tipo, e.cliente_id, c.nombre, c.apellidos, p.numero_poliza, p.aseguradora, e.datos->>'despues' as despues
    from evento e
    left join clientes c on c.id = e.cliente_id
    left join polizas p on p.id = e.entidad_id
    where e.correduria_id = ${correduriaId}::uuid and e.tipo = any(${tipos}::text[])
      -- La sustitución se mira AHORA, no la que había al crear el evento: la renovación con número
      -- nuevo (o la emitida por Codeoscopic) puede llegar en un pull posterior al de la baja.
      and not exists (select 1 from polizas s where s.id = e.entidad_id and s.sustituida_at is not null)
      and not exists (select 1 from polizas h where h.merged_into_poliza_id is null
                        and (h.poliza_padre_id = e.entidad_id or h.poliza_origen_id = e.entidad_id))
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
