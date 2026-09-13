import { NextResponse } from 'next/server'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { Prisma } from '@/lib/generated/asegura-client'
import { autorizacionBasica, hashPayload, leerEventoWebhook } from '@/lib/codeoscopic/webhook'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/codeoscopic — el webhook que Codeoscopic tiene dado de alta
// (HTTP Basic). Hoy apunta al CRM de Manuel (`app.grupoasegura.com`), que
// DESCARTA sin persistir el payload real (raíz array). Este receptor guarda
// primero y pregunta después: todo cuerpo autenticado va a
// `codeoscopic_webhook_events` tal cual, dedupe por hash. NO acuña ni cambia
// el estado de ningún proyecto — la reconciliación sigue en `GET /insurances/{id}`.
//
// Envs: CODEOSCOPIC_WEBHOOK_USER + CODEOSCOPIC_WEBHOOK_PASSWORD (las mismas
// credenciales Basic que Codeoscopic tiene del CRM). Sin ellas: 503, nunca 200.
export async function POST(req: Request) {
  const usuario = process.env.CODEOSCOPIC_WEBHOOK_USER
  const contrasena = process.env.CODEOSCOPIC_WEBHOOK_PASSWORD
  if (!usuario || !contrasena) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  if (!autorizacionBasica(req.headers.get('authorization'), usuario, contrasena)) {
    return new NextResponse(JSON.stringify({ estado: 'no_autorizado' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'www-authenticate': 'Basic realm="codeoscopic-webhook"' },
    })
  }

  const cuerpoCrudo = await req.text()
  let parseado: unknown
  try {
    parseado = JSON.parse(cuerpoCrudo)
  } catch {
    // Un cuerpo que no es JSON también se guarda: es la única forma de saber qué manda.
    parseado = { _no_json: cuerpoCrudo.slice(0, 20_000) }
  }
  const evento = leerEventoWebhook(parseado)
  const hash = hashPayload(cuerpoCrudo)

  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  try {
    const filas = await prismaAsegura().$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into codeoscopic_webhook_events
        (project_id, project_id_codeoscopic, event_type, payload_hash, raw_payload, received_at)
      values (
        (select p.id from codeoscopic_projects p where p.project_id_codeoscopic = ${evento.proyectoId} limit 1),
        ${evento.proyectoId},
        ${evento.tipo}::codeoscopic_webhook_event_type,
        ${hash},
        ${JSON.stringify(parseado)}::jsonb,
        now()
      )
      on conflict (payload_hash) do nothing
      returning id::text as id
    `)
    const duplicado = filas.length === 0
    console.log(
      `[webhooks/codeoscopic] ${duplicado ? 'duplicado' : 'guardado'} raiz=${evento.raiz} elementos=${evento.elementos} tipo=${evento.tipo} proyecto=${evento.proyectoId ?? '-'}`,
    )
    return NextResponse.json({ estado: duplicado ? 'duplicado' : 'ok', raiz: evento.raiz, elementos: evento.elementos, tipo: evento.tipo })
  } catch (e) {
    console.error('[webhooks/codeoscopic] no se pudo guardar el evento:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 500 })
  }
}
