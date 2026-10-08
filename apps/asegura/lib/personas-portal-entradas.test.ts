import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personasParaCliente, tercerosParaCliente } from '@central/module-seguros-portal'
import { tercerosDeSiniestro } from '@central/module-seguros'
import { entradasDePoliza, puenteAbrePoliza } from './personas-portal-entradas.ts'

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

test('el asegurado de vida que CIMA trae TAMBIÉN en figuras sale una sola vez (mismo documento)', () => {
  const datos = {
    figuras: [{ papel: 'asegurado', nombre: c('Víctor Gil'), documentoCifrado: c('11111111H'), telefono: c('600000001') }],
    vida: { persona: { nombre: c('Víctor Gil'), documentoCifrado: c('11.111.111-h'), fechaNacimiento: c('1970-01-02') } },
  }
  const e = entradasDePoliza(datos, descifrar)!
  assert.equal(e.length, 1)
  // Lo que falta en una se completa con la otra: no se pierde la fecha de nacimiento.
  assert.equal(e[0].figura.telefono, '600000001')
  assert.equal(e[0].figura.fechaNacimiento, '1970-01-02')
})

test('sin documento se deduplica por mismo nombre y papel; papel distinto no se funde', () => {
  const datos = {
    figuras: [
      { papel: 'asegurado', nombre: c('Ana Ruiz') },
      { papel: 'tomador', nombre: c('Ana Ruiz') },
    ],
    decesos: { persona: { nombre: c('ana  ruiz') } },
  }
  const e = entradasDePoliza(datos, descifrar)!
  assert.deepEqual(e.map((x) => x.figura.papel), ['asegurado', 'tomador'])
})

test('dos documentos distintos con el mismo nombre NO se funden', () => {
  const datos = {
    figuras: [{ papel: 'asegurado', nombre: c('Ana Ruiz'), documentoCifrado: c('11111111H') }],
    vida: { persona: { nombre: c('Ana Ruiz'), documentoCifrado: c('22222222J') } },
  }
  assert.equal(entradasDePoliza(datos, descifrar)!.length, 2)
})

test('el tomador que además es el asegurado de vida (mismo documento, otro papel) se dice en los dos papeles', () => {
  assert.deepEqual(entradasDePoliza(DATOS, descifrar)!.map((x) => x.figura.papel), ['tomador', 'conductor_habitual', 'asegurado'])
})

// ── El puente abre EXACTAMENTE lo que abre la cartera del portal (`figurasEnPolizas`). Si no → 404. ──
const POL = { id: 'pol-1', clienteId: 'c-tomador' }
const VINC = [{ clienteId: 'c-nieves', nivel: 'gestionar' }]

test('puente: tomador propio abre; figurar con SU ficha abre', () => {
  assert.equal(puenteAbrePoliza({ poliza: { ...POL, clienteId: 'c-nieves' }, filas: [], vinculos: VINC }), true)
  assert.equal(puenteAbrePoliza({ poliza: POL, filas: [{ polizaId: 'pol-1', clienteId: 'c-nieves', rol: 'propietario' }], vinculos: VINC }), true)
})

test('puente: una figura que la cartera NO abre → no abre (404)', () => {
  // Fila de OTRA ficha (no vinculada a esta identidad), aunque se colara en la consulta.
  assert.equal(puenteAbrePoliza({ poliza: POL, filas: [{ polizaId: 'pol-1', clienteId: 'c-otro', rol: 'conductor_habitual' }], vinculos: VINC }), false)
  // Fila sin ficha enlazada.
  assert.equal(puenteAbrePoliza({ poliza: POL, filas: [{ polizaId: 'pol-1', clienteId: null, rol: 'asegurado' }], vinculos: VINC }), false)
  // Fila suya pero de OTRA póliza.
  assert.equal(puenteAbrePoliza({ poliza: POL, filas: [{ polizaId: 'pol-2', clienteId: 'c-nieves', rol: 'propietario' }], vinculos: VINC }), false)
  // Sin vínculos no abre nada.
  assert.equal(puenteAbrePoliza({ poliza: POL, filas: [{ polizaId: 'pol-1', clienteId: 'c-nieves', rol: 'propietario' }], vinculos: [] }), false)
})
