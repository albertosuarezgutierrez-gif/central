// Guardián de la guarda SÍNCRONA contra el doble clic en las seis pantallas de precio (07/10/2026). `node --test`.
// Cada consulta a Avant2/Codeoscopic cuesta 0,50€ y NO es idempotente: dos clics en el mismo tick (antes de que React
// repinte el botón deshabilitado) pedían dos veces. El `useRef` se lee al instante; el estado, no.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const BASE = 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/'
// Moto delega en pedirPrecio(forzarNuevo): la guarda va ahí para cubrir también «Descartar y pedir precio de cero».
const PANTALLAS: Array<[string, string, string]> = [
  ['auto-nuevo/AutoNuevo.tsx', 'cotizar', ''],
  ['moto-nuevo/CotizadorMoto.tsx', 'pedirPrecio', 'forzarNuevo: boolean'],
  ['vida-nuevo/VidaNuevo.tsx', 'cotizar', ''],
  ['salud-nuevo/SaludNuevo.tsx', 'cotizar', ''],
  ['decesos-nuevo/DecesosNuevo.tsx', 'cotizar', ''],
  ['hogar-nuevo/Formulario.tsx', 'cotizar', ''],
]

for (const [f, fn, args] of PANTALLAS) {
  test(`🪤 ${f}: ${fn}() lleva guarda síncrona con useRef, liberada en finally`, () => {
    const src = readFileSync(join(ROOT, BASE + f), 'utf8')
    assert.match(src, /import \{[^}]*\buseRef\b[^}]*\} from 'react'/, 'importa useRef')
    assert.match(src, /const cotizandoEnVuelo = useRef\(false\)/)
    const ini = src.indexOf(`async function ${fn}(${args}) {`)
    assert.ok(ini >= 0, `existe ${fn}()`)
    const cuerpo = src.slice(ini, src.indexOf('\n  }\n', ini))
    assert.match(cuerpo, /if \(cotizandoEnVuelo\.current\) return\s*\n\s*cotizandoEnVuelo\.current = true\s*\n\s*try \{[\s\S]*\} finally \{\s*\n\s*cotizandoEnVuelo\.current = false/, 'si hay una en vuelo, return; se libera en finally')
  })
}

test('🪤 moto: pedirPrecio() captura excepciones y las pinta como error con cobro DESCONOCIDO (no se queda en «cotizando»)', () => {
  const src = readFileSync(join(ROOT, BASE + 'moto-nuevo/CotizadorMoto.tsx'), 'utf8')
  const ini = src.indexOf('async function pedirPrecio(forzarNuevo: boolean) {')
  const cuerpo = src.slice(ini, src.indexOf('\n  }\n', ini))
  assert.match(cuerpo, /\} catch \(e\) \{[\s\S]*estado: 'error'[\s\S]*gastoDesconocido: true[\s\S]*\} finally \{/)
})
