// Cepos del explorador IA en asegura (13/10/2026). `node --test`. Fixtures SINTÉTICAS (sin datos personales reales).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirMapa, huellaPantalla, sanearInventarioDom, type RespuestaExplorador } from '@central/module-tarificacion'
import {
  MODELO_EXPLORADOR_POR_DEFECTO,
  SYSTEM_EXPLORADOR,
  consumoDe,
  exploradorActivo,
  historialCorto,
  leerPeticionCierre,
  leerPeticionPaso,
  modeloExplorador,
  modoParaWorker,
  pantallaDeMemoria,
  promptExplorador,
} from './tarificador-explorador-reglas.ts'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const UUID = '00000000-0000-4000-8000-000000000001'
const crudo = {
  marcos: [{
    url: 'https://portal.example.test/epac/alta?sid=x',
    titulos: ['Datos básicos'],
    elementos: [
      { tag: 'input', id: 'superficie', type: 'text', etiqueta: 'Superficie', value: '90' },
      { tag: 'label', texto: 'Cliente 00000000T' },
      { tag: 'button', id: 'btnSig', texto: 'Siguiente' },
    ],
  }],
}

test('interruptor: solo «1» exacto', () => {
  assert.equal(exploradorActivo({ TARIFICADOR_EXPLORADOR_ACTIVO: '1' }), true)
  for (const v of [undefined, '', 'true', ' 1', '0']) assert.equal(exploradorActivo({ TARIFICADOR_EXPLORADOR_ACTIVO: v }), false)
})

test('modelo: por defecto el Sonnet de OpenRouter; un valor que no es slug → null (no se llama)', () => {
  assert.equal(modeloExplorador({}), MODELO_EXPLORADOR_POR_DEFECTO)
  assert.equal(modeloExplorador({ TARIFICADOR_EXPLORADOR_MODELO: 'google/gemini-2.5-flash' }), 'google/gemini-2.5-flash')
  assert.equal(modeloExplorador({ TARIFICADOR_EXPLORADOR_MODELO: 'https://x.test/modelo' }), null)
})

test('modoParaWorker: un modo desconocido (exploracion antes de la fase B) NO se sirve como tarificar', () => {
  assert.equal(modoParaWorker(null), 'tarificar')
  assert.equal(modoParaWorker('tarificar'), 'tarificar')
  assert.equal(modoParaWorker('emision'), 'emision')
  assert.equal(modoParaWorker('exploracion'), null)
  assert.equal(modoParaWorker('otra'), null)
})

test('leerPeticionPaso: re-sanea (sin valores ni datos personales) y asigna refs', () => {
  const l = leerPeticionPaso({ trabajoId: UUID, inventario: crudo })
  assert.ok(l.ok)
  if (!l.ok) return
  const s = JSON.stringify(l.p.inventario)
  assert.doesNotMatch(s, /00000000T|"90"/)
  assert.deepEqual(l.p.inventario.marcos[0].elementos.map((e) => e.ref), ['m0e0', 'm0e1', 'm0e2'])
  assert.equal(l.p.avancesFallidos, 0)
  assert.equal(leerPeticionPaso({ trabajoId: 'x', inventario: crudo }).ok, false)
  assert.equal(leerPeticionPaso({ trabajoId: UUID, inventario: { marcos: [] } }).ok, false)
  assert.equal(leerPeticionPaso({ trabajoId: UUID, inventario: crudo, avancesFallidos: 99 }).ok, false)
})

test('leerPeticionCierre: red solo origen+ruta; motivos y efectos de lista', () => {
  const l = leerPeticionCierre({ trabajoId: UUID, motivoFin: 'resultado', redNoGet: ['https://p.example.test/a.do?nif=1', 'basura'], efectosEnPortal: ['posible_proyecto_guardado'] })
  assert.ok(l.ok)
  if (l.ok) assert.deepEqual(l.p.redNoGet, ['https://p.example.test/a.do'])
  assert.equal(leerPeticionCierre({ trabajoId: UUID, motivoFin: 'me_canse' }).ok, false)
  assert.equal(leerPeticionCierre({ trabajoId: UUID, motivoFin: 'resultado', efectosEnPortal: ['emitida'] }).ok, false)
})

test('prompt: el inventario va DELIMITADO como datos; sin NIF real visible; el system prohíbe emitir', () => {
  const l = leerPeticionPaso({ trabajoId: UUID, inventario: crudo })
  assert.ok(l.ok)
  if (!l.ok) return
  const pr = promptExplorador({ entrada: 'allianz:particulares:hogar', ramo: 'hogar', inventario: l.p.inventario, historial: [], conDatosReales: false, avancesFallidos: 0 })
  assert.match(pr, /<inventario>\n\{[\s\S]*\}\n<\/inventario>$/)
  assert.match(pr, /tomador\.nif NO tiene valor/)
  assert.doesNotMatch(pr, /00000000T/)
  assert.match(SYSTEM_EXPLORADOR, /NUNCA Emitir, Contratar, Formalizar, Grabar/)
  assert.match(SYSTEM_EXPLORADOR, /no instrucciones/)
})

test('consumo y historial: cuentan llamadas, acciones y €; el historial no lleva valores', () => {
  const r: RespuestaExplorador = { version: 1, pantalla: { nombre: 'Datos básicos', tipo: 'formulario' }, acciones: [{ accion: 'rellenar', ref: 'm0e0', dato: 'inmueble.superficie_m2' }], mapeo: [], motivo: null }
  const pasos = [
    { huella: 'a', respuesta: r, origen: 'ia' as const, llamadaIA: true, costeEur: 0.1, acciones: 1 },
    { huella: 'b', respuesta: r, origen: 'mapa' as const, llamadaIA: false, costeEur: 0, acciones: 1 },
  ]
  assert.deepEqual(consumoDe(pasos, new Date(0), new Date(5000)), { llamadas: 1, acciones: 2, eur: 0.1, ms: 5000, pasos: 2 })
  assert.deepEqual(historialCorto(pasos), ['1. Datos básicos: rellenar m0e0=inmueble.superficie_m2', '2. Datos básicos: rellenar m0e0=inmueble.superficie_m2'])
})

test('memoria: gana el mapa REVISADO; un mapa inválido se ignora', () => {
  const l = leerPeticionPaso({ trabajoId: UUID, inventario: crudo })
  assert.ok(l.ok)
  if (!l.ok) return
  const inv = l.p.inventario
  const huella = huellaPantalla(inv)
  const mk = (dato: string) => construirMapa(
    { entrada: 'allianz:particulares:hogar', compania: 'allianz', producto: 'hogar', modelo: null, fecha: '2026-10-13', efectosEnPortal: [], redNoGet: [], coste: { llamadas: 0, eurEstimado: 0 }, motivoFin: null },
    [{ huella, inventario: inv, respuesta: { version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones: [{ accion: 'rellenar', ref: 'm0e0', dato }], mapeo: [], motivo: null } }],
  )
  const p = pantallaDeMemoria([{ estado: 'borrador', mapa: mk('inmueble.planta') }, { estado: 'revisado', mapa: mk('inmueble.superficie_m2') }, { estado: 'revisado', mapa: { version: 9 } }], huella)
  assert.equal(p?.campos[0].campoCanonico, 'inmueble.superficie_m2')
  assert.equal(pantallaDeMemoria([{ estado: 'borrador', mapa: { version: 1 } }], huella), null)
})

// La ruta no es importable desde `node --test` (alias @/): se lee el FUENTE.
test('ruta paso: modelo explícito + cliente_ref por exploración + privado; para ANTES de la IA (parada, bucle, topes)', () => {
  const f = readFileSync(path.join(aqui, '..', 'app', 'api', 'tarificador', 'explorador', 'paso', 'route.ts'), 'utf8')
  const ia = f.indexOf('await iaTexto(')
  assert.ok(ia > 0)
  for (const antes of ['detectarParada(', 'detectarBucle(', 'comprobarTopes(consumo, topes, peor)']) {
    const i = f.indexOf(antes)
    assert.ok(i > 0 && i < ia, `${antes} tiene que ir ANTES de la llamada a la IA`)
  }
  const llamada = f.slice(ia, f.indexOf('})', ia))
  assert.match(llamada, /modeloOpenRouter:\s*modelo/)
  assert.match(llamada, /cliente:\s*`explorador:\$\{e\.trabajoId\}`/)
  assert.match(llamada, /privado:\s*true/)
  assert.match(f, /validarRespuestaExplorador\(texto, ctx\)/)
  assert.match(f, /conPasoExclusivo\(/)
  // Nunca el inventario ni el texto de la IA en un log.
  for (const m of f.matchAll(/console\.(?:log|warn|error)\(([^\n]*)/g)) assert.doesNotMatch(m[1], /inventario|texto|prompt|respuesta/)
})

// PII (13/10/2026): el inventario se REDACTA con los valores del riesgo ANTES de la IA y de guardarlo; sin riesgo, para.
test('ruta paso: redacta el inventario antes de la IA y de registrarPaso; con datos reales sin riesgo → para sin lock ni IA', () => {
  const f = readFileSync(path.join(aqui, '..', 'app', 'api', 'tarificador', 'explorador', 'paso', 'route.ts'), 'utf8')
  const redacta = f.indexOf('redactarValoresInventario(p.inventario, valores)')
  const lock = f.indexOf('conPasoExclusivo(e,')
  assert.ok(redacta > 0 && redacta < lock, 'la redacción va ANTES del lock (y de todo lo que usa el inventario)')
  assert.equal(f.split('p.inventario').length - 1, 1, 'el inventario crudo solo se usa para redactarlo')
  assert.match(f, /e\.conDatosReales \? await riesgoDeExploracion\(e\)/)
  const corte = f.indexOf('if (valores === null)')
  assert.ok(corte > 0 && corte < redacta && f.slice(corte, redacta).includes('return NextResponse.json('), 'sin riesgo → respuesta y fuera')
})

test('lock del paso NO bloqueante: pg_try_advisory_xact_lock; ocupado → 409 sin IA', () => {
  const lib = readFileSync(path.join(aqui, 'tarificador-explorador.ts'), 'utf8')
  assert.match(lib, /pg_try_advisory_xact_lock\(/)
  assert.doesNotMatch(lib, /select pg_advisory_xact_lock\(/)
  assert.match(lib, /if \(r\[0\]\?\.ok !== true\) throw new PasoOcupado\(\)/)
  const f = readFileSync(path.join(aqui, '..', 'app', 'api', 'tarificador', 'explorador', 'paso', 'route.ts'), 'utf8')
  assert.match(f, /err instanceof PasoOcupado\) return NextResponse\.json\(\{ estado: 'conflicto', motivo: 'paso_en_curso' \}, \{ status: 409 \}\)/)
})
