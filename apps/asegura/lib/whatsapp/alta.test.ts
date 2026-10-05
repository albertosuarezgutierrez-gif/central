import { test } from 'node:test'
import assert from 'node:assert/strict'

import { darDeAltaWhatsapp, type DepsAlta } from './alta.ts'
import { crearClienteGraph, type FetchLike } from './graph.ts'

const CUERPO = { code: 'CODIGO-ES-123', waba_id: '111', phone_number_id: '222', business_id: '333' }

function montar(opciones: { secretos?: Record<string, string>; respuestas?: Array<{ status: number; json: unknown }>; cifrar?: (t: string) => string; numero?: string | null } = {}) {
  const urls: string[] = []
  const guardados: Record<string, unknown> = {}
  const respuestas = [...(opciones.respuestas ?? [])]
  const f: FetchLike = async (url) => {
    urls.push(url)
    const r = respuestas.shift() ?? { status: 500, json: null }
    return new Response(JSON.stringify(r.json), { status: r.status })
  }
  const secretos = opciones.secretos ?? { WHATSAPP_APP_ID: 'APPID', WHATSAPP_APP_SECRET: 'APPSECRET' }
  const deps: DepsAlta = {
    secreto: (n) => secretos[n] ?? null,
    version: 'v24.0',
    graph: (version) => crearClienteGraph({ version, fetch: f }),
    cifrar: opciones.cifrar ?? ((t) => `v1:iv:${Buffer.from(t).toString('base64')}:tag`),
    numeroDelWebhook: opciones.numero === undefined ? '222' : opciones.numero,
    guardarAlta: async (d) => { guardados.alta = d },
    guardarSuscripcion: async () => { guardados.suscripcion = true },
    guardarSync: async (tipo, id) => { guardados[`sync_${tipo}`] = id },
    guardarVerificacion: async (v) => { guardados.verificacion = v },
  }
  return { deps, urls, guardados }
}

const TODO_OK = [
  { status: 200, json: { access_token: 'EAAG-token-de-negocio' } },
  { status: 200, json: { success: true } },
  { status: 200, json: { request_id: 'R-CONT' } },
  { status: 200, json: { request_id: 'R-HIST' } },
  { status: 200, json: { is_on_biz_app: true, platform_type: 'CLOUD_API' } },
]

test('alta sin WHATSAPP_APP_ID / WHATSAPP_APP_SECRET → 503 y NO se llama a Meta (el code no se gasta)', async () => {
  const { deps, urls } = montar({ secretos: {} })
  const r = await darDeAltaWhatsapp(CUERPO, deps)
  assert.equal(r.status, 503)
  assert.equal(r.cuerpo.estado, 'sin_configurar')
  assert.deepEqual(r.cuerpo.faltan, ['WHATSAPP_APP_ID', 'WHATSAPP_APP_SECRET'])
  assert.equal(urls.length, 0)
})

test('sin cifrado disponible (encryptField devuelve el texto tal cual) → 503 ANTES del canje', async () => {
  const { deps, urls } = montar({ cifrar: (t) => t })
  const r = await darDeAltaWhatsapp(CUERPO, deps)
  assert.equal(r.status, 503)
  assert.equal(r.cuerpo.estado, 'sin_clave_pii')
  assert.equal(urls.length, 0)
})

test('cuerpo inválido (id no numérico, campo extra) → 422 sin llamar a Meta', async () => {
  const { deps, urls } = montar()
  assert.equal((await darDeAltaWhatsapp({ ...CUERPO, waba_id: '1/../x' }, deps)).status, 422)
  assert.equal((await darDeAltaWhatsapp({ ...CUERPO, token: 'x' }, deps)).status, 422)
  assert.equal(urls.length, 0)
})

test('alta completa: canje → guarda token CIFRADO → suscribe → syncs (contactos y luego historial) → verifica', async () => {
  const { deps, urls, guardados } = montar({ respuestas: [...TODO_OK] })
  const r = await darDeAltaWhatsapp(CUERPO, deps)
  assert.equal(r.status, 200)
  assert.equal(r.cuerpo.estado, 'ok')
  const alta = guardados.alta as { tokenCifrado: string; wabaId: string; phoneNumberId: string; businessId: string }
  assert.ok(alta.tokenCifrado.startsWith('v1:'))
  assert.ok(!alta.tokenCifrado.includes('EAAG-token-de-negocio'))
  assert.equal(alta.wabaId, '111')
  assert.equal(guardados.sync_contactos, 'R-CONT')
  assert.equal(guardados.sync_historial, 'R-HIST')
  assert.deepEqual(guardados.verificacion, { isOnBizApp: true, platformType: 'CLOUD_API' })
  assert.match(urls[0], /oauth\/access_token/)
  assert.match(urls[1], /\/111\/subscribed_apps$/)
  assert.match(urls[2], /\/222\/smb_app_data$/)
  assert.match(urls[3], /\/222\/smb_app_data$/)
  assert.match(urls[4], /\/222\?fields=is_on_biz_app,platform_type$/)
  assert.ok(!urls.some((u) => /\/register|\/messages/.test(u)), 'ni registro del número ni envío')
  assert.ok(!JSON.stringify(r.cuerpo).includes('EAAG'), 'el token no sale en la respuesta')
})

test('suscripción fallida → syncs SIN pedir (cada una es de un solo uso) y estado parcial', async () => {
  const { deps, urls, guardados } = montar({
    respuestas: [{ status: 200, json: { access_token: 'EAAG-x-token' } }, { status: 403, json: { error: { code: 200, message: 'Permissions error' } } }, { status: 200, json: { is_on_biz_app: true, platform_type: 'CLOUD_API' } }],
  })
  const r = await darDeAltaWhatsapp(CUERPO, deps)
  assert.equal(r.cuerpo.estado, 'parcial')
  const pasos = r.cuerpo.pasos as Record<string, { estado: string }>
  assert.equal(pasos.suscripcion.estado, 'fallo')
  assert.equal(pasos.syncContactos.estado, 'sin_pedir')
  assert.equal(pasos.syncHistorial.estado, 'sin_pedir')
  assert.equal(urls.filter((u) => u.includes('smb_app_data')).length, 0)
  assert.equal(guardados.sync_historial, undefined)
})

test('canje fallido → 502 y no se guarda nada', async () => {
  const { deps, guardados } = montar({ respuestas: [{ status: 400, json: { error: { code: 100, message: 'expired' } } }] })
  const r = await darDeAltaWhatsapp(CUERPO, deps)
  assert.equal(r.status, 502)
  assert.equal(guardados.alta, undefined)
})

test('número no en la app del móvil o WHATSAPP_PHONE_NUMBER_ID distinto → avisos', async () => {
  const resp = [...TODO_OK]
  resp[4] = { status: 200, json: { is_on_biz_app: false, platform_type: 'CLOUD_API' } }
  const { deps } = montar({ respuestas: resp, numero: '999' })
  const r = await darDeAltaWhatsapp(CUERPO, deps)
  const avisos = r.cuerpo.avisos as string[]
  assert.ok(avisos.some((a) => a.includes('is_on_biz_app=false')))
  assert.ok(avisos.some((a) => a.includes('NO es el número')))
})
