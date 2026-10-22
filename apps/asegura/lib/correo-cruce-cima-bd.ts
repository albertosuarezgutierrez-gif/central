// apps/asegura/lib/correo-cruce-cima-bd.ts
//
// Cruce diario correo ↔ CIMA (F1 del agente de correo, 21/10/2026, spec §4.2). Lo dispara el cron
// `correduria-cruce-cima` de plataforma: aquí se DECIDE qué avisar (reglas puras de `@central/module-seguros` +
// textos de `correo-cruce.ts`), se apunta UNA vez por hecho en `correo_cruce_aviso` y se devuelven los que aún no han
// salido. Plataforma manda el Telegram y SOLO si salió los marca (`marcarAvisosCruce`). Nunca se escribe la póliza.
//
// Qué se cruza:
//   · emisión por correo (Allianz «Rel. Emisión», Occident «solicitud emitida · póliza N») que CIMA no trae tras los días
//     hábiles de su compañía (5 por defecto);
//   · ANULACIÓN de póliza por correo que CIMA sigue dando en vigor tras 2 días hábiles;
//   · DEVOLUCIÓN de recibo por correo cuyo recibo no consta en la cartera tras 2 días hábiles;
//   · enlaces póliza↔oportunidad ambiguos (los apunta `enlace-poliza-oportunidad.ts` tras el pull);
//   · «Póliza emitida» declarada a mano (22/10/2026): CIMA no la trae tras 10 días naturales, o la trae y no se enlaza.
// 🚨 Si la cartera no se pudo leer, LANZA: no se avisa de nada (un fallo no es «CIMA no la trae»).

import {
  ACCION_ANULADA_DECLARACION, ACCION_DECLARADA_EMITIDA, CODIGO_DGS_COMPANIA, POLIZA_ESTADOS_VIGENTES, decidirAvisoAnulacionSinCima,
  decidirAvisoDevolucionSinRecibo, decidirAvisoEmisionSinCima, diagnosticarDeclarada, diasHabilesEntre, esCarteraEnVigor,
  leerDetalleDeclaracion, numeroPolizaComparable, sqlCarteraViva, type PolizaConNumero, type TipoAvisoCruce,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { esTablaInexistente } from './correo-avisos-intranet'
import { MOTIVO_EMISION_NO_LLEGADA, claveNumero, resolverPolizaEvento } from './correo-evento'
import { polizasCandidatas, polizasFueraDeCandidatas } from './correo-evento-bd'
import { claveAvisoCruce, enCimaSegunResolucion, textoAvisoAnulacionSinCima, textoAvisoDeclaradaNoEnlaza, textoAvisoDeclaradaSinCima, textoAvisoDevolucionSinRecibo, textoAvisoEmisionSinCima } from './correo-cruce'

const SQL_F1 = '2026-10-21_correo_agente_f1.sql'
const VENTANA_EMISION_DIAS = 60
const VENTANA_REFLEJO_DIAS = 30
/** Declaraciones a mano que se siguen diagnosticando (por la fecha de la declaración). Los avisos son idempotentes. */
const VENTANA_DECLARADA_DIAS = 180
/** `C0468` → `occident`: la clave de compañía de los eventos de correo (para compartir la clave del aviso de emisión). */
const CLAVE_COMPANIA_DE_DGS = new Map(Object.entries(CODIGO_DGS_COMPANIA).map(([k, v]) => [v, k]))

export type AvisoCruce = { id: string; tipo: TipoAvisoCruce; texto: string; clienteId: string | null; creado: string }

export type ResultadoCruce =
  | { ok: true; nuevos: number; revisados: { emisiones: number; solicitudes: number; anulaciones: number; devoluciones: number; declaradas: number }; pendientes: AvisoCruce[] }
  | { ok: false; estado: 'sin_migracion'; motivo: string }

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

type Db = ReturnType<typeof prismaAsegura>

async function apuntar(db: Db, correduriaId: string, tipo: TipoAvisoCruce, id: string, texto: string, clienteId: string | null): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    insert into correo_cruce_aviso (correduria_id, tipo, clave, texto, cliente_id)
    values (${correduriaId}::uuid, ${tipo}, ${claveAvisoCruce(tipo, id)}, ${texto}, ${clienteId}::uuid)
    on conflict (correduria_id, clave) do nothing`)
}

/**
 * Decide y apunta los avisos de cruce de hoy y devuelve TODOS los pendientes de salir (también los de pasadas
 * anteriores cuyo Telegram no salió). `hoy` inyectable (aaaa-mm-dd, Madrid) para probar sin reloj.
 */
export async function cruzarCorreoConCima(correduriaId: string, hoy: string = hoyMadrid()): Promise<ResultadoCruce> {
  const db = prismaAsegura()
  try {
    await db.$queryRaw(Prisma.sql`select 1 from correo_cruce_aviso where false`)
  } catch (e) {
    if (esTablaInexistente(e)) return { ok: false, estado: 'sin_migracion', motivo: `falta aplicar ${SQL_F1}: no se ha cruzado nada` }
    throw e
  }
  // La cartera viva, UNA vez. Si esto falla, lanza: sin cartera no se sabe si CIMA la trae.
  const candidatas = await polizasCandidatas(db, correduriaId)
  const porId = new Map(candidatas.map((p) => [p.id, p]))
  // Las de CIMA en fichas inactivas o fusionadas (no son candidatas): estar ahí NO es «CIMA no la trae». También lanza.
  const fuera = await polizasFueraDeCandidatas(db, correduriaId)
  let nuevos = 0

  // 1. Emisiones «aún no llegadas por CIMA» (la reevaluación de cada pasada del triaje ya quitó las que llegaron).
  const emisiones = await db.$queryRaw<{ id: string; compania: string; codigoDgs: string; numeroPoliza: string | null; dia: string; clienteId: string | null }[]>(Prisma.sql`
    select id::text as id, compania, codigo_entidad_dgs as "codigoDgs", numero_poliza as "numeroPoliza",
           to_char(created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as dia, cliente_id::text as "clienteId"
    from correo_evento_entrante
    where correduria_id = ${correduriaId}::uuid and tipo = 'emision' and estado = 'sin_resolver' and revisado_at is null
      and motivo = ${MOTIVO_EMISION_NO_LLEGADA}
      and created_at > now() - make_interval(days => ${VENTANA_EMISION_DIAS}::int)
    order by created_at asc limit 300`)
  for (const e of emisiones) {
    if (!e.numeroPoliza) continue
    // `no_en_vigor` = CIMA tiene ese nº (aunque no en vigor): sí la trae; `ambigua` o en ficha inactiva = no se sabe.
    const enCima = enCimaSegunResolucion(
      resolverPolizaEvento(e.numeroPoliza, e.compania, e.codigoDgs, candidatas),
      resolverPolizaEvento(e.numeroPoliza, e.compania, e.codigoDgs, fuera))
    if (decidirAvisoEmisionSinCima({ compania: e.compania, fechaCorreo: e.dia, hoy, enCima }) !== 'avisar') continue
    const n = diasHabilesEntre(e.dia, hoy) ?? 0
    // Misma clave que la de la solicitud emitida: la misma póliza contada por dos correos es UN aviso.
    nuevos += await apuntar(db, correduriaId, 'emision_sin_cima', `${e.compania}:${claveNumero(e.numeroPoliza) ?? e.numeroPoliza}`, textoAvisoEmisionSinCima({ compania: e.compania, numeroPoliza: e.numeroPoliza, numeroSolicitud: null, fechaCorreo: e.dia, diasHabiles: n }), e.clienteId)
  }

  // 2. Solicitudes EMITIDAS por correo (con nº de póliza): la más vieja de cada póliza manda la fecha.
  const solicitudes = await db.$queryRaw<{ id: string; compania: string; codigoDgs: string; numeroPoliza: string; clave: string; dia: string; clienteId: string | null }[]>(Prisma.sql`
    select distinct on (compania, numero_poliza) id::text as id, compania, codigo_entidad_dgs as "codigoDgs", numero_poliza as "numeroPoliza",
           clave, to_char(created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as dia, cliente_id::text as "clienteId"
    from correo_evento_entrante
    where correduria_id = ${correduriaId}::uuid and tipo = 'solicitud' and detalle->>'fase' = 'emitida'
      and numero_poliza is not null and revisado_at is null
      and created_at > now() - make_interval(days => ${VENTANA_EMISION_DIAS}::int)
    order by compania, numero_poliza, created_at asc
    limit 300`)
  for (const s of solicitudes) {
    const enCima = enCimaSegunResolucion(
      resolverPolizaEvento(s.numeroPoliza, s.compania, s.codigoDgs, candidatas),
      resolverPolizaEvento(s.numeroPoliza, s.compania, s.codigoDgs, fuera))
    if (decidirAvisoEmisionSinCima({ compania: s.compania, fechaCorreo: s.dia, hoy, enCima }) !== 'avisar') continue
    const n = diasHabilesEntre(s.dia, hoy) ?? 0
    // Clave por póliza (no por correo): la misma emisión repetida en dos correos es UN aviso.
    nuevos += await apuntar(db, correduriaId, 'emision_sin_cima', `${s.compania}:${claveNumero(s.numeroPoliza) ?? s.numeroPoliza}`,
      textoAvisoEmisionSinCima({ compania: s.compania, numeroPoliza: s.numeroPoliza, numeroSolicitud: s.clave, fechaCorreo: s.dia, diasHabiles: n }), s.clienteId)
  }

  // 3. Anulaciones de PÓLIZA por correo (no las de un recibo) ya aplicadas en la ficha: ¿CIMA la sigue dando en vigor?
  const anulaciones = await db.$queryRaw<{ id: string; compania: string; numeroPoliza: string | null; polizaId: string; dia: string; clienteId: string | null }[]>(Prisma.sql`
    select id::text as id, compania, numero_poliza as "numeroPoliza", poliza_id::text as "polizaId",
           to_char(created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as dia, cliente_id::text as "clienteId"
    from correo_evento_entrante
    where correduria_id = ${correduriaId}::uuid and tipo = 'anulacion' and estado = 'aplicado' and poliza_id is not null
      and coalesce(detalle->>'idRecibo', '') = ''
      and created_at > now() - make_interval(days => ${VENTANA_REFLEJO_DIAS}::int)
    order by created_at asc limit 300`)
  for (const a of anulaciones) {
    const p = porId.get(a.polizaId)
    // Fuera de la cartera viva (fusionada, cliente inactivo…) = ya no está en vigor para nosotros.
    const sigueEnVigor = p ? esCarteraEnVigor(p) : false
    if (decidirAvisoAnulacionSinCima({ fechaCorreo: a.dia, hoy, sigueEnVigor }) !== 'avisar') continue
    nuevos += await apuntar(db, correduriaId, 'anulacion_sin_cima', a.id,
      textoAvisoAnulacionSinCima({ compania: a.compania, numeroPoliza: a.numeroPoliza ?? p?.numeroPoliza ?? 'sin nº', fechaCorreo: a.dia, diasHabiles: diasHabilesEntre(a.dia, hoy) ?? 0 }), a.clienteId)
  }

  // 4. Devoluciones de recibo por correo sin recibo en la cartera (el trigger las enlaza solas cuando el recibo entra).
  let devoluciones: { id: string; codigoDgs: string; idRecibo: string; numeroPoliza: string | null; dia: string }[] = []
  try {
    devoluciones = await db.$queryRaw(Prisma.sql`
      select id::text as id, codigo_entidad_dgs as "codigoDgs", id_recibo as "idRecibo", numero_poliza as "numeroPoliza",
             to_char(created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as dia
      from recibo_devolucion
      where correduria_id = ${correduriaId}::uuid and fuente = 'correo' and recibo_id is null and resuelta_at is null
        and created_at > now() - make_interval(days => ${VENTANA_REFLEJO_DIAS}::int)
      order by created_at asc limit 300`)
  } catch (e) {
    if (!esTablaInexistente(e)) throw e
  }
  for (const d of devoluciones) {
    if (decidirAvisoDevolucionSinRecibo({ fechaCorreo: d.dia, hoy, reciboEnCartera: false }) !== 'avisar') continue
    const pol = d.numeroPoliza ? resolverPolizaPorNumero(candidatas, d.numeroPoliza, d.codigoDgs) : null
    nuevos += await apuntar(db, correduriaId, 'devolucion_sin_recibo', d.id,
      textoAvisoDevolucionSinRecibo({ codigoDgs: d.codigoDgs, idRecibo: d.idRecibo, numeroPoliza: d.numeroPoliza, fechaCorreo: d.dia, diasHabiles: diasHabilesEntre(d.dia, hoy) ?? 0 }), pol)
  }

  // 5. «Póliza emitida» DECLARADA a mano (22/10/2026) en una ganada sin póliza enlazada. Por la FECHA DE LA DECLARACIÓN
  //    (no por el cierre), y con TODAS las pólizas de ese nº (cualquier estado, fuera de la ventana del enlace):
  //    `diagnosticarDeclarada` decide si CIMA no la trae aún (aviso a los 10 días) o si la trae pero no se puede enlazar
  //    (aviso propio con el motivo). Una declarada no enlazada nunca queda muda. Lectura fallida → lanza (no se avisa).
  const declaradas = await db.$queryRaw<{ id: string; clienteId: string; dniHash: string | null; detalle: unknown; dia: string }[]>(Prisma.sql`
    select o.id::text as id, o.cliente_id::text as "clienteId", c.dni_lookup_hash as "dniHash", d.detalle, d.dia
    from oportunidades o
    join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    join lateral (
      select h.detalle, h.created_at, to_char(h.created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD') as dia
      from oportunidad_historial h
      where h.oportunidad_id = o.id and h.correduria_id = o.correduria_id and h.accion = ${ACCION_DECLARADA_EMITIDA}
        and not exists (select 1 from oportunidad_historial r
                        where r.oportunidad_id = o.id and r.correduria_id = o.correduria_id
                          and r.accion = ${ACCION_ANULADA_DECLARACION} and r.created_at > h.created_at)
      order by h.created_at desc limit 1) d on true
    where o.correduria_id = ${correduriaId}::uuid and o.estado::text = 'ganada' and o.poliza_ganada_id is null
      and d.created_at > now() - make_interval(days => ${VENTANA_DECLARADA_DIAS}::int)
    limit 300`)
  const leidas = declaradas.flatMap((o) => {
    const decl = leerDetalleDeclaracion(o.detalle)
    const num = decl ? numeroPolizaComparable(decl.numeroPoliza) : null
    return decl && num ? [{ ...o, decl, num }] : []
  })
  const porNumero = new Map<string, PolizaConNumero[]>()
  if (leidas.length > 0) {
    const viva = Prisma.raw(sqlCarteraViva('p'))
    const vigentes = [...POLIZA_ESTADOS_VIGENTES] as string[]
    const nums = [...new Set(leidas.map((l) => l.num))]
    const pols = await db.$queryRaw<(PolizaConNumero & { num: string; creada: Date })[]>(Prisma.sql`
      select p.id::text as id, p.cliente_id::text as "clienteId", c.dni_lookup_hash as "dniHash", p.codigo_entidad_dgs as "codigoDgs",
             ${viva} as viva, (p.estado::text = any(${vigentes}::text[])) as vigente, (p.sustituida_at is not null) as sustituida,
             (select g.id::text from oportunidades g where g.poliza_ganada_id = p.id and g.correduria_id = p.correduria_id limit 1) as "enlazadaA",
             p.created_at as creada,
             ltrim(upper(regexp_replace(coalesce(p.numero_poliza, ''), '[^A-Za-z0-9]', '', 'g')), '0') as num
      from polizas p
      join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
      where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null
        and ltrim(upper(regexp_replace(coalesce(p.numero_poliza, ''), '[^A-Za-z0-9]', '', 'g')), '0') = any(${nums}::text[])
      limit 2000`)
    for (const p of pols) {
      const { num, creada, ...resto } = p
      porNumero.set(num, [...(porNumero.get(num) ?? []), { ...resto, creadaEn: creada.toISOString() }])
    }
  }
  const ahora = Date.now()
  for (const o of leidas) {
    const dg = diagnosticarDeclarada({ id: o.id, clienteId: o.clienteId, dniHash: o.dniHash }, { codigoDgs: o.decl.codigoDgs, declaradaEl: o.dia },
      porNumero.get(o.num) ?? [], hoy, ahora)
    const base = { compania: o.decl.compania, codigoDgs: o.decl.codigoDgs, numeroPoliza: o.decl.numeroPoliza, fechaDeclaracion: o.dia }
    if (dg.tipo === 'no_llega') {
      // Misma clave que la emisión por correo cuando la compañía es de las del correo: la misma póliza es UN aviso.
      const clave = CLAVE_COMPANIA_DE_DGS.get(o.decl.codigoDgs ?? '')
      nuevos += await apuntar(db, correduriaId, 'emision_sin_cima', clave ? `${clave}:${claveNumero(o.decl.numeroPoliza) ?? o.num}` : `declarada:${o.id}:${o.num}`,
        textoAvisoDeclaradaSinCima({ ...base, dias: dg.dias }), o.clienteId)
    } else if (dg.tipo === 'no_enlaza') {
      nuevos += await apuntar(db, correduriaId, 'enlace_ambiguo', `declarada:${o.id}:${o.num}:${dg.motivo}`,
        textoAvisoDeclaradaNoEnlaza({ ...base, motivo: dg.motivo }), o.clienteId)
    }
  }

  const pendientes = await avisosCrucePendientes(db, correduriaId)
  return { ok: true, nuevos, revisados: { emisiones: emisiones.length, solicitudes: solicitudes.length, anulaciones: anulaciones.length, devoluciones: devoluciones.length, declaradas: declaradas.length }, pendientes }
}

/** El cliente de la ÚNICA póliza viva con ese nº y compañía (para el enlace del aviso). `null` si no hay una. */
function resolverPolizaPorNumero(candidatas: Awaited<ReturnType<typeof polizasCandidatas>>, numero: string, dgs: string): string | null {
  const n = claveNumero(numero)
  const casan = candidatas.filter((p) => claveNumero(p.numeroPoliza) === n && p.codigoDgs === dgs)
  return casan.length === 1 ? casan[0].clienteId : null
}

/** Reclamo de un aviso por una pasada: pasado este tiempo sin marcarse avisado, otra pasada puede cogerlo (la primera murió). */
export const RECLAMO_AVISO_MINUTOS = 15

/**
 * Los avisos que aún no han salido, RECLAMADOS de forma atómica: dos pasadas solapadas del cron no reciben los mismos
 * (si no, el Telegram saldría dos veces). Un aviso reclamado y no marcado vuelve a ser reclamable a los 15 min.
 */
async function avisosCrucePendientes(db: Db, correduriaId: string): Promise<AvisoCruce[]> {
  const filas = await db.$queryRaw<AvisoCruce[]>(Prisma.sql`
    update correo_cruce_aviso set reclamado_at = now()
    where id in (
      select id from correo_cruce_aviso
      where correduria_id = ${correduriaId}::uuid and avisado_at is null
        and (reclamado_at is null or reclamado_at < now() - make_interval(mins => ${RECLAMO_AVISO_MINUTOS}::int))
      order by created_at asc limit 50
      for update skip locked)
    returning id::text as id, tipo, texto, cliente_id::text as "clienteId",
           to_char(created_at at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI') as creado`)
  return filas.sort((a, b) => (a.creado < b.creado ? -1 : a.creado > b.creado ? 1 : 0))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids válidos del cuerpo `{ avisados: [uuid…] }` (máx. 50). `null` = cuerpo no válido. */
export function idsAvisados(b: unknown): string[] | null {
  const o = typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  if (!o || !Array.isArray(o.avisados) || o.avisados.length > 50) return null
  if (!o.avisados.every((x) => typeof x === 'string' && UUID.test(x))) return null
  return [...new Set(o.avisados as string[])]
}

/** Marca como avisados (Telegram salido). Idempotente. Devuelve cuántos se marcaron ahora. */
export async function marcarAvisosCruce(correduriaId: string, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  return prismaAsegura().$executeRaw(Prisma.sql`
    update correo_cruce_aviso set avisado_at = now()
    where correduria_id = ${correduriaId}::uuid and id = any(${[...ids]}::uuid[]) and avisado_at is null`)
}
