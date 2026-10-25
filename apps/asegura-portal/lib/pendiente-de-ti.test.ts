import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pendientesDeTi, type EntradaPendientes } from './pendiente-de-ti.ts'

const ramo = (r: string) => r
const vacia: EntradaPendientes = { recibosDevueltos: [], anulaciones: 0, presupuestos: [], contactoPorConfirmar: false }

test('sin nada pendiente y todo comprobado: lista vacía y nada que declarar', () => {
  assert.deepEqual(pendientesDeTi(vacia, ramo), { items: [], sinComprobar: [] })
})

test('🪤 una fuente que no se pudo leer se DECLARA, nunca se lee como «nada pendiente»', () => {
  const r = pendientesDeTi({ ...vacia, anulaciones: null, presupuestos: null, contactoPorConfirmar: null }, ramo)
  assert.equal(r.items.length, 0)
  assert.equal(r.sinComprobar.length, 3)
})

test('🪤 el recibo devuelto va PRIMERO y urgente, por delante de la firma y del presupuesto', () => {
  const r = pendientesDeTi(
    {
      recibosDevueltos: [{ polizaId: 'p1', etiqueta: 'Auto · Mapfre', n: 1 }],
      anulaciones: 1,
      presupuestos: [{ id: 'x', ramo: 'hogar', venceEl: new Date('2026-10-01T00:00:00Z'), aceptado: false, faltan: null }],
      contactoPorConfirmar: true,
    },
    ramo,
  )
  assert.deepEqual(r.items.map((i) => i.clave), ['recibo:p1', 'anulacion', 'presupuesto:x', 'contacto'])
  assert.ok(r.items[0].urgente)
  assert.equal(r.items[0].href, '/boveda/poliza/p1')
})

test('🪤 un aceptado cuyos datos no se pudieron comprobar pide comprobarlo; nunca se calla', () => {
  const r = pendientesDeTi(
    { ...vacia, presupuestos: [{ id: 'a', ramo: 'auto', venceEl: new Date(), aceptado: true, faltan: null }] },
    ramo,
  )
  assert.equal(r.items.length, 1)
  assert.match(r.items[0].titulo, /Comprueba/)
})

test('aceptado sin datos que falten no aparece; con 2 que faltan, lo dice', () => {
  const base = { id: 'a', ramo: 'auto', venceEl: new Date(), aceptado: true }
  assert.equal(pendientesDeTi({ ...vacia, presupuestos: [{ ...base, faltan: 0 }] }, ramo).items.length, 0)
  const r = pendientesDeTi({ ...vacia, presupuestos: [{ ...base, faltan: 2 }] }, ramo)
  assert.equal(r.items[0].titulo, 'Te faltan 2 datos para contratar auto')
})

test('los presupuestos por elegir salen por fecha de caducidad', () => {
  const r = pendientesDeTi(
    {
      ...vacia,
      presupuestos: [
        { id: 'tarde', ramo: 'auto', venceEl: new Date('2026-12-01T00:00:00Z'), aceptado: false, faltan: null },
        { id: 'pronto', ramo: 'hogar', venceEl: new Date('2026-10-01T00:00:00Z'), aceptado: false, faltan: null },
      ],
    },
    ramo,
  )
  assert.deepEqual(r.items.map((i) => i.clave), ['presupuesto:pronto', 'presupuesto:tarde'])
})

test('🪤 patrimonio: vencido (urgente), por vencer, sin fecha y sin revisar; sin comprobar se DECLARA; ausente no dice nada', () => {
  const r = pendientesDeTi({ ...vacia, patrimonio: { vencidas: 2, porVencer: 1, sinFecha: 1, sinRevisar: 3 } }, ramo)
  assert.deepEqual(r.items.map((i) => i.clave), ['patrimonio:vencidas', 'patrimonio:por_vencer', 'patrimonio:sin_fecha', 'patrimonio:sin_revisar'])
  assert.equal(r.items[0].urgente, true)
  assert.equal(r.items.filter((i) => i.urgente).length, 1)
  assert.deepEqual(r.sinComprobar, [])

  const ilegible = pendientesDeTi({ ...vacia, patrimonio: null }, ramo)
  assert.deepEqual(ilegible, { items: [], sinComprobar: ['tu patrimonio'] })

  // Calendario leído pero seguros sin leer: se declara el hueco y NO se inventa «sin revisar».
  const mixto = pendientesDeTi({ ...vacia, patrimonio: { vencidas: 0, porVencer: 0, sinFecha: 0, sinRevisar: null } }, ramo)
  assert.deepEqual(mixto, { items: [], sinComprobar: ['los seguros de tus inmuebles'] })

  assert.deepEqual(pendientesDeTi(vacia, ramo), { items: [], sinComprobar: [] })
  assert.deepEqual(pendientesDeTi({ ...vacia, patrimonio: { vencidas: 0, porVencer: 0, sinFecha: 0, sinRevisar: 0 } }, ramo), { items: [], sinComprobar: [] })
})
