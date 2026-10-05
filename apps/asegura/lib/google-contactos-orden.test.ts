import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 🪤 Orden de escrituras que no se puede probar sin Prisma ni Google: se vigila en el fuente (como
// `google-contactos-puerta.test.ts`). Cada uno de estos órdenes evita perder o duplicar datos.
const cuerpoDe = (fichero: string, firma: string) => {
  const fuente = readFileSync(new URL(fichero, import.meta.url), 'utf8')
  const i = fuente.indexOf(firma)
  assert.ok(i >= 0, `no encuentro ${firma}`)
  return fuente.slice(i, fuente.indexOf('\n}\n', i))
}

test('resolverRevision: el claim atómico (estado pendiente → resuelta) va ANTES del alta del lead', () => {
  // Dos «Aceptar como lead» a la vez: si el alta va antes del claim, los dos crean un lead.
  const c = cuerpoDe('./google-contactos-revision.ts', 'export async function resolverRevision')
  const iClaim = c.search(/updateMany\(\{\s*where: \{ correduriaId, id: p\.id, estado: 'pendiente' \}/)
  const iAlta = c.indexOf('altaCliente(')
  assert.ok(iClaim > 0, 'no hay claim condicionado a «pendiente»')
  assert.ok(iAlta > 0)
  assert.ok(iClaim < iAlta, 'el alta del lead va antes del claim: dos clics a la vez crean dos leads')
})

test('guardarConexion: cifra ANTES de borrar vínculos, y borrado + upsert en UNA transacción', () => {
  const c = cuerpoDe('./google-contactos.ts', 'export async function guardarConexion')
  const iCifrar = c.indexOf('cifrar(t.refreshToken)')
  const iBorrar = c.indexOf('googleContactosVinculo.deleteMany')
  const iTx = c.indexOf('$transaction(')
  const iUpsert = c.indexOf('googleContactosConexion.upsert')
  assert.ok(iCifrar >= 0 && iBorrar >= 0 && iUpsert >= 0)
  assert.ok(iCifrar < iBorrar, 'si el cifrado falla ya se habrían perdido los vínculos')
  assert.ok(iTx >= 0 && iTx < iBorrar && iTx < iUpsert, 'borrado de vínculos y upsert de la conexión no van en la misma transacción')
})

test('adopción: el contacto entra en la etiqueta ANTES de guardar su vínculo', () => {
  const c = cuerpoDe('./google-contactos.ts', 'export async function sincronizarGoogleContactos')
  const bucle = c.slice(c.indexOf('trocear(plan.actualizar'), c.indexOf('trocear(plan.crear'))
  const iGrupo = bucle.indexOf('anadirAlGrupo(grupo, adoptados)')
  const iVinculo = bucle.indexOf('guardarVinculo(')
  assert.ok(iGrupo > 0, 'los adoptados no se meten en la etiqueta')
  assert.ok(iGrupo < iVinculo, 'un vínculo de un contacto fuera de la etiqueta se apartaría como «sacado del grupo»')
  assert.match(bucle, /a\.anadirAlGrupo && !adopcionOk\) \{ fallidos\+\+; continue \}/)
})
