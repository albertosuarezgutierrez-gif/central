import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decidirDeclarada, decidirRenovacion, enVentanaExpediente, enVentanaRenovacion, renovacionResuelta, tipoDeRamoDeclarado,
  type CandidatoDeclarada, type CandidatoRenovacion,
} from './expedientes-auto-reglas.ts'

const HOY = '2026-10-13'
const sumar = (d: number) => { const x = new Date(`${HOY}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }

const ren = (o: Partial<CandidatoRenovacion> = {}): CandidatoRenovacion => ({
  importRef: null, eiacXmlHash: 'h', estado: 'en_vigor', sustituidaAt: null,
  vence: sumar(45), ramo: 'auto', compania: 'Mapfre', numeroPoliza: '123', yaAbierta: false, yaEsteCiclo: false, ...o,
})
const dec = (o: Partial<CandidatoDeclarada> = {}): CandidatoDeclarada => ({
  declaradaId: 'd1', clienteId: 'c1', vence: sumar(55), ramo: 'hogar', compania: 'Allianz', yaAbierta: false, yaEsteCiclo: false, yaEnCartera: false, ...o,
})

test('ventana 60→30 días, bordes incluidos (art. 22 LCS: dos meses la compañía, un mes el tomador)', () => {
  assert.equal(enVentanaExpediente(60), true)
  assert.equal(enVentanaExpediente(30), true)
  assert.equal(enVentanaExpediente(61), false)
  assert.equal(enVentanaExpediente(29), false)
})

test('ventana de RENOVACIÓN: de 60 días antes al mismo día del vencimiento, bordes incluidos', () => {
  assert.equal(enVentanaRenovacion(60), true)
  assert.equal(enVentanaRenovacion(0), true)
  assert.equal(enVentanaRenovacion(61), false)
  assert.equal(enVentanaRenovacion(-1), false)
})

test('renovación de cartera en vigor dentro de la ventana: se abre, con la acción HOY', () => {
  for (const d of [0, 2, 19, 29, 30, 45, 60]) {
    const r = decidirRenovacion(ren({ vence: sumar(d) }), HOY)
    assert.equal(r.abrir, true, `a ${d} días`)
    if (r.abrir) { assert.equal(r.fechaAccion, HOY); assert.equal(r.dias, d); assert.match(r.texto, d >= 30 ? /antes del .*hasta entonces puede no renovar/ : /plazo del art\. 22 LCS para no renovar acabó/) }
  }
})

test('fuera de ventana (más de 60 días, o ya vencida) no se abre', () => {
  assert.deepEqual(decidirRenovacion(ren({ vence: sumar(61) }), HOY), { abrir: false, motivo: 'fuera_de_ventana', dias: 61 })
  assert.deepEqual(decidirRenovacion(ren({ vence: sumar(-1) }), HOY), { abrir: false, motivo: 'fuera_de_ventana', dias: -1 })
})

test('la regla de no duplicar por ciclo se mantiene también a menos de 30 días', () => {
  assert.deepEqual(decidirRenovacion(ren({ vence: sumar(5), yaEsteCiclo: true }), HOY), { abrir: false, motivo: 'ya_tratada_este_ciclo', dias: 5 })
  assert.deepEqual(decidirRenovacion(ren({ vence: sumar(5), yaAbierta: true }), HOY), { abrir: false, motivo: 'ya_abierta', dias: 5 })
})

test('el volcado histórico y la cancelada NO son cartera en vigor (nunca `clientes.tipo`)', () => {
  assert.equal(decidirRenovacion(ren({ importRef: 'intranet:1', eiacXmlHash: null }), HOY).abrir, false)
  assert.equal(decidirRenovacion(ren({ estado: 'cancelada' }), HOY).abrir, false)
  assert.equal(decidirRenovacion(ren({ sustituidaAt: new Date() }), HOY).abrir, false)
})

test('sin duplicar: ya hay una abierta (aparcadas incluidas) o este ciclo ya tuvo la suya aunque se cerrara', () => {
  assert.deepEqual(decidirRenovacion(ren({ yaAbierta: true }), HOY), { abrir: false, motivo: 'ya_abierta', dias: 45 })
  assert.deepEqual(decidirRenovacion(ren({ yaEsteCiclo: true }), HOY), { abrir: false, motivo: 'ya_tratada_este_ciclo', dias: 45 })
})

test('vencimiento ilegible: no se inventa un día', () => {
  assert.deepEqual(decidirRenovacion(ren({ vence: null }), HOY), { abrir: false, motivo: 'sin_vencimiento', dias: null })
  assert.deepEqual(decidirRenovacion(ren({ vence: '2026-02-31' }), HOY), { abrir: false, motivo: 'sin_vencimiento', dias: null })
})

test('declarada: misma ventana; la primera acción sigue la regla única (45 días antes, nunca antes de mañana)', () => {
  const r = decidirDeclarada(dec({ vence: sumar(55) }), HOY)
  assert.equal(r.abrir, true)
  if (r.abrir) assert.equal(r.fechaAccion, sumar(10))
  const t = decidirDeclarada(dec({ vence: sumar(35) }), HOY)
  if (t.abrir) assert.equal(t.fechaAccion, sumar(1))
  else assert.fail('a 35 días debería abrirse')
})

test('declarada sin vínculo a ficha: no se abre (no hay a quién llamar) y se dice por qué', () => {
  assert.deepEqual(decidirDeclarada(dec({ clienteId: null }), HOY), { abrir: false, motivo: 'sin_vincular', dias: 55 })
  assert.equal(decidirDeclarada(dec({ yaAbierta: true }), HOY).abrir, false)
  assert.equal(decidirDeclarada(dec({ yaEsteCiclo: true }), HOY).abrir, false)
  // Su nº ya está en nuestra cartera: es NUESTRA, no se le «pasa precio» (misma regla que `leadDeclarada`).
  assert.deepEqual(decidirDeclarada(dec({ yaEnCartera: true }), HOY), { abrir: false, motivo: 'ya_en_cartera', dias: 55 })
})

test('ramo declarado desconocido → «otros» (nunca un cast que tumbe el lote)', () => {
  assert.equal(tipoDeRamoDeclarado('hogar'), 'hogar')
  assert.equal(tipoDeRamoDeclarado('barco'), 'otros')
  assert.equal(tipoDeRamoDeclarado(null), 'otros')
})

test('cierre solo con PRUEBA: renovó (vence más tarde y en vigor) o la sustituyó otra', () => {
  assert.equal(renovacionResuelta({ venceExpediente: '2026-11-20', venceActual: '2027-11-20', enVigor: true, sustituida: false }), 'renovada')
  assert.equal(renovacionResuelta({ venceExpediente: '2026-11-20', venceActual: '2026-11-20', enVigor: true, sustituida: false }), null)
  // Cancelada: es una pérdida y se revisa aparte; no se da por «ganada».
  assert.equal(renovacionResuelta({ venceExpediente: '2026-11-20', venceActual: '2027-11-20', enVigor: false, sustituida: false }), null)
  assert.equal(renovacionResuelta({ venceExpediente: null, venceActual: '2027-11-20', enVigor: true, sustituida: false }), null)
  assert.equal(renovacionResuelta({ venceExpediente: '2026-11-20', venceActual: null, enVigor: false, sustituida: true }), 'sustituida')
})

// ── Cepos estáticos de la escritura ─────────────────────────────────────────

const SRC = readFileSync(join(import.meta.dirname, 'expedientes-auto.ts'), 'utf8')
const DETECTOR = readFileSync(join(import.meta.dirname, 'eventos-cartera.ts'), 'utf8')

test('la inserción es idempotente por ciclo (`where not exists` con origen + póliza/declarada + vence)', () => {
  const ins = SRC.slice(SRC.indexOf('insert into oportunidades'), SRC.indexOf('returning id::text as id'))
  assert.match(ins, /where not exists \(/)
  assert.match(ins, /info_riesgo->>'vence' = \$\{a\.vence\}/)
})

test('toda consulta de oportunidades/pólizas/vínculos va filtrada por correduría (BYPASSRLS)', () => {
  for (const tabla of ['from oportunidades o', 'from oportunidades x', 'from polizas p', 'from portal_vinculo v']) {
    let i = SRC.indexOf(tabla)
    assert.ok(i >= 0, tabla)
    while (i >= 0) {
      const tramo = SRC.slice(i, i + 400)
      assert.match(tramo, /correduria_id = \$\{correduriaId\}::uuid|correduria_id = b\.correduria_id|correduria_id = o\.correduria_id/, `${tabla} sin correduría: ${tramo.slice(0, 120)}`)
      i = SRC.indexOf(tabla, i + 1)
    }
  }
})

test('la bolsa del volcado sin tocar no tapa una renovación (no cuenta como «ya abierta»)', () => {
  assert.match(SRC, /not \(o\.import_ref is not null and o\.estado::text = 'competencia'\)/)
})

test('el detector llama a la generación DENTRO de su candado y con su punto de guardado', () => {
  const lock = DETECTOR.indexOf('pg_advisory_xact_lock')
  const sp = DETECTOR.indexOf('savepoint expedientes_auto')
  const gen = DETECTOR.indexOf('generarExpedientesAuto(tx')
  assert.ok(lock >= 0 && sp > lock && gen > sp, 'generarExpedientesAuto debe ir tras el candado y dentro de su savepoint')
  assert.match(DETECTOR, /rollback to savepoint expedientes_auto/)
})
