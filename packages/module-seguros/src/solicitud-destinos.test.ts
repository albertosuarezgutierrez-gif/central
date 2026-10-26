// Cepo de coherencia (26/10/2026): cada pregunta del enlace de datos tiene destino en el modelo del riesgo de su ramo
// (o en la ficha), y las opciones de hogar casan con valores que el modelo y Codeoscopic aceptan.
import test from 'node:test'
import assert from 'node:assert/strict'
import { RAMOS_OPORTUNIDAD } from './oportunidad-seguimiento.ts'
import { calcularEdicionRiesgo, claveDatosDeRamo } from './datos-riesgo-ramo.ts'
import { GARAJES_CONOCIDOS } from './garajes.ts'
import { ID_GARAJE_SOLICITUD, planEscrituraRiesgo, propuestaRiesgoDeSolicitud } from './solicitud-riesgo.ts'
import { validarDatosViviendaRiesgo } from './datos-vivienda-riesgo.ts'
import { GARAJES_SOLICITUD, NADA_CONOCIDO, TRAMOS_CONTENIDO, TRAMOS_CONTINENTE, camposSolicitud, claveVehiculo, conIdentidad, grupoSolicitud, validarRespuestas, type CampoSolicitud, type ConocidoFicha, type RamoSolicitud } from './solicitud-datos.ts'
import {
  ALARMA_ID_CODEOSCOPIC, DESTINOS_HOGAR, HUECOS_PERMITIDOS, IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS, OPCIONES_HOGAR_A_VIVIENDA, PREGUNTAS_HOGAR_26_10,
  camposDelBloque, destinoCampoSolicitud,
} from './solicitud-destinos.ts'
import { CLAVES_BLOQUE_DIRECCION, CLAVES_SUELTAS_VIVIENDA, planEscrituraVivienda, viviendaDeSolicitud } from './solicitud-hogar.ts'

const TODO: ConocidoFicha = { dni: true, fechaNacimiento: true, codigoPostal: true, carnetMoto: true, carnetCoche: true }
const COLUMNAS = new Set(['dni', 'fecha_nacimiento', 'codigo_postal', 'cliente_carnets_conducir'])

/**
 * Un hueco (`solo_solicitud`) solo vale con un MOTIVO de verdad: «qué: por qué», de al menos 40 caracteres. Un motivo de
 * relleno («pendiente», «TODO», «-») o vacío es un olvido disfrazado de decisión.
 */
function motivoValido(m: string): boolean {
  const t = m.trim()
  return t.length >= 40 && t.includes(':') && !/^(pendiente|todo|tbd|n\/a|-+|\.+)\b/i.test(t)
}

test('motivoValido: el cepo distingue un motivo escrito de uno de relleno', () => {
  assert.equal(motivoValido(''), false)
  assert.equal(motivoValido('pendiente'), false)
  assert.equal(motivoValido('TODO: ya lo pensaremos más adelante con calma y cuidado'), false)
  assert.equal(motivoValido('comentario del cliente: texto libre que se lee en el aviso, no es del riesgo'), true)
})

test('TODO ramo: cada campo del enlace tiene destino declarado, y el del riesgo existe en el bloque de su ramo', () => {
  const malos: string[] = []
  for (const ramo of RAMOS_OPORTUNIDAD) {
    const bloque = claveDatosDeRamo(ramo)
    const campos = new Set(camposDelBloque(bloque, ramo))
    for (const conocido of [NADA_CONOCIDO, TODO]) {
      for (const c of conIdentidad(camposSolicitud(ramo, conocido))) {
        const d = destinoCampoSolicitud(ramo, c.clave)
        if (d === null) malos.push(`${ramo}.${c.clave}: sin destino declarado`)
        else if (d.en === 'riesgo' && !campos.has(d.campo)) malos.push(`${ramo}.${c.clave} → ${bloque}.${d.campo}: ese campo no existe`)
        else if (d.en === 'ficha' && !COLUMNAS.has(d.columna)) malos.push(`${ramo}.${c.clave} → clientes.${d.columna}: columna desconocida`)
        else if (d.en === 'solo_solicitud' && !HUECOS_PERMITIDOS.has(c.clave)) malos.push(`${ramo}.${c.clave}: hueco no permitido (dale campo en ${bloque} o en la ficha)`)
        else if (d.en === 'solo_solicitud' && !motivoValido(d.motivo)) malos.push(`${ramo}.${c.clave}: hueco sin motivo escrito («${d.motivo}»)`)
      }
    }
  }
  assert.deepEqual([...new Set(malos)], [])
})

test('HOGAR: ninguna pregunta nueva crea un nombre propio (todas a `datosVivienda`) y todas se preguntan', () => {
  const claves = camposSolicitud('hogar', NADA_CONOCIDO).map((c) => c.clave)
  for (const k of PREGUNTAS_HOGAR_26_10) {
    assert.ok(claves.includes(k), `${k} no se pregunta`)
    assert.equal(DESTINOS_HOGAR[k]?.en, 'riesgo', `${k} sin campo en datosVivienda`)
  }
})

test('HOGAR: cada opción tiene su clave canónica y solo ids ATESTIGUADOS de Codeoscopic', () => {
  const campos = camposSolicitud('hogar', NADA_CONOCIDO)
  const ids = new Set<string>(IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS)
  for (const [clave, m] of Object.entries(OPCIONES_HOGAR_A_VIVIENDA)) {
    const c = campos.find((x) => x.clave === clave)
    assert.ok(c?.opciones, `${clave} no es una opción del formulario`)
    assert.equal((DESTINOS_HOGAR[clave] as { campo?: string }).campo, m.campo, `${clave} va a otro campo`)
    for (const o of c.opciones) assert.ok(Object.hasOwn(m.canonica, o.valor), `${clave}=${o.valor} sin clave canónica`)
    for (const v of Object.keys(m.canonica)) assert.ok(c.opciones.some((o) => o.valor === v), `${clave}: ${v} ya no es opción`)
    for (const id of Object.values(m.idCodeoscopic)) assert.ok(ids.has(id), `${clave}: id ${id} no atestiguado`)
  }
  for (const id of Object.values(ALARMA_ID_CODEOSCOPIC)) assert.ok(ids.has(id))
})

const AHORA = '2026-10-26T10:00:00Z'
const COMPLETO = {
  dni: '12345678Z', fechaNacimiento: '01/02/1980',
  viviendaCp: '41003', viviendaProvincia: 'SEVILLA', viviendaMunicipio: 'SEVILLA', viviendaCalle: 'Calle Socorro', viviendaNumero: '24',
  viviendaPlanta: '2', viviendaPuerta: 'B',
  tipoVivienda: 'piso', habitaciones: '3', regimen: 'propietario', propietarioEsTomador: true, usoVivienda: 'habitual', urbanizacionCerrada: false,
  conMadera: false, anioUltimaReforma: '2015', alarma: false, puertaPrincipalBlindada: true, ventanasSeguras: true, vigilante: false,
  confirmaCatastro: false, metrosCuadrados: '85', anioConstruccion: '1998',
  tramoContenido: '15000_30000', tramoContinente: '80000_150000', joyasEnCajaFuerte: '0', joyasFueraDeCaja: '1500', objetosDeValor: '0', perrosPeligrosos: '0',
  hipoteca: true, paraBanco: true, entidadHipoteca: 'Caixabank', tieneSeguro: false,
}

test('HOGAR: con todo contestado, cada destino `riesgo` llega a `datosVivienda` y el modelo lo acepta', () => {
  const v = validarRespuestas(camposSolicitud('hogar', NADA_CONOCIDO), COMPLETO, new Date(AHORA))
  assert.ok(v.ok, JSON.stringify(v))
  if (!v.ok) return
  const out = viviendaDeSolicitud(v.respuestas, null, AHORA)
  for (const [clave, d] of Object.entries(DESTINOS_HOGAR)) {
    if (d.en === 'riesgo') assert.ok(d.campo in out, `${clave} → ${d.campo} no se escribe`)
  }
  assert.equal(out.uso, 'Owner')
  assert.equal(out.ocupacion, 'MainResidence')
  assert.equal(out.tipoVivienda, 'MiddleFloor')
  assert.equal(out.alarma, 'NoAlarm')
  assert.equal(out.joyasEnCajaFuerte, 0, 'el 0 declarado es un dato')
  assert.equal(out.capitalContenido, 30_000, 'el tramo se anota por su techo')
  const modelo = validarDatosViviendaRiesgo(out, { hoy: AHORA.slice(0, 10) })
  assert.ok(modelo.ok, JSON.stringify(modelo))
  // Y el plan de escritura lo deja pasar sobre un riesgo vacío.
  const plan = planEscrituraVivienda(null, out)
  for (const k of [...CLAVES_SUELTAS_VIVIENDA, ...CLAVES_BLOQUE_DIRECCION]) if (k in out) assert.ok(k in plan.escribir, `${k} no pasa el plan`)
})

test('HOGAR: lo no contestado y los valores sin id atestiguado NO se escriben (null = no se sabe)', () => {
  const out = viviendaDeSolicitud({ regimen: 'inquilino', usoVivienda: 'secundaria', tipoVivienda: 'atico', alarma: true, conMadera: null, joyasEnCajaFuerte: null }, null, AHORA)
  assert.equal(out.uso, 'Tenant')
  for (const k of ['ocupacion', 'tipoVivienda', 'alarma', 'conMadera', 'joyasEnCajaFuerte', 'vigilante', 'habitaciones']) assert.ok(!(k in out), k)
  // Lo que ya escribió la correduría manda.
  const plan = planEscrituraVivienda({ puertaPrincipalBlindada: false, habitaciones: 4 }, { puertaPrincipalBlindada: true, habitaciones: 3, vigilante: true })
  assert.deepEqual(plan.escribir, { vigilante: true })
})

test('TRAMOS: todo tramo tiene mapeo (importe que el modelo acepta, o null declarado), en formato español y creciente', () => {
  const capital = (k: 'capitalContenido' | 'capitalContinente', v: number) => validarDatosViviendaRiesgo({ [k]: v }, { hoy: AHORA.slice(0, 10) }).ok
  const campos = camposSolicitud('hogar', NADA_CONOCIDO)
  for (const [clave, tramos, destino] of [['tramoContenido', TRAMOS_CONTENIDO, 'capitalContenido'], ['tramoContinente', TRAMOS_CONTINENTE, 'capitalContinente']] as const) {
    assert.equal((DESTINOS_HOGAR[clave] as { campo: string }).campo, destino)
    const c = campos.find((x) => x.clave === clave)
    assert.deepEqual(c?.opciones?.map((o) => o.valor), tramos.map((t) => t.valor), `${clave}: opciones ≠ catálogo`)
    let previo = 0
    for (const t of tramos) {
      assert.ok('importe' in t, `${clave}.${t.valor} sin mapeo`)
      if (t.importe !== null) {
        assert.ok(capital(destino, t.importe), `${clave}.${t.valor}: el modelo no acepta ${t.importe}`)
        assert.ok(t.importe > previo, `${clave}: tramos desordenados`)
        previo = t.importe
      }
      for (const n of t.etiqueta.match(/\d[\d.]*€/g) ?? []) assert.match(n, /^\d{1,3}(\.\d{3})*€$/, `${t.etiqueta}: formato`)
    }
    assert.ok(tramos.some((t) => t.valor === 'calcular' && t.importe === null), `${clave}: falta «que me lo calculen»`)
  }
})

test('ÚLTIMO PISO ≠ ÁTICO: un último piso numérico confirmado se anota como planta + `ultimoPiso` (campo del modelo), nunca como ático ni planta intermedia', () => {
  assert.ok(camposDelBloque('datosVivienda').includes('ultimoPiso'), '`datosVivienda` no tiene `ultimoPiso`')
  const r = { confirmaCatastro: true, tipoVivienda: 'piso', viviendaCp: '41003', viviendaCalle: 'Calle Socorro', viviendaNumero: '24', viviendaPlanta: '2' }
  const out = viviendaDeSolicitud(r, null, AHORA, { tipo: 'piso', ultimoPiso: 'ultimo' })
  assert.equal(out.ultimoPiso, true)
  assert.equal(out.planta, '2')
  assert.ok(!('tipoVivienda' in out), 'ni «ático» ni «MiddleFloor» (planta intermedia): no se sabe el id')
  assert.ok(validarDatosViviendaRiesgo(out, { hoy: AHORA.slice(0, 10) }).ok, 'el modelo lo acepta')
  assert.ok('ultimoPiso' in planEscrituraVivienda(null, out).escribir, 'el plan lo deja pasar')
  // Sin confirmar la tarjeta, o un piso intermedio: nada de último piso.
  assert.ok(!('ultimoPiso' in viviendaDeSolicitud({ ...r, confirmaCatastro: false }, null, AHORA, { tipo: 'piso', ultimoPiso: 'ultimo' })))
  assert.equal(viviendaDeSolicitud(r, null, AHORA, { tipo: 'piso', ultimoPiso: 'no_ultimo' }).tipoVivienda, 'MiddleFloor')
  // Todo lo que propone el enlace existe en `datosVivienda` (ningún nombre propio).
  const campos = new Set(camposDelBloque('datosVivienda'))
  for (const k of Object.keys(out)) assert.ok(campos.has(k), `${k} no existe en datosVivienda`)
})

// ─── Fase 2 (26/10/2026): el resto de ramos escribe DE VERDAD en su bloque ─────────────────────────────────────────

/** Una respuesta válida para cada campo (lo que contestaría un cliente que lo sabe todo). */
function respuestaDe(c: CampoSolicitud): Record<string, unknown> {
  if (c.tipo === 'vehiculo_catalogo') {
    return { [claveVehiculo(c.clave, 'MarcaId')]: '7', [claveVehiculo(c.clave, 'ModeloId')]: '88', [claveVehiculo(c.clave, 'MotorId')]: 'Gasoline', [claveVehiculo(c.clave, 'Codigo')]: 'ABC123', [claveVehiculo(c.clave, 'Version')]: '1.0 TSI 95 CV' }
  }
  const texto: Record<string, string> = {
    dni: '12345678Z', codigoPostal: '41003', matricula: '1234 BCD', edades: '45, 43 y 12', microchip: '941 000 012 345 678',
    marca: 'Seat', modelo: 'Ibiza', companiaActual: 'Mapfre', entidadHipoteca: 'Caixabank', profesion: 'Fontanero', razaMascota: 'Mestizo',
  }
  const numero: Record<string, number> = { personasAsegurar: 3, kmAnuales: 12000, aniosSinSiniestros: 0, capitalDeseado: 150000, capitalPendienteHipoteca: 90000 }
  switch (c.tipo) {
    case 'si_no': return { [c.clave]: true }
    case 'numero': return { [c.clave]: numero[c.clave] ?? 1 }
    case 'fecha': return { [c.clave]: c.clave === 'fechaNacimiento' ? '01/02/1980' : c.soloFutura ? '2030-01-01' : c.clave === 'vencimientoActual' ? '2027-03-01' : '2020-05-17' }
    case 'opcion': return { [c.clave]: c.opciones?.[0]?.valor }
    case 'texto_largo': return { [c.clave]: c.clave === 'descripcionRiesgo' ? 'Responsabilidad civil de una actividad de jardinería con dos empleados' : 'Gracias' }
    default: return { [c.clave]: texto[c.clave] ?? 'Texto' }
  }
}

const NO_HOGAR = RAMOS_OPORTUNIDAD.filter((r) => grupoSolicitud(r as RamoSolicitud) !== 'hogar')

test('FASE 2, todo ramo menos hogar: con todo contestado, CADA destino `riesgo` llega a la propuesta y el modelo la acepta', () => {
  const malos: string[] = []
  for (const ramo of NO_HOGAR) {
    for (const conocido of [NADA_CONOCIDO, TODO]) {
      const campos = conIdentidad(camposSolicitud(ramo, conocido))
      const entrada = Object.assign({}, ...campos.map(respuestaDe))
      const v = validarRespuestas(campos, entrada, new Date(AHORA))
      if (!v.ok) { malos.push(`${ramo}: no valida ${JSON.stringify(v.errores)}`); continue }
      const p = propuestaRiesgoDeSolicitud(ramo, v.respuestas)
      if (!p) { malos.push(`${ramo}: sin propuesta`); continue }
      assert.equal(p.clave, claveDatosDeRamo(ramo))
      for (const c of campos) {
        const d = destinoCampoSolicitud(ramo, c.clave)
        if (d?.en === 'riesgo' && !(d.campo in p.propuesta)) malos.push(`${ramo}.${c.clave} → ${p.clave}.${d.campo}: no se escribe`)
      }
      // Sobre un riesgo vacío, el plan lo deja pasar entero y el modelo del bloque lo acepta.
      const plan = planEscrituraRiesgo(p.clave, null, p.propuesta)
      assert.deepEqual(plan.escribir, p.propuesta, `${ramo}: el plan recorta sobre un riesgo vacío`)
      const e = calcularEdicionRiesgo({ ramo, clave: p.clave, info: {}, parcial: plan.escribir, confirmar: false, ahora: AHORA, hoy: AHORA.slice(0, 10) })
      if (!e.ok) malos.push(`${ramo}: el modelo rechaza ${JSON.stringify(e.errores)}`)
    }
  }
  assert.deepEqual([...new Set(malos)], [])
})

test('FASE 2: lo no contestado y «No lo sé» NO se escriben (null = no se sabe)', () => {
  assert.deepEqual(propuestaRiesgoDeSolicitud('moto', { matricula: null, tieneSeguro: null, aniosSinSiniestros: null, garaje: null })?.propuesta, {})
  assert.deepEqual(propuestaRiesgoDeSolicitud('vida', { capitalDeseado: null, fumador: null, hipoteca: null, paraBanco: true })?.propuesta, {})
  assert.deepEqual(propuestaRiesgoDeSolicitud('salud', { personasAsegurar: null, edades: null })?.propuesta, {})
  assert.deepEqual(propuestaRiesgoDeSolicitud('mascotas', { especieMascota: null, ppp: null })?.propuesta, {})
  // Lo que cuelga de un «no» no se escribe: sin seguro no hay compañía; sin hipoteca no hay banco.
  assert.deepEqual(propuestaRiesgoDeSolicitud('auto', { tieneSeguro: false, companiaActual: 'Mapfre' })?.propuesta, { aseguradoAntes: false })
  assert.deepEqual(propuestaRiesgoDeSolicitud('vida', { hipoteca: false, paraBanco: true, entidadHipoteca: 'BBVA' })?.propuesta, { hipoteca: false })
  // El 0 declarado es un dato.
  assert.equal(propuestaRiesgoDeSolicitud('auto', { aniosSinSiniestros: 0 })?.propuesta.aniosSinSiniestros, 0)
})

test('FASE 2: el plan escribe por bloques, solo donde no había, y nunca sobre un bloque confirmado', () => {
  const p = propuestaRiesgoDeSolicitud('auto', { matricula: '1234BCD', marca: 'Seat', modelo: 'Ibiza', tieneSeguro: true, companiaActual: 'Mapfre', aniosSinSiniestros: 4, kmAnuales: 9000 })!.propuesta
  // Confirmado: nada.
  assert.deepEqual(planEscrituraRiesgo('datosVehiculo', {}, p, '2026-10-01T10:00:00Z'), { escribir: {}, conflictos: [], confirmado: true })
  // Otro seguro guardado: el bloque del historial no se toca y se avisa; lo demás, sí.
  const otro = planEscrituraRiesgo('datosVehiculo', { companiaAnterior: 'Allianz', aseguradoAntes: true }, p)
  assert.ok(!('companiaAnterior' in otro.escribir) && !('aniosSinSiniestros' in otro.escribir), 'el historial va en bloque')
  assert.equal(otro.escribir.kmAnuales, 9000)
  assert.equal(otro.conflictos.length, 1)
  // Otra matrícula = otro vehículo: no se toca nada del vehículo.
  const otraMat = planEscrituraRiesgo('datosVehiculo', { matricula: '9999ZZZ' }, p)
  assert.deepEqual(otraMat.escribir, {})
  assert.match(otraMat.conflictos[0] ?? '', /otro vehículo/)
  // Con una versión ya elegida, marca/modelo en texto no se escriben (borrarían esa versión).
  assert.ok(!('marca' in planEscrituraRiesgo('datosVehiculo', { codigoVehiculo: 'X1' }, p).escribir))
  // Lo que ya escribió la correduría manda (suelto): no se pisa ni se avisa.
  assert.ok(!('kmAnuales' in planEscrituraRiesgo('datosVehiculo', { kmAnuales: 20000 }, p).escribir))
  // Capital: la hipoteca en bloque.
  const h = propuestaRiesgoDeSolicitud('vida', { hipoteca: true, paraBanco: true, entidadHipoteca: 'BBVA', capitalPendienteHipoteca: 80000, fumador: false })!.propuesta
  const ph = planEscrituraRiesgo('datosCapital', { bancoHipoteca: 'Santander' }, h)
  assert.deepEqual(ph.escribir, { fumador: false })
  assert.equal(ph.conflictos.length, 1)
})

test('FASE 2: garaje → solo ids de Codeoscopic VISTOS, y cada opción del enlace tiene el suyo', () => {
  for (const o of GARAJES_SOLICITUD) {
    const id = (ID_GARAJE_SOLICITUD as Record<string, string>)[o.valor]
    assert.ok(id, `${o.valor} sin id`)
    assert.ok(Object.hasOwn(GARAJES_CONOCIDOS, id), `${o.valor} → ${id}: id no visto`)
  }
})

test('FASE 2: el buscador del catálogo va entero o no va (ids sueltos no se escriben)', () => {
  const r = { versionCatalogoMarcaId: '7', versionCatalogoModeloId: '88', versionCatalogoMotorId: null, versionCatalogoCodigo: 'ABC', versionCatalogoVersion: null }
  assert.ok(!('codigoVehiculo' in propuestaRiesgoDeSolicitud('auto', r)!.propuesta))
  const campos = camposSolicitud('auto', NADA_CONOCIDO)
  const v = validarRespuestas(campos.filter((c) => c.clave === 'versionCatalogo'), { versionCatalogoMarcaId: '7', versionCatalogoModeloId: '88', versionCatalogoCodigo: 'ABC' })
  assert.ok(v.ok && v.respuestas.versionCatalogoCodigo === null, 'sin motor no hay cadena: todo a null')
})

// ─── Revisión del PR #5080 ──────────────────────────────────────────────────────────────────────────────────────────

const CAT = { versionCatalogoMarcaId: '7', versionCatalogoModeloId: '88', versionCatalogoMotorId: 'Gasoline', versionCatalogoCodigo: 'ABC123', versionCatalogoVersion: '1.0 TSI' }

test('#5080 BLOQUEANTE: marca/modelo guardados en texto + la misma versión elegida del catálogo → marca y modelo NO quedan null', () => {
  const guardado = { matricula: '1234BCD', marca: 'SEAT', modelo: 'Ibiza' }
  const p = propuestaRiesgoDeSolicitud('auto', { matricula: '1234BCD', marca: 'Seat', modelo: 'Ibiza', ...CAT })!
  const plan = planEscrituraRiesgo('datosVehiculo', guardado, p.propuesta)
  assert.equal(plan.escribir.codigoVehiculo, 'ABC123')
  const e = calcularEdicionRiesgo({ ramo: 'auto', clave: 'datosVehiculo', info: { datosVehiculo: guardado }, parcial: plan.escribir, confirmar: false, ahora: AHORA, hoy: AHORA.slice(0, 10) })
  assert.ok(e.ok)
  if (!e.ok) return
  assert.equal(e.datos.marca, 'SEAT', 'la marca guardada no se borra ni se pisa')
  assert.equal(e.datos.modelo, 'Ibiza')
  assert.equal(e.datos.codigoVehiculo, 'ABC123')
  assert.ok(!e.cambios.some((c) => c.campo === 'marca' || c.campo === 'modelo'), 'marca y modelo no cambian')
  // Sin nada guardado, marca y modelo viajan con el catálogo (lo declarado).
  const vacio = planEscrituraRiesgo('datosVehiculo', null, p.propuesta)
  assert.equal(vacio.escribir.marca, 'Seat')
})

test('#5080: si el vehículo declarado choca con el guardado, ningún dato suelto del vehículo se escribe, y se avisa', () => {
  const p = propuestaRiesgoDeSolicitud('auto', { matricula: '1234BCD', marca: 'Opel', modelo: 'Corsa', kmAnuales: 9000, garaje: 'calle', fechaMatriculacion: '2019-05-17' })!.propuesta
  // Sin matrícula guardada (no es «otro vehículo» por matrícula), pero marca/modelo distintos.
  const plan = planEscrituraRiesgo('datosVehiculo', { marca: 'SEAT', modelo: 'Ibiza' }, p)
  for (const k of ['matricula', 'kmAnuales', 'garaje', 'fechaMatriculacion', 'marca', 'modelo']) assert.ok(!(k in plan.escribir), k)
  assert.ok(plan.conflictos.some((c) => /no se ha escrito ningún dato del vehículo/.test(c)))
  // Con una versión ya elegida y otra marca declarada: tampoco.
  const conVersion = planEscrituraRiesgo('datosVehiculo', { marca: 'SEAT', modelo: 'Ibiza', codigoVehiculo: 'X1' }, p)
  assert.ok(!('kmAnuales' in conVersion.escribir))
  // Otra versión del catálogo para el mismo vehículo: igual.
  const otraVersion = planEscrituraRiesgo('datosVehiculo', { codigoVehiculo: 'X1' }, propuestaRiesgoDeSolicitud('auto', { kmAnuales: 9000, ...CAT })!.propuesta)
  assert.deepEqual(otraVersion.escribir, {})
})
