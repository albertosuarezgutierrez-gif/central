import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { RAMOS_COTIZADOR_EMBEBIDO, abrirAlCargar, bloqueObjetoDeRamo, firmaRiesgo, firmaRiesgoMoto, firmaRiesgoVehiculo, motivoBloqueoCotizador, ramoCotizadorEmbebido, rutaPedirPrecio } from './cotizador-embebido.ts'
import { RAMOS_VARIANTE, rutaVariante } from './variante.ts'
import { interpretarRiesgo } from '../../../../../lib/riesgo-asegura.ts'

function riesgo(extra: { datosVehiculo?: Record<string, unknown>; figuras?: unknown[]; variantes?: unknown[]; roles?: string[]; clienteId?: string; historial?: unknown } = {}) {
  const r = interpretarRiesgo(200, {
    estado: 'ok',
    oportunidad: { id: 'op1', clienteId: extra.clienteId ?? 'c1', ramo: 'moto' },
    roles: extra.roles ?? ['tomador', 'propietario', 'conductor_habitual'],
    figuras: extra.figuras ?? [{ rol: 'tomador', clienteId: 'c1', nombre: 'Ana', faltan: [] }],
    vinculos: [],
    variantes: extra.variantes ?? [],
    datosVehiculo: { matricula: '1234ABC', codigoVehiculo: '777', marcaId: 'm', modeloId: 'mo', motorId: 'Gasoline', garaje: 'G1', kmAnuales: 5000, ...(extra.datosVehiculo ?? {}) },
    ...(extra.historial !== undefined ? { historial: extra.historial } : {}),
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

test('firma: los años asegurado / en la compañía declarados arriba cambian el riesgo (el cotizador auto los manda)', () => {
  const con = (aniosAsegurado: number | null) => riesgo({ historial: { seguroAnterior: null, historialDeclarado: { aniosAsegurado, aniosEnCompania: null }, carnet: null } })
  assert.notEqual(firmaRiesgo(con(3)), firmaRiesgo(con(null)))
  assert.notEqual(firmaRiesgo(con(0)), firmaRiesgo(con(null)))
  assert.equal(firmaRiesgo(con(3)), firmaRiesgo(con(3)))
})

test('firma (13/10/2026): seguro actual, compañía, nº de póliza, años sin siniestros y siniestros en 5 declarados arriba cambian el riesgo', () => {
  const con = (hd: Record<string, unknown>) => firmaRiesgo(riesgo({ historial: { seguroAnterior: null, historialDeclarado: { aniosAsegurado: null, aniosEnCompania: null, ...hd }, carnet: null } }))
  const base = con({})
  const cambios: Record<string, unknown[]> = {
    tieneSeguroActual: [true, false],
    companiaActual: ['Mapfre'],
    numeroPoliza: ['4840402030', '4840402031'],
    aniosSinSiniestros: [0, 7],
    siniestrosUltimos5: [0, 2],
  }
  for (const [k, valores] of Object.entries(cambios)) {
    for (const v of valores) assert.notEqual(con({ [k]: v }), base, `${k}=${String(v)} no entra en la huella`)
  }
  assert.notEqual(con({ numeroPoliza: '4840402030' }), con({ numeroPoliza: '4840402031' }), 'otra póliza, otro riesgo')
  assert.notEqual(con({ tieneSeguroActual: true }), con({ tieneSeguroActual: false }))
  assert.equal(con({ companiaActual: 'Reale' }), con({ companiaActual: 'Reale' }), 'estable')
  // Sin la clave y con la clave a null es lo mismo (asegura vieja ≡ «sin dato»).
  assert.equal(con({ companiaActual: null }), base)
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

test('registro: los SEIS ramos con Avant2 (auto, moto, hogar, decesos, salud, vida) se cotizan DENTRO de la oportunidad', () => {
  assert.deepEqual([...RAMOS_COTIZADOR_EMBEBIDO].sort(), ['auto', 'decesos', 'hogar', 'moto', 'salud', 'vida'])
  for (const r of RAMOS_COTIZADOR_EMBEBIDO) assert.ok((RAMOS_VARIANTE as readonly string[]).includes(r), `${r} tiene que ser un ramo cotizable`)
  for (const r of ['comercio', 'rc', 'comunidades', 'otros', '', null, undefined]) assert.equal(ramoCotizadorEmbebido(r), null, String(r))
})

test('rutaPedirPrecio: auto, moto y hogar → la oportunidad con #pedir-precio; vida… → su pantalla …-nuevo?oportunidad=', () => {
  assert.equal(rutaPedirPrecio('auto', 'c1', 'op 1'), '/correduria/oportunidad/op%201#pedir-precio')
  assert.equal(rutaPedirPrecio('moto', 'c1', 'op1'), '/correduria/oportunidad/op1#pedir-precio')
  assert.equal(rutaPedirPrecio('hogar', 'c1', 'op1'), '/correduria/oportunidad/op1#pedir-precio')
  for (const r of ['decesos', 'salud', 'vida'] as const) assert.equal(rutaPedirPrecio(r, 'c1', 'op1'), '/correduria/oportunidad/op1#pedir-precio', r)
})

test('abrirAlCargar: solo con el ancla exacta y un ramo con cotizador embebido', () => {
  assert.equal(abrirAlCargar('#pedir-precio', 'auto'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'moto'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'hogar'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'decesos'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'salud'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'vida'), true)
  assert.equal(abrirAlCargar('#pedir-precio', 'comunidades'), false)
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
