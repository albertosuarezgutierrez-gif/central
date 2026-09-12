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
