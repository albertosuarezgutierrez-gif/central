import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Guardián de la ficha de cliente (25/09/2026). Pablo Guzmán: «no puedo
// modificar datos» y «no aparece fecha de carnet, debería traerla de CIMA».
// 1) Con la lista de contactos leída y VACÍA no había botón para añadir uno.
// 2) CIMA deja la fecha de nacimiento y la del carné en el INTERVINIENTE de la
//    póliza, no en la ficha; y lo engancha por DNI, a veces a una ficha
//    duplicada — por eso se casa por `nifLookupHash`, nunca por nombre ni
//    por `clienteId`.

const leer = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8')

test('ContactosFicha ofrece «Añadir» también con la lista vacía', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/ContactosFicha.tsx')
  assert.match(src, /\(lista === null \|\| items\.length === 0\) && !anadiendo/)
})

test('asegura rellena las fechas desde SUS pólizas casando por DNI', () => {
  const src = leer('apps/asegura/lib/cartera-ficha.ts')
  const f = src.slice(src.indexOf('async function datosDePolizas'), src.indexOf('export type CarnetFicha'))
  assert.match(f, /nifLookupHash: dniLookupHash/)
  assert.doesNotMatch(f, /clienteId:|nombre:/)
  assert.match(src, /dePolizas,\n/)
})

test('la cabecera enseña las fechas de la póliza cuando la ficha no las tiene', () => {
  const src = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/Cabecera.tsx')
  assert.match(src, /dePolizas\?\.fechaNacimiento/)
  assert.match(src, /dePolizas\?\.fechaCarnet/)
})
