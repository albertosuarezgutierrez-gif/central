// Reglas puras de las ofertas de una oportunidad (F2, 05/10/2026). Fixtures ANÓNIMOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarEdicion, caducidadOfertas, datosAceptacionOfertas, gruposAceptacionOfertas, opcionesDeOfertas,
  seleccionarParaConsolidar, sobreCoberturasDeOferta, validarEdicionOferta, type FilaOferta,
} from './ofertas-reglas.ts'

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const fila = (p: Partial<FilaOferta>): FilaOferta => ({
  id: ID(1), oportunidadId: ID(99), documentoId: null, rol: 'oferta', compania: 'Compañía B', producto: 'Plus',
  primaNeta: null, primaTotal: '600.00', garantias: {}, datosExtra: null, estado: 'revisada', recomendada: false,
  revisadaAt: new Date('2026-10-05T10:00:00Z'), revisadaPor: 'alberto', createdAt: new Date('2026-10-05T09:00:00Z'), ...p,
})

test('PATCH: zod rechaza lo que no es (campos de más, importes negativos, uuid roto)', () => {
  assert.equal(validarEdicionOferta({ ofertaId: ID(1), primaTotal: -3 }).ok, false)
  assert.equal(validarEdicionOferta({ ofertaId: 'x' }).ok, false)
  assert.equal(validarEdicionOferta({ ofertaId: ID(1), colado: true }).ok, false)
  assert.equal(validarEdicionOferta({ ofertaId: ID(1), primaTotal: null, estado: 'revisada' }).ok, true)
})

test('editar un DATO de una revisada la devuelve a «extraida»; revisar en la misma petición la revisa', () => {
  const e1 = validarEdicionOferta({ ofertaId: ID(1), primaTotal: 610 })
  assert.ok(e1.ok)
  const r1 = aplicarEdicion({ rol: 'oferta', compania: 'B', estado: 'revisada', recomendada: true }, e1.edicion)
  assert.ok(r1.ok && r1.cambios.estado === 'extraida' && !r1.cambios.revisar)
  const e2 = validarEdicionOferta({ ofertaId: ID(1), primaTotal: 610, estado: 'revisada' })
  assert.ok(e2.ok)
  const r2 = aplicarEdicion({ rol: 'oferta', compania: 'B', estado: 'revisada', recomendada: false }, e2.edicion)
  assert.ok(r2.ok && r2.cambios.estado === 'revisada' && r2.cambios.revisar)
})

test('revisar sin compañía, recomendar la póliza actual o una descartada: no', () => {
  const rev = validarEdicionOferta({ ofertaId: ID(1), estado: 'revisada' })
  assert.ok(rev.ok)
  assert.equal(aplicarEdicion({ rol: 'oferta', compania: null, estado: 'extraida', recomendada: false }, rev.edicion).ok, false)
  const rec = validarEdicionOferta({ ofertaId: ID(1), recomendada: true })
  assert.ok(rec.ok)
  assert.equal(aplicarEdicion({ rol: 'actual', compania: 'A', estado: 'revisada', recomendada: false }, rec.edicion).ok, false)
  assert.equal(aplicarEdicion({ rol: 'oferta', compania: 'A', estado: 'descartada', recomendada: false }, rec.edicion).ok, false)
  // Descartar quita la recomendación.
  const desc = validarEdicionOferta({ ofertaId: ID(1), estado: 'descartada' })
  assert.ok(desc.ok)
  const r = aplicarEdicion({ rol: 'oferta', compania: 'A', estado: 'revisada', recomendada: true }, desc.edicion)
  assert.ok(r.ok && r.cambios.recomendada === false)
})

test('consolidar exige TODAS revisadas (también la póliza actual viva) y con prima total', () => {
  const sinRevisar = seleccionarParaConsolidar([fila({ id: ID(1) }), fila({ id: ID(2), estado: 'extraida', compania: 'Compañía C' })], null)
  assert.ok(!sinRevisar.ok && sinRevisar.motivo === 'sin_revisar' && /Compañía C/.test(sinRevisar.detalle))
  const actualSinRevisar = seleccionarParaConsolidar([fila({ id: ID(1) }), fila({ id: ID(3), rol: 'actual', estado: 'extraida' })], null)
  assert.ok(!actualSinRevisar.ok && actualSinRevisar.motivo === 'sin_revisar')
  const sinPrima = seleccionarParaConsolidar([fila({ id: ID(1), primaTotal: null })], null)
  assert.ok(!sinPrima.ok && sinPrima.motivo === 'sin_prima')
  // Una descartada no cuenta ni bloquea.
  const ok = seleccionarParaConsolidar([fila({ id: ID(1) }), fila({ id: ID(2), estado: 'descartada', primaTotal: null })], null)
  assert.ok(ok.ok && ok.ofertas.length === 1)
  // Elegir una que no existe (o la actual) es un error con nombre.
  const ajena = seleccionarParaConsolidar([fila({ id: ID(1) })], [ID(7)])
  assert.ok(!ajena.ok && ajena.motivo === 'no_encontrada')
  assert.ok(!seleccionarParaConsolidar([], null).ok)
})

test('opciones: recomendada primero, luego de menor a mayor prima; condicionado, SIN ReRate', () => {
  const ops = opcionesDeOfertas('comunidades', [
    fila({ id: ID(1), primaTotal: '700.00' }),
    fila({ id: ID(2), primaTotal: '500.00' }),
    fila({ id: ID(3), primaTotal: '900.00', recomendada: true, datosExtra: { franquiciaGeneral: 300 } }),
  ], new Date('2026-10-05T10:00:00Z'))
  assert.deepEqual(ops.map((o) => o.ofertaId), [ID(3), ID(2), ID(1)])
  assert.deepEqual(ops.map((o) => o.orden), [1, 2, 3])
  assert.deepEqual(ops[0]!.papeles, ['recomendada'])
  assert.deepEqual(ops[1]!.papeles, [])
  assert.equal(ops[0]!.franquiciaEur, 300)
  assert.equal(ops[1]!.franquiciaEur, null, 'sin franquicia general declarada = null, jamás 0')
  for (const o of ops) {
    assert.equal(o.requiereRerate, false)
    assert.equal(o.firmeza, 'condicionado')
  }
})

test('coberturas: solo lo que CONSTA; «excluida» = incluida:false; sin estado ni cifra no se lista', () => {
  const s = sobreCoberturasDeOferta('comunidades', {
    continente: { estado: null, capital: 250000, limite: null, franquicia: null },
    defensa_juridica: { estado: 'excluida', capital: null, limite: null, franquicia: null },
    danos_agua: { estado: null, capital: null, limite: null, franquicia: null },
  }, { literales: { continente: 'Continente (edificio)' } }, new Date('2026-10-05T10:00:00Z'))
  assert.equal(s.estado, 'leidas')
  assert.deepEqual(s.lista.map((c) => [c.nombre, c.incluida]), [['Continente (edificio)', true], [s.lista[1]!.nombre, false]])
  assert.match(s.lista[0]!.texto ?? '', /250\.000,00€/)
  assert.equal(sobreCoberturasDeOferta('comunidades', {}, null, new Date()).estado, 'vacias')
})

test('caducidad: la que ya venció bloquea; la validez más próxima manda en vence_el', () => {
  const c = caducidadOfertas([
    fila({ datosExtra: { validezHasta: '2026-10-20' } }),
    fila({ datosExtra: { validezHasta: '2026-10-10' } }),
    fila({ datosExtra: null }),
  ], '2026-10-05')
  assert.deepEqual(c.caducadas, [])
  assert.equal(c.expira?.toISOString(), '2026-10-10T23:59:59.000Z')
  assert.deepEqual(caducidadOfertas([fila({ compania: 'Vieja', datosExtra: { validezHasta: '2026-10-01' } })], '2026-10-05').caducadas, ['Vieja'])
  assert.equal(caducidadOfertas([fila({})], '2026-10-05').expira, null)
})

test('aceptación de ofertas: misma forma que los datos cotizados y huella determinista', () => {
  const g = gruposAceptacionOfertas({ tomador: 'Comunidad Ejemplo', compania: 'Compañía B', producto: null })
  const a = datosAceptacionOfertas(g)
  const b = datosAceptacionOfertas(g)
  assert.equal(a.estado, 'ok')
  assert.equal(a.huella, b.huella)
  assert.match(a.texto, /Compañía B/)
  assert.match(a.texto, /corredor/)
})
