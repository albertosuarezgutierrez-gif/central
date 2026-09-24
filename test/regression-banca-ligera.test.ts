import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `/banca` adelgazada (24/09/2026). La pestaña «Dinero» solo espera lo que hace
 * falta para pintar (saldo, cuentas, bandejas, libro); lo lento llega en
 * streaming. Si alguien vuelve a meter la tesorería en la `Promise.all`, la
 * página vuelve a quedarse en blanco hasta recorrer todo el histórico.
 */
const DIR = join(import.meta.dirname, '..', 'apps', 'plataforma', 'app', '(usuario)', 'banca')
const page = readFileSync(join(DIR, 'page.tsx'), 'utf8')

test('«Dinero» no espera a la tesorería, al resumen ni al P&L de pisos para pintar', () => {
  for (const lento of ['getTesoreria(', 'getResumenFinanciero(session.id, year, quarter', 'getPLMensual(', 'getEvolucionMensual(']) {
    assert.ok(!page.includes(lento), `page.tsx vuelve a esperar «${lento}» antes de pintar`)
  }
  assert.match(page, /<Suspense fallback=[\s\S]{0,300}?<ResumenDiferido/)
  // La tesorería ni se calcula hasta abrir el plegable: la pide el cliente.
  assert.match(page, /<AnalisisPerezoso /)
  assert.match(readFileSync(join(DIR, 'AnalisisPerezoso.tsx'), 'utf8'), /fetch\(`\/api\/banca\/analisis/)
  assert.ok(existsSync(join(DIR, 'loading.tsx')), 'falta loading.tsx: la página vuelve a quedarse en blanco')
})

test('lo que ya enseña el Inicio no se repite en «Dinero»', () => {
  assert.ok(!page.includes('<HoyAccionable'), 'la banda «pide acción hoy» vuelve a estar en /banca además de en /inicio')
  assert.ok(!page.includes('vencimientosAsegura'), '/banca vuelve a llamar al puerto de la correduría (hasta 8 s) para nada')
  // El componente sigue existiendo: lo monta el Inicio.
  assert.ok(existsSync(join(DIR, 'HoyAccionable.tsx')))
})
