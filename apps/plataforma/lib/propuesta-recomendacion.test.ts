// Recomendación de la oportunidad (08/10/2026). `node --test`, puro.
// Para verlo en rojo: en `leerRecomendacion` quita la comprobación `typeof r.recomendable !== 'boolean'` o haz que `recomendada`
// salga aunque la oferta no sea recomendable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveTrabajosConOferta, leerRecomendacion } from './propuesta-recomendacion.ts'

const OK = {
  estado: 'ok',
  recomendada: { ofertaId: 'a:0', compania: 'Allianz', producto: 'Comunidades', puntos: 81.5, motivos: ['Precio anual más bajo (1.000,00€)'], reservas: ['Ficha sin validar'], empate: false },
  ofertas: [
    { ofertaId: 'a:0', compania: 'Allianz', producto: 'Comunidades', primaAnualEur: 1000, recomendable: true, calidad: { ok: true, errores: [], avisos: [{ codigo: 'sin_ficha', mensaje: 'No hay ficha' }] } },
    { ofertaId: 'o:0', compania: 'Occident', producto: 'Comunidades', primaAnualEur: 900, recomendable: false, calidad: { ok: false, errores: [{ codigo: 'oferta_caducada', mensaje: 'La oferta caducó el 2026-09-30.' }], avisos: [] } },
  ],
  avisos: ['algo'],
}

test('lee la recomendación, los errores y avisos de calidad', () => {
  const v = leerRecomendacion(OK)!
  assert.equal(v.recomendada?.compania, 'Allianz')
  assert.deepEqual(v.recomendada?.motivos, ['Precio anual más bajo (1.000,00€)'])
  assert.deepEqual(v.ofertas[1].errores, ['La oferta caducó el 2026-09-30.'])
  assert.equal(v.ofertas[1].recomendable, false)
  assert.deepEqual(v.ofertas[0].avisos, ['No hay ficha'])
})

test('sin recomendada: null (no se inventa una); forma desconocida: null', () => {
  assert.equal(leerRecomendacion({ ...OK, recomendada: null })!.recomendada, null)
  assert.equal(leerRecomendacion({ estado: 'sin_ofertas' }), null)
  assert.equal(leerRecomendacion(null), null)
  // una oferta sin precio numérico o sin el booleano de calidad no se pinta
  const v = leerRecomendacion({ ...OK, ofertas: [{ compania: 'X', primaAnualEur: '10', recomendable: true }, { compania: 'Y', primaAnualEur: 10 }] })!
  assert.equal(v.ofertas.length, 0)
})

test('clave de relectura: solo trabajos ok con oferta', () => {
  assert.equal(claveTrabajosConOferta([{ id: 'b', estado: 'ok', ofertas: [1] }, { id: 'a', estado: 'ok', ofertas: [1] }, { id: 'c', estado: 'en_curso', ofertas: [] }, { id: 'd', estado: 'ok', ofertas: [] }]), 'a,b')
})
