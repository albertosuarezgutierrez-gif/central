import { test } from 'node:test'
import assert from 'node:assert/strict'

import { puede } from './acceso.ts'
import {
  ALCANCES_PATRIMONIO,
  QUE_PUEDE_PATRIMONIO,
  alcancePatrimonio,
  textoConcesionPatrimonio,
} from './autorizar-tercero.ts'

test('alcancePatrimonio: solo los dos de patrimonio; los de la bóveda y la basura no se conceden', () => {
  assert.equal(alcancePatrimonio('patrimonio_gestion'), 'patrimonio_gestion')
  assert.equal(alcancePatrimonio('patrimonio_total'), 'patrimonio_total')
  for (const v of ['ver', 'ver_economico', 'gestion', 'total', 'flota', 'ninguno', 'PATRIMONIO_TOTAL', ' patrimonio_total', '', null, undefined, 3, {}]) {
    assert.equal(alcancePatrimonio(v), null, String(v))
  }
  assert.deepEqual([...ALCANCES_PATRIMONIO], ['patrimonio_gestion', 'patrimonio_total'])
})

test('la frase de cada nivel es espejo de la tabla puede(): Gestionar no da de alta/baja ni ve datos del inquilino; Total sí', () => {
  assert.equal(puede('gestion', 'alta_baja'), false)
  assert.equal(puede('gestion', 'ver_pii_inquilino'), false)
  assert.equal(puede('gestion', 'gestionar_gastos_documentos'), true)
  assert.match(QUE_PUEDE_PATRIMONIO.patrimonio_gestion, /sin dar de alta ni de baja inmuebles/)
  assert.match(QUE_PUEDE_PATRIMONIO.patrimonio_gestion, /sin ver los datos personales de tus inquilinos/)
  assert.equal(puede('total', 'alta_baja'), true)
  assert.equal(puede('total', 'ver_pii_inquilino'), true)
  assert.match(QUE_PUEDE_PATRIMONIO.patrimonio_total, /dar de alta y de baja inmuebles/)
})

test('nadie reautoriza a un cuarto: ningún nivel da autorizar_tercero y el texto aceptado lo dice', () => {
  assert.equal(puede('gestion', 'autorizar_tercero'), false)
  assert.equal(puede('total', 'autorizar_tercero'), false)
  for (const a of ALCANCES_PATRIMONIO) {
    const t = textoConcesionPatrimonio(a)
    assert.match(t.texto, /No podrá autorizar a nadie más/)
    assert.match(t.texto, /revocarlo cuando quiera/)
    assert.match(t.version, new RegExp(`^v\\d+-\\d{4}-\\d{2}-\\d{2}-${a.replace('_', '-')}$`))
  }
  assert.notEqual(textoConcesionPatrimonio('patrimonio_gestion').version, textoConcesionPatrimonio('patrimonio_total').version)
})
