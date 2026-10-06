// Cepos del formador con IA del tarificador RPA (06/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  CONFIANZA_MINIMA,
  costeEstimado,
  eventoCierre,
  formadorActivo,
  incidenciasResultado,
  leerEstructura,
  leerPeticionRevisar,
  leerPeticionSugerir,
  maxLlamadasIA,
  parsearRespuestaRevisar,
  parsearRespuestaSugerir,
  primerObjetoJson,
  promptSugerir,
  quedanLlamadas,
} from './tarificador-formador-reglas.ts'

const T = '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b'
const CAND = [
  { tag: 'button', id: 'btnCalc', texto: 'Calcular', marco: 'appArea' },
  { tag: 'input', type: 'text', name: 'superficie', etiqueta: 'Superficie construida' },
]

test('kill-switch: solo «1» exacto enciende', () => {
  assert.equal(formadorActivo({}), false)
  assert.equal(formadorActivo({ TARIFICADOR_FORMADOR_ACTIVO: 'true' }), false)
  assert.equal(formadorActivo({ TARIFICADOR_FORMADOR_ACTIVO: ' 1' }), false)
  assert.equal(formadorActivo({ TARIFICADOR_FORMADOR_ACTIVO: '1' }), true)
})

test('tope de llamadas por trabajo', () => {
  assert.equal(maxLlamadasIA({}), 12)
  assert.equal(maxLlamadasIA({ TARIFICADOR_FORMADOR_MAX_LLAMADAS: '5' }), 5)
  assert.equal(maxLlamadasIA({ TARIFICADOR_FORMADOR_MAX_LLAMADAS: '0' }), 12)
  assert.equal(maxLlamadasIA({ TARIFICADOR_FORMADOR_MAX_LLAMADAS: '999' }), 12)
  assert.equal(quedanLlamadas(4, 5), true)
  assert.equal(quedanLlamadas(5, 5), false)
  assert.equal(quedanLlamadas(Number.NaN, 5), false)
})

test('estructura: lista blanca de claves (un value no pasa) y datos personales tapados', () => {
  const e = leerEstructura([{ tag: 'INPUT', type: 'text', value: '12345678Z', etiqueta: 'NIF 12345678Z', name: 'nif' }])!
  assert.equal(e.length, 1)
  assert.ok(!('value' in e[0]))
  assert.equal(e[0].tag, 'input')
  assert.ok(!JSON.stringify(e).includes('12345678Z'))
  assert.equal(leerEstructura([]), null)
  assert.equal(leerEstructura([{ tag: '<script>' }]), null)
  assert.equal(leerEstructura(new Array(401).fill({ tag: 'a' })), null)
})

test('petición sugerir: valida cabecera, clave, tipo y estructura', () => {
  const ok = leerPeticionSugerir({ trabajoId: T, compania: 'Allianz', ramo: 'comunidades', clave: 'calcular', tipo: 'accion', descripcion: 'botón Calcular', estructura: CAND })
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(ok.p.compania, 'allianz')
    assert.match(promptSugerir(ok.p), /#0 <button> id=btnCalc texto="Calcular"/)
  }
  const mal = leerPeticionSugerir({ trabajoId: 'x', compania: 'allianz', ramo: 'comunidades', clave: 'Calcular!', tipo: 'pulsar', estructura: [] })
  assert.ok(!mal.ok)
  if (!mal.ok) assert.equal(mal.errores.length, 4)
})

test('respuesta IA de sugerir: JSON con prosa/fences, índice en rango y confianza mínima', () => {
  assert.deepEqual(parsearRespuestaSugerir('```json\n{"indice": 0, "confianza": 0.9, "motivo": "texto Calcular"}\n```', 2), { indice: 0, confianza: 0.9, motivo: 'texto Calcular' })
  assert.equal(parsearRespuestaSugerir('Creo que {"indice": 1, "confianza": 0.8, "motivo": "x"} es', 2)?.indice, 1)
  assert.equal(parsearRespuestaSugerir('{"indice": 2, "confianza": 0.9}', 2), null, 'fuera de rango')
  assert.equal(parsearRespuestaSugerir('{"indice": -1, "confianza": 0.9}', 2), null)
  assert.equal(parsearRespuestaSugerir('{"indice": 0.5, "confianza": 0.9}', 2), null)
  assert.equal(parsearRespuestaSugerir(`{"indice": 0, "confianza": ${CONFIANZA_MINIMA - 0.01}}`, 2), null, 'confianza baja')
  assert.equal(parsearRespuestaSugerir('{"indice": null, "confianza": 0.9}', 2), null)
  assert.equal(parsearRespuestaSugerir('no sé', 2), null)
  assert.equal(parsearRespuestaSugerir('{"indice": 0, "confianza": 0.9', 2), null, 'JSON roto')
  assert.deepEqual(primerObjetoJson('{"a": "llave } dentro", "b": 1}'), { a: 'llave } dentro', b: 1 })
})

test('respuesta IA de revisar-paso: solo `true` exacto bloquea; ilegible → null', () => {
  const r = parsearRespuestaRevisar(JSON.stringify({
    enPantallaEsperada: false,
    avisos: [
      { texto: 'La fecha de efecto no puede ser anterior a hoy', interpretacion: 'Hay que poner la fecha de efecto de hoy en adelante', bloqueante: true },
      { texto: 'Recuerde revisar las coberturas', interpretacion: 'Informativo', bloqueante: 'true' },
      { texto: '', interpretacion: 'sin texto: se descarta' },
    ],
    sugerencias: ['Revisar la fecha de efecto del riesgo', 42],
  }))!
  assert.equal(r.enPantallaEsperada, false)
  assert.equal(r.avisos.length, 2)
  assert.equal(r.avisos[0].bloqueante, true)
  assert.equal(r.avisos[1].bloqueante, false)
  assert.deepEqual(r.sugerencias, ['Revisar la fecha de efecto del riesgo'])
  assert.equal(parsearRespuestaRevisar('todo bien'), null)
  assert.equal(parsearRespuestaRevisar('{}'), null)
})

test('revisar-paso: avisos limpiados de PII; resultado → coherencia de precio determinista', () => {
  const l = leerPeticionRevisar({
    trabajoId: T, compania: 'allianz', ramo: 'comunidades', paso: 'resultado', pantallaEsperada: 'Tarificar: tabla de primas',
    estructura: [], textosAviso: ['Cliente 12345678Z con deuda', '   ', 7],
    valoresLeidos: { primaNetaEur: 1000, impuestosEur: 80, primaTotalEur: 1200, modalidad: 'estandar' }, modalidadPedida: 'estandar',
  })
  assert.ok(l.ok)
  if (!l.ok) return
  assert.deepEqual(l.p.textosAviso, ['Cliente [DATO] con deuda'])
  const inc = incidenciasResultado(l.p)
  assert.ok(inc.some((i) => i.codigo === 'descuadre' && i.bloqueante))
  assert.deepEqual(incidenciasResultado({ ...l.p, paso: 'formulario' }), [])
  assert.ok(!leerPeticionRevisar({ trabajoId: T, compania: 'allianz', ramo: 'comunidades', paso: 'emitir', pantallaEsperada: 'x', estructura: [] }).ok)
})

test('cierre: evento del contador del modo acompañado', () => {
  assert.equal(eventoCierre('ok', false), 'exito_sin_ia')
  assert.equal(eventoCierre('ok', true), 'exito_con_ia')
  assert.equal(eventoCierre('error', false), 'fallo')
})

test('coste estimado: positivo, pequeño y con 6 decimales', () => {
  const c = costeEstimado(8000, 400)
  assert.ok(c > 0 && c < 0.01)
  assert.equal(Math.round(c * 1e6) / 1e6, c)
  assert.equal(costeEstimado(-5, -5), 0)
})

test('rutas: las del worker usan el secreto del worker y el kill-switch; la de operador, el de operador', () => {
  const base = new URL('../app/api/', import.meta.url).pathname
  for (const r of ['sugerir', 'conocimiento', 'confirmar', 'revisar-paso', 'cierre']) {
    const p = `${base}tarificador/formador/${r}/route.ts`
    assert.ok(existsSync(p), `falta ${p}`)
    const src = readFileSync(p, 'utf8')
    assert.match(src, /if \(!workerAutorizado\(req\)\) return/, `${r}: sin el Bearer del worker`)
    assert.match(src, /formadorActivo\(process\.env\)/, `${r}: sin kill-switch`)
    assert.ok(!/operadorAutorizado/.test(src), `${r}: el worker no usa el secreto de operador`)
  }
  for (const r of ['sugerir', 'revisar-paso']) {
    const src = readFileSync(`${base}tarificador/formador/${r}/route.ts`, 'utf8')
    // Tope ATÓMICO: la llamada a la IA va DENTRO de conLlamadaIA (lock por trabajo + cuenta + registro en una transacción).
    assert.ok(src.indexOf('conLlamadaIA(') > -1 && src.indexOf('conLlamadaIA(') < src.indexOf('preguntarIA('), `${r}: la IA se llama dentro de conLlamadaIA`)
    assert.ok(!/llamadasIAUsadas|quedanLlamadas\(/.test(src), `${r}: nada de contar fuera de la transacción (carrera)`)
    const tras = src.slice(src.indexOf('preguntarIA('))
    assert.ok(!/registrarIntervencion\(\{[^}]*llamadaIA: true/.test(tras), `${r}: el registro de una llamada a la IA va por \`registrar\` (en la transacción)`)
    assert.ok(src.indexOf('trabajoVivo(') < src.indexOf('preguntarIA('), `${r}: solo un trabajo en curso gasta IA`)
  }
  const lib = readFileSync(new URL('./tarificador-formador.ts', import.meta.url).pathname, 'utf8')
  const f = lib.slice(lib.indexOf('export async function conLlamadaIA'))
  assert.ok(f.indexOf('pg_advisory_xact_lock') > -1 && f.indexOf('pg_advisory_xact_lock') < f.indexOf('quedanLlamadas(') && f.indexOf('quedanLlamadas(') < f.indexOf('await llamar('), 'conLlamadaIA: lock → cuenta → llamada, en ese orden')
  assert.match(f, /prisma\.\$transaction\(/)
  const op = readFileSync(`${base}operador/tarificador/intervenciones/route.ts`, 'utf8')
  assert.match(op, /operadorAutorizado\(req\)/)
  assert.match(op, /correduriaUnica\(\)/)
  assert.ok(!/export\s+(async\s+)?function\s+(POST|PATCH|PUT|DELETE)/.test(op), 'la intranet solo LEE')
})
