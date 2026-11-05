// Causa del error del tarificador y reintento solo de lo transitorio (05/11/2026). `node --test`.
// Mensajes con la FORMA de los reales de `seguros.tarificacion_trabajos` (sin datos personales).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CODIGOS_ERROR,
  MAX_INTENTOS_TARIFICAR,
  codigoDeError,
  codigoDeErrorJson,
  codigoDerivado,
  esperaCumplida,
  estadoTarificarTrasFallo,
  maxIntentosModo,
  reintentarDesde,
} from './tarificador-error-codigo.ts'

test('lista cerrada: exactamente los nueve códigos acordados', () => {
  assert.deepEqual([...CODIGOS_ERROR], ['login', 'otp_captcha', 'guard_emision', 'sin_precio', 'timeout', 'portal_caido', 'datos_faltan', 'infra', 'otro'])
})

test('mapeo desde los tipos y mensajes que hay en BD', () => {
  const casos: [string, string, string][] = [
    ['emision', 'guard_emision: fase bloqueada: avance de pestaña td#x', 'guard_emision'],
    ['emision', 'exploración: guard_emision: url bloqueada (casa con el patrón de emisión)', 'guard_emision'],
    ['emision', 'Emisión rechazada por Telegram', 'otro'],
    ['captcha', 'requiere_verificacion_humana: Generali pide verificación: entra en su portal', 'otp_captcha'],
    ['captcha', 'requiere_eleccion_version: el catálogo ofrece 20 versiones', 'datos_faltan'],
    ['eleccion', 'requiere_eleccion_poblacion: el código postal tiene 2 poblaciones', 'datos_faltan'],
    ['credenciales', 'faltan los fly secrets CRED_X_USER / CRED_X_PASS', 'login'],
    ['datos', 'riesgo inválido: matricula: obligatoria', 'datos_faltan'],
    ['datos', 'sin adaptador para allianz/auto en esta imagen', 'otro'],
    ['infra', 'lease_vencido: el worker no devolvió resultado a tiempo', 'timeout'],
    ['infra', 'fly: The operation was aborted due to timeout', 'infra'],
    ['infra', 'fly: HTTP 503: x', 'infra'],
    ['infra', 'pilotaje: page.goto: net::ERR_NAME_NOT_RESOLVED at https://portal.example/', 'portal_caido'],
    ['portal', 'page.goto: Timeout 45000ms exceeded.', 'timeout'],
    ['portal', '[2.º intento (el 1.º falló por timeout)] page.waitForURL: Timeout 30000ms exceeded.', 'timeout'],
    ['portal', 'locator.click: Timeout 30000ms exceeded.\nCall log:\n\u001b[2m  - waiting for locator', 'otro'],
    ['portal', 'locator.fill: Timeout 30000ms exceeded.', 'otro'],
    ['portal', 'exploración: login asistido: la página salió del SSO sin llegar al portal', 'login'],
    ['portal', 'humo (login): allianz/sesion: no aparece «Mediador principal»', 'login'],
    ['portal', 'generali/auto: mapa incompleto: faltan el PRECIO de «Garantías y Resultados»', 'sin_precio'],
    ['portal', 'allianz/auto: mapa incompleto: faltan la pantalla de precios «Selección»', 'sin_precio'],
    ['portal', 'Atascado sin punto de espera: el robot paró', 'otro'],
    ['portal', 'el documento devolvió HTTP 502', 'portal_caido'],
    ['raro', 'page.goto: Timeout 1ms exceeded.', 'otro'],
  ]
  for (const [tipo, mensaje, esperado] of casos) assert.equal(codigoDerivado(tipo, mensaje), esperado, `${tipo} · ${mensaje}`)
})

test('el código del worker no convierte en transitorio lo determinista', () => {
  assert.equal(codigoDeError({ tipo: 'emision', mensaje: 'guard_emision: boton bloqueada', codigo: 'timeout' }), 'guard_emision')
  assert.equal(codigoDeError({ tipo: 'captcha', mensaje: 'requiere_verificacion_humana: x', codigo: 'portal_caido' }), 'otp_captcha')
  assert.equal(codigoDeError({ tipo: 'credenciales', mensaje: 'x', codigo: 'infra' }), 'login')
  assert.equal(codigoDeError({ tipo: 'datos', mensaje: 'riesgo inválido', codigo: 'timeout' }), 'datos_faltan')
  // Con un tipo que SÍ puede ser transitorio, lo que el mensaje dice determinista también manda.
  assert.equal(codigoDeError({ tipo: 'portal', mensaje: 'pelayo/login: no aparece ningún campo de contraseña', codigo: 'portal_caido' }), 'login')
  assert.equal(codigoDeError({ tipo: 'portal', mensaje: '[nota] requiere_verificacion_humana: x', codigo: 'timeout' }), 'otp_captcha')
  assert.equal(codigoDeError({ tipo: 'portal', mensaje: 'guard_emision: url bloqueada', codigo: 'timeout' }), 'guard_emision')
  // Tipo que no puede ser transitorio: el transitorio del worker no vale.
  assert.equal(codigoDeError({ tipo: 'datos', mensaje: 'sin adaptador para x', codigo: 'timeout' }), 'otro')
  // Sí afina un `portal` genérico, y un código fuera de lista se ignora.
  assert.equal(codigoDeError({ tipo: 'portal', mensaje: 'algo raro', codigo: 'portal_caido' }), 'portal_caido')
  assert.equal(codigoDeError({ tipo: 'portal', mensaje: 'algo raro', codigo: 'inventado' }), 'otro')
})

test('codigoDeErrorJson: guardado válido > derivado; sin error → null', () => {
  assert.equal(codigoDeErrorJson(null), null)
  assert.equal(codigoDeErrorJson([]), null)
  assert.equal(codigoDeErrorJson({ eleccionIa: {} }), null)
  assert.equal(codigoDeErrorJson({ tipo: 'portal', mensaje: 'page.goto: Timeout 1ms exceeded.' }), 'timeout')
  assert.equal(codigoDeErrorJson({ tipo: 'portal', codigo: 'sin_precio' }), 'sin_precio')
})

test('reintento: solo lo transitorio, como mucho 2 veces; nunca guard/otp/datos/login', () => {
  const e = (codigo: Parameters<typeof estadoTarificarTrasFallo>[0]['codigo'], intentos: number, extra: Partial<Parameters<typeof estadoTarificarTrasFallo>[0]> = {}) =>
    estadoTarificarTrasFallo({ base: 'error_definitivo', codigo, tipo: 'portal', intentos, conAtasco: false, ...extra })
  for (const c of ['timeout', 'portal_caido', 'infra'] as const) {
    assert.equal(e(c, 1), 'error_reintentable', c)
    assert.equal(e(c, 2), 'error_reintentable', c)
    assert.equal(e(c, 3), 'error_definitivo', c)
  }
  assert.equal(MAX_INTENTOS_TARIFICAR, 3)
  for (const c of ['guard_emision', 'otp_captcha', 'datos_faltan', 'login', 'sin_precio', 'otro'] as const) assert.equal(e(c, 1), 'error_definitivo', c)
  // Tipo que no es infra/portal (p. ej. emision mal etiquetada): nunca.
  assert.equal(e('timeout', 1, { tipo: 'emision' }), 'error_definitivo')
  // requiere_humano se respeta; con checkpoint de atasco manda la base (el atasco necesita error_definitivo).
  assert.equal(e('timeout', 1, { base: 'requiere_humano' }), 'requiere_humano')
  assert.equal(e('timeout', 1, { conAtasco: true }), 'error_definitivo')
  // intentos ilegibles → definitivo.
  assert.equal(e('infra', 0), 'error_definitivo')
  assert.equal(e('infra', 1.5), 'error_definitivo')
})

test('espera: 10 min antes del 1.er reintento, 30 antes del 2.º', () => {
  const ahora = new Date('2026-11-05T10:00:00.000Z')
  assert.equal(reintentarDesde(1, ahora), '2026-11-05T10:10:00.000Z')
  assert.equal(reintentarDesde(2, ahora), '2026-11-05T10:30:00.000Z')
  assert.equal(reintentarDesde(0, ahora), null)
  assert.equal(esperaCumplida('2026-11-05T10:10:00.000Z', new Date('2026-11-05T10:09:59Z')), false)
  assert.equal(esperaCumplida('2026-11-05T10:10:00.000Z', new Date('2026-11-05T10:10:00Z')), true)
  assert.equal(esperaCumplida(undefined, ahora), true)
  assert.equal(esperaCumplida('basura', ahora), true)
})

test('tope por modo: tarificar 3, el resto el común', () => {
  assert.equal(maxIntentosModo(null, 2), 3)
  assert.equal(maxIntentosModo('tarificar', 2), 3)
  for (const m of ['emision', 'exploracion', 'humo', 'pilotaje', 'vehiculo', 'identificar']) assert.equal(maxIntentosModo(m, 2), 2, m)
})

test('cable del worker: `error.codigo` de la lista viaja; fuera de lista se descarta sin rechazar el resultado', async () => {
  const { leerResultadoWorker } = await import('./tarificador-reglas.ts')
  const cuerpo = (codigo: unknown) => ({ trabajoId: '11111111-1111-4111-8111-111111111111', resultado: 'error', error: { tipo: 'portal', mensaje: 'page.goto: Timeout 1ms exceeded.', url: null, codigo } })
  const ok = leerResultadoWorker(cuerpo('timeout'))
  assert.ok(ok.ok && ok.r.tipo === 'error')
  assert.equal(ok.ok && ok.r.tipo === 'error' ? ok.r.error.codigo : 'x', 'timeout')
  const raro = leerResultadoWorker(cuerpo('borra_todo'))
  assert.ok(raro.ok && raro.r.tipo === 'error')
  assert.equal(raro.ok && raro.r.tipo === 'error' ? raro.r.error.codigo : 'x', undefined)
})
