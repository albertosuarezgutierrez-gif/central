import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@central/core-telegram'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { avisoWebAsegura } from '@/lib/cliente-edicion-asegura'
import { urlFichaCliente } from '@/lib/leads-web'
import { tgAviso } from '@/lib/telegram/avisos'

export const dynamic = 'force-dynamic'

// POST /api/publico/correduria/aviso?accion=solicitar|confirmar|baja — el «avísame antes de que
// venza» de la web pública (grupoasegura.es). SIN sesión, como `/lead`: la web no tiene secretos y
// este es el salto que le pone el Bearer de operador hacia asegura, que es quien guarda y envía.
//
// Límite por IP (best-effort, por instancia): 6/h para apuntarse, que es lo que manda un correo a
// un buzón que puede no ser de quien rellena; 30/h para confirmar y darse de baja, que solo canjean
// una llave. asegura añade su propio tope por correo (3 al día).
//
// Al CONFIRMAR se avisa a Alberto por Telegram: es cuando nace la ficha (lead) y la oportunidad.
// Ningún dato personal pasa por `console.*`, y el correo no viaja en el Telegram.
const ACCIONES = ['solicitar', 'confirmar', 'baja'] as const
type Accion = (typeof ACCIONES)[number]

const NOMBRE_RAMO: Record<string, string> = {
  auto: 'auto', hogar: 'hogar', comunidades: 'comunidad', comercio: 'comercio', responsabilidad_civil: 'responsabilidad civil',
}

export async function POST(req: NextRequest) {
  const accion = new URL(req.url).searchParams.get('accion') as Accion | null
  if (!accion || !ACCIONES.includes(accion)) return NextResponse.json({ ok: false, motivo: 'Acción no válida.' }, { status: 400 })
  const ip = getIp(req)
  const [clave, tope] = accion === 'solicitar' ? ['aviso-web', 6] : ['aviso-web-token', 30]
  if (!rateLimit(`${clave}:${ip}`, tope, 60 * 60 * 1000).allowed) {
    return NextResponse.json({ ok: false, motivo: 'Demasiadas solicitudes desde esta conexión. Inténtalo más tarde.' }, { status: 429 })
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  // Campo trampa: un humano no lo ve ni lo rellena. Al bot se le contesta «ok» sin hacer nada.
  if (accion === 'solicitar' && typeof body?.web === 'string' && body.web.trim() !== '') return NextResponse.json({ ok: true })
  const r = await avisoWebAsegura(accion, body)
  const j = (r.json ?? {}) as Record<string, unknown>

  if (accion === 'solicitar') {
    if (r.status === 200) return NextResponse.json({ ok: true })
    if (r.status === 422) return NextResponse.json({ ok: false, motivo: String(j.motivo ?? 'Datos no válidos.'), campo: j.campo ?? null }, { status: 422 })
    if (j.estado === 'saturado') {
      await tgAviso(
        'correduria.aviso-web',
        '🚨 <b>Avisos de la web: tope por hora alcanzado</b>\nSe han dejado de enviar correos de confirmación. Si no es una campaña tuya, puede ser alguien usando el formulario para mandar correos.',
      ).catch(() => {})
      return NextResponse.json({ ok: false, motivo: 'Ahora mismo no podemos enviarte el correo. Inténtalo en un rato.' }, { status: 503 })
    }
    if (j.estado === 'desactivado') {
      return NextResponse.json({ ok: false, motivo: 'Los avisos por correo aún no están disponibles. Guarda la fecha en tu área de clientes.' }, { status: 503 })
    }
    return NextResponse.json({ ok: false, motivo: 'Ahora mismo no podemos enviarte el correo. Inténtalo en unos minutos.' }, { status: 502 })
  }

  if (accion === 'confirmar') {
    if (r.status === 404) return NextResponse.json({ ok: false, motivo: 'El enlace no es válido o ha caducado.' }, { status: 404 })
    if (j.estado === 'desactivado') return NextResponse.json({ ok: false, motivo: 'Los avisos por correo no están disponibles ahora mismo.' }, { status: 503 })
    if (r.status !== 200) return NextResponse.json({ ok: false, motivo: 'Ahora mismo no podemos confirmarlo. Inténtalo en unos minutos.' }, { status: 502 })
    const ficha = j.ficha as { id: string; nueva: boolean; nombre: string; varias: boolean } | undefined
    if (j.yaEstaba !== true && ficha) {
      const ramo = NOMBRE_RAMO[String(j.ramo)] ?? String(j.ramo)
      const lineas = [
        '🔔 <b>Aviso de vencimiento confirmado desde la web</b>',
        `Seguro de ${escapeHtml(ramo)} · vence el ${escapeHtml(String(j.vence))}`,
        ficha.nueva
          ? `🆕 Ficha nueva (lead): <a href="${urlFichaCliente(ficha.id)}">abrir ficha</a>`
          : `♻️ Ya estaba en la cartera como <b>${escapeHtml(ficha.nombre)}</b>: <a href="${urlFichaCliente(ficha.id)}">abrir ficha</a>`,
        ...(ficha.varias ? ['⚠️ Ese correo está en VARIAS fichas: se ha colgado de la primera. Revisa si hay duplicado.'] : []),
        'Le escribiremos a 70 y 45 días del vencimiento con acceso a su área.',
      ]
      await tgAviso('correduria.aviso-web', lineas.join('\n')).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  // Baja: siempre ok hacia fuera (no se revela si la llave existía), salvo que asegura no conteste.
  if (r.status !== 200) return NextResponse.json({ ok: false, motivo: 'Ahora mismo no podemos procesarlo. Inténtalo en unos minutos.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
