import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { cuentaEnmascarada, datosPolizaCima, primaAnualDudosa, vigenciaRiesgo } from './datos-poliza-cima.ts'
import { rolesLegibles } from './intervinientes.ts'

const TODO = { recibos: true, iban: true, coberturas: true, bien: true }
const TARJETA = { recibos: false, iban: false, coberturas: true, bien: true }

const IBAN_CIFRADO = 'v1:QUJDREVGRw==:c2VjcmV0bw==:dGFn'
const IBAN_CLARO = 'ES9121000418450200051332'

/** Un `datos_especificos` como lo deja la ingesta de CIMA (con lo que NO debe salir). */
const CIMA = {
  gestionCobro: 'CO',
  formaPago: 'CC',
  iban: IBAN_CIFRADO,
  ibanUltimos4: '1332',
  bic: 'CAIXESBBXXX',
  titularCuentaDistinto: false,
  producto: { modalidad: 'M001', descripcion: 'HOGAR PLUS', ramoEntidad: '12', descripcionRamo: 'MULTIRRIESGO HOGAR' },
  comisiones: [{ clase: 'NP', bruta: '12.50' }],
  comisionAnual: '25.00',
  mediador: { clase: 'CO', codigoInterno: '0170', nombre: 'Grupo ASegura' },
  riesgos: [
    { id: 'R1', numeroOrden: '1', tipo: 'hogar', descripcion: 'Piso', inicio: '2026-01-01', fin: '2027-01-01', direccion: 'v1:ZGlyZWNjaW9u:eA==:eQ==' },
    { id: 'R2', tipo: 'hogar' },
  ],
  primaAnualDudosa: true,
  primaTotalFichero: '190.29',
}

test('🚨 el `iban` (cifrado o en claro), el BIC y las comisiones NO salen en el objeto que va a la UI', () => {
  for (const iban of [IBAN_CIFRADO, IBAN_CLARO]) {
    const r = datosPolizaCima({ ...CIMA, iban }, TODO)
    const json = JSON.stringify(r)
    assert.ok(!json.includes(iban), `el iban ${iban} se ha colado: ${json}`)
    assert.ok(!json.includes('v1:'), `un sobre cifrado se ha colado: ${json}`)
    assert.ok(!json.includes('CAIXESBBXXX'), 'el BIC se ha colado')
    assert.ok(!json.includes('12.50') && !json.includes('25.00'), 'las comisiones se han colado')
    assert.ok(!/"iban"/.test(json), 'hay una clave `iban` en la salida')
    assert.deepEqual(Object.keys(r).sort(), ['beneficiarios', 'cuentaCargo', 'formaPago', 'gestionCobro', 'producto', 'riesgos', 'suplementos'])
  }
})

test('la cuenta de cargo sale SOLO de `ibanUltimos4`, como «•••• 1332»', () => {
  assert.equal(datosPolizaCima(CIMA, TODO).cuentaCargo, '•••• 1332')
  // Sin `ibanUltimos4` no se deriva del `iban`, aunque viniera en claro.
  const { ibanUltimos4: _, ...sinUltimos } = CIMA
  assert.equal(datosPolizaCima({ ...sinUltimos, iban: IBAN_CLARO }, TODO).cuentaCargo, null)
  // Si `ibanUltimos4` trajera algo que no son 4 dígitos, se calla.
  assert.equal(cuentaEnmascarada(IBAN_CLARO), null)
  assert.equal(cuentaEnmascarada('21000418450200051332'), null)
  assert.equal(cuentaEnmascarada('13'), null)
  assert.equal(cuentaEnmascarada(null), null)
})

test('la cuenta no llega a quien no tiene `iban` en su nivel (tarjeta / tercero de una persona)', () => {
  const r = datosPolizaCima(CIMA, TARJETA)
  assert.equal(r.cuentaCargo, null)
  assert.equal(r.formaPago, null)
  assert.equal(r.gestionCobro, null)
  // Lo del contrato sí.
  assert.equal(r.producto, 'HOGAR PLUS')
  assert.equal(r.riesgos?.length, 1)
})

test('forma de pago y gestión de cobro: solo códigos que sabemos leer', () => {
  const r = datosPolizaCima(CIMA, TODO)
  assert.equal(r.formaPago, 'Domiciliación bancaria')
  assert.equal(r.gestionCobro, 'Te cobra directamente la compañía')
  assert.equal(datosPolizaCima({ gestionCobro: 'ME' }, TODO).gestionCobro, 'Te cobra tu correduría')
  // `OF`/`TA` están en la cartera y no hay catálogo: no se pinta el código ni se adivina.
  assert.equal(datosPolizaCima({ formaPago: 'OF' }, TODO).formaPago, null)
  assert.equal(datosPolizaCima({ formaPago: 'TA' }, TODO).formaPago, null)
  assert.equal(datosPolizaCima({ gestionCobro: 'XX' }, TODO).gestionCobro, null)
})

test('riesgos: tipo + descripción + vigencia, SIN dirección, y el que solo trae el tipo no sale', () => {
  const r = datosPolizaCima(CIMA, TODO)
  assert.deepEqual(r.riesgos, [{ tipo: 'hogar', descripcion: 'Piso', inicio: '2026-01-01', fin: '2027-01-01' }])
  assert.ok(!JSON.stringify(r.riesgos).includes('direccion'))
  // Una descripción cifrada no es texto.
  const cifrada = datosPolizaCima({ riesgos: [{ tipo: 'auto', descripcion: 'v1:abc:def:ghi' }] }, TODO)
  assert.deepEqual(cifrada.riesgos, [])
})

test('tres estados de los riesgos: null = no visible, [] = no detallados, lista = el dato', () => {
  assert.equal(datosPolizaCima(CIMA, { ...TODO, bien: false }).riesgos, null)
  assert.deepEqual(datosPolizaCima(null, TODO).riesgos, [])
  assert.deepEqual(datosPolizaCima({}, TODO).riesgos, [])
  assert.equal(datosPolizaCima(null, { ...TODO, bien: false }).riesgos, null)
})

test('NULL = no se pinta: sin `datos_especificos` todo lo demás es null', () => {
  const r = datosPolizaCima(null, TODO)
  assert.equal(r.formaPago, null)
  assert.equal(r.gestionCobro, null)
  assert.equal(r.cuentaCargo, null)
  assert.equal(r.producto, null)
})

test('producto: la descripción de la modalidad y, si no, la del ramo; nunca el código', () => {
  assert.equal(datosPolizaCima(CIMA, TODO).producto, 'HOGAR PLUS')
  assert.equal(datosPolizaCima({ producto: { modalidad: 'M001', descripcionRamo: 'AUTOS' } }, TODO).producto, 'AUTOS')
  assert.equal(datosPolizaCima({ producto: { modalidad: 'M001' } }, TODO).producto, null)
})

test('🚨 `primaAnualDudosa` solo cuenta con un booleano true', () => {
  assert.equal(primaAnualDudosa(CIMA), true)
  assert.equal(primaAnualDudosa({ primaAnualDudosa: false }), false)
  assert.equal(primaAnualDudosa({ primaAnualDudosa: 'true' }), false)
  assert.equal(primaAnualDudosa(null), false)
})

test('🚨 la lectura anula prima_anual/prima_bruta de una póliza con prima dudosa ANTES de construir `prima`', () => {
  // La fuente única de la prima (ficha, «Tus vencimientos», baldosa «Al año») es
  // `aPortal` de `cartera-lectura.ts`. No se puede ejecutar sin BD, así que se lee.
  const src = readFileSync(new URL('./cartera-lectura.ts', import.meta.url), 'utf8')
  assert.match(src, /const dudosa = primaAnualDudosa\(p\.datosEspecificos\)/)
  assert.match(src, /const primaAnual = dudosa \|\| p\.primaAnual === null \? null/)
  assert.match(src, /const primaBruta = dudosa \|\| p\.primaBruta === null \? null/)
  // Y el objeto que va a la UI no lleva el JSONB crudo.
  assert.doesNotMatch(src, /^\s*datosEspecificos:\s*p\.datosEspecificos/m)
})

test('vigencia de un riesgo en español', () => {
  assert.equal(vigenciaRiesgo({ inicio: '2026-01-01', fin: '2027-01-01' }), 'del 01/01/2026 al 01/01/2027')
  assert.equal(vigenciaRiesgo({ inicio: '2026-01-01', fin: null }), 'desde el 01/01/2026')
  assert.equal(vigenciaRiesgo({ inicio: null, fin: null }), null)
})

test('la figura «pagador» se lee bien en la frase de la ficha', () => {
  assert.equal(rolesLegibles(['pagador']), 'pagador')
  assert.equal(rolesLegibles(['pagador', 'tomador']), 'tomador y pagador')
  assert.equal(rolesLegibles(['conductor_habitual', 'pagador', 'propietario']), 'propietario, conductor habitual y pagador')
})

// ── Beneficiarios y suplementos (CIMA, 03/10/2026) ──────────────────────────
const CON_BENEF = {
  ...CIMA,
  beneficiarios: [
    { orden: '1', descripcion: 'Banco Ejemplo SA', prestamo: 'HIPOTECARIO', dni: '12345678Z', iban: IBAN_CLARO },
    { orden: '2', descripcion: '1', prestamo: null },
    { orden: '3', descripcion: null, prestamo: null },
  ],
  suplementos: [
    { id: '0001', clase: 'NI', descripcionClase: 'Ninguno de los anteriores', detalle: 'SUPLEMENTO 1 (BANCO-CUENTA: 2038/9743/17', fechaEfecto: '2014-09-09', fechaEmision: '2014-09-09', situacion: 'AC' },
    { id: '0003', clase: 'CC', descripcionClase: 'Modificación general', fechaEfecto: '2025-10-15' },
    { id: null, fechaEfecto: null, detalle: 'solo detalle' },
  ],
}

test('beneficiarios: orden, nombre y préstamo; un «1» suelto no es un nombre; nunca DNI ni cuenta', () => {
  const r = datosPolizaCima(CON_BENEF, TODO)
  assert.deepEqual(r.beneficiarios, [
    { orden: '1', nombre: 'Banco Ejemplo SA', prestamo: 'HIPOTECARIO' },
  ])
  const json = JSON.stringify(r)
  assert.ok(!json.includes('12345678Z') && !json.includes(IBAN_CLARO))
})

test('beneficiarios: son datos de personas → solo con el nivel `iban`; sin él, null (no visible)', () => {
  assert.equal(datosPolizaCima(CON_BENEF, TARJETA).beneficiarios, null)
  assert.deepEqual(datosPolizaCima({ ...CIMA }, TODO).beneficiarios, [])
})

test('suplementos: número, fecha de efecto y clase; el texto libre `detalle` NO sale (lleva cuentas); más reciente primero', () => {
  const r = datosPolizaCima(CON_BENEF, TODO)
  assert.deepEqual(r.suplementos, [
    { numero: '0003', fecha: '2025-10-15', descripcion: 'Modificación general' },
    { numero: '0001', fecha: '2014-09-09', descripcion: 'Ninguno de los anteriores' },
  ])
  const json = JSON.stringify(r)
  assert.ok(!json.includes('2038/9743') && !json.includes('solo detalle'))
})

test('suplementos: visibles con `coberturas`; sin él null; sin datos [] (se miró y no hay)', () => {
  assert.equal(datosPolizaCima(CON_BENEF, { recibos: true, iban: true, coberturas: false, bien: true }).suplementos, null)
  assert.deepEqual(datosPolizaCima(CIMA, TODO).suplementos, [])
})
