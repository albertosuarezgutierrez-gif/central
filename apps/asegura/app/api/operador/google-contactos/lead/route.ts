import { NextResponse } from 'next/server'
import { z } from 'zod'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anadirFichasAGoogle, leadsCorreoSinContacto } from '@/lib/google-contactos-lead'
import { ErrorGoogle } from '@/lib/google-people'
import { MAX_FICHAS_CONTACTO_LEAD } from '@central/module-seguros/google-contactos-lead'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const Cuerpo = z.object({
  clienteId: z.string().uuid().optional(),
  clienteIds: z.array(z.string().uuid()).min(1).max(MAX_FICHAS_CONTACTO_LEAD).optional(),
  ensayo: z.boolean().optional(),
}).strict()

/**
 * POST /api/operador/google-contactos/lead — añade a Google Contacts SOLO las fichas pedidas (19/10/2026:
 * el lead que entra por hola@ aparece al momento en la agenda de Alberto; amplía el alcance de la skill
 * `google-contactos`). Mismas reglas que el cron (`lib/google-contactos-lead.ts`): E.164 + nombre, adopción,
 * cola `google_contactos_revision` para lo dudoso, etiqueta «Grupo ASegura», vínculo guardado igual.
 *
 *   · `{ clienteId }` → `{ estado, motivo }` de esa ficha: `anadido` | `ya_estaba` | `revision` |
 *     `no_activada` | `sin_conexion` | `error`. Es lo que llama plataforma tras el alta del lead.
 *   · RELLENO a mano: `{ clienteIds: [...] }` o `?desdeCorreo=1&limite=N` (leads `fuente='correo'` sin
 *     vínculo, del más reciente; máx. 50) → `{ estado:'ok', resultados:[{ clienteId, estado, motivo }] }`.
 *     Idempotente. `ensayo: true` (o `?ensayo=1`) dice qué pasaría sin escribir nada.
 *
 * Sin `sync_activada_en` o sin conexión: `no_activada` / `sin_conexion` y NO escribe. Sin PII en la respuesta.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const url = new URL(req.url)
  const desdeCorreo = url.searchParams.get('desdeCorreo') === '1'
  const texto = await req.text().catch(() => '')
  const cuerpo = Cuerpo.safeParse(texto.trim() === '' ? {} : (() => { try { return JSON.parse(texto) } catch { return null } })())
  if (!cuerpo.success) return NextResponse.json({ error: 'Cuerpo inválido: { clienteId } | { clienteIds: [...] }, ensayo?: boolean' }, { status: 400 })
  const { clienteId, clienteIds } = cuerpo.data
  if ([clienteId !== undefined, clienteIds !== undefined, desdeCorreo].filter(Boolean).length !== 1) {
    return NextResponse.json({ error: 'Uno y solo uno: clienteId, clienteIds o ?desdeCorreo=1' }, { status: 400 })
  }
  const limite = Number(url.searchParams.get('limite') ?? '20')
  if (desdeCorreo && (!Number.isInteger(limite) || limite < 1 || limite > MAX_FICHAS_CONTACTO_LEAD)) {
    return NextResponse.json({ error: `limite: entero entre 1 y ${MAX_FICHAS_CONTACTO_LEAD}` }, { status: 400 })
  }
  const ensayo = cuerpo.data.ensayo === true || url.searchParams.get('ensayo') === '1'
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'error', motivo: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'fallo' }, { status: 500 })
    const ids = clienteId ? [clienteId] : clienteIds ?? (await leadsCorreoSinContacto(correduria.id, limite))
    const r = await anadirFichasAGoogle(correduria.id, ids, { ensayo })
    if (r.estado !== 'ok') return NextResponse.json(r, { status: r.estado === 'error' ? 503 : 200 })
    if (clienteId) {
      const f = r.resultados[0]
      return NextResponse.json({ estado: f.estado, motivo: f.motivo, ...(ensayo ? { ensayo: true } : {}) }, { status: f.estado === 'error' ? 422 : 200 })
    }
    const totales: Record<string, number> = {}
    for (const x of r.resultados) totales[x.estado] = (totales[x.estado] ?? 0) + 1
    return NextResponse.json({ ...r, totales })
  } catch (e) {
    if (e instanceof ErrorGoogle) {
      // El cuerpo de Google no sale de aquí: solo el código HTTP.
      console.error('[google-contactos/lead] Google respondió', e.status)
      return NextResponse.json({ estado: 'error', motivo: 'fallo_google' }, { status: 502 })
    }
    registrarErrorCartera('operador/google-contactos/lead', e)
    return NextResponse.json({ estado: 'error', motivo: 'fallo' }, { status: 500 })
  }
})
