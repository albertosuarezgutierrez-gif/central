import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  accionesListas, aportacionAvant2, aportacionesBotsHogar, aportacionesBotsMotor, etiquetaPide, resumenIntervinientes, resumenObjeto, unirParaTarificar,
  type EntradaBotsHogar, type FiguraParaTarificar,
} from './para-tarificar.ts'
import type { DatosViviendaBot } from '../tarificador-hogar-formulario.ts'

// Sintético (sin datos reales): una vivienda con lo justo para el bot salvo el año, y un tomador sin DNI en la ficha.
const VIVIENDA: DatosViviendaBot = {
  codigoPostal: '41003', municipio: 'Sevilla', nombreVia: 'PARRA', numero: '13', planta: null, puerta: null,
  anioConstruccion: null, anioReforma: null, superficieM2: 90, referenciaCatastral: null,
  capitalContinenteEur: 228000, capitalContenidoEur: null, protecciones: null, objetosValor: null, tomadorEmpresa: false,
}
const ELECCIONES = { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: '' }
const TOMADOR: FiguraParaTarificar = { rol: 'tomador', clienteId: 'c1', nombre: 'Tomador Prueba', faltan: ['dni'] }
const GUARDADO = { uso: true, regimen: true, tipoVivienda: true, conMadera: false }
const ALLIANZ = [{ compania: 'allianz', nombre: 'Allianz' }]
const botsHogar = (p: Partial<EntradaBotsHogar> = {}) => aportacionesBotsHogar({
  vivienda: VIVIENDA, elecciones: ELECCIONES, catalogosLeidos: true, guardado: GUARDADO, companias: ALLIANZ, tomador: TOMADOR, ...p,
})
const avant2 = (faltan: string[], figuras: FiguraParaTarificar[] = [TOMADOR]) => aportacionAvant2({
  aplica: true, esVehiculo: false, datosRiesgo: { clave: 'datosVivienda', faltan, datos: { capitalContinente: 228000 } }, faltanVehiculo: null, figuras,
})

test('une Avant2 y el bot por CAMPO: el año y el DNI salen una vez, con quién lo pide solo si no lo piden todos', () => {
  const p = unirParaTarificar([avant2(['anioConstruccion', 'referenciaCatastral'])!, ...botsHogar()])
  const claves = p.items.map((i) => i.clave)
  assert.equal(claves.filter((c) => c === 'vivienda.anioConstruccion').length, 1)
  assert.equal(claves.filter((c) => c === 'persona.c1.dni').length, 1)
  const anio = p.items.find((i) => i.clave === 'vivienda.anioConstruccion')!
  assert.deepEqual(anio.pide, ['Avant2', 'Allianz'])
  assert.equal(etiquetaPide(anio, p), null)
  // La referencia catastral solo la pide Avant2 (Allianz no): se dice.
  const rc = p.items.find((i) => i.clave === 'vivienda.referenciaCatastral')!
  assert.equal(etiquetaPide(rc, p), 'Lo pide: Avant2')
  // La madera solo la pide el bot y no hay nada guardado: se completa en la vivienda.
  const madera = p.items.find((i) => i.clave === 'vivienda.conMadera')!
  assert.equal(madera.destino, 'objeto')
  assert.equal(etiquetaPide(madera, p), 'Lo pide: Allianz')
  assert.equal(p.listo, false)
})

test('nada pendiente y todo comprobado = listo; sin ninguna fuente NO es listo', () => {
  const completo = botsHogar({ vivienda: { ...VIVIENDA, anioConstruccion: 1990 }, elecciones: { ...ELECCIONES, conMadera: 'no' }, tomador: { ...TOMADOR, faltan: [] } })
  const p = unirParaTarificar([avant2([], [{ ...TOMADOR, faltan: [] }])!, ...completo])
  assert.deepEqual(p.items, [])
  assert.equal(p.listo, true)
  assert.equal(unirParaTarificar([]).listo, false)
})

test('tres estados: sin leer las compañías o la ficha = «sin comprobar», nunca listo', () => {
  const sinCompanias = unirParaTarificar([avant2([], [{ ...TOMADOR, faltan: [] }])!, ...botsHogar({ companias: null })])
  assert.equal(sinCompanias.items.length, 0)
  assert.equal(sinCompanias.listo, false)
  assert.equal(sinCompanias.comprobaciones.find((c) => c.quien === 'Bots')?.estado, 'sin_comprobar')
  const fichaSinLeer = unirParaTarificar(botsHogar({ tomador: { ...TOMADOR, faltan: null } }))
  assert.equal(fichaSinLeer.items.find((i) => i.clave === 'persona.c1.ficha')?.estado, 'sin_comprobar')
  // Avant2 sin el bloque del riesgo: sin comprobar, nunca «completo».
  const a = aportacionAvant2({ aplica: true, esVehiculo: false, datosRiesgo: null, faltanVehiculo: null, figuras: [] })!
  assert.equal(a.items[0]?.estado, 'sin_comprobar')
})

test('elección guardada que no casa con el catálogo del bot: se elige en «Bots»; sin catálogos, sin comprobar', () => {
  const el = { ...ELECCIONES, tipoVivienda: '' }
  const conCat = unirParaTarificar(botsHogar({ elecciones: el }))
  assert.equal(conCat.items.find((i) => i.clave === 'vivienda.tipoVivienda')?.destino, 'bots')
  const sinCat = unirParaTarificar(botsHogar({ elecciones: el, catalogosLeidos: false }))
  assert.equal(sinCat.items.find((i) => i.clave === 'vivienda.tipoVivienda')?.estado, 'sin_comprobar')
})

test('compañía sin declaración: sin comprobar; Avant2 no aplica = sin aportación', () => {
  const p = unirParaTarificar(botsHogar({ companias: [{ compania: 'inventada', nombre: 'Inventada' }] }))
  assert.equal(p.comprobaciones[0]?.estado, 'sin_comprobar')
  assert.equal(aportacionAvant2({ aplica: false, esVehiculo: false, datosRiesgo: null, faltanVehiculo: null, figuras: [] }), null)
})

test('motor: sin publicar = sin comprobar; publicado = sus pendientes por compañía (la ficha no cuenta, el supuesto se confirma)', () => {
  assert.equal(aportacionesBotsMotor(null, 'abre Bots')[0]?.comprobacion.estado, 'sin_comprobar')
  const pub = {
    pendientes: {
      bloques: {
        personas: [{ clave: 'conductor.sexo', etiqueta: 'sexo del conductor', estado: 'falta' as const, companias: ['allianz'] }],
        riesgo: [{ clave: 'x', etiqueta: 'de la ficha', estado: 'ficha' as const, companias: ['allianz', 'mapfre'] }],
        poliza: [{ clave: 'aniosAsegurado', etiqueta: 'años asegurado', estado: 'supuesto' as const, companias: ['mapfre'] }],
      },
      companias: [{ compania: 'allianz', estado: 'faltan' as const }, { compania: 'mapfre', estado: 'faltan' as const }],
    },
    sueltos: [], nombres: { allianz: 'Allianz', mapfre: 'Mapfre' },
  }
  const p = unirParaTarificar(aportacionesBotsMotor(pub, ''))
  assert.deepEqual(p.items.map((i) => [i.clave, i.estado, i.destino]), [['bot.conductor.sexo', 'falta', 'personas'], ['bot.aniosAsegurado', 'confirmar', 'historial']])
})

test('resúmenes de cabecera: capital en euros y pendientes; sin leer ≠ completo', () => {
  const eur = (x: number) => `${x}€`
  assert.equal(resumenObjeto({ clave: 'datosVivienda', faltan: ['a', 'b', 'c'], datos: { capitalContinente: 228000 } }, eur), '228000€ continente · 3 datos pendientes')
  assert.equal(resumenObjeto(null, eur), 'Sin leer')
  assert.equal(resumenObjeto(null, eur, null, true), 'Sin comprobar')
  assert.equal(resumenIntervinientes([TOMADOR, { ...TOMADOR, rol: 'propietario' }]), '1 persona · 1 dato pendiente')
  assert.equal(resumenIntervinientes([{ ...TOMADOR, faltan: null }]), '1 persona · alguna ficha sin leer')
})

// ─── Cableado de la pantalla (lee el FUENTE: tsc no ve si una sección se queda abierta o se monta de golpe) ───────────────
const OP = join(import.meta.dirname, '../../app/(usuario)/correduria/oportunidad/[id]/')

test('pantalla del riesgo: «Para tarificar faltan» arriba y TODO lo demás en secciones plegadas (solo dos montadas de inicio)', () => {
  const r = readFileSync(join(OP, 'RiesgoPantalla.tsx'), 'utf8')
  const i = (t: string) => r.indexOf(t)
  assert.ok(i('<ParaTarificar') > 0 && i('<ParaTarificar') < i('<SeccionPlegable id="sec-intervinientes"'), 'el bloque de lo que falta va antes que las secciones')
  for (const id of ['sec-intervinientes', 'sec-objeto', 'sec-historial', 'sec-pedir-precio', 'sec-precios', 'sec-enviar', 'sec-presupuestos-riesgo']) {
    assert.ok(r.includes(`<SeccionPlegable id="${id}"`), id)
  }
  for (const [comp, sec] of [['<FigurasRiesgo', 'sec-intervinientes'], ['<HistorialRiesgo', 'sec-historial'], ['<ParrillaPrecios', 'sec-precios'], ['<OfertasOportunidad', 'sec-enviar'], ['<HistorialVariantes', 'sec-presupuestos-riesgo']]) {
    assert.ok(i(comp) > i(`<SeccionPlegable id="${sec}"`), `${comp} dentro de ${sec}`)
  }
  // Montadas desde el principio, y solo estas: «Pedir precio» (los bots de coche publican lo que falta) y los bots de compañía.
  assert.deepEqual([...r.matchAll(/<SeccionPlegable id="([^"]+)"[^>]*perezosa=\{false\}/g)].map((m) => m[1]), ['sec-pedir-precio', 'sec-presupuestos-companias'])
})

test('SeccionPlegable: plegada de inicio (sin `open` controlado) y perezosa (no monta el contenido hasta abrirla)', () => {
  const s = readFileSync(join(OP, 'SeccionPlegable.tsx'), 'utf8')
  assert.doesNotMatch(s, /<details[^>]*\sopen[=\s{]/, 'sin `open`: nace plegada y React no la vuelve a cerrar')
  assert.match(s, /useState\(!perezosa\)/)
  assert.match(s, /\{montada && children\}/)
})

test('botones de tarificar: solo con SU comprobación hecha; un «sin comprobar» no los enciende', () => {
  const okA2 = avant2([], [{ ...TOMADOR, faltan: [] }])!
  const botsOk = botsHogar({ vivienda: { ...VIVIENDA, anioConstruccion: 1990 }, elecciones: { ...ELECCIONES, conMadera: 'no' }, tomador: { ...TOMADOR, faltan: [] } })
  assert.deepEqual(accionesListas(unirParaTarificar([okA2, ...botsOk])), { avant2: true, bots: true })
  // Compañías sin leer: Avant2 sí, bots no (aunque no haya ningún dato «falta»).
  assert.deepEqual(accionesListas(unirParaTarificar([okA2, ...botsHogar({ companias: null })])), { avant2: true, bots: false })
  // La ficha del tomador sin leer (item «sin comprobar» de Avant2 y del bot): ninguno de los dos.
  const sinFicha = { ...TOMADOR, faltan: null }
  assert.deepEqual(accionesListas(unirParaTarificar([avant2([], [sinFicha])!, ...botsHogar({ vivienda: { ...VIVIENDA, anioConstruccion: 1990 }, elecciones: { ...ELECCIONES, conMadera: 'no' }, tomador: sinFicha })])), { avant2: false, bots: false })
})

test('bots de hogar sin figura de tomador: su ficha queda «sin comprobar», nunca cubierta', () => {
  const p = unirParaTarificar(botsHogar({ vivienda: { ...VIVIENDA, anioConstruccion: 1990 }, elecciones: { ...ELECCIONES, conMadera: 'no' }, tomador: null }))
  assert.equal(p.items.find((i) => i.clave === 'persona.tomador.ficha')?.estado, 'sin_comprobar')
  assert.equal(p.listo, false)
  assert.equal(accionesListas(p).bots, false)
})
