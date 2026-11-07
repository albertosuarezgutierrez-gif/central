// Almacén de precios (fase 0): cepos de la proyección PURA y del cableado de los enganches. `node --test`.
// Un brazo por invariante: sin PII en la fila · idempotencia (caliente = barrido) · el enganche no lanza ni va dentro de la tx.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLAVES_PERFIL,
  COLUMNAS_OBSERVACION,
  aniosEntre,
  claveOrigen,
  huellasDeGrupo,
  motivoDeFallo,
  observacionesDeTarificacion,
  perfilLimpio,
  primaAnual,
  provinciaDeCp,
  tramoAnioConstruccion,
  tramoCapital,
  tramoEdadConductor,
  tramoM2,
  type PrecioParaObservar,
  type TarificacionParaObservar,
} from './observacion-precio.ts'

const CATALOGO = [
  { codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'Mapfre' },
  { codigoDgs: 'C0109', nombreComun: 'Allianz', nombreCima: 'Allianz' },
  { codigoDgs: 'C0468', nombreComun: 'Occident', nombreCima: 'Occident' },
  { codigoDgs: 'C0613', nombreComun: 'Reale', nombreCima: null },
]
const SECRETO = 'secreto-de-prueba-0123456789'

// Datos personales SINTÉTICOS que llegan en la petición de Avant2 / el riesgo del bot y JAMÁS pueden salir.
const PII = ['Pérez', 'Lucía', '12345678Z', '1234ABC', 'Calle Falsa', '1985-03-14', '2005-06-01', 'lucia@example.com', '600111222', 'VF1234567890']

function tAvant2(extra: Partial<TarificacionParaObservar> = {}): TarificacionParaObservar {
  return {
    id: '11111111-1111-1111-1111-111111111111', canal: 'codeoscopic', simulado: false, ramo: 'auto',
    creadoAt: '2026-11-05T10:00:00.000Z', fechaEfecto: '2026-12-01', codigoPostal: '41003',
    metrosCuadrados: null, anioConstruccion: null, capitalContinente: null, capitalContenido: null,
    oportunidadId: 'aaaaaaaa-0000-0000-0000-000000000001', polizaId: null, clienteId: 'cccccccc-0000-0000-0000-000000000001',
    peticion: {
      holder: { name: 'Lucía', surname: 'Pérez', identificationDocument: { number: '12345678Z' }, emails: ['lucia@example.com'], phones: ['600111222'] },
      risk: {
        registrationPlate: '1234ABC', vehicle: { code: 'VF1234567890' }, registrationDate: '2019-02-01', garageType: { id: 'PrivateGarage' },
        circulationAddress: { street: 'Calle Falsa', number: '1' },
        primaryDriver: { name: 'Lucía', surname: 'Pérez', birthDate: '1985-03-14', drivingLicenses: [{ type: 'B', date: '2005-06-01' }] },
      },
    },
    fallos: [
      { compania: 'Mapfre', producto: 'Auto', configuracion: 'Terceros', motivo: 'Error: 1234 - Riesgo no contratable por normas de suscripción. Lucía Pérez 12345678Z', tambienDioPrecio: false },
      { compania: 'Generali', producto: 'Auto', configuracion: null, motivo: 'Error: Se ha producido un error en el envío (Código 5000).', tambienDioPrecio: false },
      { compania: 'Reale', producto: 'Auto', configuracion: null, motivo: 'Error: Riesgo no asegurable', tambienDioPrecio: true },
    ],
    ...extra,
  }
}

function pAvant2(id: string, extra: Partial<PrecioParaObservar> = {}): PrecioParaObservar {
  return {
    id, compania: 'Occident', producto: 'Auto Plus', modalidad: 'Todo Riesgo Con Franquicia 300', categoria: 'Todo Riesgo Con Franquicia',
    primaEur: '512.37', franquiciaEur: 300, firmeza: 'estimado', coberturas: null, garantias: null,
    formaPago: 'Compañía', frecuenciaPago: 'Anual', meses: 12, referenciaVendor: null, ...extra,
  }
}

const ctx = (extra: Record<string, unknown> = {}) => ({ catalogo: CATALOGO, secreto: SECRETO, creadoPor: 'sistema:barrido', ...extra })

// ─── 🪤 Cepo 1 · SIN PII en la fila ─────────────────────────────────────────────────────────────────────────────

test('🪤 sin PII: ninguna fila lleva nombre, NIF, matrícula, bastidor, dirección, fechas de la persona, contacto ni el texto del vendor', () => {
  const obs = observacionesDeTarificacion(tAvant2(), [pAvant2('22222222-2222-2222-2222-222222222222')], ctx())
  assert.ok(obs.length >= 3)
  const json = JSON.stringify(obs)
  for (const dato of PII) assert.ok(!json.includes(dato), `la fila contiene «${dato}»`)
  assert.ok(!/contratable|suscripci|env[ií]o/i.test(json), 'el motivo del vendor viaja como texto')
  for (const o of obs) {
    assert.deepEqual(Object.keys(o).filter((k) => !(COLUMNAS_OBSERVACION as readonly string[]).includes(k)), [], 'columna fuera de la lista')
    for (const k of Object.keys(o.perfil)) assert.ok((CLAVES_PERFIL as readonly string[]).includes(k), `clave de perfil ${k}`)
    // Ni cliente, ni póliza, ni oportunidad: solo el id de la fila ORIGEN (tarificación/precio).
    assert.ok(![tAvant2().clienteId, tAvant2().oportunidadId].includes(o.origenId))
    if (o.motivoCodigo !== null) assert.match(o.motivoCodigo, /^[a-z0-9_]{1,60}$/)
  }
})

test('🪤 sin PII: el riesgo del bot en memoria solo aporta TRAMOS (nunca la fecha, la matrícula ni el tomador)', () => {
  const t: TarificacionParaObservar = { ...tAvant2(), canal: 'rpa', fallos: [], peticion: { ramo: 'auto', codigoPostal: '41003', seleccionVehiculo: { marca: 'SEAT', modelo: 'Ibiza' } } }
  const riesgo = { ramo: 'auto', matricula: '1234ABC', codigoPostal: '41003', conductor: { fechaNacimiento: '1985-03-14', fechaCarne: '2005-06-01', sexo: 'mujer' }, garajeNoche: true, documentoTomador: '12345678Z', datosTomador: { tipo: 'fisica', nombre: 'Lucía', apellido1: 'Pérez', apellido2: null, fechaNacimiento: '1985-03-14' } }
  const [o] = observacionesDeTarificacion(t, [pAvant2('33333333-3333-3333-3333-333333333333', { compania: 'allianz', frecuenciaPago: null, meses: null })], ctx({ riesgoRpa: riesgo, creadoPor: 'sistema:rpa' }))
  assert.ok(o)
  const json = JSON.stringify(o)
  for (const dato of PII) assert.ok(!json.includes(dato), `la fila contiene «${dato}»`)
  assert.deepEqual(o.perfil, { vehiculo_marca: 'seat', conductor_edad_tramo: '40-49', carne_antiguedad_tramo: '10+', garaje: 'si' })
})

test('perfilLimpio: cualquier clave fuera de la lista blanca se cae (la lista es la del CHECK de la migración)', () => {
  assert.deepEqual(perfilLimpio({ nif: '12345678Z', conductor_edad_tramo: '30-39', m2_tramo: '', garaje: 'si', fecha_nacimiento: '1985-03-14' }), { conductor_edad_tramo: '30-39', garaje: 'si' })
})

test('la lista blanca TS es EXACTAMENTE la del CHECK de 2026-11-07b_observaciones_precio.sql', () => {
  const sql = readFileSync(new URL('../prisma/sql/2026-11-07b_observaciones_precio.sql', import.meta.url), 'utf8')
  const bloque = /perfil - array\[([\s\S]*?)\]::text\[\]/.exec(sql)?.[1] ?? ''
  const enSql = [...bloque.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
  assert.deepEqual(enSql, [...CLAVES_PERFIL])
})

// ─── 🪤 Cepo 2 · Idempotencia ────────────────────────────────────────────────────────────────────────────────────

test('🪤 idempotencia: dos pasadas dan las MISMAS claves y huellas; caliente (con riesgo) = barrido (sin riesgo)', () => {
  const t: TarificacionParaObservar = { ...tAvant2(), canal: 'rpa', fallos: [], peticion: { ramo: 'auto', codigoPostal: '41003' } }
  const precios = [pAvant2('44444444-4444-4444-4444-444444444444', { compania: 'mapfre', modalidad: null, categoria: null, producto: 'Autos terceros ampliado', frecuenciaPago: null, meses: null })]
  const barrido = observacionesDeTarificacion(t, precios, ctx())
  const otra = observacionesDeTarificacion(t, precios, ctx())
  const caliente = observacionesDeTarificacion(t, precios, ctx({ creadoPor: 'sistema:rpa', riesgoRpa: { conductor: { fechaNacimiento: '1990-01-01', fechaCarne: '2010-01-01' } } }))
  const llave = (xs: typeof barrido) => xs.map((o) => `${o.claveOrigen}#${o.huellaValores}`)
  assert.deepEqual(llave(barrido), llave(otra))
  assert.deepEqual(llave(caliente), llave(barrido))
  assert.notDeepEqual(caliente[0]!.perfil, barrido[0]!.perfil, 'el perfil difiere y NO entra en la huella')
  // Sin secreto cambian los HMAC (a NULL) pero no la huella.
  assert.deepEqual(llave(observacionesDeTarificacion(t, precios, ctx({ secreto: null }))), llave(barrido))
})

test('idempotencia: un valor distinto (prima corregida) = MISMA clave, huella NUEVA (versión, no duplicado)', () => {
  const a = observacionesDeTarificacion(tAvant2({ fallos: null }), [pAvant2('55555555-5555-5555-5555-555555555555')], ctx())[0]!
  const b = observacionesDeTarificacion(tAvant2({ fallos: null }), [pAvant2('55555555-5555-5555-5555-555555555555', { primaEur: 499 })], ctx())[0]!
  assert.equal(a.claveOrigen, b.claveOrigen)
  assert.notEqual(a.huellaValores, b.huellaValores)
  assert.equal(a.claveOrigen, claveOrigen('avant2', 'tarificacion_precios', '55555555-5555-5555-5555-555555555555', ''))
})

// ─── 🪤 Cepo 3 · El enganche no lanza y va DESPUÉS del commit ──────────────────────────────────────────────────

const fuente = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

test('🪤 Avant2: el enganche va en guardarSinTumbar tras anotarIncoherencias, solo si no es simulada, con .catch y antes de «guardada»', () => {
  const src = fuente('./codeoscopic/cotizaciones.ts')
  const cuerpo = src.slice(src.indexOf('export async function guardarSinTumbar'), src.indexOf('export async function anotarIncoherencias'))
  const i = cuerpo.indexOf('anotarObservacionesTarificacion(')
  assert.ok(i > cuerpo.indexOf('await guardarCotizacion(') && i > cuerpo.indexOf('anotarIncoherencias(e'), 'después del commit y de las incoherencias')
  assert.ok(i < cuerpo.indexOf("return { estado: 'guardada'"))
  assert.match(cuerpo, /if \(!e\.simulado\) await anotarObservacionesTarificacion\(e\.correduriaId, cotizacionId, \{ creadoPor: 'sistema:avant2' \}\)\.catch\(\(\) => null\)/)
})

test('🪤 bots: el enganche va FUERA de la transacción de registrarResultado, solo con ok + tarificación, con el riesgo en memoria y .catch', () => {
  const src = fuente('./tarificador.ts')
  const reg = src.slice(src.indexOf('export async function registrarResultado'), src.indexOf('async function guardarTarificacionRpa'))
  const i = reg.indexOf('anotarObservacionesTarificacion(')
  assert.ok(i > reg.indexOf('const refOk = referenciaOk'), 'después de cerrar la transacción (y de la purga del riesgo en BD)')
  assert.ok(i < reg.indexOf('guardarPasos(prisma'))
  assert.match(reg, /interno\.res\.estadoTrabajo === 'ok' && interno\.res\.tarificacionId && interno\.traza\) \{\n\s+await anotarObservacionesTarificacion\(interno\.traza\.t\.correduria_id, interno\.res\.tarificacionId, \{ creadoPor: 'sistema:rpa', riesgoRpa: interno\.traza\.t\.riesgo \}\)\.catch\(\(\) => null\)/)
})

test('🪤 el escritor no lanza: todo el cuerpo de anotarObservacionesTarificacion va en try/catch y los cerrojos van antes de leer', () => {
  const src = fuente('./observaciones-precio.ts')
  const cuerpo = src.slice(src.indexOf('export async function anotarObservacionesTarificacion'), src.indexOf('// ─── Barrido nocturno'))
  const abre = cuerpo.indexOf('{\n  try {')
  assert.ok(abre > 0 && abre < cuerpo.indexOf('estadoAlmacen()'), 'el try abre el cuerpo')
  assert.match(cuerpo, /\} catch \(e\) \{[\s\S]*registrarErrorCartera\([\s\S]*return \{ escritas: 0, omitidas: 0, estado: 'error'/)
  assert.ok(cuerpo.indexOf('estadoAlmacen()') < cuerpo.indexOf('leerTarificaciones('), 'cerrojos antes de leer')
  // Los cerrojos: interruptor y secreto SIN fallback, por este orden y antes de mirar la tabla.
  const cerrojos = src.slice(src.indexOf('export function cerrojosSinBd'), src.indexOf('export const hayObservacionesPrecio'))
  assert.match(cerrojos, /env\[ENV_ACTIVO\] !== '1'/)
  assert.match(cerrojos, /requireSecret\(ENV_SECRETO\)/)
  assert.doesNotMatch(cerrojos, /requireSecret\(ENV_SECRETO,/, 'sin fallback')
})

test('el escritor no lee copias (oportunidad_oferta / presupuesto_opcion) y toda sentencia va por correduría', () => {
  const src = fuente('./observaciones-precio.ts')
  assert.doesNotMatch(src, /oportunidad_oferta|presupuesto_opcion/)
  const sentencias = src.match(/\$(queryRaw|executeRaw)<?[^`]*`[^`]*`/g) ?? []
  assert.ok(sentencias.length >= 6)
  for (const s of sentencias) if (/seguros\.(tarificaciones|observaciones_precio)/.test(s)) assert.match(s, /correduria_id = \$\{correduriaId\}::uuid/, s.slice(0, 90))
})

// ─── Reglas ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('prima anual: Avant2 anual (o sin frecuencia guardada) → céntimos; fraccionada o plazo ≠ 12 → NO es precio (no se supone)', () => {
  assert.deepEqual(primaAnual('avant2', { primaEur: '512.37', meses: 12, frecuenciaPago: 'Anual' }), { ok: true, cents: 51237, formaPago: 'anual' })
  assert.deepEqual(primaAnual('avant2', { primaEur: 300, meses: null, frecuenciaPago: null }), { ok: true, cents: 30000, formaPago: null })
  assert.deepEqual(primaAnual('avant2', { primaEur: 300, meses: 6, frecuenciaPago: 'Anual' }), { ok: false, motivo: 'prima_no_anual_sin_verificar', formaPago: 'anual' })
  assert.deepEqual(primaAnual('avant2', { primaEur: 30, meses: 12, frecuenciaPago: 'Mensual' }), { ok: false, motivo: 'prima_no_anual_sin_verificar', formaPago: 'mensual' })
  assert.deepEqual(primaAnual('avant2', { primaEur: 0, meses: 12, frecuenciaPago: 'Anual' }).ok, false)
  assert.deepEqual(primaAnual('rpa', { primaEur: 410.5, meses: null, frecuenciaPago: null }, 'anual'), { ok: true, cents: 41050, formaPago: 'anual' })
})

test('rechazos: solo lo que la compañía AFIRMA; error técnico/de datos y lo no reconocido = no concluyente', () => {
  assert.deepEqual(motivoDeFallo('Error: 1234 - Riesgo no contratable por normas de suscripción.'), { resultado: 'rechazo_compania', codigo: 'riesgo_no_aceptado' })
  assert.deepEqual(motivoDeFallo('Error: 123. Riesgo no contratable.'), { resultado: 'rechazo_compania', codigo: 'riesgo_no_aceptado' })
  assert.deepEqual(motivoDeFallo('Error: Riesgo no asegurable'), { resultado: 'rechazo_compania', codigo: 'riesgo_no_aceptado' })
  assert.deepEqual(motivoDeFallo('Error: No se puede contratar. Si desea que realicemos un contrato personalizado'), { resultado: 'rechazo_compania', codigo: 'riesgo_no_aceptado' })
  assert.deepEqual(motivoDeFallo('Error: NO SE PERMITEN POLIZAS CON MALUS'), { resultado: 'rechazo_compania', codigo: 'malus' })
  assert.deepEqual(motivoDeFallo('Error: Vehículo no permitido.'), { resultado: 'rechazo_compania', codigo: 'vehiculo_no_aceptado' })
  assert.deepEqual(motivoDeFallo('Error: Vehículo no disponible.'), { resultado: 'sin_precio_no_concluyente', codigo: 'vehiculo_no_disponible' })
  assert.deepEqual(motivoDeFallo('Error: Se ha producido un error en el envío (Código 5000). Por favor contacte con el departamento'), { resultado: 'sin_precio_no_concluyente', codigo: 'error_tecnico' })
  assert.deepEqual(motivoDeFallo('Error: No se ha podido comprobar la equivalencia del c�digo'), { resultado: 'sin_precio_no_concluyente', codigo: 'error_tecnico' })
  assert.deepEqual(motivoDeFallo('Error: El número de póliza en la compañía anterior debe tener 8 caracteres'), { resultado: 'sin_precio_no_concluyente', codigo: 'datos_invalidos' })
  assert.deepEqual(motivoDeFallo('Error: El valor informado en previousInsurancePolicy es incorrecto.'), { resultado: 'sin_precio_no_concluyente', codigo: 'datos_invalidos' })
  assert.deepEqual(motivoDeFallo('algo nuevo'), { resultado: 'sin_precio_no_concluyente', codigo: 'no_clasificado' })
  assert.deepEqual(motivoDeFallo(null), { resultado: 'sin_precio_no_concluyente', codigo: 'no_clasificado' })
})

test('fallos NULL (anterior al 29/09) = NINGÚN rechazo; «también dio precio» no es rechazo', () => {
  const sinFallos = observacionesDeTarificacion(tAvant2({ fallos: null }), [], ctx())
  assert.deepEqual(sinFallos, [])
  const obs = observacionesDeTarificacion(tAvant2(), [], ctx())
  assert.deepEqual(obs.map((o) => [o.companiaTexto, o.resultado, o.motivoCodigo]), [
    ['Mapfre', 'rechazo_compania', 'riesgo_no_aceptado'],
    ['Generali', 'sin_precio_no_concluyente', 'error_tecnico'],
  ])
  assert.equal(obs[0]!.origenTabla, 'tarificaciones')
  assert.equal(obs[0]!.companiaDgs, 'C0058')
  assert.equal(obs[1]!.companiaDgs, null, 'Generali no está en el catálogo de prueba: se guarda igual, sin resolver')
  assert.equal(obs[1]!.companiaResolucion, 'sin_resolver')
})

test('simulada o canal desconocido → nada', () => {
  assert.deepEqual(observacionesDeTarificacion(tAvant2({ simulado: true }), [pAvant2('66666666-6666-6666-6666-666666666666')], ctx()), [])
  assert.deepEqual(observacionesDeTarificacion(tAvant2({ canal: 'otro' }), [pAvant2('66666666-6666-6666-6666-666666666666')], ctx()), [])
})

test('un precio Avant2: DGS, nivel por categoría (versión 1), céntimos, provincia, fecha y grupo opaco', () => {
  const [o] = observacionesDeTarificacion(tAvant2({ fallos: [] }), [pAvant2('77777777-7777-7777-7777-777777777777')], ctx())
  assert.ok(o)
  assert.equal(o.resultado, 'precio')
  assert.equal(o.companiaDgs, 'C0468')
  assert.equal(o.primaAnualCents, 51237)
  assert.equal(o.franquiciaCents, 30000)
  assert.equal(o.nivel, 'Todo riesgo con franquicia')
  assert.equal(o.nivelFuente, 'categoria')
  assert.equal(o.nivelVersion, 1)
  assert.equal(o.provincia, '41')
  assert.equal(o.fechaEfecto, '2026-12-01')
  assert.equal(o.observadaAt, '2026-11-05T10:00:00.000Z')
  assert.equal(o.coherencia, 'ok')
  assert.match(o.grupoComparacion!, /^[0-9a-f]{64}$/)
  assert.deepEqual(o.perfil, { conductor_edad_tramo: '40-49', carne_antiguedad_tramo: '10+', vehiculo_antiguedad_tramo: '6-10', garaje: 'si' })
})

test('grupo de comparación: bot y Avant2 del MISMO encargo caen en el mismo grupo; otra oportunidad, en otro; sin secreto, NULL', () => {
  const a = huellasDeGrupo(tAvant2(), 'auto', SECRETO)
  const b = huellasDeGrupo({ ...tAvant2(), canal: 'rpa', peticion: { ramo: 'auto' } }, 'auto', SECRETO)
  const c = huellasDeGrupo(tAvant2({ oportunidadId: 'aaaaaaaa-0000-0000-0000-000000000002' }), 'auto', SECRETO)
  assert.equal(a.grupoComparacion, b.grupoComparacion)
  assert.notEqual(a.grupoComparacion, c.grupoComparacion)
  assert.deepEqual(huellasDeGrupo(tAvant2(), 'auto', null), { grupoComparacion: null, anclaRiesgo: null, riesgoHuella: null })
  assert.equal(huellasDeGrupo(tAvant2({ oportunidadId: null, polizaId: null, clienteId: null }), 'auto', SECRETO).grupoComparacion, null)
})

test('tramos (los del diseño §1.2)', () => {
  assert.equal(aniosEntre('1985-03-14', '2026-03-13'), 40)
  assert.equal(aniosEntre('1985-03-14', '2026-03-14'), 41)
  assert.equal(tramoEdadConductor(17), null)
  assert.equal(tramoEdadConductor(24), '18-24')
  assert.equal(tramoEdadConductor(70), '70+')
  assert.equal(tramoM2(59), '<60')
  assert.equal(tramoM2(180), '180+')
  assert.equal(tramoM2(null), null)
  assert.equal(tramoAnioConstruccion(1978), '1970-1979')
  assert.equal(tramoCapital(130_000, 25_000), '125000-149999')
  assert.equal(tramoCapital(0, 10_000), null)
  assert.equal(provinciaDeCp('41003'), '41')
  assert.equal(provinciaDeCp('99000'), null)
})
