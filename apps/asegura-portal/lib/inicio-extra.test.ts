import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { pendientesDeTiEnInicio } from './pendiente-de-ti.ts'

const ramo = (r: string) => r
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(new URL(f, import.meta.url), 'utf8'))

test('lo pendiente del antiguo /boveda (firmas, presupuestos, contacto, patrimonio) sale ahora en Inicio, con enlaces que funcionan desde allí', () => {
  const r = pendientesDeTiEnInicio(
    {
      anulaciones: 2,
      presupuestos: [
        { id: 'p1', ramo: 'auto', venceEl: new Date('2026-12-01T00:00:00Z'), aceptado: false, faltan: null },
        { id: 'p2', ramo: 'hogar', venceEl: new Date('2026-12-01T00:00:00Z'), aceptado: true, faltan: 3 },
      ],
      contactoPorConfirmar: true,
      patrimonio: { vencidas: 1, porVencer: 0, sinFecha: 0, sinRevisar: 2 },
    },
    ramo,
  )
  const claves = r.items.map((i) => i.clave)
  for (const c of ['anulacion', 'presupuesto:p1', 'datos:p2', 'contacto', 'patrimonio:vencidas', 'patrimonio:sin_revisar']) assert.ok(claves.includes(c), c)
  assert.equal(r.sinComprobar.length, 0)
  // Las anclas de la bóveda ya no son anclas sueltas (en Inicio no existirían).
  assert.ok(r.items.every((i) => !i.href.startsWith('#')))
  assert.equal(r.items.find((i) => i.clave === 'anulacion')!.href, '/boveda#firma-titulo')
  assert.equal(r.items.find((i) => i.clave === 'contacto')!.href, '/boveda#aviso-contacto-titulo')
})

test('Inicio: una fuente que no se pudo leer (null) se dice «no hemos podido comprobar», nunca «nada pendiente»', () => {
  const r = pendientesDeTiEnInicio({ anulaciones: null, presupuestos: null, contactoPorConfirmar: null, patrimonio: null }, ramo)
  assert.deepEqual(r.items, [])
  assert.equal(r.sinComprobar.length, 4)
  // Sin patrimonio a la vista (undefined) no se dice nada de él.
  const s = pendientesDeTiEnInicio({ anulaciones: 0, presupuestos: [], contactoPorConfirmar: false, patrimonio: undefined }, ramo)
  assert.deepEqual(s, { items: [], sinComprobar: [] })
})

test('Inicio no repite lo que ya tiene: los recibos devueltos y las aportadas por vencer no vienen de «pendiente de ti»', () => {
  const r = pendientesDeTiEnInicio({ anulaciones: 0, presupuestos: [], contactoPorConfirmar: false, patrimonio: undefined }, ramo)
  assert.ok(!r.items.some((i) => i.clave.startsWith('recibo:') || i.clave.startsWith('comparar:')))
})

test('cableado: Inicio lee y pinta «Pendiente de ti», y la bóveda ya no lo pinta (nada queda sin sitio)', () => {
  const pagina = leer('../app/(portal)/inicio/page.tsx')
  assert.match(pagina, /pendientesDeTiParaInicio\(identidad\.id, conPatrimonio\)\.catch\(\(\) => null\)/, 'un fallo no tumba Inicio')
  assert.match(pagina, /deTi=\{deTi\}/)
  assert.match(leer('../app/(portal)/inicio/PendienteInicio.tsx'), /Pendiente de ti/)
  assert.match(leer('./inicio-extra.ts'), /Promise\.allSettled\(/)
  assert.match(leer('./inicio-extra.ts'), /sesion\.id !== identidadId\) return null/)
  const boveda = leer('../app/(portal)/boveda/page.tsx')
  assert.doesNotMatch(boveda, /<PendienteDeTi|pendientesDeTi\(|<TusVencimientos/)
})
