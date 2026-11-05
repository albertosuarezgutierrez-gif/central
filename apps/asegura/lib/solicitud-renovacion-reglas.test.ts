// Cepos de la SOLICITUD DE DATOS DE LA RENOVACIÓN por la app (05/11/2026). Datos sintéticos (sin personas reales).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { NADA_CONOCIDO, camposSolicitud } from '@central/module-seguros'
import { faltasHogarBot, type EntradaBotHogar } from '@central/module-tarificacion'
import {
  CALLBACK_ENVIAR_DATOS, botonesRevisionDatos, decidirBotonDatos, decidirPreguntas, mensajeVigente, textoRevisionDatos,
} from './solicitud-renovacion-reglas.ts'

const TODOS = camposSolicitud('hogar', NADA_CONOCIDO)
const S = '44444444-4444-4444-8444-444444444444'
const VACIA: EntradaBotHogar = {
  codigoPostal: null, municipio: null, nombreVia: null, numero: null, planta: null, puerta: null, anioConstruccion: null, anioReforma: null,
  superficieM2: null, referenciaCatastral: null, capitalContinenteEur: null, capitalContenidoEur: null, protecciones: null, objetosValor: null,
  tomadorEmpresa: false,
}
const CON_DIRECCION: EntradaBotHogar = { ...VACIA, codigoPostal: '41003', municipio: 'SEVILLA', nombreVia: 'EJEMPLO', numero: '1' }

test('solo se pregunta lo que el bot echa en falta (el MISMO validador del 422 riesgo_incompleto)', () => {
  const d = decidirPreguntas(faltasHogarBot({ ...CON_DIRECCION, anioConstruccion: 1990, superficieM2: 80, regimen: 'propietario', tipoVivienda: 'piso' }), TODOS)
  assert.ok(d.ok)
  if (!d.ok) return
  assert.deepEqual(d.campos.map((c) => c.clave).sort(), ['conMadera', 'usoVivienda'])
  // Lo que el bot exige es obligatorio y esencial (en el enlace general la madera es opcional).
  for (const c of d.campos) { assert.equal(c.obligatorio, true, c.clave); assert.equal(c.nivel, 'esencial', c.clave) }
})

test('sin dirección: la dirección entera (CP→calle→número) y la tarjeta del Catastro; nunca DNI ni nacimiento', () => {
  const d = decidirPreguntas(faltasHogarBot(VACIA), TODOS)
  assert.ok(d.ok)
  if (!d.ok) return
  const claves = d.campos.map((c) => c.clave)
  assert.ok(claves.includes('vivienda') && claves.includes('confirmaCatastro'))
  assert.equal(d.campos.find((c) => c.clave === 'vivienda')?.tipo, 'direccion')
  for (const k of ['dni', 'fechaNacimiento', 'habitaciones', 'alarma', 'tramoContenido', 'hipoteca']) assert.ok(!claves.includes(k), `no se pregunta ${k}`)
  // Año y m²: preguntas del Catastro (si confirma la tarjeta no se teclean).
  assert.equal(d.campos.find((c) => c.clave === 'metrosCuadrados')?.catastro, 'metros')
})

test('con la dirección sabida, año y m² se preguntan sin tarjeta (no hay dirección tecleada que consultar)', () => {
  const d = decidirPreguntas(faltasHogarBot({ ...CON_DIRECCION, uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: 'no' }), TODOS)
  assert.ok(d.ok)
  if (d.ok) assert.deepEqual(d.campos.map((c) => c.clave), ['metrosCuadrados', 'anioConstruccion'])
})

test('nada que pedir → 409 (tarifícala ya); empresa → 409 no preguntable', () => {
  const nada = decidirPreguntas([], TODOS)
  assert.equal(nada.ok, false)
  if (!nada.ok) assert.equal(nada.motivo, 'nada_que_pedir')
  const emp = decidirPreguntas(faltasHogarBot({ ...VACIA, tomadorEmpresa: true }), TODOS)
  assert.equal(emp.ok, false)
  if (!emp.ok) assert.equal(emp.motivo, 'no_preguntable')
})

test('Telegram: ✅ solo si hay a quién; ✏️ siempre; solo el titular pulsa; solo el ÚLTIMO mensaje vale', () => {
  assert.deepEqual(botonesRevisionDatos(S, 'https://x/p', false).flat().map((b) => b.texto), ['✏️ Modificar'])
  const con = botonesRevisionDatos(S, 'https://x/p', true).flat()
  assert.equal(con[0].callback, `${CALLBACK_ENVIAR_DATOS}:${S}`)
  assert.ok(Buffer.byteLength(con[0].callback ?? '') <= 64)
  assert.equal(decidirBotonDatos({ from: { id: 6 } }, 'env', [S], '5').ok, false)
  assert.equal(decidirBotonDatos({ from: { id: 5 } }, 'env', [S], undefined).ok, false)
  assert.deepEqual(decidirBotonDatos({ from: { id: 5 } }, 'env', [S], '5'), { ok: true, solicitudId: S })
  assert.equal(mensajeVigente('telegram', null, 10).ok, false)
  assert.equal(mensajeVigente('telegram', 9, 10).ok, false)
  assert.equal(mensajeVigente('telegram', 10, 10).ok, true)
  assert.equal(mensajeVigente('pantalla', null, null).ok, true)
  const t = textoRevisionDatos({ cliente: 'Ejemplo', compania: 'X', vence: '2026-12-01', preguntas: ['si lleva madera'], catastro: null, destinatarios: ['📱 a'], publicable: true })
  assert.match(t, /necesitamos unos datos/)
  assert.match(t, /No sale nada hasta que pulses ✅/)
})

// ─── Guardián de acceso del puente (fuente) ───────────────────────────────────────────────────────────────────────────
// La página del portal y el envío de respuestas pasan por `quienEs` (la regla ÚNICA `quienContestaDatosRenovacion`) ANTES
// de devolver los campos o de responder; y una solicitud sin el ✅ (`publicada_at`) no existe para el portal. Si alguien quita
// una de estas puertas, cualquier identidad con un id de solicitud podría verla o contestarla.
test('el puente del portal decide quién ANTES de enseñar o aceptar nada, y solo con el ✅', () => {
  const src = readFileSync(new URL('./solicitud-renovacion.ts', import.meta.url), 'utf8')
  const tramo = (desde: string, hasta: string) => {
    const i = src.indexOf(desde)
    const j = src.indexOf(hasta, i + desde.length)
    assert.ok(i >= 0 && j > i, `no encuentro ${desde}`)
    return src.slice(i, j)
  }
  const leer = tramo('export async function solicitudParaIdentidad', '\n}\n')
  assert.ok(leer.indexOf('await quienEs(') > 0 && leer.indexOf('await quienEs(') < leer.indexOf("estado: 'ok'"), 'leer: quién, antes de los campos')
  assert.match(leer, /if \(!quien\) return \{ estado: 'no_encontrada' \}/)
  const responder = tramo('export async function responderSolicitudIdentidad', '\n}\n')
  assert.ok(responder.indexOf('await quienEs(') > 0 && responder.indexOf('await quienEs(') < responder.indexOf('responderFila('), 'responder: quién, antes de escribir')
  assert.match(responder, /if \(!quien\) return \{ ok: false, estado: 'no_encontrada' \}/)
  const fila = tramo('async function filaRenovacion', '\n}\n')
  assert.match(fila, /f\.publicada !== null/, 'sin ✅ no existe para el portal')
  assert.match(fila, /correduria_id = \$\{correduriaId\}::uuid/)
  const quien = tramo('async function quienEs', '\n}\n')
  assert.match(quien, /quienContestaDatosRenovacion\(/)
  assert.match(quien, /identidad_id = \$\{identidadId\}::uuid and cliente_id = \$\{f\.clienteId\}::uuid/)
})
