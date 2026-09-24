import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CAMPOS_CON_VALOR, MAX_CAMBIOS, cambiosParaGuardar, sanearCambio } from './cambios.ts'

const ID = '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b'

test('un campo de negocio de la lista blanca guarda antes y después', () => {
  assert.deepEqual(
    sanearCambio({ entidad: 'siniestro', id: ID, campo: 'estado', antes: 'abierto', despues: 'cerrado' }),
    { entidad: 'siniestro', id: ID, campo: 'estado', antes: 'abierto', despues: 'cerrado' },
  )
})

test('un dato personal NUNCA guarda su valor, aunque se lo pasen', () => {
  for (const campo of ['dni', 'nombre', 'direccion', 'telefono', 'email', 'notas', 'fecha_nacimiento']) {
    const c = sanearCambio({ entidad: 'cliente', id: ID, campo, antes: '12345678Z', despues: 'Calle Falsa 1' })
    assert.deepEqual(c, { entidad: 'cliente', id: ID, campo, tocado: true })
    assert.doesNotMatch(JSON.stringify(c), /12345678Z|Calle Falsa/)
  }
})

test('un campo sin clasificar cae del lado de NO guardar', () => {
  assert.deepEqual(sanearCambio({ entidad: 'poliza', id: ID, campo: 'campo_nuevo', antes: 1, despues: 2 }),
    { entidad: 'poliza', id: ID, campo: 'campo_nuevo', tocado: true })
})

test('objetos y arrays no se guardan aunque el campo esté en la lista blanca', () => {
  assert.deepEqual(sanearCambio({ entidad: 'poliza', id: ID, campo: 'estado', antes: { a: 1 }, despues: 'x' }),
    { entidad: 'poliza', id: ID, campo: 'estado', tocado: true })
})

test('fechas a ISO, textos largos recortados, sin cambio real fuera, tope de filas', () => {
  const d = new Date('2026-09-23T10:00:00Z')
  assert.deepEqual(sanearCambio({ entidad: 'poliza', id: ID, campo: 'fecha_efecto', antes: null, despues: d }),
    { entidad: 'poliza', id: ID, campo: 'fecha_efecto', antes: null, despues: '2026-09-23T10:00:00.000Z' })
  const largo = sanearCambio({ entidad: 'poliza', id: ID, campo: 'aseguradora', antes: null, despues: 'x'.repeat(500) })
  assert.equal(('despues' in largo) && String(largo.despues).length, 80)
  assert.equal(cambiosParaGuardar([{ entidad: 'cliente', id: ID, campo: 'activo', antes: true, despues: true }]).length, 0)
  const muchos = Array.from({ length: 200 }, (_, i) => ({ entidad: 'cliente', id: ID, campo: `c${i}` }))
  assert.equal(cambiosParaGuardar(muchos).length, MAX_CAMBIOS)
})

test('la lista blanca no contiene ningún campo de identidad o contacto', () => {
  for (const k of CAMPOS_CON_VALOR) {
    assert.doesNotMatch(k, /\.(dni|nif|nombre|apellidos|direccion|telefono|email|iban|notas|observaciones|respuesta|fecha_nacimiento|codigo_postal|ciudad)$/, k)
  }
})

test('las escrituras críticas de la cartera anotan sus cambios', () => {
  const debe: Record<string, string[]> = {
    'cartera-edicion.ts': ['editarCliente', 'descartarCliente', 'restaurarCliente', 'altaCliente'],
    'cartera-siniestros.ts': ['cambiarEstadoSiniestro', 'abrirSiniestro'],
    'cartera-poliza-editar.ts': ['establecerModalidadRc', 'establecerDireccionRiesgo'],
    'cartera-relaciones.ts': ['crearRelacion', 'autorizarVer', 'borrarRelacion'],
    'supresiones.ts': ['resolverSupresion'],
    'cartera-intervinientes.ts': ['quitarInterviniente'],
    'emision.ts': ['registrarPolizaEmitida'],
  }
  const faltan: string[] = []
  for (const [f, funciones] of Object.entries(debe)) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')
    for (const fn of funciones) {
      const i = src.indexOf(`export async function ${fn}(`)
      assert.ok(i >= 0, `${f}: no existe ${fn}`)
      const j = src.indexOf('\nexport ', i + 1)
      if (!src.slice(i, j < 0 ? undefined : j).includes('anotarCambio(')) faltan.push(`${f}:${fn}`)
    }
  }
  assert.deepEqual(faltan, [], 'estas escrituras críticas no anotan qué cambiaron')
})
