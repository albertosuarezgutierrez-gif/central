import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DGS_POR_BOT, DGS_POR_VENDOR_AVANT2, NOMBRE_POR_DGS, UMBRAL_CUADRA_PCT, compararPrimas, construirParrilla, dgsDeBot, dgsDeVendorAvant2,
  esRamoAvant2, ladoBotDeLecturas, rotuloVeredicto, textoPct, ultimaVariante,
  type LadoAvant2, type LadoBot, type TrabajoBotParrilla,
} from './parrilla-precios.ts'

const avant2 = (precios: Extract<LadoAvant2, { estado: 'ok' }>['precios']): LadoAvant2 =>
  ({ estado: 'ok', referencia: 'P2', creadaEn: '2026-10-13T08:00:00Z', caducada: false, simulado: false, precios })
const trabajo = (p: Partial<TrabajoBotParrilla> & { compania: string }): TrabajoBotParrilla =>
  ({ estado: 'ok', creadoEn: '2026-10-13T09:00:00Z', error: null, ofertas: [], ...p })
const bots = (trabajos: TrabajoBotParrilla[], disponibles = ['allianz']): LadoBot => ({ estado: 'ok', disponibles, trabajos })

test('identidad: tabla EXPLÍCITA, solo se normalizan mayúsculas/acentos/espacios; nada aproximado', () => {
  assert.equal(dgsDeVendorAvant2('Allianz'), 'C0109')
  assert.equal(dgsDeVendorAvant2('  MUTUA   Madrileña '), 'M0083')
  assert.equal(dgsDeVendorAvant2('Allianz Seguros'), null, 'una subcadena NO identifica')
  assert.equal(dgsDeVendorAvant2('Fiatc'), null, 'Fiatc no está en el catálogo: sin identificar, no adivinada')
  assert.equal(dgsDeVendorAvant2('constructor'), null, 'ni claves heredadas del objeto')
  assert.equal(dgsDeVendorAvant2(null), null)
  assert.equal(dgsDeBot('allianz'), 'C0109')
  assert.equal(dgsDeBot('catalana'), null)
  // Las dos tablas apuntan a códigos con nombre, y los bots comparten código con su vendor de Avant2.
  for (const c of [...Object.values(DGS_POR_VENDOR_AVANT2), ...Object.values(DGS_POR_BOT)]) assert.ok(NOMBRE_POR_DGS[c], c)
  for (const [bot, c] of Object.entries(DGS_POR_BOT)) assert.equal(DGS_POR_VENDOR_AVANT2[bot], c, `${bot}: mismo DGS en los dos lados`)
})

test('cruce por DGS: Allianz de Avant2 y el bot allianz son UNA fila; cuadra dentro del umbral', () => {
  const p = construirParrilla(
    avant2([{ compania: 'Allianz', producto: 'Comunidad', primaEur: 1000, meses: 12 }, { compania: 'Allianz', producto: 'Plus', primaEur: 1200, meses: 12 }]),
    bots([trabajo({ compania: 'allianz', ofertas: [{ producto: 'ePAC', primaAnual: 1015 }] })]),
  )
  assert.equal(p.filas.length, 1)
  const f = p.filas[0]
  assert.equal(f.codigoDgs, 'C0109')
  assert.equal(f.avant2.estado === 'precio' && f.avant2.prima, 1000, 'se compara la más barata de Avant2')
  assert.equal(f.avant2.estado === 'precio' && f.avant2.opciones, 2)
  assert.deepEqual(f.veredicto, { tipo: 'comparada', cuadra: true, difEur: 15, difPct: 1.5, reserva: null })
})

test('umbral: justo en el borde cuadra; por encima no; el signo es bot − Avant2', () => {
  assert.equal(UMBRAL_CUADRA_PCT, 2)
  assert.deepEqual(compararPrimas({ prima: 100, meses: 12 }, { prima: 102 }), { tipo: 'comparada', cuadra: true, difEur: 2, difPct: 2, reserva: null })
  assert.deepEqual(compararPrimas({ prima: 100, meses: 12 }, { prima: 97.5 }), { tipo: 'comparada', cuadra: false, difEur: -2.5, difPct: -2.5, reserva: null })
})

test('periodo: otro periodo no se compara; sin periodo declarado se enseña la diferencia pero NO se afirma «cuadra»', () => {
  assert.equal(compararPrimas({ prima: 50, meses: 6 }, { prima: 100 }).tipo, 'no_comparable')
  const v = compararPrimas({ prima: 100, meses: null }, { prima: 100 })
  assert.equal(v.tipo === 'comparada' && v.cuadra, null)
  assert.equal(compararPrimas({ prima: 0, meses: 12 }, { prima: 100 }).tipo, 'no_comparable', 'sin base no hay %')
})

test('solo Avant2 / solo bot cuando falta un lado, y «bot sin pedir» es una fila', () => {
  const p = construirParrilla(
    avant2([{ compania: 'Mapfre', primaEur: 300, meses: 12 }]),
    bots([trabajo({ compania: 'occident', ofertas: [{ producto: 'Com', primaAnual: 400 }] })], ['allianz', 'occident']),
  )
  const por = Object.fromEntries(p.filas.map((f) => [f.nombre, f]))
  assert.equal(por.Mapfre.veredicto.tipo, 'solo_avant2')
  assert.equal(por.Mapfre.bot.estado, 'sin_bot')
  assert.equal(por.Occident.veredicto.tipo, 'solo_bot')
  assert.equal(por.Occident.avant2.estado, 'no_pedido')
  assert.equal(por.Allianz.bot.estado, 'no_pedido')
  assert.equal(por.Allianz.veredicto.tipo, 'sin_precios')
})

test('tres estados: un lado SIN LEER nunca convierte la fila en «solo …»', () => {
  const sinA = construirParrilla({ estado: 'sin_leer', motivo: 'red' }, bots([trabajo({ compania: 'allianz', ofertas: [{ producto: 'x', primaAnual: 10 }] })]))
  assert.equal(sinA.filas[0].veredicto.tipo, 'sin_leer')
  assert.equal(sinA.filas[0].avant2.estado, 'sin_leer')
  const sinB = construirParrilla(avant2([{ compania: 'Reale', primaEur: 200, meses: 12 }]), { estado: 'sin_leer', motivo: '503' })
  assert.equal(sinB.filas[0].veredicto.tipo, 'sin_leer')
  // Ninguna prima ausente se convierte en 0: un precio sin importe es «sin precio».
  const sinImporte = construirParrilla(avant2([{ compania: 'Reale', primaEur: null }]), { estado: 'no_aplica' })
  assert.equal(sinImporte.filas[0].avant2.estado, 'sin_precio')
  assert.equal(sinImporte.filas[0].veredicto.tipo, 'sin_precios')
})

test('sin identificar: fila propia, nunca fundida (ni siquiera con un bot de igual nombre sin mapear)', () => {
  const p = construirParrilla(
    avant2([{ compania: 'Fiatc', primaEur: 250, meses: 12 }]),
    bots([trabajo({ compania: 'fiatc', ofertas: [{ producto: 'x', primaAnual: 250 }] })], ['fiatc']),
  )
  assert.equal(p.filas.length, 2, 'dos identificadores sin DGS no se funden')
  assert.ok(p.filas.every((f) => f.codigoDgs === null))
  assert.deepEqual(p.filas.map((f) => f.veredicto.tipo).sort(), ['solo_avant2', 'solo_bot'])
  assert.equal(p.sinIdentificar.length, 2)
})

test('bot: cuenta el ÚLTIMO trabajo de cada compañía; en curso = pendiente; error ≠ sin precio', () => {
  const viejo = trabajo({ compania: 'allianz', creadoEn: '2026-10-01T00:00:00Z', ofertas: [{ producto: 'x', primaAnual: 999 }] })
  const curso = trabajo({ compania: 'allianz', estado: 'en_curso', creadoEn: '2026-10-13T10:00:00Z' })
  const p = construirParrilla(avant2([{ compania: 'Allianz', primaEur: 1000, meses: 12 }]), bots([viejo, curso]))
  assert.equal(p.filas[0].bot.estado, 'en_curso')
  assert.equal(p.filas[0].veredicto.tipo, 'pendiente')
  const err = construirParrilla(avant2([{ compania: 'Allianz', primaEur: 1000, meses: 12 }]), bots([trabajo({ compania: 'allianz', estado: 'error_datos', error: { mensaje: 'Falta m2' } })]))
  assert.deepEqual(err.filas[0].bot, { estado: 'error', mensaje: 'Falta m2' })
  assert.equal(err.filas[0].veredicto.tipo, 'solo_avant2')
})

test('ningún lado aplica → parrilla vacía (no se pinta); Avant2 «ninguna» = no pedido', () => {
  assert.equal(construirParrilla({ estado: 'no_aplica' }, { estado: 'no_aplica' }).vacia, true)
  const p = construirParrilla({ estado: 'ninguna' }, bots([trabajo({ compania: 'allianz', ofertas: [{ producto: 'x', primaAnual: 10 }] })]))
  assert.equal(p.filas[0].avant2.estado, 'no_pedido')
  assert.equal(p.filas[0].veredicto.tipo, 'solo_bot')
})

test('orden: comparadas primero; luego por prima', () => {
  const p = construirParrilla(
    avant2([{ compania: 'Mapfre', primaEur: 100, meses: 12 }, { compania: 'Allianz', primaEur: 900, meses: 12 }]),
    bots([trabajo({ compania: 'allianz', ofertas: [{ producto: 'x', primaAnual: 905 }] })]),
  )
  assert.deepEqual(p.filas.map((f) => f.nombre), ['Allianz', 'Mapfre'])
})

test('piezas de pantalla: última variante por fecha, % con signo y coma, rótulos', () => {
  assert.equal(ultimaVariante([{ id: 'a', creadoAt: '2026-10-01' }, { id: 'b', creadoAt: '2026-10-05' }, { id: 'c', creadoAt: '2026-09-30' }])?.id, 'b')
  assert.equal(ultimaVariante([]), null)
  assert.equal(textoPct(1.5), '+1,50 %')
  assert.equal(textoPct(-2.25), '−2,25 %')
  assert.equal(textoPct(0), '0,00 %')
  assert.equal(rotuloVeredicto({ tipo: 'comparada', cuadra: true, difEur: 0, difPct: 0, reserva: null }), 'Cuadra')
  assert.equal(esRamoAvant2('auto'), true)
  assert.equal(esRamoAvant2('comunidades'), false)
})

test('decesos (13/10/2026): Avant2 sí, sin bot → filas «solo Avant2»; sin código DGS, fila propia (nunca fundida ni inventada)', () => {
  assert.equal(esRamoAvant2('decesos'), true)
  const p = construirParrilla(
    avant2([
      { compania: 'Allianz', primaEur: 210.5, meses: 12 },
      { compania: 'Fiatc', primaEur: 180, meses: 12 },
      { compania: 'Fiatc', primaEur: 195, meses: 12 },
      { compania: 'Preventiva', primaEur: null, meses: 12 },
    ]),
    { estado: 'no_aplica' },
  )
  assert.equal(p.vacia, false)
  const fila = (n: string) => p.filas.find((f) => f.nombre === n)!
  assert.equal(fila('Allianz').veredicto.tipo, 'solo_avant2')
  assert.equal(fila('Allianz').bot.estado, 'sin_bot')
  const fiatc = fila('Fiatc')
  assert.equal(fiatc.codigoDgs, null)
  assert.equal(fiatc.avant2.estado === 'precio' && fiatc.avant2.prima, 180, 'la más barata de la compañía')
  assert.equal(fila('Preventiva').avant2.estado, 'sin_precio', 'sin importe ≠ 0 €')
  assert.deepEqual([...p.sinIdentificar].sort(), ['Fiatc', 'Preventiva'])
  // Sin ninguna tarificación aún: la parrilla se pinta («aún no hay precios»), no desaparece ni dice 0.
  const nada = construirParrilla({ estado: 'ninguna' }, { estado: 'no_aplica' })
  assert.equal(nada.vacia, false)
  assert.deepEqual(nada.filas, [])
})

test('marcaSupuestos: con supuestos se marca con la lista; sin ninguno, nada; sin registro, «no consta» (nunca «sin supuestos»)', async () => {
  const { marcaSupuestos } = await import('./parrilla-precios.ts')
  const m = marcaSupuestos([{ texto: 'Km al año: 10.000 km (por defecto)' }, { texto: 'Fecha de compra: la de matriculación' }])
  assert.equal(m?.etiqueta, 'Precio con supuestos')
  assert.deepEqual(m?.detalle, ['Km al año: 10.000 km (por defecto)', 'Fecha de compra: la de matriculación'])
  assert.equal(marcaSupuestos([]), null)
  assert.equal(marcaSupuestos(null)?.etiqueta, 'Supuestos: no consta')
  assert.equal(marcaSupuestos(undefined)?.etiqueta, 'Supuestos: no consta')
})

// ─── 21/10/2026: lado bot de los ramos con bloque «Bots (gratis)» propio (moto, coche, hogar) ─────────────────────────
test('ladoBotDeLecturas: tres estados; los disponibles son las integraciones del ramo; sin nada del ramo, no aplica', () => {
  const integ = [{ compania: 'allianz', ramo: 'hogar' }, { compania: 'mapfre', ramo: 'auto' }, { compania: 'allianz', ramo: 'hogar' }]
  const t = [trabajo({ compania: 'allianz', ofertas: [{ producto: 'Hogar', primaAnual: 300 }] })]
  assert.deepEqual(ladoBotDeLecturas('hogar', integ, t), { estado: 'ok', disponibles: ['allianz'], trabajos: t })
  assert.equal(ladoBotDeLecturas('hogar', null, t).estado, 'sin_leer', 'integraciones sin leer: no se afirma nada')
  assert.equal(ladoBotDeLecturas('hogar', integ, null).estado, 'sin_leer', 'trabajos sin leer: no se afirma nada')
  assert.deepEqual(ladoBotDeLecturas('vida', integ, []), { estado: 'no_aplica' })
  // Trabajos de un bot ya sin integración activa siguen contando (su precio existe).
  assert.deepEqual(ladoBotDeLecturas('vida', [], t), { estado: 'ok', disponibles: [], trabajos: t })
  // Y entra en la parrilla como una fila de bot con precio.
  const p = construirParrilla({ estado: 'no_aplica' } as LadoAvant2, ladoBotDeLecturas('hogar', integ, t))
  assert.equal(p.vacia, false)
  assert.equal(p.filas.find((f) => f.codigoDgs === 'C0109')?.bot.estado, 'precio')
})
