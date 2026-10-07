import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PASO_SIGUIENTE, textoFalloEnlace } from './entrada-enlace.ts'

const GENERICO = /ha ocurrido un error/i

test('🚨 un enlace usado o caducado dice qué pasó y cómo entrar, nunca un «error» seco', () => {
  for (const motivo of ['ya_usado', 'caducado', 'incorrecto']) {
    const t = textoFalloEnlace(motivo)
    assert.doesNotMatch(t, GENERICO, motivo)
    assert.ok(t.includes(PASO_SIGUIENTE), `${motivo} no dice cómo entrar: ${t}`)
  }
  assert.match(textoFalloEnlace('ya_usado'), /una sola vez/)
  assert.match(textoFalloEnlace('caducado'), /24 horas/)
})

test('un motivo desconocido o ilegible tampoco cae al genérico, ni afirma una causa', () => {
  for (const motivo of ['error', 'datos_invalidos', 'lo_que_sea', '', null, undefined]) {
    const t = textoFalloEnlace(motivo)
    assert.doesNotMatch(t, GENERICO)
    assert.ok(t.includes(PASO_SIGUIENTE))
    assert.doesNotMatch(t, /ya se usó|caducado/, 'sin saber el motivo no se afirma ninguno')
  }
})

test('el paso siguiente nombra el botón que de verdad hay en la pantalla', () => {
  const entrada = readFileSync(new URL('../app/Entrada.tsx', import.meta.url), 'utf8')
  assert.ok(entrada.includes("'Enviarme un código'"), 'el botón cambió de nombre: actualiza PASO_SIGUIENTE')
  assert.match(PASO_SIGUIENTE, /«Enviarme un código»/)
})

test('🚨 Entrada.tsx enruta TODO fallo del enlace por textoFalloEnlace', () => {
  const entrada = readFileSync(new URL('../app/Entrada.tsx', import.meta.url), 'utf8')
  assert.match(entrada, /setError\(`enlace_\$\{cuerpo\.error \?\? 'error'\}`\)/)
  assert.match(entrada, /if \(codigo\.startsWith\('enlace_'\)\) return textoFalloEnlace\(/)
})

test('🚨 abrir el enlace NO canjea: el efecto que lee el fragmento no llama al servidor', () => {
  // Safe Links de Outlook y otros escáneres abren el enlace en un navegador real y EJECUTAN el JS:
  // si el canje ocurriera al cargar, se gastarían la llave antes que el cliente.
  const entrada = readFileSync(new URL('../app/Entrada.tsx', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  const ini = entrada.indexOf('useEffect(() => {')
  assert.ok(ini > 0, 'no se encuentra el efecto de lectura del enlace')
  const fin = entrada.indexOf('}, [])', ini)
  const efecto = entrada.slice(ini, fin)
  assert.match(efecto, /window\.location\.hash/)
  assert.doesNotMatch(efecto, /fetch\(|verificar\(|enviar\(|requestSubmit|\.submit\(|\.click\(/)
  // El canje solo sale del envío del formulario (el clic en «Entrar»).
  assert.match(entrada, /onSubmit=\{\(e\) => enviar\(e, verificar\)\}/)
  assert.equal((entrada.match(/enviar\(e, verificar\)/g) ?? []).length, 1, 'verificar solo se dispara desde el formulario')
})
