import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CALLBACK_APLICAR,
  PREFIJO_WAP,
  botonesPropuesta,
  leerCallbackPropuesta,
  payloadPropuesta,
  puedeResolver,
  tareaAlAplicar,
  validarResolucion,
} from './propuestas-reglas.ts'

const ID = '33333333-3333-4333-8333-333333333333'
const AHORA = new Date('2026-11-04T10:00:00Z')
const MANANA = new Date('2026-11-05T10:00:00Z')

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

test('un solo uso: una propuesta ya aplicada/descartada → 409 (anti-replay)', () => {
  assert.deepEqual(puedeResolver({ estado: 'pendiente', caducaAt: MANANA }, 'aplicar', AHORA), { ok: true })
  for (const estado of ['aplicada', 'descartada', 'caducada'] as const) {
    const v = puedeResolver({ estado, caducaAt: MANANA }, 'aplicar', AHORA)
    assert.equal(v.ok, false)
    if (!v.ok) assert.equal(v.status, 409, estado)
  }
})

test('caducada (7 días) → no se aplica (410); descartarla sí se puede (limpia el botón)', () => {
  const v = puedeResolver({ estado: 'pendiente', caducaAt: AHORA }, 'aplicar', AHORA)
  assert.equal(v.ok, false)
  if (!v.ok) assert.equal(v.status, 410)
  assert.deepEqual(puedeResolver({ estado: 'pendiente', caducaAt: AHORA }, 'descartar', AHORA), { ok: true })
})

test('callback `wap_`: ida y vuelta, ≤64 bytes y nada que no sea nuestro', () => {
  assert.equal(PREFIJO_WAP, 'wap')
  const [ok, no] = botonesPropuesta(ID)
  assert.ok(Buffer.byteLength(ok.callback) <= 64)
  assert.deepEqual(leerCallbackPropuesta(ok.callback), { id: ID, decision: 'aplicar' })
  assert.deepEqual(leerCallbackPropuesta(no.callback), { id: ID, decision: 'descartar' })
  assert.equal(ok.callback.startsWith(`${CALLBACK_APLICAR}:`), true)
  assert.equal(leerCallbackPropuesta('clp_tar:123'), null)
  assert.equal(leerCallbackPropuesta(`wap_ok:${ID}:extra`), null)
})

test('el prefijo `wap` no lo usa ningún otro callback del monorepo (plataforma enruta por prefijo)', () => {
  const ruta = new URL('../../../plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url)
  const fuente = readFileSync(ruta, 'utf8')
  assert.ok(!/prefix === 'wap'/.test(fuente), 'otro handler ya usa el prefijo wap')
})

test('validación del endpoint de resolución', () => {
  assert.deepEqual(validarResolucion({ id: ID, decision: 'aplicar' }), { ok: true, id: ID, decision: 'aplicar' })
  assert.equal(validarResolucion({ id: ID, decision: 'ejecutar' }).ok, false)
  assert.equal(validarResolucion({ id: 'x', decision: 'aplicar' }).ok, false)
})

test('payload: solo la fecha (y nada para «pagado»); fecha mal formada → no se crea', () => {
  assert.deepEqual(payloadPropuesta('fecha_cobro', '2026-11-15'), { fecha: '2026-11-15' })
  assert.deepEqual(payloadPropuesta('pagado', 'lo que sea'), {})
  assert.equal(payloadPropuesta('vencimiento', '15/11/2026'), null)
})

test('tarea al aplicar: «comprobar cobro» el día prometido; «verificar cobro» hoy; vencimiento la decide editarOportunidad', () => {
  assert.deepEqual(tareaAlAplicar('fecha_cobro', '2026-11-15', '2026-11-04')?.fechaLimite, '2026-11-15')
  assert.equal(tareaAlAplicar('fecha_cobro', '2026-11-01', '2026-11-04')?.fechaLimite, '2026-11-04', 'una fecha ya pasada no deja una tarea vencida')
  assert.equal(tareaAlAplicar('pagado', null, '2026-11-04')?.fechaLimite, '2026-11-04')
  assert.equal(tareaAlAplicar('vencimiento', '2027-03-01', '2026-11-04'), null)
})

test('CEPO: aplicar «pagado» jamás cierra la devolución (sin resolverDevolucion) ni toca la situación del recibo', () => {
  const fuente = sinComentarios(readFileSync(new URL('./propuestas.ts', import.meta.url), 'utf8'))
  assert.ok(!/resolverDevolucion|devoluciones-recibo/.test(fuente), 'propuestas.ts no puede cerrar una devolución')
  assert.ok(!/set[^`]*\bsituacion\s*=/.test(fuente), 'propuestas.ts no puede cambiar la situación de un recibo')
  assert.ok(!/recibo_devolucion/.test(fuente), 'propuestas.ts no toca recibo_devolucion')
})

test('CEPO: ni el analizador ni el ejecutor ESCRIBEN recibos (las acciones de cobro solo crean propuesta)', () => {
  for (const f of ['./ejecutor.ts', './analizar.ts']) {
    const fuente = sinComentarios(readFileSync(new URL(f, import.meta.url), 'utf8'))
    assert.ok(!/update\s+poliza_recibos/i.test(fuente), `${f} no puede escribir poliza_recibos`)
    assert.ok(!/resolverDevolucion/.test(fuente), `${f} no puede cerrar una devolución`)
  }
})
