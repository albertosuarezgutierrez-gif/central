import { NextResponse } from 'next/server'
import { tipoDocumento } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { guardarDocumento, listarDocumentos, pedirDocumento } from '@/lib/cartera-documentos'
import { auditado } from '@/lib/auditoria'
import { oportunidadDesdeFichero } from '@/lib/oportunidad-documento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Un PDF de 10 MB por el pooler tarda, y un documento subido a una ficha se lee con IA para abrir
// su oportunidad (hasta ~60 s): 120 s de margen.
export const maxDuration = 120

/**
 * Documentos de la correduría por el puerto de operador (plataforma → asegura).
 *
 *   GET  ?clienteId= | ?polizaId= | ?siniestroId=   → la lista (sin ficheros)
 *   POST multipart (fichero + tipo + destino + notas) → guarda el fichero
 *   POST json      ({ pedir: true, tipo, destino, notas }) → deja constancia de un PEDIDO
 *
 * 🚨 Esta ruta NO gasta cotizaciones. Desde el 29/09/2026 SÍ lee con IA lo que se sube a una FICHA
 * (no a una póliza nuestra ni a un siniestro): todo documento de seguro abre o completa una
 * oportunidad (`oportunidadDesdeFichero`, desenlace en `oportunidad`). Si la lectura falla, el
 * fichero ya está guardado: la oportunidad nunca tumba la subida.
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

export const POST = auditado(async (req: Request) => {
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
      const tipo = tipoDocumento(texto(form.get('tipo')))
      const polizaId = texto(form.get('polizaId'))
      const contenido = Buffer.from(await fichero.arrayBuffer())
      const r = await guardarDocumento(correduria.id, {
        clienteId: texto(form.get('clienteId')),
        polizaId,
        siniestroId: texto(form.get('siniestroId')),
        tipo,
        // La PÓLIZA original subida a una póliza la ve el cliente en su portal («Documentos de tu
        // póliza», 26/09/2026): es la documentación de la compañía que Alberto quiere que consulten.
        // Cualquier otro tipo (DNI, carné, parte…) sigue siendo solo del corredor.
        visiblePorCliente: tipo === 'poliza' && polizaId !== null,
        notas: texto(form.get('notas')),
        subidoPor: 'corredor',
        nombre: fichero.name,
        mime: fichero.type,
        contenido,
      })
      if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status })
      const clienteId = texto(form.get('clienteId'))
      // Solo lo subido a una FICHA: un documento colgado de una póliza nuestra no es una venta. Un
      // fichero REPETIDO se lee igual: la primera copia pudo subirse antes de que esto existiera (o
      // fallar al leerse), y saltarlo dejaba la póliza sin oportunidad y sin aviso (Manuel Antonio
      // Piña, 29/09/2026). No duplica: `crearOportunidad` completa la que ya haya de ese seguro.
      const oportunidad = clienteId && !polizaId && !texto(form.get('siniestroId'))
        ? await oportunidadDesdeFichero({
            correduriaId: correduria.id,
            clienteSube: clienteId,
            origen: 'ficha',
            actor: req.headers.get('x-actor') ?? 'corredor',
            fichero: { contenido, mime: fichero.type, nombre: fichero.name },
          })
        : null
      return NextResponse.json({ estado: 'ok', documento: r.documento, repetido: r.repetido, oportunidad })
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
})

function texto(v: FormDataEntryValue | null): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
