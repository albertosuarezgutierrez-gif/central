// Cepo: cómo se rescata la dirección de la GEMELA sin atribuirla a la casa que no es.
//
// ─── Qué protege ────────────────────────────────────────────────────────────
// En la cartera hay pólizas DUPLICADAS: la misma entró dos veces, una por el
// volcado del CRM (con `datos_especificos`) y otra por CIMA (con las fechas al
// día pero SIN ellos), porque el nombre de la aseguradora no coincidía. La
// cartera viva sirve la de CIMA, así que la dirección del hogar quedaba
// escondida en la fila que nadie mira: 11 de las 19 hogar vivas (07/09/2026).
//
// 🚨 Rescatarla es fácil de hacer MAL, y el fallo no se ve: medido el mismo día,
// la póliza `0732200153700` tiene DOS gemelas del mismo cliente con direcciones
// distintas (41011 con efecto 2016, 41001 con efecto 2022). Emparejar solo por
// número y quedarse con «la última» pinta la dirección de OTRA casa — sin
// error, sin hueco, y perfectamente plausible. Es la regla de la casa de
// agrupar por IDENTIDAD y no por la etiqueta, aplicada a una póliza.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname
const LECTURA = readFileSync(`${RAIZ}apps/asegura-portal/lib/cartera-lectura.ts`, 'utf8')

const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CODIGO = sinComentarios(LECTURA)

test('🚨 la clave de emparejamiento lleva cliente, numero, ramo Y fecha de efecto', () => {
  // Los cuatro. `fechaInicio` es el que separa dos renovaciones que reutilizan
  // el número: sin él, la dirección que gana la decide el orden de la consulta.
  const i = CODIGO.indexOf('function claveGemela')
  assert.notEqual(i, -1, 'el emparejamiento tiene que pasar por una función con nombre')
  const firma = CODIGO.slice(i, CODIGO.indexOf('}', CODIGO.indexOf('return', i)))
  for (const campo of ['clienteId', 'numeroPoliza', 'tipo', 'fechaInicio']) {
    assert.ok(firma.includes(campo), `la clave de la gemela no mira ${campo}`)
  }
})

test('🚨 sin numero de poliza NO se empareja nada', () => {
  // Emparejar «todas las que no tienen número» juntaría contratos distintos del
  // mismo cliente. Sin identidad no hay pareja: `null`.
  const i = CODIGO.indexOf('function claveGemela')
  const cuerpo = CODIGO.slice(i, CODIGO.indexOf('\n}', i))
  assert.match(cuerpo, /numeroPoliza === null[\s\S]*return null/, 'sin número tiene que devolver null')
})

test('🚨 si DOS gemelas caen en la misma clave, no gana ninguna', () => {
  // Quedarse con una sería elegir por el orden de la consulta. Equivocarse aquí
  // no deja un hueco: deja la dirección de otra casa en la pantalla del cliente.
  assert.match(CODIGO, /ambiguas\.add\(/, 'falta marcar la clave ambigua')
  assert.match(CODIGO, /datosDeGemela\.delete\(/, 'una clave ambigua tiene que quedarse SIN dirección')
})

test('🚨 la gemela se busca solo dentro del MISMO cliente', () => {
  // La consulta usa dos `in` cruzados (clientes × números); lo que impide colar
  // la póliza de otro es que la clave lleve `clienteId` dentro, pero el filtro
  // de la consulta también acota, y quitarlo traería la cartera entera.
  const i = CODIGO.indexOf('const gemelas')
  assert.notEqual(i, -1, 'la lectura de gemelas tiene que estar aislada en su propia consulta')
  const bloque = CODIGO.slice(i, CODIGO.indexOf('const datosDeGemela', i))
  assert.match(bloque, /clienteId:\s*\{\s*in:/, 'la consulta de gemelas no acota por cliente')
  assert.match(bloque, /id:\s*\{\s*notIn:\s*polizaIds\s*\}/, 'una póliza no puede ser su propia gemela')
})

test('🚨 la direccion se DESCIFRA antes de describir el bien, y por las dos ramas', () => {
  // La propia y la de la gemela: si solo se descifrase una, la otra llegaría
  // como sobre `v1:` y `describirBien` la anularía en silencio.
  const llamada = CODIGO.slice(CODIGO.indexOf('describirBienConGemela('))
  assert.match(
    llamada.slice(0, 300),
    /descifrarDireccion\(p\.datosEspecificos\)[\s\S]*descifrarDireccion\(gemelaDe\(p\)\)/,
    'las dos ramas tienen que pasar por el descifrado',
  )
})

test('🚨 quien decide si la direccion se ENSEÑA sigue siendo el nivel', () => {
  // El rescate cambia de DÓNDE sale el dato, nunca quién puede verlo.
  assert.match(
    CODIGO,
    /ubicacion:\s*ve\.direccionRiesgo\s*\?\s*b\.ubicacion\s*:\s*null/,
    'la ubicación tiene que seguir filtrándose por `ve.direccionRiesgo`',
  )
})
