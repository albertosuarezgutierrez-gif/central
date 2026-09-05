import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATEGORIAS_EXPORT,
  FICHA_CATEGORIA,
  INFORMACION_ART15,
  construirExport,
  esPortable,
  type BloqueExport,
  type EntradaExport,
} from './export-rgpd.ts'

const MEDIADOR = { nombre: 'X', nif: '000', claveDgsfp: 'CS-F/0000', contacto: 'a@b.c' }

function entrada(bloques: readonly BloqueExport[]): EntradaExport {
  return {
    bloques,
    generadoEn: new Date('2026-09-05T10:00:00Z'),
    versionTextosLegales: '2026-09-v3',
    mediador: MEDIADOR,
  }
}

/** Todas las categorías presentes y vacías: el caso «no tiene nada de nada». */
const TODAS_VACIAS: BloqueExport[] = CATEGORIAS_EXPORT.map((categoria) => ({
  categoria,
  incluida: false,
  motivo: 'sin_datos',
}))

test('cada categoría tiene ficha: título, origen y una descripción que se entienda', () => {
  for (const c of CATEGORIAS_EXPORT) {
    const f = FICHA_CATEGORIA[c]
    assert.ok(f, `sin ficha: ${c}`)
    assert.ok(f.titulo.trim().length > 0, `${c} sin título`)
    assert.ok(f.descripcion.trim().length > 30, `${c} con una descripción que no explica nada`)
  }
})

test('SOLO es portable lo que aportó la persona (art. 20), no lo de la mediación', () => {
  // Marcar como portable lo que vino de la aseguradora acredita un derecho que
  // el art. 20 no da. Es el error que este test existe para impedir.
  assert.equal(esPortable('polizas_declaradas'), true, 'lo que sube el cliente SÍ es portable')
  assert.equal(esPortable('bienes'), true)
  assert.equal(esPortable('partes'), true)
  assert.equal(esPortable('canales'), true)

  assert.equal(esPortable('ficha_cartera'), false, 'la ficha de cartera NO la aportó él')
  assert.equal(esPortable('polizas_cartera'), false, 'las pólizas contratadas NO son portables')
  assert.equal(esPortable('acreditaciones'), false)
  assert.equal(esPortable('vinculos'), false)
  assert.equal(esPortable('identidad_portal'), false)
})

test('el paquete NO se monta si falta una categoría', () => {
  // Un export al que le falta un apartado, sin decirlo, es indistinguible de uno
  // completo para quien lo recibe.
  const incompleto = TODAS_VACIAS.filter((b) => b.categoria !== 'partes')
  assert.throws(() => construirExport(entrada(incompleto)), /faltan las categorías partes/)
})

test('tampoco se monta con categorías repetidas', () => {
  assert.throws(() => construirExport(entrada([...TODAS_VACIAS, TODAS_VACIAS[0]])), /repetidas/)
})

test('«no tienes nada» sigue siendo un export COMPLETO', () => {
  const r = construirExport(entrada(TODAS_VACIAS))
  assert.equal(r.completo, true)
  assert.equal(r.apartados.length, CATEGORIAS_EXPORT.length)
  assert.ok(r.apartados.every((a) => a.incluida === false))
})

test('una categoría que NO se pudo consultar marca el paquete como incompleto', () => {
  // Es la diferencia entre «no tienes pólizas» y «no he podido mirar tus
  // pólizas». Sin esta marca, las dos se leen igual.
  const bloques = TODAS_VACIAS.map((b) =>
    b.categoria === 'polizas_cartera' ? ({ ...b, motivo: 'no_consultable' } as BloqueExport) : b,
  )
  const r = construirExport(entrada(bloques))
  assert.equal(r.completo, false)
  const apartado = r.apartados.find((a) => a.categoria === 'polizas_cartera')!
  assert.match(apartado.motivo!, /INCOMPLETO/)
})

test('«no aplica» no rompe la completitud: es una respuesta, no un hueco', () => {
  const bloques = TODAS_VACIAS.map((b) =>
    b.categoria === 'ficha_cartera' ? ({ ...b, motivo: 'no_aplica' } as BloqueExport) : b,
  )
  assert.equal(construirExport(entrada(bloques)).completo, true)
})

test('los apartados salen en el orden declarado y arrastran datos cuando los hay', () => {
  const bloques = TODAS_VACIAS.map((b) =>
    b.categoria === 'bienes'
      ? ({ categoria: 'bienes', incluida: true, filas: [{ nombre: 'Coche' }] } as BloqueExport)
      : b,
  )
  const r = construirExport(entrada(bloques))
  assert.deepEqual(
    r.apartados.map((a) => a.categoria),
    [...CATEGORIAS_EXPORT],
  )
  const bienes = r.apartados.find((a) => a.categoria === 'bienes')!
  assert.deepEqual(bienes.filas, [{ nombre: 'Coche' }])
  assert.equal(bienes.portable, true)
})

test('el paquete lleva los apartados del art. 15, no solo filas', () => {
  // Sin esto es un volcado de tablas, no un derecho de acceso.
  const r = construirExport(entrada(TODAS_VACIAS))
  assert.ok(r.informacion.fines.length >= 3, 'faltan los fines del tratamiento')
  assert.ok(r.informacion.destinatarios.length >= 3, 'faltan los destinatarios')
  assert.ok(r.informacion.conservacion.length >= 2, 'faltan los plazos de conservación')
  assert.match(r.informacion.derechos, /Agencia Española de Protección de Datos/)
  assert.match(r.informacion.decisionesAutomatizadas, /art\. 22/)
  assert.match(r.informacion.transferenciasInternacionales, /Espacio Económico Europeo/)
  assert.ok(r.informacion.origen.trim().length > 50, 'falta de dónde salen los datos')
})

test('la transferencia fuera del EEE se declara: es el punto más sensible de la app', () => {
  assert.match(INFORMACION_ART15.transferenciasInternacionales, /OpenRouter/)
})

test('el paquete se sella con la versión de los textos legales y la fecha', () => {
  const r = construirExport(entrada(TODAS_VACIAS))
  assert.equal(r.versionTextosLegales, '2026-09-v3')
  assert.equal(r.generadoEn, '2026-09-05T10:00:00.000Z')
  assert.equal(r.mediador.claveDgsfp, 'CS-F/0000')
})

test('el apartado de canales avisa de que el correo está hasheado', () => {
  // Devolver el hash como si fuera «tu correo» sería devolver basura; omitirlo
  // sin decirlo, ocultar un dato que sí se trata.
  assert.match(FICHA_CATEGORIA.canales.descripcion, /huella criptográfica/)
})
