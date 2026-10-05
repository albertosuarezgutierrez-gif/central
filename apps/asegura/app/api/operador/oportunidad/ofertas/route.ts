import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { editarOferta, listarOfertas, subirOferta } from '@/lib/oportunidad-ofertas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Un PDF de 10 MB por el pooler + la lectura con IA (modelo de la categoría `redaccion`, hasta ~90 s).
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Las OFERTAS de compañías dentro de una oportunidad (05/10/2026, F2) — plataforma → asegura.
 *
 *   GET   ?oportunidadId=                       → { estado:'ok', oportunidad, ofertas, comparacion }
 *         (la matriz de `compararOfertas` sobre las NO descartadas; `null` = no figura, nunca 0)
 *   POST  multipart (fichero, oportunidadId, rol: 'actual'|'oferta') → guarda el PDF como documento
 *         del cliente, lo LEE con IA y deja la oferta `extraida`. Si la IA no puede, la oferta nace con
 *         los datos a NULL y `motivo`: se rellena a mano. El fichero nunca se pierde.
 *   PATCH { ofertaId, compania?, producto?, primaNeta?, primaTotal?, garantias?, franquiciaGeneral?,
 *           rol?, estado?: 'extraida'|'revisada'|'descartada', recomendada?, actor? }
 *         → editar, revisar, descartar o recomendar. Editar un dato de una revisada la devuelve a
 *         `extraida`; solo se recomienda UNA oferta viva por oportunidad.
 *
 * 🚨 Nada de esto gasta Codeoscopic ni sale al cliente. La correduría es la única de asegura; un
 * `correduriaId` distinto en el cuerpo → 403.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const oportunidadId = (new URL(req.url).searchParams.get('oportunidadId') ?? '').trim()
  if (!UUID.test(oportunidadId)) return NextResponse.json({ estado: 'error', motivo: 'falta oportunidadId (uuid)' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await listarOfertas(correduria.id, oportunidadId)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/ofertas', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return NextResponse.json({ estado: 'error', motivo: 'esperaba un formulario multipart con el fichero' }, { status: 400 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const form = await req.formData()
    const correduriaId = texto(form.get('correduriaId'))
    if (correduriaId !== null && correduriaId !== correduria.id) {
      return NextResponse.json({ estado: 'error', motivo: 'correduriaId no es el de esta correduría' }, { status: 403 })
    }
    const fichero = form.get('fichero')
    if (!(fichero instanceof File)) return NextResponse.json({ estado: 'error', motivo: 'falta el fichero' }, { status: 400 })
    const oportunidadId = texto(form.get('oportunidadId')) ?? ''
    if (!UUID.test(oportunidadId)) return NextResponse.json({ estado: 'error', motivo: 'falta oportunidadId (uuid)' }, { status: 400 })
    const rolCrudo = texto(form.get('rol')) ?? 'oferta'
    if (rolCrudo !== 'actual' && rolCrudo !== 'oferta') {
      return NextResponse.json({ estado: 'error', motivo: "rol tiene que ser 'actual' u 'oferta'" }, { status: 400 })
    }
    const actor = texto(form.get('actor')) ?? req.headers.get('x-actor') ?? 'plataforma'
    const r = await subirOferta(correduria.id, {
      oportunidadId,
      rol: rolCrudo,
      fichero: { contenido: Buffer.from(await fichero.arrayBuffer()), mime: fichero.type, nombre: fichero.name },
      actor,
    })
    if (r.estado === 'error') return NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: r.status })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/ofertas', e) }, { status: 500 })
  }
})

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || Array.isArray(b)) return NextResponse.json({ estado: 'error', motivo: 'cuerpo JSON' }, { status: 400 })
  const { actor: actorCrudo, correduriaId, ...cuerpo } = b
  const actor = typeof actorCrudo === 'string' && actorCrudo.trim() !== '' ? actorCrudo.trim() : 'plataforma'
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (correduriaId !== undefined && correduriaId !== correduria.id) {
      return NextResponse.json({ estado: 'error', motivo: 'correduriaId no es el de esta correduría' }, { status: 403 })
    }
    const r = await editarOferta(correduria.id, cuerpo, actor)
    if (r.estado === 'error') return NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: r.status })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/ofertas', e) }, { status: 500 })
  }
})

function texto(v: FormDataEntryValue | null): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
