import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TIPOS_DOCUMENTO,
  avisoDocumentoNoPoliza,
  importeEsPrimaAnual,
  normalizarTipoDocumento,
} from './tipo-documento.ts'

test('🚨 el importe de un SUPLEMENTO no es la prima anual', () => {
  // El caso real del 07/09/2026: un suplemento de cambio de vehículo se guardó
  // como `prima_anual = 55,85 €`. El número era bueno; el campo, no.
  assert.equal(importeEsPrimaAnual('suplemento'), false)
})

test('🚨 el importe de un RECIBO tampoco', () => {
  // Un recibo es un cobro fraccionado: multiplicarlo por nada da la prima.
  assert.equal(importeEsPrimaAnual('recibo'), false)
})

test('una póliza sí', () => {
  assert.equal(importeEsPrimaAnual('poliza'), true)
})

test('🚨 con `otro` o sin respuesta NO se toca la prima', () => {
  // `otro` es el valor de CAJÓN del clasificador y `null` es que no contestó.
  // Anular con ellos convertiría cada duda del modelo en una prima perdida:
  // se cambiaría un error por otro, y encima en todas las pólizas normales.
  assert.equal(importeEsPrimaAnual('otro'), true)
  assert.equal(importeEsPrimaAnual(null), true)
})

test('🚨 un valor desconocido cae a null, NUNCA a "otro"', () => {
  // Son cosas distintas: «ha dicho que no sabe» y «ha dicho algo que no
  // entendemos». Colapsarlas mete un valor de cajón donde había un hueco.
  assert.equal(normalizarTipoDocumento('anexo'), null)
  assert.equal(normalizarTipoDocumento(''), null)
  assert.equal(normalizarTipoDocumento(null), null)
  assert.equal(normalizarTipoDocumento(42), null)
  assert.equal(normalizarTipoDocumento({}), null)
})

test('el vocabulario se acepta con espacios y en mayúsculas', () => {
  assert.equal(normalizarTipoDocumento(' SUPLEMENTO '), 'suplemento')
  assert.equal(normalizarTipoDocumento('Recibo'), 'recibo')
})

test('🚨 se AVISA de lo que no es una póliza, y solo de eso', () => {
  // Sin el aviso, la prima sale «—» justo después de subir un papel que traía
  // una cifra bien visible, y eso se lee como un fallo de lectura nuestro.
  assert.match(String(avisoDocumentoNoPoliza('suplemento')), /suplemento/i)
  assert.match(String(avisoDocumentoNoPoliza('recibo')), /recibo/i)
  assert.equal(avisoDocumentoNoPoliza('poliza'), null)
  assert.equal(avisoDocumentoNoPoliza('otro'), null)
  assert.equal(avisoDocumentoNoPoliza(null), null)
})

test('el aviso existe EXACTAMENTE para los tipos que anulan la prima', () => {
  // Cepo de coherencia: si mañana se añade un tipo que anula la prima y nadie
  // le escribe su frase, la pantalla se quedaría muda con la prima en «—».
  for (const t of TIPOS_DOCUMENTO) {
    assert.equal(
      avisoDocumentoNoPoliza(t) !== null,
      !importeEsPrimaAnual(t),
      `"${t}": el aviso y la anulación de la prima tienen que ir juntos`,
    )
  }
})
