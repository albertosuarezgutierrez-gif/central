import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { interpretarEleccion, puedeElegirRenovacion, textoDiferenciaRenovacion, textoEleccionHecha, TEXTOS_RENOVACION } from './renovacion-vista.ts'

test('diferencia con la renovación: formato español; sin renovación no hay ahorro', () => {
  assert.equal(textoDiferenciaRenovacion(2000, 2162.49), '162,49€ menos que tu renovación')
  assert.equal(textoDiferenciaRenovacion(3500, 2162.49), '1.337,51€ más que tu renovación')
  assert.equal(textoDiferenciaRenovacion(100, 100), 'el mismo precio que tu renovación')
  assert.equal(textoDiferenciaRenovacion(100, null), null)
  assert.equal(textoDiferenciaRenovacion(100, 0), null, 'una renovación de 0 no es un precio')
  assert.equal(textoDiferenciaRenovacion(null, 100), null)
})

const base = { enviadoAt: new Date(), caducado: false, retirado: false, aceptadoAt: null, emitidoAt: null, accesoWhatsapp: false, tercero: false, vistaDeCorredor: false }

test('elegir: con la sesión del portal o el ENLACE del tomador, sobre una renovación publicada, vigente, sin firmar ni emitir', () => {
  assert.equal(puedeElegirRenovacion(base), true)
  assert.equal(puedeElegirRenovacion({ ...base, enviadoAt: null }), false)
  assert.equal(puedeElegirRenovacion({ ...base, caducado: true }), false)
  assert.equal(puedeElegirRenovacion({ ...base, retirado: true }), false)
  assert.equal(puedeElegirRenovacion({ ...base, aceptadoAt: new Date() }), false)
  assert.equal(puedeElegirRenovacion({ ...base, emitidoAt: new Date() }), false)
  // 05/11/2026: el que no usa la app elige desde el enlace del WhatsApp (aunque Alberto no haya confirmado el envío).
  assert.equal(puedeElegirRenovacion({ ...base, accesoWhatsapp: true }), true)
  assert.equal(puedeElegirRenovacion({ ...base, enviadoAt: null, accesoWhatsapp: true }), true)
  assert.equal(puedeElegirRenovacion({ ...base, accesoWhatsapp: true, tercero: true }), false, 'el código de una persona de contacto ve, no elige')
  assert.equal(puedeElegirRenovacion({ ...base, tercero: true }), false)
  assert.equal(puedeElegirRenovacion({ ...base, elegidaPorOtro: { nombre: 'Laura' } }), false, 'vale la primera elección')
  assert.equal(puedeElegirRenovacion({ ...base, vistaDeCorredor: true }), false, 'la vista previa no elige')
})

test('la elección hecha: null = no consta (no se dice «no has elegido»)', () => {
  assert.equal(textoEleccionHecha(null, null, null), null)
  assert.match(textoEleccionHecha({ tipo: 'renovacion' }, null, null) ?? '', /quedarte con tu renovación/)
  assert.match(textoEleccionHecha({ tipo: 'opcion', opcionId: 'x' }, { compania: 'Reale' }, null) ?? '', /Reale.*antes de emitir/)
})

test('respuesta del puente: 503 = no disponible; solo 200 ok es una elección guardada', () => {
  assert.equal(interpretarEleccion(200, { estado: 'ok', aviso: 'x' }).estado, 'ok')
  assert.equal(interpretarEleccion(200, { estado: 'raro' }).estado, 'error')
  assert.equal(interpretarEleccion(503, { estado: 'sin_migracion' }).estado, 'no_disponible')
  assert.equal(interpretarEleccion(429, { estado: 'limite' }).estado, 'limite')
  assert.equal(interpretarEleccion(410, { estado: 'caducado' }).estado, 'caducado')
  assert.equal(interpretarEleccion(502, null).estado, 'error')
})

test('el texto dice que elegir no contrata ni firma', () => {
  assert.match(TEXTOS_RENOVACION.noContrata, /no contrata nada/)
})

test('cepo: el cuerpo al puente lleva el ACCESO de la cookie (identidad o token del enlace) y nunca un clienteId', () => {
  const src = readFileSync(new URL('./renovacion-vista.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /clienteId/)
  assert.match(src, /accion: 'elegir_renovacion', \.\.\.acceso, presupuestoId, \.\.\.eleccion/)
  const ruta = readFileSync(new URL('../app/api/presupuesto/elegir/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /const puerta = await accesoPuenteDe\(presupuestoId\)/)
  assert.match(ruta, /if \(puerta\.corredor\) return/)
  assert.match(ruta, /if \(puerta\.tercero\) return NextResponse\.json\(\{ estado: 'sin_permiso' \}, \{ status: 403 \}\)/)
  assert.match(ruta, /pedirEleccion\(puerta\.acceso, presupuestoId, eleccion\)/)
  assert.doesNotMatch(ruta, /clienteId/)
})

test('doble elección: el puente dice «ya elegida» con el nombre de pila; 403 de un contacto ≠ error', async () => {
  const { textoElegidaPorOtro } = await import('./renovacion-vista.ts')
  assert.deepEqual(interpretarEleccion(409, { estado: 'ya_elegida', por: 'Laura' }), { estado: 'ya_elegida', por: 'Laura' })
  assert.deepEqual(interpretarEleccion(409, { estado: 'ya_elegida', por: 7 }), { estado: 'ya_elegida', por: null })
  assert.equal(interpretarEleccion(403, { estado: 'sin_permiso' }).estado, 'sin_permiso')
  assert.match(textoElegidaPorOtro('Laura'), /Ya la ha elegido Laura/)
  const ui = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/ElegirRenovacion.tsx', import.meta.url), 'utf8')
  assert.match(ui, /const hecha = deOtro \? null : textoEleccionHecha/, 'a quien no eligió nunca «Elegiste…»')
  assert.match(ui, /const activo = puedeElegir && !vistaPrevia && deOtro === null/)
})

test('🪤 el AUTORIZADO solo entra por una RENOVACIÓN, con la regla única y sin la dirección ni los datos del tomador', () => {
  const sinC = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const src = sinC(readFileSync(new URL('./presupuesto.ts', import.meta.url), 'utf8'))
  const ses = src.slice(src.indexOf('export async function presupuestoDeSesion'), src.indexOf('async function tomadorParaTercero'))
  assert.match(ses, /\(await esRenovacion\(p\.id, p\.correduriaId\)\)\) \{\s+porAutorizado = await autorizadoEligeRenovacion\(identidadId,/)
  assert.ok(ses.indexOf('porAutorizado = await') < ses.indexOf('if (vinculo === null && !porCanal && !porAutorizado)'), 'antes de decidir «ajeno»')
  assert.match(ses, /porAutorizado && actualLeido \? \{ \.\.\.actualLeido, ubicacion: null \}/)
  const aut = sinC(readFileSync(new URL('./renovacion-autorizado.ts', import.meta.url), 'utf8'))
  assert.match(aut, /identidadesQueEligenRenovacion\(/)
  assert.match(aut, /OR: \[\{ autorizadoIdentidadId: identidadId \}/)
  assert.doesNotMatch(aut, /puede_ver_polizas|puedeVerPolizas/, 'la tabla vigente, nunca el booleano revocado')
  const pagina = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(pagina, /const mostrarCotizados = [^\n]*autorizado === null/)
  assert.match(pagina, /const identidadEstudio = [^\n]*autorizado === null/)
  assert.match(pagina, /const puedeAceptar = [^\n]*autorizado === null/)
})

test('🪤 quién eligió: en una renovación, no poder leerlo (también sin 2026-11-05c) es NO DISPONIBLE', () => {
  const src = readFileSync(new URL('./presupuesto.ts', import.meta.url), 'utf8')
  const leer = src.slice(src.indexOf('async function leerRenovacion'), src.indexOf('async function esRenovacion'))
  const quien = leer.slice(leer.indexOf("registrar('leerRenovacion/quien'"))
  assert.match(quien, /^registrar\('leerRenovacion\/quien', e\)\s+return RENOVACION_NO_DISPONIBLE/)
})

test('🪤 leer la renovación: «no es renovación» ≠ «no se ha podido leer» (fail-closed)', async () => {
  const { renovacionTrasFallo, RENOVACION_NO_DISPONIBLE } = await import('./renovacion-vista.ts')
  // Sin la migración (falta la columna) no PUEDE haber renovaciones: es el presupuesto de siempre.
  assert.equal(renovacionTrasFallo(new Error('column "modo" does not exist (42703)')), null)
  // Con la migración pero sin GRANT, caída de red… NO se pinta como presupuesto normal con Aceptar/Firmar.
  assert.equal(renovacionTrasFallo(new Error('permission denied for table presupuesto (42501)')), RENOVACION_NO_DISPONIBLE)
  assert.equal(renovacionTrasFallo(new Error('timeout')), RENOVACION_NO_DISPONIBLE)
  const src = readFileSync(new URL('./presupuesto.ts', import.meta.url), 'utf8')
  const leer = src.slice(src.indexOf('async function leerRenovacion'), src.indexOf('async function leerActual'))
  assert.match(leer, /return renovacionTrasFallo\(e\)/)
  const pagina = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(pagina, /const puedeAceptar = p\.renovacion === null && /, 'Aceptar/Firmar solo si consta que NO es renovación')
  assert.match(pagina, /TEXTOS_RENOVACION\.lecturaNoDisponible/)
})
