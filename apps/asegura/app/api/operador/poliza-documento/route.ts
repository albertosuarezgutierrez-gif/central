import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { revisarFichero } from '@/lib/documentos/extraer-poliza'
import { guardarPolizaDeDocumento } from '@/lib/poliza-de-documento'
import type { LecturaPoliza, TipoLecturaDocumento } from '@central/module-seguros'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Guarda una póliza que el corredor ha recibido por su cuenta (WhatsApp,
 * correo, en mano) después de haberla LEÍDO en `/api/cartera/documentos`.
 *
 * Son dos rutas a propósito, y el orden no es negociable:
 *
 *   1. `/api/cartera/documentos` lee el documento y **no escribe nada**. Se
 *      puede repetir gratis, y el corredor ve en pantalla lo que ha salido.
 *   2. esta ruta escribe, con los campos **ya revisados por él**. Lo que se
 *      guarda es lo que él ha confirmado, no lo que dijo el modelo.
 *
 * 🚨 Lo que NO hace: no tarifica (Avant2 cuesta 0,50 € y no es idempotente) y
 * no escribe en `seguros.polizas` (esa póliza no la ha mediado la casa). Ver
 * `lib/poliza-de-documento.ts`.
 *
 * Entra como multipart: `fichero` + `datos` (JSON con la lectura revisada, la
 * ficha elegida si la hay, y el contacto que el corredor teclee).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: 'esperaba un formulario con el fichero' }, { status: 400 })
    }

    const fichero = form.get('fichero')
    if (!(fichero instanceof File)) return NextResponse.json({ error: 'falta el fichero' }, { status: 400 })
    const reparo = revisarFichero({ type: fichero.type, size: fichero.size, name: fichero.name })
    if (reparo) return NextResponse.json({ error: reparo }, { status: 415 })

    const crudo = form.get('datos')
    let datos: Record<string, unknown>
    try {
      datos = JSON.parse(typeof crudo === 'string' ? crudo : '{}') as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'los datos revisados no son un JSON válido' }, { status: 400 })
    }

    const lectura = leerLectura(datos.lectura)
    if (!lectura) return NextResponse.json({ error: 'faltan los datos leídos del documento' }, { status: 400 })

    const r = await guardarPolizaDeDocumento(correduria.id, {
      lectura,
      clienteId: texto(datos.clienteId),
      telefono: texto(datos.telefono),
      email: texto(datos.email),
      forzar: datos.forzar === true,
      fichero: {
        nombre: fichero.name,
        mime: fichero.type,
        contenido: Buffer.from(await fichero.arrayBuffer()),
      },
      actor: texto(datos.actor) ?? 'plataforma',
    })

    if (!r.ok) {
      return NextResponse.json(
        { error: r.motivo, coincidencias: r.coincidencias, forzable: r.forzable, avisos: r.avisos },
        { status: r.status },
      )
    }
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('operador/poliza-documento', e) },
      { status: 500 },
    )
  }
})

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

const TIPOS_LECTURA: readonly TipoLecturaDocumento[] = ['auto', 'hogar', 'contrato_solo']

/**
 * La lectura llega del navegador, así que se revisa aquí: los valores que no
 * son texto ni número se descartan en vez de acabar en la base como `[object
 * Object]`. Un campo descartado queda a `null`, que es «no se sabe» —
 * exactamente lo que era.
 */
function leerLectura(v: unknown): LecturaPoliza | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const tipo = TIPOS_LECTURA.find((t) => t === o.tipoLectura)
  if (!tipo) return null
  const brutos = typeof o.datos === 'object' && o.datos !== null && !Array.isArray(o.datos) ? o.datos : {}
  const datos: Record<string, string | number | null> = {}
  for (const [k, valor] of Object.entries(brutos as Record<string, unknown>)) {
    if (typeof valor === 'string') datos[k] = valor.slice(0, 500)
    else if (typeof valor === 'number' && Number.isFinite(valor)) datos[k] = valor
    else datos[k] = null
  }
  return { ramo: texto(o.ramo), tipoLectura: tipo, datos }
}
