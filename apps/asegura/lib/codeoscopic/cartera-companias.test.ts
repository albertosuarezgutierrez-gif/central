import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defensaDeCartera } from '@central/module-seguros'
import { aCompaniaCatalogo, aPolizaCliente, TOPE_POLIZAS_CLIENTE } from './cartera-companias-mapeo.ts'

// Las dos piezas PURAS del bloque `carteraCompanias` (fila de BD → lo que pide
// `defensaDeCartera()`), más los cepos de FUENTE sobre lo que no se puede probar
// sin base de datos: que la población salga de la fuente única de cartera viva y
// que ningún camino de fallo devuelva una lista vacía.
//
// El fuente se lee con `readFileSync` y no se importa: `cartera-companias.ts`
// arrastra `../asegura-db.ts` → el cliente generado de Prisma, que `node --test`
// no resuelve (y el job `Tests (packages + guardián)` corre sin `prisma generate`).

const FUENTE = readFileSync(fileURLToPath(new URL('./cartera-companias.ts', import.meta.url)), 'utf8')

const FILA = {
  id: 'p-1',
  tipo: 'auto',
  estado: 'activa',
  aseguradora: 'Mapfre',
  numeroPoliza: '3021700291186',
  codigoEntidadDgs: 'C0058',
  importRef: null,
  eiacXmlHash: 'abc123',
}

// ─── El mapeo de la póliza ───────────────────────────────────────────────────

test('una póliza de CIMA sale viva, con su código DGS y su estado tal cual', () => {
  const p = aPolizaCliente(FILA)
  assert.deepEqual(p, {
    id: 'p-1',
    codigoEntidadDgs: 'C0058',
    aseguradora: 'Mapfre',
    estado: 'activa',
    viva: true,
    ramo: 'auto',
    numeroPoliza: '3021700291186',
  })
})

test('`viva` se DERIVA de la fila, no se pone a true por venir de una consulta filtrada', () => {
  // Volcado histórico: con `import_ref` y sin hash de EIAC. Si alguien amplía el
  // `where` mañana, esta fila tiene que seguir diciendo la verdad.
  const p = aPolizaCliente({ ...FILA, importRef: 'intranet:pol:174', eiacXmlHash: null })
  assert.equal(p.viva, false)
})

test('el caso de Reale: import_ref del volcado PERO tocada por CIMA → sigue siendo viva', () => {
  // La `3021700291186` de Reale C0613, el agujero medido el 03/09/2026.
  const p = aPolizaCliente({ ...FILA, importRef: 'asegura_app:pol2:15143', eiacXmlHash: 'h' })
  assert.equal(p.viva, true)
})

test('una cancelada viaja igual: el módulo la cuenta como argumento (exPolizas), no como veto', () => {
  const cancelada = aPolizaCliente({ ...FILA, estado: 'cancelada' })
  assert.equal(cancelada.viva, true)
  assert.equal(cancelada.estado, 'cancelada')

  const d = defensaDeCartera({
    compania: 'Mapfre',
    catalogo: [{ codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'Mapfre' }],
    polizas: [cancelada],
  })
  // Mandar SOLO la cartera en vigor habría perdido esto sin que nada fallara.
  assert.equal(d.estado, 'libre')
  assert.equal(d.exPolizas, 1)
  assert.match(d.motivo, /cancelada/i)
})

test('el enum de Prisma llega como sea, pero nunca se inventa un estado cuando falta', () => {
  assert.equal(aPolizaCliente({ ...FILA, estado: null }).estado, null)
  assert.equal(aPolizaCliente({ ...FILA, tipo: null }).ramo, null)
})

// ─── El catálogo ─────────────────────────────────────────────────────────────

test('`nombreCima` nulo se propaga: es «no se ha visto ninguna póliza de CIMA», no «no tiene nombre»', () => {
  assert.deepEqual(aCompaniaCatalogo({ codigoDgs: 'C0613', nombreComun: 'Reale', nombreCima: null }), {
    codigoDgs: 'C0613',
    nombreComun: 'Reale',
    nombreCima: null,
  })
})

test('el catálogo resuelve el nombre del vendor a un código DGS, que es la identidad fuerte', () => {
  const d = defensaDeCartera({
    compania: 'Mapfre', // el vendor manda SOLO el nombre
    catalogo: [aCompaniaCatalogo({ codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'Mapfre' })],
    polizas: [aPolizaCliente(FILA)], // la póliza manda SOLO el código
    polizaActualId: null,
  })
  assert.equal(d.estado, 'ocupada')
  assert.equal(d.coincidencia, 'dgs')
})

// ─── Cepos de FUENTE (lo que no se puede probar sin BD) ──────────────────────

test('la población sale de la fuente única de cartera viva, no de un import_ref escrito a mano', () => {
  assert.match(FUENTE, /WHERE_CARTERA_VIVA/)
  assert.doesNotMatch(FUENTE, /import_ref\s+is\s+null/i)
  // Y la lista de estados vigentes tampoco se reescribe aquí: la aplica
  // `polizaDefiende()` dentro del módulo.
  assert.doesNotMatch(FUENTE, /POLIZA_ESTADOS_VIGENTES/)
})

test('ningún camino de fallo devuelve una lista vacía: `[]` diría «no tiene ninguna póliza»', () => {
  // Todo `catch` de este fichero tiene que acabar en `no_disponible`.
  const catches = FUENTE.split('} catch').length - 1
  assert.ok(catches >= 3, `se esperaban al menos 3 catch, hay ${catches}`)
  // Ni un solo `return []` en todo el fichero: aquí no hay ningún caso en que
  // una lista vacía sea la respuesta correcta a un fallo.
  assert.doesNotMatch(FUENTE, /return\s*\[\]/)
  const noDisponibles = FUENTE.split("estado: 'no_disponible'").length - 1
  assert.ok(noDisponibles >= 5, `se esperaban al menos 5 salidas no_disponible, hay ${noDisponibles}`)
})

test('el aislamiento por correduría viaja en las dos consultas de pólizas', () => {
  const conCorreduria = FUENTE.split('correduriaId,').length - 1
  assert.ok(conCorreduria >= 2, `el where de correduriaId aparece ${conCorreduria} veces, se esperaban 2`)
})

test('pasarse del tope NO trunca la lista: una lista corta dejaría una compañía ocupada como libre', () => {
  assert.equal(TOPE_POLIZAS_CLIENTE, 200)
  assert.match(FUENTE, /take: TOPE_POLIZAS_CLIENTE \+ 1/)
  assert.match(FUENTE, /filas\.length > TOPE_POLIZAS_CLIENTE/)
})
