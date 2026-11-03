import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  empaquetarMetaPrivado, desempaquetarMetaPrivado, detectarPreRehuse, validarValoracion, correccionesDeValoraciones, tienePrivado,
} from './siniestro-privado.ts'

const cifrar = (t: string) => 'v1:' + Buffer.from(t, 'utf8').toString('base64').repeat(1) // ~1,33×
const descifrar = (s: string) => Buffer.from(s.slice(3), 'base64').toString('utf8')
const VER = { semaforo: 'no_defendible', confianza: 'alta', derivar: 'abogado', resumen: 'Juan Pérez, DNI 12345678Z', argumentos: [] }

test('empaquetar: PII fuera del claro, solo semáforo/confianza/derivar/huellas/conteos', () => {
  const meta = { modelo: 'm', huellaHilo: 'h', llamadas: [], fichaCaso: { x: 'Juan' }, veredicto: VER, indicePoliza: { garantias: [], exclusiones: [] }, fichaPerito: { n: 1 }, citas: { verificadas: ['a', 'b'], noEncontradas: ['c'] } }
  const { meta: m } = empaquetarMetaPrivado(meta, cifrar, 20_000)
  const claro = JSON.stringify({ ...m, privado: undefined })
  assert.ok(!claro.includes('Juan') && !claro.includes('12345678Z'))
  for (const k of ['veredicto', 'fichaCaso', 'indicePoliza', 'fichaPerito', 'citas']) assert.ok(!(k in m), k)
  assert.equal(m.semaforo, 'no_defendible'); assert.equal(m.confianza, 'alta'); assert.equal(m.derivar, 'abogado')
  assert.deepEqual(m.citasConteo, { verificadas: 2, noEncontradas: 1 })
  assert.equal(m.huellaHilo, 'h'); assert.equal(typeof m.privado, 'string')
})

test('ida y vuelta: se recuperan los mismos campos', () => {
  const meta = { modelo: 'm', fichaCaso: { a: 1 }, veredicto: VER, citas: { verificadas: ['a'], noEncontradas: [] } }
  const r = desempaquetarMetaPrivado(empaquetarMetaPrivado(meta, cifrar, 20_000).meta, descifrar)!
  assert.deepEqual(r.veredicto, VER); assert.deepEqual(r.fichaCaso, { a: 1 }); assert.deepEqual(r.citas, { verificadas: ['a'], noEncontradas: [] })
  assert.ok(!('privado' in r)); assert.equal(r.modelo, 'm')
})

test('sin claves privadas pasa igual; meta antiguo en claro pasa igual; sobre ilegible se marca', () => {
  const m = { modelo: 'x' }
  assert.equal(empaquetarMetaPrivado(m, cifrar, 100).meta, m)
  const viejo = { veredicto: VER }
  assert.equal(desempaquetarMetaPrivado(viejo, descifrar), viejo)
  assert.equal(desempaquetarMetaPrivado({ privado: 'v1:%%%' }, () => { throw new Error('x') })!.privadoIlegible, true)
  assert.equal(tienePrivado({ a: 1 }), false)
})

test('tope: el meta FINAL cifrado cabe aunque el contenido en claro pese casi el tope', () => {
  const grande = { garantias: Array.from({ length: 25 }, (_, i) => ({ nombre: `g${i}`, suma: null, franquicia: null, cita: 'x'.repeat(300) })), exclusiones: Array.from({ length: 25 }, () => ({ texto: 'y'.repeat(300), cita: 'z'.repeat(300) })), completo: true }
  const meta = { modelo: 'm', indicePoliza: grande, veredicto: VER }
  const { meta: m, recortes } = empaquetarMetaPrivado(meta, cifrar, 20_000)
  assert.ok(Buffer.byteLength(JSON.stringify(m)) <= 20_000)
  assert.ok(recortes.length > 0)
  assert.ok(desempaquetarMetaPrivado(m, descifrar)!.veredicto)
})

test('detectarPreRehuse: caso real y negativo', () => {
  assert.equal(detectarPreRehuse('Revisado por responsable: se debe rehusar por la "rc cruzada". Te asigno para que modifiques informe.'), true)
  assert.equal(detectarPreRehuse('Reviso y comentamos. Saludos.'), false)
  for (const t of ['Rehúse del siniestro', 'modifique su informe', 'no queda cubierto', 'No está cubierto', 'sin cobertura', 'por la exclusión 4']) assert.equal(detectarPreRehuse(t), true, t)
  assert.equal(detectarPreRehuse('trato exclusivo con el perito'), false)
})

test('validarValoracion y correcciones', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const ok = validarValoracion({ mensajeId: id, voto: 'mal', motivo: ' falta la RC ' })
  assert.ok(ok.ok && ok.texto === 'falta la RC')
  const sin = validarValoracion({ mensajeId: id, voto: 'bien' })
  assert.ok(sin.ok && sin.texto === '👍')
  assert.ok(validarValoracion({ mensajeId: id, voto: 'mal' }).ok)
  assert.equal(validarValoracion({ mensajeId: 'x', voto: 'bien' }).ok, false)
  assert.equal(validarValoracion({ mensajeId: id, voto: 'regular' }).ok, false)
  const v = (voto: string, texto: string) => ({ autor: 'interna', tipo: 'nota', texto, meta: { valoracion: { mensajeId: id, voto } } })
  assert.deepEqual(correccionesDeValoraciones([v('mal', 'falta la RC'), v('mal', '👎'), v('bien', 'bien!'), { autor: 'corredor', tipo: 'nota', texto: 'otra', meta: null }]), ['falta la RC'])
})
