import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaTextoAIso } from './fecha-texto.ts'
import { normalizarAutoLeido } from './documento-auto.ts'
import { normalizarHogarLeido } from './documento-hogar.ts'

test('🪤 fecha en texto español, mes abreviado o completo → ISO', () => {
  assert.equal(fechaTextoAIso('2 de jul. de 1971'), '1971-07-02')
  assert.equal(fechaTextoAIso('2 de julio de 1971'), '1971-07-02')
  assert.equal(fechaTextoAIso('14 de sept. de 1980'), '1980-09-14')
  assert.equal(fechaTextoAIso('1 de Diciembre de 1999'), '1999-12-01')
  assert.equal(fechaTextoAIso('03 ago 2001'), '2001-08-03')
  assert.equal(fechaTextoAIso('9-feb-1965'), '1965-02-09')
  assert.equal(fechaTextoAIso('  4 de  may.  de 1974 '), '1974-05-04')
  assert.equal(fechaTextoAIso('1975-03-20'), '1975-03-20')
})

test('lo dudoso o imposible es «no se sabe»: null', () => {
  for (const f of ['05/03/1971', '2 de jul.', 'julio de 1971', '31 de feb. de 1990', '2 de jux. de 1971', '2026-02-31', '', 'N/A']) {
    assert.equal(fechaTextoAIso(f), null, `«${f}»`)
  }
  assert.equal(fechaTextoAIso(null), null)
  assert.equal(fechaTextoAIso(19710702), null)
})

test('la normalización del lector la aplica (auto y hogar); lo numérico sigue sin valer', () => {
  assert.equal(normalizarAutoLeido({ fechaNacimiento: '2 de jul. de 1971' }).fechaNacimiento, '1971-07-02')
  assert.equal(normalizarAutoLeido({ fechaEfecto: '15/10/2026' }).fechaEfecto, null)
  assert.equal(normalizarHogarLeido({ fechaVencimiento: '1 de enero de 2027' }).fechaVencimiento, '2027-01-01')
})
