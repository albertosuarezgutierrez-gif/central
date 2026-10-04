import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personasParaCliente, tercerosParaCliente } from '@central/module-seguros-portal'
import { tercerosDeSiniestro } from '@central/module-seguros'
import { entradasDePoliza } from './personas-portal-entradas.ts'

const descifrar = (v: string) => v.slice(3).split('').reverse().join('')
const c = (t: string) => `v1:${t.split('').reverse().join('')}`

const DATOS = {
  figuras: [
    { papel: 'tomador', nombre: c('Víctor Gil'), documentoCifrado: c('11111111H'), telefono: c('600000001'), email: c('v@x.es'), domicilio: { direccion: c('Feria 3'), cp: '41003' } },
    { papel: 'conductor_habitual', nombre: c('Nieves Gil'), documentoCifrado: c('22222222J'), telefono: c('600000002'), email: c('n@x.es') },
  ],
  vida: { persona: { nombre: c('Víctor Gil'), documentoCifrado: c('11111111H'), fechaNacimiento: c('1970-01-02') }, idAplicacion: null },
}

test('póliza anterior a #880 (sin figuras ni persona) → null; no se inventa «nadie»', () => {
  assert.equal(entradasDePoliza({ marca: 'Toyota' }, descifrar), null)
  assert.equal(entradasDePoliza(null, descifrar), null)
  assert.deepEqual(entradasDePoliza({ figuras: [] }, descifrar), [])
})

test('la persona de vida entra como «asegurado» y el documento se abre SOLO en memoria', () => {
  const e = entradasDePoliza(DATOS, descifrar)!
  assert.equal(e.length, 3)
  assert.equal(e[2].figura.papel, 'asegurado')
  assert.equal(e[2].documento, '11111111H')
  assert.equal(e[2].figura.documentoConsta, true)
  assert.ok(!JSON.stringify(e[2].figura).includes('111H'))
})

test('el tomador ve sus figuras completas y de Nieves solo papel y nombre; nada del documento entero cruza', () => {
  const r = personasParaCliente(entradasDePoliza(DATOS, descifrar)!, { tomadorEsPropio: true, documentosPropios: ['11111111H'] })
  assert.deepEqual(r.propias.map((f) => f.papel), ['tomador', 'asegurado'])
  assert.equal(r.propias[0].telefono, '600000001')
  assert.deepEqual(r.otras, [{ papel: 'conductor_habitual', etiqueta: 'Conductor habitual', nombre: 'Nieves Gil' }])
  const json = JSON.stringify(r)
  for (const v of ['11111111H', '22222222J', '600000002', 'n@x.es', 'v1:']) assert.ok(!json.includes(v), v)
})

test('Nieves (figura en póliza ajena) ve SU figura y no la del tomador', () => {
  const r = personasParaCliente(entradasDePoliza(DATOS, descifrar)!, { tomadorEsPropio: false, documentosPropios: ['22222222J'] })
  assert.deepEqual(r.propias.map((f) => f.nombre), ['Nieves Gil'])
  assert.deepEqual(r.otras, [])
  assert.ok(!JSON.stringify(r).includes('600000001'))
})

test('terceros de CIMA hacia el portal: ni teléfono, ni email, ni domicilio, ni documento', () => {
  const t = tercerosDeSiniestro({ terceros: [{ papel: 'contrario', nombre: c('Pepe'), documentoCifrado: c('33333333P'), telefono: c('699'), email: c('p@x.es'), domicilio: { direccion: c('Sierpes 1'), cp: '41004' }, matricula: c('1234ABC'), compania: 'AXA', responsabilidad: 'CAUSANTE' }] }, descifrar)!
  const l = tercerosParaCliente(t)
  assert.deepEqual(l, [{ papel: 'contrario', etiqueta: 'Contrario', nombre: 'Pepe', matricula: '1234ABC', compania: 'AXA' }])
})
