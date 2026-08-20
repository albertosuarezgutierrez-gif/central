// /api/cron/ses-latido — 💓 Latido del TRANSPORTE con SES.HOSPEDAJES.
//
// Comprueba a diario que seguimos pudiendo hablar con el Ministerio: TLS, credenciales del
// servicio web y que el `codigoArrendador` tiene el WS habilitado. Deja huella en
// `agente_latidos.ses_transporte`, que es lo que vigila `/api/cron/agentes-latido`.
//
// 🚨 Es de SOLO LECTURA: usa la operación `C` (consulta), que no da de alta ni anula nada. No
// existe todavía ningún envío real de partes — hoy los manda Chekin— y este cron NO envía ninguno.
//
// POR QUÉ EXISTE ANTES QUE EL CONECTOR:
//   1. **La hoja del certificado de SES caduca el 03/09/2026.** Cuando la roten, esto es lo único
//      que dirá si la cadena sigue cerrando. Sin el latido nos enteraríamos el día que hiciera
//      falta enviar un parte, con un plazo legal de 24 h corriendo.
//   2. El entorno de pruebas del Ministerio (`pre-ses`) devolvía 502 a todo el 20/08/2026: no hay
//      sandbox. Lo único que se puede ensayar sin riesgo es exactamente esto.
//
// SOBRE LA CADENA DE CA: no se configura nada a propósito. La raíz `AC RAIZ FNMT-RCM` es pública y
// está en el almacén estándar, y SES sirve el intermedio, así que la verificación por defecto de
// Node debería bastar. Si NO basta en Vercel, este latido lo dirá con un detalle que nombra el TLS
// —y entonces se carga `packages/module-ses/certs/ses-ca-bundle.pem` vía `NODE_EXTRA_CA_CERTS`.
// Averiguarlo es parte de lo que este cron está midiendo.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { ENDPOINTS, peticionConsulta, enviarSes, type Entorno } from '@central/module-ses'
import { evaluarSondaSes } from '@/lib/ses/sonda'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// UUID inexistente pero bien formado. La consulta de un lote que no existe es la petición más
// inocua que admite el servicio: ejercita todo el camino (TLS → Basic → cabecera → ZIP) sin tocar
// ni un dato del Ministerio.
const LOTE_INEXISTENTE = '00000000-0000-0000-0000-000000000000'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const usuario = process.env.SES_USUARIO
  const password = process.env.SES_PASSWORD
  const arrendador = process.env.SES_ARRENDADOR
  const entorno = (process.env.SES_ENTORNO ?? 'produccion') as Entorno
  const aplicacion = process.env.SES_APLICACION ?? 'central'

  // Sin credenciales NO se late en verde ni se calla: es un «no se ha podido mirar», que el vigía
  // debe ver igual que una avería. Un latido que se salta la comprobación cuando falta una env es
  // exactamente el check que se pone verde porque no miró.
  if (!usuario || !password || !arrendador) {
    const faltan = [
      !usuario && 'SES_USUARIO', !password && 'SES_PASSWORD', !arrendador && 'SES_ARRENDADOR',
    ].filter(Boolean).join(', ')
    const detalle = `sin credenciales configuradas en Vercel (faltan: ${faltan})`
    await registrarLatido('ses_transporte', false, detalle)
    return NextResponse.json({ ok: false, motivo: detalle })
  }

  const url = ENDPOINTS[entorno] ?? ENDPOINTS.produccion
  const respuesta = await enviarSes({
    url,
    credenciales: { usuario, password },
    sobre: peticionConsulta({ codigoArrendador: arrendador, aplicacion, lotes: [LOTE_INEXISTENTE] }),
  })

  const veredicto = evaluarSondaSes(respuesta)
  await registrarLatido('ses_transporte', veredicto.transporteOk, `${entorno} · ${veredicto.detalle}`)

  return NextResponse.json({
    ok: veredicto.transporteOk,
    entorno,
    clase: respuesta.clase,
    codigo: respuesta.codigo,
    detalle: veredicto.detalle,
  })
}
