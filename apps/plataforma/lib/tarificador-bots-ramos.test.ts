import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptadorDeRamo, ramosConBots } from './tarificador-bots-ramos.ts'

test('ramo sin adaptador (o raro) → null', () => {
  for (const r of ['hogar', 'vida', 'salud', 'decesos', 'comunidades', 'AUTO', '', 'toString', '__proto__', null, undefined]) {
    assert.equal(adaptadorDeRamo(r as string | null | undefined), null, String(r))
  }
})

test('moto → adaptador con cilindrada editable; sin ella faltan datos y lo dice sin valores', () => {
  const a = adaptadorDeRamo('moto')
  assert.ok(a)
  assert.equal(a.ramo, 'moto')
  assert.deepEqual(a.campos.map((c) => c.clave), ['cilindrada'])
  assert.ok(ramosConBots().includes('moto'))
  const r = a.construir({
    matricula: '', marca: null, modelo: null, version: null, codigoPostal: null, fechaNacimiento: null, fechaCarne: null,
    sexo: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: false,
    aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
  }, { cilindrada: '' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.faltan.some((f) => /Cilindrada/.test(f)))
})

test('lista de ramos con bots fijada: moto y auto (coche, Mapfre NSEI, 14/10/2026)', () => {
  assert.deepEqual(ramosConBots().sort(), ['auto', 'moto'])
})

test('auto → adaptador con 3 desplegables (uso, ámbito, clase del permiso; defecto de coche) + compañía anterior (texto); sin historial ni matrícula faltan datos y lo dice sin valores', () => {
  const a = adaptadorDeRamo('auto')
  assert.ok(a)
  assert.equal(a.ramo, 'auto')
  assert.deepEqual(a.campos.map((c) => [c.clave, c.porDefecto]), [['usoVehiculo', 'particular'], ['ambitoCirculacion', 'espana'], ['clasePermiso', 'b'], ['companiaAnterior', undefined]])
  assert.ok(a.campos.filter((c) => !c.texto).every((c) => c.opciones?.some((o) => o.valor === c.porDefecto)), 'el defecto es una de las opciones')
  const r = a.construir({
    matricula: '', marca: null, modelo: null, version: null, codigoPostal: 'ficha', fechaNacimiento: 'ficha', fechaCarne: 'ficha',
    sexo: null, garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: false,
    aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
  }, {})
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.faltan.some((f) => /Matrícula/.test(f)))
    assert.ok(r.faltan.some((f) => /Seguro actual/.test(f)))
  }
})

// 🔒 15/10/2026: Mapfre auto con años en la compañía anterior pide su NOMBRE; la falta se ve en la pantalla, no tras abrir el portal.
const AUTO_BASE = {
  matricula: '1234BCD', marca: null, modelo: null, version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
  sexo: null, garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
  aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0', companiaAnterior: null,
}

test('auto · Mapfre: con años y sin compañía anterior falta (por compañía); otra compañía no lo pide', () => {
  const a = adaptadorDeRamo('auto')!
  assert.ok(a.faltaPorCompania)
  assert.match(a.faltaPorCompania!(AUTO_BASE, {}, 'mapfre') ?? '', /compañía anterior/)
  assert.match(a.faltaPorCompania!(AUTO_BASE, { companiaAnterior: '   ' }, 'mapfre') ?? '', /compañía anterior/)
  assert.equal(a.faltaPorCompania!(AUTO_BASE, {}, 'allianz'), null)
})

test('auto · compañía anterior tecleada (o traída del formulario) quita la falta y viaja en el riesgo; tocar el campo vacío manda', () => {
  const a = adaptadorDeRamo('auto')!
  assert.equal(a.faltaPorCompania!(AUTO_BASE, { companiaAnterior: 'Línea Directa' }, 'mapfre'), null)
  assert.equal(a.faltaPorCompania!({ ...AUTO_BASE, companiaAnterior: 'Línea Directa' }, {}, 'mapfre'), null)
  assert.match(a.faltaPorCompania!({ ...AUTO_BASE, companiaAnterior: 'Línea Directa' }, { companiaAnterior: '' }, 'mapfre') ?? '', /compañía anterior/)
  const r = a.construir(AUTO_BASE, { companiaAnterior: ' Línea   Directa ' })
  assert.ok(r.ok && r.riesgo.companiaAnterior === 'Línea Directa')
})

test('auto · sin años (0) o sin seguro actual declarado no se afirma que falte la compañía anterior', () => {
  const a = adaptadorDeRamo('auto')!
  assert.equal(a.faltaPorCompania!({ ...AUTO_BASE, aniosAsegurado: '0' }, {}, 'mapfre'), null)
  assert.equal(a.faltaPorCompania!({ ...AUTO_BASE, tieneSeguroActual: false }, {}, 'mapfre'), null)
  assert.equal(a.faltaPorCompania!({ ...AUTO_BASE, aniosAsegurado: '' }, {}, 'mapfre'), null)
})
