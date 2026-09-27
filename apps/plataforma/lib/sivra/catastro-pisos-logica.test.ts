import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consultaDePiso, resultadoDePiso } from './catastro-pisos-logica.ts'

test('catastro pisos: con referencia manda la referencia', () => {
  assert.deepEqual(
    consultaDePiso({ refCatastral: ' 5029006tg3452g0019bg ', location: 'Pasaje Franco Molina 4, 41003 Sevilla' }),
    { por: 'referencia', referencia: '5029006TG3452G0019BG' },
  )
})

test('catastro pisos: sin referencia, se consulta por dirección', () => {
  assert.deepEqual(
    consultaDePiso({ refCatastral: null, location: 'Calle Socorro 24, 41003 Sevilla' }),
    { por: 'direccion', direccion: 'Calle Socorro 24', municipio: 'Sevilla', provincia: 'Sevilla' },
  )
  assert.equal(consultaDePiso({ refCatastral: null, location: 'Sevilla' }), null)
})

test('catastro pisos: solo «ok» escribe datos', () => {
  const ok = resultadoDePiso({
    estado: 'ok', referencia: 'X',
    precalificacion: { datos: { metrosCuadrados: 76.4, anioConstruccion: 1994, uso: 'Residencial', direccion: 'CL A 1', localidad: 'SEVILLA', provincia: 'SEVILLA', codigoPostal: '41003', enBloque: true }, supuestos: [], faltan: [], avisos: [] },
  })
  assert.equal(ok.estado, 'ok')
  assert.equal(ok.m2, 76)
  assert.equal(ok.anio, 1994)
})

test('catastro pisos: varios pisos en el portal NO elige uno — pide la referencia', () => {
  const r = resultadoDePiso({ estado: 'elegir', via: 'CL BUSTOS TAVERA', inmuebles: [{}, {}] as never })
  assert.equal(r.estado, 'elegir')
  assert.equal(r.m2, null)
  assert.match(r.detalle ?? '', /2 inmuebles/)
})

test('catastro pisos: un fallo no se convierte en dato', () => {
  for (const r of [resultadoDePiso({ estado: 'error', motivo: 'boom' }), resultadoDePiso({ estado: 'no_encontrado' })]) {
    assert.equal(r.m2, null)
    assert.equal(r.anio, null)
    assert.notEqual(r.estado, 'ok')
  }
})
