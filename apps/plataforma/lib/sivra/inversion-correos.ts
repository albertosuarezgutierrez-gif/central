// Análisis de correos de alertas inmobiliarias (idealista & co.) → `inmuebles_busqueda`.
// LO USAN la ruta manual (`/api/sivra/inversion/analyze` + `bulk_insert`) y el cron diario
// (`/api/cron/idealista-correos`): una sola lógica.
//
// Deduplicación (coste de IA): los ids de mensaje Gmail ya analizados viven en `inversion_config`
// bajo `CLAVE_PROCESADOS` (JSON, máx. 500). Si ese estado no se puede leer, el cron NO analiza
// (mejor callar que gastar IA repetida). Además el cron solo mira `newer_than:2d`.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { chatConDirector } from '@/lib/pasarela'
import { encajaCasaVacacional, DORMITORIOS_IDEAL } from '@central/module-subastas'
import { tgAviso } from '@/lib/telegram'
import { eur } from '@/lib/dinero'
import {
  CLAVE_PROCESADOS, MAX_PROCESADOS, VENTANA_CRON, consultaGmail, extractAllLinks, extractBody, extractPhone,
  extractPortalLinks, filtrarNoProcesados, fusionarProcesados,
} from './inversion-correos-puro'

export const GMAIL_LABEL = process.env.GMAIL_LABEL || 'inmobiliaria'

const SYSTEM_PROMPT = `Eres experto inmobiliario en Huelva, Costa de la Luz y Aljarafe sevillano. Analiza correos de inmobiliarias, subastas y alertas de bajada de precio. Devuelve SOLO JSON sin markdown:
{"es_inmobiliaria":true,"propiedades":[{"titulo":"título corto","tipo":"chalet|parcela|finca|casa|piso|apartamento|otro","zona":"municipio","precio":null,"precio_anterior":null,"es_bajada_precio":false,"metros":null,"tiene_piscina":null,"habitaciones":null,"banos":null,"parcela_m2":null,"es_rustica":null,"cerca_playa":null,"puntuacion_chollo":5,"razon_chollo":"motivo en 1 frase","link":null,"es_subasta":false}],"resumen":"1 frase"}
Puntuación 1-10: 10=precio bajo+playa+piscina, 1=caro/no interesa. Las bajadas de precio SUMAN +2 a la puntuación.
Si el email es alerta de bajada de precio: es_bajada_precio=true, precio=precio nuevo, precio_anterior=precio antiguo.
Perfil: inversión/residencia, Huelva costa o Aljarafe, chalet/parcela rústica, piscina deseable, playa cerca ideal.
habitaciones/banos/parcela_m2: números SOLO si el correo los dice; si no, null (no inventes).
Si hay URLs de anuncios (idealista, fotocasa, kyero, habitaclia, pisos.com, milanuncios) cópialas exactas en "link".
Si no es inmobiliaria: {"es_inmobiliaria":false,"propiedades":[],"resumen":""}`

/** El token OAuth de Gmail no está configurado o Google lo rechaza. */
export class GmailNoDisponible extends Error {}

/** Token OAuth del Gmail de Alberto (env del proyecto plataforma): GMAIL_REFRESH_TOKEN + GOOGLE_CLIENT_ID/SECRET. */
export async function getGoogleAccessToken(): Promise<string> {
  const { GMAIL_REFRESH_TOKEN: rt, GOOGLE_CLIENT_ID: cid, GOOGLE_CLIENT_SECRET: cs } = process.env
  if (!rt || !cid || !cs) throw new GmailNoDisponible('Gmail OAuth no configurado (GMAIL_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: cid, client_secret: cs }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.access_token) throw new GmailNoDisponible(`Token Google fallido: ${data.error ?? res.status}`)
  return data.access_token
}

// ── Estado de correos procesados (inversion_config) ─────────────────────────
/** `null` = no se pudo leer (≠ `[]` = nada procesado aún). */
export async function leerProcesados(): Promise<string[] | null> {
  try {
    const f = await prisma.$queryRaw<Array<{ value: string | null }>>(
      Prisma.sql`SELECT value FROM inversion_config WHERE key = ${CLAVE_PROCESADOS} LIMIT 1`,
    )
    if (!f.length || !f[0].value) return []
    const v = JSON.parse(String(f[0].value))
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return null
  }
}

export async function marcarProcesados(ids: string[]): Promise<boolean> {
  if (!ids.length) return true
  try {
    const previos = (await leerProcesados()) ?? []
    const json = JSON.stringify(fusionarProcesados(previos, ids, MAX_PROCESADOS))
    const n = await prisma.$executeRaw(
      Prisma.sql`UPDATE inversion_config SET value = ${json}, updated_at = now() WHERE key = ${CLAVE_PROCESADOS}`,
    )
    if (Number(n) === 0) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO inversion_config (key, value, updated_at)
        SELECT ${CLAVE_PROCESADOS}, ${json}, now()
        WHERE NOT EXISTS (SELECT 1 FROM inversion_config WHERE key = ${CLAVE_PROCESADOS})
      `)
    }
    return true
  } catch {
    return false
  }
}

// ── Lectura de Gmail + extracción con IA ────────────────────────────────────
export interface ResultadoAnalisis {
  propiedades: any[]
  ultima_fecha: string
  emails_analyzed: number
  /** Ids con análisis completo (IA respondió JSON válido): los únicos que se pueden marcar como procesados. */
  ids_ok: string[]
  /** Correos que la consulta de Gmail devolvió antes de filtrar por procesados. */
  emails_encontrados: number
}

export type OpcionesAnalisis = {
  /** Filtro temporal de Gmail: `after:<fecha>` (manual) o `newer_than:2d` (cron). */
  filtroTemporal: string
  /** Ids ya analizados que se saltan (solo cron). */
  procesados?: string[]
}

export async function analizarCorreos(token: string, o: OpcionesAnalisis): Promise<ResultadoAnalisis> {
  const query = consultaGmail(GMAIL_LABEL, o.filtroTemporal)
  const searchRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=25`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const searchData = await searchRes.json()
  if (searchRes.status !== 200) throw new Error(`Gmail API error: ${JSON.stringify(searchData)}`)

  const todos: string[] = (searchData.messages || []).map((m: any) => m.id)
  const messageIds = o.procesados ? filtrarNoProcesados(todos, o.procesados) : todos
  const vacio = { propiedades: [], ultima_fecha: new Date().toISOString(), emails_analyzed: 0, ids_ok: [], emails_encontrados: todos.length }
  if (!messageIds.length) return vacio

  const emails: any[] = (await Promise.all(
    messageIds.map(async (id) => {
      try {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
        const msg = await r.json()
        const hdrs = msg.payload?.headers || []
        return {
          id,
          subject: hdrs.find((h: any) => h.name === 'Subject')?.value || '',
          from: hdrs.find((h: any) => h.name === 'From')?.value || '',
          date: hdrs.find((h: any) => h.name === 'Date')?.value || '',
          body: extractBody(msg.payload || {}).slice(0, 3000),
        }
      } catch { return null }
    }),
  )).filter(Boolean)

  const BATCH = 5
  const newProps: any[] = []
  const idsOk: string[] = []
  let newestMs = 0

  for (let i = 0; i < emails.length; i += BATCH) {
    const results = await Promise.all(emails.slice(i, i + BATCH).map(async (em: any) => {
      const portalLinks = extractPortalLinks(em.body)
      const allLinks = extractAllLinks(em.body)
      const phone = extractPhone(em.body)
      const emailMs = (() => { try { return new Date(em.date).getTime() } catch { return 0 } })()
      try {
        const txt = (await chatConDirector(
          [{ role: 'user', content: `ASUNTO: ${em.subject}\nDE: ${em.from}\nFECHA: ${em.date}\nLINKS: ${portalLinks.length ? portalLinks.join(' | ') : 'ninguno'}\nCONTENIDO: ${em.body}` }],
          { app: 'plataforma', endpoint: 'inversion-analyze', system: SYSTEM_PROMPT, maxTokens: 800, temperature: 0.1 },
        )).text.replace(/```json|```/g, '').trim()
        let parsed: any
        let ok = true
        try { parsed = JSON.parse(txt) } catch { parsed = { es_inmobiliaria: false, propiedades: [] }; ok = false }
        return { props: parsed.es_inmobiliaria ? (parsed.propiedades || []) : [], emailMs, em, portalLinks, allLinks, phone, ok }
      } catch {
        return { props: [], emailMs, em, portalLinks, allLinks, phone, ok: false }
      }
    }))

    for (const { props, emailMs, em, portalLinks, allLinks, phone, ok } of results) {
      if (ok) idsOk.push(em.id)
      if (emailMs && !isNaN(emailMs) && emailMs > newestMs) newestMs = emailMs
      for (const p of props) {
        newProps.push({
          ...p,
          link: p.link || (portalLinks.length === 1 ? portalLinks[0] : null),
          links_all: allLinks,
          telefono: phone,
          email_from: em.from,
          email_subject: em.subject,
          email_message_id: em.id,
          email_body: em.body,
        })
      }
    }
  }

  return {
    propiedades: newProps,
    ultima_fecha: newestMs > 0 ? new Date(newestMs).toISOString() : new Date().toISOString(),
    emails_analyzed: emails.length,
    ids_ok: idsOk,
    emails_encontrados: todos.length,
  }
}

// ── Inserción en inmuebles_busqueda + aviso Telegram de las NUEVAS ──────────
export async function insertarPropiedades(propiedades: any[], ultima_fecha?: string | null) {
  let inserted = 0, updated = 0, skipped = 0
  const casas: Array<{ p: any; pendientes: string[] }> = []

  for (const p of propiedades) {
    if (p.es_bajada_precio) {
      const match = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM inmuebles_busqueda
        WHERE titulo = ${p.titulo ?? ''} AND zona = ${p.zona ?? ''}
        LIMIT 1
      `)
      if (match.length > 0) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE inmuebles_busqueda
          SET precio           = ${p.precio ?? null},
              precio_anterior  = ${p.precio_anterior ?? null},
              es_bajada_precio = true,
              is_new           = true,
              puntuacion_chollo = LEAST(10, puntuacion_chollo + 2)
          WHERE id = ${match[0].id}::uuid
        `)
        updated++; continue
      }
    }

    const existing = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM inmuebles_busqueda
      WHERE titulo = ${p.titulo ?? ''} AND zona = ${p.zona ?? ''}
      LIMIT 1
    `)
    if (existing.length > 0) { skipped++; continue }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO inmuebles_busqueda (
        titulo, tipo, zona, precio, precio_anterior, es_bajada_precio, metros,
        tiene_piscina, es_rustica, cerca_playa, es_subasta,
        puntuacion_chollo, razon_chollo, link, links_all, telefono,
        email_from, email_subject, email_message_id, email_body, estado, is_new
      ) VALUES (
        ${p.titulo ?? null}, ${p.tipo ?? null}, ${p.zona ?? null},
        ${p.precio ?? null}, ${p.precio_anterior ?? null}, ${p.es_bajada_precio ?? false},
        ${p.metros ?? null},
        ${p.tiene_piscina ?? null}, ${p.es_rustica ?? null},
        ${p.cerca_playa ?? null}, ${p.es_subasta ?? false},
        ${p.puntuacion_chollo ?? 5}, ${p.razon_chollo ?? null},
        ${p.link ?? null}, ${(p.links_all ?? []) as any}, ${p.telefono ?? null},
        ${p.email_from ?? null}, ${p.email_subject ?? null},
        ${p.email_message_id ?? null}, ${p.email_body ?? null},
        'pendiente', true
      )
    `)
    inserted++

    // 🏡 Solo las filas RECIÉN insertadas pueden avisar: el SELECT de arriba
    // (titulo+zona) ya omite las repetidas, así que no hay aviso duplicado.
    const e = encajaCasaVacacional({
      precio: p.precio != null ? Number(p.precio) : null,
      tipo: p.tipo ?? null,
      dormitorios: p.habitaciones != null ? Number(p.habitaciones) : null,
      banos: p.banos != null ? Number(p.banos) : null,
      piscina: typeof p.tiene_piscina === 'boolean' ? p.tiene_piscina : null,
      parcelaM2: p.parcela_m2 != null ? Number(p.parcela_m2) : null,
      municipio: p.zona ?? null,
    })
    if (e.encaja && !p.es_subasta) casas.push({ p, pendientes: e.pendientes })
  }

  for (const { p, pendientes } of casas.slice(0, 10)) {
    const esc = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const hab = p.habitaciones != null ? `${p.habitaciones} hab.${Number(p.habitaciones) >= DORMITORIOS_IDEAL ? ' ⭐' : ''}` : null
    const lineas = [
      `🏡 <b>Idealista — casa vacacional</b> ${esc(p.titulo)}`,
      esc([p.precio != null ? eur(Number(p.precio)) : 'precio sin consta', p.zona, hab, p.banos != null ? `${p.banos} baños` : null,
        p.tiene_piscina === true ? 'piscina' : null].filter(Boolean).join(' · ')),
    ]
    if (pendientes.length) lineas.push(`⏳ Por comprobar: ${esc(pendientes.join(', '))}`)
    if (p.link) lineas.push(esc(p.link))
    await tgAviso('pisos.idealista-casa', lineas.join('\n'), { html: true }).catch(() => {})
  }

  if (ultima_fecha) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE inversion_config SET value=${ultima_fecha}, updated_at=now()
      WHERE key='ultima_fecha_email'
    `)
  }

  // Los correos que ya dieron inmuebles no se reanalizan (el cron los saltará).
  const conInmueble = [...new Set(propiedades.map((p) => p.email_message_id).filter(Boolean))] as string[]
  await marcarProcesados(conInmueble)

  return { inserted, updated, skipped }
}

export type EstadoCron =
  | { ok: true; estado: 'ok'; encontrados: number; analizados: number; inmuebles: number; inserted: number; updated: number; skipped: number }
  | { ok: false; estado: 'gmail_no_disponible' | 'sin_estado' | 'error'; detalle: string }

/** Pasada diaria: Gmail (newer_than:2d) → saltar procesados → IA → insertar + Telegram → marcar procesados. */
export async function ejecutarCronIdealistaCorreos(): Promise<EstadoCron> {
  let token: string
  try {
    token = await getGoogleAccessToken()
  } catch (e: any) {
    return { ok: false, estado: 'gmail_no_disponible', detalle: e?.message ?? String(e) }
  }
  const procesados = await leerProcesados()
  if (procesados === null) {
    return { ok: false, estado: 'sin_estado', detalle: 'No se pudo leer inversion_config: no se analiza para no repetir IA' }
  }
  try {
    const r = await analizarCorreos(token, { filtroTemporal: VENTANA_CRON, procesados })
    const ins = await insertarPropiedades(r.propiedades, r.emails_analyzed ? r.ultima_fecha : null)
    await marcarProcesados(r.ids_ok)
    return { ok: true, estado: 'ok', encontrados: r.emails_encontrados, analizados: r.emails_analyzed, inmuebles: r.propiedades.length, ...ins }
  } catch (e: any) {
    return { ok: false, estado: 'error', detalle: e?.message ?? String(e) }
  }
}
