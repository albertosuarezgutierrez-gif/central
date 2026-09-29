import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerListaAvant2, origenProyecto, rutaTarificacion } from './avant2-proyectos.ts'

const fila = {
  projectId: '40956228', creadoEn: '2026-09-29T08:00:00Z', ramo: 'moto', lineaNombre: 'Motos', riesgo: '0000XXX',
  companiaAnterior: 'DIVINA PASTORA', precios: 5, mejor: { compania: 'Allianz', modalidad: 'Básico', primaEur: 106.77, firme: true },
  confirmados: 1, avant2Url: 'https://x', error: null, intranet: null,
}

test('lista ok: las filas pasan con su forma', () => {
  const r = leerListaAvant2(200, { estado: 'ok', proyectos: [fila] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.proyectos[0].mejor?.primaEur, 106.77)
    assert.equal(r.proyectos[0].mejor?.firme, true)
  }
})

test('lista vacía = mirado y no hay; un fallo NUNCA se lee como lista vacía', () => {
  assert.deepEqual(leerListaAvant2(200, { estado: 'ok', proyectos: [] }), { estado: 'ok', proyectos: [] })
  assert.equal(leerListaAvant2(502, { estado: 'error', mensaje: 'vendor' }).estado, 'error')
  assert.equal(leerListaAvant2(200, null).estado, 'error')
  assert.equal(leerListaAvant2(200, { estado: 'ok' }).estado, 'error')
})

test('una fila sin projectId rompe la lista entera (contrato roto, no un proyecto menos)', () => {
  assert.equal(leerListaAvant2(200, { estado: 'ok', proyectos: [fila, { precios: 3 }] }).estado, 'error')
})

test('origen: sin fila en la intranet es web; traído de la web se distingue de plataforma', () => {
  const p = (intranet: unknown) => {
    const r = leerListaAvant2(200, { estado: 'ok', proyectos: [{ ...fila, intranet }] })
    assert.equal(r.estado, 'ok')
    return r.estado === 'ok' ? r.proyectos[0] : null!
  }
  assert.equal(origenProyecto(p(null)), 'web')
  assert.equal(origenProyecto(p({ tarificacionId: 't1', origen: 'web' })), 'web (traído)')
  assert.equal(origenProyecto(p({ tarificacionId: 't1', origen: 'plataforma' })), 'plataforma')
})

test('ruta: solo los ramos con pantalla de tarificar', () => {
  assert.equal(rutaTarificacion('c1', 'moto'), '/correduria/cliente/c1/moto-nuevo')
  assert.equal(rutaTarificacion('c1', null), null)
  assert.equal(rutaTarificacion('c1', 'decesos'), null)
})
