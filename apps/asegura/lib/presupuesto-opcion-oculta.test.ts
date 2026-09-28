import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

import { OCULTAR_VACIO, claveCompania, estaOculta, leerOcultar, ordenResto } from './presupuesto-ocultar.ts'

/**
 * Guardián de `presupuesto_opcion.oculta_at` (29/09/2026).
 *
 * Desde que el presupuesto congela TODAS las opciones, las que el corredor quita antes de enviar se
 * guardan igual, con `oculta_at`. Un lector que se olvide del filtro no rompe nada: le ENSEÑA al
 * cliente —o a la IA, o a la firma— justo lo que se decidió no enseñar. Por eso se lee el FUENTE de
 * las dos apps que tocan la tabla y cada consulta tiene que nombrar el filtro, o declarar por qué no.
 */
const RAIZ = join(import.meta.dirname, '..', '..')
const CARPETAS = ['asegura/lib', 'asegura/app', 'asegura-portal/lib', 'asegura-portal/app']
/** Marca para una consulta que NO debe filtrar (p. ej. la que busca la opción para ocultarla). */
const EXENTA = 'oculta-exenta:'

function fuentes(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'generated') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...fuentes(p))
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

/** Cada consulta de lectura sobre la tabla: Prisma (`presupuestoOpcion.findX/count`) o SQL (`from|join`). */
export function lecturasSinFiltro(nombre: string, src: string): string[] {
  const fallos: string[] = []
  const prisma = /presupuestoOpcion\.(findMany|findFirst|findUnique|count|aggregate|groupBy)\s*\(/g
  for (const m of src.matchAll(prisma)) {
    const ventana = src.slice(m.index!, m.index! + 400)
    if (!/ocultaAt/.test(ventana) && !ventana.includes(EXENTA)) fallos.push(`${nombre}: ${m[0]}`)
  }
  const sql = /\b(from|join)\s+presupuesto_opcion\b[^\n]*/gi
  for (const m of src.matchAll(sql)) {
    // La ventana es ESA consulta y nada más: hasta el fin del template, el cierre de la subconsulta
    // o el siguiente from/join. Con una ventana fija, el filtro de la línea de al lado la tapaba.
    const bruta = src.slice(m.index!, m.index! + 400)
    const corte = bruta.slice(12).search(/`|\)\s*as\s|\b(from|join)\b/i)
    const ventana = corte === -1 ? bruta : bruta.slice(0, corte + 12)
    // La opción ELEGIDA no puede estar oculta: se elige después de enviar y ocultar exige no haber enviado.
    if (/opcion_elegida_id/.test(m[0])) continue
    if (!/oculta_at/.test(ventana) && !ventana.includes(EXENTA)) fallos.push(`${nombre}: ${m[0].trim()}`)
  }
  return fallos
}

test('toda lectura de presupuesto_opcion filtra las ocultas (o dice por qué no)', () => {
  const fallos: string[] = []
  let vistas = 0
  for (const c of CARPETAS) {
    for (const f of fuentes(join(RAIZ, c))) {
      const src = readFileSync(f, 'utf8')
      if (!/presupuestoOpcion|presupuesto_opcion/.test(src)) continue
      vistas++
      fallos.push(...lecturasSinFiltro(relative(RAIZ, f), src))
    }
  }
  // Si el recorrido no ve nada, el cepo mira al sitio equivocado y estaría verde siempre.
  assert.ok(vistas >= 5, `solo se han visto ${vistas} ficheros que tocan la tabla`)
  assert.deepEqual(fallos, [])
})

test('el detector caza una lectura sin filtro, Prisma y SQL', () => {
  assert.equal(lecturasSinFiltro('x', 'db.presupuestoOpcion.findMany({ where: { presupuestoId } })').length, 1)
  assert.equal(lecturasSinFiltro('x', 'select id from presupuesto_opcion where presupuesto_id = $1').length, 1)
  assert.equal(lecturasSinFiltro('x', 'db.presupuestoOpcion.findMany({ where: { presupuestoId, ocultaAt: null } })').length, 0)
  assert.equal(lecturasSinFiltro('x', 'join presupuesto_opcion o on o.id = p.opcion_elegida_id').length, 0)
  // Dos subconsultas seguidas: el filtro de la segunda no puede tapar a la primera.
  assert.equal(lecturasSinFiltro('x',
    '(select count(*) from presupuesto_opcion x where x.p = p.id) as "n",\n' +
    '(select count(*) from presupuesto_opcion x where x.p = p.id and x.oculta_at is null) as "m"').length, 1)
})

test('leerOcultar: ausente = nada; mal formado = null (no se ignora en silencio)', () => {
  assert.deepEqual(leerOcultar(undefined), OCULTAR_VACIO)
  assert.deepEqual(leerOcultar({ companias: [' Allianz '] }), { companias: ['Allianz'], precios: [] })
  assert.equal(leerOcultar({ precios: ['no-es-un-uuid'] }), null)
  assert.equal(leerOcultar({ companias: 'Allianz' }), null)
  assert.equal(leerOcultar([]), null)
  assert.equal(leerOcultar({ companias: [''] }), null)
})

test('estaOculta: por compañía sin mayúsculas ni espacios, o por id de precio', () => {
  const id = '11111111-2222-3333-4444-555555555555'
  const o = { companias: ['allianz'], precios: [id.toUpperCase().toLowerCase()] }
  assert.equal(estaOculta({ id: 'x', compania: ' ALLIANZ ' }, o), true)
  assert.equal(estaOculta({ id, compania: 'Mapfre' }, o), true)
  assert.equal(estaOculta({ id: 'y', compania: 'Mapfre' }, o), false)
  assert.equal(estaOculta({ id: 'y', compania: null }, { companias: [''], precios: [] }), false)
  assert.equal(claveCompania('  Reale   Seguros '), 'reale seguros')
})

test('ordenResto: sin portada, visibles por prima y las ocultas al final; sin prima no se congela', () => {
  const filas = [
    { compania: 'A', prima: 300, oculta: false },
    { compania: 'B', prima: 100, oculta: false }, // portada
    { compania: 'C', prima: 50, oculta: true },
    { compania: 'D', prima: 200, oculta: false },
    { compania: 'E', prima: null, oculta: false },
    { compania: 'F', prima: 20, oculta: true },
  ]
  assert.deepEqual(ordenResto(filas, new Set([1])), [3, 0, 5, 2])
})
