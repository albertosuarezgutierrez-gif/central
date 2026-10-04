// Guardián del lector de pólizas duplicadas de la correduría en plataforma
// (`apps/plataforma/lib/duplicados-asegura.ts`). Puro: sin red.
//
// Lo que fija: `null` («no se pudo comprobar») y `[]` («se miró y no hay») no
// se confunden; un grupo mal formado se salta sin tumbar el bloque; un grupo
// que se queda con una sola póliza legible NO es un duplicado; y
// `sin_configurar`/`error` llegan con su motivo, nunca como «sin duplicados».

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  interpretarDuplicados,
  interpretarNoDuplicado,
  textoErrorNoDuplicado,
  textoOrigenFicha,
  leerGrupoDuplicado,
  leerGruposDuplicados,
  polizasSobrantes,
  textoMotivoDuplicados,
} from '../apps/plataforma/lib/duplicados-asegura.ts'

const GRUPO = {
  numero: '123456',
  compania: 'C0058',
  polizas: [
    { id: 'p1', clienteId: 'c1', origen: 'cima', confirmadaCima: true, estado: 'en_vigor', clienteActivo: true },
    { id: 'p2', clienteId: 'c1', origen: 'emitida', confirmadaCima: false, estado: 'en_vigor', clienteActivo: true },
  ],
  emitidaYCima: true,
}

test('🚨 sin lista → null; lista vacía → [] (son cosas distintas)', () => {
  assert.equal(leerGruposDuplicados(undefined), null)
  assert.equal(leerGruposDuplicados(null), null)
  assert.equal(leerGruposDuplicados('no'), null, 'una lista que no es lista degrada a null, no a []')
  assert.equal(leerGruposDuplicados({ grupos: [] }), null)
  assert.deepEqual(leerGruposDuplicados([]), [], 'lista vacía SÍ es «sin duplicados»')
})

test('un grupo se lee entero y emitidaYCima se recalcula de las pólizas', () => {
  const g = leerGrupoDuplicado(GRUPO)
  assert.ok(g)
  assert.equal(g.numero, '123456')
  assert.equal(g.compania, 'C0058')
  assert.equal(g.polizas.length, 2)
  assert.equal(g.emitidaYCima, true)
  // Dos de CIMA (mismo número dos veces): duplicado, pero NO «emitida y CIMA».
  const dosCima = leerGrupoDuplicado({ ...GRUPO, emitidaYCima: true, polizas: GRUPO.polizas.map((p) => ({ ...p, origen: 'cima', confirmadaCima: true })) })
  assert.equal(dosCima?.emitidaYCima, false, 'el flag que llega no manda: mandan las pólizas')
})

test('un grupo mal formado se salta sin tumbar el bloque', () => {
  const l = leerGruposDuplicados([
    GRUPO,
    'basura',
    { numero: '9', compania: 'X' }, // sin pólizas
    { numero: '9', compania: 'X', polizas: 'no' },
    { compania: 'X', polizas: GRUPO.polizas }, // sin número
    { numero: '9', compania: 'X', polizas: [GRUPO.polizas[0], { id: 'p3' }] }, // una sola legible: no es duplicado
    { numero: '9', compania: 'X', polizas: [GRUPO.polizas[0], { ...GRUPO.polizas[0] }] }, // la misma ficha dos veces: no es duplicado
  ])
  assert.ok(l)
  assert.equal(l.length, 1)
  assert.equal(l[0].numero, '123456')
})

test('una póliza sin estado se queda en «sin_informar», no se inventa «en_vigor»', () => {
  const g = leerGrupoDuplicado({ ...GRUPO, polizas: [GRUPO.polizas[0], { id: 'p2', clienteId: 'c2', confirmadaCima: false }] })
  assert.equal(g?.polizas[1].estado, 'sin_informar')
  assert.equal(g?.polizas[1].clienteActivo, null, 'cliente activo sin informar = no se sabe')
  assert.equal(g?.polizas[1].clienteId, 'c2', 'dos fichas distintas con la misma póliza: se enlazan las dos')
})

test('🚨 ok / sin_configurar / error no se confunden, y un ok sin lista NO es «sin duplicados»', () => {
  const ok = interpretarDuplicados(200, { estado: 'ok', grupos: [GRUPO] })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') assert.equal(ok.grupos.length, 1)
  assert.deepEqual(interpretarDuplicados(200, { estado: 'ok', grupos: [] }), { estado: 'ok', grupos: [] })
  assert.deepEqual(interpretarDuplicados(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarDuplicados(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarDuplicados(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarDuplicados(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarDuplicados(500, { estado: 'error', causa: 'credenciales' }), { estado: 'error', motivo: 'credenciales' })
  assert.deepEqual(interpretarDuplicados(500, { estado: 'error', motivo: 'asegura_error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarDuplicados(502, { estado: 'error', motivo: 'red' }), { estado: 'error', motivo: 'red' })
  assert.deepEqual(interpretarDuplicados(500, null), { estado: 'error', motivo: 'HTTP 500' })
})

test('los motivos técnicos se traducen; una frase se deja tal cual', () => {
  assert.match(textoMotivoDuplicados('red'), /asegura/)
  assert.equal(textoMotivoDuplicados('credenciales'), 'credenciales')
})

test('las pólizas sobrantes son todas menos una por grupo', () => {
  assert.equal(polizasSobrantes([]), 0)
  assert.equal(polizasSobrantes([GRUPO as never]), 1)
  assert.equal(polizasSobrantes([{ ...GRUPO, polizas: [...GRUPO.polizas, { id: 'p3', clienteId: 'c1', confirmadaCima: true, estado: 'en_vigor' }] } as never, GRUPO as never]), 3)
})

// ── Origen de cada ficha y «No es duplicado» (04/10/2026) ───────────────────

test('🚨 origen: lo dice el puerto; un puerto viejo con confirmadaCima:false NO se convierte en «emitida»', () => {
  const g = leerGrupoDuplicado({ ...GRUPO, polizas: [
    { id: 'a', clienteId: 'c', origen: 'volcado', estado: 'activa' },
    { id: 'b', clienteId: 'c', confirmadaCima: false, estado: 'activa' },
    { id: 'c', clienteId: 'c', confirmadaCima: true, estado: 'activa' },
    { id: 'd', clienteId: 'c', origen: 'inventado', estado: 'activa' },
  ] })
  assert.deepEqual(g?.polizas.map((p) => p.origen), ['volcado', null, 'cima', null])
  assert.equal(g?.emitidaYCima, false, 'sin una «emitida» explícita no hay «sin casar»')
  assert.equal(textoOrigenFicha('volcado'), 'volcado')
  assert.equal(textoOrigenFicha('cima'), 'CIMA')
  assert.equal(textoOrigenFicha(null), 'origen sin informar')
})

test('🚨 no-duplicado: SOLO un 200 ok con pares es éxito; tabla ausente es error con «falta aplicar la migración»', () => {
  assert.deepEqual(interpretarNoDuplicado(200, { estado: 'ok', pares: 3, nuevos: 3 }), { estado: 'ok', pares: 3, nuevos: 3 })
  const sinTabla = interpretarNoDuplicado(503, { estado: 'error', motivo: 'migracion_pendiente' })
  assert.deepEqual(sinTabla, { estado: 'error', motivo: 'migracion_pendiente' })
  assert.match(textoErrorNoDuplicado('migracion_pendiente'), /falta aplicar la migración/i)
  // Nada de éxitos supuestos.
  assert.equal(interpretarNoDuplicado(200, { estado: 'ok' }).estado, 'error')
  assert.equal(interpretarNoDuplicado(200, { estado: 'ok', pares: 0 }).estado, 'error')
  assert.equal(interpretarNoDuplicado(200, null).estado, 'error')
  assert.equal(interpretarNoDuplicado(201, { estado: 'ok', pares: 1 }).estado, 'error')
  assert.deepEqual(interpretarNoDuplicado(503, { estado: 'sin_configurar' }), { estado: 'error', motivo: 'sin_configurar' })
  assert.deepEqual(interpretarNoDuplicado(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarNoDuplicado(403, { estado: 'error', motivo: 'sin_usuario' }), { estado: 'error', motivo: 'sin_usuario' })
  assert.deepEqual(interpretarNoDuplicado(400, { estado: 'error', motivo: 'motivo_obligatorio' }), { estado: 'error', motivo: 'motivo_obligatorio' })
  assert.deepEqual(interpretarNoDuplicado(502, { estado: 'error', motivo: 'red' }), { estado: 'error', motivo: 'red' })
})

test('🚨 la pantalla solo quita el grupo tras el OK, exige motivo y el botón mide 44 px', () => {
  const src = readFileSync(new URL('../apps/plataforma/app/(usuario)/correduria/Duplicadas.tsx', import.meta.url), 'utf8')
  assert.match(src, /if \(r\.estado === 'ok'\) onMarcado\(\)\s*\n\s*else setEnvio\(\{ fase: 'abierto', error: textoErrorNoDuplicado\(r\.motivo\) \}\)/)
  assert.match(src, /disabled=\{motivoLimpio === '' \|\| envio\.fase === 'enviando'\}/)
  // btnStyle('secundario') tamaño md = minHeight 44 (regla responsive del CLAUDE.md raíz).
  assert.match(src, /<button type="button" style=\{btnStyle\('secundario'\)\} onClick=\{\(\) => setEnvio\(\{ fase: 'abierto', error: null \}\)\}>\s*No es duplicado/)
  assert.match(src, /textoOrigenFicha\(p\.origen\)/)
  // La ruta: sesión de la correduría antes de reenviar.
  const ruta = readFileSync(new URL('../apps/plataforma/app/api/correduria/duplicados/no-duplicado/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /const guarda = await exigirCorreduria\(\)\s*\n\s*if \(!guarda\.ok\) return guarda\.respuesta/)
  assert.match(ruta, /marcarNoDuplicadoAsegura\(ids, motivo\)/)
})
