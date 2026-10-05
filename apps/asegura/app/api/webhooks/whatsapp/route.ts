import { NextResponse, after } from 'next/server'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { importarHistorial, whatsappActivo } from '@/lib/whatsapp/config'
import { secretoWhatsapp } from '@/lib/whatsapp/secretos'
import { verificarFirmaMeta, verificarSuscripcion } from '@/lib/whatsapp/firma'
import { extraerMensajes, zWebhookWhatsapp } from '@/lib/whatsapp/payload'
import { guardarCrudos, guardarNoReconocido, procesarPendientes } from '@/lib/whatsapp/procesar'
import { extraerEventos } from '@/lib/whatsapp/eventos'
import { hayEventosDeCuenta, registrarEventosWebhook } from '@/lib/whatsapp/conexion'

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
// Coexistence); `statuses` se ignoran. Solo lo dirigido a WHATSAPP_PHONE_NUMBER_ID. Ediciones y
// borrados (`edit`/`revoke`) entran como mensajes y se aplican al original al procesar.
// Eventos de CUENTA (`account_update`, `history`, `smb_app_state_sync`; lib/whatsapp/eventos.ts): no
// llevan texto de nadie, así que se registran AUNQUE el canal esté apagado (el alta se hace antes de
// encenderlo y el «No compartir chats» llega a los pocos minutos). Fallo al registrarlos → 500 (Meta reintenta).
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
  let parseado: unknown
  try {
    parseado = JSON.parse(cuerpoCrudo)
  } catch {
    parseado = undefined
  }
  const v = parseado === undefined ? null : zWebhookWhatsapp.safeParse(parseado)
  const activo = whatsappActivo()

  // Eventos de cuenta: con el canal encendido o apagado (no llevan datos personales).
  const eventos = v?.success ? extraerEventos(v.data, numeroId) : null
  // Sin BD y con el canal apagado no se devuelve 503 (Meta reintentaría y podría desactivar el webhook).
  if (eventos && hayEventosDeCuenta(eventos) && (aseguraConfigurada() || activo)) {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    try {
      const correduria = await correduriaUnica()
      if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
      const r = await registrarEventosWebhook(correduria.id, eventos, { importarHistorial: importarHistorial(), canalActivo: activo })
      console.log(
        `[webhooks/whatsapp] cuenta: aplicados=${r.cuentas.aplicados} otra_waba=${r.cuentas.otraWaba} ignorados=${r.cuentas.ignorados}` +
          ` historial: no_compartido=${r.historial.noCompartido} descartados=${r.historial.descartados} crudo=${r.historial.guardadosCrudo} error_meta=${r.historial.errorMeta}` +
          ` contactos_acuse=${r.contactosSync}`,
      )
    } catch (e) {
      console.error('[webhooks/whatsapp] no se pudieron registrar los eventos de cuenta:', e instanceof Error ? e.name : e)
      return NextResponse.json({ estado: 'error' }, { status: 500 })
    }
  }
  if (eventos && eventos.noAdmitidos > 0) console.warn(`[webhooks/whatsapp] mensajes no admitidos por Meta (131060): ${eventos.noAdmitidos}`)

  // Apagado: se contesta 200 y no se guarda NINGÚN mensaje (ni el crudo). Meta da el evento por entregado.
  if (!activo) return NextResponse.json({ estado: 'inactivo' })
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
