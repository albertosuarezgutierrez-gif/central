import { NextResponse } from 'next/server'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { Prisma } from '@/lib/generated/asegura-client'
import { autorizacionBasica, filasWebhook, type FilaWebhook } from '@/lib/codeoscopic/webhook'

export const dynamic = 'force-dynamic'

// POST /api/webhooks/codeoscopic — el webhook que Codeoscopic tiene dado de alta
// (HTTP Basic). Hoy apunta al CRM de Manuel (`app.grupoasegura.com`), que
// DESCARTA sin persistir el payload real (raíz array de 2 `{insurance}`, uno
// cada ~30 min). Este receptor guarda primero y pregunta después: todo cuerpo
// autenticado va a `codeoscopic_webhook_events` tal cual — un array, una fila
// por elemento — con dedupe por hash; un cuerpo repetido suma `veces` y mueve
// `ultimo_at`, así la cadencia del emisor queda en la tabla y no solo en el log.
// NO acuña ni cambia el estado de ningún proyecto — la reconciliación sigue en
// `GET /insurances/{id}`.
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
  const filas = filasWebhook(cuerpoCrudo, parseado)

  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })

  const db = prismaAsegura()
  const guardar = (f: FilaWebhook, contenido: unknown, proyectoId: string | null) =>
    db.$queryRaw<{ id: string; veces: number }[]>(Prisma.sql`
      insert into codeoscopic_webhook_events
        (project_id, project_id_codeoscopic, event_type, payload_hash, raw_payload, received_at)
      values (
        (select p.id from codeoscopic_projects p where p.project_id_codeoscopic = ${proyectoId} limit 1),
        ${proyectoId},
        ${f.evento.tipo}::codeoscopic_webhook_event_type,
        ${f.hash},
        ${JSON.stringify(contenido)}::jsonb,
        now()
      )
      on conflict (payload_hash) do update
        set veces = codeoscopic_webhook_events.veces + 1, ultimo_at = now()
      returning id::text as id, veces
    `)

  let nuevas = 0
  let repetidas = 0
  let degradadas = 0
  for (const f of filas) {
    try {
      let r: { id: string; veces: number }[]
      try {
        r = await guardar(f, f.contenido, f.evento.proyectoId)
      } catch (e) {
        // «Guardar primero»: si el contenido o el id derivado rompen el INSERT (un jsonb que
        // rechaza un escape Unicode nulo, un id raro…), se guarda el TEXTO sin metadato antes que nada.
        console.error('[webhooks/codeoscopic] insert directo falló, se guarda degradado:', e instanceof Error ? e.message : e)
        degradadas++
        r = await guardar(f, { _crudo: JSON.stringify(f.contenido).slice(0, 20_000) }, null)
      }
      if ((r[0]?.veces ?? 1) > 1) repetidas++
      else nuevas++
    } catch (e) {
      console.error('[webhooks/codeoscopic] no se pudo guardar el evento:', e instanceof Error ? e.message : e)
      return NextResponse.json({ estado: 'error', guardadas: nuevas + repetidas, de: filas.length }, { status: 500 })
    }
  }
  const primera = filas[0]?.evento
  console.log(
    `[webhooks/codeoscopic] raiz=${primera?.raiz} elementos=${primera?.elementos} nuevas=${nuevas} repetidas=${repetidas} degradadas=${degradadas} proyectos=${filas.map((f) => f.evento.proyectoId ?? '-').join(',')}`,
  )
  return NextResponse.json({ estado: nuevas > 0 ? 'ok' : 'duplicado', raiz: primera?.raiz, elementos: primera?.elementos, nuevas, repetidas, degradadas })
}
