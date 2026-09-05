import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  interpretarEscrituraSupresion,
  interpretarSupresiones,
  leerSupresion,
  pendientes,
  vencidas,
  SUPRESION_ESTADOS,
} from '../apps/plataforma/lib/supresiones-asegura.ts'
import { ESTADOS_SUPRESION } from '../packages/module-seguros-portal/src/supresion.ts'

/**
 * La pantalla de `/correduria` que enseña las solicitudes de SUPRESIÓN
 * (art. 17 RGPD) que abre el cliente en el portal.
 *
 * 🚨 Lo que se protege aquí no es que compile: es que un fallo de lectura no
 * pueda VERSE IGUAL que «no hay solicitudes». Detrás de cada fila hay un plazo
 * legal de un mes corriendo, y esa confusión lo incumple sola, en silencio.
 */

const LIB = 'apps/plataforma/lib/supresiones-asegura.ts'
const PANTALLA = 'apps/plataforma/app/(usuario)/correduria/Supresiones.tsx'
const RUTA = 'apps/plataforma/app/api/correduria/supresiones/route.ts'
const CLIENTE = 'apps/plataforma/app/(usuario)/correduria/CorreduriaClient.tsx'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const FILA = {
  id: 'a', identidadId: 'i', clienteId: null, recibidaEn: '2026-09-05T10:00:00.000Z',
  estado: 'recibida', plazo: 'en_plazo', fechaLimite: '2026-10-05T10:00:00.000Z',
  diasRestantes: 30, prorrogadaEn: null, prorrogaMotivo: null, resueltaEn: null,
  respuesta: null, resueltaPor: null, motivo: null, versionTextos: '2026-09-v4',
}

test('el vocabulario de estados NO diverge del módulo del portal', () => {
  // Es el fallo de la casa: alguien añade un estado en un sitio y la otra
  // pantalla se queda muda sobre esas filas.
  assert.deepEqual([...SUPRESION_ESTADOS], [...ESTADOS_SUPRESION])
})

test('🚨 un fallo NUNCA se lee como una cola vacía', () => {
  for (const [status, json] of [
    [500, null],
    [200, { estado: 'error', causa: 'credenciales' }],
    [200, {}],            // 200 sin lista: NO es «no hay»
    [401, null],
    [503, null],
    [404, null],
  ] as const) {
    const r = interpretarSupresiones(status, json)
    assert.notEqual(r.estado, 'ok', `status ${status} se está leyendo como una cola buena`)
  }
})

test('una lista de verdad, aunque venga vacía, SÍ es ok', () => {
  const r = interpretarSupresiones(200, { solicitudes: [], alcance: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.solicitudes.length, 0)
})

test('una fila con forma rara se cuenta como ilegible, no se esconde ni se inventa', () => {
  const r = interpretarSupresiones(200, { solicitudes: [FILA, { id: 'x' }, null], alcance: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.solicitudes.length, 1)
    assert.equal(r.ilegibles, 2)
  }
})

test('🚨 un estado o un plazo desconocido NO cae a uno tranquilo', () => {
  // Caer a `recibida`/`en_plazo` pintaría como tranquila una fila que no
  // entendemos — justo al revés de lo que hay que hacer con un plazo legal.
  assert.equal(leerSupresion({ ...FILA, estado: 'inventado' }), null)
  assert.equal(leerSupresion({ ...FILA, plazo: 'tranquilo' }), null)
})

test('los días restantes negativos se conservan: «fuera de plazo» no es «se acaba hoy»', () => {
  const s = leerSupresion({ ...FILA, plazo: 'vencido', diasRestantes: -12 })
  assert.ok(s)
  assert.equal(s!.diasRestantes, -12)
})

test('pendientes = las que tienen el reloj corriendo; vencidas van aparte', () => {
  const lista = [
    leerSupresion({ ...FILA, id: '1', plazo: 'en_plazo' })!,
    leerSupresion({ ...FILA, id: '2', plazo: 'urgente' })!,
    leerSupresion({ ...FILA, id: '3', plazo: 'vencido', diasRestantes: -3 })!,
    leerSupresion({ ...FILA, id: '4', estado: 'denegada', plazo: 'resuelta' })!,
  ]
  assert.equal(pendientes(lista).length, 3)
  // 🚨 El único número que autoriza a decir «hay un plazo incumplido».
  assert.equal(vencidas(lista).length, 1)
})

test('🚨 el contador que sube a la cabecera es null cuando no se pudo leer, nunca 0', () => {
  const src = leer(PANTALLA)
  assert.match(src, /avisar\.current\?\.\(r\.estado === 'ok' \? pendientes\([\s\S]{0,80}: null\)/)
})

test('🚨 la pantalla NO se calla cuando la lectura falla', () => {
  const src = leer(PANTALLA)
  assert.match(src, /No significa que no haya ninguna con el plazo corriendo/)
  // El `return null` silencioso solo es legítimo con una lectura BUENA y vacía.
  assert.match(src, /if \(lista\.length === 0 && ilegibles === 0\) return null/)
})

test('🚨 no se puede contestar sin texto (art. 12.4), y la pantalla dice por qué', () => {
  const src = leer(PANTALLA)
  assert.match(src, /const puedeContestar = respuesta\.trim\(\)\.length > 0/)
  assert.match(src, /art\. 12\.4/)
})

test('prorrogar exige motivo: una prórroga en silencio incumple igual', () => {
  const src = leer(PANTALLA)
  assert.match(src, /disabled=\{!prorroga\.trim\(\)/)
  assert.match(src, /art\. 12\.3/)
})

test('la pantalla enseña el alcance que se le prometió a la persona', () => {
  // Para que la respuesta se escriba contra lo que se le dijo, no de memoria.
  const src = leer(PANTALLA)
  assert.match(src, /Qué se le dijo que se borra y qué no/)
  assert.match(src, /trato === 'suprimible'/)
  assert.match(src, /trato === 'conservado'/)
})

test('🚨 «sin ficha enlazada» NO se pinta como «no es cliente»', () => {
  const src = sinComentarios(leer(PANTALLA))
  assert.match(src, /no está enlazado con ninguna ficha/)
  assert.ok(!/no es cliente/i.test(src), 'la pantalla afirma que no es cliente sobre un clienteId nulo')
})

test('el actor lo pone el SERVIDOR y va el último', () => {
  // Un cuerpo con su propio `actor` no puede firmar la respuesta con otro nombre.
  const src = leer(RUTA)
  assert.match(src, /\{ \.\.\.body, actor: session\.email \}/)
  assert.match(src, /getSession\(\)/)
  assert.match(src, /status: 401/)
})

test('la ruta reenvía al puerto de asegura; plataforma no toca la BD de la correduría', () => {
  const src = leer(LIB)
  assert.match(src, /\/api\/operador\/supresiones/)
  assert.match(src, /ASEGURA_OPERADOR_SECRET/)
  assert.ok(!/prisma/i.test(leer(RUTA)), 'la ruta de plataforma está tocando Prisma')
})

test('el bloque está MONTADO en la pantalla y suma al contador de «Hoy»', () => {
  // Un bloque construido y no montado es exactamente el fallo que este PR viene
  // a arreglar: la solicitud existiría y no la vería nadie.
  const src = leer(CLIENTE)
  assert.match(src, /<Supresiones onContador=\{setNSupresiones\} \/>/)
  assert.match(src, /agregarContadores\(\[nPartes, nSupresiones/)
})

test('la escritura separa «no se hizo por esto» de «no se pudo hacer»', () => {
  assert.equal(interpretarEscrituraSupresion(422, { motivo: 'sin_respuesta' }).estado, 'invalido')
  assert.equal(interpretarEscrituraSupresion(500, null).estado, 'error')
  assert.equal(interpretarEscrituraSupresion(503, null).estado, 'sin_configurar')
  assert.equal(interpretarEscrituraSupresion(404, null).estado, 'no_encontrado')
})
