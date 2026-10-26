// Cepo de coherencia (26/10/2026): cada pregunta del enlace de datos tiene destino en el modelo del riesgo de su ramo
// (o en la ficha), y las opciones de hogar casan con valores que el modelo y Codeoscopic aceptan.
import test from 'node:test'
import assert from 'node:assert/strict'
import { RAMOS_OPORTUNIDAD } from './oportunidad-seguimiento.ts'
import { claveDatosDeRamo } from './datos-riesgo-ramo.ts'
import { validarDatosViviendaRiesgo } from './datos-vivienda-riesgo.ts'
import { NADA_CONOCIDO, TRAMOS_CONTENIDO, TRAMOS_CONTINENTE, camposSolicitud, conIdentidad, validarRespuestas, type ConocidoFicha } from './solicitud-datos.ts'
import {
  ALARMA_ID_CODEOSCOPIC, DESTINOS_HOGAR, IDS_CODEOSCOPIC_HOGAR_ATESTIGUADOS, OPCIONES_HOGAR_A_VIVIENDA, PREGUNTAS_HOGAR_26_10,
  camposDelBloque, destinoCampoSolicitud,
} from './solicitud-destinos.ts'
import { CLAVES_BLOQUE_DIRECCION, CLAVES_SUELTAS_VIVIENDA, planEscrituraVivienda, viviendaDeSolicitud } from './solicitud-hogar.ts'

const TODO: ConocidoFicha = { dni: true, fechaNacimiento: true, codigoPostal: true, carnetMoto: true, carnetCoche: true }
const COLUMNAS = new Set(['dni', 'fecha_nacimiento', 'codigo_postal', 'cliente_carnets_conducir'])

test('TODO ramo: cada campo del enlace tiene destino declarado, y el del riesgo existe en el bloque de su ramo', () => {
  const malos: string[] = []
  for (const ramo of RAMOS_OPORTUNIDAD) {
    const bloque = claveDatosDeRamo(ramo)
    const campos = new Set(camposDelBloque(bloque))
    for (const conocido of [NADA_CONOCIDO, TODO]) {
      for (const c of conIdentidad(camposSolicitud(ramo, conocido))) {
        const d = destinoCampoSolicitud(ramo, c.clave)
        if (d === null) malos.push(`${ramo}.${c.clave}: sin destino declarado`)
        else if (d.en === 'riesgo' && !campos.has(d.campo)) malos.push(`${ramo}.${c.clave} → ${bloque}.${d.campo}: ese campo no existe`)
        else if (d.en === 'ficha' && !COLUMNAS.has(d.columna)) malos.push(`${ramo}.${c.clave} → clientes.${d.columna}: columna desconocida`)
        else if (d.en === 'solo_solicitud' && d.motivo.trim() === '') malos.push(`${ramo}.${c.clave}: hueco sin motivo`)
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
