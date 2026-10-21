// 🪤 El presupuesto de Avant2 congela su ESTUDIO (21/10/2026, opción B): cuadro + resumen con la misma lógica y huella
// que la comparativa de la oportunidad, sin lo oculto y sin cambiar la emisión. Fixtures FICTICIOS.
// Para verlo en rojo: en `estudioDePresupuestoAvant2` quita el filtro `!p.oculta` → falla «lo oculto no entra»;
// o en `prepararPresupuesto` quita el `estudio:` del `create` → falla el cableado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estudioDePresupuestoAvant2, garantiasAvant2De, MAX_AVANT2_EN_CUADRO, type PrecioEnPresupuesto } from './estudio-avant2.ts'
import { huellaComparativa } from './comparativa-huella.ts'

const p = (id: string, compania: string, categoria: string, primaEur: number, extra: Partial<PrecioEnPresupuesto> = {}): PrecioEnPresupuesto => ({
  id, compania, producto: `${compania} Hogar`, modalidad: null, categoria, primaEur, franquiciaEur: null, firmeza: 'estimado',
  frecuenciaPago: null, meses: 12, garantias: { porClave: { continente: 'si', robo: 'no', joyas: 'no_consta' } }, oculta: false, ...extra,
})

test('cuadro de los precios en documento, con huella estable y tres estados', () => {
  const e = estudioDePresupuestoAvant2({ ramo: 'hogar', actual: null, precios: [p('a', 'Compañía A', 'Básico', 300), p('b', 'Compañía A', 'Premium', 500), p('c', 'Compañía B', 'Básico', 400)] })!
  assert.deepEqual(e.enCuadro, ['a', 'c', 'b'])
  assert.equal(e.huella, huellaComparativa({ ramo: 'hogar', ofertas: e.comparacion.ofertas, superficieM2: null, recomendadaId: null }))
  const robo = e.comparacion.filas.find((f) => f.clave === 'robo_vandalismo')!
  assert.equal(robo.celdas[0].estado3, 'no_incluida')
  assert.equal(e.comparacion.filas.find((f) => f.clave === 'joyas_objetos_valor'), undefined) // no_consta = no se sabe, no se inventa fila
})

test('🪤 lo oculto por el corredor y lo que no tiene prima no entra; sin nada → sin estudio', () => {
  const e = estudioDePresupuestoAvant2({ ramo: 'hogar', actual: null, precios: [p('a', 'A', 'Básico', 300, { oculta: true }), p('b', 'B', 'Básico', 0), p('c', 'C', 'Básico', 410)] })!
  assert.deepEqual(e.enCuadro, ['c'])
  assert.equal(estudioDePresupuestoAvant2({ ramo: 'hogar', actual: null, precios: [p('a', 'A', 'Básico', 300, { oculta: true })] }), null)
})

test('como mucho MAX_AVANT2_EN_CUADRO columnas; la póliza actual entra como actual', () => {
  const muchos = Array.from({ length: 10 }, (_, i) => p(`x${i}`, `Compañía ${i}`, 'Básico', 300 + i))
  const actual = { id: 'pol', rol: 'actual' as const, compania: 'Compañía Z', producto: null, primaTotal: 350, primaNeta: null, garantias: {} }
  const e = estudioDePresupuestoAvant2({ ramo: 'hogar', actual, precios: muchos })!
  assert.equal(e.enCuadro.length, MAX_AVANT2_EN_CUADRO)
  assert.equal(e.actualId, 'pol')
  assert.equal(e.comparacion.actualId, 'pol')
})

test('garantías guardadas: forma validada; basura = sin leer (null)', () => {
  assert.deepEqual(garantiasAvant2De({ version: 3, porClave: { a: 'si', b: 'raro', c: 'no' } }), { porClave: { a: 'si', c: 'no' } })
  assert.equal(garantiasAvant2De(null), null)
  assert.equal(garantiasAvant2De({ porClave: [] }), null)
})

test('🪤 cableado: prepararPresupuesto congela el estudio y el PDF de Avant2 lo lee; la emisión no lo usa', () => {
  const src = readFileSync(new URL('./presupuesto.ts', import.meta.url), 'utf8')
  assert.match(src, /\.\.\.\(estudioAvant2 \? \{ estudio: estudioAvant2\.estudio/)
  assert.match(src, /decidirIaAuto\(await gastoIaAuto\(correduriaId\)\)/)
  const datos = readFileSync(new URL('./presupuesto-pdf-datos.ts', import.meta.url), 'utf8')
  assert.match(datos, /const e = leerEstudio\(p\.estudio\); return e \? estudioEnDocumento\(e, p\.opciones/)
  const emitir = readFileSync(new URL('./codeoscopic/emitir.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(emitir, /estudio/)
})

test('🪤 las RECOMENDADAS (portada) tienen columna siempre, aunque pasen del máximo', () => {
  // Para verlo en rojo: en `estudioDePresupuestoAvant2` trata `portada` como una más → falla.
  const muchos = Array.from({ length: 10 }, (_, i) => p(`x${i}`, `Compañía ${i}`, 'Básico', 300 + i))
  const caras = [p('cara1', 'Compañía Z', 'Premium', 999, { portada: true }), p('cara2', 'Compañía Y', 'Premium', 998, { portada: true })]
  const e = estudioDePresupuestoAvant2({ ramo: 'hogar', actual: null, precios: [...muchos, ...caras] })!
  assert.ok(e.enCuadro.includes('cara1') && e.enCuadro.includes('cara2'), String(e.enCuadro))
  assert.equal(e.enCuadro.length, MAX_AVANT2_EN_CUADRO)
})

test('🪤 cableado: ocultar/mostrar rehace el estudio; la IA pagada cuenta en el tope aunque no se cree el presupuesto', () => {
  const src = readFileSync(new URL('./presupuesto.ts', import.meta.url), 'utf8')
  assert.match(src, /await rehacerEstudioTrasOcultar\(correduriaId, p\.id\)/)
  assert.match(src, /await anotarGastoIa\(correduriaId, null, cab\.id, estudioAvant2\?\.evento \?\? null, 'transaccion_fallida'\)/)
  assert.match(src, /await anotarGastoIa\(correduriaId, hecho\.otro\.id, cab\.id, estudioAvant2\?\.evento \?\? null, 'cerrojo_encontro_otro'\)/)
  assert.match(src, /narrativa: narrativa\.fuente === 'ia' \? \{ \.\.\.narrativa, revisada: narrativa\.revisada === true \}/)
  const tope = readFileSync(new URL('./ia-tope-estudio.ts', import.meta.url), 'utf8')
  assert.match(tope, /e\.tipo in \('preparado', 'ia_resumen'\)/)
})
