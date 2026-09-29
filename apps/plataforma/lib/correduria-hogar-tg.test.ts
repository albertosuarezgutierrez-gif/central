import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { aplicarDatosHogar, CAMPO_A_RESUELTO, CAMPOS_CATALOGO_9, elegirOpcion, faltanHogar, resueltosFinales, textoPropuestaHogar } from './correduria-hogar-tg.ts'
import type { Fila, PrecalificacionHogar } from './hogar-nuevo-asegura.ts'

const fila = (campo: string, control: Fila['control'], extra: Partial<Fila> = {}): Fila => ({
  campo, grupo: 'como', etiqueta: campo, valor: null, legible: '', procedencia: 'supuesto', porque: null, optimista: false,
  falta: null, editable: true, control, ...extra,
})
const pre = (filas: Fila[], faltan: Fila[] = []): PrecalificacionHogar => ({
  referencia: 'R', etiquetaCliente: 'Ana', catastro: { direccionLegible: 'CL SOCORRO 24', metrosCuadrados: 90, anioConstruccion: 1970, codigoPostal: '41003' },
  resumen: { filas, faltan, supuestos: filas.filter((f) => f.procedencia === 'supuesto'), optimistas: filas.filter((f) => f.optimista), listo: faltan.length === 0 },
  defectos: {}, vias: [{ id: 'CL', nombre: 'Calle' }], estadosCiviles: [], municipios: [{ id: '41091', nombre: 'Sevilla' }],
  catalogos: { tipoVivienda: [{ id: '1', nombre: 'Piso' }, { id: '2', nombre: 'Chalet adosado' }, { id: '3', nombre: 'Chalet independiente' }], material: [{ id: 'L', nombre: 'Ladrillo' }] },
  fallosCatalogo: [], ramo: { estado: 'disponible', id: 'h', nombre: 'Hogar' }, consumo: {} as PrecalificacionHogar['consumo'],
})

test('hogar: CAMPO_A_RESUELTO y los 9 de catálogo son los de la pantalla (si divergen, se cotiza otra casa)', () => {
  const src = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/hogar-nuevo/Formulario.tsx', import.meta.url), 'utf8')
  for (const [campo, clave] of Object.entries(CAMPO_A_RESUELTO)) assert.match(src, new RegExp(`\\b${campo}: '${clave}'`), campo)
  const bloque = src.slice(src.indexOf('const CAMPO_A_RESUELTO'), src.indexOf('}', src.indexOf('const CAMPO_A_RESUELTO')))
  assert.equal((bloque.match(/: '/g) ?? []).length, Object.keys(CAMPO_A_RESUELTO).length)
  for (const c of CAMPOS_CATALOGO_9) assert.match(src.slice(src.indexOf('const CAMPOS_CATALOGO_9')), new RegExp(`'${c}'`))
})

test('hogar: opción por nombre sin tildes; ambigua devuelve candidatas, no elige', () => {
  const ops = [{ id: '1', nombre: 'Piso' }, { id: '2', nombre: 'Chalet adosado' }, { id: '3', nombre: 'Chalet independiente' }]
  assert.deepEqual(elegirOpcion(ops, 'piso'), { id: '1' })
  assert.deepEqual(elegirOpcion(ops, 'ADOSADO'), { id: '2' })
  assert.deepEqual(elegirOpcion(ops, 'chalet'), { candidatas: ['Chalet adosado', 'Chalet independiente'] })
})

test('hogar: lo dictado va a resueltos o correcciones con los valores de la pantalla', () => {
  const p = pre([fila('tipoVivienda', 'opcion', { catalogo: 'tipoVivienda' }), fila('alarma', 'siNo'), fila('capitalContinente', 'euros'), fila('municipioId', 'municipio')])
  const r = aplicarDatosHogar(p, { tipoVivienda: 'piso', alarma: 'sí', capitalContinente: '150.000', municipioId: 'Sevilla' })
  assert.deepEqual(r.errores, [])
  assert.deepEqual(r.resueltos, { tipoVivienda: '1', alarma: true, municipioId: 41091 })
  assert.deepEqual(r.correcciones, { capitalContinente: 150000 })
})

test('hogar: lo que no se entiende NO se aplica y se dice por qué', () => {
  const p = pre([fila('tipoVivienda', 'opcion', { catalogo: 'tipoVivienda' }), fila('alarma', 'siNo'), fila('superficie', 'numero', { editable: false, procedencia: 'catastro' })])
  const r = aplicarDatosHogar(p, { tipoVivienda: 'chalet', alarma: 'quizá', superficie: 80, piscina: 'si' })
  assert.equal(r.errores.length, 4)
  assert.deepEqual(r.resueltos, {})
  assert.match(r.errores.join('\n'), /Chalet adosado · Chalet independiente/)
})

test('hogar: supuestos solo de lo que no se dictó y viene supuesto', () => {
  const p = pre([fila('tipoVivienda', 'opcion'), fila('material', 'opcion', { procedencia: 'ficha' }), fila('tipoViaId', 'opcion')])
  const r = resueltosFinales(p, { tipoVivienda: '1' }) as { supuestos: Record<string, boolean> }
  assert.equal(r.supuestos.tipoVivienda, false)
  assert.equal(r.supuestos.material, false)
  assert.equal(r.supuestos.tipoVia, true)
})

test('hogar: faltan con sus opciones, y el resumen avisa de lo que abarata', () => {
  const f = fila('tipoVivienda', 'opcion', { catalogo: 'tipoVivienda', falta: 'obligatorio' })
  assert.match(faltanHogar(pre([f], [f]))[0], /tipoVivienda.*obligatorio.*Piso · Chalet adosado/)
  const t = textoPropuestaHogar(pre([fila('alarma', 'siNo', { optimista: true, legible: 'sí' })]), true, (s) => s)
  assert.match(t, /abarata/)
  assert.match(t, /0,50€/)
})

test('hogar: el botón/la cola cotiza hogar con su referencia, y el descarte por tiempo suelta su huella', () => {
  const src = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(src, /fila\.ramo === 'hogar'\s*\? \(fila\.cuerpo\?\.referencia\s*\? await cotizarHogarNuevoAsegura/)
  assert.match(src, /herramienta IN \('proponer_tarificacion', 'precio_hogar'\)/)
  assert.match(src, /return pedirOProponer\(fila\.id, textoPropuestaHogar/)
})
