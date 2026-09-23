// Cepo de la carta de nombramiento de mediador (PR 6). Lee el FUENTE: lo que vigila vive en SQL crudo
// y en el ORDEN de las comprobaciones, donde ni tsc ni el build miran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./carta-mediador.ts', import.meta.url), 'utf8')
const firmar = src.slice(src.indexOf('export async function firmarCarta'), src.indexOf('// ─── Operador'))

test('🪤 solo el TOMADOR de la póliza y del presupuesto: con otra ficha no se prepara ni se firma nada', () => {
  assert.match(src, /if \(b\.presClienteId !== f\.clienteId \|\| b\.clienteId !== f\.clienteId\) return \{ estado: 'otra_ficha' \}/)
  for (const fn of ['prepararCarta', 'pedirCodigoCarta', 'firmarCarta']) {
    const cuerpo = src.slice(src.indexOf(`export async function ${fn}`))
    assert.ok(cuerpo.indexOf('await base(') > 0 && cuerpo.indexOf('await base(') < 450, `${fn} empieza por la guarda`)
  }
})

test('🪤 sin código no hay firma; el intento se gasta antes de comparar; se firma lo que se leyó', () => {
  const sinCodigo = firmar.indexOf("if (!a.otpHash || !a.otpExpira) return { estado: 'sin_codigo' }")
  const gasto = firmar.indexOf('set firma_otp_intentos = firma_otp_intentos + 1')
  const compara = firmar.indexOf('hashCodigo(datos.codigo.trim()) !== gastado.hash')
  const huella = firmar.indexOf('huella(texto) !== datos.cartaHash')
  const firma = firmar.indexOf('new FirmaPropia()')
  assert.ok(sinCodigo > 0 && gasto > sinCodigo && compara > gasto && huella > compara && firma > huella)
})

test('🪤 nada sale hacia la compañía: el único correo es el código, a la ficha del cliente', () => {
  assert.equal(src.split('sendMail(').length - 1, 1)
  assert.match(src, /to: ficha\.email,\n\s+subject: 'Tu código para firmar el nombramiento de corredor'/)
})

test('🪤 las acciones del corredor pasan por la regla pura y por compare-and-swap del estado', () => {
  const op = src.slice(src.indexOf('export async function accionCarta'))
  assert.match(op, /transicionCartaMediador\(c\.estado, accion\)/)
  assert.match(op, /and estado = \$\{c\.estado\}`/)
})
