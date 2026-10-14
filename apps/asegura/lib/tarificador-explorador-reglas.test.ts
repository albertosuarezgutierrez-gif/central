// Cepos del explorador IA en asegura (13/10/2026). `node --test`. Fixtures SINTÉTICAS (sin datos personales reales).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MOTIVOS_FIN_EXPLORACION, MOTIVOS_PARAR, construirMapa, lineaAccionesPortalParaIA, huellaPantalla, sanearInventarioDom, validarRespuestaExplorador, type RespuestaExplorador } from '@central/module-tarificacion'
import {
  MODELO_EXPLORADOR_POR_DEFECTO,
  MOTIVOS_FIN,
  RESERVA_IA_MS,
  cierraCabeceraTrasFallo,
  estadoFalloExploracion,
  exploradoValido,
  SYSTEM_EXPLORADOR,
  consumoDe,
  exploradorActivo,
  historialCorto,
  leerPeticionCierre,
  huecoDeDetalleFin,
  leerPeticionPaso,
  modeloExplorador,
  modoParaWorker,
  leerModosWorker,
  modosReclamables,
  leaseExploracion,
  inicioAcumulado,
  leerPeticionEncolarExploracion,
  MAX_TOKENS_SALIDA_EXPLORADOR,
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

test('modoParaWorker: exploracion SOLO a un worker que la declara; un modo desconocido nunca se sirve como tarificar', () => {
  assert.equal(modoParaWorker(null), 'tarificar')
  assert.equal(modoParaWorker('tarificar'), 'tarificar')
  assert.equal(modoParaWorker('emision'), 'emision')
  // Imagen anterior a la fase B (sin cabecera): no se le sirve.
  assert.equal(modoParaWorker('exploracion'), null)
  assert.equal(modoParaWorker('exploracion', leerModosWorker(null)), null)
  assert.equal(modoParaWorker('exploracion', leerModosWorker('tarificar,emision')), null)
  assert.equal(modoParaWorker('exploracion', leerModosWorker('tarificar, emision, EXPLORACION')), 'exploracion')
  assert.equal(modoParaWorker('otra', leerModosWorker('otra,exploracion')), null)
})

test('modosReclamables: la cola solo lanza exploraciones con TARIFICADOR_EXPLORADOR_ACTIVO=1 exacto', () => {
  assert.deepEqual(modosReclamables({}), ['tarificar', 'emision'])
  assert.deepEqual(modosReclamables({ TARIFICADOR_EXPLORADOR_ACTIVO: 'true' }), ['tarificar', 'emision'])
  assert.deepEqual(modosReclamables({ TARIFICADOR_EXPLORADOR_ACTIVO: '1' }), ['tarificar', 'emision', 'exploracion'])
})

test('lease de exploración: se renueva por pasos pero nunca más allá del tope de tiempo ACUMULADO + margen', () => {
  const t0 = new Date('2026-10-13T10:00:00Z')
  const min = (m: number) => new Date(t0.getTime() + m * 60_000)
  const L = 6 * 60_000
  const MAX = 15 * 60_000
  assert.equal(leaseExploracion({ ahora: min(1), inicio: t0, leaseMs: L, maxMs: MAX }).toISOString(), min(7).toISOString())
  assert.equal(leaseExploracion({ ahora: min(14), inicio: t0, leaseMs: L, maxMs: MAX }).toISOString(), min(17).toISOString())
  assert.equal(leaseExploracion({ ahora: min(30), inicio: t0, leaseMs: L, maxMs: MAX }).toISOString(), min(17).toISOString())
  // Un reintento NO pone el reloj a cero: manda el primer paso si es anterior al reclamo actual.
  assert.equal(inicioAcumulado(min(20), t0)!.toISOString(), t0.toISOString())
  assert.equal(inicioAcumulado(t0, null)!.toISOString(), t0.toISOString())
  assert.equal(inicioAcumulado(null, null), null)
})

test('MAX_TOKENS_SALIDA_EXPLORADOR: cabe una respuesta con 15 acciones y 60 entradas de mapeo (~3 caracteres/token)', () => {
  const r = {
    version: 1, pantalla: { nombre: 'x'.repeat(60), tipo: 'formulario' },
    acciones: Array.from({ length: 15 }, (_, i) => ({ accion: 'rellenar', ref: `m12e${100 + i}`, dato: 'inmueble.anio_construccion' })),
    mapeo: Array.from({ length: 60 }, (_, i) => ({ ref: `m12e${100 + i}`, campoCanonico: 'inmueble.anio_construccion', confianza: 'media' })),
    motivo: 'x'.repeat(200),
  }
  assert.ok(JSON.stringify(r, null, 1).length / 3 < MAX_TOKENS_SALIDA_EXPLORADOR, `${JSON.stringify(r, null, 1).length / 3} tokens no caben en ${MAX_TOKENS_SALIDA_EXPLORADOR}`)
})

test('leerPeticionEncolarExploracion: entrada de la lista cerrada, origen uuid opcional y ninguna otra clave', () => {
  assert.deepEqual(leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar' }), { ok: true, p: { entrada: 'allianz:particulares:hogar', trabajoOrigenId: null, oportunidadId: null } })
  assert.deepEqual(leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar', trabajoOrigenId: UUID }), { ok: true, p: { entrada: 'allianz:particulares:hogar', trabajoOrigenId: UUID, oportunidadId: null } })
  assert.equal(leerPeticionEncolarExploracion({ entrada: 'https://portal.example.test' }).ok, false)
  assert.equal(leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar', trabajoOrigenId: 'x' }).ok, false)
  assert.equal(leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar', riesgo: {} }).ok, false)
  assert.equal(leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar', clienteId: UUID }).ok, false)
  assert.equal(leerPeticionEncolarExploracion(null).ok, false)
})

test('leerPeticionEncolarExploracion: oportunidadId (vía c) uuid, EXCLUYENTE con trabajoOrigenId', () => {
  assert.deepEqual(leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar', oportunidadId: UUID }), { ok: true, p: { entrada: 'allianz:particulares:hogar', trabajoOrigenId: null, oportunidadId: UUID } })
  const ambas = leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar', oportunidadId: UUID, trabajoOrigenId: UUID })
  assert.equal(ambas.ok, false)
  if (!ambas.ok) assert.match(ambas.errores.join(' '), /excluyentes/)
  assert.equal(leerPeticionEncolarExploracion({ entrada: 'allianz:particulares:hogar', oportunidadId: 'no-uuid' }).ok, false)
})

test('prompt con datos reales: catálogo sin pistas de prueba, uso/régimen visibles, claves sinValor, ningún dato personal', () => {
  const l = leerPeticionPaso({ trabajoId: UUID, inventario: crudo })
  assert.ok(l.ok)
  if (!l.ok) return
  const riesgo = { tomador: { nif: '00000000T', nombre: 'Ficticio', apellido1: 'Deprueba' }, inmueble: { codigoPostal: '00000' }, hogar: { uso: 'MainResidence', regimen: 'Tenant' } }
  const pr = promptExplorador({ entrada: 'allianz:particulares:hogar', ramo: 'hogar', inventario: l.p.inventario, historial: [], conDatosReales: true, avancesFallidos: 0, riesgo })
  // Id + su SIGNIFICADO en español (mapa cerrado): la IA casa la opción del portal con el significado.
  assert.match(pr, /"clave":"hogar\.uso"[^}]*"valor":"MainResidence","significado":"Vivienda habitual"/)
  assert.match(pr, /"clave":"hogar\.regimen"[^}]*"valor":"Tenant","significado":"Inquilino"/)
  assert.match(SYSTEM_EXPLORADOR, /Con datos REALES, elegir y marcar SOLO[\s\S]*parar dato_no_disponible/)
  assert.match(pr, /"clave":"inmueble\.anio_construccion"[^}]*"sinValor":true/)
  assert.doesNotMatch(pr, /"pista"/)
  for (const x of ['00000000T', 'Ficticio', 'Deprueba', '"00000"']) assert.doesNotMatch(pr, new RegExp(x))
  assert.match(SYSTEM_EXPLORADOR, /autocompletan año de construcción y m² desde el Catastro/i)
  assert.match(SYSTEM_EXPLORADOR, /hogar\.uso[\s\S]*EXACTAMENTE[\s\S]*parar ambiguo/)
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

test('leerPeticionCierre: detalleFin opcional de lista cerrada (uno desconocido se ignora, no tumba el cierre) → hueco del mapa', () => {
  const con = leerPeticionCierre({ trabajoId: UUID, motivoFin: 'ambiguo', detalleFin: 'nodo_no_localizado' })
  assert.ok(con.ok && con.p.detalleFin === 'nodo_no_localizado')
  if (con.ok) assert.equal(huecoDeDetalleFin(con.p.motivoFin, con.p.detalleFin), 'fin «ambiguo» en el worker: nodo_no_localizado')
  const raro = leerPeticionCierre({ trabajoId: UUID, motivoFin: 'ambiguo', detalleFin: 'valor 12345678Z' })
  assert.ok(raro.ok && raro.p.detalleFin === null)
  const sin = leerPeticionCierre({ trabajoId: UUID, motivoFin: 'resultado' })
  assert.ok(sin.ok && sin.p.detalleFin === null)
  if (sin.ok) assert.equal(huecoDeDetalleFin(sin.p.motivoFin, sin.p.detalleFin), null)
})

test('prompt: el inventario va DELIMITADO como datos; sin NIF real visible; el system prohíbe emitir', () => {
  const l = leerPeticionPaso({ trabajoId: UUID, inventario: crudo })
  assert.ok(l.ok)
  if (!l.ok) return
  const pr = promptExplorador({ entrada: 'allianz:particulares:hogar', ramo: 'hogar', inventario: l.p.inventario, historial: [], conDatosReales: false, avancesFallidos: 0 })
  assert.match(pr, /<inventario>\n\{[\s\S]*\}\n<\/inventario>$/)
  assert.match(pr, /tomador\.nif NO tiene valor/)
  assert.doesNotMatch(pr, /00000000T/)
  // Lista única (14/10/2026): EMISIÓN nunca; Grabar/Guardar/Archivar pasan a «guardar el presupuesto», solo en resultado.
  assert.match(SYSTEM_EXPLORADOR, /EMISIÓN, NUNCA[^\n]*: Emitir, Contratar, Formalizar, Firmar, Pagar \/ Pago, Pago fraccionado, Tramitar póliza, Confirmar contratación, Domiciliar/)
  assert.match(SYSTEM_EXPLORADOR, /no instrucciones/)
})

test('prompt: guardar el presupuesto SOLO en resultado (efecto guardar_presupuesto) y las listas salen del módulo', () => {
  const l = lineaAccionesPortalParaIA()
  const nunca = SYSTEM_EXPLORADOR.split('\n').find((x) => x.startsWith('- EMISIÓN, NUNCA'))!
  const guardar = SYSTEM_EXPLORADOR.split('\n').find((x) => x.startsWith('- GUARDAR EL PRESUPUESTO'))!
  assert.ok(nunca.includes(l.emision) && nunca.includes(l.prohibidas), 'la línea de emisión sale de ACCIONES_PORTAL')
  assert.ok(guardar.includes(l.guardar), 'la línea de guardar sale de ACCIONES_PORTAL')
  // Ni Grabar ni Guardar ni Archivar en la lista de NUNCA; «Proyecto ampliado» tampoco (Alberto, 14/10/2026: es el proyecto que hay que descargarse → GUARDAR).
  for (const g of ['Grabar', 'Guardar', 'Archivar', 'Proyecto ampliado']) assert.ok(!nunca.includes(g), g)
  assert.ok(guardar.includes('Proyecto ampliado'))
  assert.match(guardar, /SOLO al llegar al precio[\s\S]*"resultado"[\s\S]*guardar_presupuesto/)
  assert.match(SYSTEM_EXPLORADOR, /efectoEsperado ∈ [^\n]*guardar_presupuesto/)
})

test('cierre: «presupuesto» opcional y ESTRICTO (sin forma de dato personal en la referencia)', () => {
  const sin = leerPeticionCierre({ trabajoId: UUID, motivoFin: 'resultado' })
  assert.ok(sin.ok && sin.p.presupuesto === null)
  const con = leerPeticionCierre({ trabajoId: UUID, motivoFin: 'resultado', efectosEnPortal: ['presupuesto_guardado'], presupuesto: { guardado: true, referencia: 'P2026-000123', pdf: true } })
  assert.ok(con.ok && con.p.presupuesto?.referencia === 'P2026-000123' && con.p.efectosEnPortal[0] === 'presupuesto_guardado')
  assert.equal(leerPeticionCierre({ trabajoId: UUID, motivoFin: 'resultado', presupuesto: { guardado: true, referencia: '12345678Z', pdf: true } }).ok, false)
  assert.equal(leerPeticionCierre({ trabajoId: UUID, motivoFin: 'resultado', presupuesto: { guardado: 'si' } }).ok, false)
})

test('prompt: pide el motivo en UNA frase de ≤200 caracteres (13/10/2026: un motivo largo tiró el paso 1 de Hogar)', () => {
  assert.match(SYSTEM_EXPLORADOR, /motivo en una frase de 200 caracteres como máximo/)
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
  const ia = f.indexOf('iaTexto(prompt, {')
  assert.ok(ia > 0)
  const llamada = f.slice(ia, f.indexOf('})', ia))
  assert.match(llamada, /modeloOpenRouter:\s*modelo/)
  assert.match(llamada, /cliente:\s*`explorador:\$\{e\.trabajoId\}`/)
  assert.match(llamada, /privado:\s*true/)
  assert.match(f, /ejecutarPaso<Bd>\(/)
  // El orden (parada, bucle, topes y reserva ANTES de la IA; validación DESPUÉS) vive en la orquestación.
  const o = readFileSync(path.join(aqui, 'tarificador-explorador-paso.ts'), 'utf8')
  const llamaIA = o.indexOf('await d.ia(decision.prompt)')
  assert.ok(llamaIA > 0)
  for (const antes of ['detectarParada(', 'detectarBucle(', 'comprobarTopes(consumo, topes, peor)', 'await d.reservarIA(bd)']) {
    const i = o.indexOf(antes)
    assert.ok(i > 0 && i < llamaIA, `${antes} tiene que ir ANTES de la llamada a la IA`)
  }
  assert.ok(o.indexOf('validarRespuestaExplorador(texto, ctx)') > llamaIA)
  // Nunca el inventario ni el texto de la IA en un log.
  for (const m of [...f.matchAll(/console\.(?:log|warn|error)\(([^\n]*)/g), ...o.matchAll(/console\.(?:log|warn|error)\(([^\n]*)/g)]) assert.doesNotMatch(m[1], /inventario|texto|prompt|respuesta/)
})

// PII (13/10/2026): el inventario se REDACTA con los valores del riesgo ANTES de la IA y de guardarlo; sin riesgo, para.
test('ruta paso: redacta el inventario antes de la IA y de registrarPaso; con datos reales sin riesgo → para sin lock ni IA', () => {
  const f = readFileSync(path.join(aqui, '..', 'app', 'api', 'tarificador', 'explorador', 'paso', 'route.ts'), 'utf8')
  const redacta = f.indexOf('redactarValoresInventario(p.inventario, valores)')
  const lock = f.indexOf('conLockExploracion(e, fn)')
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
  // La transacción del lock ya no envuelve la IA: corta (la IA va FUERA, ver tarificador-explorador-paso.test.ts).
  assert.match(lib, /const TIMEOUT_TX_PASO_MS = 15_000/)
  assert.doesNotMatch(lib, /iaTexto/)
  const f = readFileSync(path.join(aqui, '..', 'app', 'api', 'tarificador', 'explorador', 'paso', 'route.ts'), 'utf8')
  assert.match(f, /err instanceof PasoOcupado\) return NextResponse\.json\(\{ estado: 'conflicto', motivo: 'paso_en_curso' \}, \{ status: 409 \}\)/)
})

// ─── Cierre de la cabecera y reserva de IA (revisión de #4576) ───────────────

test('RESERVA_IA_MS > maxDuration de la ruta de paso (la reserva no caduca antes de que el paso termine)', () => {
  const ruta = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/api/tarificador/explorador/paso/route.ts'), 'utf8')
  const m = /export const maxDuration = (\d+)/.exec(ruta)
  assert.ok(m, 'la ruta declara maxDuration')
  assert.ok(RESERVA_IA_MS > Number(m[1]) * 1000, `RESERVA_IA_MS (${RESERVA_IA_MS}) debe superar maxDuration (${m[1]} s)`)
})

test('estadoFalloExploracion: infra con la cabecera ya cerrada NO se reintenta', () => {
  assert.equal(estadoFalloExploracion('error_reintentable', true), 'error_definitivo')
  assert.equal(estadoFalloExploracion('error_reintentable', false), 'error_reintentable')
  assert.equal(estadoFalloExploracion('error_definitivo', true), 'error_definitivo')
  assert.equal(estadoFalloExploracion('requiere_humano', false), 'requiere_humano')
})

test('cierraCabeceraTrasFallo: todo fallo que no se reintenta cierra la cabecera', () => {
  assert.equal(cierraCabeceraTrasFallo('error_definitivo'), true)
  assert.equal(cierraCabeceraTrasFallo('requiere_humano'), true)
  assert.equal(cierraCabeceraTrasFallo('error_reintentable'), false)
})

test('exploradoValido: «explorado» solo con la cabecera cerrada (sin cabecera = no)', () => {
  assert.equal(exploradoValido(true), true)
  assert.equal(exploradoValido(false), false)
  assert.equal(exploradoValido(null), false)
  assert.equal(exploradoValido(undefined), false)
})

test('registrarResultado: el cableado de las reglas de cierre existe en tarificador.ts y registrarPaso solo limpia la reserva de un paso de IA', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const t = readFileSync(path.join(dir, 'tarificador.ts'), 'utf8')
  assert.match(t, /exploradoValido\(cab\[0\]\?\.cerrada\)/)
  assert.match(t, /estadoFalloExploracion\(estado,/)
  assert.match(t, /cierraCabeceraTrasFallo\(estado\)/)
  const x = readFileSync(path.join(dir, 'tarificador-explorador.ts'), 'utf8')
  assert.match(x, /ia_en_vuelo_hasta = case when \$\{llamada\}::boolean then null else ia_en_vuelo_hasta end/)
})

test('encolar por oportunidad: monta el riesgo con el helper puro y guarda el ancla en oportunidad_id', () => {
  const f = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'tarificador-explorador.ts'), 'utf8')
  assert.match(f, /riesgoExploracionDeOportunidad\(/)
  assert.match(f, /personaDeFicha\(e\.correduriaId, f\.cliente_id, 'hogar'\)/)
  assert.match(f, /trabajo_origen_id, oportunidad_id, compania/)
  assert.match(f, /oportunidad_incompleta: \$\{partes\.join/)
  assert.match(f, /id no reconocido en \$\{r\.noReconocidos\.join/)
  // Solo oportunidades ABIERTAS, con la lista del módulo (nada de estados escritos a mano).
  assert.match(f, /\(ESTADOS_OPORTUNIDAD_ABIERTA as readonly string\[\]\)\.includes\(f\.estado \?\? ''\)\) return \{ estado: 'rechazado', status: 409, motivo: `oportunidad_cerrada/)
  assert.match(f, /o\.estado::text as estado/)
  const r = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/api/operador/tarificador/exploracion/route.ts'), 'utf8')
  assert.match(r, /oportunidadId: l\.p\.oportunidadId/)
})

test('prompt ↔ validador: los motivos de parar del prompt son EXACTAMENTE los que acepta el validador (exploración 313a04d1)', () => {
  const linea = SYSTEM_EXPLORADOR.split('\n').find((l) => l.startsWith('- parar {motivo}:'))
  assert.ok(linea, 'el prompt tiene la línea de parar')
  const lista = linea!.slice(linea!.indexOf('sin más texto:') + 'sin más texto:'.length)
  const codigos = [...lista.matchAll(/(?:^|\|)\s*([a-z_]+) \(/g)].map((m) => m[1])
  assert.deepEqual(codigos, [...MOTIVOS_PARAR])
  const l = leerPeticionPaso({ trabajoId: UUID, inventario: crudo })
  assert.ok(l.ok)
  if (!l.ok) return
  for (const c of codigos) {
    const r = validarRespuestaExplorador({ version: 1, pantalla: { nombre: null, tipo: 'otro' }, acciones: [{ accion: 'parar', motivo: c }], mapeo: [], motivo: null }, { inventario: l.p.inventario, ramo: 'hogar', entrada: 'allianz:particulares:hogar', datosReales: null })
    assert.ok(r.ok, `el validador acepta «${c}», que pide el prompt`)
  }
})

test('motivo_fin: una sola lista; incluye todos los de parar (ambiguo incluido) y lo que pone el sistema', () => {
  assert.deepEqual([...MOTIVOS_FIN], [...MOTIVOS_FIN_EXPLORACION])
  for (const m of MOTIVOS_PARAR) assert.ok(MOTIVOS_FIN.includes(m), m)
  for (const m of ['ambiguo', 'resultado', 'bucle', 'tope', 'error_portal', 'guard_emision'] as const) assert.ok(MOTIVOS_FIN.includes(m), m)
  assert.ok(leerPeticionCierre({ trabajoId: UUID, motivoFin: 'ambiguo' }).ok)
})

test('prompt: botón de avance deshabilitado → rellenar sin avanzar, no parar (exploración 313a04d1: SIGUIENTE deshabilitado)', () => {
  assert.match(SYSTEM_EXPLORADOR, /deshabilitado porque faltan campos, manda SOLO los rellenar/)
  assert.match(SYSTEM_EXPLORADOR, /EXACTAMENTE uno de estos códigos, sin más texto/)
})

test('🪤 campos INVÁLIDOS (14/10/2026): el inventario los marca (solo el booleano, solo en controles), viajan a la IA y el prompt manda rellenarlos antes de avanzar', () => {
  const inv = sanearInventarioDom({
    marcos: [{
      url: 'https://portal.example.test/alta', titulos: [{ texto: 'Datos', tag: 'h2' }],
      elementos: [
        { tag: 'input', id: 'anio', type: 'text', conValor: false, requerido: true, invalido: true },
        { tag: 'input', id: 'm2', type: 'text', conValor: true, invalido: false },
        { tag: 'button', id: 'sig', texto: 'Siguiente', invalido: true },
      ],
    }],
  }, undefined, { refs: true })!
  const els = inv.marcos[0].elementos
  assert.equal(els[0].invalido, true)
  assert.equal(els[1].invalido, undefined)
  assert.equal(els[2].invalido, undefined, 'un botón no es un campo')
  const prompt = promptExplorador({ entrada: 'allianz:particulares:hogar', ramo: 'hogar', inventario: inv, historial: [], conDatosReales: false, avancesFallidos: 0 })
  assert.match(prompt, /"invalido":true/)
  assert.match(SYSTEM_EXPLORADOR, /"invalido"[^\n]*requerido[^\n]*NO avances/)
})
