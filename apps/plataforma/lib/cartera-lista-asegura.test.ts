import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  companiasDe,
  construirCsv,
  filaCsv,
  interpretarLista,
  leerFacetas,
  proximoVencimiento,
  type ClienteListado,
} from './cartera-lista-asegura.ts'

const CLIENTE = {
  id: 'c1',
  nombre: 'José',
  apellidos: 'Suárez Salas',
  provincia: 'Sevilla',
  ciudad: 'Sevilla',
  tieneEmail: true,
  tieneTelefono: false,
  polizasVivas: 2,
  ramosVivos: ['auto', 'hogar'],
  polizas: [
    { id: 'p1', tipo: 'auto', aseguradora: 'Mapfre', numeroPoliza: '123', fechaVencimiento: '2026-11-02', estado: 'activa', prima: 412.5 },
    { id: 'p2', tipo: 'hogar', aseguradora: 'Allianz', numeroPoliza: null, fechaVencimiento: '2026-09-19', estado: 'activa', prima: null },
  ],
}

const OK = {
  estado: 'ok',
  total: 62,
  pagina: 1,
  porPagina: 50,
  buscable: true,
  descartados: [{ campo: 'ramo', valor: 'bicicleta' }],
  clientes: [CLIENTE],
  facetas: {
    ramos: [{ v: 'auto', n: 81 }],
    companias: [{ v: 'Mapfre', n: 64 }],
    provincias: [{ v: 'Sevilla', n: 70 }],
    estados: [{ v: 'activa', n: 68 }],
  },
}

function ok(json: unknown) {
  const r = interpretarLista(200, json)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') throw new Error('no ok')
  return r
}

test('respuesta ok completa: total, página, descartados y facetas', () => {
  const r = ok(OK)
  assert.equal(r.total, 62)
  assert.equal(r.pagina, 1)
  assert.equal(r.buscable, true)
  assert.deepEqual(r.descartados, [{ campo: 'ramo', valor: 'bicicleta' }])
  assert.equal(r.clientes.length, 1)
  assert.equal(r.ilegibles, 0)
  assert.equal(r.facetas?.ramos[0].n, 81)
})

// ── Lo que NUNCA puede degradar a una lista vacía ───────────────────────────

test('una respuesta con forma rara degrada a error, NUNCA a lista vacía', () => {
  for (const raro of [null, 'texto', 42, [], { estado: 'ok' }, { estado: 'ok', clientes: 'no-es-lista' }]) {
    const r = interpretarLista(200, raro)
    assert.equal(r.estado, 'error', `debería ser error: ${JSON.stringify(raro)}`)
  }
})

test('un ok cuyo TOTAL no se puede leer es error (no se inventa un 0)', () => {
  assert.equal(interpretarLista(200, { ...OK, total: undefined }).estado, 'error')
  assert.equal(interpretarLista(200, { ...OK, total: 'muchos' }).estado, 'error')
  assert.equal(interpretarLista(200, { ...OK, total: -3 }).estado, 'error')
})

test('sin_configurar se conserva: no es «no hay clientes»', () => {
  assert.deepEqual(interpretarLista(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarLista(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
})

test('401/403 → secreto_rechazado; error de asegura conserva su CAUSA', () => {
  assert.deepEqual(interpretarLista(401, {}), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarLista(403, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarLista(200, { estado: 'error', causa: 'credenciales' }), {
    estado: 'error', motivo: 'asegura_error', causa: 'credenciales',
  })
  // El proxy no llegó a asegura: «red» no se disfraza de «asegura no pudo leer su BD».
  assert.deepEqual(interpretarLista(502, { estado: 'error', motivo: 'red' }), { estado: 'error', motivo: 'red' })
})

// ── Los tres estados, campo a campo ─────────────────────────────────────────

test('tieneEmail/tieneTelefono null se CONSERVAN (no se colapsan a false)', () => {
  const r = ok({ ...OK, clientes: [{ ...CLIENTE, tieneEmail: null }, { ...CLIENTE, id: 'c2' }] })
  assert.equal(r.clientes[0].tieneEmail, null)
  assert.equal(r.clientes[0].tieneTelefono, false) // el false explícito sí es un dato
  // Campo ausente = no informado, tampoco false.
  const sinCampo: Record<string, unknown> = { ...CLIENTE, id: 'c3' }
  delete sinCampo.tieneTelefono
  assert.equal(ok({ ...OK, clientes: [sinCampo] }).clientes[0].tieneTelefono, null)
})

test('prima null se conserva; un 0 explícito sigue siendo un valor', () => {
  const r = ok(OK)
  assert.equal(r.clientes[0].polizas?.[0].prima, 412.5)
  assert.equal(r.clientes[0].polizas?.[1].prima, null)
  const cero = ok({ ...OK, clientes: [{ ...CLIENTE, polizas: [{ ...CLIENTE.polizas[0], prima: 0 }] }] })
  assert.equal(cero.clientes[0].polizas?.[0].prima, 0)
})

test('polizasVivas/ramosVivos/polizas ausentes → null, nunca 0 ni []', () => {
  const pelado = { id: 'c9', nombre: 'Sin', apellidos: 'Datos' }
  const c = ok({ ...OK, clientes: [pelado] }).clientes[0]
  assert.equal(c.polizasVivas, null)
  assert.equal(c.ramosVivos, null)
  assert.equal(c.polizas, null)
  assert.equal(c.provincia, null)
})

test('facetas ausentes o ilegibles → null (no cuatro listas vacías)', () => {
  assert.equal(ok({ ...OK, facetas: undefined }).facetas, null)
  assert.equal(leerFacetas({ ramos: 'nada' }), null)
  // Una faceta sin recuento se salta en vez de pintarse como 0.
  assert.deepEqual(leerFacetas({ ramos: [{ v: 'auto' }, { v: 'hogar', n: 19 }] })?.ramos, [{ v: 'hogar', n: 19 }])
})

// ── Filas ilegibles: se cuentan, no se descartan en silencio ────────────────

test('una fila sin id (o sin nombre) invalida ESA fila y se CUENTA', () => {
  const r = ok({ ...OK, clientes: [CLIENTE, { nombre: 'Sin id' }, { id: 'c4' }, null] })
  assert.equal(r.clientes.length, 1)
  assert.equal(r.ilegibles, 3)
})

test('una póliza sin id se cuenta en polizasIlegibles del cliente', () => {
  const r = ok({ ...OK, clientes: [{ ...CLIENTE, polizas: [CLIENTE.polizas[0], { tipo: 'moto' }] }] })
  assert.equal(r.clientes[0].polizas?.length, 1)
  assert.equal(r.clientes[0].polizasIlegibles, 1)
})

// ── Derivados y CSV ────────────────────────────────────────────────────────

test('compañías y próximo vencimiento: null cuando no se han podido mirar', () => {
  const c = ok(OK).clientes[0]
  assert.deepEqual(companiasDe(c), ['Mapfre', 'Allianz'])
  assert.equal(proximoVencimiento(c), '2026-09-19')
  const sin = ok({ ...OK, clientes: [{ id: 'c5', nombre: 'A', apellidos: 'B' }] }).clientes[0]
  assert.equal(companiasDe(sin), null)
  assert.equal(proximoVencimiento(sin), null)
})

test('el CSV empieza por la DESCRIPCIÓN del filtro y luego la cabecera', () => {
  const csv = construirCsv('cartera viva · con Auto · SIN Hogar', ok(OK).clientes, { total: 62 })
  const lineas = csv.split('\r\n')
  assert.ok(lineas[0].includes('cartera viva · con Auto · SIN Hogar'))
  assert.ok(lineas[1].includes('1 cliente(s) exportado(s) de 62'))
  assert.equal(lineas[2], 'Cliente;Provincia;Ciudad;Email;Teléfono;Pólizas vivas;Ramos;Compañías;Próximo vencimiento')
  assert.ok(lineas[3].startsWith('José Suárez Salas;Sevilla;Sevilla;sí;no;2;'))
})

test('el CSV dice «sin comprobar», nunca «no», cuando el canal es null', () => {
  const c = ok({ ...OK, clientes: [{ ...CLIENTE, tieneEmail: null, tieneTelefono: null }] }).clientes[0]
  const fila = filaCsv(c)
  assert.equal(fila[3], 'sin comprobar')
  assert.equal(fila[4], 'sin comprobar')
})

test('un CSV cortado en el tope lo DICE dentro del propio fichero', () => {
  const csv = construirCsv('cartera viva', ok(OK).clientes, { total: 5000, truncado: true, tope: 2000 })
  assert.ok(csv.split('\r\n')[2].includes('2000'))
  assert.ok(/NO está completa/.test(csv))
})

test('el CSV escapa el separador y las comillas del nombre', () => {
  const raro: ClienteListado = {
    ...ok(OK).clientes[0],
    nombre: 'Gestión; S.L. "La"',
    apellidos: '',
  }
  const linea = construirCsv('x', [raro]).split('\r\n')[3]
  assert.ok(linea.startsWith('"Gestión; S.L. ""La"""'))
})
