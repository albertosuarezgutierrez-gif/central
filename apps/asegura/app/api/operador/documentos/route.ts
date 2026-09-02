import { NextResponse } from 'next/server'
import { tipoDocumento } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { guardarDocumento, listarDocumentos, pedirDocumento } from '@/lib/cartera-documentos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Un PDF de 10 MB por el pooler tarda; y esta ruta no gasta nada.
export const maxDuration = 60

/**
 * Documentos de la correduría por el puerto de operador (plataforma → asegura).
 *
 *   GET  ?clienteId= | ?polizaId= | ?siniestroId=   → la lista (sin ficheros)
 *   POST multipart (fichero + tipo + destino + notas) → guarda el fichero
 *   POST json      ({ pedir: true, tipo, destino, notas }) → deja constancia de un PEDIDO
 *
 * 🚨 Esta ruta NO gasta cotizaciones y NO lee el documento con IA: eso es
 * `/api/cartera/documentos` (solo auto), que sigue siendo aparte a propósito.
 * Cuatro estados en la lista: `sin_configurar` · `error` · `ok`. Un `ok` con
 * `documentos: []` es «se miró y no hay», y solo se emite si la consulta fue bien.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const u = new URL(req.url)
  const destino = {
    clienteId: u.searchParams.get('clienteId'),
    polizaId: u.searchParams.get('polizaId'),
    siniestroId: u.searchParams.get('siniestroId'),
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const documentos = await listarDocumentos(correduria.id, destino)
    if (documentos === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudo leer la tabla' })
    return NextResponse.json({ estado: 'ok', documentos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/documentos', e) })
  }
}

export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const fichero = form.get('fichero')
      if (!(fichero instanceof File)) return NextResponse.json({ error: 'falta el fichero' }, { status: 400 })
      const r = await guardarDocumento(correduria.id, {
        clienteId: texto(form.get('clienteId')),
        polizaId: texto(form.get('polizaId')),
        siniestroId: texto(form.get('siniestroId')),
        tipo: tipoDocumento(texto(form.get('tipo'))),
        notas: texto(form.get('notas')),
        subidoPor: 'corredor',
        nombre: fichero.name,
        mime: fichero.type,
        contenido: Buffer.from(await fichero.arrayBuffer()),
      })
      if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status })
      return NextResponse.json({ estado: 'ok', documento: r.documento, repetido: r.repetido })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || body.pedir !== true) {
      return NextResponse.json({ error: 'esperaba un formulario con fichero, o {pedir:true,…}' }, { status: 400 })
    }
    const r = await pedirDocumento(correduria.id, {
      clienteId: cadena(body.clienteId),
      polizaId: cadena(body.polizaId),
      siniestroId: cadena(body.siniestroId),
      tipo: tipoDocumento(body.tipo),
      notas: cadena(body.notas),
    })
    if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', documento: r.documento })
  } catch (e) {
    return NextResponse.json({ estado: 'error', motivo: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

function texto(v: FormDataEntryValue | null): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
