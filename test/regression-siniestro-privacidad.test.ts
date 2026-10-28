// Cepo de PRIVACIDAD del meta del hilo de siniestros: PII (ficha, veredicto, índice, ficha del perito, citas) SOLO cifrada.
// + valoración, pre-rehúse y partes del portal: contrato del puerto leído del fuente.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const leer = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')
const HILO = leer('apps/asegura/lib/siniestro-hilo.ts')
const IA = leer('apps/asegura/lib/siniestro-ia.ts')

test('privacidad: la única escritura del meta pasa por empaquetarMetaPrivado con encryptField', () => {
  assert.match(HILO, /empaquetarMetaPrivado\(meta, encryptField, META_MAX_BYTES\)/)
  assert.match(HILO, /meta: metaFinal === null \? Prisma\.DbNull : \(metaFinal as Prisma\.InputJsonObject\)/)
  assert.doesNotMatch(HILO, /meta: meta === null \? Prisma\.DbNull/, 'el meta sin empaquetar no se escribe')
})

test('privacidad: la lectura descifra meta.privado (mismos campos para la UI y la caché del gabinete)', () => {
  assert.match(HILO, /desempaquetarMetaPrivado\(esObjeto\(f\.meta\) \? f\.meta : null, decryptField\)/)
})

test('privacidad: nadie escribe veredicto/fichaCaso/indicePoliza/fichaPerito en claro con SQL ni con prisma directo', () => {
  for (const f of ['apps/asegura/lib/siniestro-ia.ts', 'apps/asegura/app/api/operador/siniestro/hilo/volcado/route.ts', 'apps/asegura/app/api/operador/siniestro/hilo/route.ts']) {
    assert.doesNotMatch(leer(f), /siniestroMensaje\.(create|update|upsert)/, `${f}: la escritura es solo anadirMensajeSiniestro`)
  }
  assert.equal((HILO.match(/siniestroMensaje\.create\(/g) ?? []).length, 1)
  assert.doesNotMatch(HILO, /insert into siniestro_mensajes/i)
  // Lo que se lee de la BD en claro (SQL crudo sobre meta) nunca toca las claves privadas.
  assert.doesNotMatch(HILO, /meta->>?'(veredicto|fichaCaso|indicePoliza|fichaPerito|citas)'/)
})

test('privacidad: el tope del meta en claro del gabinete deja sitio al crecimiento del cifrado (≈1,4×)', () => {
  const m = IA.match(/const META_MAX = ([\d_]+)/)
  assert.ok(m)
  assert.ok(Number(m![1].replace(/_/g, '')) * 1.4 <= 20_000)
})

test('valoración, pre-rehúse y partes: contrato del puerto', () => {
  const ruta = leer('apps/asegura/app/api/operador/siniestro/hilo/route.ts')
  assert.match(ruta, /valorarAnalisisSiniestro\(/)
  assert.match(ruta, /metaPreRehuse\(c\.id, siniestroId, b\.texto\)/)
  assert.match(ruta, /preRehuse \? \{ preRehuse: true \}/)
  assert.match(HILO, /autor: 'ia' \}/, 'la valoración exige un mensaje ia')
  assert.match(HILO, /autor: 'interna', tipo: 'nota'/)
  const vol = leer('apps/asegura/app/api/operador/siniestro/hilo/volcado/route.ts')
  assert.match(vol, /metaPreRehuse\(c\.id, siniestroId, t\.texto\)/)
  assert.match(vol, /preRehuse \? \{ preRehuse: true \}/)
  assert.match(HILO, /portalParteSiniestro\.findMany\(\{\s*where: \{ siniestroId \}/)
  assert.match(HILO, /portalParteId: \{ in:/)
  assert.match(IA, /correccionesDeValoraciones\(vigentes\)/)
})
