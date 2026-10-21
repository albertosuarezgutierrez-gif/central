// 🪤 Cuadro común de los PDF (21/10/2026). Fixtures FICTICIOS.
// Para verlo en rojo: en `textoPrimaOferta` devuelve NO_FIGURA cuando `primaTotal` es null → falla «otro periodo»;
// en `textoFuenteCuadro` devuelve siempre la frase de documentos → falla «Avant2 = estimado»;
// en `separarComunes` devuelve `comunes: []` → falla «solo lo que difiere».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { compararOfertas, ofertaDeAvant2, type PrecioAvant2 } from '@central/module-seguros'
import { cabecerasColumnas, NO_FIGURA, notasCuadro, textoCelda, textoFuenteCuadro, textoLlamadaAccion, textoPrimaOferta } from './presupuesto-pdf-cuadro.ts'
import { avisoLegalOfertas, AVISO_LEGAL_OFERTAS, separarComunes } from './presupuesto-pdf-ofertas.ts'
import { pdfPresupuesto, type DatosPdfPresupuesto } from './presupuesto-pdf.ts'
import { narrativaDeterminista } from './estudio-ia.ts'

const precio = (id: string, compania: string, categoria: string, primaEur: number, meses: number | null = 12): PrecioAvant2 => ({
  id, compania, producto: `${compania} Hogar 2050`, modalidad: null, categoria, primaEur, franquiciaEur: null, firmeza: 'estimado',
  frecuenciaPago: null, meses, garantias: { porClave: { continente: 'si', robo: 'no' } },
})
const TRES = [precio('a', 'Compañía Uno', 'Básico', 291.24), precio('b', 'Compañía Uno', 'Estándar', 474.48), precio('c', 'Compañía Uno', 'Premium', 583.22, null)]
const cmp = compararOfertas({ ramo: 'hogar', ofertas: TRES.map((p) => ofertaDeAvant2(p, 'hogar')) })

test('🪤 cabeceras: compañía + nivel (tres de la misma compañía no se llaman igual)', () => {
  const c = cabecerasColumnas(cmp.ofertas)
  assert.deepEqual([...c.values()], ['Compañía Uno · Básico', 'Compañía Uno · Estándar', 'Compañía Uno · Premium'])
})

test('🪤 precio: anual con /año; de otro periodo con su periodo (nunca «No figura»); estimado con *', () => {
  const [a, , c] = cmp.ofertas
  assert.equal(textoPrimaOferta(a), '291,24€/año *')
  assert.equal(textoPrimaOferta(c), '583,22€ (periodo sin confirmar) *')
  assert.equal(textoPrimaOferta({ primaTotal: null, primaPeriodo: null, firmeza: null, fuente: 'pdf_compania' }), NO_FIGURA)
  assert.ok(notasCuadro(cmp.ofertas).some((n) => /Precio estimado/.test(n)))
  assert.ok(notasCuadro(cmp.ofertas).some((n) => /no es de un año completo/.test(n)))
})

test('🪤 Avant2 = estimado: ni «tal como constan en los documentos» ni «facilitados en sus documentos»', () => {
  assert.match(textoFuenteCuadro(cmp.ofertas), /Precios estimados/)
  assert.doesNotMatch(textoFuenteCuadro(cmp.ofertas), /constan en los documentos/)
  assert.match(textoFuenteCuadro([{ rol: 'oferta', fuente: 'pdf_compania', firmeza: null }]), /constan en los documentos/)
  const legal = avisoLegalOfertas(cmp.ofertas)
  assert.match(legal, /ESTIMADOS/)
  assert.doesNotMatch(legal, /facilitados por las propias compañías en sus documentos/)
  assert.match(legal, /Real Decreto-ley 3\/2020/)
  assert.equal(avisoLegalOfertas([{ rol: 'oferta', fuente: 'pdf_compania' }]), AVISO_LEGAL_OFERTAS)
})

test('🪤 resumen por oferta: solo lo que difiere; lo común, una vez', () => {
  const r = separarComunes([['Franquicia: no figura', 'Forma de pago: anual'], ['Franquicia: no figura', 'Forma de pago: mensual']])
  assert.deepEqual(r.comunes, ['Franquicia: no figura'])
  assert.deepEqual(r.propias, [['Forma de pago: anual'], ['Forma de pago: mensual']])
  assert.deepEqual(separarComunes([['x']]), { comunes: [], propias: [['x']] })
})

test('celdas con icono de tres estados', () => {
  const robo = cmp.filas.find((f) => f.clave === 'robo_vandalismo')!
  assert.equal(textoCelda(robo.celdas[0]).icono, 'no')
  assert.equal(textoCelda(cmp.filas.find((f) => f.clave === 'continente')!.celdas[0]).icono, 'si')
  assert.equal(textoCelda(undefined).icono, 'nose')
})

test('llamada a la acción con la referencia y sin enlace con token', () => {
  const t = textoLlamadaAccion({ referencia: 'AS-26-0001', telefono: '+34 600 00 00 00', email: 'hola@ejemplo.es' })
  assert.match(t.cuerpo, /AS-26-0001/)
  assert.doesNotMatch(t.cuerpo, /token|https?:/)
})

test('el PDF de Avant2 con estudio sale válido y con más páginas que sin él', async () => {
  const base: DatosPdfPresupuesto = {
    referencia: 'AS-26-0001', cliente: 'Cliente Ficticio', ramo: 'hogar', creadoAt: new Date('2026-10-21T10:00:00Z'), venceEl: new Date('2026-11-04T10:00:00Z'),
    datosCalculo: null, necesidades: null,
    opciones: TRES.map((p, i) => ({ compania: p.compania!, producto: p.producto!, modalidad: null, categoria: p.categoria, primaEur: p.primaEur, franquiciaEur: null, firmeza: 'estimado', papeles: i === 0 ? ['mas_barata'] : [], coberturas: [] })),
    mediador: { marca: 'Grupo ASegura', nombre: 'Mediador Ficticio', claveDgsfp: 'X-0', domicilio: 'Calle Falsa 1', email: null },
  }
  const sin = await PDFDocument.load(await pdfPresupuesto(base))
  const n = narrativaDeterminista(cmp, null)
  const con = await PDFDocument.load(await pdfPresupuesto({ ...base, estudio: { recomendadaId: null, actualId: null, comparacion: cmp, narrativa: { ...n } } }))
  assert.ok(con.getPageCount() > sin.getPageCount(), `${con.getPageCount()} vs ${sin.getPageCount()}`)
})
