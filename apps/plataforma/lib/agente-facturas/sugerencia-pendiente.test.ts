import test from 'node:test'
import assert from 'node:assert/strict'
import { sugerirDesdeHistorico } from './sugerencia-pendiente.ts'

test('sin histórico y sin categoría útil NO se propone nada', () => {
  assert.deepEqual(sugerirDesdeHistorico({ categoria: null }, []), {
    propiedad: null, categoria: null, motivo: null,
  })
  // 'OTRO' es el cajón del extractor: no es una propuesta.
  assert.deepEqual(sugerirDesdeHistorico({ categoria: 'OTRO' }, []), {
    propiedad: null, categoria: null, motivo: null,
  })
})

test('propone el piso mayoritario del histórico del proveedor', () => {
  const s = sugerirDesdeHistorico({ categoria: null }, [
    { propiedad: 'prop_house_sevillana', categoria: 'LIMPIEZA' },
    { propiedad: 'prop_house_sevillana', categoria: 'LIMPIEZA' },
    { propiedad: 'prop_luxury_busto', categoria: 'LIMPIEZA' },
  ])
  assert.equal(s.propiedad, 'prop_house_sevillana')
  assert.equal(s.categoria, 'LIMPIEZA')
  assert.match(s.motivo ?? '', /3 factura/)
})

test('un EMPATE no se desempata: es justo el caso en que no se sabe', () => {
  const s = sugerirDesdeHistorico({ categoria: null }, [
    { propiedad: 'prop_house_sevillana', categoria: null },
    { propiedad: 'prop_luxury_busto', categoria: null },
  ])
  assert.equal(s.propiedad, null)
})

test('la categoría LEÍDA de la factura manda sobre el histórico', () => {
  const s = sugerirDesdeHistorico({ categoria: 'SUMINISTROS' }, [
    { propiedad: 'prop_duplex_center', categoria: 'LIMPIEZA' },
  ])
  assert.equal(s.categoria, 'SUMINISTROS')
  assert.match(s.motivo ?? '', /leída de la factura/)
})

test('si lo leído es el cajón OTRO, se cae al histórico', () => {
  const s = sugerirDesdeHistorico({ categoria: 'OTRO' }, [
    { propiedad: null, categoria: 'PLATAFORMAS' },
    { propiedad: null, categoria: 'PLATAFORMAS' },
  ])
  assert.equal(s.categoria, 'PLATAFORMAS')
  assert.match(s.motivo ?? '', /histórico/)
})

test('el histórico sin piso no inventa uno (correduría: propiedad NULL)', () => {
  // IONOS, Vercel, Anthropic… se imputan con propiedad NULL. Proponer un piso sería peor que
  // no proponer: la regla que nazca al confirmar heredaría el error y ya imputaría sola.
  const s = sugerirDesdeHistorico({ categoria: 'PLATAFORMAS' }, [
    { propiedad: null, categoria: 'PLATAFORMAS' },
    { propiedad: null, categoria: 'PLATAFORMAS' },
  ])
  assert.equal(s.propiedad, null)
  assert.equal(s.categoria, 'PLATAFORMAS')
})
