// «Avísame antes de que venza» de la web pública: la parte de BD y correo. Las reglas (plazos,
// validación, textos) están en `aviso-web-reglas.ts`, que es lo que se testea.
//
// Flujo (decidido por Alberto el 24/09/2026: todo en asegura, ficha al CONFIRMAR):
//   1. `solicitarAviso`  — la web (vía plataforma) deja nombre, correo, ramo y vencimiento. Se
//      guarda una fila SIN ficha y sale el correo de confirmación.
//   2. `confirmarAviso`  — el enlace del correo. Crea la ficha como lead (o usa la que ya tiene ese
//      correo) y una oportunidad con el vencimiento del ciclo.
//   3. `pasadaAvisosWeb` — el cron diario: aviso a 70 y 45 días con acceso directo al portal.
//   4. `bajaAviso`       — el enlace de baja de cada aviso.
//
// 🚨 Nada sale sin `ASEGURA_AVISOS_WEB_ACTIVOS=1`: sin esa env, la solicitud responde
// `desactivado` sin guardar nada y la pasada solo cuenta. Encenderla es decisión de Alberto.
// Ningún dato personal pasa por `console.*`.

import { computeEmailLookupHash, decryptField, encryptField } from '@central/module-seguros-pii'
import { generarTokenEnlace, hashTokenEnlace, tokenEnlaceValido } from '@central/module-seguros-portal'
import { remitenteCorreo } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { altaCliente } from './cartera-edicion'
import { crearEnlaceDirecto } from './avisos-intranet'
import { enlacePortal } from './avisos-intranet-reglas'
import { Prisma } from './generated/asegura-client'
import {
  CONSENTIMIENTO_VERSION,
  HORAS_CONFIRMACION,
  DIAS_PURGA_SIN_CONFIRMAR,
  MAX_SOLICITUDES_DIA,
  MAX_SOLICITUDES_HORA,
  avisoQueToca,
  avisosWebActivos,
  cuerpoAviso,
  cuerpoConfirmacion,
  enlaceWeb,
  nombreDelSeguro,
  parsearFecha,
  revisarSolicitud,
  urlWeb,
  vencimientoDelCiclo,
  type CuerpoCorreo,
} from './aviso-web-reglas'

/** Marca de origen en `oportunidades.info_riesgo`. */
export const ORIGEN_AVISO_WEB = 'web:aviso-vencimiento'

type Envio = 'enviado' | 'sin_proveedor' | 'rechazado'

async function enviar(destino: string, c: CuerpoCorreo): Promise<Envio> {
  // Import dinámico, como en `correo-avisos-intranet.ts`: `node --test` no resuelve `@central/core-email`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return 'sin_proveedor'
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  try {
    await transporter.sendMail({
      from: remitenteCorreo(process.env.ASEGURA_MAIL_FROM),
      to: destino,
      ...(replyTo ? { replyTo } : {}),
      subject: c.asunto,
      text: c.texto,
      html: c.html,
    })
    return 'enviado'
  } catch (e) {
    // Solo el código: el mensaje de un SMTP suele traer la dirección rechazada («550 <x@y> …»).
    const c = e as { code?: unknown; responseCode?: unknown }
    console.error('[aviso-web] fallo enviando:', String(c?.responseCode ?? c?.code ?? 'sin_codigo'))
    return 'rechazado'
  }
}

// ─── 1. Solicitar ───────────────────────────────────────────────────────────

export type ResultadoSolicitud =
  | { estado: 'ok' }
  | { estado: 'invalido'; motivo: string; campo: string }
  | { estado: 'desactivado' }
  | { estado: 'sin_envio' }
  /** Se ha superado el tope global por hora: no se envía nada y plataforma avisa a Alberto. */
  | { estado: 'saturado' }

/**
 * Responde `ok` también cuando se ha llegado al tope de solicitudes de ese correo: no se le dice a
 * quien rellena el formulario si ese buzón ya estaba apuntado ni cuántas veces.
 */
export async function solicitarAviso(correduriaId: string, body: unknown): Promise<ResultadoSolicitud> {
  if (!avisosWebActivos()) return { estado: 'desactivado' }
  const r = revisarSolicitud(body)
  if (!r.ok) return { estado: 'invalido', motivo: r.motivo, campo: r.campo }
  const s = r.solicitud
  const hash = computeEmailLookupHash(s.email)
  if (!hash) throw new Error('sin_clave_pii')
  const db = prismaAsegura()

  const [{ n }] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    select count(*)::int as n from aviso_web
    where email_lookup_hash = ${hash} and creado_en > now() - interval '24 hours'`)
  if (n >= MAX_SOLICITUDES_DIA) return { estado: 'ok' }
  const [{ h }] = await db.$queryRaw<{ h: number }[]>(Prisma.sql`
    select count(*)::int as h from aviso_web where creado_en > now() - interval '1 hour'`)
  if (h >= MAX_SOLICITUDES_HORA) return { estado: 'saturado' }

  const tokenConfirmar = generarTokenEnlace()
  const tokenBaja = generarTokenEnlace()
  await db.$executeRaw(Prisma.sql`
    insert into aviso_web (correduria_id, nombre, email, email_lookup_hash, ramo, ramo_web, vence,
      consentimiento_version, token_confirmacion_hash, confirmacion_expira_en, token_baja, token_baja_hash)
    values (${correduriaId}::uuid, ${s.nombre}, ${encryptField(s.email)}, ${hash}, cast(${s.ramo} as tipo_seguro),
      ${s.ramoWeb}, ${s.vence}::date, ${CONSENTIMIENTO_VERSION}, ${await hashTokenEnlace(tokenConfirmar)},
      now() + make_interval(hours => ${HORAS_CONFIRMACION}::int), ${encryptField(tokenBaja)}, ${await hashTokenEnlace(tokenBaja)})`)

  const envio = await enviar(
    s.email,
    cuerpoConfirmacion({
      nombre: s.nombre,
      ramo: nombreDelSeguro(s.ramo, s.ramoWeb),
      vence: parsearFecha(s.vence)!,
      enlaceConfirmar: enlaceWeb(urlWeb(), '/aviso/confirmar', tokenConfirmar),
    }),
  )
  return envio === 'enviado' ? { estado: 'ok' } : { estado: 'sin_envio' }
}

// ─── 2. Confirmar ───────────────────────────────────────────────────────────

export type ResultadoConfirmacion =
  | {
      estado: 'ok'
      yaEstaba: boolean
      /** Datos para el aviso de Telegram a Alberto (el correo NO viaja). */
      ficha: { id: string; nueva: boolean; nombre: string; varias: boolean }
      ramo: string
      /** Cómo se llama el seguro para una persona («hogar», o lo que escribió en «Otro»). */
      seguro: string
      vence: string
    }
  | { estado: 'no_valido' }
  | { estado: 'desactivado' }

type FilaAviso = {
  id: string
  nombre: string
  email: string
  ramo: string
  ramoWeb: string
  vence: Date
  confirmadoEn: Date | null
  clienteId: string | null
  caducada: boolean
  baja: boolean
}

export async function confirmarAviso(correduriaId: string, token: unknown): Promise<ResultadoConfirmacion> {
  // Apagado de urgencia: tampoco se crean fichas ni oportunidades de las confirmaciones pendientes.
  if (!avisosWebActivos()) return { estado: 'desactivado' }
  if (!tokenEnlaceValido(token)) return { estado: 'no_valido' }
  const db = prismaAsegura()
  const [f] = await db.$queryRaw<FilaAviso[]>(Prisma.sql`
    select id, nombre, email, ramo::text as ramo, ramo_web as "ramoWeb", vence, confirmado_en as "confirmadoEn", cliente_id as "clienteId",
           confirmacion_expira_en < now() as caducada, baja_en is not null as baja
    from aviso_web
    where correduria_id = ${correduriaId}::uuid and token_confirmacion_hash = ${await hashTokenEnlace(token)}`)
  if (!f || f.baja) return { estado: 'no_valido' }
  const vence = f.vence.toISOString().slice(0, 10)
  const seguro = nombreDelSeguro(f.ramo, f.ramoWeb)
  if (f.confirmadoEn && f.clienteId) {
    return { estado: 'ok', yaEstaba: true, ficha: { id: f.clienteId, nueva: false, nombre: f.nombre, varias: false }, ramo: f.ramo, seguro, vence }
  }
  if (f.caducada) return { estado: 'no_valido' }

  const email = decryptField(f.email)
  if (!email) throw new Error('aviso_web_email_ilegible')

  // Ficha: nueva como lead, o la que ya tiene ese correo. Con varias, la primera — y se avisa.
  // ⚠️ `altaCliente` abre su propia transacción, así que va FUERA de la de abajo: si esa fallara,
  // queda un lead sin oportunidad. El reintento del mismo enlace lo recupera (la ficha se encuentra
  // por el correo) y la respuesta de error pide reintentar; no se deja silencioso.
  let ficha: { id: string; nueva: boolean; nombre: string; varias: boolean }
  const alta = await altaCliente(
    correduriaId,
    { nombre: f.nombre, email, fuente: 'web', notas: `Pidió en la web el aviso de vencimiento de su seguro de ${seguro} (${vence}).` },
    'web',
  )
  if (alta.ok) {
    ficha = { id: alta.id, nueva: true, nombre: f.nombre, varias: false }
  } else if (alta.estado === 'conflicto' && alta.coincidencias && alta.coincidencias.length > 0) {
    const ids = [...new Set(alta.coincidencias.map((c) => c.id))]
    const c = alta.coincidencias[0]!
    ficha = { id: c.id, nueva: false, nombre: c.nombre, varias: ids.length > 1 }
  } else {
    throw new Error(`aviso_web_sin_ficha:${alta.estado}`)
  }

  const ciclo = vencimientoDelCiclo(f.vence, new Date()).toISOString().slice(0, 10)
  const yaEstaba = await db.$transaction(async (tx) => {
    // El bloqueo evita que dos clics en el mismo enlace creen dos oportunidades.
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`${ORIGEN_AVISO_WEB}:${f.id}`}))`)
    const [otra] = await tx.$queryRaw<{ c: Date | null }[]>(Prisma.sql`select confirmado_en as c from aviso_web where id = ${f.id}::uuid`)
    if (otra?.c) return true
    const info = JSON.stringify({ origen: ORIGEN_AVISO_WEB, avisoId: f.id, seguro })
    const [o] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into oportunidades (correduria_id, cliente_id, tipo, fuente, estado, fecha_fin_vigencia, info_riesgo)
      values (${correduriaId}::uuid, ${ficha.id}::uuid, cast(${f.ramo} as tipo_seguro), 'web', 'pendiente_cliente',
              ${ciclo}::date, ${info}::jsonb)
      returning id`)
    await tx.$executeRaw(Prisma.sql`
      update aviso_web set confirmado_en = now(), cliente_id = ${ficha.id}::uuid, oportunidad_id = ${o!.id}::uuid
      where id = ${f.id}::uuid`)
    // Una suscripción viva por correo y ramo: si ya había otra confirmada, esta la sustituye. Si no,
    // le llegarían dos avisos de lo mismo y la baja de uno dejaría el otro vivo. En «otros» cada
    // seguro escrito es uno distinto (patinete ≠ mascota): ahí manda `ramo_web`.
    await tx.$executeRaw(Prisma.sql`
      update aviso_web set baja_en = now()
      where correduria_id = ${correduriaId}::uuid and id <> ${f.id}::uuid and ramo = cast(${f.ramo} as tipo_seguro)
        and (ramo <> 'otros' or ramo_web = ${f.ramoWeb})
        and email_lookup_hash = (select email_lookup_hash from aviso_web where id = ${f.id}::uuid)
        and confirmado_en is not null and baja_en is null`)
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${ficha.id}::uuid, cast('contacto' as tipo_historial_interno),
              ${`Confirmó en la web el aviso de vencimiento: seguro de ${seguro}, vence el ${ciclo}. Le escribiremos a 70 y 45 días.`})`)
    return false
  })
  return { estado: 'ok', yaEstaba, ficha, ramo: f.ramo, seguro, vence: ciclo }
}

// ─── 3. Baja ────────────────────────────────────────────────────────────────

/** Siempre «ok» hacia fuera: no se revela si la llave existía. */
export async function bajaAviso(correduriaId: string, token: unknown): Promise<{ estado: 'ok' }> {
  if (!tokenEnlaceValido(token)) return { estado: 'ok' }
  // La baja es por CORREO, no por fila: quien pulsa «no quiero más avisos» no los quiere de ningún
  // ramo (art. 22.1 LSSI). Se busca la fila por su llave y se dan de baja todas las de esa dirección.
  await prismaAsegura().$executeRaw(Prisma.sql`
    update aviso_web set baja_en = now()
    where correduria_id = ${correduriaId}::uuid and baja_en is null
      and email_lookup_hash = (
        select email_lookup_hash from aviso_web
        where correduria_id = ${correduriaId}::uuid and token_baja_hash = ${await hashTokenEnlace(token)})`)
  return { estado: 'ok' }
}

// ─── 4. Pasada diaria ───────────────────────────────────────────────────────

export type ResumenAvisosWeb = {
  soloContar: boolean
  suscritos: number
  aviso1: number
  aviso2: number
  enviados: number
  fallidos: number
  /** Solicitudes sin confirmar borradas en esta pasada. */
  purgadas: number
}

type Suscrito = {
  id: string
  nombre: string
  email: string
  ramo: string
  ramoWeb: string
  vence: Date
  clienteId: string
  tokenBaja: string
  aviso1Para: string | null
  aviso2Para: string | null
}

/** Lanza si falta el portal o el correo: «no he podido» no puede leerse como «hoy no tocaba nadie». */
export async function pasadaAvisosWeb(correduriaId: string, opciones: { hoy?: Date; forzarContar?: boolean } = {}): Promise<ResumenAvisosWeb> {
  const hoy = opciones.hoy ?? new Date()
  const soloContar = opciones.forzarContar === true || !avisosWebActivos()
  const portal = enlacePortal()
  if (!portal) throw new Error('sin_portal')
  const db = prismaAsegura()
  const filas = await db.$queryRaw<Suscrito[]>(Prisma.sql`
    select a.id, a.nombre, a.email, a.ramo::text as ramo, a.ramo_web as "ramoWeb", a.vence, a.cliente_id as "clienteId", a.token_baja as "tokenBaja",
           to_char(a.aviso1_para, 'YYYY-MM-DD') as "aviso1Para", to_char(a.aviso2_para, 'YYYY-MM-DD') as "aviso2Para"
    from aviso_web a
    join clientes c on c.id = a.cliente_id
    where a.correduria_id = ${correduriaId}::uuid and a.confirmado_en is not null and a.baja_en is null
      and c.email_opt_out_at is null`)

  const r: ResumenAvisosWeb = { soloContar, suscritos: filas.length, aviso1: 0, aviso2: 0, enviados: 0, fallidos: 0, purgadas: 0 }
  // Lo que la web promete: una solicitud sin confirmar no se guarda. Se borra pasado el margen.
  if (!soloContar) {
    r.purgadas = await db.$executeRaw(Prisma.sql`
      delete from aviso_web
      where correduria_id = ${correduriaId}::uuid and confirmado_en is null
        and confirmacion_expira_en < now() - make_interval(days => ${DIAS_PURGA_SIN_CONFIRMAR}::int)`)
  }
  for (const f of filas) {
    const toca = avisoQueToca({ vence: f.vence, hoy, aviso1Para: f.aviso1Para, aviso2Para: f.aviso2Para })
    if (!toca) continue
    r[toca.tipo]++
    if (soloContar) continue
    const email = decryptField(f.email)
    const tokenBaja = decryptField(f.tokenBaja)
    const hash = email ? computeEmailLookupHash(email) : null
    if (!email || !tokenBaja || !hash) {
      r.fallidos++
      continue
    }
    // Si el cliente ya tiene una llave viva (p. ej. la del correo de la intranet de hoy), no se crea
    // otra: `crearEnlaceDirecto` borraría la anterior y dejaría muerto el enlace que ya le llegó.
    const viva = await db.portalEnlaceDirecto.count({ where: { correduriaId, clienteId: f.clienteId, usadoEn: null, expiraEn: { gt: new Date() } } })
    const { enlace, directo } = viva > 0 ? { enlace: portal, directo: false } : await crearEnlaceDirecto(correduriaId, f.clienteId, email, hash, '/boveda', portal)
    const envio = await enviar(
      email,
      cuerpoAviso({
        tipo: toca.tipo,
        nombre: f.nombre,
        ramo: nombreDelSeguro(f.ramo, f.ramoWeb),
        vence: parsearFecha(toca.para)!,
        hoy,
        enlacePortal: enlace,
        directo,
        enlaceBaja: enlaceWeb(urlWeb(), '/aviso/baja', tokenBaja),
      }),
    )
    if (envio === 'sin_proveedor') throw new Error('sin_correo_configurado')
    if (envio !== 'enviado') {
      r.fallidos++
      continue
    }
    // Se sella DESPUÉS de enviar: si el sello falla, mañana se repite (mejor un duplicado que un silencio).
    const columna = toca.tipo === 'aviso1' ? Prisma.sql`aviso1_para` : Prisma.sql`aviso2_para`
    await db.$executeRaw(Prisma.sql`update aviso_web set ${columna} = ${toca.para}::date where id = ${f.id}::uuid`)
    r.enviados++
  }
  return r
}
