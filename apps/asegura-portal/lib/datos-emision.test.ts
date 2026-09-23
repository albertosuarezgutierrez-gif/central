import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fraseDato, interpretarDatosParaContratar } from './datos-emision.ts'

const ok = (datos: unknown[], faltanCliente = 0) => ({ estado: 'ok', datos, faltanCliente })
const d = (estado: string, aporta = 'cliente_datos', muestra: string | null = null) => ({ campo: 'x', etiqueta: 'X', estado, aporta, muestra })

test('🪤 un 401, un 5xx o una forma rara es «no se pudo mirar», nunca «no falta nada»', () => {
  assert.equal(interpretarDatosParaContratar(401, { error: 'No autorizado' }), null)
  assert.equal(interpretarDatosParaContratar(503, ok([])), null)
  assert.equal(interpretarDatosParaContratar(200, { estado: 'ok', datos: [] }), null)
  assert.equal(interpretarDatosParaContratar(200, ok([d('raro')])), null)
  assert.equal(interpretarDatosParaContratar(200, ok([d('ok')]))?.datos.length, 1)
})

test('🪤 un dato que no abre NO se le pide al cliente', () => {
  const f = fraseDato({ campo: 'dni', etiqueta: 'DNI', estado: 'no_legible', aporta: 'cliente_dni', muestra: null })
  assert.doesNotMatch(f, /falta|sube/i)
})

test('la cuenta no se pide suelta; el DNI se sube; lo incompleto se corrige en Mis datos', () => {
  assert.match(fraseDato({ campo: 'iban', etiqueta: '', estado: 'falta', aporta: 'corredor', muestra: null }), /Nunca te lo pediremos por correo/)
  assert.match(fraseDato({ campo: 'dni', etiqueta: '', estado: 'falta', aporta: 'cliente_dni', muestra: null }), /sube una foto de tu DNI/)
  assert.match(fraseDato({ campo: 'direccion', etiqueta: '', estado: 'falta', aporta: 'cliente_datos', muestra: 'CL SOCORRO' }), /Incompleto.*Mis datos/)
})

test('🪤 la subida del DNI: la vista de corredor no sube y el tipo va fijo a «dni»', () => {
  const src = readFileSync(new URL('../app/api/documento/dni/route.ts', import.meta.url), 'utf8')
  const veto = src.indexOf('identidad.corredor')
  assert.ok(veto > 0 && veto < src.indexOf('guardarDocumentoPropio('), 'el veto va antes de subir')
  assert.match(src, /tipo: 'dni'/)
  assert.doesNotMatch(src, /form\.get\('tipo'\)|clienteId/, 'ni el tipo ni la ficha salen del cuerpo')
})
