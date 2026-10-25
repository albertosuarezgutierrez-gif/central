import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  claveDescarte, clasificarReparacion, coberturaHogar, descripcionDeGasto, desdeVentana, esClaveDescarte, hrefDarParte,
  prellenadoDeUrl, resumirCubre, type AvisoCubre,
} from './cubre-seguro.ts'
import type { FilaEnlace, PolizaVisible } from './seguros-inmueble-api.ts'

const G = (concepto: string | null, categoria: string | null = 'MANTENIMIENTO', proveedor: string | null = null) => ({ concepto, categoria, proveedor })

test('clasifica reparaciones típicas, con tildes y mayúsculas', () => {
  assert.equal(clasificarReparacion(G('Reparación de FUGA en baño')), 'agua')
  assert.equal(clasificarReparacion(G('Fontanería: cambio de tubería')), 'agua')
  assert.equal(clasificarReparacion(G('Sustitución de cristal de ventana')), 'cristales')
  assert.equal(clasificarReparacion(G('Electricista, cortocircuito en cuadro')), 'electricidad')
  assert.equal(clasificarReparacion(G('Cambio de bombín tras robo')), 'cerrajeria')
  assert.equal(clasificarReparacion(G('Tejado dañado por granizo', 'REFORMAS')), 'tormenta')
  assert.equal(clasificarReparacion(G(null, 'MANTENIMIENTO', 'Cerrajería Rápida SL')), 'cerrajeria')
})

test('no es reparación: categorías ajenas, servicios programados y textos vacíos', () => {
  assert.equal(clasificarReparacion(G('Fuga', 'SEGURO')), null)
  assert.equal(clasificarReparacion(G('Cuota fontanería comunidad', 'COMUNIDAD')), null)
  assert.equal(clasificarReparacion(G('IBI cristales', 'IMPUESTOS')), null)
  assert.equal(clasificarReparacion(G('Revisión anual de la instalación eléctrica')), null)
  assert.equal(clasificarReparacion(G('Revisión de caldera y fontanería')), null)
  assert.equal(clasificarReparacion(G('Pintura del salón')), null)
  assert.equal(clasificarReparacion(G(null, 'MANTENIMIENTO', null)), null)
  assert.equal(clasificarReparacion(G('   ', null)), null)
  // Una avería dentro de una revisión sí cuenta.
  assert.equal(clasificarReparacion(G('Revisión: fuga en tubería')), 'agua')
})

const poliza = (x: Partial<PolizaVisible> = {}): PolizaVisible => ({
  tipo: 'cartera', id: 'p1', compania: 'Mapfre', ramo: 'hogar', ubicacion: null, referenciaCatastral: null, vence: '2027-03-01', vigente: true, ...x,
})
const enl = (x: Partial<FilaEnlace> = {}): FilaEnlace => ({ id: 'e1', polizaId: 'p1', polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual', ...x })
const PARTE = new Set(['p1'])

test('cobertura: hogar enlazado y vigente → cubre, con puedeParte según la cartera', () => {
  assert.deepEqual(coberturaHogar([enl()], [poliza()], PARTE), { estado: 'cubre', polizaValor: 'cartera:p1', compania: 'Mapfre', vence: '2027-03-01', puedeParte: true })
  const r = coberturaHogar([enl()], [poliza()], new Set())
  assert.equal(r.estado === 'cubre' && r.puedeParte, false)
  const d = coberturaHogar([enl({ polizaId: null, polizaDeclaradaId: 'd1' })], [poliza({ tipo: 'declarada', id: 'd1' })], new Set())
  assert.equal(d.estado === 'cubre' && d.polizaValor, 'declarada:d1')
  assert.equal(d.estado === 'cubre' && d.puedeParte, true)
})

test('cobertura: sin enlaces, ramo que no es hogar o hogar vencida → sin_seguro', () => {
  assert.equal(coberturaHogar([], [poliza()], PARTE).estado, 'sin_seguro')
  assert.equal(coberturaHogar([enl()], [poliza({ ramo: 'comunidad' })], PARTE).estado, 'sin_seguro')
  assert.equal(coberturaHogar([enl()], [poliza({ vigente: false })], PARTE).estado, 'sin_seguro')
  assert.equal(coberturaHogar([enl({ estado: 'rechazado' })], [poliza()], PARTE).estado, 'sin_seguro')
})

test('🚨 null ≠ sin seguro: fuentes ilegibles, enlace que no veo o vigencia desconocida → sin_comprobar', () => {
  assert.equal(coberturaHogar([enl()], null, PARTE).estado, 'sin_comprobar')
  assert.equal(coberturaHogar([enl({ polizaId: 'ajena' })], [poliza()], PARTE).estado, 'sin_comprobar')
  assert.equal(coberturaHogar([enl()], [poliza({ vigente: null })], PARTE).estado, 'sin_comprobar')
  // Pero si además hay una hogar vigente visible, cubre.
  assert.equal(coberturaHogar([enl({ polizaId: 'ajena' }), enl({ id: 'e2' })], [poliza()], PARTE).estado, 'cubre')
})

test('enlace al parte: póliza, descripción y fecha viajan codificadas', () => {
  const descripcion = descripcionDeGasto({ tipo: 'agua', concepto: 'Fuga en baño & cocina', inmuebleAlias: 'Piso Socorro', fecha: '2026-10-02' })
  assert.match(descripcion, /02\/10\/2026/)
  const href = hrefDarParte({ polizaValor: 'cartera:p1', descripcion, fecha: '2026-10-02' })
  const u = new URL(href, 'https://x.test')
  assert.equal(u.pathname, '/boveda')
  assert.equal(u.searchParams.get('vista'), 'siniestro')
  assert.equal(u.searchParams.get('poliza'), 'cartera:p1')
  assert.equal(u.searchParams.get('descripcion'), descripcion)
  assert.equal(u.searchParams.get('fecha'), '2026-10-02')
})

test('prellenado de la URL: fecha real y no futura, descripción limpia y recortada, nada válido → null', () => {
  const ok = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  assert.deepEqual(prellenadoDeUrl({ descripcion: 'Fuga\n\tbaño', fecha: '2026-10-02' }, '2026-10-25', 2000, ok), { descripcion: 'Fuga baño', fechaHecho: '2026-10-02' })
  assert.equal(prellenadoDeUrl({ fecha: '2026-11-01' }, '2026-10-25', 2000, ok), null)
  assert.equal(prellenadoDeUrl({ descripcion: ['x'], fecha: 5 }, '2026-10-25', 2000, ok), null)
  assert.equal(prellenadoDeUrl({ descripcion: 'a'.repeat(5000) }, '2026-10-25', 100, ok)?.descripcion.length, 100)
  assert.deepEqual(prellenadoDeUrl({ descripcion: 'x', fecha: '2026-10-02' }, '2026-10-02', 10, ok)?.fechaHecho, '2026-10-02')
})

test('descarte: la clave es del gasto y solo vale con un uuid', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  assert.equal(esClaveDescarte(claveDescarte(id)), true)
  assert.equal(esClaveDescarte('cubre_seguro:no-es-uuid'), false)
  assert.equal(esClaveDescarte(`otro:${id}`), false)
})

test('resumen: los descartados no cuentan y cada desenlace va aparte', () => {
  const a = (cobertura: AvisoCubre['cobertura'], descartado = false): AvisoCubre => ({
    gastoId: 'g', inmuebleId: 'i', inmuebleAlias: 'A', concepto: 'c', fecha: '2026-10-01', totalCent: null, tipo: 'agua', cobertura, descartado,
  })
  const cubre = { estado: 'cubre', polizaValor: 'cartera:p1', compania: null, vence: null, puedeParte: true } as const
  assert.deepEqual(resumirCubre([a(cubre), a(cubre, true), a({ estado: 'sin_seguro' }), a({ estado: 'sin_comprobar' })]), { cubre: 1, sinSeguro: 1, sinComprobar: 1 })
  assert.deepEqual(resumirCubre([]), { cubre: 0, sinSeguro: 0, sinComprobar: 0 })
})

test('ventana: doce meses atrás', () => {
  assert.equal(desdeVentana('2026-10-25'), '2025-10-25')
})
