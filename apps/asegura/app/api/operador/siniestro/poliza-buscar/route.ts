import { NextResponse } from 'next/server'
import { buscarEnTexto } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { prismaAsegura } from '@/lib/asegura-db'
import { textosPolizaPorDocumento } from '@/lib/poliza-texto'
import { cadena, correduriaPedida } from '@/lib/siniestro-hilo-puerto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Buscador de texto en los PDF de la póliza del siniestro (sin IA; sin tildes ni mayúsculas; varias palabras = todas
 * dentro de una ventana de 600 caracteres).
 *
 *   GET ?correduriaId?&siniestroId&q → { estado:'ok', documentos:n, fragmentos:[{documentoId, nombre, posicion, fragmento (±300)}] }
 *   (máx. 20 en total; `documentos: 0` = la póliza no tiene PDF legible, que NO es «no aparece»)
 * 400 falta siniestroId o q · 403 otra correduría · 404 siniestro no es de esta correduría · 500 error.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const p = new URL(req.url).searchParams
  const siniestroId = cadena(p.get('siniestroId'))
  const q = cadena(p.get('q'))
  if (!siniestroId) return NextResponse.json({ estado: 'invalido', motivo: 'falta siniestroId' }, { status: 400 })
  if (!q) return NextResponse.json({ estado: 'invalido', motivo: 'falta q' }, { status: 400 })
  try {
    const c = await correduriaPedida(p.get('correduriaId'))
    if (!c.ok) return c.res
    const s = await prismaAsegura().siniestro.findFirst({ where: { id: siniestroId, correduriaId: c.id }, select: { polizaId: true } })
    if (!s) return NextResponse.json({ estado: 'no_encontrado', motivo: 'El siniestro no existe en esta correduría.' }, { status: 404 })
    const docs = await textosPolizaPorDocumento(c.id, s.polizaId)
    const fragmentos: { documentoId: string; nombre: string; posicion: number; fragmento: string }[] = []
    for (const d of docs) {
      if (fragmentos.length >= 20) break
      for (const f of buscarEnTexto(d.texto, q, { max: 20 - fragmentos.length })) {
        fragmentos.push({ documentoId: d.documentoId, nombre: d.nombre, posicion: f.posicion, fragmento: f.fragmento })
      }
    }
    return NextResponse.json({ estado: 'ok', documentos: docs.length, fragmentos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestro/poliza-buscar', e) }, { status: 500 })
  }
}
