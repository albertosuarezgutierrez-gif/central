import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarFigurasDocumento, interpretarOportunidadDocumento, interpretarPropuestaIdentidad, textoCamposFigura, textoFigurasDocumento, textoPropuestaIdentidad } from './oportunidad-documento.ts'

test('creada: dice cuándo vence y cuándo se llama', () => {
  const a = interpretarOportunidadDocumento({ estado: 'creada', clienteId: 'c1', vence: '2026-12-31', llamada: '2026-11-16', clienteNuevo: false, relacionado: false })
  assert.equal(a?.tono, 'ok')
  assert.match(a!.texto, /vence el 31\/12\/2026; llamada el 16\/11\/2026/)
  assert.equal(a?.clienteId, 'c1')
})

test('🪤 documento de otra persona: se dice que es un lead nuevo, no se calla', () => {
  const a = interpretarOportunidadDocumento({ estado: 'creada', clienteId: 'c2', vence: null, llamada: '2026-09-30', clienteNuevo: true, relacionado: true })
  assert.match(a!.texto, /lead NUEVO/)
  assert.match(a!.texto, /sin vencimiento legible/)
})

test('🪤 cada desenlace se dice distinto; sin desenlace no se pinta nada', () => {
  assert.match(interpretarOportunidadDocumento({ estado: 'ya_nuestra' })!.texto, /ya es nuestra/)
  assert.match(interpretarOportunidadDocumento({ estado: 'no_es_seguro' })!.texto, /no abre oportunidad/)
  assert.equal(interpretarOportunidadDocumento({ estado: 'error', motivo: 'x' })!.tono, 'aviso')
  assert.equal(interpretarOportunidadDocumento(null), null)
  assert.equal(interpretarOportunidadDocumento({ estado: 'raro' }), null)
})

test('🪤 «actualizada» solo dice que completó algo si de verdad lo hizo', () => {
  assert.match(interpretarOportunidadDocumento({ estado: 'actualizada', clienteId: 'c1', vence: null, llamada: '2026-09-30', completada: true })!.texto, /completado/)
  assert.doesNotMatch(interpretarOportunidadDocumento({ estado: 'actualizada', clienteId: 'c1', vence: null, llamada: '2026-09-30', completada: false })!.texto, /completado/)
})

import { interpretarFichaDocumento, textoFichaDocumento } from './oportunidad-documento.ts'

test('🪤 la ficha resultante: lead nuevo vs. ya existía, con lo rellenado por su nombre', () => {
  const f = interpretarFichaDocumento({ clienteId: 'c9', creada: true, rellenados: ['CIF', 'domicilio'], avisos: ['posible duplicado'] })
  assert.deepEqual(f, { clienteId: 'c9', creada: true, rellenados: ['CIF', 'domicilio'], avisos: ['posible duplicado'] })
  assert.match(textoFichaDocumento(f!), /lead nuevo.*rellenado: CIF, domicilio/)
  const ya = interpretarFichaDocumento({ clienteId: 'c1', creada: false, rellenados: [], avisos: [] })
  assert.match(textoFichaDocumento(ya!), /ya existía.*no se ha rellenado/)
})

test('🪤 ficha null = no se ha tocado ninguna; ausente = asegura no lo dice (no se afirma nada)', () => {
  assert.equal(interpretarFichaDocumento(null), null)
  assert.equal(interpretarFichaDocumento({ creada: true }), null)
  assert.equal(interpretarFichaDocumento(undefined), undefined)
})

test('🪤 figuras: una respuesta antigua (sin `figuras`) no pinta nada', () => {
  assert.equal(interpretarFigurasDocumento({ estado: 'creada', clienteId: 'c1' }), null)
  assert.equal(interpretarFigurasDocumento({ estado: 'creada', figuras: null }), null)
  assert.equal(interpretarFigurasDocumento({ estado: 'creada', figuras: [], avisosFiguras: [] }), null)
  assert.equal(interpretarFigurasDocumento(null), null)
})

test('🪤 figuras: se agrupan por ficha y se dice si se crearon o ya existían', () => {
  const f = interpretarFigurasDocumento({
    estado: 'creada',
    figuras: [
      { rol: 'propietario', clienteId: 'p1', creada: true },
      { rol: 'conductor_habitual', clienteId: 'p1', creada: true },
      { rol: 'conductor_ocasional', clienteId: 'p2', creada: false },
      { rol: null, clienteId: 'p3', creada: true },
      { rol: 'raro', clienteId: '' },
    ],
    avisosFiguras: ['Conductor ocasional: figura de más'],
  })
  assert.ok(f)
  assert.equal(f.figuras.length, 3)
  assert.equal(textoFigurasDocumento(f), 'Figuras: Propietario y conductor habitual (creada) · Conductor ocasional (ya existía) · Figura sin rol (creada)')
  assert.deepEqual(f.avisos, ['Conductor ocasional: figura de más'])
})

test('🪤 figuras: qué tiene / qué falta en su ficha, solo con booleanos; una respuesta antigua no pinta nada', () => {
  const f = interpretarFigurasDocumento({
    estado: 'creada',
    figuras: [
      { rol: 'conductor_habitual', clienteId: 'p1', creada: true, campos: { nombre: true, nacimiento: true, domicilio: true, telefono: false, email: false, carne: false, dni: false } },
      // Un valor que se colara (no booleano) cuenta como «no se sabe», y nunca se pinta.
      { rol: 'conductor_ocasional', clienteId: 'p2', creada: false, campos: { nombre: 'Fermín Prueba', nacimiento: null, telefono: true } },
      { rol: 'propietario', clienteId: 'p3', creada: false },
    ],
  })
  assert.ok(f)
  const [a, b, c] = f.figuras
  assert.deepEqual(textoCamposFigura(a.campos), { tiene: ['nombre', 'nacimiento', 'domicilio'], falta: ['teléfono', 'email', 'carné', 'DNI'], sinComprobar: [] })
  const tb = textoCamposFigura(b.campos)
  assert.ok(tb)
  assert.deepEqual(tb.tiene, ['teléfono'])
  assert.equal(JSON.stringify(tb).includes('Fermín'), false)
  assert.ok(tb.sinComprobar.includes('nombre'))
  assert.equal(c.campos, null)
  assert.equal(textoCamposFigura(c.campos), null)
})

test('propuesta de identidad: se lee entera o no se lee (no se inventa una a medias)', () => {
  const ok = { clienteId: 'c1', documentoId: 'd1', propuesta: { nombre: 'Estibaliz', apellidos: 'Eslava Antoli', actual: { nombre: 'Estibaliz', apellidos: 'Slava' }, motivo: 'un_apellido' } }
  const p = interpretarPropuestaIdentidad(ok)
  assert.equal(p?.documentoId, 'd1')
  assert.match(textoPropuestaIdentidad(p!), /«Estibaliz Eslava Antoli» y la ficha «Estibaliz Slava»: la ficha solo tiene un apellido/)
  assert.equal(interpretarPropuestaIdentidad(null), null)
  assert.equal(interpretarPropuestaIdentidad({ ...ok, documentoId: '' }), null)
  assert.equal(interpretarPropuestaIdentidad({ ...ok, propuesta: { ...ok.propuesta, nombre: '' } }), null)
})

test('🪤 «yaExistia»: dice que no se ha duplicado y enlaza a la ficha', () => {
  const a = interpretarOportunidadDocumento({ estado: 'actualizada', clienteId: 'c1', vence: '2027-03-01', llamada: '2027-01-15', completada: false, yaExistia: true })!
  assert.match(a.texto, /Ya estaba subida: no se ha duplicado/)
  assert.equal(a.clienteId, 'c1')
})
