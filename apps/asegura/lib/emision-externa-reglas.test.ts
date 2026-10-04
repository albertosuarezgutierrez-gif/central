import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coincideCompania } from './emision-externa-reglas.ts'

test('nombre vacío o en blanco NO coincide (ni con nada ni consigo mismo)', () => {
  assert.equal(coincideCompania('', 'Allianz'), false)
  assert.equal(coincideCompania('Allianz', ''), false)
  assert.equal(coincideCompania('  ', 'Allianz'), false)
  assert.equal(coincideCompania('Allianz', '   '), false)
  assert.equal(coincideCompania('', ''), false)
})

test('Allianz vs Allianz Seguros coincide, en los dos sentidos y sin mayúsculas', () => {
  assert.equal(coincideCompania('Allianz', 'Allianz Seguros'), true)
  assert.equal(coincideCompania('Allianz Seguros', 'allianz'), true)
})

test('compañías distintas no coinciden', () => {
  assert.equal(coincideCompania('Reale', 'Allianz'), false)
})

import { hayPolizaDuplicada, quoteDataAGuardar } from './emision-externa-reglas.ts'

test('hayPolizaDuplicada: mismo nº (sin importar formato) y misma compañía = duplicada', () => {
  const ex = [{ aseguradora: 'Allianz Seguros', numeroPoliza: 'AB-123 456' }]
  assert.equal(hayPolizaDuplicada(ex, 'Allianz', 'ab123456'), true)
})

test('hayPolizaDuplicada: otro nº, otra compañía o sin datos = no duplicada', () => {
  const ex = [{ aseguradora: 'Allianz', numeroPoliza: '111' }]
  assert.equal(hayPolizaDuplicada(ex, 'Allianz', '222'), false)
  assert.equal(hayPolizaDuplicada(ex, 'Reale', '111'), false)
  assert.equal(hayPolizaDuplicada(ex, null, '111'), false)
  assert.equal(hayPolizaDuplicada(ex, 'Allianz', null), false)
  assert.equal(hayPolizaDuplicada([{ aseguradora: null, numeroPoliza: null }], 'Allianz', '111'), false)
})

const CRUDO_VIDA = {
  insuranceLine: { id: 'TermLife' },
  holder: { name: 'Pilar', surname: 'Franco', birthDate: '1980-02-03' },
  insureds: [
    { name: 'Lucía', surname: 'Gómez', secondSurname: 'Ruiz', birthDate: '1985-05-06', healthQuestionnaire: { smoker: true } },
    { name: 'Mario', birthDate: '2010-07-08' },
  ],
  risk: { medicalData: { disease: 'x' } },
  policyApplications: [{ status: { id: 'approved' }, insured: { name: 'Lucía', birthDate: '1985-05-06' } }],
}

for (const ramo of ['vida', 'salud', 'decesos']) {
  test(`quoteDataAGuardar (${ramo}): no queda ni un nombre ni una fecha de nacimiento`, () => {
    const out = JSON.stringify(quoteDataAGuardar(ramo, CRUDO_VIDA, { estado: 'aprobada' }, (v) => v))
    for (const prohibido of ['Pilar', 'Franco', 'Lucía', 'Gómez', 'Ruiz', 'Mario', '1980-02-03', '1985-05-06', '2010-07-08', 'birthDate', 'health', 'medical', 'smoker']) {
      assert.equal(out.includes(prohibido), false, `se coló «${prohibido}»`)
    }
    assert.equal((JSON.parse(out) as { asegurados: number }).asegurados, 3)
  })
}

test('quoteDataAGuardar: hogar/auto pasan por la redacción normal, sin recortar', () => {
  const r = quoteDataAGuardar('hogar', { a: 1 }, {}, (v) => ({ redactado: v })) as { redactado: unknown }
  assert.deepEqual(r.redactado, { a: 1 })
})

// Cepo de cableado: `emision-externa.ts` toca BD y no se puede ejecutar aquí, así que se vigila lo
// que NO puede faltar en su fuente (la póliza de origen, la comprobación de duplicado, la lista blanca).
import { readFileSync } from 'node:fs'
const FUENTE = readFileSync(new URL('./emision-externa.ts', import.meta.url), 'utf8')

test('emision-externa.ts: pasa polizaOrigenId, comprueba duplicados y guarda quote_data con lista blanca', () => {
  assert.match(FUENTE, /polizaOrigenId:\s*fila\?\.poliza_id/, 'el acuñado del cron tiene que pasar la póliza que se retarificaba')
  assert.match(FUENTE, /hayPolizaDuplicada\(existentes/, 'antes de acuñar se comprueba si la póliza ya existe')
  assert.match(FUENTE, /posible_duplicado/, 'el duplicado se manda a revisión con motivo legible')
  assert.match(FUENTE, /quoteDataAGuardar\(ramo,/, 'quote_data pasa por la lista blanca de ramos de personas')
  assert.doesNotMatch(FUENTE, /JSON\.stringify\(redactarCrudoVendor\(crudo\)\)/, 'el crudo no se guarda solo redactado')
})
