import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { editarOfertaAsegura, listarOfertasAsegura, subirOfertaAsegura } from '@/lib/correduria/ofertas-asegura'

export const dynamic = 'force-dynamic'
// Subir un PDF incluye la lectura con IA en asegura (hasta ~2 min).
export const maxDuration = 130

/**
 * /api/correduria/oportunidad/ofertas — las ofertas de compañías de una oportunidad (F3).
 * Reenvía al puerto de asegura y devuelve el MISMO status y json.
 *   GET   ?oportunidadId=      → ofertas + cuadro comparativo
 *   POST  multipart (fichero, oportunidadId, rol)  → sube y lee el PDF
 *   PATCH { ofertaId, … }      → editar / revisar / descartar / recomendar
 * 🚨 El `actor` lo pone el SERVIDOR (email de la sesión) y pisa cualquiera del cuerpo.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const oportunidadId = (new URL(req.url).searchParams.get('oportunidadId') ?? '').trim()
  if (!oportunidadId) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await listarOfertasAsegura(oportunidadId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const entrada = await req.formData().catch(() => null)
  const fichero = entrada?.get('fichero')
  if (!entrada || !(fichero instanceof File)) return NextResponse.json({ estado: 'error', motivo: 'falta el fichero' }, { status: 400 })
  // Se reconstruye el formulario con solo lo que el puerto espera; `actor` va el último.
  const form = new FormData()
  form.set('fichero', fichero, fichero.name)
  form.set('oportunidadId', String(entrada.get('oportunidadId') ?? ''))
  form.set('rol', String(entrada.get('rol') ?? 'oferta'))
  form.set('actor', guarda.session.email)
  const r = await subirOfertaAsegura(form)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await editarOfertaAsegura({ ...cuerpo, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
