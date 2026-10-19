import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 🪤 Lead de correo → Google Contacts (19/10/2026). Leer el fuente es a propósito: estas funciones hablan
// con Prisma y con Google. La lógica de QUÉ se escribe es pura y la prueba
// `packages/module-seguros/src/google-contactos-lead.test.ts`.
const lead = readFileSync(new URL('./google-contactos-lead.ts', import.meta.url), 'utf8')
const inicio = lead.indexOf('export async function anadirFichasAGoogle')
const cuerpo = lead.slice(inicio, lead.indexOf('\n}\n', inicio))

test('anadirFichasAGoogle consulta la compuerta del cron ANTES de cualquier escritura o llamada a Google', () => {
  assert.ok(inicio >= 0)
  const iPuerta = cuerpo.indexOf('puertaSync(conexion)')
  assert.ok(iPuerta > 0, 'no consulta puertaSync')
  // Cada estado de la puerta que no es «adelante» corta con su estado claro.
  assert.match(cuerpo, /if \(puerta === 'pendiente_activar'\) return \{ estado: 'no_activada'/)
  assert.match(cuerpo, /if \(puerta !== 'adelante' \|\| !conexion\) return \{ estado: 'sin_conexion'/)
  const iCorte = cuerpo.indexOf("if (puerta !== 'adelante'")
  for (const escritura of ['.update(', '.create(', '.createMany(', '.deleteMany(', 'asegurarGrupo(', 'encolarRevisiones(', 'guardarVinculo(', 'accesoDesdeRefresh(', 'new People(', 'crearLote(', 'actualizarLote(']) {
    const i = cuerpo.indexOf(escritura)
    if (i >= 0) assert.ok(i > iCorte, `${escritura} va ANTES de la compuerta`)
  }
})

test('sin clave PII que abra la cartera no se escribe nada (regla 7), y el ensayo sale antes de escribir', () => {
  const iPii = cuerpo.indexOf("estadoClavePii(")
  const iEnsayo = cuerpo.indexOf('if (ensayo) return salida()')
  assert.ok(iPii > 0 && iEnsayo > 0)
  for (const escritura of ['encolarRevisiones(', 'guardarVinculo(', 'crearLote(', 'actualizarLote(']) {
    const i = cuerpo.indexOf(escritura)
    assert.ok(i > iPii, `${escritura} va antes de mirar la clave PII`)
    assert.ok(i > iEnsayo, `${escritura} va antes del corte del ensayo`)
  }
  // `asegurarGrupo` CREA la etiqueta: en ensayo solo se busca.
  assert.match(cuerpo, /ensayo \? \(\(await people\.buscarGrupo\(\)\) \?\? ''\) : await people\.asegurarGrupo\(\)/)
})

test('solo ejecuta lo de las fichas pedidas (accionesParaFichas), nunca el plan entero', () => {
  assert.match(cuerpo, /accionesParaFichas\(/)
  for (const prohibido of ['plan.crear', 'plan.actualizar', 'plan.retirar', 'plan.desvincular', 'plan.olvidar', 'plan.apartar', 'plan.reasignar', 'plan.refrescar', 'borrarLote(lote']) {
    assert.ok(!cuerpo.includes(prohibido), `ejecuta ${prohibido}: eso es del cron`)
  }
})

// La selección del cron mantiene los leads de correo que YA tienen vínculo: sin esto el cron los retiraría
// (no salen en `contactosMovil`) en la pasada siguiente al alta.
const seleccion = readFileSync(new URL('./contactos-google.ts', import.meta.url), 'utf8')
test('la selección de Google incluye los leads de correo vinculados (y solo los pedidos, sin vínculo)', () => {
  assert.match(seleccion, /\[\.\.\.new Set\(\[\.\.\.vinculadas, \.\.\.\(opciones\.leadsCorreo \?\? \[\]\)\]\)\]/)
  assert.match(seleccion, /fuente: 'correo', activo: true, mergedIntoClienteId: null/)
  assert.match(seleccion, /\.\.\.deLeadsCorreo,/)
  // Sin poder leer su contacto la selección NO está completa (si no, el cron los retiraría).
  assert.match(seleccion, /contactoCorreo !== null/)
})
