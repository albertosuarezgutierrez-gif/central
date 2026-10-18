// Vista previa «ver como el cliente» (18/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { destinoVistaCorredor, esVistaPreviaBorrador } from './vista-previa.ts'

const ID = '5ca3c18a-4057-4375-9828-81036f43cd28'

test('destino: solo un uuid exacto lleva al presupuesto; cualquier otra cosa, a la bóveda (sin redirección abierta)', () => {
  assert.equal(destinoVistaCorredor(ID), `/boveda/presupuesto/${ID}`)
  assert.equal(destinoVistaCorredor(ID.toUpperCase()), `/boveda/presupuesto/${ID}`)
  for (const raro of [null, undefined, '', 'https://malo.test', `../${ID}`, `${ID}/../../api`, `//malo.test/${ID}`, `${ID}?x=1`]) {
    assert.equal(destinoVistaCorredor(raro), '/boveda', String(raro))
  }
})

test('vista previa de BORRADOR: solo con la sesión del corredor y sin enviar', () => {
  assert.equal(esVistaPreviaBorrador({ vistaDeCorredor: true, enviadoAt: null }), true)
  assert.equal(esVistaPreviaBorrador({ vistaDeCorredor: true, enviadoAt: new Date() }), false)
  assert.equal(esVistaPreviaBorrador({ vistaDeCorredor: false, enviadoAt: null }), false, 'un cliente nunca está en «vista previa»')
})

test('cableado: la vista previa no sella visto, no escribe (middleware) y la puerta del corredor aterriza por la regla pura', () => {
  const lib = import.meta.dirname
  const ruta = readFileSync(join(lib, '..', 'app/corredor/[token]/route.ts'), 'utf8')
  assert.match(ruta, /destinoVistaCorredor\(new URL\(req\.url\)\.searchParams\.get\('presupuesto'\)\)/)
  const pres = readFileSync(join(lib, 'presupuesto.ts'), 'utf8')
  assert.match(pres, /if \(!vistaDeCorredor\) await sellarVisto\(/, 'Alberto mirando no sella visto_at')
  const mw = readFileSync(join(lib, '..', 'middleware.ts'), 'utf8')
  assert.match(mw, /return NextResponse\.json\(\{ error: 'modo_corredor'/, 'la sesión del corredor no escribe en /api/*')
})
