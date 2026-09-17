import test from 'node:test'
import assert from 'node:assert/strict'

import { interpretarLeads } from './leads-asegura.ts'

const OK = {
  estado: 'ok',
  sinIdentificar: 1,
  leads: [
    {
      id: 'l1',
      compania: 'Generali',
      numeroPoliza: '04Z113777894',
      ramo: 'auto',
      estado: 'confirmado',
      fechaVencimiento: '2027-04-03T00:00:00.000Z',
      fechaAccionable: '2027-03-04T00:00:00.000Z',
      diasParaAccionable: 178,
      ventanaPasada: false,
      urgente: true,
      yaEnCartera: false,
      clienteId: 'c1',
      subidaEn: '2026-09-07T10:36:53.874Z',
      documentoNombre: '04_Z11_3777894.pdf',
      primaAnual: 412.5,
      titular: { tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: 'B91234567', cifValido: true },
      fichaEmpresaId: null,
    },
  ],
}

test('🚨 una respuesta que no se entiende es ERROR, jamás una lista vacía', () => {
  // «No he podido leer los leads» y «no hay ninguno» pintan igual de vacíos, y
  // solo uno de los dos autoriza a decirle a Alberto que no hay nada que
  // trabajar. Es la misma regla que gobierna `cartera-lista-asegura.ts`.
  for (const basura of [null, undefined, {}, { estado: 'ok' }, { estado: 'ok', leads: 'no' }, 'texto']) {
    const r = interpretarLeads(basura)
    assert.equal(r.ok, false, `esto debería ser error y no lista vacía: ${JSON.stringify(basura)}`)
  }
})

test('una lista vacía DE VERDAD sí es una lista vacía', () => {
  const r = interpretarLeads({ estado: 'ok', leads: [], sinIdentificar: 0 })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && r.leads, [])
})

test('🚨 `sin_configurar` y `error` no se funden', () => {
  // Se arreglan en sitios distintos: uno es una env que falta en plataforma, el
  // otro es la BD de asegura. Un único «no se pudo» manda a mirar donde no es.
  const sinConf = interpretarLeads({ estado: 'sin_configurar' })
  assert.equal(sinConf.ok, false)
  assert.equal(sinConf.ok === false ? sinConf.motivo : null, 'sin_configurar')
  const err = interpretarLeads({ estado: 'error', motivo: 'x' })
  assert.equal(err.ok === false ? err.motivo : null, 'asegura_error')
})

test('las fechas llegan como texto y salen como Date', () => {
  const r = interpretarLeads(OK)
  assert.equal(r.ok, true)
  const l = r.ok ? r.leads[0] : null
  assert.equal(l?.fechaAccionable?.toISOString().slice(0, 10), '2027-03-04')
  assert.equal(l?.fechaVencimiento?.toISOString().slice(0, 10), '2027-04-03')
})

test('🚨 el «no lo sé» de yaEnCartera sobrevive al viaje por JSON', () => {
  // `null` en el puerto = no se ha podido comprobar si ya la lleva la casa. Si
  // aquí se colapsa a `false`, la pantalla dirá «no es tuya» de algo que nadie
  // ha mirado — y es justo la frase sobre la que Alberto decide si llama.
  const r = interpretarLeads({ ...OK, leads: [{ ...OK.leads[0], yaEnCartera: null }] })
  assert.equal(r.ok && r.leads[0].yaEnCartera, null)
  const r2 = interpretarLeads(OK)
  assert.equal(r2.ok && r2.leads[0].yaEnCartera, false)
})

test('🚨 una fila sin id se CUENTA, no se descarta en silencio', () => {
  // Descartarla sin decirlo enseñaría una lista más corta de la que hay, y nadie
  // se enteraría de que falta un cliente.
  const r = interpretarLeads({ ...OK, leads: [{ ...OK.leads[0], id: null }, OK.leads[0]] })
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.leads.length, 1)
  assert.equal(r.ok && r.ilegibles, 1)
})

test('sinIdentificar viaja, y si no viene es null (no 0)', () => {
  const conDato = interpretarLeads(OK)
  assert.equal(conDato.ok ? conDato.sinIdentificar : 'no-ok', 1)
  const sin = interpretarLeads({ estado: 'ok', leads: [] })
  assert.equal(sin.ok ? sin.sinIdentificar : 'no-ok', null, '0 diría que se comprobó y no hay ninguno sin identificar')
})

test('🚨 `urgente` viene del puerto y solo un `true` explícito cuenta', () => {
  // La regla de qué es urgente vive en el módulo puro y la aplica el puerto.
  // Aquí solo se lee, y cualquier cosa que no sea `true` —ausente, null,
  // basura— es «no urgente»: inventarlo aquí daría dos verdades sobre qué se
  // hace hoy, y el badge de la cabecera dejaría de significar nada.
  const r = interpretarLeads(OK)
  assert.equal(r.ok && r.leads[0].urgente, true)
  const sin = interpretarLeads({ ...OK, leads: [{ ...OK.leads[0], urgente: undefined }] })
  assert.equal(sin.ok && sin.leads[0].urgente, false)
})

test('🚨 el titular sin respuesta NO se lee como «suya»', () => {
  // Es la fila de antes de que existiera la pregunta. Pintarla como «suya»
  // afirmaría algo que el cliente no ha dicho — y en esta pantalla se decide a
  // quién se llama y qué se le dice.
  const r = interpretarLeads(OK)
  assert.equal(r.ok && r.leads[0].titularTipo, 'empresa')
  assert.equal(r.ok && r.leads[0].titularEmpresa, 'GLOBAL 2 SL')

  for (const basura of [undefined, null, {}, { tipo: 'sociedad' }, 'propio']) {
    const x = interpretarLeads({ ...OK, leads: [{ ...OK.leads[0], titular: basura }] })
    assert.equal(x.ok && x.leads[0].titularTipo, 'sin_preguntar', `esto debería ser sin_preguntar: ${JSON.stringify(basura)}`)
  }
})

test('🚨 «no la tienes fichada» y «no se comprobó» no se funden', () => {
  // `fichaEmpresaId: null` con empresa declarada significa que esa sociedad NO
  // está en la cartera — que es justo el lead. Pintarlo igual que un «no se
  // preguntó» borraría la única señal de venta que trae la fila.
  const sinFicha = interpretarLeads(OK)
  assert.equal(sinFicha.ok && sinFicha.leads[0].fichaEmpresaId, null)
  assert.equal(sinFicha.ok && sinFicha.leads[0].titularTipo, 'empresa')

  const conFicha = interpretarLeads({ ...OK, leads: [{ ...OK.leads[0], fichaEmpresaId: 'c9' }] })
  assert.equal(conFicha.ok && conFicha.leads[0].fichaEmpresaId, 'c9')
})
