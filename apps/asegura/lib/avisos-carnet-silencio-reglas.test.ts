// Cepo de «avisarme de la caducidad de mi carné» en el correo de la intranet: el interruptor es de una
// IDENTIDAD, el carné de una FICHA, y solo una identidad que OPERA la ficha puede apagarlo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fichasConCarnetSilenciado } from './avisos-carnet-silencio-reglas.ts'

const F1 = 'f1'
const F2 = 'f2'

test('sin identidades apagadas, o sin vínculos, no se calla nada (encendido por defecto)', () => {
  assert.equal(fichasConCarnetSilenciado({ vinculos: [{ identidadId: 'i1', clienteId: F1, nivel: 'gestionar' }], silenciadas: new Set() }).size, 0)
  assert.equal(fichasConCarnetSilenciado({ vinculos: [], silenciadas: new Set(['i1']) }).size, 0)
})

test('la identidad con el aviso apagado calla SU ficha, no la de otra identidad', () => {
  const r = fichasConCarnetSilenciado({
    vinculos: [
      { identidadId: 'i1', clienteId: F1, nivel: 'gestionar' },
      { identidadId: 'i2', clienteId: F2, nivel: 'administrar' },
    ],
    silenciadas: new Set(['i1']),
  })
  assert.deepEqual([...r], [F1])
})

test('🪤 un vínculo de solo consulta (tarjeta/completo/raro) a la ficha de OTRA persona no puede apagar su aviso', () => {
  for (const nivel of ['tarjeta', 'completo', 'root', '']) {
    const r = fichasConCarnetSilenciado({ vinculos: [{ identidadId: 'i1', clienteId: F1, nivel }], silenciadas: new Set(['i1']) })
    assert.equal(r.size, 0, `nivel «${nivel}» apagó el aviso de otra persona`)
  }
})

test('basta UNA identidad que opera la ficha con el aviso apagado', () => {
  const r = fichasConCarnetSilenciado({
    vinculos: [
      { identidadId: 'i1', clienteId: F1, nivel: 'gestionar' },
      { identidadId: 'i2', clienteId: F1, nivel: 'gestionar' },
    ],
    silenciadas: new Set(['i2']),
  })
  assert.deepEqual([...r], [F1])
})

test('el correo de la intranet SALTA el carné de una ficha apagada y lee el interruptor sin el vínculo del corredor', () => {
  const src = readFileSync(new URL('./avisos-intranet.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.match(src, /leerFichasConCarnetSilenciado\(db, \[\.\.\.titularesVivos\]\)/)
  assert.match(src, /if \(carnetApagado\.has\(c\.clienteId\)\) continue/)
  const io = readFileSync(new URL('./avisos-carnet-silencio.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.match(io, /origen: \{ not: ORIGEN_VINCULO_CORREDOR \}/)
  assert.match(io, /tipo: TIPO_AVISO_VENCIMIENTO_CARNET/)
})
