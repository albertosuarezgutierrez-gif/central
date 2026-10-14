// Guardián: UN solo camino para cambiar el vencimiento de una oportunidad (14/10/2026).
// Un lead contestó por WhatsApp que su vencimiento era otro y Alberto no encontraba dónde
// cambiarlo: existían DOS caminos (el campo de fecha de «Gestionar → Corregir» y
// `EditarVencimiento`) que no hacían lo mismo — el primero movía la fecha y dejaba la llamada en la
// fecha vieja. Lee el FUENTE con `readFileSync` (tsc no ve estas reglas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CORR = join(import.meta.dirname, '..', 'apps', 'plataforma', 'app', '(usuario)', 'correduria')
const leer = (...p: string[]) => readFileSync(join(CORR, ...p), 'utf8')

/** Cuerpo de `function FormEdicion` hasta la siguiente función de nivel superior. */
function cuerpoFormEdicion(src: string): string {
  const i = src.indexOf('function FormEdicion(')
  assert.ok(i >= 0, 'FormEdicion ya no existe: revisa este guardián')
  const resto = src.slice(i + 10)
  const j = resto.search(/\n(?:export )?(?:default )?function \w+\(/)
  return j < 0 ? resto : resto.slice(0, j)
}

test('FormEdicion no manda fechaFinVigencia sin reprogramar (ni lleva campo de fecha)', () => {
  const f = cuerpoFormEdicion(leer('cliente', '[id]', 'OportunidadesCliente.tsx'))
  assert.doesNotMatch(f, /fechaFinVigencia/, 'FormEdicion manda fechaFinVigencia: la llamada quedaría en la fecha vieja (el vencimiento se cambia con EditarVencimiento)')
  assert.doesNotMatch(f, /type="date"/, 'FormEdicion vuelve a tener un campo de fecha: el vencimiento se cambia con EditarVencimiento')
})

test('la tarjeta de oportunidad monta EditarVencimiento, visible y fuera de «Gestionar»', () => {
  const src = leer('cliente', '[id]', 'OportunidadesCliente.tsx')
  assert.match(src, /<EditarVencimiento\b/)
  const form = cuerpoFormEdicion(src)
  assert.doesNotMatch(form, /<EditarVencimiento[\s/]/,'EditarVencimiento no debe estar dentro de FormEdicion («Gestionar»)')
  const fuera = src.replace(form, '')
  assert.match(fuera, /<EditarVencimiento\b/, 'EditarVencimiento debe montarse fuera de FormEdicion, en la tarjeta')
})

test('EditarVencimiento manda siempre reprogramar', () => {
  const src = leer('cliente', '[id]', 'EditarVencimiento.tsx')
  assert.match(src, /fechaFinVigencia:\s*fecha,\s*reprogramar/)
})

test('la lista de WhatsApp (VencimientosClient) monta EditarVencimiento y la línea «Por qué sale»', () => {
  const src = leer('vencimientos', 'VencimientosClient.tsx')
  assert.match(src, /import EditarVencimiento from/)
  assert.match(src, /<EditarVencimiento\b[^>]*oportunidadId=\{l\.oportunidadId\}/)
  assert.match(src, /onGuardado=\{onRecargar\}/)
  assert.match(src, /Por qué sale/)
  assert.doesNotMatch(src, /fechaFinVigencia/, 'la lista no debe escribir el vencimiento por su cuenta')
})
