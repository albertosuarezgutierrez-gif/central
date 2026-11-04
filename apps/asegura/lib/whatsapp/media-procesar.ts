// Media que manda un cliente por WhatsApp → `documentos` → (si es una póliza) oportunidad (spec 2026-11-04 §6, §7).
//
// Lo llama SOLO el cron `whatsapp-analizar` (no el `after()` del webhook). Solo trabaja con mensajes
// encolados (`mensajes.media_estado = 'pendiente'`), que `procesar.ts` solo encola con UNA ficha exacta y sin opt-out;
// aquí se REPITE la comprobación (la conversación pudo cambiar entre medias).
//
//   1. Descarga (solo GET, `media.ts`) con el token de la correduría (cifrado; uno en claro heredado NO se usa).
//   2. Archivo en `documentos` (mismo almacén que el resto; `subido_por = 'cliente'`, nota «WhatsApp»).
//   3. Lectura con `oportunidadDesdeFichero` (IA de visión, tope `ASEGURA_WHATSAPP_POLIZAS_MAX_DIA` y solo con
//      ASEGURA_WHATSAPP_IA_ACTIVO=1). Guarda previa: si el DNI del tomador leído está en OTRA ficha distinta de la de la
//      conversación → `revisar` + Telegram, sin mover nada. No es una póliza → nota «documento recibido» y nada más.
// Nunca lanza hacia el procesado; sin el SQL 2026-11-04 devuelve `sin_migracion`.
//
// 🚫 Los bots RPA NO se lanzan desde aquí (D2: siempre con el botón 🤖 de Alberto).

import { computeDniLookupHash, decryptField, normalizeDniForHash } from '@central/module-seguros-pii'
import { tgSend } from '@central/core-telegram'
import { Prisma } from '../generated/asegura-client'
import { prismaAsegura } from '../asegura-db'
import { esColumnaAusente, esTablaAusente } from '../pg-error'
import { guardarDocumento } from '../cartera-documentos'
import { oportunidadDesdeFichero, type ResultadoOportunidadDocumento } from '../oportunidad-documento'
import { enlaceFichaCliente } from '../datos-cotizados'
import type { ResultadoLecturaPoliza } from '../documentos/extraer-poliza'
import { versionGraph } from './graph'
import { iaWhatsappActiva } from './config'
import { crearClienteMedia, decidirDniLeido, maxPolizasDia, type FetchLike } from './media'
import { ACTOR_IA } from './ejecutor'

export type ResumenMedia = { estado: 'ok' | 'sin_migracion' | 'sin_token'; descargados: number; descartados: number; errores: number; leidos: number }

type FilaMedia = { id: string; media: unknown; cliente_id: string | null; candidatos: number | null; opt_out: boolean; personal: boolean; reintento: boolean }

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif' }

export async function procesarMediaPendiente(correduriaId: string, opciones: { limite?: number; fetch?: FetchLike } = {}): Promise<ResumenMedia> {
  const r: ResumenMedia = { estado: 'ok', descargados: 0, descartados: 0, errores: 0, leidos: 0 }
  const db = prismaAsegura()
  let filas: FilaMedia[]
  try {
    filas = await db.$queryRaw<FilaMedia[]>(Prisma.sql`
      select m.id::text as id, m.metadata->'media' as media, c.cliente_id::text as cliente_id, c.clientes_candidatos as candidatos,
             (c.wa_opt_out_at is not null or coalesce(cl.wa_opt_out_at is not null, false)) as opt_out,
             (c.estado = 'descartada_personal') as personal, (m.media_estado = 'descargado') as reintento
        from mensajes m
        join conversaciones c on c.id = m.conversacion_id and c.correduria_id = ${correduriaId}::uuid
        left join clientes cl on cl.id = c.cliente_id and cl.correduria_id = ${correduriaId}::uuid
        left join documentos d on d.id = m.media_documento_id and d.correduria_id = ${correduriaId}::uuid
       where m.direccion = 'entrante'
         and (m.media_estado = 'pendiente'
              -- Reintento: descargado y archivado pero SIN lectura (cayó antes de leer, o sin cupo/IA). Solo con la IA
              -- activa y durante 2 días (tope de intentos: el cron corre cada 15 min), para no repetir descargas sin fin.
              or (${iaWhatsappActiva()} and m.media_estado = 'descargado' and d.id is not null and d.extraccion is null
                  and d.tipo = 'otro' and m.enviado_at > now() - interval '2 days'))
       order by (m.media_estado = 'pendiente') desc, m.enviado_at asc
       limit ${opciones.limite ?? 5}`)
  } catch (e) {
    if (esTablaAusente(e) || esColumnaAusente(e)) return { ...r, estado: 'sin_migracion' }
    throw e
  }
  if (filas.length === 0) return r

  const marcar = (id: string, estado: 'descargado' | 'descartado' | 'error', documentoId: string | null = null) =>
    db.$executeRaw(Prisma.sql`
      update mensajes set media_estado = ${estado}, media_documento_id = coalesce(${documentoId}::uuid, media_documento_id)
       where id = ${id}::uuid and media_estado in ('pendiente', 'descargado')
         and exists (select 1 from conversaciones c where c.id = mensajes.conversacion_id and c.correduria_id = ${correduriaId}::uuid)`)

  const token = await tokenCorreduria(correduriaId)
  const version = versionGraph()
  if (token === null || version === null) return { ...r, estado: 'sin_token' }
  const cliente = crearClienteMedia({ version, fetch: opciones.fetch })
  let cupo = Math.max(0, maxPolizasDia() - (await leidasHoy(correduriaId)))

  for (const f of filas) {
    const media = f.media && typeof f.media === 'object' ? (f.media as { id?: unknown }) : null
    // Una ficha exacta o nada; opt-out o personal → no se descarga.
    if (!f.cliente_id || f.candidatos !== 1 || f.opt_out || f.personal || typeof media?.id !== 'string') {
      await marcar(f.id, 'descartado')
      r.descartados++
      continue
    }
    try {
      const d = await cliente.descargar(media.id, token)
      if (!d.ok) {
        // Mime fuera de lista o demasiado grande: no se reintenta. Red/HTTP: error (consta, no se reintenta a ciegas).
        await marcar(f.id, d.motivo === 'mime_no_admitido' || d.motivo === 'demasiado_grande' || d.motivo === 'url_no_meta' ? 'descartado' : 'error')
        if (d.motivo === 'mime_no_admitido' || d.motivo === 'demasiado_grande' || d.motivo === 'url_no_meta') r.descartados++
        else r.errores++
        continue
      }
      const nombre = `whatsapp-${f.id.slice(0, 8)}.${EXT[d.mime] ?? 'bin'}`
      const g = await guardarDocumento(correduriaId, {
        clienteId: f.cliente_id,
        tipo: 'otro',
        nombre,
        mime: d.mime,
        contenido: d.contenido,
        notas: 'Recibido por WhatsApp',
        subidoPor: 'cliente',
        reutilizarSiIdentico: true,
      })
      if (!g.ok) {
        await marcar(f.id, g.status === 415 ? 'descartado' : 'error')
        if (g.status === 415) r.descartados++
        else r.errores++
        continue
      }
      await marcar(f.id, 'descargado', g.documento.id)
      if (!f.reintento) r.descargados++
      if ((g.repetido && !f.reintento) || cupo <= 0 || !iaWhatsappActiva()) continue
      cupo--
      const lectura = await oportunidadDesdeFichero({
        correduriaId,
        clienteSube: f.cliente_id,
        origen: 'whatsapp',
        actor: ACTOR_IA,
        documentoId: g.documento.id,
        fichero: { contenido: d.contenido, mime: d.mime, nombre },
        antesDeActuar: (l) => guardaDniDeOtraFicha(correduriaId, f.cliente_id as string, l),
      })
      r.leidos++
      await trasLectura(correduriaId, f.cliente_id, g.documento.id, lectura)
    } catch (e) {
      console.error('[whatsapp] media no procesado:', e instanceof Error ? e.name : 'error')
      await marcar(f.id, 'error').catch(() => {})
      r.errores++
    }
  }
  return r
}

async function tokenCorreduria(correduriaId: string): Promise<string | null> {
  const [c] = await prismaAsegura().$queryRaw<{ token: string | null }[]>(Prisma.sql`
    select wa_access_token as token from corredurias where id = ${correduriaId}::uuid`)
  // Solo el cifrado (`v1:`): un token en claro heredado no se usa.
  if (!c?.token || !c.token.startsWith('v1:')) return null
  try {
    return decryptField(c.token)
  } catch {
    return null
  }
}

/** Documentos de WhatsApp LEÍDOS hoy (Madrid): solo los que ya tienen `extraccion`. */
async function leidasHoy(correduriaId: string): Promise<number> {
  const [f] = await prismaAsegura().$queryRaw<{ n: number }[]>(Prisma.sql`
    select count(*)::int as n from documentos
     where correduria_id = ${correduriaId}::uuid and subido_por = 'cliente' and notas = 'Recibido por WhatsApp'
       and extraccion is not null
       and created_at >= (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid')`)
  return f?.n ?? 0
}

/**
 * §7: si el DNI del tomador LEÍDO está en una ficha viva que NO es la de la conversación → `revisar` y Telegram; nada
 * se crea ni se mueve. Sin DNI leído → sigue (lo decide `oportunidadDesdeLectura` con la ficha que sube). DNI leído
 * pero sin clave de índice ciego → no se puede comprobar: `revisar` (estado conservador).
 */
export async function guardaDniDeOtraFicha(correduriaId: string, clienteConversacion: string, l: ResultadoLecturaPoliza): Promise<ResultadoOportunidadDocumento | null> {
  if (l.fase === 'ninguno') return null
  const dniLeido = (l.datos as unknown as Record<string, unknown>).dni
  if (typeof dniLeido !== 'string' || normalizeDniForHash(dniLeido) === null) return null
  // En producción sin clave lanza (lo recoge `oportunidadDesdeFichero` como error: nada se mueve); sin clave en dev → null.
  const hash = computeDniLookupHash(dniLeido)
  const fichas = hash === null
    ? null
    : (await prismaAsegura().$queryRaw<{ id: string }[]>(Prisma.sql`
        select id::text as id from clientes
         where correduria_id = ${correduriaId}::uuid and dni_lookup_hash = ${hash} and merged_into_cliente_id is null`)).map((x) => x.id)
  const decision = decidirDniLeido(clienteConversacion, fichas)
  if (decision === 'seguir') return null
  const avisado = (await tgSend(
    `⚠️ <b>WhatsApp</b>: la póliza que ha mandado un cliente es de OTRA persona de la cartera (o no se pudo comprobar). No se ha movido nada: revísala en su <a href="${enlaceFichaCliente(clienteConversacion)}">ficha</a>.`,
    { html: true },
  )) !== null
  return { estado: 'revisar', motivo: 'ficha_ambigua', candidatas: fichas ?? [], avisado }
}

async function trasLectura(correduriaId: string, clienteId: string, documentoId: string, r: ResultadoOportunidadDocumento): Promise<void> {
  const db = prismaAsegura()
  if (r.estado === 'creada' || r.estado === 'actualizada' || r.estado === 'ya_nuestra') {
    await db.$executeRaw(Prisma.sql`
      update documentos set tipo = 'poliza' where id = ${documentoId}::uuid and correduria_id = ${correduriaId}::uuid`)
  }
  if (r.estado === 'no_es_seguro' || r.estado === 'sin_lectura') {
    await db.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('contacto' as tipo_historial_interno),
              ${'Documento/imagen recibido por WhatsApp (no es una póliza legible) — archivado en Documentos'})`)
  }
}
