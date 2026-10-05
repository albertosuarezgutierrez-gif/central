// 🪤 Cepo de la narrativa del estudio (F2, 05/10/2026): una cifra que no está en la matriz no llega al
// cliente. Si la IA la mete, se descarta su texto ENTERO y va la narrativa determinista.
// Para verlo en rojo: en `generarNarrativa`, quita el `if (intrusa !== null) return …` → falla
// «la IA inventa una cifra…». O en `cifraIntrusa`, devuelve siempre `null` → fallan dos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, type OfertaNormalizada, type ValorGarantia } from '@central/module-seguros'
import { cifraIntrusa, cifrasDelTexto, cifrasPermitidas, generarNarrativa, narrativaDeterminista } from './estudio-ia.ts'

const v = (p: Partial<ValorGarantia> = {}): ValorGarantia => ({ estado: null, capital: null, limite: null, franquicia: null, ...p })

// Fixtures ANÓNIMOS.
const ACTUAL: OfertaNormalizada = {
  id: 'act', rol: 'actual', compania: 'Compañía A', producto: 'Comunidades', primaTotal: 522.6, primaNeta: 480,
  garantias: { continente: v({ capital: 200000 }), rc_general: v({ limite: 300000 }), danos_agua: v({ estado: 'incluida', franquicia: 400 }) },
}
const B: OfertaNormalizada = {
  id: 'b', rol: 'oferta', compania: 'Compañía B', producto: 'Hogar 360', primaTotal: 612.9, primaNeta: 560,
  garantias: { continente: v({ capital: 250000 }), rc_general: v({ limite: 150000 }), danos_agua: v({ estado: 'incluida', franquicia: 150 }) },
}
const C: OfertaNormalizada = {
  id: 'c', rol: 'oferta', compania: 'Compañía C', producto: null, primaTotal: 480, primaNeta: null,
  garantias: { continente: v({ capital: 240000 }), rc_general: v({ limite: 300000 }) },
}
const R = compararOfertas({ ramo: 'comunidades', ofertas: [ACTUAL, B, C], superficieM2: 217 })

const iaQueDice = (o: unknown) => async () => JSON.stringify(o)

test('cifrasDelTexto lee importes, porcentajes y números sueltos; ignora los pegados a letras', () => {
  const c = cifrasDelTexto('Sube 90,30€ (17,3%) y mejora 2 garantías; C0058 y RC2 no son cantidades. Total 1.234,56 €.')
  assert.deepEqual(c.map((x) => `${x.valor}${x.sufijo}`), ['90,30€', '17,3%', '2', '1.234,56€'])
})

test('la narrativa DETERMINISTA solo usa cifras de la matriz (el respaldo pasa su propio cepo)', () => {
  const n = narrativaDeterminista(R, 'c')
  assert.equal(cifraIntrusa(`${n.resumen}\n${n.recomendacion}`, cifrasPermitidas(R)), null, n.resumen)
  assert.match(n.recomendacion, /Compañía C/)
  assert.match(n.resumen, /612,90€/)
})

test('sin póliza actual no se habla de subidas ni de huecos', () => {
  const r = compararOfertas({ ramo: 'comunidades', ofertas: [B, C] })
  const n = narrativaDeterminista(r, null)
  assert.doesNotMatch(n.resumen, /sube|baja|hueco|no menciona/)
  assert.match(n.recomendacion, /no ha marcado ninguna/)
})

test('🪤 la IA inventa una cifra que NO está en la matriz → se descarta y va la determinista', async () => {
  const n = await generarNarrativa(R, 'c', iaQueDice({ resumen: 'Compañía C ahorra 120,00€ al año.', recomendacion: 'Te recomendamos Compañía C.' }))
  assert.equal(n.fuente, 'determinista')
  assert.match(n.descartada ?? '', /120,00€/)
  assert.doesNotMatch(n.resumen, /120,00/)
})

test('🪤 un porcentaje inventado también tumba el texto', async () => {
  const n = await generarNarrativa(R, 'c', iaQueDice({ resumen: 'Compañía C baja un 25,0% la prima.', recomendacion: 'Compañía C.' }))
  assert.equal(n.fuente, 'determinista')
})

test('con solo cifras de la matriz (y las del nombre del producto), vale la de la IA', async () => {
  const n = await generarNarrativa(R, 'c', iaQueDice({
    resumen: 'Compañía B (Hogar 360) sube 90,30€ respecto a la actual y deja la responsabilidad civil en 150.000,00€. Compañía C cuesta 480,00€.',
    recomendacion: 'Tu corredor recomienda Compañía C: mantiene 300.000 de responsabilidad civil.',
  }))
  assert.equal(n.fuente, 'ia', n.descartada ?? '')
})

test('si la IA falla o no devuelve JSON, va la determinista (nunca lanza)', async () => {
  const caida = await generarNarrativa(R, null, async () => { throw new Error('502') })
  assert.equal(caida.fuente, 'determinista')
  const basura = await generarNarrativa(R, null, async () => 'no es json')
  assert.equal(basura.fuente, 'determinista')
})
