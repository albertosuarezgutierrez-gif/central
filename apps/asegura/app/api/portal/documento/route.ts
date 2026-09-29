import { after, NextResponse } from 'next/server'

import { tipoDocumento } from '@central/module-seguros'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { guardarDocumentoPropio } from '@/lib/documento-portal'
import { guardarDocumento } from '@/lib/cartera-documentos'
import { oportunidadDesdeFichero } from '@/lib/oportunidad-documento'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// La lectura con IA para abrir la oportunidad corre en `after()`, tras contestar al portal.
export const maxDuration = 120

/**
 * POST /api/portal/documento — el CLIENTE sube un fichero (hoy, la póliza que
 * acaba de leer el portal) para que quede en SU ficha y Alberto lo vea y lo
 * verifique desde `plataforma` → Documentos. Multipart: `documento` (fichero),
 * `identidadId`, `tipo` (opcional; cualquier valor fuera del catálogo cae a
 * `otro`, nunca revienta).
 *
 * Mismo patrón que `/api/portal/contacto`: NO acepta `clienteId`, lo resuelve
 * asegura por `portal_vinculo`. Con el secreto de este puente filtrado, el
 * daño máximo es colgar un documento de la ficha vinculada a la identidad que
 * se dé — no elegir ficha libremente, que es lo que sí podría el secreto del
 * puerto de operador (por eso este endpoint no lo acepta ni lo menciona). Sin ficha vinculada, lo
 * único que puede escribir es un lead NUEVO (por el DNI del documento) con su fichero.
 */
export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo ilegible' }, { status: 422 })
    }
    const identidadId = String(form.get('identidadId') ?? '').trim()
    const fichero = form.get('documento')
    if (identidadId === '' || !(fichero instanceof File)) {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan identidadId o documento' }, { status: 422 })
    }
    const tipo = tipoDocumento(form.get('tipo'))
    const contenido = Buffer.from(await fichero.arrayBuffer())

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await guardarDocumentoPropio(correduria.id, identidadId, {
      tipo,
      nombre: fichero.name,
      mime: fichero.type,
      contenido,
    })
    // Todo documento de seguro abre su oportunidad (29/09/2026), DESPUÉS de contestar: el portal no
    // espera a la IA. Sin ficha vinculada quien sube NO está comprobado: nunca se escribe el fichero
    // en una ficha que ya existía (se podría colgar un documento en la ficha de otro con solo saber
    // su DNI); se guarda solo si se abre un lead NUEVO, y la oportunidad lleva «sin verificar».
    const correduriaId = correduria.id
    const fich = { contenido, mime: fichero.type, nombre: fichero.name }
    if (r.estado === 'ok' || r.estado === 'sin_ficha') {
      const clienteSube = r.estado === 'ok' ? r.clienteId : null
      after(async () => {
        const o = await oportunidadDesdeFichero({ correduriaId, clienteSube, origen: 'portal', actor: 'el cliente, desde el portal', verificado: clienteSube !== null, fichero: fich })
        if (!clienteSube && (o.estado === 'creada' || o.estado === 'actualizada') && o.clienteNuevo) {
          await guardarDocumento(correduriaId, { clienteId: o.clienteId, tipo, nombre: fich.nombre, mime: fich.mime, contenido, subidoPor: 'cliente' }).catch(() => null)
        }
      })
    }
    const status =
      r.estado === 'ok' ? 200 : r.estado === 'invalido' ? 415 : r.estado === 'error' ? 503 : 409 // sin_ficha · varias_fichas
    // El `clienteId` NO sale hacia el portal: este puente no devuelve nada de la ficha.
    const respuesta = r.estado === 'ok' ? { estado: r.estado, documentoId: r.documentoId, repetido: r.repetido } : r
    return NextResponse.json(respuesta, { status })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/documento', e) },
      { status: 503 },
    )
  }
}
