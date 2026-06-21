// Agente de envío automático del mailing en frío.
// En cada pasada y por cada campaña ACTIVA: (1) auto-encola el paso 1 a prospectos
// nuevos y los pasos de seguimiento a quien no abrió/pinchó tras la espera;
// (2) envía un lote respetando horario laboral (Madrid) y el tope diario (warm-up).
// Auth: Bearer CRON_SECRET (cron de Vercel) o superadmin logueado (disparo manual).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { isSuperadmin } from '@/lib/tenant'
import { getTransporter } from '@/lib/mailer'
import {
  construirEmail, aiOpener, enHorarioLaboral,
  MAILING_BATCH_SIZE, MAILING_RATE_MS, MAILING_FROM, MAILING_FROM_NAME,
} from '@/lib/mailing'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function autorizado(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return await isSuperadmin()
}

async function procesar(forzar: boolean) {
  const transporter = getTransporter()
  const resumen = { campanas: 0, encolados: 0, enviados: 0, fallidos: 0, horario: enHorarioLaboral() }

  // Recuperar envíos atascados en 'enviando' (de una pasada previa que murió a
  // medias, p.ej. la IA colgada) → vuelven a 'pendiente' para reintentarse.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE mailing_envios SET estado = 'pendiente'
    WHERE estado = 'enviando' AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
  `)

  const campanas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, landing_url, max_dia FROM mailing_campanas WHERE activa = true AND estado = 'activa'
  `)
  resumen.campanas = campanas.length

  for (const c of campanas) {
    const cid = c.id as string

    // ── 1) Auto-encolar ──────────────────────────────────────────────
    const pasos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT orden, dias_espera, asunto, cuerpo_html FROM mailing_pasos
      WHERE campana_id = ${cid}::uuid ORDER BY orden
    `)
    if (!pasos.length) continue
    const pasoMap = new Map<number, any>(pasos.map(p => [Number(p.orden), p]))

    // Paso 1: prospectos sin envío de paso 1 (solo los que tienen email; los
    // leads de Google sin email son "solo para llamar", no entran en la cola).
    const nuevos = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p.id FROM mailing_prospectos p
      WHERE p.baja = false AND p.email IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM mailing_envios e
                        WHERE e.campana_id = ${cid}::uuid AND e.prospecto_id = p.id AND e.paso = 1)
      LIMIT 2000
    `)
    resumen.encolados += await encolar(cid, 1, nuevos.map(r => r.id))

    // Pasos de seguimiento: quien no abrió/pinchó el paso previo y pasó la espera.
    for (const paso of pasos.filter(p => Number(p.orden) > 1)) {
      const k = Number(paso.orden)
      const espera = Math.max(0, Number(pasoMap.get(k)?.dias_espera || 0))
      const elegibles = await prisma.$queryRaw<{ prospecto_id: string }[]>(Prisma.sql`
        SELECT prev.prospecto_id FROM mailing_envios prev
        JOIN mailing_prospectos p ON p.id = prev.prospecto_id
        WHERE prev.campana_id = ${cid}::uuid AND prev.paso = ${k - 1} AND prev.estado = 'enviado'
          AND prev.abierto_at IS NULL AND prev.click_at IS NULL
          AND prev.enviado_at + make_interval(days => ${espera}) <= now()
          AND p.baja = false AND p.estado NOT IN ('contactado','interesado','descartado','rebotado')
          AND NOT EXISTS (SELECT 1 FROM mailing_envios e2
                          WHERE e2.campana_id = ${cid}::uuid AND e2.prospecto_id = prev.prospecto_id AND e2.paso = ${k})
        LIMIT 2000
      `)
      resumen.encolados += await encolar(cid, k, elegibles.map(r => r.prospecto_id))
    }

    // ── 2) Enviar lote ───────────────────────────────────────────────
    if (!forzar && !enHorarioLaboral()) continue // fuera de horario: solo encola
    if (!transporter) continue

    // Tope diario (warm-up): enviados hoy (Madrid) para esta campaña.
    const enviadosHoy = Number((await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM mailing_envios
      WHERE campana_id = ${cid}::uuid AND estado = 'enviado'
        AND (enviado_at AT TIME ZONE 'Europe/Madrid')::date = (now() AT TIME ZONE 'Europe/Madrid')::date
    `))[0]?.n || 0)
    const cupo = Math.max(0, Math.min(MAILING_BATCH_SIZE, Number(c.max_dia) - enviadosHoy))
    if (cupo <= 0) continue

    // Reclamar el lote de forma atómica (anti doble envío entre invocaciones).
    const lote = await prisma.$queryRaw<{ id: string; token: string; prospecto_id: string; paso: number }[]>(Prisma.sql`
      WITH sel AS (
        SELECT e.id FROM mailing_envios e
        JOIN mailing_prospectos p ON p.id = e.prospecto_id
        WHERE e.campana_id = ${cid}::uuid AND e.estado = 'pendiente' AND p.baja = false
        ORDER BY e.created_at
        LIMIT ${cupo}
        FOR UPDATE OF e SKIP LOCKED
      )
      UPDATE mailing_envios e SET estado = 'enviando', intentos = intentos + 1, claimed_at = now()
      FROM sel WHERE e.id = sel.id
      RETURNING e.id, e.token, e.prospecto_id, e.paso
    `)

    for (const env of lote) {
      const p = (await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id, empresa_nombre, email, telefono, ciudad, web, ia_opener
        FROM mailing_prospectos WHERE id = ${env.prospecto_id}::uuid
      `))[0]
      const paso = pasoMap.get(Number(env.paso)) || pasos[0]
      try {
        // Personalización IA cacheada por prospecto.
        let opener = p.ia_opener
        if (!opener) {
          opener = await aiOpener(p)
          await prisma.$executeRaw(Prisma.sql`UPDATE mailing_prospectos SET ia_opener = ${opener} WHERE id = ${p.id}::uuid`)
        }
        const { subject, html, text, urlBaja } = construirEmail({
          asunto: paso.asunto, cuerpoHtml: paso.cuerpo_html,
          prospecto: { ...p, ia_opener: opener }, token: env.token,
          landingUrl: c.landing_url || 'https://ialimp.es',
        })
        await transporter.sendMail({
          from: `"${MAILING_FROM_NAME}" <${MAILING_FROM}>`,
          to: p.email, subject, html, text,
          headers: {
            'List-Unsubscribe': `<${urlBaja}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })
        await prisma.$executeRaw(Prisma.sql`
          UPDATE mailing_envios SET estado = 'enviado', enviado_at = now(), error = NULL WHERE id = ${env.id}::uuid`)
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO mailing_eventos (envio_id, tipo) VALUES (${env.id}::uuid, 'enviado')`)
        await prisma.$executeRaw(Prisma.sql`
          UPDATE mailing_prospectos SET estado = 'enviado' WHERE id = ${p.id}::uuid AND estado = 'nuevo'`)
        resumen.enviados++
      } catch (err: any) {
        const msg = String(err?.message || err).slice(0, 400)
        // 3 intentos → fallido; si no, vuelve a pendiente para reintentar.
        await prisma.$executeRaw(Prisma.sql`
          UPDATE mailing_envios
          SET estado = CASE WHEN intentos >= 3 THEN 'fallido' ELSE 'pendiente' END, error = ${msg}
          WHERE id = ${env.id}::uuid`)
        resumen.fallidos++
      }
      await sleep(MAILING_RATE_MS)
    }
  }
  return resumen
}

// Encola filas de envío (tokens generados en JS), idempotente por (campaña,prospecto,paso).
async function encolar(cid: string, paso: number, prospectoIds: string[]): Promise<number> {
  if (!prospectoIds.length) return 0
  const { genHex } = await import('@/lib/propietario-auth')
  const tokens = prospectoIds.map(() => genHex(16))
  const res = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO mailing_envios (campana_id, prospecto_id, paso, token)
    SELECT ${cid}::uuid, pid, ${paso}, tok
    FROM UNNEST(${prospectoIds}::uuid[], ${tokens}::text[]) AS t(pid, tok)
    ON CONFLICT (campana_id, prospecto_id, paso) DO NOTHING
    RETURNING id
  `)
  return res.length
}

export async function GET(req: NextRequest) {
  if (!await autorizado(req)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const forzar = req.nextUrl.searchParams.get('forzar') === '1'
  try {
    const resumen = await procesar(forzar)
    return NextResponse.json({ ok: true, ...resumen })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
