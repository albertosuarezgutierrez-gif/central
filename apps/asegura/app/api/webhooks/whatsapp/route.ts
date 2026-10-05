import { NextResponse, after } from 'next/server'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { whatsappActivo } from '@/lib/whatsapp/config'
import { secretoWhatsapp } from '@/lib/whatsapp/secretos'
import { verificarFirmaMeta, verificarSuscripcion } from '@/lib/whatsapp/firma'
import { extraerMensajes, zWebhookWhatsapp } from '@/lib/whatsapp/payload'
import { guardarCrudos, guardarNoReconocido, procesarPendientes } from '@/lib/whatsapp/procesar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// /api/webhooks/whatsapp — WhatsApp Cloud API (Meta), SOLO ENTRANTE. Doc: apps/asegura/docs/WHATSAPP.md.
//
//   GET  → alta de la suscripción: devuelve `hub.challenge` si `hub.verify_token` es el nuestro
//          (tiempo constante). Sin WHATSAPP_VERIFY_TOKEN: 503.
//   POST → 1) firma X-Hub-Signature-256 del cuerpo CRUDO con WHATSAPP_APP_SECRET, ANTES de parsear;
//          2) ASEGURA_WHATSAPP_ACTIVO≠'1' → 200 sin guardar nada (un 4xx/5xx haría reintentar a Meta);
//          3) Zod safeParse; 4) guarda el crudo (dedupe por wamid); 5) 200 rápido; 6) procesa en `after`.
// Solo `messages` (entrantes) y `smb_message_echoes` (lo que Alberto escribe desde el móvil en
// Coexistence); `statuses` se ignoran. Solo lo dirigido a WHATSAPP_PHONE_NUMBER_ID.
// El número de teléfono NUNCA sale en el log.

export async function GET(req: Request) {
  const token = secretoWhatsapp('WHATSAPP_VERIFY_TOKEN')
  if (!token) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  const r = verificarSuscripcion(new URL(req.url).searchParams, token)
  if (!r.ok) return NextResponse.json({ estado: 'no_autorizado' }, { status: 403 })
  return new NextResponse(r.challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
}

export async function POST(req: Request) {
  const appSecret = secretoWhatsapp('WHATSAPP_APP_SECRET')
  const numeroId = secretoWhatsapp('WHATSAPP_PHONE_NUMBER_ID')
  if (!appSecret || !numeroId) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })

  const cuerpoCrudo = await req.text()
  if (!verificarFirmaMeta(cuerpoCrudo, req.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ estado: 'firma_invalida' }, { status: 401 })
  }
  // Apagado: se contesta 200 y no se guarda NADA (ni el crudo). Meta da el evento por entregado.
  if (!whatsappActivo()) return NextResponse.json({ estado: 'inactivo' })
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })

  let correduriaId: string
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    correduriaId = correduria.id
  } catch (e) {
    console.error('[webhooks/whatsapp] no se pudo resolver la correduría:', e instanceof Error ? e.name : e)
    return NextResponse.json({ estado: 'error' }, { status: 500 })
  }

  let parseado: unknown
  try {
    parseado = JSON.parse(cuerpoCrudo)
  } catch {
    parseado = undefined
  }
  const v = parseado === undefined ? null : zWebhookWhatsapp.safeParse(parseado)
  if (!v || !v.success) {
    // Firmado por Meta pero con una forma que no conocemos: se guarda tal cual (no se pierde) y 200.
    try {
      await guardarNoReconocido(correduriaId, cuerpoCrudo, parseado)
    } catch (e) {
      console.error('[webhooks/whatsapp] cuerpo no reconocido y no guardado:', e instanceof Error ? e.name : e)
      return NextResponse.json({ estado: 'error' }, { status: 500 })
    }
    console.warn('[webhooks/whatsapp] cuerpo firmado con forma desconocida: guardado como no_reconocido')
    return NextResponse.json({ estado: 'no_reconocido' })
  }

  const ex = extraerMensajes(v.data, numeroId)
  let nuevos: string[] = []
  let repetidos = 0
  try {
    const g = await guardarCrudos(correduriaId, ex.mensajes)
    nuevos = g.nuevos
    repetidos = g.repetidos
  } catch (e) {
    // Sin guardar no se contesta 200: Meta reintentará y el dedupe por wamid absorbe el repetido.
    console.error('[webhooks/whatsapp] no se pudo guardar el crudo:', e instanceof Error ? e.name : e)
    return NextResponse.json({ estado: 'error' }, { status: 500 })
  }

  if (nuevos.length > 0) {
    try {
      after(() =>
        procesarPendientes(correduriaId, nuevos).catch((e) =>
          console.error('[webhooks/whatsapp] procesado diferido falló (lo recoge el cron):', e instanceof Error ? e.name : e),
        ),
      )
    } catch (e) {
      console.error('[webhooks/whatsapp] no se pudo programar el procesado (lo recoge el cron):', e instanceof Error ? e.name : e)
    }
  }
  console.log(
    `[webhooks/whatsapp] nuevos=${nuevos.length} repetidos=${repetidos} estados=${ex.estados} otro_numero=${ex.otroNumero} otros_campos=${ex.otrosCampos} mal_formados=${ex.malFormados}`,
  )
  return NextResponse.json({ estado: 'ok', nuevos: nuevos.length, repetidos })
}
