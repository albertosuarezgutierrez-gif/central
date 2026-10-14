// Campaña «presentación de la app» (14/10/2026): el correo a los LEADS antiguos que les presenta el
// portal del cliente. Contra la BD. Lo puro: `presentacion-app-seleccion.ts` (a quién) y
// `@central/module-seguros` (`correoPresentacionApp`, `embudoCampana`).
//
// Cerrojos (los mismos que el resto de correos de esta app, ver CLAUDE.md «Correos y crons»):
//  1. `CRON_SECRET` en la ruta.
//  2. APAGADO por defecto: sin `ASEGURA_PRESENTACION_APP_ACTIVA=1` solo CUENTA (no envía nada).
//  3. Tope DIARIO (`ASEGURA_PRESENTACION_APP_TOPE_DIARIO`, 20 por defecto): es un GOTEO medido, no un
//     envío masivo (Alberto, 15/10/2026); el dominio ya va con ~10,8% de rebote. Cada día con envíos es un
//     LOTE numerado y cada envío guarda su VARIANTE A/B (`ASEGURA_PRESENTACION_APP_VARIANTES`, p. ej. `A,B`;
//     vacía = todas), repartidas por turno para que los grupos salgan parejos.
//  4. La selección se rehace en la consulta en cada pasada (bajas, cartera en vigor, portal, rebotes).
//
// Una fila de `campana_envio` se RESERVA antes de enviar (índice único por persona y campaña): si algo
// cae entre la reserva y el envío, esa persona NO se reintenta (se queda `reservado`). Un correo de menos
// es mejor que uno repetido a un lead que no nos ha pedido nada.
//
// 🔒 Sin `seguros.` en el SQL: `prismaAsegura()` ya conecta con `?schema=seguros` (ver cartera-recaptacion.ts).
import {
  CAMPANA_PRESENTACION_APP, cabecerasBaja, correoPresentacionApp, embudoCampana, embudoPorGrupo, enlacePresentacion,
  etapaPersona, remitenteCorreo, sqlCarteraEnVigor, varianteDeTurno, variantesActivas,
  type EmbudoCampana, type EtapaPersona, type FilaEmbudo, type VariantePresentacion,
} from '@central/module-seguros'
import { generarRef, hashRef } from '@central/module-seguros/presentacion-app-ref'
import { Prisma } from './generated/asegura-client'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'
import { enviarEmailResend } from './recaptacion-email'
import { urlPublicaAsegura } from './recaptacion-baja'
import { registrarEnvioCorreo } from './correo-seguimiento'
import {
  presentacionAppActiva, seleccionarDestinatariosPresentacion, topeDiarioPresentacion, type MotivoDescarte,
} from './presentacion-app-seleccion'

export const ACTOR_CRON_PRESENTACION = 'cron-presentacion-app'

/** Días sin escribir a quien recibió un correo de recaptación (para no mandarle dos seguidos). */
const DIAS_SIN_SOLAPAR_RECAPTACION = 30

export function urlBajaCampana(base: string, envioId: string): string {
  return `${base.replace(/\/$/, '')}/api/publico/campana/baja?t=${envioId}`
}

/** `false` = la migración `2026-10-14c_campana_presentacion_app.sql` no está aplicada. */
export async function campanaMigrada(): Promise<boolean> {
  const filas = await prismaAsegura().$queryRaw<{ ok: boolean }[]>(Prisma.sql`
    select to_regclass('campana_envio') is not null and to_regclass('portal_alta_origen') is not null as ok`)
  return filas[0]?.ok === true
}

type FilaCandidata = { clienteId: string; nombre: string | null; apellidos: string | null; email: string | null; emailHash: string | null }

/**
 * Los leads que la BD deja escribir HOY. El orden (fichas más recientes primero) decide quién sale antes
 * con el tope: los datos más nuevos son los que menos rebotan.
 */
async function candidatosBD(correduriaId: string): Promise<FilaCandidata[]> {
  const enVigor = (a: string) => Prisma.raw(sqlCarteraEnVigor(a))
  return prismaAsegura().$queryRaw<FilaCandidata[]>(Prisma.sql`
    select c.id as "clienteId", c.nombre, c.apellidos, c.email, c.email_lookup_hash as "emailHash"
    from clientes c
    where c.correduria_id = ${correduriaId}::uuid
      and c.tipo = 'lead'
      and c.merged_into_cliente_id is null
      and c.activo
      and c.email is not null and c.email <> ''
      and c.email_opt_out_at is null
      -- Cliente HOY (esCarteraEnVigor): no es un lead, se le atiende desde su ficha.
      and not exists (
        select 1 from polizas v where v.cliente_id = c.id and v.merged_into_poliza_id is null and ${enVigor('v')})
      -- Ya entra al portal (el vínculo temporal del corredor no cuenta).
      and not exists (select 1 from portal_vinculo pv where pv.cliente_id = c.id and pv.origen <> 'corredor')
      -- La MISMA persona por correo (índice ciego) en otra ficha: si allí es cliente, se dio de baja o
      -- ya entra al portal, tampoco se le escribe aquí.
      and not exists (
        select 1 from clientes o
        where c.email_lookup_hash is not null
          and o.email_lookup_hash = c.email_lookup_hash
          and o.id <> c.id
          and o.correduria_id = c.correduria_id
          and (
            o.email_opt_out_at is not null
            or exists (select 1 from polizas v2 where v2.cliente_id = o.id and v2.merged_into_poliza_id is null and ${enVigor('v2')})
            or exists (select 1 from portal_vinculo pv2 where pv2.cliente_id = o.id and pv2.origen <> 'corredor')
          ))
      -- Rebote o queja de un correo anterior, o recaptación reciente.
      and not exists (
        select 1 from recaptacion_envios r
        where r.cliente_id = c.id
          and (r.estado in ('rebotado', 'queja') or r.created_at > now() - make_interval(days => ${DIAS_SIN_SOLAPAR_RECAPTACION}::int)))
      and not exists (
        select 1 from correo_envio ce join correo_evento ev on ev.resend_id = ce.resend_id
        where ce.cliente_id = c.id
          and ev.tipo in ('email.bounced', 'email.complained', 'email.suppressed', 'email.failed'))
      -- Ya está en esta campaña (esta ficha u otra con el mismo correo).
      and not exists (
        select 1 from campana_envio k
        where k.campana = ${CAMPANA_PRESENTACION_APP}
          and (k.cliente_id = c.id or (c.email_lookup_hash is not null and k.email_lookup_hash = c.email_lookup_hash)))
    order by c.created_at desc, c.id
    limit 6000
  `)
}

/**
 * Lo de HOY (día de Madrid): cuántos se han intentado ya (cuentan contra el tope) y qué lote toca — el de
 * hoy si ya se abrió, si no el siguiente al último.
 */
async function loteDeHoy(correduriaId: string): Promise<{ yaHoy: number; lote: number; fecha: string }> {
  const filas = await prismaAsegura().$queryRaw<{ yaHoy: bigint; lote: number; fecha: string }[]>(Prisma.sql`
    with hoy as (select (now() at time zone 'Europe/Madrid')::date as d)
    select
      count(*) filter (where k.lote_fecha = hoy.d)::bigint as "yaHoy",
      coalesce(max(k.lote) filter (where k.lote_fecha = hoy.d), max(k.lote) + 1, 1)::int as lote,
      to_char(hoy.d, 'YYYY-MM-DD') as fecha
    from hoy left join campana_envio k
      on k.correduria_id = ${correduriaId}::uuid and k.campana = ${CAMPANA_PRESENTACION_APP}
    group by hoy.d`)
  const f = filas[0]
  if (!f) throw new Error('lote_ilegible')
  return { yaHoy: Number(f.yaHoy), lote: Number(f.lote), fecha: f.fecha }
}

export type ResumenPresentacion =
  | { estado: 'sin_migracion' }
  | {
      estado: 'ok'
      modo: 'envio' | 'cuenta'
      /** Lote de hoy (número y fecha de Madrid). En modo cuenta, el que se ABRIRÍA. */
      lote: number
      loteFecha: string
      variantes: VariantePresentacion[]
      topeDiario: number
      yaHoy: number
      /** Fichas que deja la BD (antes de mirar el correo descifrado). */
      fichasCandidatas: number
      /** Personas que se podrían escribir en total (sin tope). */
      seleccionables: number
      descartes: Record<MotivoDescarte, number>
      /** Las que tocan en esta pasada (con el tope de hoy). En modo cuenta, las que SALDRÍAN. */
      aEnviar: number
      enviados: number
      fallidos: number
      detalleFallos: string[]
    }

/**
 * Una pasada. `forzarContar` = ensayo aunque esté encendida. Lanza si no puede leer la cartera (la ruta
 * responde 503): un fallo de lectura nunca se sirve como «hoy no había nadie».
 */
export async function pasadaPresentacionApp(correduriaId: string, opts: { forzarContar?: boolean } = {}): Promise<ResumenPresentacion> {
  if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
  if (!(await campanaMigrada())) return { estado: 'sin_migracion' }
  const modo: 'envio' | 'cuenta' = presentacionAppActiva() && !opts.forzarContar ? 'envio' : 'cuenta'
  const topeDiario = topeDiarioPresentacion()
  const { yaHoy, lote, fecha: loteFecha } = await loteDeHoy(correduriaId)
  const variantes = variantesActivas(process.env.ASEGURA_PRESENTACION_APP_VARIANTES)
  const restante = Math.max(0, topeDiario - yaHoy)

  const filas = await candidatosBD(correduriaId)
  const candidatos = filas.map((f) => ({
    clienteId: f.clienteId,
    nombre: [f.nombre, f.apellidos].filter(Boolean).join(' ').trim() || null,
    email: descifrarCampo(f.email),
    emailHash: f.emailHash,
  }))
  const total = seleccionarDestinatariosPresentacion(candidatos, Number.MAX_SAFE_INTEGER)
  const hoy = seleccionarDestinatariosPresentacion(candidatos, restante)
  const base = {
    estado: 'ok' as const, modo, lote, loteFecha, variantes, topeDiario, yaHoy, fichasCandidatas: filas.length,
    seleccionables: total.elegidos.length, descartes: total.descartes, aEnviar: hoy.elegidos.length,
  }
  if (modo === 'cuenta' || hoy.elegidos.length === 0) return { ...base, enviados: 0, fallidos: 0, detalleFallos: [] }
  if (!process.env.RESEND_API_KEY?.trim()) throw new Error('sin_correo_configurado')

  const db = prismaAsegura()
  const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
  const baseUrl = urlPublicaAsegura()
  const hashPorCliente = new Map(candidatos.map((c) => [c.clienteId, c.emailHash]))
  let enviados = 0
  let fallidos = 0
  const detalleFallos: string[] = []

  for (const [i, d] of hoy.elegidos.entries()) {
    const envioId = crypto.randomUUID()
    const ref = generarRef()
    // Por turno contando lo ya enviado hoy: dos pasadas el mismo día siguen alternando.
    const variante = varianteDeTurno(yaHoy + i, variantes)
    // Reserva: si otra pasada ya la cogió (o el mismo correo en otra ficha), no se manda. El TOPE DIARIO se
    // re-comprueba DENTRO de la reserva, serializada por un candado de transacción: dos pasadas a la vez
    // (doble disparo del cron, reintento de Vercel, ensayo + cron) leen el mismo `yaHoy` al empezar, y sin
    // esto cada una mandaría su cupo entero.
    const reservada = await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`campana_envio:${CAMPANA_PRESENTACION_APP}`}))`)
      return tx.$executeRaw(Prisma.sql`
        insert into campana_envio (id, correduria_id, cliente_id, campana, email_lookup_hash, ref_hash, lote, lote_fecha, variante, estado, creado_por)
        select ${envioId}::uuid, ${correduriaId}::uuid, ${d.clienteId}::uuid, ${CAMPANA_PRESENTACION_APP},
               ${hashPorCliente.get(d.clienteId) ?? null}, ${hashRef(ref)}, ${lote}::int, ${loteFecha}::date, ${variante}, 'reservado', ${ACTOR_CRON_PRESENTACION}
        where (select count(*) from campana_envio k
               where k.correduria_id = ${correduriaId}::uuid and k.campana = ${CAMPANA_PRESENTACION_APP}
                 and k.lote_fecha = ${loteFecha}::date) < ${topeDiario}::int
        on conflict do nothing`)
    })
    if (reservada !== 1) continue

    const bajaUrl = urlBajaCampana(baseUrl, envioId)
    const correo = correoPresentacionApp({ nombre: d.nombre, enlace: enlacePresentacion(ref), bajaUrl, variante })
    const r = await enviarEmailResend({
      from, to: d.email, asunto: correo.asunto, texto: correo.texto, html: correo.html,
      categoria: CAMPANA_PRESENTACION_APP, cabeceras: cabecerasBaja(bajaUrl),
    })
    if (r.ok) {
      enviados++
      await db.$executeRaw(Prisma.sql`
        update campana_envio set estado = 'enviado', resend_message_id = ${r.resendMessageId} where id = ${envioId}::uuid`)
    } else {
      fallidos++
      detalleFallos.push(r.motivo)
      await db.$executeRaw(Prisma.sql`
        update campana_envio set estado = 'fallido', error = ${r.motivo} where id = ${envioId}::uuid`)
      // Sin clave no saldrá ninguno: no se queman más reservas.
      if (r.motivo === 'sin_api_key') break
    }
    // Rastro en la ficha (no lanza): la pestaña de correos del cliente lo enseña con sus eventos.
    await registrarEnvioCorreo({
      correduriaId, clienteId: d.clienteId, tipo: CAMPANA_PRESENTACION_APP, asunto: correo.asunto, destino: d.email,
      resendId: r.ok ? r.resendMessageId : null, proveedor: 'resend_api', estado: r.ok ? 'enviado' : 'fallido',
      error: r.ok ? null : r.motivo,
    })
    if (r.ok) await anotar(correduriaId, d.clienteId, `Campaña «presentación de la app»: correo enviado (lote ${lote} del ${loteFecha}, variante ${variante})`)
  }
  return { ...base, enviados, fallidos, detalleFallos }
}

export type ResultadoBajaCampana = { estado: 'ok'; yaEstaba: boolean } | { estado: 'no_encontrado' } | { estado: 'error'; motivo: string }

/**
 * Baja de correo de la persona: la ficha del envío Y las demás fichas con el MISMO correo (índice ciego)
 * en esta correduría, porque la baja es de la persona, no de una ficha. Idempotente. La respetan esta
 * campaña y la recaptación (las dos filtran `email_opt_out_at`).
 */
async function bajaDeFicha(correduriaId: string, clienteId: string, texto: string): Promise<boolean> {
  const db = prismaAsegura()
  const n = await db.$executeRaw(Prisma.sql`
    update clientes set email_opt_out_at = now()
    where correduria_id = ${correduriaId}::uuid
      and email_opt_out_at is null
      and (id = ${clienteId}::uuid
        or (email_lookup_hash is not null
            and email_lookup_hash = (select email_lookup_hash from clientes where id = ${clienteId}::uuid)))`)
  if (n > 0) await anotar(correduriaId, clienteId, texto)
  return n === 0
}

/** Desde el enlace del correo o el One-Click de Gmail/Yahoo (`t` = `campana_envio.id`). */
export async function aplicarBajaCampana(envioId: string): Promise<ResultadoBajaCampana> {
  if (!aseguraConfigurada()) return { estado: 'error', motivo: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ clienteId: string; correduriaId: string }[]>(Prisma.sql`
      select cliente_id as "clienteId", correduria_id as "correduriaId" from campana_envio where id = ${envioId}::uuid limit 1`)
    const f = filas[0]
    if (!f) return { estado: 'no_encontrado' }
    await db.$executeRaw(Prisma.sql`update campana_envio set baja_en = now() where id = ${envioId}::uuid and baja_en is null`)
    const yaEstaba = await bajaDeFicha(f.correduriaId, f.clienteId, 'Campaña «presentación de la app»: baja de correo por el propio cliente (enlace del correo)')
    return { estado: 'ok', yaEstaba }
  } catch (e) {
    console.error('[presentacion-app] fallo aplicando la baja:', e instanceof Error ? e.message : e)
    return { estado: 'error', motivo: 'fallo_bd' }
  }
}

/**
 * Rebote o queja de spam de un correo de la campaña (webhook de Resend): baja automática, igual que
 * `aplicarBajaPorRebote` de la recaptación. `no_encontrado` también si la tabla aún no existe: el
 * webhook no puede romperse por esta campaña.
 */
export async function aplicarBajaCampanaPorRebote(resendMessageId: string, motivo: 'rebotado' | 'queja'): Promise<ResultadoBajaCampana> {
  if (!aseguraConfigurada()) return { estado: 'error', motivo: 'sin_configurar' }
  try {
    if (!(await campanaMigrada())) return { estado: 'no_encontrado' }
    const filas = await prismaAsegura().$queryRaw<{ clienteId: string; correduriaId: string }[]>(Prisma.sql`
      select cliente_id as "clienteId", correduria_id as "correduriaId" from campana_envio
      where resend_message_id = ${resendMessageId} limit 1`)
    const f = filas[0]
    if (!f) return { estado: 'no_encontrado' }
    const texto = motivo === 'rebotado'
      ? 'Campaña «presentación de la app»: correo RECHAZADO (dirección muerta) — baja automática de correo'
      : 'Campaña «presentación de la app»: el destinatario lo marcó como spam — baja automática de correo'
    const yaEstaba = await bajaDeFicha(f.correduriaId, f.clienteId, texto)
    return { estado: 'ok', yaEstaba }
  } catch (e) {
    console.error('[presentacion-app] fallo aplicando la baja por rebote:', e instanceof Error ? e.message : e)
    return { estado: 'error', motivo: 'fallo_bd' }
  }
}

/** Una persona de la campaña con su recorrido. Fechas ISO; `null` = no ha pasado (o no hay prueba). */
export type PersonaCampana = {
  clienteId: string
  nombre: string
  lote: number
  loteFecha: string
  variante: string
  etapa: EtapaPersona
  enviadoEn: string
  entregadoEn: string | null
  abiertoEn: string | null
  clicEn: string | null
  visitaEn: string | null
  registradoEn: string | null
  bajaEn: string | null
  rebotadoEn: string | null
}

export type EmbudoPresentacion =
  | { estado: 'sin_migracion' }
  | {
      estado: 'ok'
      campana: string
      total: EmbudoCampana
      /** Grupo = «<n.º de lote> · <fecha>». */
      porLote: { grupo: string; embudo: EmbudoCampana }[]
      porVariante: { grupo: string; embudo: EmbudoCampana }[]
      /** Las más recientes primero (máx. `LIMITE_PERSONAS`). */
      personas: PersonaCampana[]
    }

const LIMITE_PERSONAS = 1000

type FilaBD = {
  clienteId: string; nombre: string | null; apellidos: string | null; lote: number; loteFecha: string; variante: string
  estado: string; resendId: string | null; eventos: string[] | null; creadoEn: Date
  entregadoEn: Date | null; abiertoEn: Date | null; clicEn: Date | null; rebotadoEn: Date | null
  visitaEn: Date | null; registradoEn: Date | null; bajaEn: Date | null
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** El embudo de la campaña: total, por lote, por variante y por persona. Lanza si no puede leer. */
export async function embudoPresentacionApp(correduriaId: string): Promise<EmbudoPresentacion> {
  if (!(await campanaMigrada())) return { estado: 'sin_migracion' }
  const filas = await prismaAsegura().$queryRaw<FilaBD[]>(Prisma.sql`
    select k.cliente_id as "clienteId", c.nombre, c.apellidos, k.lote, to_char(k.lote_fecha, 'YYYY-MM-DD') as "loteFecha",
      k.variante, k.estado, k.resend_message_id as "resendId", k.creado_en as "creadoEn",
      ev.tipos as eventos, ev.entregado as "entregadoEn", ev.abierto as "abiertoEn", ev.clic as "clicEn", ev.rebote as "rebotadoEn",
      k.visita_en as "visitaEn", a.registrado_en as "registradoEn", k.baja_en as "bajaEn"
    from campana_envio k
    join clientes c on c.id = k.cliente_id
    left join portal_alta_origen a on a.envio_id = k.id
    left join lateral (
      select array_agg(distinct e.tipo) as tipos,
        min(e.ocurrido_en) filter (where e.tipo = 'email.delivered') as entregado,
        min(e.ocurrido_en) filter (where e.tipo = 'email.opened') as abierto,
        min(e.ocurrido_en) filter (where e.tipo = 'email.clicked') as clic,
        min(e.ocurrido_en) filter (where e.tipo in ('email.bounced', 'email.complained', 'email.suppressed')) as rebote
      from correo_evento e where e.resend_id = k.resend_message_id
    ) ev on true
    where k.correduria_id = ${correduriaId}::uuid and k.campana = ${CAMPANA_PRESENTACION_APP}
    order by k.creado_en desc`)
  const conEmbudo = filas.map((f) => {
    const fila: FilaEmbudo = {
      enviado: f.estado === 'enviado',
      // Sin id de Resend no puede haber eventos: «no se sabe». Con id y sin filas: aún no ha llegado ninguno.
      eventos: f.resendId === null ? null : (f.eventos ?? []),
      visita: f.visitaEn !== null,
      registrado: f.registradoEn !== null,
      baja: f.bajaEn !== null,
    }
    return { ...fila, f, lote: `${f.lote} · ${f.loteFecha}`, variante: f.variante }
  })
  return {
    estado: 'ok',
    campana: CAMPANA_PRESENTACION_APP,
    total: embudoCampana(conEmbudo),
    porLote: embudoPorGrupo(conEmbudo, (x) => x.lote),
    porVariante: embudoPorGrupo(conEmbudo, (x) => x.variante),
    personas: conEmbudo.slice(0, LIMITE_PERSONAS).map(({ f, ...fila }) => ({
      clienteId: f.clienteId,
      nombre: [f.nombre, f.apellidos].filter(Boolean).join(' ').trim(),
      lote: Number(f.lote),
      loteFecha: f.loteFecha,
      variante: f.variante,
      etapa: etapaPersona(fila),
      enviadoEn: f.creadoEn.toISOString(),
      entregadoEn: iso(f.entregadoEn),
      abiertoEn: iso(f.abiertoEn),
      clicEn: iso(f.clicEn),
      visitaEn: iso(f.visitaEn),
      registradoEn: iso(f.registradoEn),
      bajaEn: iso(f.bajaEn),
      rebotadoEn: iso(f.rebotadoEn),
    })),
  }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[presentacion-app] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
