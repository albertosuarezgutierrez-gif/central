import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guardián de «la póliza de CIMA miente por compañía» (27/09/2026).
 *
 * Allianz no manda la prima en el EIAC de póliza ni avanza su vencimiento al
 * renovar: las dos cosas llegan SOLO en el recibo anual (CA/NP). Una pantalla
 * que lee `primaReferencia()` a pelo pinta la moto de un cliente sin precio
 * (11 de 12 vivas sin prima, todas de Allianz). La lectura buena es
 * `primaConRecibos()` / `vencimientoConRecibos()` de `@central/module-seguros`.
 *
 * Este cepo impide que una lectura NUEVA de la prima se escriba sin recibos:
 * cualquier llamada a `primaReferencia(` fuera de la lista de abajo lo pone
 * rojo. Para añadir una, justifica en la lista por qué ahí no aplican.
 */

const PERMITIDOS = new Map<string, string>([
  // Compara la prima actual con las ofertas de Codeoscopic para retarificar;
  // una póliza sin prima propia se trata aparte en ese flujo (ver casos.ts).
  ['apps/asegura/lib/codeoscopic/casos.ts', 'retarificación: compara con ofertas'],
])

const RAICES = ['apps/asegura/lib', 'apps/asegura/app', 'apps/asegura-portal/lib', 'apps/asegura-portal/app', 'apps/plataforma/lib', 'apps/plataforma/app']

function fuentes(dir: string): string[] {
  let out: string[] = []
  let entradas: string[]
  try { entradas = readdirSync(dir) } catch { return out }
  for (const e of entradas) {
    if (e === 'node_modules' || e === 'generated' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out = out.concat(fuentes(p))
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

test('prima: nadie lee primaReferencia() a pelo fuera de la lista justificada', () => {
  const infractores = RAICES.flatMap(fuentes)
    .filter((f) => /\bprimaReferencia\(/.test(readFileSync(f, 'utf8')))
    .filter((f) => !PERMITIDOS.has(f))
  assert.deepEqual(infractores, [], `Usa primaConRecibos()/vencimientoConRecibos() (Allianz solo da prima en el recibo CA): ${infractores.join(', ')}`)
})

test('prima: las pantallas que ya se corrigieron siguen leyendo con recibos', () => {
  for (const f of [
    'apps/asegura/lib/cartera-ficha.ts',
    'apps/asegura/lib/cartera-poliza.ts',
    'apps/asegura/lib/cartera-filtro.ts',
    'apps/asegura/lib/cartera-impagados.ts',
    'apps/asegura-portal/lib/cartera-lectura.ts',
  ]) {
    const src = readFileSync(f, 'utf8')
    assert.match(src, /primaConRecibos\(/, `${f} ha dejado de leer la prima con recibos`)
  }
  for (const f of ['apps/asegura/lib/cartera-ficha.ts', 'apps/asegura/lib/cartera-poliza.ts', 'apps/asegura-portal/lib/cartera-lectura.ts']) {
    assert.match(readFileSync(f, 'utf8'), /vencimientoConRecibos\(/, `${f} ha dejado de leer el vencimiento con recibos`)
  }
})

test('prima: el aviso de renovación sin confirmar sigue en la tarjeta del cliente', () => {
  const src = readFileSync('apps/plataforma/app/(usuario)/correduria/cliente/[id]/SegurosCliente.tsx', 'utf8')
  assert.match(src, /Renovación sin confirmar por la compañía/)
})

test('prima: el aviso de vencimiento pasa la BRUTA a primaConRecibos (no la neta suelta)', () => {
  const src = readFileSync('apps/asegura/lib/avisos-vencimiento.ts', 'utf8')
  assert.match(src, /primaConRecibos\(\s*\{[^}]*primaBruta:/)
})
