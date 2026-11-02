import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchSeguro, isPrivateIp, isSafePublicUrl, UrlNoPermitidaError } from './fetch-seguro.ts'

const redir = (to: string, status = 302) => new Response(null, { status, headers: { location: to } })
const ok = (body = 'BEGIN:VCALENDAR') => new Response(body, { status: 200 })
/** fetch falso: sirve respuestas por URL y apunta lo pedido (con las opciones recibidas). */
function falso(mapa: Record<string, Response>) {
  const pedidas: { url: string; redirect?: string }[] = []
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    pedidas.push({ url: String(u), redirect: init?.redirect })
    const r = mapa[String(u)]
    if (!r) throw new Error('no esperada: ' + u)
    return r
  }) as unknown as typeof fetch
  return { pedidas, fetchImpl }
}
// Validador determinista (sin DNS): el host público es ical.example.com / cdn.example.com.
const validar = async (u: string) => /^https?:\/\/(ical|cdn)\.example\.com\//.test(u)

test('sin redirección: devuelve la respuesta y pide con redirect:manual', async () => {
  const { pedidas, fetchImpl } = falso({ 'https://ical.example.com/a.ics': ok() })
  const res = await fetchSeguro('https://ical.example.com/a.ics', {}, { validar, fetchImpl })
  assert.equal(await res.text(), 'BEGIN:VCALENDAR')
  assert.deepEqual(pedidas.map((p) => p.redirect), ['manual'])
})

test('redirección legítima (mismo host https, ruta relativa) se sigue y el iCal llega', async () => {
  const { pedidas, fetchImpl } = falso({
    'https://ical.example.com/a.ics': redir('/nuevo/a.ics', 301),
    'https://ical.example.com/nuevo/a.ics': ok('OK'),
  })
  const res = await fetchSeguro('https://ical.example.com/a.ics', {}, { validar, fetchImpl })
  assert.equal(await res.text(), 'OK')
  assert.equal(pedidas.length, 2)
  assert.ok(pedidas.every((p) => p.redirect === 'manual'))
})

test('redirección a otro host público válido (cdn) también se sigue', async () => {
  const { fetchImpl } = falso({
    'https://ical.example.com/a.ics': redir('https://cdn.example.com/a.ics'),
    'https://cdn.example.com/a.ics': ok('CDN'),
  })
  assert.equal(await (await fetchSeguro('https://ical.example.com/a.ics', {}, { validar, fetchImpl })).text(), 'CDN')
})

test('SSRF: un host público que redirige a la metadata cloud se BLOQUEA y no se pide', async () => {
  const { pedidas, fetchImpl } = falso({
    'https://ical.example.com/a.ics': redir('http://169.254.169.254/latest/meta-data/'),
  })
  await assert.rejects(
    fetchSeguro('https://ical.example.com/a.ics', {}, { validar, fetchImpl }),
    (e: unknown) => e instanceof UrlNoPermitidaError,
  )
  assert.equal(pedidas.length, 1, 'el destino interno no se pidió nunca')
})

test('SSRF: redirección a localhost/IP privada con el validador real se bloquea', async () => {
  for (const destino of ['https://localhost/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://127.0.0.1:8080/x']) {
    const { pedidas, fetchImpl } = falso({ 'https://ical.example.com/a.ics': redir(destino) })
    await assert.rejects(
      fetchSeguro('https://ical.example.com/a.ics', {}, { validar: async (u) => u.startsWith('https://ical.') || (await isSafePublicUrl(u)), fetchImpl }),
      UrlNoPermitidaError,
      destino,
    )
    assert.equal(pedidas.length, 1)
  }
})

test('una redirección https→http se rechaza aunque el host sea válido', async () => {
  const { fetchImpl } = falso({ 'https://ical.example.com/a.ics': redir('http://ical.example.com/a.ics') })
  await assert.rejects(fetchSeguro('https://ical.example.com/a.ics', {}, { validar, fetchImpl }), UrlNoPermitidaError)
})

test('bucle de redirecciones: corta al superar maxSaltos', async () => {
  const { fetchImpl } = falso({ 'https://ical.example.com/a.ics': redir('https://ical.example.com/a.ics') })
  await assert.rejects(fetchSeguro('https://ical.example.com/a.ics', {}, { validar, fetchImpl, maxSaltos: 3 }), /Demasiadas/)
})

test('la URL inicial también se valida', async () => {
  const { pedidas, fetchImpl } = falso({})
  await assert.rejects(fetchSeguro('http://169.254.169.254/', {}, { validar, fetchImpl }), UrlNoPermitidaError)
  assert.equal(pedidas.length, 0)
})

test('3xx sin Location (p. ej. 304) se devuelve tal cual', async () => {
  const { fetchImpl } = falso({ 'https://ical.example.com/a.ics': new Response(null, { status: 304 }) })
  assert.equal((await fetchSeguro('https://ical.example.com/a.ics', {}, { validar, fetchImpl })).status, 304)
})

test('isPrivateIp / isSafePublicUrl: rangos internos fuera, literales públicos dentro', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateIp(ip), true, ip)
  }
  assert.equal(isPrivateIp('8.8.8.8'), false)
  assert.equal(await isSafePublicUrl('http://169.254.169.254/'), false)
  assert.equal(await isSafePublicUrl('file:///etc/passwd'), false)
  assert.equal(await isSafePublicUrl('https://8.8.8.8/x.ics'), true)
})

// Cepo estático: ningún fetch server-side con URL de usuario puede volver a seguir redirecciones solo.
test('ical-sync y google-leads piden las URLs de usuario con fetchSeguro, no con fetch a pelo', () => {
  for (const f of ['ical-sync.ts', 'google-leads.ts']) {
    const src = readFileSync(new URL('./' + f, import.meta.url), 'utf8')
    assert.match(src, /fetchSeguro\(/, f)
  }
  const ical = readFileSync(new URL('./ical-sync.ts', import.meta.url), 'utf8')
  assert.ok(!/[^.\w]fetch\(/.test(ical), 'ical-sync.ts no debe llamar a fetch() directamente')
  const leads = readFileSync(new URL('./google-leads.ts', import.meta.url), 'utf8')
  const sinApis = leads.split('\n').filter((l) => /[^.\w]fetch\(/.test(l) && !/PLACES_URL|APIFY/.test(l))
  assert.deepEqual(sinApis, [], 'solo las APIs fijas (Places/Apify) pueden usar fetch directo')
})
