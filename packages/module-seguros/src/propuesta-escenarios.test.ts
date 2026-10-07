import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  correoPropuesta, etiquetaEscenario, figurasDePeticion, mensajePropuestaWhatsapp, nombresParaEtiquetas, ordenarEscenarios,
  seguroAnteriorDePeticion, textoSeguroAnterior, type EscenarioEntrada,
} from './propuesta-escenarios.ts'

const persona = (dni: string | null, name: string, surname = 'Ruiz') => ({
  ...(dni ? { identificationDocument: { type: { id: 'Dni' }, id: dni } } : {}), name, surname,
})
const ANA = persona('11111111H', 'Ana', 'García')
const RAFAEL = persona('22222222J', 'Rafael', 'López')
const coche = (tomador: object, propietario: object, conductor: object, previa: object | null = { previousCompany: { code: 'C0517' }, yearsWithoutAccidents: 5, totalYearsInsured: 8 }) => ({
  insuranceLine: { id: 'Car' }, holder: tomador,
  risk: { owner: propietario, primaryDriver: conductor, ...(previa ? { previouslyInsured: true, previousInsurance: previa } : { previouslyInsured: false }) },
})
// El caso real: el Mercedes de Rafael.
const P1 = coche(ANA, RAFAEL, ANA)
const P2 = coche(RAFAEL, RAFAEL, ANA)

const escenario = (id: string, peticion: unknown, primas: Array<number | null>): EscenarioEntrada => ({
  presupuestoId: id, referencia: `AS-26-000${id}`, ramo: 'auto', figuras: figurasDePeticion(peticion), seguroAnterior: seguroAnteriorDePeticion(peticion),
  opciones: primas.map((p, i) => ({ compania: `Cia${i}`, producto: null, modalidad: null, primaEur: p, coberturas: ['RC', 'Lunas'] })),
})

test('la etiqueta sale sola de las figuras de la petición (el caso del Mercedes)', () => {
  const nombres = nombresParaEtiquetas([figurasDePeticion(P1), figurasDePeticion(P2)])
  assert.equal(etiquetaEscenario(figurasDePeticion(P1), 'auto', nombres), 'Tomador: Ana · Conductor: Ana · Propietario: Rafael')
  assert.equal(etiquetaEscenario(figurasDePeticion(P2), 'auto', nombres), 'Tomador: Rafael · Conductor: Ana · Propietario: Rafael')
})

test('🪤 dos «Ana» con DNI distinto NO se funden: se escriben con el nombre completo', () => {
  const otraAna = persona('33333333P', 'Ana', 'Pérez')
  const f1 = figurasDePeticion(coche(ANA, RAFAEL, ANA))
  const f2 = figurasDePeticion(coche(otraAna, RAFAEL, otraAna))
  const nombres = nombresParaEtiquetas([f1, f2])
  assert.equal(etiquetaEscenario(f1, 'auto', nombres), 'Tomador: Ana García · Conductor: Ana García · Propietario: Rafael')
  assert.equal(etiquetaEscenario(f2, 'auto', nombres), 'Tomador: Ana Pérez · Conductor: Ana Pérez · Propietario: Rafael')
})

test('sin DNI no se afirma que sea la misma persona que otra con DNI', () => {
  const anaSinDni = persona(null, 'Ana', 'García')
  const nombres = nombresParaEtiquetas([figurasDePeticion(coche(ANA, RAFAEL, anaSinDni))])
  assert.equal(nombres.size, 3)
})

test('una figura que no viene es «no consta», nunca el tomador por suposición; fuera de vehículo, solo el tomador', () => {
  const f = figurasDePeticion({ holder: ANA, risk: { primaryDriver: ANA } })
  const nombres = nombresParaEtiquetas([f])
  assert.equal(etiquetaEscenario(f, 'auto', nombres), 'Tomador: Ana · Conductor: Ana · Propietario: no consta')
  assert.equal(etiquetaEscenario(f, 'hogar', nombres), 'Tomador: Ana')
  assert.equal(etiquetaEscenario(null, 'auto', nombres), 'Intervinientes: no constan')
})

test('seguro anterior: declarado, declarado sin seguro y no consta son tres cosas', () => {
  assert.deepEqual(seguroAnteriorDePeticion(P1), { estado: 'declarado', companiaCodigo: 'C0517', aniosSinSiniestros: 5, aniosAsegurado: 8 })
  assert.deepEqual(seguroAnteriorDePeticion(coche(ANA, ANA, ANA, null)), { estado: 'sin_seguro' })
  assert.deepEqual(seguroAnteriorDePeticion({ holder: ANA }), { estado: 'no_consta' })
  assert.equal(textoSeguroAnterior(seguroAnteriorDePeticion(P1), 'Mapfre'), 'Seguro anterior: Mapfre · 5 años sin siniestros')
  assert.equal(textoSeguroAnterior({ estado: 'declarado', companiaCodigo: null, aniosSinSiniestros: null, aniosAsegurado: null }, null),
    'Seguro anterior: compañía no consta · años sin siniestros: no consta')
})

test('🪤 orden por prima mínima y «la más económica» marcada en el escenario más barato', () => {
  const r = ordenarEscenarios([escenario('1', P1, [612.3, 540]), escenario('2', P2, [498.75, 700])])
  assert.deepEqual(r.map((e) => e.presupuestoId), ['2', '1'])
  assert.deepEqual(r.map((e) => e.numero), [1, 2])
  assert.deepEqual(r.map((e) => e.masEconomica), [true, false])
  assert.equal(r[0]!.primaMinima, 498.75)
  assert.deepEqual(r[1]!.opciones.map((o) => o.primaEur), [540, 612.3], 'dentro del escenario, de la más barata a la más cara')
  assert.equal(r[0]!.etiqueta, 'Tomador: Rafael · Conductor: Ana · Propietario: Rafael')
})

test('una prima ilegible nunca es la más económica; sin ninguna legible no se marca nada', () => {
  const r = ordenarEscenarios([escenario('1', P1, [null]), escenario('2', P2, [800])])
  assert.deepEqual(r.map((e) => [e.presupuestoId, e.masEconomica, e.primaMinima]), [['2', true, 800], ['1', false, null]])
  const nada = ordenarEscenarios([escenario('1', P1, [null]), escenario('2', P2, [])])
  assert.ok(nada.every((e) => !e.masEconomica))
  assert.deepEqual(nada.map((e) => e.presupuestoId), ['1', '2'], 'sin precio, en el orden en que se eligieron')
})

test('empate exacto: los dos son igual de económicos', () => {
  const r = ordenarEscenarios([escenario('1', P1, [500]), escenario('2', P2, [500])])
  assert.deepEqual(r.map((e) => e.masEconomica), [true, true])
})

test('el aviso del lote no lleva precio ni compañía, y dice que los demás escenarios le llegan a otra persona', () => {
  const d = { nombre: 'Ana García', referencia: 'ASP-26-0001', enlaces: [{ numero: 2, enlace: 'https://clientes.grupoasegura.es/presupuesto/x' }], total: 2, email: 'ana@example.com', venceEl: new Date('2026-10-20T10:00:00Z') }
  const w = mensajePropuestaWhatsapp({ ...d, enlaces: [{ ...d.enlaces[0]!, codigo: '482913' }] })
  assert.match(w, /^Hola, Ana\./)
  assert.match(w, /Escenario 2 \(tu código de acceso es 482913\): https:\/\/clientes/)
  assert.match(w, /El otro escenario va a nombre de otra persona/)
  assert.doesNotMatch(w, /€|Mapfre|Cia0/)
  const c = correoPropuesta(d)
  assert.match(c.html, /Ver escenario 2/)
  assert.doesNotMatch(c.texto + c.html, /€/)
})

test('🪤 el WhatsApp del lote lleva el código de CADA escenario junto a su enlace, y no depende del correo', () => {
  const base = {
    nombre: 'Ana García', referencia: 'ASP-26-0002', total: 2, venceEl: new Date('2026-10-20T10:00:00Z'),
    enlaces: [
      { numero: 1, enlace: 'https://clientes.grupoasegura.es/presupuesto/a', codigo: '111111' },
      { numero: 2, enlace: 'https://clientes.grupoasegura.es/presupuesto/b', codigo: '222222' },
    ],
  }
  const sin = mensajePropuestaWhatsapp({ ...base, email: null })
  // Cada código va en la línea de SU enlace (cruzarlos dejaría las dos puertas cerradas).
  assert.match(sin, /Escenario 1 \(tu código de acceso es 111111\): https:\/\/clientes\.grupoasegura\.es\/presupuesto\/a/)
  assert.match(sin, /Escenario 2 \(tu código de acceso es 222222\): https:\/\/clientes\.grupoasegura\.es\/presupuesto\/b/)
  // Sin correo afirmable no se promete ningún código por correo ni se nombra un buzón.
  assert.doesNotMatch(sin, /correo|null|undefined/)
  const con = mensajePropuestaWhatsapp({ ...base, email: 'ana@example.com' })
  assert.match(con, /también puedes entrar con tu correo ana@example\.com/)
})
