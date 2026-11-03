import { NextResponse } from 'next/server'
import { sendWebPush } from '@central/core-push'

import { depsPushClienteBd } from '@/lib/push-cliente-bd'
import { enviarPushACliente, leerPeticionPushCliente, pushClienteAutorizado } from '@/lib/push-cliente'
import { OPCIONES_AVISO, cargarVapid, topicAviso } from '@/lib/push-vapid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/operador/push-cliente (03/11/2026) — `apps/asegura` avisa en la APP a un cliente (hoy solo tras el ✅ de la
 * regularización de RC, con el enlace `/datos/<token>`). Cuerpo `{ clienteId, motivo, url }`; el TEXTO lo fija el portal
 * por `motivo` (`lib/push-cliente.ts`), no viaja en la petición.
 *
 * Autenticación: `Authorization: Bearer <ASEGURA_PORTAL_PUENTE_SECRET>` (el secreto que ya comparten las dos apps;
 * leído con `requireSecret`, sin fallback; comparación en tiempo constante con `bearerAutorizado`). Sin secreto
 * configurado o sin cabecera → 401 (cerrado por defecto). No hay cookie: el middleware no interviene.
 *
 * Respuestas: 200 `{ estado:'ok', enviados, fallidos, sinSuscripcion, omitidasPorPreferencia }` · 400 `invalida`
 * (url externa, motivo desconocido, clienteId no uuid) · 401 · 503 `sin_vapid`. Quien llama NUNCA hace depender de esto
 * el correo (asegura lo trata como aviso accesorio).
 */
export async function POST(req: Request) {
  const { requireSecret } = await import('@central/core-identity')
  if (!pushClienteAutorizado(req.headers.get('authorization'), requireSecret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const peticion = leerPeticionPushCliente(await req.json().catch(() => null))
  if (!peticion) return NextResponse.json({ estado: 'invalida' }, { status: 400 })

  const cargada = await cargarVapid()
  if (!cargada.ok) return NextResponse.json({ estado: 'error', causa: 'sin_vapid' }, { status: 503 })
  const vapid = cargada.vapid
  const topic = topicAviso(`push-cliente:${peticion.motivo}:${peticion.url}`)

  try {
    const r = await enviarPushACliente(
      peticion,
      depsPushClienteBd((s, payload) =>
        sendWebPush(vapid, { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } }, payload, { ...OPCIONES_AVISO, topic }),
      ),
    )
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('[operador/push-cliente] fallo:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error', causa: 'fallo_interno' }, { status: 500 })
  }
}
