// 🪤 La comparativa de la oportunidad en plataforma (21/10/2026). Fixtures FICTICIOS.
// Para verlo en rojo: en `precioOpcion` devuelve «No figura» sin mirar `primaPeriodo` → falla «otro periodo»;
// o en `interpretarComparativa` ignora `avant2` → falla «el aviso de Avant2».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararOfertas, ofertaDeAvant2, type PrecioAvant2 } from '@central/module-seguros'
import { filasPrecios, interpretarComparativa, precioOpcion } from './comparativa-asegura.ts'

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
