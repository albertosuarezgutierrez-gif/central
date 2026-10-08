// Recotizar tras un 409 `duplicado` (08/10/2026): la respuesta se reconoce, `forzar` viaja SOLO cuando es true y
// todas las pantallas que cotizan ofrecen el botón con confirmación.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { interpretarRetarificacion, retarificarAsegura } from './retarificar-asegura.ts'
import { cotizarAutoNuevaAsegura } from './auto-nuevo-asegura.ts'
import { cotizarMotoNuevaAsegura } from './moto-nuevo-asegura.ts'
import { cotizarHogarNuevoAsegura } from './hogar-nuevo-asegura.ts'
import { cotizarVidaNuevaAsegura } from './vida-nuevo-asegura.ts'
import { cotizarDecesosNuevaAsegura } from './decesos-nuevo-asegura.ts'
import { cotizarSaludNuevaAsegura } from './salud-nuevo-asegura.ts'

test('409 razon duplicado → duplicado_cotizacion (no «ramo»)', () => {
  const r = interpretarRetarificacion(409, { error: 'Cotización idéntica reciente', razon: 'duplicado', causa: 'duplicado', gastado: '0,00€' })
  assert.equal(r.estado, 'duplicado_cotizacion')
  assert.equal(interpretarRetarificacion(409, { mensaje: 'ramo no soportado' }).estado, 'ramo')
})

async function cuerpoEnviado(llamar: () => Promise<unknown>): Promise<Record<string, unknown>> {
  process.env.ASEGURA_OPERADOR_SECRET = 'test-secreto'
  process.env.ASEGURA_URL = 'https://asegura.test'
  let cuerpo: Record<string, unknown> = {}
  const f = mock.method(globalThis, 'fetch', async (_u: string, init: RequestInit) => {
    cuerpo = JSON.parse(String(init.body))
    return new Response('{}', { status: 500 })
  })
  try {
    await llamar()
  } finally {
    f.mock.restore()
  }
  return cuerpo
}

test('🪤 forzar viaja a asegura solo con true, en las siete rutas que cotizan', async () => {
  const llamadas: [string, (forzar?: boolean) => Promise<unknown>][] = [
    ['auto', (forzar) => cotizarAutoNuevaAsegura({ clienteId: 'c', forzar })],
    ['moto', (forzar) => cotizarMotoNuevaAsegura({ clienteId: 'c', forzar })],
    ['hogar', (forzar) => cotizarHogarNuevoAsegura({ clienteId: 'c', referencia: 'r', forzar })],
    ['vida', (forzar) => cotizarVidaNuevaAsegura({ clienteId: 'c', forzar })],
    ['decesos', (forzar) => cotizarDecesosNuevaAsegura({ clienteId: 'c', forzar })],
    ['salud', (forzar) => cotizarSaludNuevaAsegura({ clienteId: 'c', forzar })],
    ['retarificar', (forzar) => retarificarAsegura({ polizaId: 'p', forzar })],
  ]
  for (const [ramo, llamar] of llamadas) {
    assert.equal((await cuerpoEnviado(() => llamar(true))).forzar, true, `${ramo}: con forzar`)
    assert.equal('forzar' in (await cuerpoEnviado(() => llamar())), false, `${ramo}: por defecto no viaja`)
    assert.equal('forzar' in (await cuerpoEnviado(() => llamar(false))), false, `${ramo}: false no viaja`)
  }
})

test('las pantallas que cotizan ofrecen «Recotizar igualmente» con confirmación y reenvían forzar', () => {
  const base = '../app/(usuario)/correduria/'
  const pantallas = [
    'cliente/[id]/auto-nuevo/AutoNuevo.tsx', 'cliente/[id]/moto-nuevo/CotizadorMoto.tsx', 'cliente/[id]/hogar-nuevo/Formulario.tsx',
    'cliente/[id]/vida-nuevo/VidaNuevo.tsx', 'cliente/[id]/decesos-nuevo/DecesosNuevo.tsx', 'cliente/[id]/salud-nuevo/SaludNuevo.tsx',
    'poliza/[id]/retarificar/retarificador.tsx', 'poliza/[id]/retarificar/RetarificadorHogar.tsx',
  ]
  for (const p of pantallas) {
    const s = readFileSync(new URL(base + p, import.meta.url), 'utf8')
    assert.match(s, /<RecotizarIgualmente /, p)
    assert.match(s, /case 'duplicado_cotizacion'/, p)
    assert.match(s, /forzar/, p)
  }
  const c = readFileSync(new URL('../components/RecotizarIgualmente.tsx', import.meta.url), 'utf8')
  assert.match(c, /Recotizar igualmente \(0,50€\)/)
  assert.match(c, /window\.confirm/)
  assert.match(c, /minHeight: 44/)
  assert.match(c, /disabled=\{deshabilitado\}/)
})
