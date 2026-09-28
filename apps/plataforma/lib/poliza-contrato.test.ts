import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bloqueCobro, cuentaEnmascarada, etiquetaGestionCobro, filasContrato, leerContrato, leerFechasContrato,
  lugarRiesgo, primaParaPintar, vigenciaRiesgo,
} from './poliza-contrato.ts'
import { interpretarPoliza } from './poliza-asegura.ts'

const IBAN_CIFRADO = 'v1:AAAAIBANCIFRADOES7621000418450200051332'

test('el IBAN (cifrado o no) nunca se copia: lista blanca, y nada `v1:` pasa', () => {
  const c = leerContrato({
    iban: IBAN_CIFRADO, ibanUltimos4: '1332', formaPago: 'CC', gestionCobro: 'CO',
    riesgos: [{ tipo: 'hogar', direccion: 'v1:dircifrada', descripcion: 'Piso' }],
  })!
  const json = JSON.stringify(c)
  assert.ok(!json.includes('v1:'), 'algo cifrado ha llegado al navegador')
  assert.ok(!('iban' in c), 'la clave iban ha pasado')
  assert.equal(c.riesgos[0].direccion, null)
  // Y lo que se pinta de la cuenta son 4 dígitos, nunca más.
  const cobro = bloqueCobro(c)!
  assert.deepEqual(cobro.filas.find((f) => f.etiqueta === 'Cuenta'), { etiqueta: 'Cuenta', valor: '•••• 1332' })
  assert.ok(!JSON.stringify(cobro).includes('ES76'))
})

test('ibanUltimos4 con forma rara (un IBAN entero) no se pinta', () => {
  assert.equal(leerContrato({ ibanUltimos4: 'ES7621000418450200051332', formaPago: 'CC' })?.ibanUltimos4, null)
  assert.equal(cuentaEnmascarada('12345'), null)
  assert.equal(cuentaEnmascarada('0042'), '•••• 0042')
})

test('primaAnualDudosa: NO se presenta como anual, aunque haya prima anual guardada', () => {
  const c = leerContrato({ primaAnualDudosa: true, primaTotalFichero: '190.29' })
  const pp = primaParaPintar({ prima: 761.17, primaAnual: 761.17, primaBruta: null }, c)
  assert.equal(pp.etiqueta, 'Prima del recibo')
  assert.equal(pp.valor, '190,29€')
  assert.match(pp.nota ?? '', /no anual/)
  assert.ok(!(pp.valor ?? '').includes('761'), 'se ha pintado la anual como si fuera buena')
})

test('primaAnualDudosa con importe ilegible → sin dato, nunca 0', () => {
  const pp = primaParaPintar({ prima: null, primaAnual: null, primaBruta: null }, leerContrato({ primaAnualDudosa: true, primaTotalFichero: '190,29' }))
  assert.equal(pp.valor, null)
  assert.equal(pp.etiqueta, 'Prima del recibo')
})

test('sin dudosa (o false) la prima se pinta como siempre', () => {
  assert.deepEqual(primaParaPintar({ prima: 396.83, primaAnual: 396.83, primaBruta: null }, leerContrato({ primaAnualDudosa: false, formaPago: 'CC' })),
    { etiqueta: 'Prima', valor: '396,83€' })
  assert.equal(primaParaPintar({ prima: null, primaAnual: null, primaBruta: null }, null).valor, null)
})

test('asegura vieja / sin datos → null y bloques vacíos (se omiten), nunca «sin X»', () => {
  assert.equal(leerContrato(undefined), null)
  assert.equal(leerContrato({}), null)
  assert.equal(leerContrato('raro'), null)
  assert.equal(leerFechasContrato({ emision: null }), null)
  assert.equal(bloqueCobro(null), null)
  assert.deepEqual(filasContrato(null, null), [])
})

test('titularCuentaDistinto: solo `true` avisa; null (no comparado) no afirma nada', () => {
  assert.equal(bloqueCobro(leerContrato({ formaPago: 'CC', titularCuentaDistinto: true }))?.avisoTitular, 'La cuenta es de otra persona, no del tomador.')
  assert.equal(bloqueCobro(leerContrato({ formaPago: 'CC' }))?.avisoTitular, null)
  assert.equal(bloqueCobro(leerContrato({ formaPago: 'CC', titularCuentaDistinto: false }))?.avisoTitular, null)
})

test('gestión de cobro legible; un código desconocido se dice con su código', () => {
  assert.equal(etiquetaGestionCobro('CO'), 'cobra la compañía')
  assert.equal(etiquetaGestionCobro('ME'), 'cobra la correduría')
  assert.equal(etiquetaGestionCobro('XX'), 'código CIMA XX')
  assert.equal(etiquetaGestionCobro(null), null)
})

test('filas del contrato: fechas, producto, mediador; lo ausente no sale', () => {
  const filas = filasContrato(
    leerContrato({ producto: { modalidad: '12', descripcion: 'HOGAR PLUS' }, mediador: { nombre: 'GRUPO ASEGURA', codigoInterno: '0170' }, duracion: 'AN' }),
    leerFechasContrato({ emision: '2026-01-15', efectoActual: '2026-07-06', situacion: null, solicitud: null }),
  )
  assert.deepEqual(filas.map((f) => f.etiqueta), ['Emisión', 'Efecto actual', 'Producto', 'Duración', 'Mediador'])
  assert.equal(filas[0].valor, '15/01/2026')
  assert.equal(filas[2].valor, 'HOGAR PLUS')
})

test('riesgo: vigencia y lugar sin nada cifrado', () => {
  const r = leerContrato({ riesgos: [{ tipo: 'hogar', inicio: '2026-01-01', fin: '2027-01-01', direccion: 'CL SOCORRO 24', cp: '41003', localidad: 'SEVILLA' }] })!.riesgos[0]
  assert.equal(vigenciaRiesgo(r), '01/01/2026 → 01/01/2027')
  assert.equal(lugarRiesgo(r), 'CL SOCORRO 24, 41003 SEVILLA')
})

test('interpretarPoliza: asegura vieja sin contrato → contrato/fechas null y recibos sin extras a null', () => {
  const r = interpretarPoliza(200, {
    estado: 'ok',
    poliza: {
      id: 'p1', cliente: { id: 'c1', nombre: 'X' }, tipo: 'auto', aseguradora: 'Occident',
      listaRecibos: [{ id: 'r1', situacion: 'cobrado', importe: 10, fechaEmision: null, fechaVencimiento: null, formaPago: null }],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.poliza.contrato, null)
  assert.equal(r.poliza.fechasContrato, null)
  assert.equal(r.poliza.listaRecibos[0].idRemesa, null)
  assert.equal(r.poliza.listaRecibos[0].baseComision, null)
})

test('interpretarPoliza: recibo con remesa y comisión; un IBAN colado en el contrato no pasa', () => {
  const r = interpretarPoliza(200, {
    estado: 'ok',
    poliza: {
      id: 'p1', cliente: { id: 'c1', nombre: 'X' }, tipo: 'auto', aseguradora: 'Occident',
      contrato: { iban: IBAN_CIFRADO, ibanUltimos4: '1332', formaPago: 'CC' },
      listaRecibos: [{ id: 'r1', situacion: 'cobrado', importe: 10, idRemesa: 'R-77', claseComision: 'ME', baseComision: 100.5, retencionIrpf: 15.08, gestionCobro: 'CO' }],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.ok(!JSON.stringify(r.poliza).includes('v1:'))
  assert.equal(r.poliza.listaRecibos[0].idRemesa, 'R-77')
  assert.equal(r.poliza.listaRecibos[0].baseComision, 100.5)
})
