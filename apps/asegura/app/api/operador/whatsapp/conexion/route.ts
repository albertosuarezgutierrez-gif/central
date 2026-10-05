import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { whatsappActivo, importarHistorial } from '@/lib/whatsapp/config'
import { versionGraph } from '@/lib/whatsapp/graph'
import { secretoWhatsapp } from '@/lib/whatsapp/secretos'
import { leerConexion, marcarAvisoEnviado } from '@/lib/whatsapp/conexion'

export const dynamic = 'force-dynamic'

/**
 * Estado de la conexión de WhatsApp de la correduría (para /correduria/ajustes/whatsapp y para el cron
 * de plataforma que avisa por Telegram). Doc: docs/WHATSAPP.md.
 *   GET                                  → { estado:'ok', conexion, configuracion }  (nunca el token)
 *   POST { accion:'avisado', eventoAt }  → plataforma ya mandó el Telegram de ESE evento
 * `configuracion` dice QUÉ falta (booleans, nunca valores). `conexion.estado` null = nunca conectada
 * (o no se sabe): la pantalla no lo pinta como «desconectada».
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const configuracion = {
    appId: secretoWhatsapp('WHATSAPP_APP_ID') !== null,
    appSecret: secretoWhatsapp('WHATSAPP_APP_SECRET') !== null,
    verifyToken: secretoWhatsapp('WHATSAPP_VERIFY_TOKEN') !== null,
    phoneNumberIdWebhook: secretoWhatsapp('WHATSAPP_PHONE_NUMBER_ID') !== null,
    versionGraph: versionGraph(),
    canalActivo: whatsappActivo(),
    importarHistorial: importarHistorial(),
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar', configuracion }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const conexion = await leerConexion(correduria.id)
    // ¿El número del webhook es el conectado? null = no se puede saber (falta uno de los dos).
    const env = secretoWhatsapp('WHATSAPP_PHONE_NUMBER_ID')
    const numeroCoincide = env && conexion?.phoneNumberId ? env === conexion.phoneNumberId : null
    return NextResponse.json({ estado: 'ok', conexion, configuracion: { ...configuracion, numeroCoincide } })
  } catch (e) {
    // Sin el SQL 2026-10-05e aplicado esto sale como `esquema`: la pantalla lo dice, no pinta «desconectada».
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/conexion', e), configuracion }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { accion?: unknown; eventoAt?: unknown } | null
  const t = typeof b?.eventoAt === 'string' ? Date.parse(b.eventoAt) : NaN
  if (b?.accion !== 'avisado' || Number.isNaN(t)) {
    return NextResponse.json({ estado: 'invalido', motivo: "se esperaba {accion:'avisado', eventoAt: ISO}" }, { status: 422 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const n = await marcarAvisoEnviado(correduria.id, new Date(t))
    return NextResponse.json({ estado: 'ok', marcados: n })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/conexion:post', e) }, { status: 500 })
  }
})
