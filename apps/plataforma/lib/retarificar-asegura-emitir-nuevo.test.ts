// Emisión a clientes NUEVOS (28/09/2026): las causas nuevas con las que
// `POST /api/operador/codeoscopic/emitir` de asegura corta ANTES del Submit.
// Si alguna cae al `error` genérico, la pantalla la pinta como «no hay respuesta
// clara» y el corredor no ve el botón «Emitir igualmente» (o, peor, reintenta
// algo que el interruptor apagado no va a dejar pasar nunca).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { interpretarEmitir } from './retarificar-asegura.ts'
import { resultadoEmision } from './correduria-emision-tg.ts'

const COLETILLA = ' Si aun así es una póliza nueva, confirma con `duplicadoConfirmado: true`.'

test('409 ya_en_cartera → duplicado, con las pólizas y el nº enmascarado, sin la coletilla técnica', () => {
  const r = interpretarEmitir(409, {
    estado: 'error',
    causa: 'ya_en_cartera',
    mensaje: 'La matrícula 1234ABC ya está asegurada en OTRA ficha de la cartera (póliza ••••1186): comprueba si es el mismo vehículo antes de emitir. No se ha enviado nada.' + COLETILLA,
    polizas: ['p1', 7, 'p2'],
    confirmar: true,
  })
  assert.equal(r.estado, 'duplicado')
  if (r.estado !== 'duplicado') return
  assert.equal(r.causa, 'ya_en_cartera')
  assert.deepEqual(r.polizas, ['p1', 'p2'])
  assert.match(r.mensaje, /••••1186/)
  assert.doesNotMatch(r.mensaje, /duplicadoConfirmado/)
})

test('409 ya_emitido → duplicado sin pólizas; sin mensaje cae al texto propio', () => {
  const r = interpretarEmitir(409, { estado: 'error', causa: 'ya_emitido', mensaje: 'Ya se le emitió otra póliza de hogar.' + COLETILLA })
  assert.equal(r.estado, 'duplicado')
  assert.deepEqual(r.estado === 'duplicado' ? r.polizas : null, [])
  const sin = interpretarEmitir(409, { causa: 'ya_emitido' })
  assert.match(sin.estado === 'duplicado' ? sin.mensaje : '', /últimos 30 días/)
})

test('identidad, proyecto_liberado, cliente_distinto (409) y tomador_fusionado (404) → bloqueado', () => {
  for (const [status, causa] of [
    [409, 'identidad'],
    [409, 'proyecto_liberado'],
    [409, 'cliente_distinto'],
    [404, 'tomador_fusionado'],
  ] as const) {
    const r = interpretarEmitir(status, { estado: 'error', causa, mensaje: `m-${causa}` })
    assert.equal(r.estado, 'bloqueado', causa)
    assert.equal(r.estado === 'bloqueado' ? r.causa : null, causa)
    assert.equal(r.estado === 'bloqueado' ? r.mensaje : null, `m-${causa}`)
  }
  // Un 404 `otro` («la póliza ya no existe») NO es un bloqueo nuevo: sigue siendo error.
  assert.equal(interpretarEmitir(404, { causa: 'otro', mensaje: 'x' }).estado, 'error')
})

test('503 apagado del interruptor NUEVO → nuevo_apagado; el apagado general sigue siendo sin_configurar', () => {
  const nuevo = interpretarEmitir(503, {
    estado: 'error',
    causa: 'apagado',
    mensaje: 'la emisión a clientes NUEVOS (sin póliza previa en cartera) está apagada: falta `CODEOSCOPIC_EMISION_NUEVO=1`. No se ha enviado nada.',
  })
  assert.equal(nuevo.estado, 'nuevo_apagado')
  assert.match(nuevo.estado === 'nuevo_apagado' ? nuevo.mensaje : '', /clientes nuevos está apagada/)
  const general = interpretarEmitir(503, { causa: 'apagado', mensaje: 'CODEOSCOPIC_EMISION_ACTIVA no está a 1' })
  assert.equal(general.estado, 'sin_configurar')
})

test('las causas viejas no cambian: ya_emitida sigue en error y reintento_sin_confirmar en su estado', () => {
  assert.equal(interpretarEmitir(409, { causa: 'ya_emitida', mensaje: 'ya consta' }).estado, 'error')
  assert.equal(interpretarEmitir(409, { causa: 'reintento_sin_confirmar' }).estado, 'reintento_sin_confirmar')
})

test('Telegram: los cortes nuevos son «rechazada» (consta que no salió nada), nunca «incierta»', () => {
  for (const r of [
    interpretarEmitir(409, { causa: 'ya_en_cartera', mensaje: 'x' }),
    interpretarEmitir(409, { causa: 'identidad', mensaje: 'x' }),
    interpretarEmitir(503, { causa: 'apagado', mensaje: 'falta `CODEOSCOPIC_EMISION_NUEVO=1`' }),
  ]) {
    assert.equal(resultadoEmision(r, 'https://x').estado, 'rechazada', r.estado)
  }
})

test('emitirAsegura y pedirEmision solo mandan duplicadoConfirmado cuando es true (lee el fuente)', () => {
  const lib = readFileSync(fileURLToPath(new URL('./retarificar-asegura.ts', import.meta.url)), 'utf8')
  assert.match(lib, /p\.duplicadoConfirmado === true \? \{ duplicadoConfirmado: true \} : \{\}/)
  const acc = readFileSync(
    fileURLToPath(new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/acciones.ts', import.meta.url)),
    'utf8',
  )
  assert.match(acc, /duplicadoConfirmado: entrada\.duplicadoConfirmado === true/)
})
