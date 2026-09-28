import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * Guardián (28/09/2026): una tarificación que el cliente marcó en el portal como «un dato no es
 * correcto» no vuelve a servir para montar un presupuesto. Si sirviera, el reenvío le mandaría los
 * mismos precios calculados con el dato malo. Se lee el FUENTE: la consulta vive dentro de una
 * función con BD.
 */
const src = readFileSync(join(import.meta.dirname, 'presupuesto.ts'), 'utf8')
const cuerpo = src.slice(src.indexOf('export async function prepararPresupuesto('))

test('prepararPresupuesto se niega si el cliente marcó un dato incorrecto en ESA tarificación', () => {
  assert.match(
    cuerpo,
    /from presupuesto_evento e\s+join presupuesto p on p\.id = e\.presupuesto_id\s+where p\.tarificacion_id = \$\{cab\.id\}::uuid and p\.correduria_id = \$\{correduriaId\}::uuid\s+and e\.tipo = \$\{TIPO_DATOS_INCORRECTOS\}/,
  )
  assert.match(cuerpo, /motivo: 'datos_incorrectos'/)
})

test('la negativa va ANTES de completar coberturas (no se gasta nada en una tarificación que no vale)', () => {
  const guarda = cuerpo.indexOf('from presupuesto_evento e')
  const coberturas = cuerpo.indexOf('await completarCoberturasTarificacion(')
  assert.ok(guarda > 0 && coberturas > 0 && guarda < coberturas)
})
