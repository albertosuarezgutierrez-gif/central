import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { interpretarOferta } from './retarificar-asegura.ts'

// El 422 que asegura devuelve cuando la compañía pide un dato que ni el
// proyecto ni la ficha tienen (11º 400 real, la calle).
const FALTAN = {
  estado: 'faltan_vendor',
  faltan: [{ campo: 'nombreVia', motivo: 'la compañía lo exige para confirmar el precio: «The road name…»' }],
  sugeridos: { nombreVia: 'SAN VICENTE' },
  noReconocidos: ['The `policyApplications` body part is required.'],
  mensaje: 'codeoscopic_validacion: {...}',
}

test('un 422 faltan_vendor llega a la pantalla como huecos, no como error', () => {
  const r = interpretarOferta(422, FALTAN)
  assert.equal(r.estado, 'faltan_vendor')
  if (r.estado !== 'faltan_vendor') return
  assert.deepEqual(r.faltan.map((f) => f.campo), ['nombreVia'])
  assert.deepEqual(r.sugeridos, { nombreVia: 'SAN VICENTE' })
  assert.deepEqual(r.noReconocidos, ['The `policyApplications` body part is required.'])
})

// El widget de la Product Form Library necesita el `mainQuote` TAL CUAL del
// ReRate (`productForm.render(quote)`); esto comprueba que el puerto de
// plataforma lo deja pasar sin reshaping, ni siquiera para saber su forma.
test('un 200 ok propaga quoteCrudo sin tocarlo', () => {
  const quoteCrudo = { id: 'Q7601460', product: { id: 10, options: [] } }
  const r = interpretarOferta(200, {
    estado: 'ok',
    projectId: '40769244',
    oferta: { offerId: 'Q7601460', primaEur: 319.02, firmeza: 'firme', caducaEn: null, avisos: [], quoteCrudo },
    cuenta: null,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.quoteCrudo, quoteCrudo)
})

test('un 200 ok sin quoteCrudo (respuesta vieja de asegura) no rompe: null', () => {
  const r = interpretarOferta(200, {
    estado: 'ok',
    projectId: '40769244',
    oferta: { offerId: 'Q7601460', primaEur: 319.02, firmeza: 'firme', caducaEn: null, avisos: [] },
    cuenta: null,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.quoteCrudo, null)
})

test('sugeridos, noReconocidos y faltan con forma rara degradan, no rompen la pantalla', () => {
  const r = interpretarOferta(422, {
    ...FALTAN,
    sugeridos: 'x',
    noReconocidos: [1, 'ok'],
    faltan: [null, 'nombreVia', { campo: 'telefono' }, { campo: 7 }],
  })
  assert.equal(r.estado, 'faltan_vendor')
  if (r.estado !== 'faltan_vendor') return
  assert.deepEqual(r.sugeridos, {})
  assert.deepEqual(r.noReconocidos, ['ok'])
  assert.deepEqual(r.faltan, [{ campo: 'telefono', motivo: '' }])
})

// ─── Las dos listas tienen que ser la MISMA lista ────────────────────────────
// La pantalla solo ofrece input para los campos de ETIQUETAS_HUECO; asegura
// solo acepta en `correcciones` los de CAMPOS_PERSONA. Si divergen, un campo
// que asegura repararía gratis se pinta como «cotizar de cero» (0,50€), o al
// revés, se ofrece un input que la ruta rechaza con 400. Se leen los DOS
// fuentes, como hace `apps/asegura-web/lib/contrato-lead.test.ts`.
test('ETIQUETAS_HUECO (plataforma) = CAMPOS_PERSONA (asegura), campo a campo', () => {
  const asegura = readFileSync(
    fileURLToPath(new URL('../../asegura/lib/codeoscopic/interprete-400.ts', import.meta.url)),
    'utf8',
  )
  const pantalla = readFileSync(
    fileURLToPath(new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx', import.meta.url)),
    'utf8',
  )
  const bloqueAsegura = /export const CAMPOS_PERSONA[^=]*=\s*\[([\s\S]*?)\]/.exec(asegura)?.[1] ?? ''
  const camposAsegura = [...bloqueAsegura.matchAll(/'([a-zA-Z0-9]+)'/g)].map((m) => m[1]).sort()
  const bloquePantalla = /const ETIQUETAS_HUECO[^=]*=\s*\{([\s\S]*?)\n\}/.exec(pantalla)?.[1] ?? ''
  const camposPantalla = [...bloquePantalla.matchAll(/^\s*([a-zA-Z0-9]+):\s*\{/gm)].map((m) => m[1]).sort()
  assert.ok(camposAsegura.length > 0 && camposPantalla.length > 0, 'las dos listas tienen que encontrarse en el fuente')
  assert.deepEqual(camposPantalla, camposAsegura)
})

test('un 409 patch_no_aplicado es su propio estado: manda a cotizar de cero, no a reintentar', () => {
  const r = interpretarOferta(409, { estado: 'error', causa: 'patch_no_aplicado', mensaje: 'no cuajó' })
  assert.equal(r.estado, 'patch_no_aplicado')
  if (r.estado !== 'patch_no_aplicado') return
  assert.match(r.mensaje, /no cuajó/)
})

test('un 502 del vendor sin traducir sigue siendo error, como antes', () => {
  const r = interpretarOferta(502, { estado: 'error', causa: 'vendor', mensaje: 'codeoscopic_servidor: 500' })
  assert.equal(r.estado, 'error')
})

// La cuenta de cargo tras el ReRate viene en TRES formas: la cuenta (enmascarada),
// un aviso de por qué no hay una utilizable, o null = se miró y no hay ninguna.
// `no_comprobada` (la consulta falló) NUNCA se lee como «no tiene».
test('el aviso de la cuenta se lee tal cual y lo desconocido no se convierte en «no tiene»', async () => {
  const { leerAvisoCuenta } = await import('./retarificar-asegura.ts')
  assert.equal(leerAvisoCuenta({ aviso: 'no_comprobada' }), 'no_comprobada')
  assert.equal(leerAvisoCuenta({ aviso: 'ilegible' }), 'ilegible')
  assert.equal(leerAvisoCuenta({ aviso: 'invalida' }), 'invalida')
  assert.equal(leerAvisoCuenta({ aviso: 'otra_cosa' }), null)
  assert.equal(leerAvisoCuenta({ enmascarada: 'ES91…1332' }), null)
  assert.equal(leerAvisoCuenta(null), null)
  // Y la pantalla pinta los tres avisos con frases DISTINTAS: cada uno se arregla en otro sitio.
  const pantalla = readFileSync(fileURLToPath(new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/emision.tsx', import.meta.url)), 'utf8')
  for (const a of ['ilegible', 'invalida', 'no_comprobada']) assert.match(pantalla, new RegExp(`aviso === '${a}'`), a)
})

// El 422 que asegura devuelve cuando el ReRate pide un campo del FORMULARIO
// de la compañía (`product.options`, visto real con Occident: leasing/renting,
// tipo de adquisición) — DISTINTO de `faltan_vendor` (eso es un valor suelto
// de persona; esto es el Product Form Library montado sobre `quoteCrudo`).
const FALTAN_PRODUCTO = {
  estado: 'faltan_producto',
  campos: ['¿El vehículo se encuentra en situación de leasing o renting?', 'Tipo de adquisición del vehículo'],
  quoteCrudo: { id: 'Q9', product: { id: 20, options: null } },
  mensaje: 'Occident: El campo Tipo de adquisición del vehículo de Occident es obligatorio.',
}

test('un 422 faltan_producto llega a la pantalla con sus campos y el quoteCrudo, sin tocarlo', () => {
  const r = interpretarOferta(422, FALTAN_PRODUCTO)
  assert.equal(r.estado, 'faltan_producto')
  if (r.estado !== 'faltan_producto') return
  assert.deepEqual(r.campos, FALTAN_PRODUCTO.campos)
  assert.deepEqual(r.quoteCrudo, FALTAN_PRODUCTO.quoteCrudo)
  assert.match(r.mensaje, /Tipo de adquisición/)
})

test('faltan_producto sin campos reconocibles no revienta: lista vacía, no undefined', () => {
  const r = interpretarOferta(422, { estado: 'faltan_producto', campos: 'no-es-un-array', mensaje: 'x' })
  assert.equal(r.estado, 'faltan_producto')
  if (r.estado !== 'faltan_producto') return
  assert.deepEqual(r.campos, [])
  assert.equal(r.quoteCrudo, null)
})
