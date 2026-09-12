import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarIban,
  ibanValido,
  ibanEnmascarado,
  ibanEnCampos,
  extraerIbanTecleado,
  conCuentaBancaria,
  esFalloDeCuentaBancaria,
  decidirCuentaEnvio,
} from './emitir-iban.ts'

// IBAN de ejemplo publicado por el propio estándar (no es la cuenta de nadie).
const IBAN_OK = 'ES91 2100 0418 4502 0005 1332'

test('normaliza y valida por módulo 97; un dígito cambiado lo tumba', () => {
  assert.equal(normalizarIban(IBAN_OK), 'ES9121000418450200051332')
  assert.equal(normalizarIban('  '), null)
  assert.equal(normalizarIban(42), null)
  assert.equal(ibanValido(IBAN_OK), true)
  assert.equal(ibanValido('es91-2100-0418-4502-0005-1332'), true, 'minúsculas y guiones se aceptan')
  assert.equal(ibanValido('ES91 2100 0418 4502 0005 1333'), false, 'último dígito cambiado')
  assert.equal(ibanValido('ES9121000418450200051'), false, 'demasiado corto')
  assert.equal(ibanValido('ES912100041845020005133X'), false)
  assert.equal(ibanValido(null), false)
  assert.equal(ibanValido('DE89370400440532013000'), true, 'no se restringe a ES')
})

test('enmascarado: país + últimos cuatro, nunca la cuenta entera', () => {
  assert.equal(ibanEnmascarado(IBAN_OK), 'ES91…1332')
  assert.equal(ibanEnmascarado(null), '—')
})

test('el `iban` de primer nivel se saca de los campos y se pone donde lo lee el vendor', () => {
  const { iban, resto } = extraerIbanTecleado({ iban: IBAN_OK, otro: 1 })
  assert.equal(iban, 'ES9121000418450200051332')
  assert.deepEqual(resto, { otro: 1 })
  const campos = conCuentaBancaria(resto, iban!)
  assert.deepEqual(campos, { otro: 1, payment: { bankAccount: { iban: 'ES9121000418450200051332' } } })
  assert.equal(ibanEnCampos(campos), 'ES9121000418450200051332')
  assert.equal('iban' in campos, false, 'la clave `iban` suelta no viaja al vendor')
})

test('un `payment.bankAccount.iban` que ya venía NO se pisa sin `forzar`, y SÍ con él', () => {
  const previos = { payment: { method: 'x', bankAccount: { iban: 'DE89370400440532013000' } } }
  const campos = conCuentaBancaria(previos, 'ES9121000418450200051332')
  assert.equal(ibanEnCampos(campos), 'DE89370400440532013000')
  // La ruta ya decidió la precedencia (tecleado > JSON > ficha): con `forzar`
  // lo que viaja es lo decidido, y el resto de `payment` se conserva.
  const forzado = conCuentaBancaria(previos, 'ES9121000418450200051332', true)
  assert.equal(ibanEnCampos(forzado), 'ES9121000418450200051332')
  assert.equal((forzado.payment as Record<string, unknown>).method, 'x')
  // Y un `payment` sin cuenta conserva el resto de sus claves.
  const mezcla = conCuentaBancaria({ payment: { method: 'x' } }, 'ES9121000418450200051332')
  assert.deepEqual(mezcla, { payment: { method: 'x', bankAccount: { iban: 'ES9121000418450200051332' } } })
})

test('solo el 400 de la cuenta bancaria se traduce a hueco; otros 400 siguen siendo del vendor', () => {
  const real =
    '400: {"error":"Bad Request","message":"The bank account is mandatory according to the selected ' +
    'companies and payment types.","path":"/insurances/40684860/policy-applications","status":400}'
  assert.equal(esFalloDeCuentaBancaria(real), true)
  assert.equal(esFalloDeCuentaBancaria('400: {"message":"The `policyApplications` body part is required."}'), false)
  assert.equal(esFalloDeCuentaBancaria('400: {"message":"The road name of the address of the holder is mandatory."}'), false)
  // OTRO hueco de la cuenta (el titular) no es «falta el IBAN»: reteclearlo no lo arreglaría.
  assert.equal(esFalloDeCuentaBancaria('400: {"message":"The bank account holder name is mandatory."}'), false)
  assert.equal(esFalloDeCuentaBancaria(null), false)
})

// «iban importante siempre confirmar» (Alberto, 12/09/2026): la cuenta de la
// ficha no viaja sin que el corredor haya visto y aprobado SU máscara.
test('la cuenta de la ficha solo viaja CONFIRMADA por su máscara; tecleada y JSON mandan', () => {
  const ficha = { iban: 'ES9121000418450200051332', origen: 'recibo' as const }
  // Sin confirmación → se pide, no se manda.
  assert.deepEqual(decidirCuentaEnvio({ ibanTecleado: null, ibanJson: null, ficha, cuentaConfirmada: undefined }), {
    tipo: 'confirmar',
    iban: ficha.iban,
    origen: 'recibo',
  })
  // Un `true` a secas NO es una confirmación: hay que devolver la máscara vista.
  assert.equal(decidirCuentaEnvio({ ibanTecleado: null, ibanJson: null, ficha, cuentaConfirmada: true }).tipo, 'confirmar')
  // La máscara de OTRA cuenta tampoco (la ficha cambió desde que se enseñó).
  assert.equal(decidirCuentaEnvio({ ibanTecleado: null, ibanJson: null, ficha, cuentaConfirmada: 'ES91…9999' }).tipo, 'confirmar')
  // La máscara correcta → viaja, con su origen.
  assert.deepEqual(decidirCuentaEnvio({ ibanTecleado: null, ibanJson: null, ficha, cuentaConfirmada: ' ES91…1332 ' }), {
    tipo: 'enviar',
    iban: ficha.iban,
    origen: 'recibo',
  })
  // Lo tecleado manda sobre la ficha aunque no haya confirmación.
  assert.deepEqual(
    decidirCuentaEnvio({ ibanTecleado: 'DE89370400440532013000', ibanJson: null, ficha, cuentaConfirmada: undefined }),
    { tipo: 'enviar', iban: 'DE89370400440532013000', origen: 'tecleada' },
  )
  assert.deepEqual(decidirCuentaEnvio({ ibanTecleado: null, ibanJson: 'DE89370400440532013000', ficha, cuentaConfirmada: undefined }), {
    tipo: 'enviar',
    iban: 'DE89370400440532013000',
    origen: 'json_avanzado',
  })
  // Sin cuenta en ningún sitio no hay nada que confirmar.
  assert.deepEqual(
    decidirCuentaEnvio({ ibanTecleado: null, ibanJson: null, ficha: { iban: null, origen: null }, cuentaConfirmada: 'ES91…1332' }),
    { tipo: 'sin_cuenta' },
  )
})
