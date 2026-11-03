import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_ELEMENTOS_VOLCADO,
  claveUnidad,
  clavePlantilla,
  evaluarVolcado,
  normalizarVolcadoLeido,
  sinIdentificadores,
  validarPropuesta,
  type ContextoVolcado,
  type PropuestaVolcado,
} from './volcado.ts'

const VACIO: ContextoVolcado = { inmuebles: [], existentes: new Map() }
const ED_ID = '11111111-1111-4111-8111-111111111111'
const AJENO = '22222222-2222-4222-8222-222222222222'

/** Lo que devolvería la IA para el piloto: un edificio sin división horizontal con 12 pisos. */
function brutoPiloto() {
  return {
    inmuebles: [
      { ref: 'ED', nombre: 'Busto Tavera 22', uso: 'edificio', referencia_catastral: '5731022TG3453B0001AK', direccion: 'C/ Busto Tavera 22', cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
      ...Array.from({ length: 12 }, (_, i) => ({ ref: `P${i + 1}`, nombre: `Piso ${i + 1}`, uso: 'piso', edificio: 'ED', superficie_m2: '65,5' })),
    ],
    contratos: [
      { inmueble: 'P1', inquilino: 'Ana Pérez López', inicio: '01/09/2024', renta_mensual: '750,00', fianza: '750', actualizacion: 'IPC', nif: '12345678Z', telefono: '612345678' },
      { inmueble: 'P2', inquilino: '12345678Z', inicio: '2025-01-01', renta_mensual: 0 },
    ],
    gastos: [{ inmueble: 'ED', concepto: 'IBI', categoria: 'ibi', periodicidad: 'anual', importe: '1.234,56', dia_mes: 15, inicio: '01/01/2026' }],
    iban: 'ES9121000418450200051332',
  }
}

test('normalizar: el piloto (edificio + 12 pisos) entra con refs propias, céntimos y fechas ISO', () => {
  const { propuesta: p, motivos } = normalizarVolcadoLeido(brutoPiloto())
  assert.deepEqual(motivos, [])
  assert.equal(p.inmuebles.length, 13)
  assert.equal(p.inmuebles[0].uso, 'edificio')
  assert.equal(p.inmuebles[0].referenciaCatastral, '5731022TG3453B0001AK')
  assert.ok(p.inmuebles.slice(1).every((u) => u.edificio === 'I1' && u.uso === 'vivienda' && u.superficieM2 === 65.5))
  assert.equal(p.contratos[0].inmueble, 'I2')
  assert.equal(p.contratos[0].rentaCent, 75_000)
  assert.equal(p.contratos[0].inicio, '2024-09-01')
  assert.equal(p.contratos[0].indice, 'IPC')
  assert.deepEqual(p.contratos[0].inquilino, { nombre: 'Ana Pérez López', tipo: 'persona' })
  assert.equal(p.gastos[0].importeCent, 123_456)
  assert.equal(p.gastos[0].categoria, 'IMPUESTOS')
  assert.equal(p.gastos[0].inmueble, 'I1')
})

test('🚨 normalizar: ni NIF, ni teléfono, ni IBAN, ni correo entran en la propuesta', () => {
  const { propuesta } = normalizarVolcadoLeido(brutoPiloto())
  const json = JSON.stringify(propuesta)
  assert.doesNotMatch(json, /12345678Z|612345678|ES91|nif|telefono|iban/i)
  // Un «inquilino» que en realidad es un NIF se queda en «no consta».
  assert.equal(propuesta.contratos[1].inquilino, null)
  assert.equal(sinIdentificadores('Ana (ana@x.es, 612 34 56 78, 12345678Z, ES91 2100 0418 4502 0005 1332)'), 'Ana ( , , , )')
  assert.equal(sinIdentificadores('C/ Busto Tavera 22, 41003 Sevilla'), 'C/ Busto Tavera 22, 41003 Sevilla')
})

test('normalizar: «no se sabe» no se convierte en 0 ni en un valor de cajón', () => {
  const { propuesta } = normalizarVolcadoLeido({
    inmuebles: [{ nombre: 'N/A', uso: 'otro', direccion: 'desconocido', superficie_m2: 0 }],
    contratos: [{ inmueble: 'nada', renta_mensual: 0, fianza: 0, inicio: '31/02/2025' }],
    gastos: [{ concepto: 'Gestoría', categoria: 'OTRO', importe: 0, dia_mes: 0 }],
  })
  assert.equal(propuesta.inmuebles[0].alias, null)
  assert.equal(propuesta.inmuebles[0].uso, null)
  assert.equal(propuesta.inmuebles[0].direccion, null)
  assert.equal(propuesta.inmuebles[0].superficieM2, null, '0 m² = no consta')
  assert.equal(propuesta.contratos[0].rentaCent, null, 'renta 0 = no consta, jamás 0')
  assert.equal(propuesta.contratos[0].fianzaCent, 0, 'la fianza 0 sí es un dato')
  assert.equal(propuesta.contratos[0].inicio, null)
  assert.equal(propuesta.contratos[0].inmueble, null)
  assert.equal(propuesta.gastos[0].categoria, null)
  assert.equal(propuesta.gastos[0].importeCent, null)
  assert.equal(propuesta.gastos[0].diaMes, null)
})

test('normalizar: tope de elementos y basura sin forma', () => {
  const muchos = { inmuebles: Array.from({ length: MAX_ELEMENTOS_VOLCADO + 5 }, (_, i) => ({ nombre: `X${i}`, uso: 'local' })) }
  const r = normalizarVolcadoLeido(muchos)
  assert.equal(r.propuesta.inmuebles.length, MAX_ELEMENTOS_VOLCADO)
  assert.equal(r.motivos.length, 1)
  assert.deepEqual(normalizarVolcadoLeido('hola').propuesta, { inmuebles: [], contratos: [], gastos: [] })
  // Un edificio que se apunta a sí mismo no es unidad de nada.
  assert.equal(normalizarVolcadoLeido({ inmuebles: [{ ref: 'A', nombre: 'A', uso: 'edificio', edificio: 'A' }] }).propuesta.inmuebles[0].edificio, null)
})

test('evaluar: el piloto en un patrimonio vacío se crea entero (edificio, 12 unidades, contrato, gasto fijo)', () => {
  const { propuesta } = normalizarVolcadoLeido(brutoPiloto())
  const e = evaluarVolcado(propuesta, VACIO)
  assert.ok(e.inmuebles.every((i) => i.estado === 'nueva'))
  assert.deepEqual(e.inmuebles[1].edificio, { ref: 'I1' })
  assert.equal(e.contratos[0].estado, 'nueva')
  assert.deepEqual(e.contratos[0].inmueble, { ref: 'I2' })
  assert.equal(e.contratos[1].estado, 'con_problema', 'renta 0 de la IA = falta la renta')
  assert.equal(e.gastos[0].estado, 'nueva')
  assert.deepEqual(e.resumen, { nuevos: 15, yaExisten: 0, conProblema: 1, inquilinos: 1 })
})

test('evaluar: reimportar no duplica y las unidades se cuelgan del edificio EXISTENTE', () => {
  const { propuesta } = normalizarVolcadoLeido(brutoPiloto())
  const ctx: ContextoVolcado = {
    inmuebles: [{ id: ED_ID, alias: 'Busto Tavera 22', uso: 'edificio', inmueblePadreId: null }],
    existentes: new Map([
      ['rc:5731022TG3453B0001AK', ED_ID],
      [claveUnidad(ED_ID, 'Piso 1'), '33333333-3333-4333-8333-333333333333'],
      [clavePlantilla({ inmuebleId: ED_ID, concepto: 'ibi', periodicidad: 'anual' }), '44444444-4444-4444-8444-444444444444'],
    ]),
  }
  const e = evaluarVolcado(propuesta, ctx)
  assert.equal(e.inmuebles[0].estado, 'ya_existe')
  assert.equal(e.inmuebles[1].estado, 'ya_existe', 'Piso 1 ya cuelga del edificio')
  assert.equal(e.inmuebles[2].estado, 'nueva')
  assert.deepEqual(e.inmuebles[2].edificio, { id: ED_ID })
  assert.deepEqual(e.contratos[0].inmueble, { id: '33333333-3333-4333-8333-333333333333' })
  assert.equal(e.gastos[0].estado, 'ya_existe')
})

test('🚨 evaluar: un uuid que NO es del titular es «no encontrado» (nunca se escribe contra él)', () => {
  const p: PropuestaVolcado = {
    inmuebles: [{ ref: 'U', alias: 'Piso', uso: 'vivienda', edificio: AJENO, referenciaCatastral: null, direccion: null, cp: null, municipio: null, provincia: null, superficieM2: null }],
    contratos: [{ ref: 'C', inmueble: AJENO, inquilino: null, inicio: '2025-01-01', fin: null, rentaCent: 100, fianzaCent: null, indice: null }],
    gastos: [{ ref: 'G', inmueble: AJENO, concepto: 'IBI', categoria: 'IMPUESTOS', periodicidad: 'anual', importeCent: 1, diaMes: 1, inicio: '2026-01-01' }],
  }
  const e = evaluarVolcado(p, VACIO)
  assert.equal(e.inmuebles[0].estado, 'con_problema')
  assert.equal(e.contratos[0].estado, 'con_problema')
  assert.equal(e.gastos[0].estado, 'con_problema')
  assert.equal(e.resumen.nuevos, 0)
})

test('evaluar: los dependientes de un elemento con problema tampoco se crean; un piso no es un edificio', () => {
  const base = { referenciaCatastral: null, direccion: null, cp: null, municipio: null, provincia: null, superficieM2: null }
  const p: PropuestaVolcado = {
    inmuebles: [
      { ref: 'E', alias: null, uso: 'edificio', edificio: null, ...base },
      { ref: 'U', alias: 'Piso 1', uso: 'vivienda', edificio: 'E', ...base },
      { ref: 'L', alias: 'Local', uso: 'local', edificio: null, ...base },
      { ref: 'X', alias: 'Bajo', uso: 'vivienda', edificio: 'L', ...base },
    ],
    contratos: [{ ref: 'C', inmueble: 'U', inquilino: null, inicio: '2025-01-01', fin: null, rentaCent: 100, fianzaCent: null, indice: null }],
    gastos: [],
  }
  const e = evaluarVolcado(p, VACIO)
  assert.deepEqual(e.inmuebles.map((i) => i.estado), ['con_problema', 'con_problema', 'nueva', 'con_problema'])
  assert.equal(e.contratos[0].estado, 'con_problema')
})

test('validarPropuesta: forma estricta (refs únicas, céntimos enteros, fechas reales, sin claves de PII que pasen)', () => {
  const ok = validarPropuesta({
    inmuebles: [{ ref: 'I1', alias: 'Piso', uso: 'vivienda', nif: '12345678Z' }],
    contratos: [{ ref: 'C1', inmueble: 'I1', inquilino: { nombre: 'Ana', tipo: 'persona', telefono: '612345678' }, inicio: '2025-01-01', rentaCent: 70000 }],
    gastos: [],
  })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.doesNotMatch(JSON.stringify(ok.propuesta), /12345678Z|612345678/)
  assert.deepEqual(validarPropuesta({ inmuebles: [{ ref: 'I1', uso: 'vivienda' }, { ref: 'I1', uso: 'local' }], contratos: [], gastos: [] }), { ok: false, campo: 'inmuebles[1].ref' })
  assert.deepEqual(validarPropuesta({ inmuebles: [], contratos: [{ ref: 'C', rentaCent: 12.5 }], gastos: [] }), { ok: false, campo: 'contratos[0].rentaCent' })
  assert.deepEqual(validarPropuesta({ inmuebles: [], contratos: [{ ref: 'C', inicio: '2025-02-30' }], gastos: [] }), { ok: false, campo: 'contratos[0].inicio' })
  assert.deepEqual(validarPropuesta({ inmuebles: [], contratos: [], gastos: [{ ref: 'G', importeCent: 0 }] }), { ok: false, campo: 'gastos[0].importeCent' })
  assert.deepEqual(validarPropuesta({ inmuebles: [] }), { ok: false, campo: 'propuesta' })
})
