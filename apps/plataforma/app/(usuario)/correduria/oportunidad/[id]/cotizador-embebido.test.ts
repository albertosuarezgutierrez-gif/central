import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { RAMOS_COTIZADOR_EMBEBIDO, abrirAlCargar, bloqueObjetoDeRamo, firmaRiesgo, firmaRiesgoMoto, firmaRiesgoVehiculo, motivoBloqueoCotizador, ramoCotizadorEmbebido, rutaPedirPrecio } from './cotizador-embebido.ts'
import { RAMOS_VARIANTE, rutaVariante } from './variante.ts'
import { interpretarRiesgo } from '../../../../../lib/riesgo-asegura.ts'

function riesgo(extra: { datosVehiculo?: Record<string, unknown>; figuras?: unknown[]; variantes?: unknown[]; roles?: string[]; clienteId?: string } = {}) {
  const r = interpretarRiesgo(200, {
    estado: 'ok',
    oportunidad: { id: 'op1', clienteId: extra.clienteId ?? 'c1', ramo: 'moto' },
    roles: extra.roles ?? ['tomador', 'propietario', 'conductor_habitual'],
    figuras: extra.figuras ?? [{ rol: 'tomador', clienteId: 'c1', nombre: 'Ana', faltan: [] }],
    vinculos: [],
    variantes: extra.variantes ?? [],
    datosVehiculo: { matricula: '1234ABC', codigoVehiculo: '777', marcaId: 'm', modeloId: 'mo', motorId: 'Gasoline', garaje: 'G1', kmAnuales: 5000, ...(extra.datosVehiculo ?? {}) },
  })
  if (r.estado !== 'ok') throw new Error('no se pudo leer')
  return r.riesgo
}

test('firma: otra versión, otra matrícula, otro km o garaje = otro riesgo (no se cotiza con el anterior)', () => {
  const base = firmaRiesgoMoto(riesgo())
  for (const cambio of [{ codigoVehiculo: '888' }, { matricula: '9999ZZZ' }, { kmAnuales: 6000 }, { garaje: 'G2' }, { motorId: 'Diesel' }]) {
    assert.notEqual(firmaRiesgoMoto(riesgo({ datosVehiculo: cambio })), base, JSON.stringify(cambio))
  }
})

test('firma: otra persona en un papel, o lo que le falta a su ficha, también cambia el riesgo', () => {
  const base = firmaRiesgoMoto(riesgo())
  const conConductor = riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', nombre: 'Ana', faltan: [] }, { rol: 'conductor_habitual', clienteId: 'c2', nombre: 'Luis', faltan: ['fechaCarnet'] }] })
  assert.notEqual(firmaRiesgoMoto(conConductor), base)
  const yaConCarne = riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', nombre: 'Ana', faltan: [] }, { rol: 'conductor_habitual', clienteId: 'c2', nombre: 'Luis', faltan: [] }] })
  assert.notEqual(firmaRiesgoMoto(yaConCarne), firmaRiesgoMoto(conConductor))
})

test('firma: sin figura «tomador», otro cliente de la oportunidad es otro tomador (otro riesgo)', () => {
  const sinTomador = (clienteId: string) => riesgo({ clienteId, figuras: [] })
  assert.notEqual(firmaRiesgoMoto(sinTomador('c9')), firmaRiesgoMoto(sinTomador('c1')))
})

test('firma: confirmar los datos o añadir una variante NO hace viejas las condiciones', () => {
  const base = firmaRiesgoMoto(riesgo())
  assert.equal(firmaRiesgoMoto(riesgo({ datosVehiculo: { confirmadoAt: '2026-10-07T10:00:00Z' } })), base)
  assert.equal(firmaRiesgoMoto(riesgo({ variantes: [{ id: 't1', referencia: 'P1', creadoAt: '2026-10-07', tomador: { clienteId: 'c1', nombre: 'Ana' } }] })), base)
})

test('bloqueo: editar arriba manda; luego relectura; luego desfase; sin nada, null', () => {
  const nada = { editandoObjeto: false, editandoFiguras: false, recargando: false, riesgoCambiado: false, pantallaDesfasada: false }
  assert.equal(motivoBloqueoCotizador(nada), null)
  assert.match(motivoBloqueoCotizador({ ...nada, editandoObjeto: true, recargando: true })!, /Datos del vehículo/)
  assert.match(motivoBloqueoCotizador({ ...nada, editandoObjeto: true, objeto: bloqueObjetoDeRamo('hogar') })!, /Datos de la vivienda/)
  assert.match(motivoBloqueoCotizador({ ...nada, editandoFiguras: true })!, /Intervinientes/)
  assert.match(motivoBloqueoCotizador({ ...nada, recargando: true, riesgoCambiado: true })!, /Releyendo/)
  assert.match(motivoBloqueoCotizador({ ...nada, riesgoCambiado: true })!, /han cambiado/)
  assert.match(motivoBloqueoCotizador({ ...nada, pantallaDesfasada: true })!, /no coincide/)
})

test('registro: auto, moto y hogar se cotizan DENTRO de la oportunidad; el resto de ramos sigue con su pantalla', () => {
  assert.deepEqual([...RAMOS_COTIZADOR_EMBEBIDO].sort(), ['auto', 'hogar', 'moto'])
  for (const r of RAMOS_COTIZADOR_EMBEBIDO) assert.ok((RAMOS_VARIANTE as readonly string[]).includes(r), `${r} tiene que ser un ramo cotizable`)
  for (const r of ['vida', 'salud', 'decesos', 'comunidades', 'otros', '', null, undefined]) assert.equal(ramoCotizadorEmbebido(r), null, String(r))
})

test('rutaPedirPrecio: auto, moto y hogar → la oportunidad con #pedir-precio; vida… → su pantalla …-nuevo?oportunidad=', () => {
  assert.equal(rutaPedirPrecio('auto', 'c1', 'op 1'), '/correduria/oportunidad/op%201#pedir-precio')
  assert.equal(rutaPedirPrecio('moto', 'c1', 'op1'), '/correduria/oportunidad/op1#pedir-precio')
  assert.equal(rutaPedirPrecio('hogar', 'c1', 'op1'), '/correduria/oportunidad/op1#pedir-precio')
  for (const r of ['vida', 'salud', 'decesos'] as const) assert.equal(rutaPedirPrecio(r, 'c1', 'op1'), rutaVariante(r, 'c1', 'op1'), r)
})

test('abrirAlCargar: solo con el ancla exacta y un ramo con cotizador embebido', () => {
  assert.equal(abrirAlCargar('#pedir-precio', 'auto'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'moto'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'hogar'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'vida'), false)
  assert.equal(abrirAlCargar('', 'auto'), false)
  assert.equal(abrirAlCargar('#presupuestos', 'auto'), false)
})

test('la huella es la misma para todos los ramos (los nombres viejos son alias)', () => {
  assert.equal(firmaRiesgoMoto, firmaRiesgo)
  assert.equal(firmaRiesgoVehiculo, firmaRiesgo)
})

function riesgoHogar(vivienda: Record<string, unknown>, figuras: unknown[] = [{ rol: 'tomador', clienteId: 'c1', nombre: 'Ana', faltan: [] }]) {
  const r = interpretarRiesgo(200, {
    estado: 'ok',
    oportunidad: { id: 'op1', clienteId: 'c1', ramo: 'hogar' },
    roles: ['tomador', 'propietario', 'asegurado'],
    figuras,
    vinculos: [],
    variantes: [],
    datosRiesgo: { clave: 'datosVivienda', datos: { referenciaCatastral: '4825101TG3442E0015JW', cp: '41003', metrosCuadrados: 76, capitalContinente: 90000, ...vivienda }, faltan: [] },
  })
  if (r.estado !== 'ok') throw new Error('no se pudo leer')
  return r.riesgo
}

test('hogar: otra vivienda (m², capital, referencia, protección) = otro riesgo; confirmarla no', () => {
  const base = firmaRiesgo(riesgoHogar({}))
  for (const cambio of [{ metrosCuadrados: 80 }, { capitalContinente: 120000 }, { referenciaCatastral: '4825101TG3442E0016KE' }, { puertaPrincipalBlindada: true }, { capitalContenido: 0 }]) {
    assert.notEqual(firmaRiesgo(riesgoHogar(cambio)), base, JSON.stringify(cambio))
  }
  assert.equal(firmaRiesgo(riesgoHogar({ confirmadoAt: '2026-10-10T10:00:00Z' })), base)
})

test('hogar: otro propietario u otro asegurado = otro riesgo', () => {
  const base = firmaRiesgo(riesgoHogar({}))
  const tom = { rol: 'tomador', clienteId: 'c1', nombre: 'Ana', faltan: [] }
  assert.notEqual(firmaRiesgo(riesgoHogar({}, [tom, { rol: 'propietario', clienteId: 'c2', nombre: 'Luis', faltan: [] }])), base)
  assert.notEqual(firmaRiesgo(riesgoHogar({}, [tom, { rol: 'asegurado', clienteId: 'c3', nombre: 'Eva', faltan: [] }])), base)
})

test('cepo: la página del riesgo da margen a la cotización embebida (maxDuration ≥ 180 s, como las …-nuevo)', () => {
  const fuente = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
  const m = /export const maxDuration\s*=\s*(\d+)/.exec(fuente)
  assert.ok(m, 'oportunidad/[id]/page.tsx sin maxDuration: la acción de 0,50€ se cortaría a mitad')
  assert.ok(Number(m![1]) >= 180, `maxDuration ${m![1]} < 180`)
})
