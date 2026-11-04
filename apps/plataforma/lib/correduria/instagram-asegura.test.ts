// Cepos del Instagram de Grupo ASegura.
//
// 🚨 Un post publicado no se corrige: si el cepo deja pasar una promesa de precio,
// ya la ha visto quien la iba a ver. Por eso el cepo se prueba con textos que
// INFRINGEN (y tiene que pararlos), no solo con textos limpios.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '@central/module-seguros'
import {
  revisarPieza,
  decidirTrasRevision,
  interpretarCallbackAsig,
  callbackAsig,
  decidirPublicacion,
  elegirTema,
  elegirPlantilla,
  parsearPieza,
  captionFinal,
  pieMediador,
  aHexSrgb,
  construirPrompt,
  FICHAS_TEMA_IG,
  TEMAS_IG,
  ENV_IG_TOKEN,
  ENV_IG_USER,
  type PiezaIg,
} from './instagram-asegura.ts'

const LIMPIA: PiezaIg = {
  titulo: '¿Sabes qué actividad declara la póliza de tu local?',
  sub: 'Comercio y pyme',
  puntos: [],
  caption:
    'La línea de tu póliza que más se discute no está en la letra pequeña.\n\nEs la actividad declarada. La compañía acepta el riesgo que pone ahí, y si desde que firmaste has cambiado lo que haces en el local, ese riesgo ya no es el mismo. No es una trampa: es cómo funciona el contrato, y se arregla comunicándolo.\n\nAbre hoy la póliza y lee esa línea. Si tienes dudas, escríbeme y la miramos.',
}

// ─── El cepo de copy ─────────────────────────────────────────────────────────

test('cepo: una pieza limpia pasa', () => {
  assert.deepEqual(revisarPieza(LIMPIA, 'comercio', 'pregunta'), [])
})

test('cepo: promesa de precio EN LA IMAGEN se para (no solo en el caption)', () => {
  const r = revisarPieza({ ...LIMPIA, titulo: 'El seguro más barato para tu comercio' }, 'comercio', 'pregunta')
  assert.ok(r.some((x) => x.campo === 'copy' && /precio/.test(x.motivo)), JSON.stringify(r))
})

test('cepo: ahorro prometido en el caption se para', () => {
  const r = revisarPieza({ ...LIMPIA, caption: LIMPIA.caption + '\n\nTe ahorramos hasta un 30 % en tu póliza.' }, 'comercio', 'pregunta')
  assert.ok(r.some((x) => x.campo === 'copy'), JSON.stringify(r))
})

test('cepo: acotar a una ciudad se para (venta nacional)', () => {
  const r = revisarPieza({ ...LIMPIA, caption: LIMPIA.caption + ' Trabajamos en Sevilla.' }, 'comercio', 'pregunta')
  assert.ok(r.some((x) => x.campo === 'copy'), JSON.stringify(r))
})

test('cepo: norma no verificada se para; la permitida por la ficha pasa', () => {
  const inventada = revisarPieza({ ...LIMPIA, caption: LIMPIA.caption + ' Lo dice el artículo 12 de la Ley 50/1980.' }, 'comercio', 'pregunta')
  assert.ok(inventada.some((x) => x.campo === 'citas'), JSON.stringify(inventada))
  const permitida = revisarPieza(
    { ...LIMPIA, caption: LIMPIA.caption + ' Lo dice el artículo 22 de la Ley 50/1980.' },
    'renovacion', 'pregunta',
  )
  assert.ok(!permitida.some((x) => x.campo === 'citas'), JSON.stringify(permitida))
})

test('cepo: marca mal escrita, «módulos» y hashtags de relleno se paran', () => {
  const r = revisarPieza({ ...LIMPIA, caption: LIMPIA.caption + ' En Grupo Asegura tenemos módulos. #seguros #a #b #c' }, 'comercio', 'pregunta')
  const campos = new Set(r.map((x) => x.campo))
  assert.ok(campos.has('marca') && campos.has('copy') && campos.has('hashtags'), JSON.stringify(r))
})

test('cepo: número de puntos según plantilla', () => {
  assert.ok(revisarPieza({ ...LIMPIA, puntos: ['uno'] }, 'comercio', 'claves').some((x) => x.campo === 'puntos'))
  assert.deepEqual(revisarPieza({ ...LIMPIA, puntos: ['Lee la actividad declarada.', 'Comunica los cambios.', 'Guarda la confirmación.'] }, 'comercio', 'claves'), [])
})

test('cepo: el pie del mediador sale de MEDIADOR y pasa su propio cepo', () => {
  assert.ok(pieMediador().includes(MEDIADOR.identidad.claveDgsfp))
  assert.ok(pieMediador().startsWith(MEDIADOR.marca))
  assert.ok(captionFinal(LIMPIA).endsWith(pieMediador()))
})

test('regenerar una vez; si sigue, descartar', () => {
  const r = [{ campo: 'copy', motivo: 'x' }]
  assert.equal(decidirTrasRevision(1, []), 'aceptar')
  assert.equal(decidirTrasRevision(1, r), 'regenerar')
  assert.equal(decidirTrasRevision(2, r), 'descartar')
  assert.equal(decidirTrasRevision(2, []), 'aceptar')
})

test('el prompt del segundo intento lleva los reparos del primero', () => {
  const p = construirPrompt('comercio', 'pregunta', [{ campo: 'copy', motivo: 'promesa de precio' }])
  assert.match(p, /promesa de precio/)
  assert.match(p, /Grupo ASegura/)
})

// ─── Callback asig_ ──────────────────────────────────────────────────────────

const ID = '3f2b6c1e-8a4d-4c2e-9b1a-0d5e6f7a8b9c'

test('callback asig_: ida y vuelta de las tres acciones, y cabe en 64 bytes', () => {
  for (const a of ['aprobar', 'descartar', 'regenerar'] as const) {
    const d = callbackAsig(a, ID)
    assert.ok(Buffer.byteLength(d) <= 64, d)
    assert.deepEqual(interpretarCallbackAsig(d), { ok: true, accion: a, id: ID })
  }
})

test('callback asig_: acción desconocida, id corrupto u otro prefijo NO se interpretan', () => {
  assert.equal(interpretarCallbackAsig(`asig_publicar:${ID}`).ok, false)
  assert.equal(interpretarCallbackAsig('asig_aprobar:1 OR 1=1').ok, false)
  assert.equal(interpretarCallbackAsig(`ig_aprobar:${ID}`).ok, false)
  assert.equal(interpretarCallbackAsig(`asig_aprobar`).ok, false)
  assert.equal(interpretarCallbackAsig(undefined).ok, false)
})

// ─── Publicar vs manual ─────────────────────────────────────────────────────

test('publicar SOLO con las dos envs; si falta una (o está vacía), manual y dice cuál', () => {
  assert.deepEqual(decidirPublicacion({}), { modo: 'manual', faltan: [ENV_IG_TOKEN, ENV_IG_USER] })
  assert.deepEqual(decidirPublicacion({ [ENV_IG_TOKEN]: 'tok' }), { modo: 'manual', faltan: [ENV_IG_USER] })
  assert.deepEqual(decidirPublicacion({ [ENV_IG_TOKEN]: '  ', [ENV_IG_USER]: '1' }), { modo: 'manual', faltan: [ENV_IG_TOKEN] })
  assert.deepEqual(decidirPublicacion({ [ENV_IG_TOKEN]: 'tok', [ENV_IG_USER]: '178' }), {
    modo: 'graph', credenciales: { token: 'tok', userId: '178' },
  })
  // Las envs de ia.rest NO sirven para la correduría.
  assert.equal(decidirPublicacion({ INSTAGRAM_ACCESS_TOKEN: 'x', INSTAGRAM_USER_ID: 'y' }).modo, 'manual')
})

// ─── Elección y parseo ──────────────────────────────────────────────────────

test('elegirTema: nunca uno de los dos últimos; B2B pesa más', () => {
  for (let i = 0; i < 50; i++) {
    const t = elegirTema(['comunidades', 'comercio'], i / 50)
    assert.ok(t !== 'comunidades' && t !== 'comercio')
  }
  const cuenta: Record<string, number> = {}
  for (let i = 0; i < 1000; i++) { const t = elegirTema([], i / 1000); cuenta[t] = (cuenta[t] ?? 0) + 1 }
  assert.ok((cuenta.flota ?? 0) > (cuenta.marca ?? 0) * 2)
  assert.ok(TEMAS_IG.every((t) => FICHAS_TEMA_IG[t].tema === t))
})

test('elegirPlantilla rota y nunca repite la última', () => {
  assert.equal(elegirPlantilla(null), 'pregunta')
  assert.equal(elegirPlantilla('pregunta'), 'claves')
  assert.equal(elegirPlantilla('mito'), 'pregunta')
})

test('parsearPieza: tolera ```json``` y rechaza basura', () => {
  const p = parsearPieza('```json\n{"titulo":" T ","sub":"S","puntos":["a",3],"caption":"C"}\n```')
  assert.deepEqual(p, { titulo: 'T', sub: 'S', puntos: ['a'], caption: 'C' })
  assert.equal(parsearPieza('no hay json'), null)
})

test('aHexSrgb: el cobalto pasa tal cual y el blanco oklch(1 0 0) es #ffffff', () => {
  assert.equal(aHexSrgb('#3364EE'), '#3364ee')
  assert.equal(aHexSrgb('oklch(1 0 0)'), '#ffffff')
  assert.equal(aHexSrgb('oklch(0 0 0)'), '#000000')
  assert.throws(() => aHexSrgb('rebeccapurple'))
})
