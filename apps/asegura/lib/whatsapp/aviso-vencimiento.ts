// Aviso de vencimiento por WhatsApp — ORQUESTACIÓN (BD + envío + Telegram). Las reglas son puras en
// `aviso-vencimiento-reglas.ts`; el POST a Meta vive en `lib/whatsapp-salida/plantilla.ts` (los cepos de este
// directorio prohíben hablar con Meta). Apagado por defecto (`ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO='1'`).
//
// 🛡️ Toda sentencia filtra `correduria_id` (BYPASSRLS). Sin el SQL `2026-11-04_whatsapp_avisos.sql` → `sin_migracion`
// y NO se envía nada. El envío se RESERVA antes (clave única) y se sella después: nunca dos avisos del mismo vencimiento.
// El mensaje enviado se guarda en `mensajes` como saliente del bot (rol `bot`, texto cifrado) sin tocar
// `ultimo_mensaje_at`: no despierta el análisis de la IA.
// SQL sin prefijo de schema: la conexión ya trae `?schema=seguros`.

import { sqlCarteraEnVigor } from '@central/module-seguros'
import { decryptField, encryptField } from '@central/module-seguros-pii'
import { tgSend } from '@central/core-telegram'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import { enviarPlantilla, type ResultadoEnvio } from '../whatsapp-salida/plantilla'
import { versionGraph, type FetchLike } from './graph'
import { whatsappActivo } from './config'
import {
  avisoActivo,
  claveAviso,
  configAviso,
  hoyMadrid,
  movilParaMeta,
  parametrosPlantilla,
  rangoVentana,
  seleccionar,
  textoRenderizado,
  textoTelegramAviso,
  DIAS_ENTRE_AVISOS_CLIENTE,
  type Candidato,
  type ResumenAviso,
} from './aviso-vencimiento-reglas'

export { avisoVencimientoDisponible } from './aviso-vencimiento-reglas'

const LIMITE_CRIBA = 400
const faltaMigracion = (e: unknown) => esTablaAusente(e) || esColumnaAusente(e)

export type EstadoAviso = 'apagado' | 'sin_configurar' | 'sin_migracion' | 'sin_conexion' | 'ok'
export type SalidaAviso = { estado: EstadoAviso; motivo?: string; soloContar?: boolean; candidatas?: number; enviados?: number; fallidos?: number; enviaria?: number; omitidos?: Record<string, number> }

type FilaCandidato = {
  origen: 'poliza' | 'oportunidad'; id: string; cliente_id: string; conv_id: string; nombre: string | null; tipo: string; venc: string
  telefono_cifrado: string | null; candidatos: number | null; n_conv: number; opt_out: boolean; conv_estado: string; por_alberto: boolean
}

function abrir(v: string | null): string | null {
  if (!v) return null
  if (!v.startsWith('v1:')) return v
  try { return decryptField(v) } catch { return null }
}

async function leerCandidatos(correduriaId: string, hoyIso: string): Promise<Candidato[]> {
  const { desde, hasta } = rangoVentana(hoyIso)
  const db = prismaAsegura()
  // Bloque común: la conversación de WhatsApp de la ficha y lo que dice de ella.
  const filasPol = await db.$queryRaw<FilaCandidato[]>(Prisma.sql`
    select 'poliza' as origen, p.id::text as id, c.id::text as cliente_id, cv.id::text as conv_id,
           nullif(trim(c.nombre), '') as nombre, p.tipo::text as tipo, to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as venc,
           cv.wa_telefono_cifrado as telefono_cifrado, cv.clientes_candidatos as candidatos,
           (select count(*)::int from conversaciones x where x.cliente_id = c.id and x.correduria_id = ${correduriaId}::uuid and x.wa_telefono_hash is not null) as n_conv,
           (cv.wa_opt_out_at is not null or c.wa_opt_out_at is not null) as opt_out, cv.estado::text as conv_estado,
           exists (select 1 from mensajes m where m.conversacion_id = cv.id and m.direccion = 'saliente' and m.rol = 'corredor') as por_alberto
      from polizas p
      join clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
      join conversaciones cv on cv.cliente_id = c.id and cv.correduria_id = p.correduria_id and cv.wa_telefono_hash is not null
     where p.correduria_id = ${correduriaId}::uuid and ${Prisma.raw(sqlCarteraEnVigor('p'))}
       and p.merged_into_poliza_id is null and c.merged_into_cliente_id is null
       and p.fecha_vencimiento between ${desde}::date and ${hasta}::date
     order by p.fecha_vencimiento, p.id limit ${LIMITE_CRIBA}`)
  // Oportunidades abiertas con fecha propia. Las del volcado (import_ref) traen la fecha mal y las que cuelgan de una póliza
  // ya se avisan por la póliza (con recibos): ni unas ni otras.
  const filasOpo = await db.$queryRaw<FilaCandidato[]>(Prisma.sql`
    select 'oportunidad' as origen, o.id::text as id, c.id::text as cliente_id, cv.id::text as conv_id,
           nullif(trim(c.nombre), '') as nombre, o.tipo::text as tipo, to_char(o.fecha_fin_vigencia, 'YYYY-MM-DD') as venc,
           cv.wa_telefono_cifrado as telefono_cifrado, cv.clientes_candidatos as candidatos,
           (select count(*)::int from conversaciones x where x.cliente_id = c.id and x.correduria_id = ${correduriaId}::uuid and x.wa_telefono_hash is not null) as n_conv,
           (cv.wa_opt_out_at is not null or c.wa_opt_out_at is not null) as opt_out, cv.estado::text as conv_estado,
           exists (select 1 from mensajes m where m.conversacion_id = cv.id and m.direccion = 'saliente' and m.rol = 'corredor') as por_alberto
      from oportunidades o
      join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
      join conversaciones cv on cv.cliente_id = c.id and cv.correduria_id = o.correduria_id and cv.wa_telefono_hash is not null
     where o.correduria_id = ${correduriaId}::uuid and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
       and o.import_ref is null and o.poliza_id is null and c.merged_into_cliente_id is null -- import_ref de OPORTUNIDAD (lead del volcado)
       and o.fecha_fin_vigencia between ${desde}::date and ${hasta}::date
     order by o.fecha_fin_vigencia, o.id limit ${LIMITE_CRIBA}`)
  return [...filasPol, ...filasOpo]
    .filter((f) => f.venc)
    .map((f) => ({
      origen: f.origen, id: f.id, clienteId: f.cliente_id, conversacionId: f.conv_id, nombre: f.nombre, tipo: f.tipo, vencIso: f.venc,
      telefono: abrir(f.telefono_cifrado), candidatos: f.candidatos, conversacionesFicha: f.n_conv, optOut: f.opt_out,
      estadoConversacion: f.conv_estado, iniciadaPorAlberto: f.por_alberto,
    }))
}

/** Lo ya registrado: claves de los candidatos, clientes avisados hace poco y envíos de hoy (contando reservas). */
async function leerRegistro(correduriaId: string, claves: string[], hoyIso: string) {
  const db = prismaAsegura()
  const [ya, rec, dia] = await Promise.all([
    claves.length
      ? db.$queryRaw<{ clave: string }[]>(Prisma.sql`select clave from whatsapp_avisos_vencimiento where correduria_id = ${correduriaId}::uuid and clave = any(${claves}::text[])`)
      : Promise.resolve([] as { clave: string }[]),
    db.$queryRaw<{ cliente_id: string }[]>(Prisma.sql`
      select distinct cliente_id::text as cliente_id from whatsapp_avisos_vencimiento
       where correduria_id = ${correduriaId}::uuid and estado in ('reservado', 'enviado')
         and creada_at > now() - make_interval(days => ${DIAS_ENTRE_AVISOS_CLIENTE}::int)`),
    db.$queryRaw<{ n: number }[]>(Prisma.sql`
      select count(*)::int as n from whatsapp_avisos_vencimiento
       where correduria_id = ${correduriaId}::uuid and estado in ('reservado', 'enviado') and (creada_at at time zone 'Europe/Madrid')::date = ${hoyIso}::date`),
  ])
  return { yaAvisadas: new Set(ya.map((f) => f.clave)), clientesRecientes: new Set(rec.map((f) => f.cliente_id)), enviadosHoy: dia[0]?.n ?? 0 }
}

type Conexion = { estado: string | null; phoneNumberId: string | null; token: string | null }
async function leerConexionEnvio(correduriaId: string): Promise<Conexion> {
  const [f] = await prismaAsegura().$queryRaw<{ estado: string | null; phone: string | null; token: string | null }[]>(Prisma.sql`
    select wa_conexion_estado as estado, wa_phone_number_id as phone, wa_access_token as token from corredurias where id = ${correduriaId}::uuid`)
  // Un token en claro heredado del CRM antiguo NO se usa (solo `v1:` cifrado).
  return { estado: f?.estado ?? null, phoneNumberId: f?.phone ?? null, token: f?.token?.startsWith('v1:') ? abrir(f.token) : null }
}

async function telegram(texto: string) {
  try { await tgSend(texto, { html: true }) } catch { /* el aviso es informativo: no tumba el cron */ }
}

export type OpcionesAviso = { forzarContar?: boolean; hoyIso?: string; env?: Record<string, string | undefined>; fetch?: FetchLike }

export async function ejecutarAvisoVencimiento(correduriaId: string, op: OpcionesAviso = {}): Promise<SalidaAviso> {
  const env = op.env ?? process.env
  if (!avisoActivo(env)) return { estado: 'apagado' }
  const cfg = configAviso(env)
  if (!cfg) return { estado: 'sin_configurar', motivo: 'falta o es inválida WHATSAPP_PLANTILLA_VENCIMIENTO (o su idioma/tope)' }
  if (!whatsappActivo(env)) return { estado: 'apagado', motivo: 'ASEGURA_WHATSAPP_ACTIVO no es 1' }
  const version = versionGraph(env)
  if (version === null) return { estado: 'sin_configurar', motivo: 'WHATSAPP_GRAPH_API_VERSION mal formada' }
  const soloContar = op.forzarContar === true
  const hoyIso = op.hoyIso ?? hoyMadrid()
  const db = prismaAsegura()

  let candidatos: Candidato[]
  let registro: Awaited<ReturnType<typeof leerRegistro>>
  try {
    candidatos = await leerCandidatos(correduriaId, hoyIso)
    registro = await leerRegistro(correduriaId, candidatos.map((c) => claveAviso(c.origen, c.id, c.vencIso)), hoyIso)
  } catch (e) {
    if (faltaMigracion(e)) return { estado: 'sin_migracion', motivo: 'falta prisma/sql/2026-11-04_whatsapp_avisos.sql' }
    throw e
  }
  const sel = seleccionar(candidatos, { hoyIso, yaAvisadas: registro.yaAvisadas, clientesRecientes: registro.clientesRecientes, restanteHoy: Math.max(0, cfg.tope - registro.enviadosHoy) })

  const resumen: ResumenAviso = { hoyIso, soloContar, candidatas: candidatos.length, enviados: [], fallidos: 0, omitidos: sel.omitidos }
  // Ensayo: `enviados` = 0 y `enviaria` dice cuántos saldrían (ni envío, ni reserva, ni Telegram).
  if (soloContar) return { estado: 'ok', soloContar, candidatas: candidatos.length, enviados: 0, fallidos: 0, enviaria: sel.enviar.length, omitidos: sel.omitidos }
  if (sel.enviar.length === 0) return { estado: 'ok', soloContar, candidatas: candidatos.length, enviados: 0, fallidos: 0, omitidos: sel.omitidos }

  const con = await leerConexionEnvio(correduriaId)
  if (con.estado !== 'conectada' || !con.phoneNumberId || !con.token) {
    return { estado: 'sin_conexion', motivo: con.token ? 'el número no está conectado' : 'sin token de negocio cifrado utilizable (reconectar)' }
  }

  for (const c of sel.enviar) {
    const clave = claveAviso(c.origen, c.id, c.vencIso)
    const to = movilParaMeta(c.telefono)
    if (!to) continue
    // 1. RESERVA (clave única): si otra ejecución ya la tiene, no hay fila y se salta.
    const reservada = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into whatsapp_avisos_vencimiento (correduria_id, cliente_id, conversacion_id, origen, poliza_id, oportunidad_id, vencimiento, clave, plantilla)
      values (${correduriaId}::uuid, ${c.clienteId}::uuid, ${c.conversacionId}::uuid, ${c.origen},
              ${c.origen === 'poliza' ? c.id : null}::uuid, ${c.origen === 'oportunidad' ? c.id : null}::uuid, ${c.vencIso}::date, ${clave}, ${cfg.plantilla})
      on conflict (correduria_id, clave) do nothing
      returning id::text as id`)
    const avisoId = reservada[0]?.id
    if (!avisoId) { sel.omitidos.ya_avisada = (sel.omitidos.ya_avisada ?? 0) + 1; continue }

    const params = parametrosPlantilla({ nombre: c.nombre, tipo: c.tipo, vencIso: c.vencIso })
    // 2. ENVÍO (un solo intento: un fallo ambiguo pudo salir; no se reintenta).
    const r: ResultadoEnvio = await enviarPlantilla({
      version, phoneNumberId: con.phoneNumberId, token: con.token, to, plantilla: cfg.plantilla, idioma: cfg.idioma, parametros: params, fetch: op.fetch,
    })
    if (!r.ok) {
      resumen.fallidos++
      await db.$executeRaw(Prisma.sql`
        update whatsapp_avisos_vencimiento set estado = 'fallido', error = ${`http ${r.http} código ${r.codigo ?? '-'}: ${r.mensaje}`.slice(0, 300)}
         where id = ${avisoId}::uuid and correduria_id = ${correduriaId}::uuid`)
      continue
    }
    // 3. SELLO + mensaje saliente de la IA (cifrado). Si guardar el mensaje falla, el aviso queda sellado igualmente.
    let mensajeId: string | null = null
    try {
      const [m] = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into mensajes (conversacion_id, rol, contenido, wa_message_id, metadata, direccion, tipo, enviado_at, estado)
        values (${c.conversacionId}::uuid, 'bot', ${encryptField(textoRenderizado(params))}, ${r.wamid},
                ${JSON.stringify({ canal: 'whatsapp', origen: 'ia_aviso_vencimiento', plantilla: cfg.plantilla })}::jsonb, 'saliente', 'template', now(), 'enviado')
        on conflict (conversacion_id, wa_message_id) where direccion is not null and wa_message_id is not null do nothing
        returning id::text as id`)
      mensajeId = m?.id ?? null
    } catch (e) {
      console.error('[whatsapp-aviso] mensaje no guardado:', e instanceof Error ? e.name : 'error')
    }
    await db.$executeRaw(Prisma.sql`
      update whatsapp_avisos_vencimiento set estado = 'enviado', enviada_at = now(), wamid = ${r.wamid}, mensaje_id = ${mensajeId}::uuid
       where id = ${avisoId}::uuid and correduria_id = ${correduriaId}::uuid`)
    resumen.enviados.push({ nombre: c.nombre, tipo: c.tipo, vencIso: c.vencIso })
  }

  if (resumen.enviados.length > 0 || resumen.fallidos > 0) await telegram(textoTelegramAviso(resumen))
  return { estado: 'ok', soloContar, candidatas: candidatos.length, enviados: resumen.enviados.length, fallidos: resumen.fallidos, omitidos: sel.omitidos }
}
