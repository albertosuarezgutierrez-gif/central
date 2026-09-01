import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  precalificarAuto,
  partirApellidos,
  sexoDeSaludo,
  aniosEntre,
  sePuedeCotizar,
  supuestosOptimistas,
  KM_ANUALES_POR_DEFECTO,
  type ClienteCartera,
  type PolizaCartera,
  type Resueltos,
} from './desde-cartera.ts'

const HOY = '2026-09-01'

const CLIENTE: ClienteCartera = {
  nombre: 'José',
  apellidos: 'Suárez Gutiérrez',
  dni: '12345678Z',
  telefono: '600 123 456',
  fechaNacimiento: '1980-05-14',
  estadoCivil: 'Casado',
  saludo: '1',
  codigoPostal: '41003',
  fechaCarnet: '1999-06-01',
}

const POLIZA: PolizaCartera = {
  numeroPoliza: 'P-0001',
  codigoEntidadDgs: 'C0058',
  matricula: '1234ABC',
  fechaEfectoInicial: '2016-03-01',
  fechaVencimiento: '2026-10-15',
  siniestrosRegistrados: 0,
}

const RESUELTOS: Resueltos = {
  municipioId: 41091,
  estadoCivilId: 'Married',
  fechaMatriculacion: '2016-02-20',
  codigoVehiculo: '12345678',
  garaje: 'CommunalParking',
}

function pre(
  c: Partial<ClienteCartera> = {},
  p: Partial<PolizaCartera> = {},
  r: Partial<Resueltos> = {},
) {
  return precalificarAuto({ ...CLIENTE, ...c }, { ...POLIZA, ...p }, { ...RESUELTOS, ...r }, HOY)
}

// ─── El caso feliz: una póliza de la cartera se cotiza sin pedir nada ────────

test('con la ficha completa no falta nada: el botón puede cotizar', () => {
  const r = pre()
  assert.deepEqual(r.faltan, [])
  assert.ok(sePuedeCotizar(r))
})

test('la póliza actual pasa a ser la ANTERIOR de la cotización', () => {
  const { datos } = pre()
  assert.equal(datos.aseguradoAntes, true)
  assert.equal(datos.polizaAnterior, 'P-0001')
  assert.equal(datos.companiaAnteriorCodigo, 'C0058')
})

test('la fecha de efecto es el día siguiente al vencimiento de la póliza actual', () => {
  const { datos } = pre()
  assert.equal(datos.fechaEfecto, '2026-10-16')
})

test('si la póliza ya venció, se cotiza para mañana y se dice por qué', () => {
  const r = pre({}, { fechaVencimiento: '2026-01-10' })
  assert.equal(r.datos.fechaEfecto, '2026-09-02')
  const s = r.supuestos.find((x) => x.campo === 'fechaEfecto')
  assert.match(s!.porque, /venció el 2026-01-10/)
})

test('sin vencimiento en la ficha NO se inventa uno: se cotiza para mañana y se explica', () => {
  const r = pre({}, { fechaVencimiento: null })
  assert.equal(r.datos.fechaEfecto, '2026-09-02')
  assert.match(r.supuestos.find((x) => x.campo === 'fechaEfecto')!.porque, /no tiene fecha de vencimiento/)
})

// ─── Los supuestos se ven, que es el punto de todo esto ─────────────────────

test('los kilómetros son un SUPUESTO, no un dato: van en la lista con su porqué', () => {
  const r = pre()
  const km = r.supuestos.find((s) => s.campo === 'kmAnuales')
  assert.ok(km, 'los km por defecto tienen que declararse como supuesto')
  assert.equal(km!.valor, KM_ANUALES_POR_DEFECTO)
  assert.equal(r.datos.kmAnuales, KM_ANUALES_POR_DEFECTO)
})

test('el CP de circulación se supone igual al de residencia, y se dice', () => {
  const r = pre()
  const s = r.supuestos.find((x) => x.campo === 'cpCirculacion')
  assert.match(s!.porque, /donde vive el tomador/)
})

test('el garaje solo se marca como supuesto si de verdad lo es', () => {
  assert.equal(pre().supuestos.some((s) => s.campo === 'garaje'), false)
  assert.equal(
    pre({}, {}, { garajeEsSupuesto: true }).supuestos.some((s) => s.campo === 'garaje'),
    true,
  )
})

// ─── Siniestralidad: la regla NULL ≠ 0 con dinero de por medio ───────────────

test('sin siniestros anotados se presume que no los hubo, pero marcado como OPTIMISTA', () => {
  const r = pre()
  const s = r.supuestos.find((x) => x.campo === 'aniosSinSiniestros')
  assert.ok(s, 'la siniestralidad presumida tiene que declararse')
  assert.equal(s!.optimista, true)
  assert.match(s!.porque, /no prueba que no los haya/)
  assert.deepEqual(supuestosOptimistas(r), [s])
})

test('con siniestros anotados deja de ser supuesto y pasa a ser dato', () => {
  const r = pre({}, { siniestrosRegistrados: 2 })
  assert.equal(r.datos.aniosSinSiniestros, 0)
  assert.equal(r.datos.siniestrosUltimos5, 2)
  assert.equal(r.supuestos.some((s) => s.campo === 'aniosSinSiniestros'), false)
  assert.deepEqual(supuestosOptimistas(r), [])
})

test('presumir cero siniestros iguala los años y evita el 400 del detalle de siniestros', () => {
  // El vendor exige `lastFiveYearsAccidents` si los años sin siniestros son < 5
  // y NO coinciden con los años asegurado. Al presumir la carrera limpia entera,
  // coinciden — y el 400 (ya pagado) no llega.
  const r = pre({}, { fechaEfectoInicial: '2024-03-01' })
  assert.equal(r.datos.aniosAsegurado, r.datos.aniosSinSiniestros)
  assert.deepEqual(r.faltan, [])
})

// ─── Los supuestos que NO son optimistas tiran a la baja ─────────────────────

test('sin fecha de inicio se presume UN año asegurado — el supuesto más caro', () => {
  const r = pre({}, { fechaEfectoInicial: null })
  assert.equal(r.datos.aniosAsegurado, 1)
  const s = r.supuestos.find((x) => x.campo === 'aniosAsegurado')
  assert.match(s!.porque, /solo puede mejorar/)
  assert.notEqual(s!.optimista, true)
})

test('los años asegurado salen de la fecha real cuando la hay', () => {
  assert.equal(pre().datos.aniosAsegurado, 10)
})

// ─── Centinelas: un «Lead» no es un nombre ──────────────────────────────────

test('el nombre centinela «Lead» se trata como ausencia, no se manda al vendor', () => {
  const r = pre({ nombre: 'Lead' })
  assert.equal(r.datos.nombre, undefined)
  assert.ok(r.faltan.some((f) => f.campo === 'nombre'))
})

test('otros centinelas del CRM también cuentan como ausencia', () => {
  for (const n of ['lead', 'SIN NOMBRE', 'desconocido', '-']) {
    assert.equal(pre({ nombre: n }).datos.nombre, undefined, `«${n}» no es un nombre`)
  }
})

// ─── Piezas sueltas ─────────────────────────────────────────────────────────

test('los apellidos se parten dejando el ÚLTIMO como segundo apellido', () => {
  assert.deepEqual(partirApellidos('Suárez Gutiérrez'), { primero: 'Suárez', segundo: 'Gutiérrez' })
  assert.deepEqual(partirApellidos('de la Torre Ruiz'), { primero: 'de la Torre', segundo: 'Ruiz' })
  assert.deepEqual(partirApellidos('Pérez'), { primero: 'Pérez', segundo: null })
  assert.deepEqual(partirApellidos(null), { primero: null, segundo: null })
})

test('el tratamiento del CRM da el sexo: 1 hombre, 2 mujer, y el resto NO se adivina', () => {
  assert.equal(sexoDeSaludo('1'), 'hombre')
  assert.equal(sexoDeSaludo('2'), 'mujer')
  for (const v of ['3', '0', null, '', 'x']) assert.equal(sexoDeSaludo(v), null, `«${v}» no dice el sexo`)
})

test('sin tratamiento, el sexo FALTA — no se pone uno por defecto', () => {
  const r = pre({ saludo: '3' })
  assert.equal(r.datos.sexo, undefined)
  assert.ok(r.faltan.some((f) => f.campo === 'sexo'))
  assert.equal(r.supuestos.some((s) => s.campo === 'sexo'), false)
})

test('aniosEntre cuenta años completos y rechaza lo que no es fecha', () => {
  assert.equal(aniosEntre('2016-03-01', '2026-09-01'), 10)
  assert.equal(aniosEntre('2026-03-01', '2026-09-01'), 0)
  assert.equal(aniosEntre(null, '2026-09-01'), null)
  assert.equal(aniosEntre('marzo', '2026-09-01'), null)
  assert.equal(aniosEntre('2027-01-01', '2026-09-01'), null, 'una fecha futura no da años negativos')
})

test('el teléfono viaja sin espacios (el vendor valida el formato)', () => {
  assert.equal(pre().datos.telefono, '600123456')
})

// ─── Lo que exige red: si no está resuelto, se dice cuál falta ───────────────

test('sin código de versión del vehículo no se puede cotizar, y el reparo lo señala', () => {
  const r = pre({}, {}, { codigoVehiculo: null })
  assert.ok(!sePuedeCotizar(r))
  assert.ok(r.faltan.some((f) => f.campo === 'codigoVehiculo'))
})

test('sin fecha de matriculación tampoco, y sin municipio tampoco', () => {
  assert.ok(pre({}, {}, { fechaMatriculacion: null }).faltan.some((f) => f.campo === 'fechaMatriculacion'))
  assert.ok(
    pre({}, {}, { municipioId: null }).faltan.some((f) => f.campo === 'municipioCirculacionId'),
  )
})

test('un DNI o un carnet que no están se reportan como falta, nunca se inventan', () => {
  const r = pre({ dni: null, fechaCarnet: null })
  assert.ok(r.faltan.some((f) => f.campo === 'dni'))
  assert.ok(r.faltan.some((f) => f.campo === 'fechaCarnet'))
  assert.equal(r.supuestos.some((s) => s.campo === 'dni'), false)
})

test('NINGÚN supuesto rellena un dato personal: solo circunstancias del riesgo', () => {
  const personales: string[] = ['dni', 'nombre', 'apellido1', 'fechaNacimiento', 'telefono', 'fechaCarnet', 'sexo']
  for (const s of pre({ dni: null, telefono: null, fechaNacimiento: null }).supuestos) {
    assert.ok(!personales.includes(s.campo), `no se puede suponer un dato personal: ${s.campo}`)
  }
})
