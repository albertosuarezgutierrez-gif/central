import test from 'node:test'
import assert from 'node:assert/strict'

import type { CanalCompania } from './canal-compania.ts'
import { itvDeVehiculo } from './flota.ts'
import {
  CAMPOS_PROHIBIDOS_EN_VEHICULO_PUBLICO,
  INTERRUPTORES_DEFECTO,
  interruptoresDelCuerpo,
  interruptoresEfectivos,
  semaforoItv,
  semaforoSeguro,
  vistaPublicaVehiculo,
  type EntradaVistaPublica,
} from './vehiculo-publico.ts'

// Fechas RELATIVAS a hoy (regla de la casa: un test con fecha fija contra el reloj real es una bomba de tiempo).
const HOY = new Date()
const dia = (desplazamientoDias: number) => new Date(HOY.getTime() + desplazamientoDias * 86_400_000).toISOString().slice(0, 10)
const haceAnios = (n: number) => {
  const d = new Date(HOY)
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return d.toISOString().slice(0, 10)
}

const CANAL: CanalCompania = {
  nombre: 'Mapfre',
  sinDatos: false,
  verificadoEn: '2026-09-23',
  vias: [
    { tipo: 'telefono', uso: 'asistencia', para: 'Auto', numero: '900 100 200', horario: null },
    { tipo: 'telefono', uso: 'siniestros', para: null, numero: '900 300 400', horario: 'L-V 9-18' },
  ],
}

/**
 * Una entrada ENVENENADA: además de lo permitido, trae todo lo que no puede salir nunca (spec §7-1). Los
 * valores son centinelas: si alguno aparece en la salida, se ha colado.
 */
function entradaEnvenenada(dueno: EntradaVistaPublica['dueno']): EntradaVistaPublica {
  const e = {
    dueno: { ...dueno, nombre: 'CENTINELA_NOMBRE', apellidos: 'CENTINELA_APELLIDOS', nif: 'CENTINELA_NIF', dni: '12345678Z' },
    matricula: '1234ABC',
    poliza: {
      compania: 'Mapfre',
      numeroPoliza: 'P-99',
      prima: 'CENTINELA_PRIMA',
      primaAnual: 812.4,
      fechaVencimiento: '2027-03-01',
      recibos: ['CENTINELA_RECIBO'],
      iban: 'ES00CENTINELA',
    },
    canal: CANAL,
    semaforos: { itv: 'al_dia', seguro: 'al_dia', fechaItv: '2028-01-01' },
    recordatorios: [{ tipo: 'neumaticos', vencido: false, titulo: 'CENTINELA_TITULO', autorNombre: 'CENTINELA_AUTOR', km: 123456, fecha: '2026-12-01' }],
    direccion: 'CENTINELA_DIRECCION',
    ubicacion: 'CENTINELA_UBICACION',
    fechaMatriculacion: '2019-05-05',
    documentos: ['CENTINELA_DOC'],
    identidadId: 'CENTINELA_IDENTIDAD',
    clienteId: 'CENTINELA_CLIENTE',
    email: 'centinela@example.com',
  }
  return e as unknown as EntradaVistaPublica
}

function clavesDe(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) clavesDe(x, out)
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k)
      clavesDe(x, out)
    }
  }
  return out
}

function noSaleNadaProhibido(vista: unknown) {
  const json = JSON.stringify(vista)
  assert.doesNotMatch(json, /CENTINELA/i, `se ha colado un centinela: ${json}`)
  assert.doesNotMatch(json, /12345678Z|ES00/, 'ni documento ni cuenta')
  // 🚨 Ninguna fecha EXACTA: el semáforo va sin fechas.
  assert.doesNotMatch(json, /\d{4}-\d{2}-\d{2}/, `sale una fecha exacta: ${json}`)
  assert.doesNotMatch(json, /812/, 'ni la prima en número')
  const claves = new Set(clavesDe(vista))
  for (const p of CAMPOS_PROHIBIDOS_EN_VEHICULO_PUBLICO) assert.ok(!claves.has(p), `sale la clave prohibida «${p}»`)
}

const TODO_ENCENDIDO = { datosCarretera: true, estadoAlDia: true, recordatoriosPendientes: true }

test('🚨 §7-1: con TODOS los interruptores encendidos y la entrada envenenada, no sale nada prohibido', () => {
  for (const dueno of [
    { tipo: 'persona' } as const,
    { tipo: 'empresa', razonSocial: 'Global2 SL', tipoFicha: 'fisica' } as const,
    { tipo: 'empresa', razonSocial: 'Global2 SL', tipoFicha: null } as const,
    { tipo: 'empresa', razonSocial: 'Global2 SL', tipoFicha: 'juridica' } as const,
  ]) {
    const v = vistaPublicaVehiculo(entradaEnvenenada(dueno), TODO_ENCENDIDO)
    noSaleNadaProhibido(v)
    // Lo permitido SÍ sale (el cepo no pasa en verde por devolver un objeto vacío).
    assert.equal(v.carretera?.matricula, '1234ABC')
    assert.equal(v.carretera?.compania, 'Mapfre')
    assert.equal(v.carretera?.numeroPoliza, 'P-99')
    assert.equal(v.carretera?.telefonos?.length, 2)
    assert.deepEqual(v.estado, { itv: 'al_dia', seguro: 'al_dia' })
    assert.deepEqual(v.recordatorios, [{ tipo: 'neumaticos', estado: 'pendiente' }])
  }
})

test('🚨 el nombre del titular: particular NUNCA; autónomo (física) o tipo desconocido NUNCA; solo la razón social de una jurídica', () => {
  const persona = vistaPublicaVehiculo(entradaEnvenenada({ tipo: 'persona' }), TODO_ENCENDIDO)
  assert.equal(persona.carretera?.titular, null)
  const autonomo = vistaPublicaVehiculo(entradaEnvenenada({ tipo: 'empresa', razonSocial: 'Juan Pérez', tipoFicha: 'fisica' }), TODO_ENCENDIDO)
  assert.equal(autonomo.carretera?.titular, null)
  const desconocida = vistaPublicaVehiculo(entradaEnvenenada({ tipo: 'empresa', razonSocial: 'Algo', tipoFicha: null }), TODO_ENCENDIDO)
  assert.equal(desconocida.carretera?.titular, null)
  const juridica = vistaPublicaVehiculo(entradaEnvenenada({ tipo: 'empresa', razonSocial: '  Global2   SL ', tipoFicha: 'juridica' }), TODO_ENCENDIDO)
  assert.equal(juridica.carretera?.titular, 'Global2 SL')
})

test('los interruptores apagados quitan su trozo entero (null), no lo dejan vacío', () => {
  const v = vistaPublicaVehiculo(entradaEnvenenada({ tipo: 'persona' }), { datosCarretera: false, estadoAlDia: false, recordatoriosPendientes: false })
  assert.deepEqual(v, { carretera: null, estado: null, recordatorios: null })
})

test('🚨 un interruptor «mal» (no booleano, ausente, columna extra) cae al DEFECTO, nunca abre de más', () => {
  // `recordatoriosPendientes` está APAGADO por defecto: un 'true' de texto, un 1 o un null no lo encienden.
  for (const mal of [
    { recordatoriosPendientes: 'true' },
    { recordatoriosPendientes: 1 },
    { recordatoriosPendientes: null },
    'todo',
    null,
    undefined,
    [true, true, true],
    { prima: true, nif: true, datosCarretera: 'si' },
  ]) {
    const v = vistaPublicaVehiculo(entradaEnvenenada({ tipo: 'persona' }), mal)
    assert.equal(v.recordatorios, null, `abre los recordatorios con ${JSON.stringify(mal)}`)
    assert.notEqual(v.carretera, null, 'carretera sigue su defecto (encendido)')
    noSaleNadaProhibido(v)
  }
  // Una columna extra no aparece en los efectivos.
  assert.deepEqual(Object.keys(interruptoresEfectivos({ prima: true }, null)).sort(), ['datosCarretera', 'estadoAlDia', 'recordatoriosPendientes'])
})

test('resolución: fila del vehículo → defecto del dueño → defecto del código, campo a campo', () => {
  assert.deepEqual(interruptoresEfectivos(null, null), INTERRUPTORES_DEFECTO)
  assert.deepEqual(interruptoresEfectivos(null, { datosCarretera: false, estadoAlDia: true, recordatoriosPendientes: true }), {
    datosCarretera: false,
    estadoAlDia: true,
    recordatoriosPendientes: true,
  })
  // La excepción del vehículo gana al dueño; un campo corrupto del vehículo cae al del dueño.
  assert.deepEqual(
    interruptoresEfectivos({ datosCarretera: true, estadoAlDia: 'x', recordatoriosPendientes: false }, { datosCarretera: false, estadoAlDia: false, recordatoriosPendientes: true }),
    { datosCarretera: true, estadoAlDia: false, recordatoriosPendientes: false },
  )
})

test('el cuerpo del formulario exige los TRES booleanos: uno a medias no se completa con defectos', () => {
  assert.deepEqual(interruptoresDelCuerpo({ datosCarretera: true, estadoAlDia: false, recordatoriosPendientes: false, prima: true }), {
    datosCarretera: true,
    estadoAlDia: false,
    recordatoriosPendientes: false,
  })
  assert.equal(interruptoresDelCuerpo({ datosCarretera: true, estadoAlDia: false }), null)
  assert.equal(interruptoresDelCuerpo({ datosCarretera: 'true', estadoAlDia: false, recordatoriosPendientes: false }), null)
  assert.equal(interruptoresDelCuerpo(null), null)
})

test('sin teléfono verificado: `null` («pídenoslo»), nunca un número inventado', () => {
  const sinDatos: CanalCompania = { nombre: 'Rara', vias: [], sinDatos: true, verificadoEn: null }
  const e = { ...entradaEnvenenada({ tipo: 'persona' }), canal: sinDatos }
  assert.equal(vistaPublicaVehiculo(e, TODO_ENCENDIDO).carretera?.telefonos, null)
  assert.equal(vistaPublicaVehiculo({ ...e, canal: null }, TODO_ENCENDIDO).carretera?.telefonos, null)
  // `sinDatos: true` MANDA aunque traiga vías (fila incoherente): no se pinta un número no verificado.
  assert.equal(vistaPublicaVehiculo({ ...e, canal: { ...CANAL, sinDatos: true } }, TODO_ENCENDIDO).carretera?.telefonos, null)
  // Un WhatsApp sin enlace válido no se pinta (sería abrir un número que no existe).
  const malWa = { ...CANAL, vias: [{ tipo: 'whatsapp', numero: '+34600000000', enlace: 'javascript:alert(1)', horario: null, nota: null, soloRamos: null }] } as CanalCompania
  assert.equal(vistaPublicaVehiculo({ ...e, canal: malWa }, TODO_ENCENDIDO).carretera?.telefonos, null)
})

test('un semáforo que no es de la lista sale `no_sabemos`', () => {
  const e = { ...entradaEnvenenada({ tipo: 'persona' }), semaforos: { itv: 'verde', seguro: undefined } } as unknown as EntradaVistaPublica
  assert.deepEqual(vistaPublicaVehiculo(e, TODO_ENCENDIDO).estado, { itv: 'no_sabemos', seguro: 'no_sabemos' })
})

test('🚨 §7-5: sin fecha de matriculación la ITV es `no_sabemos`, NUNCA `al_dia`', () => {
  const sinFecha = itvDeVehiculo({ ramo: 'auto', matricula: null, matriculacionCompania: null, matriculacionDeclarada: null, hoy: HOY })
  assert.equal(semaforoItv(sinFecha), 'no_sabemos')
  assert.equal(semaforoItv(null), 'no_sabemos')
  // Matriculación ESTIMADA por la serie de la matrícula: tampoco es un «al día» publicable.
  const estimada = itvDeVehiculo({ ramo: 'auto', matricula: '1234MZZ', matriculacionCompania: null, matriculacionDeclarada: null, hoy: HOY })
  if (estimada.estado === 'calculada') assert.equal(estimada.fuente, 'estimada')
  assert.equal(semaforoItv(estimada), 'no_sabemos')
  // Un ciclo SUPUESTO (más de 4 años) tampoco.
  const ciclo = itvDeVehiculo({ ramo: 'auto', matricula: null, matriculacionCompania: haceAnios(7), matriculacionDeclarada: null, hoy: HOY })
  assert.equal(ciclo.estado === 'calculada' && ciclo.fiabilidad, 'ciclo_estimado')
  assert.equal(semaforoItv(ciclo), 'no_sabemos')
  // La PRIMERA ITV desde una matriculación firme sí tiene color.
  const nueva = itvDeVehiculo({ ramo: 'auto', matricula: null, matriculacionCompania: haceAnios(1), matriculacionDeclarada: null, hoy: HOY })
  assert.equal(semaforoItv(nueva), 'al_dia')
  const casi = itvDeVehiculo({ ramo: 'moto', matricula: null, matriculacionCompania: null, matriculacionDeclarada: dia(-(4 * 365 - 10)), hoy: HOY })
  assert.equal(semaforoItv(casi), 'vence_pronto')
})

test('🚨 §7-5: póliza no encontrada ≠ «sin seguro»; sin fecha o renovación sin confirmar → `no_sabemos`', () => {
  assert.equal(semaforoSeguro(null, HOY), 'no_sabemos')
  assert.equal(semaforoSeguro({ noVigente: false, fechaVencimiento: null }, HOY), 'no_sabemos')
  assert.equal(semaforoSeguro({ noVigente: false, fechaVencimiento: dia(-3) }, HOY), 'no_sabemos')
  assert.equal(semaforoSeguro({ noVigente: false, fechaVencimiento: dia(10) }, HOY), 'vence_pronto')
  assert.equal(semaforoSeguro({ noVigente: false, fechaVencimiento: dia(200) }, HOY), 'al_dia')
  assert.equal(semaforoSeguro({ noVigente: true, fechaVencimiento: dia(-40) }, HOY), 'vencido')
})

test('recordatorios: solo tipos de la lista y sin título; un tipo desconocido no sale', () => {
  const e = {
    ...entradaEnvenenada({ tipo: 'persona' }),
    recordatorios: [
      { tipo: 'neumaticos', vencido: true },
      { tipo: '<script>', vencido: false },
      { tipo: 'revision', vencido: 'si' },
    ],
  }
  assert.deepEqual(vistaPublicaVehiculo(e, TODO_ENCENDIDO).recordatorios, [
    { tipo: 'neumaticos', estado: 'vencido' },
    { tipo: 'revision', estado: 'pendiente' },
  ])
  // Sin fuente (F1): `null`, que la página calla — no «no hay recordatorios».
  assert.equal(vistaPublicaVehiculo({ ...e, recordatorios: null }, TODO_ENCENDIDO).recordatorios, null)
})
