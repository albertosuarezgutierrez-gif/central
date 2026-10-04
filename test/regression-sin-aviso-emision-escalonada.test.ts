// Dictado de Alberto (30/09/2026): «Es bloqueante si la compañía ya previamente nos informa (como Allianz con
// la moto de Manuel Piña Franco). Si no nos informa, no tiene por qué quedarse bloqueado: emitimos y ya está.»
// Nada recomienda «emitir la básica y ampliar por suplemento» salvo el bloqueo ANUNCIADO (`bloqueoCompania`).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const DIRS = ['packages/module-seguros/src', 'apps/plataforma/app/(usuario)/correduria', 'apps/plataforma/lib', 'apps/asegura/lib', 'apps/asegura/app']

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) ficheros(p, salida)
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) salida.push(p)
  }
  return salida
}

test('no hay aviso PREVENTIVO de emisión escalonada (solo el bloqueo anunciado por la compañía)', () => {
  const malos: string[] = []
  for (const d of DIRS) {
    let lista: string[] = []
    try { lista = ficheros(join(RAIZ, d)) } catch { continue }
    for (const f of lista) {
      const t = readFileSync(f, 'utf8')
      if (/emisionEscalonada|textoEmisionEscalonada|puede bloquearla al emitir|Todo riesgo o con robo:/i.test(t)) malos.push(f.slice(RAIZ.length + 1))
    }
  }
  assert.deepEqual(malos, [], 'Recomendación de emitir la básica sin bloqueo anunciado: solo se avisa si `bloqueoCompania(avisos)` no es null')
})
