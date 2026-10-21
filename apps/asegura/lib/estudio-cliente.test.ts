// 🪤 La página del cliente pinta el MISMO estudio que el PDF, en LISTA BLANCA (21/10/2026). Fixtures FICTICIOS.
// Para verlo en rojo: en `vistaEstudioCliente` quita el filtro de `opcionDe` → falla «lo oculto no se ve»;
// o devuelve las ofertas tal cual (`...o`) en las columnas → falla «nada interno cruza».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compararOfertas, ofertaDeAvant2, type PrecioAvant2 } from '@central/module-seguros'
import { vistaEstudioCliente } from './estudio-cliente.ts'

const precio = (id: string, categoria: string, primaEur: number): PrecioAvant2 => ({
  id, compania: 'Compañía Uno', producto: 'Compañía Uno Hogar', modalidad: null, categoria, primaEur, franquiciaEur: null, firmeza: 'estimado',
  frecuenciaPago: null, meses: 12, garantias: { porClave: { continente: 'si', robo: 'no' } },
})
const ofertas = [precio('p1', 'Básico', 300), precio('p2', 'Premium', 500)].map((p) => ofertaDeAvant2(p, 'hogar'))
const estudio = { recomendadaId: null, actualId: null, comparacion: compararOfertas({ ramo: 'hogar', ofertas }), narrativa: { resumen: 'Texto.', recomendacion: 'Rec.', fuente: 'ia' } }

test('columnas con compañía + nivel, precio con /año y estimado, y el resumen con su etiqueta IA', () => {
  const v = vistaEstudioCliente(estudio, [{ id: 'o1', precioId: 'p1', ofertaId: null, papeles: [] }, { id: 'o2', precioId: 'p2', ofertaId: null, papeles: ['recomendada'] }])!
  assert.deepEqual(v.columnas.map((c) => [c.opcionId, c.etiqueta, c.precio, c.estimado, c.recomendada]), [
    ['o1', 'Compañía Uno · Básico', '300,00€/año *', true, false],
    ['o2', 'Compañía Uno · Premium', '500,00€/año *', true, true],
  ])
  assert.equal(v.narrativa?.etiqueta, 'Resumen preparado con IA y revisado por tu corredor')
  assert.ok(v.filas.some((f) => f.celdas.some((c) => c.estado === 'no')))
})

test('🪤 lo oculto no se ve; sin ninguna en documento no hay estudio', () => {
  const v = vistaEstudioCliente(estudio, [{ id: 'o1', precioId: 'p1', ofertaId: null, papeles: [] }])!
  assert.deepEqual(v.columnas.map((c) => c.id), ['p1'])
  assert.ok(v.filas.every((f) => f.celdas.length === 1))
  assert.equal(vistaEstudioCliente(estudio, []), null)
})

test('🪤 nada interno cruza: ni referencia, ni avisos, ni ranking, ni evidencia', () => {
  const v = vistaEstudioCliente(estudio, [{ id: 'o1', precioId: 'p1', ofertaId: null, papeles: [] }])!
  const json = JSON.stringify(v)
  for (const prohibido of ['referencia', 'avisos', 'ranking', 'evidencia', 'tarificacion_precio', 'huella']) assert.ok(!json.includes(prohibido), prohibido)
})

test('🪤 el puente: misma puerta que el PDF (ficha de portal_vinculo, ya enviado, no retirado)', () => {
  const src = readFileSync(new URL('./presupuesto-estudio-portal.ts', import.meta.url), 'utf8')
  assert.match(src, /fichaPropiaDeRecurso\(correduriaId, identidadId, 'presupuesto', presupuestoId\)/)
  assert.match(src, /where: \{ id: presupuestoId, correduriaId, clienteId: ficha\.clienteId \}/)
  assert.match(src, /p\.enviadoAt === null \|\| p\.retiradoAt !== null/)
  assert.match(src, /opciones: \{ where: \{ ocultaAt: null \}/)
})

test('🪤 opción ocultada después: fuera del cuadro y el resumen pasa a plantilla de lo que queda', async () => {
  // Para verlo en rojo: en `estudioEnDocumento` devuelve `e` tal cual → falla.
  const { estudioEnDocumento } = await import('./estudio-cliente.ts')
  const r = estudioEnDocumento(estudio, [{ precioId: 'p1', ofertaId: null }])!
  assert.deepEqual(r.comparacion.ofertas.map((o) => o.id), ['p1'])
  assert.ok(r.comparacion.filas.every((f) => f.celdas.length === 1))
  assert.equal(r.narrativa.fuente, 'determinista')
  assert.doesNotMatch(r.narrativa.resumen, /Premium/)
  // Sin cambios: el mismo estudio (y su texto de IA).
  assert.equal(estudioEnDocumento(estudio, [{ precioId: 'p1', ofertaId: null }, { precioId: 'p2', ofertaId: null }]), estudio)
})

test('🪤 el texto nombra una compañía que ya no está → plantilla', async () => {
  const { estudioEnDocumento } = await import('./estudio-cliente.ts')
  const conIntrusa = { ...estudio, narrativa: { resumen: 'Mapfre es más cara.', recomendacion: 'Rec.', fuente: 'ia' } }
  const r = estudioEnDocumento(conIntrusa, [{ precioId: 'p1', ofertaId: null }, { precioId: 'p2', ofertaId: null }])!
  assert.equal(r.narrativa.fuente, 'determinista')
})

test('etiqueta: IA sin revisar no dice «revisado por tu corredor»', () => {
  const v = vistaEstudioCliente({ ...estudio, narrativa: { ...estudio.narrativa, revisada: false } }, [{ id: 'o1', precioId: 'p1', ofertaId: null, papeles: [] }, { id: 'o2', precioId: 'p2', ofertaId: null, papeles: [] }])!
  assert.equal(v.narrativa?.etiqueta, 'Resumen preparado con IA')
})
