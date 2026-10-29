import { test } from 'node:test'
import assert from 'node:assert'
import { validarExtraccion, idsEspanolesEn, emailsEn, normalizarCc, parcheSolicitud, entradaReceptor, faltasDe, confirmarViaCatastro, parsearPropuesta, destinatarios, type FilaSolicitud, type PropuestaIA } from './extraer.ts'
import { validarReceptor } from './receptor.ts'

// Caso REAL (reserva 160296956, House Sevillana, 29/10/2026): lo que escribió la huésped en el chat.
const LAIE = 'Hola! Necesito factura a Laietana de Llibreteria, S.L., NIF B-08549784, Via Laietana 26, 3ª planta, 08003 Barcelona, enviar a info@laie.es con copia a lcalles@laie.es. Gracias'
const IA_LAIE: PropuestaIA = {
  tipo: 'empresa', nombre: 'Laietana de Llibreteria, S.L.', nif: 'B-08549784', pais: 'ES', email: 'info@laie.es', cc: ['lcalles@laie.es'],
  direccion: { via: 'Via Laietana', numero: '26', resto: '3ª planta', cp: '08003', municipio: 'Barcelona' },
}
const MUNIS: Record<string, string[]> = { '08003': ['Barcelona'], '41003': ['Sevilla'], '08100': ['Mollet del Vallès'] }
const munis = (cp: string) => MUNIS[cp] ?? null

const VACIA: FilaSolicitud = { estado: 'pendiente', receptorTipo: null, receptorNombre: null, receptorNif: null, receptorPais: null, receptorEmail: null, receptorDireccion: null, receptorCc: null }

test('caso Laie: todo se extrae, CC por el texto, y el receptor resultante es VÁLIDO', () => {
  const x = validarExtraccion(IA_LAIE, [LAIE], munis)
  assert.equal(x.nif, 'B08549784')
  assert.equal(x.tipo, 'empresa')
  assert.equal(x.nombre, 'Laietana de Llibreteria, S.L.')
  assert.equal(x.email, 'info@laie.es')
  assert.deepEqual(x.cc, ['lcalles@laie.es'])
  assert.equal(x.pais, 'ES')
  assert.deepEqual(x.direccion, { pais: 'ES', cp: '08003', provincia: 'Barcelona', municipio: 'Barcelona', via: 'Via Laietana', numero: '26', resto: '3ª planta', viaCatastro: false })
  const parche = parcheSolicitud(VACIA, x)
  const fila = { ...VACIA, ...parche }
  const r = validarReceptor(entradaReceptor(fila))
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('anti-invención: NIF que no está en el texto o con control malo → null', () => {
  assert.equal(validarExtraccion({ ...IA_LAIE, nif: 'B08549785' }, [LAIE], munis).nif, null)
  assert.equal(validarExtraccion({ ...IA_LAIE, nif: 'A58818501' }, [LAIE], munis).nif, null) // válido pero inventado
  const malo = LAIE.replace('B-08549784', 'B-08549785')
  assert.equal(validarExtraccion({ ...IA_LAIE, nif: 'B08549785' }, [malo], munis).nif, null)
})

test('anti-invención: email inventado por la IA → no se rellena el destino', () => {
  const x = validarExtraccion({ ...IA_LAIE, email: 'facturas@laie.es' }, [LAIE], munis)
  assert.equal(x.email, null)
})

test('anti-invención: la IA no decide la copia; si la IA invierte destino y copia, manda el texto', () => {
  const x = validarExtraccion({ ...IA_LAIE, email: 'lcalles@laie.es', cc: ['info@laie.es'] }, [LAIE], munis)
  assert.equal(x.email, 'info@laie.es')
  assert.deepEqual(x.cc, ['lcalles@laie.es'])
})

test('dos correos sin «copia» → destino dudoso (null)', () => {
  const t = 'Factura a Laietana de Llibreteria SL, NIF B08549784, mandadla a info@laie.es o a lcalles@laie.es'
  const x = validarExtraccion(IA_LAIE, [t], munis)
  assert.equal(x.email, null)
  assert.deepEqual(x.cc, [])
})

test('nombre, calle, CP o municipio que no están en el texto → null', () => {
  assert.equal(validarExtraccion({ ...IA_LAIE, nombre: 'Laie Libros SA' }, [LAIE], munis).nombre, null)
  assert.equal(validarExtraccion({ ...IA_LAIE, direccion: { ...IA_LAIE.direccion, via: 'Calle Mayor' } }, [LAIE], munis).direccion, null)
  assert.equal(validarExtraccion({ ...IA_LAIE, direccion: { ...IA_LAIE.direccion, cp: '08004' } }, [LAIE], munis).direccion, null)
  assert.equal(validarExtraccion({ ...IA_LAIE, direccion: { ...IA_LAIE.direccion, numero: '62' } }, [LAIE], munis).direccion, null)
  // CP de otro municipio que el escrito: no casa con la tabla del CP.
  const t = LAIE.replace('08003 Barcelona', '08100 Barcelona')
  assert.equal(validarExtraccion({ ...IA_LAIE, direccion: { ...IA_LAIE.direccion, cp: '08100' } }, [t], munis).direccion, null)
})

test('DNI del registro + CIF de la empresa: vale el CIF; dos DNI → dudoso', () => {
  const t = `${LAIE}\nMi DNI para el registro: 12345678Z`
  assert.equal(validarExtraccion(IA_LAIE, [t], munis).nif, 'B08549784')
  const dos = 'Factura a mi nombre Juan Pérez, DNI 12345678Z. Mi mujer: 28823484E'
  assert.equal(validarExtraccion({ nombre: 'Juan Pérez', nif: '12345678Z' }, [dos], munis).nif, null)
})

test('idsEspanolesEn: formatos con guion, espacio, punto y prefijo ES', () => {
  assert.deepEqual(idsEspanolesEn('NIF B-08549784'), ['B08549784'])
  assert.deepEqual(idsEspanolesEn('cif: B 08549784.'), ['B08549784'])
  assert.deepEqual(idsEspanolesEn('VAT ESB08549784'), ['B08549784'])
  assert.deepEqual(idsEspanolesEn('B08549785'), [])
})

test('emailsEn: copia en varios idiomas, encadenadas y relés de OTA fuera', () => {
  assert.deepEqual(emailsEn('send to a@x.com, cc: b@x.com').copia, ['b@x.com'])
  assert.deepEqual(emailsEn('a a@x.com in copia c@x.com e d@x.com').copia, ['c@x.com', 'd@x.com'])
  assert.deepEqual(emailsEn('escríbeme a juan.123@guest.booking.com').todos, [])
})

test('normalizarCc: válidos, sin duplicados ni el destino', () => {
  assert.deepEqual(normalizarCc(['B@x.com', 'b@x.com', 'a@x.com', 'nope', 3], 'a@x.com'), ['b@x.com'])
  assert.deepEqual(normalizarCc(null, 'a@x.com'), [])
})

test('parche: NUNCA pisa lo ya puesto ni toca una solicitud completada por el formulario', () => {
  const x = validarExtraccion(IA_LAIE, [LAIE], munis)
  const conEmail = { ...VACIA, receptorEmail: 'otro@cliente.es' }
  assert.equal(parcheSolicitud(conEmail, x).receptorEmail, undefined)
  assert.deepEqual(parcheSolicitud({ ...VACIA, estado: 'completada' }, x), {})
  assert.deepEqual(parcheSolicitud({ ...VACIA, estado: 'cancelada' }, x), {})
  // País ya guardado distinto: ni NIF español ni dirección española se cuelan.
  const p = parcheSolicitud({ ...VACIA, receptorPais: 'FR' }, x)
  assert.equal(p.receptorNif, undefined)
  assert.equal(p.receptorDireccion, undefined)
})

test('sin propuesta de la IA no se rellena nada (null = pendiente)', () => {
  const x = validarExtraccion(null, [LAIE], munis)
  assert.equal(x.nif, null); assert.equal(x.nombre, null); assert.equal(x.direccion, null); assert.equal(x.tipo, null)
})

test('faltasDe: traduce errores de validarReceptor a lo que hay que pedir', () => {
  const r = validarReceptor(entradaReceptor({ ...VACIA, receptorNombre: 'Laietana SL', receptorTipo: 'empresa' }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.deepEqual(faltasDe(r.errores), ['nif', 'direccion', 'email'])
})

test('confirmarViaCatastro: solo con una coincidencia exacta', () => {
  assert.equal(confirmarViaCatastro('Via Laietana', [{ tipo: 'VIA', nombre: 'LAIETANA' }, { tipo: 'CL', nombre: 'LAIETANA BAIXA' }]), 'VIA LAIETANA')
  assert.equal(confirmarViaCatastro('Via Laietana', [{ tipo: 'CL', nombre: 'MAYOR' }]), null)
})

test('parsearPropuesta: JSON entre texto o vallas; basura → null', () => {
  assert.equal(parsearPropuesta('```json\n{"nif":"B08549784"}\n```')?.nif, 'B08549784')
  assert.equal(parsearPropuesta('no sé'), null)
  assert.equal(parsearPropuesta('{roto'), null)
  assert.equal(parsearPropuesta('[1,2]'), null)
})

test('destinatarios: CC limpio y sin el destino; sin copia no hay campo cc', () => {
  assert.deepEqual(destinatarios('info@laie.es', ['lcalles@laie.es', 'INFO@laie.es']), { to: 'info@laie.es', cc: ['lcalles@laie.es'] })
  assert.deepEqual(destinatarios('info@laie.es', null), { to: 'info@laie.es' })
  assert.deepEqual(destinatarios('info@laie.es', []), { to: 'info@laie.es' })
})
