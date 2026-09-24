import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { exportRgpdAsegura, identidadValida } from '@/lib/export-rgpd-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/export-rgpd — el paquete del **derecho de acceso (art. 15
 * RGPD)** y de **portabilidad (art. 20)** de una persona.
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`GET /api/operador/export-rgpd`) con el secreto de operador y devuelve el
 * MISMO status y json, para que la pantalla lea el contrato del puerto tal cual.
 *
 * 🚨 **Es un POST aunque aguas abajo sea una lectura**, y no es una
 * inconsistencia: lo que devuelve es el expediente COMPLETO de una persona. Un
 * GET lo dispara un prefetch del navegador, deja el uuid de la identidad en el
 * historial y en los logs de acceso, y se comparte por enlace. Aquí el cuerpo
 * viaja en el POST y no queda en ningún sitio por el que no haya pasado una
 * sesión. (Mismo criterio que la regla de la casa sobre el `GET` que cotizaría
 * en `apps/asegura`: lo que no debe dispararse solo, no se pone en un GET.)
 *
 * 🚨 **El export NO se le sirve al interesado.** Lo genera Alberto desde su
 * pantalla, comprueba quién lo pide y lo entrega él dentro del mes del
 * art. 12.3. El portal del cliente no tiene —ni puede tener— una ruta de export:
 * su identidad es un código de un solo uso a un correo, sin segundo factor.
 *
 *   POST { identidad }   → 200 { estado:'ok', paquete, generadoPor } · 404 · 503 · …
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const session = guarda.session

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const identidad = typeof body?.identidad === 'string' ? body.identidad.trim() : ''
  // Se comprueba AQUÍ y no se deja llegar al puerto: asegura contesta 404 a
  // cualquier cadena que no sea una identidad suya, y un 404 en esta pantalla se
  // lee como «esa persona no existe» — que es una afirmación sobre alguien, no
  // sobre un dedazo al pegar el identificador.
  if (!identidadValida(identidad)) {
    return NextResponse.json(
      { error: 'identidad_invalida', motivo: 'Eso no es un identificador de acceso al portal.' },
      { status: 400 },
    )
  }

  const r = await exportRgpdAsegura(identidad)
  const json = r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }

  // 🚨 El `actor` lo pone el SERVIDOR desde la sesión y va el ÚLTIMO, después de
  // lo que manda el puerto: quien llama no puede firmar el paquete con otro
  // nombre. Va en la RESPUESTA y no dentro del paquete que se descarga — el
  // fichero que se le entrega al interesado es exactamente el que construyó
  // asegura, sin nada añadido por esta app.
  const conActor =
    typeof json === 'object' && json !== null && !Array.isArray(json)
      ? { ...(json as Record<string, unknown>), generadoPor: session.email }
      : json

  return NextResponse.json(conActor, { status: r.status })
}
