// Estado del tarificador (04/11/2026): agregación pura y redacción del error. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claveCompania,
  estadoBot,
  indicadores,
  parejaDeEntrada,
  proyectarAvant2,
  proyectarEstado,
  redactarError,
  redactarUrl,
  type Entrada,
} from './tarificador-estado-reglas.ts'

const vacia = (x: Partial<Entrada> = {}): Entrada => ({ precios: [], trabajos: [], errores: [], exploraciones: [], pilotajes: [], ...x })

test('redactarUrl: origen + ruta, sin query ni fragmento, tramos con pinta de dato enmascarados', () => {
  assert.deepEqual(redactarUrl('https://www.e-pacallianz.com/epac/cotizar/paso2?matricula=1234ABC&dni=12345678Z#x'), {
    origen: 'https://www.e-pacallianz.com', ruta: '/epac/cotizar/paso2',
  })
  assert.deepEqual(redactarUrl('https://wmediadores.mapfre.com/poliza/40681298/cliente/ana%40correo.es/ver'), {
    origen: 'https://wmediadores.mapfre.com', ruta: '/poliza/:dato/cliente/:dato/ver',
  })
  assert.deepEqual(redactarUrl('https://x.es/a/3f2b9c1e-1111-2222-3333-444455556666/Juan%20P%C3%A9rez'), { origen: 'https://x.es', ruta: '/a/:dato/:dato' })
  assert.deepEqual(redactarUrl('https://user:clave@x.es/'), { origen: 'https://x.es', ruta: '/' }, 'nunca credenciales del userinfo')
  assert.deepEqual(redactarUrl('javascript:alert(1)'), { origen: null, ruta: null })
  assert.deepEqual(redactarUrl('no es url'), { origen: null, ruta: null })
  assert.deepEqual(redactarUrl(undefined), { origen: null, ruta: null })
})

test('redactarError: SOLO tipo (lista cerrada), clave identificador y URL redactada; nunca el mensaje', () => {
  const r = redactarError({
    tipo: 'portal', mensaje: 'No se encontró la matrícula 1234ABC de Juan Pérez (DNI 12345678Z)', atascoClave: 'hueco_mapa',
    url: 'https://www.generali.es/mediadores/tarificar?nif=12345678Z', html_documento_id: 'abc', capturaConDatos: 'data:…',
  })
  assert.deepEqual(r, { tipo: 'portal', codigo: 'otro', clave: 'hueco_mapa', origen: 'https://www.generali.es', ruta: '/mediadores/tarificar' })
  const json = JSON.stringify(r)
  for (const prohibido of ['1234ABC', '12345678Z', 'Juan', 'mensaje', 'html', 'captura', 'nif']) assert.ok(!json.includes(prohibido), prohibido)

  assert.equal(redactarError({ tipo: 'algo que se inventó el worker con datos 1234ABC' })!.tipo, 'otro', 'un tipo desconocido no se repite')
  assert.equal(redactarError({ mensaje: 'x' })!.tipo, 'desconocido')
  assert.equal(redactarError({ tipo: 'datos', atascoClave: 'Calle Mayor 3' })!.clave, null, 'una clave con pinta de valor no sale')
  assert.equal(redactarError(null), null)
  assert.equal(redactarError('texto'), null)
})

test('claveCompania y parejaDeEntrada normalizan para cruzar RPA y Avant2', () => {
  assert.equal(claveCompania(' Allianz '), 'allianz')
  assert.equal(claveCompania('Mútua Madrileña'), 'mutua_madrilena')
  assert.equal(claveCompania(''), null)
  assert.deepEqual(parejaDeEntrada('pelayo:presupuestos:auto'), { compania: 'pelayo', ramo: 'auto' })
  assert.equal(parejaDeEntrada('pelayo'), null)
})

test('estadoBot: activo > pilotaje > exploración > sin bot', () => {
  assert.equal(estadoBot({ tarificarTotal: 1, pilotaje: true, exploracion: true }), 'activo')
  assert.equal(estadoBot({ tarificarTotal: 0, pilotaje: true, exploracion: true }), 'pilotaje')
  assert.equal(estadoBot({ tarificarTotal: 0, pilotaje: false, exploracion: true }), 'exploracion')
  assert.equal(estadoBot({ tarificarTotal: 0, pilotaje: false, exploracion: false }), 'sin_bot')
})

test('proyectarEstado: último precio entre canales, ventanas, último error redactado y estado del bot', () => {
  const filas = proyectarEstado(vacia({
    precios: [
      { compania: 'Allianz', ramo: 'auto', canal: 'codeoscopic', creado_at: '2026-10-15T08:00:00Z', prima: 384.7 },
      { compania: 'allianz', ramo: 'auto', canal: 'rpa', creado_at: new Date('2026-11-02T10:00:00Z'), prima: '309.57' },
      { compania: 'Reale', ramo: 'moto', canal: 'codeoscopic', creado_at: '2026-10-07T00:00:00Z', prima: 102.88 },
      { compania: 'Rara', ramo: 'auto', canal: 'fax', creado_at: '2026-10-07T00:00:00Z', prima: 1 },
    ],
    trabajos: [{ compania: 'allianz', ramo: 'auto', ok_7d: 3, error_7d: 1, ok_30d: 10, error_30d: 4, tarificar_total: 40 }],
    errores: [
      { compania: 'allianz', ramo: 'auto', modo: 'tarificar', created_at: '2026-10-27T00:00:00Z', error: { tipo: 'portal', url: 'https://www.e-pacallianz.com/a?b=1' } },
      { compania: 'pelayo', ramo: 'auto', modo: 'pilotaje', created_at: '2026-11-04T00:00:00Z', error: { tipo: 'captcha' } },
    ],
    pilotajes: [{ compania: 'pelayo', ramo: 'auto', abiertas: 0, recientes: 2, ultima_at: null }],
    exploraciones: [
      { compania: 'mapfre', ramo: 'patinete', abiertas: 1, recientes: 0, ultima_at: null },
      { compania: 'occident', ramo: 'hogar', abiertas: 0, recientes: 0, ultima_at: null },
    ],
  }))
  const por = (c: string, r: string) => filas.find((f) => f.compania === c && f.ramo === r)
  const az = por('allianz', 'auto')!
  assert.deepEqual(az.ultimoPrecio, { fecha: '2026-11-02T10:00:00.000Z', canal: 'rpa', primaEur: 309.57 })
  assert.deepEqual(az.d7, { ok: 3, error: 1 })
  assert.deepEqual(az.d30, { ok: 10, error: 4 })
  assert.equal(az.estadoBot, 'activo')
  assert.deepEqual(az.ultimoError, { tipo: 'portal', codigo: 'otro', clave: null, origen: 'https://www.e-pacallianz.com', ruta: '/a', fecha: '2026-10-27T00:00:00.000Z', modo: 'tarificar' })
  assert.equal(por('reale', 'moto')!.estadoBot, 'sin_bot', 'solo precio de Avant2: no hay bot')
  assert.deepEqual(por('reale', 'moto')!.d30, { ok: 0, error: 0 })
  assert.equal(por('pelayo', 'auto')!.estadoBot, 'pilotaje')
  assert.equal(por('mapfre', 'patinete')!.estadoBot, 'exploracion')
  assert.equal(por('occident', 'hogar'), undefined, 'una exploración vieja y cerrada no crea fila')
  assert.equal(por('rara', 'auto'), undefined, 'un canal desconocido no es un precio')
  assert.deepEqual(filas.map((f) => f.estadoBot), ['activo', 'pilotaje', 'exploracion', 'sin_bot'], 'orden por estado')
  assert.equal(proyectarEstado(vacia({ precios: [{ compania: 'x', ramo: 'auto', canal: 'rpa', creado_at: '2026-10-01T00:00:00Z', prima: null }] }))[0]!.ultimoPrecio!.primaEur, null, 'prima ausente = null, nunca 0')
})

test('indicadores y Avant2 del mes', () => {
  const filas = proyectarEstado(vacia({ trabajos: [
    { compania: 'a', ramo: 'auto', ok_7d: 3, error_7d: 1, ok_30d: 3, error_30d: 1, tarificar_total: 4 },
    { compania: 'b', ramo: 'auto', ok_7d: 0, error_7d: 0, ok_30d: 0, error_30d: 0, tarificar_total: 1 },
  ] }))
  const i = indicadores(filas)
  assert.equal(i.pctOk7d, 75)
  assert.equal(i.bots.activo, 2)
  assert.equal(indicadores([]).pctOk7d, null, 'sin trabajos el % es «sin datos»')

  const a = proyectarAvant2('2026-11', [{ ramo: 'auto', cents: 350, n: 7 }, { ramo: null, cents: 200, n: 4 }, { ramo: 'moto', cents: 100, n: 2 }])
  assert.equal(a.totalEur, 6.5)
  assert.equal(a.facturables, 13)
  assert.deepEqual(a.porRamo.map((r) => r.ramo), ['auto', 'sin_ramo', 'moto'])
  assert.deepEqual(proyectarAvant2('2026-11', []), { mes: '2026-11', totalEur: 0, facturables: 0, porRamo: [] }, 'mes sin consumo: 0 € leído (≠ null)')
})

test('causas de 7 días: agrupa por código (guardado o derivado del tipo+mensaje), sin repetir el mensaje', async () => {
  const { causaDominante } = await import('./tarificador-estado-reglas.ts')
  const filas = proyectarEstado(vacia({
    trabajos: [{ compania: 'generali', ramo: 'auto', ok_7d: 0, error_7d: 4, ok_30d: 0, error_30d: 4, tarificar_total: 4 }],
    causas: [
      { compania: 'generali', ramo: 'auto', error: { tipo: 'portal', codigo: 'timeout' } },
      { compania: 'generali', ramo: 'auto', error: { tipo: 'portal', mensaje: 'page.goto: Timeout 45000ms exceeded. matrícula 1234ABC' } },
      { compania: 'generali', ramo: 'auto', error: { tipo: 'emision', mensaje: 'guard_emision: boton bloqueada' } },
      { compania: 'generali', ramo: 'auto', error: null },
    ],
  }))
  const g = filas.find((f) => f.compania === 'generali')!
  assert.deepEqual(g.causas7d, [{ codigo: 'timeout', n: 2 }, { codigo: 'guard_emision', n: 1 }])
  assert.deepEqual(causaDominante(g.causas7d), { codigo: 'timeout', n: 2 })
  assert.ok(!JSON.stringify(filas).includes('1234ABC'), 'el mensaje no sale')
  // Sin leer (null) ≠ sin errores ([]).
  assert.equal(proyectarEstado(vacia({ trabajos: [{ compania: 'x', ramo: 'auto', ok_7d: 1, error_7d: 0, ok_30d: 1, error_30d: 0, tarificar_total: 1 }] }))[0]!.causas7d, null)
  assert.deepEqual(proyectarEstado(vacia({ causas: [], trabajos: [{ compania: 'x', ramo: 'auto', ok_7d: 1, error_7d: 0, ok_30d: 1, error_30d: 0, tarificar_total: 1 }] }))[0]!.causas7d, [])
  assert.equal(causaDominante(null), null)
})
