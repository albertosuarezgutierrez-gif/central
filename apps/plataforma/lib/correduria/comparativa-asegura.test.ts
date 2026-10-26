// 🪤 La comparativa de la oportunidad en plataforma (21/10/2026). Fixtures FICTICIOS.
// Para verlo en rojo: en `precioOpcion` devuelve «No figura» sin mirar `primaPeriodo` → falla «otro periodo»;
// o en `interpretarComparativa` ignora `avant2` → falla «el aviso de Avant2».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, ofertaDeAvant2, type PrecioAvant2 } from '@central/module-seguros'
import { filasPrecios, interpretarComparativa, leerOfertasBot, precioOpcion, preciosConSupuestos, textoProyecto, textoVerificacionPdf } from './comparativa-asegura.ts'

const precio = (id: string, categoria: string, primaEur: number, meses: number | null): PrecioAvant2 => ({
  id, compania: 'Compañía Uno', producto: null, modalidad: null, categoria, primaEur, franquiciaEur: null, firmeza: 'estimado', frecuenciaPago: null, meses, garantias: null,
})
const c = compararOfertas({ ramo: 'hogar', ofertas: [precio('b', 'Premium', 500, 12), precio('a', 'Básico', 300, 12), precio('n', 'Estándar', 400, null)].map((p) => ofertaDeAvant2(p, 'hogar')) })

test('🪤 el aviso de Avant2 viaja (va antes del botón de 0,50€)', () => {
  const l = interpretarComparativa(200, { estado: 'ok', comparacion: c, avant2: { cotizacionId: 'x', creadaEn: '2026-10-12T10:00:00Z', caducada: false, precios: 6, enCuadro: 3, aviso: 'Ya hay una cotización de Avant2 del 12/10: ábrela gratis. ¿Hacer una consulta nueva (0,50€)?' }, guardado: null, polizaCartera: 'no_aplica' })
  assert.ok(l.estado === 'ok')
  assert.match(l.datos.avant2!.aviso, /0,50€/)
  assert.equal(interpretarComparativa(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.equal(interpretarComparativa(404, { estado: 'no_encontrado' }).estado, 'no_encontrado')
  assert.equal(interpretarComparativa(200, { estado: 'ok', comparacion: {} }).estado, 'error')
})

test('🪤 precio de otro periodo: se ve con su periodo y no es comparable; anual con /año', () => {
  assert.deepEqual(precioOpcion({ primaTotal: null, primaPeriodo: { importe: 400, meses: null } }), { texto: '400,00€ (periodo sin confirmar)', comparable: false })
  assert.deepEqual(precioOpcion({ primaTotal: 2162.49, primaPeriodo: null }), { texto: '2.162,49€/año', comparable: true })
  assert.equal(precioOpcion({ primaTotal: null }).texto, 'No figura')
})

test('filas: compañía + nivel y orden del ranking (sin prima comparable, al final)', () => {
  const f = filasPrecios(c)
  assert.deepEqual(f.map((x) => [x.etiqueta, x.posicion]), [['Compañía Uno · Básico', 1], ['Compañía Uno · Premium', 2], ['Compañía Uno · Estándar', null]])
})

test('un 404 solo es «no existe» si el puerto lo dice; si no, es error (ruta/despliegue a medias)', () => {
  assert.equal(interpretarComparativa(404, { estado: 'no_encontrado' }).estado, 'no_encontrado')
  const nulo = interpretarComparativa(404, null)
  assert.equal(nulo.estado, 'error')
  assert.match(nulo.estado === 'error' ? nulo.motivo : '', /404/)
  assert.equal(interpretarComparativa(404, {}).estado, 'error')
})

test('proyecto de bot (26/10/2026): texto con nº, guardado y caducidad; desconocida no se inventa', () => {
  assert.equal(textoProyecto({ referencia: 'P-1', guardadoEn: '2026-10-20', caduca: '2026-11-19' }), 'Proyecto nº P-1 · guardado el 20/10 · caduca el 19/11')
  assert.equal(textoProyecto({ referencia: 'P-1', guardadoEn: '2026-10-20', caduca: null }), 'Proyecto nº P-1 · guardado el 20/10 · caducidad desconocida')
  assert.equal(textoProyecto({ referencia: null, guardadoEn: null, caduca: null }), 'Proyecto sin nº · fecha de guardado desconocida · caducidad desconocida')
})

test('ofertasBot: forma rara descartada, puerto anterior = lista vacía, y «con supuestos» se lista para corregir', () => {
  assert.deepEqual(leerOfertasBot(undefined), [])
  const l = leerOfertasBot([
    { ofertaId: 'a', referencia: 'P-1', estadoCaducidad: 'caduca_pronto', verificacion: { estado: 'discrepancia', discrepancias: ['prima'] }, precio: { estado: 'con_supuestos', supuestos: ['Precio con supuestos: uso diario.'] } },
    { ofertaId: 'b', precio: { estado: 'limpio', supuestos: [] } },
    { sinId: true },
  ])
  assert.equal(l.length, 2)
  assert.equal(l[1].verificacion, null)
  assert.deepEqual(preciosConSupuestos([{ id: 'a', etiqueta: 'Compañía A' }, { id: 'b', etiqueta: 'Compañía B' }], l), [{ etiqueta: 'Compañía A', supuestos: ['Precio con supuestos: uso diario.'] }])
  assert.equal(textoVerificacionPdf(l[0].verificacion), 'El PDF no cuadra con lo tarificado: prima')
  assert.equal(textoVerificacionPdf(null), 'PDF sin comprobar contra lo tarificado')
})
