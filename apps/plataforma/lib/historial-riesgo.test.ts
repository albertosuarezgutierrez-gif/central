import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFileSync } from 'node:fs'
import { antiguedadAnios, companiaDeLista, filasHistorial, filtrarCompanias, nombreCompaniaDeclarada, tipoCatalogoCompanias, type FilaHistorial } from './historial-riesgo.ts'
import { interpretarRiesgo, leerHistorialRiesgo, type HistorialRiesgo } from './riesgo-asegura.ts'

const HOY = '2026-10-10'
const SIN_DECLARAR = {
  aniosAsegurado: null, aniosEnCompania: null, tieneSeguroActual: null, companiaActual: null, numeroPoliza: null,
  aniosSinSiniestros: null, siniestrosUltimos5: null, fotocopiaAnterior: null,
}
const vacio: HistorialRiesgo = { seguroAnterior: null, historialDeclarado: SIN_DECLARAR, carnet: { fecha: null, conductor: null, legible: true } }
const sa = (x: Record<string, unknown>) => ({ codigoDgs: null, fechaEfecto: null, aniosSinSiniestros: null, siniestrosUltimos5: null, ...x }) as HistorialRiesgo['seguroAnterior']

type Entrada = Omit<HistorialRiesgo, 'historialDeclarado'> & { historialDeclarado?: Partial<HistorialRiesgo['historialDeclarado']> }
function filas(h: Entrada | null, compania: string | null = null): FilaHistorial[] {
  const r = filasHistorial(h === null ? null : { ...h, historialDeclarado: { ...SIN_DECLARAR, ...h.historialDeclarado } }, { compania, hoy: HOY })
  assert.equal(r.estado, 'ok')
  return r.estado === 'ok' ? r.filas : []
}
const fila = (fs: FilaHistorial[], clave: FilaHistorial['clave']) => fs.find((f) => f.clave === clave)!

test('historial: sin historial del puerto = sin_leer, no un historial vacío', () => {
  assert.deepEqual(filasHistorial(null, { compania: null, hoy: HOY }), { estado: 'sin_leer' })
})

test('historial: TODO null = pendiente en cada fila; jamás 0, «ninguno» ni años', () => {
  const fs = filas(vacio)
  assert.equal(fs.length, 6)
  for (const f of fs) {
    assert.equal(f.estado, 'pendiente', f.clave)
    assert.equal(f.texto, 'sin dato', f.clave)
  }
})

test('historial: 0 es REVISADO (un valor), no pendiente', () => {
  const fs = filas({ seguroAnterior: sa({ aniosSinSiniestros: 0, siniestrosUltimos5: 0 }), carnet: null })
  assert.equal(fila(fs, 'siniestrosUltimos5').estado, 'revisado')
  assert.equal(fila(fs, 'siniestrosUltimos5').texto, 'ninguno')
  assert.equal(fila(fs, 'aniosSinSiniestros').estado, 'revisado')
  assert.equal(fila(fs, 'aniosSinSiniestros').texto, '0 años')
  assert.equal(fila(fs, 'aniosSinSiniestros').tono, 'aviso')
})

test('historial: con valor = dato; los siniestros dan aviso, los años limpios no', () => {
  const fs = filas({ seguroAnterior: sa({ aniosSinSiniestros: 7, siniestrosUltimos5: 2 }), carnet: null })
  assert.deepEqual([fila(fs, 'aniosSinSiniestros').estado, fila(fs, 'aniosSinSiniestros').texto, fila(fs, 'aniosSinSiniestros').tono], ['dato', '7 años', 'neutro'])
  assert.deepEqual([fila(fs, 'siniestrosUltimos5').estado, fila(fs, 'siniestrosUltimos5').texto, fila(fs, 'siniestrosUltimos5').tono], ['dato', '2', 'aviso'])
  assert.equal(fila(filas({ seguroAnterior: sa({ aniosSinSiniestros: 1 }), carnet: null }), 'aniosSinSiniestros').texto, '1 año')
})

test('historial: años asegurado / en compañía sin valor guardado = pendiente, ni 0 ni el máximo de 10', () => {
  const fs = filas({ seguroAnterior: sa({ aniosSinSiniestros: 9, siniestrosUltimos5: 0 }), carnet: null })
  for (const k of ['aniosAsegurado', 'aniosEnCompania'] as const) {
    assert.equal(fila(fs, k).estado, 'pendiente', k)
    assert.equal(fila(fs, k).texto, 'sin dato', k)
    assert.doesNotMatch(fila(fs, k).nota ?? '', /\d/, k)
  }
})

test('historial: años asegurado / en compañía — tres estados (null · 0 · dato), leídos de historialDeclarado', () => {
  const fs = filas({ seguroAnterior: null, historialDeclarado: { aniosAsegurado: 0, aniosEnCompania: 6 }, carnet: null })
  const a = fila(fs, 'aniosAsegurado')
  assert.deepEqual([a.estado, a.texto], ['revisado', 'menos de 1 año'])
  const c = fila(fs, 'aniosEnCompania')
  assert.deepEqual([c.estado, c.texto], ['dato', '6 años'])
  assert.equal(fila(filas({ seguroAnterior: null, historialDeclarado: { aniosAsegurado: 1 }, carnet: null }), 'aniosAsegurado').texto, '1 año')
  assert.equal(fila(filas({ seguroAnterior: null, historialDeclarado: { aniosAsegurado: 1 }, carnet: null }), 'aniosEnCompania').estado, 'pendiente')
})

test('historial: SOLO años declarados ≠ seguro anterior — ni «parcial» ni dato en esa fila', () => {
  const s = fila(filas({ seguroAnterior: null, historialDeclarado: { aniosAsegurado: 7, aniosEnCompania: 3 }, carnet: null }), 'seguroAnterior')
  assert.deepEqual([s.estado, s.texto], ['pendiente', 'sin dato'])
  // Aunque una fila vieja los traiga DENTRO de seguroAnterior, el lector no los toma por un seguro anterior.
  const leido = leerHistorialRiesgo({ seguroAnterior: { aniosAsegurado: 7, aniosEnCompania: 3 } })
  assert.equal(leido?.seguroAnterior, null)
  assert.deepEqual(leido?.historialDeclarado, SIN_DECLARAR, 'los de dentro de seguroAnterior no cuentan como declarados')
})

test('leerHistorialRiesgo: historialDeclarado saneado — 0 viaja, basura es null (no 0), sin la clave = sin dato', () => {
  const d = leerHistorialRiesgo({ seguroAnterior: null, historialDeclarado: { aniosAsegurado: 0, aniosEnCompania: -2 } })?.historialDeclarado
  assert.deepEqual(d, { ...SIN_DECLARAR, aniosAsegurado: 0 })
  assert.deepEqual(leerHistorialRiesgo({ historialDeclarado: { aniosAsegurado: 'x' } })?.historialDeclarado, SIN_DECLARAR)
  assert.deepEqual(leerHistorialRiesgo({ seguroAnterior: null })?.historialDeclarado, SIN_DECLARAR, 'asegura vieja sin la clave')
})

test('historial: el seguro anterior sale de la compañía de HOY o de lo leído; sin nada, pendiente', () => {
  assert.equal(fila(filas(vacio), 'seguroAnterior').estado, 'pendiente')
  const a = fila(filas(vacio, 'Mapfre'), 'seguroAnterior')
  assert.deepEqual([a.estado, a.texto], ['dato', 'Mapfre'])
  const b = fila(filas({ seguroAnterior: sa({ numeroPoliza: 'ABC123' }), carnet: null }, 'Reale'), 'seguroAnterior')
  assert.equal(b.texto, 'Reale · póliza ABC123')
  const c = fila(filas({ seguroAnterior: sa({ codigoDgs: 'C0058' }), carnet: null }), 'seguroAnterior')
  assert.equal(c.texto, 'compañía C0058')
})

test('historial: seguro anterior PARCIAL (fecha/años sin siniestros sin compañía ni póliza) no es «ninguna póliza leída»', () => {
  const p = fila(filas({ seguroAnterior: sa({ fechaEfecto: '2025-01-01' }), carnet: null }), 'seguroAnterior')
  assert.deepEqual([p.estado, p.texto], ['dato', 'seguro anterior parcial'])
  assert.doesNotMatch(p.nota ?? '', /ninguna póliza/)
  const q = fila(filas({ seguroAnterior: sa({ aniosSinSiniestros: 0 }), carnet: null }), 'seguroAnterior')
  assert.equal(q.texto, 'seguro anterior parcial', 'un 0 también es dato')
  assert.equal(fila(filas({ seguroAnterior: sa({}), carnet: null }), 'seguroAnterior').estado, 'pendiente', 'todo vacío = sin dato')
})

test('historial: carné — sin ninguna ficha de conductor leída (solo ocasional) no es «la ficha no tiene la fecha»', () => {
  const n = fila(filas({ seguroAnterior: null, carnet: { fecha: null, conductor: null, legible: false } }), 'carnet')
  assert.equal(n.estado, 'pendiente')
  assert.match(n.nota ?? '', /no se leyó ninguna ficha de conductor/)
  assert.equal(leerHistorialRiesgo({ carnet: { fecha: null, conductor: null } })?.carnet?.legible, false, 'legible ausente = false, no true')
})

test('historial: carné — ramo sin carné no pinta fila; sin fecha pendiente (y distingue ficha ilegible)', () => {
  assert.equal(filas({ seguroAnterior: null, carnet: null }).some((f) => f.clave === 'carnet'), false)
  assert.deepEqual([fila(filas(vacio), 'carnet').texto, fila(filas(vacio), 'carnet').nota], ['sin dato', 'la ficha no tiene la fecha'])
  const il = fila(filas({ seguroAnterior: null, carnet: { fecha: null, conductor: 'conductor_habitual', legible: false } }), 'carnet')
  assert.equal(il.estado, 'pendiente')
  assert.match(il.nota ?? '', /no se pudo leer/)
})

test('historial: carné — antigüedad en años completos, ISO o dd/mm/aaaa; futuro o basura = pendiente con aviso', () => {
  assert.equal(antiguedadAnios('2012-10-10', HOY), 14)
  assert.equal(antiguedadAnios('2012-10-11', HOY), 13, 'aún no ha cumplido el año')
  assert.equal(antiguedadAnios('10/10/2012', HOY), 14)
  assert.equal(antiguedadAnios('2027-01-01', HOY), null)
  assert.equal(antiguedadAnios('2012-02-31', HOY), null)
  assert.equal(antiguedadAnios('ayer', HOY), null)
  const ok = fila(filas({ seguroAnterior: null, carnet: { fecha: '2012-03-12', conductor: 'conductor_habitual', legible: true } }), 'carnet')
  assert.deepEqual([ok.estado, ok.tono], ['dato', 'neutro'])
  assert.match(ok.texto, /^14 años \(desde 12\/03\/2012\)/)
  const nuevo = fila(filas({ seguroAnterior: null, carnet: { fecha: '2026-06-01', conductor: null, legible: true } }), 'carnet')
  assert.deepEqual([nuevo.estado, nuevo.texto.startsWith('menos de 1 año'), nuevo.tono], ['revisado', true, 'aviso'])
  const fut = fila(filas({ seguroAnterior: null, carnet: { fecha: '2030-01-01', conductor: null, legible: true } }), 'carnet')
  assert.equal(fut.estado, 'pendiente')
})

test('leerHistorialRiesgo: forma rara = null; seguro anterior saneado; carné ausente = null (no aplica)', () => {
  assert.equal(leerHistorialRiesgo(undefined), null)
  assert.equal(leerHistorialRiesgo([]), null)
  const h = leerHistorialRiesgo({ seguroAnterior: { aniosSinSiniestros: '8', siniestrosUltimos5: -1, codigoDgs: 'xx' }, carnet: undefined })
  assert.equal(h?.carnet, null)
  assert.equal(h?.seguroAnterior?.aniosSinSiniestros, 8)
  assert.equal(h?.seguroAnterior?.siniestrosUltimos5, null, 'un valor con forma rara es «no se sabe», no 0')
  assert.equal(leerHistorialRiesgo({ seguroAnterior: {} })?.seguroAnterior, null, 'sin ningún dato, null entero')
  const c = leerHistorialRiesgo({ carnet: { fecha: '2015-01-01', conductor: 'raro', legible: false } })?.carnet
  assert.deepEqual(c, { fecha: '2015-01-01', conductor: null, legible: false })
})

test('interpretarRiesgo: historial ausente = null (asegura vieja), presente se lee', () => {
  const base = { estado: 'ok', oportunidad: { id: 'o1', clienteId: 'c1', ramo: 'auto' }, figuras: [], roles: [], variantes: [] }
  const sin = interpretarRiesgo(200, base)
  assert.equal(sin.estado === 'ok' && sin.riesgo.historial, null)
  const con = interpretarRiesgo(200, { ...base, historial: { seguroAnterior: null, carnet: { fecha: null, conductor: null, legible: true } } })
  assert.deepEqual(con.estado === 'ok' && con.riesgo.historial, vacio)
})

// ── 13/10/2026: seguro actual, compañía, nº de póliza y siniestros DECLARADOS en el bloque (lo que se consulta en SINCO) ──

test('historial declarado: «no tiene seguro ahora» es REVISADO (un dato), no pendiente; y lo dice', () => {
  const f = fila(filas({ seguroAnterior: sa({ numeroPoliza: 'X12345' }), historialDeclarado: { tieneSeguroActual: false }, carnet: null }, 'Reale'), 'seguroAnterior')
  assert.deepEqual([f.estado, f.texto], ['revisado', 'no tiene seguro ahora'])
  assert.match(f.nota ?? '', /declarado aquí/)
})

test('historial declarado: compañía + póliza declaradas mandan, se rotulan «declarado aquí» y se dicen los 5 últimos', () => {
  const f = fila(filas({ seguroAnterior: sa({ numeroPoliza: 'LEIDA99999' }), historialDeclarado: { tieneSeguroActual: true, companiaActual: 'Allianz', numeroPoliza: '0123456789' }, carnet: null }, 'Reale'), 'seguroAnterior')
  assert.equal(f.texto, 'tiene seguro · Allianz · póliza 0123456789')
  assert.match(f.nota ?? '', /^declarado aquí/)
  assert.match(f.nota ?? '', /5 últimos: 56789/)
  assert.equal(f.tono, 'neutro')
})

test('historial declarado: solo «tiene seguro» = dato con aviso de lo que falta para SINCO; lo leído rellena y se dice', () => {
  const solo = fila(filas({ seguroAnterior: null, historialDeclarado: { tieneSeguroActual: true }, carnet: null }), 'seguroAnterior')
  assert.equal(solo.tono, 'aviso')
  assert.match(solo.nota ?? '', /falta la compañía y el nº de póliza/)
  const mixto = fila(filas({ seguroAnterior: sa({ numeroPoliza: 'P-77777' }), historialDeclarado: { tieneSeguroActual: true }, carnet: null }, 'Mapfre'), 'seguroAnterior')
  assert.equal(mixto.texto, 'tiene seguro · Mapfre · póliza P-77777')
  assert.match(mixto.nota ?? '', /compañía y nº de póliza: lo leído de su póliza/)
})

test('historial declarado: años sin siniestros / siniestros en 5 — lo declarado manda sobre lo leído, 0 es dato', () => {
  const fs = filas({ seguroAnterior: sa({ aniosSinSiniestros: 9, siniestrosUltimos5: 0 }), historialDeclarado: { aniosSinSiniestros: 2, siniestrosUltimos5: 1 }, carnet: null })
  assert.deepEqual([fila(fs, 'aniosSinSiniestros').texto, fila(fs, 'aniosSinSiniestros').nota], ['2 años', 'declarado aquí'])
  assert.deepEqual([fila(fs, 'siniestrosUltimos5').texto, fila(fs, 'siniestrosUltimos5').nota], ['1', 'declarado aquí'])
  const cero = filas({ seguroAnterior: null, historialDeclarado: { aniosSinSiniestros: 0, siniestrosUltimos5: 0 }, carnet: null })
  assert.equal(fila(cero, 'aniosSinSiniestros').estado, 'revisado')
  assert.deepEqual([fila(cero, 'siniestrosUltimos5').estado, fila(cero, 'siniestrosUltimos5').texto], ['revisado', 'ninguno'])
  // Lo leído sin declarar: sin la nota «declarado aquí» (lo leído nunca se rotula como declarado, ni al revés).
  assert.equal(fila(filas({ seguroAnterior: sa({ aniosSinSiniestros: 9 }), carnet: null }), 'aniosSinSiniestros').nota, null)
})

test('historial declarado: compañía / póliza declaradas NO convierten el seguro anterior LEÍDO en dato (siguen fuera de seguroAnterior)', () => {
  const leido = leerHistorialRiesgo({ seguroAnterior: null, historialDeclarado: { tieneSeguroActual: true, companiaActual: 'Reale', numeroPoliza: '12345678' } })
  assert.equal(leido?.seguroAnterior, null)
  assert.equal(leido?.historialDeclarado.numeroPoliza, '12345678')
})

// ── Compañía actual: selector con la lista de Codeoscopic (13/10/2026, «los campos son siempre los de Avant2») ──
const LISTA = [
  { id: 'M0083', nombre: 'Mapfre España' },
  { id: 'C0517', nombre: 'Línea Directa Aseguradora' },
  { id: 'C0072', nombre: 'Allianz' },
]

test('compañía: el catálogo es el del ramo (moto tiene el suyo; el resto, el de coche)', () => {
  assert.equal(tipoCatalogoCompanias('moto'), 'companias-anteriores-moto')
  assert.equal(tipoCatalogoCompanias('auto'), 'companias-anteriores')
  assert.equal(tipoCatalogoCompanias('hogar'), 'companias-anteriores')
})

test('compañía: búsqueda sin tildes ni mayúsculas, por nombre o código, con tope', () => {
  assert.deepEqual(filtrarCompanias(LISTA, 'linea').opciones.map((o) => o.id), ['C0517'])
  assert.deepEqual(filtrarCompanias(LISTA, 'm0083').opciones.map((o) => o.id), ['M0083'])
  assert.equal(filtrarCompanias(LISTA, '').total, 3)
  const r = filtrarCompanias(LISTA, '', 2)
  assert.equal(r.opciones.length, 2)
  assert.equal(r.total, 3)
  assert.equal(filtrarCompanias(LISTA, 'zurich').total, 0)
})

test('compañía: lo guardado se lleva al CÓDIGO de la lista; lo que no casa = null (nunca se inventa)', () => {
  assert.equal(companiaDeLista(LISTA, 'm0083'), 'M0083')
  assert.equal(companiaDeLista(LISTA, 'Allianz'), 'C0072')
  assert.equal(companiaDeLista(LISTA, 'Compañía Inventada'), null)
  assert.equal(companiaDeLista(LISTA, null), null)
  assert.equal(companiaDeLista(LISTA, '  '), null)
})

test('compañía: la fila pinta el NOMBRE del código guardado; sin lista, el código tal cual', () => {
  assert.equal(nombreCompaniaDeclarada(LISTA, 'C0517'), 'Línea Directa Aseguradora')
  assert.equal(nombreCompaniaDeclarada(null, 'C0517'), 'C0517')
  const h = { ...vacio, historialDeclarado: { ...SIN_DECLARAR, tieneSeguroActual: true, companiaActual: 'C0517', numeroPoliza: '12345678' } }
  const r = filasHistorial(h, { compania: null, hoy: HOY, nombreCompania: (v) => nombreCompaniaDeclarada(LISTA, v) })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.match(fila(r.filas, 'seguroAnterior').texto, /Línea Directa Aseguradora/)
})

test('fuente: la compañía actual se ELIGE de la lista de Codeoscopic (select + búsqueda), no se teclea; a mano solo sin lista', () => {
  const f = readFileSync(new URL('../app/(usuario)/correduria/oportunidad/[id]/HistorialRiesgo.tsx', import.meta.url), 'utf8')
  const editor = f.slice(f.indexOf('function EditorHistorial('), f.indexOf('function SelectorCompania('))
  assert.match(editor, /<SelectorCompania/)
  assert.doesNotMatch(editor, /onChange=\{\(e\) => setCompania\(e\.target\.value\)\}/, 'nada de texto libre directo en el editor')
  const sel = f.slice(f.indexOf('function SelectorCompania('), f.indexOf('const REJILLA'))
  assert.match(sel, /<select id="historial-compania"/)
  assert.match(sel, /<option key=\{o\.id\} value=\{o\.id\}>/, 'el valor guardado es el CÓDIGO de Avant2')
  assert.match(sel, /filtrarCompanias\(lista, buscar\)/)
  // El texto libre solo cuando NO hay lista (y se dice por qué).
  const sinLista = sel.slice(sel.indexOf('if (lista === null)'), sel.indexOf('const { opciones, total }'))
  assert.match(sinLista, /<input /)
  assert.match(sinLista, /No se ha podido leer la lista de compañías de Codeoscopic/)
  assert.match(f, /pedirCatalogo\(\{ tipo: tipoCatalogoCompanias\(op\.ramo\) \}\)/, 'la lista es el catálogo gratis de Avant2 del ramo')
})

// 15/10/2026: una fila SIN DATO dice con qué se cotizará (la nota de la fuente única `valoresQueViajan`), pero sigue siendo
// «sin dato»: el supuesto nunca se pinta como si fuera el dato. Una fila CON dato no se toca.
test('historial: `cotizara` cambia solo la nota de las filas pendientes; el texto sigue «sin dato»', () => {
  const r = filasHistorial(
    { ...vacio, seguroAnterior: sa({ aniosSinSiniestros: 4 }) },
    { compania: null, hoy: HOY, cotizara: { aniosAsegurado: 'Sin dato · se cotizará con 10 años (supuesto)', aniosSinSiniestros: 'no debería verse' } },
  )
  assert.equal(r.estado, 'ok')
  const fs = r.estado === 'ok' ? r.filas : []
  assert.equal(fila(fs, 'aniosAsegurado').texto, 'sin dato')
  assert.equal(fila(fs, 'aniosAsegurado').nota, 'Sin dato · se cotizará con 10 años (supuesto)')
  assert.equal(fila(fs, 'aniosSinSiniestros').estado, 'dato')
  assert.equal(fila(fs, 'aniosSinSiniestros').nota, null, 'con dato, la nota de siempre')
  assert.equal(fila(fs, 'aniosEnCompania').nota, 'se declara al pedir precio', 'sin `cotizara` para esa fila, la de siempre')
})
