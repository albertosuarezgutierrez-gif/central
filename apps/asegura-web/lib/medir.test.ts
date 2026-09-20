import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { medir, EVENTOS } from './medir.ts'

const RAIZ = join(import.meta.dirname, '..')

test('medir() devuelve false en entorno Node (sin window)', () => {
  assert.equal(medir('cta_portal_click', { origen: 'test' }), false, 'Sin window debe devolver false')
})

test('medir() captura el evento cuando window.posthog existe', () => {
  const llamadas: Array<[string, object]> = []
  const spy = (nombre: string, props?: object) => {
    llamadas.push([nombre, props || {}])
  }

  // Inyectar window.posthog temporal
  ;(globalThis as unknown as { window?: { posthog?: { capture?: (n: string, p?: object) => void } } }).window = {
    posthog: { capture: spy },
  }

  try {
    const resultado = medir('cta_portal_click', { origen: 'test' })
    assert.equal(resultado, true, 'Debe devolver true cuando captura exitosamente')
    assert.equal(llamadas.length, 1, 'Debe llamar capture exactamente una vez')
    assert.deepEqual(
      llamadas[0],
      ['cta_portal_click', { origen: 'test' }],
      'Debe pasar nombre y props correctamente'
    )
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window
  }
})

test('medir() devuelve false cuando window.posthog no existe', () => {
  ;(globalThis as unknown as { window?: { posthog?: unknown } }).window = {}

  try {
    const resultado = medir('cta_portal_click', { origen: 'test' })
    assert.equal(resultado, false, 'Debe devolver false sin posthog')
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window
  }
})

test('medir() devuelve false cuando window.posthog.capture no es función', () => {
  ;(globalThis as unknown as { window?: { posthog?: { capture?: unknown } } }).window = {
    posthog: { capture: 'no es una función' },
  }

  try {
    const resultado = medir('cta_portal_click', { origen: 'test' })
    assert.equal(resultado, false, 'Debe devolver false si capture no es función')
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window
  }
})

test('lib/medir.ts NO importa posthog-js ni usa localStorage', () => {
  const src = readFileSync(join(RAIZ, 'lib', 'medir.ts'), 'utf8')
  assert.doesNotMatch(src, /from ['"]posthog-js['"]/, 'lib/medir.ts no debe importar posthog-js')
  // Solo mirar código ejecutable (sin comentarios)
  const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(sinComentarios, /localStorage/, 'lib/medir.ts no debe usar localStorage')
})

test('components/Formulario.tsx NO envía datos personales en medir()', () => {
  const src = readFileSync(join(RAIZ, 'components', 'Formulario.tsx'), 'utf8')
  // Buscar la llamada a medir(
  const lineaConMedir = src.split('\n').find((l) => l.includes('medir(') && l.includes('lead_enviado'))
  assert.ok(lineaConMedir, 'Debe existir una llamada a medir con lead_enviado')
  // Verificar que NO contiene nombres de campos personales en la llamada
  assert.doesNotMatch(
    lineaConMedir,
    /nombre|telefono|email|mensaje|comentario/i,
    'No debe enviar datos personales (nombre, teléfono, email, etc.)'
  )
})

test('Todos los archivos del punto 3 contienen origen=', () => {
  const archivos: Array<{ ruta: string; origenes: string[] }> = [
    { ruta: 'components/Cabecera.tsx', origenes: ['cabecera'] },
    { ruta: 'components/CalculadoraVencimientos.tsx', origenes: ['calculadora'] },
    { ruta: 'app/page.tsx', origenes: ['home_cliente', 'home_cta'] },
    { ruta: 'app/gestor-de-seguros/page.tsx', origenes: ['gestor_arriba', 'gestor_abajo'] },
    { ruta: 'app/blog/[slug]/page.tsx', origenes: ['blog_cta'] },
  ]

  for (const archivo of archivos) {
    const src = readFileSync(join(RAIZ, archivo.ruta), 'utf8')
    for (const origen of archivo.origenes) {
      assert.match(
        src,
        new RegExp(`origen=["']${origen}["']`),
        `${archivo.ruta} debe contener origen="${origen}"`
      )
    }
  }
})

test('EnlaceMedido captura cta_portal_click con origen correcto', () => {
  const src = readFileSync(join(RAIZ, 'components', 'EnlaceMedido.tsx'), 'utf8')
  assert.match(src, /medir\('cta_portal_click'/, 'EnlaceMedido debe capturar cta_portal_click')
  assert.match(src, /origen/i, 'EnlaceMedido debe usar el prop origen')
})

test('CalculadoraVencimientos captura calculadora_calculo al primer resultado con fecha', () => {
  const src = readFileSync(join(RAIZ, 'components', 'CalculadoraVencimientos.tsx'), 'utf8')
  assert.match(src, /medir\('calculadora_calculo'/, 'CalculadoraVencimientos debe capturar calculadora_calculo')
})

test('Formulario captura lead_enviado solo en éxito', () => {
  const src = readFileSync(join(RAIZ, 'components', 'Formulario.tsx'), 'utf8')
  assert.match(src, /medir\('lead_enviado'/, 'Formulario debe capturar lead_enviado')
  // Verificar que está adentro de la condición de éxito
  assert.match(src, /if\s*\(\s*res\.ok\s*&&\s*json\.ok\s*\)\s*\{[\s\S]*?medir\('lead_enviado'/, 'lead_enviado debe estar en el bloque de éxito')
})

test('Portal test sigue siendo válido con EnlaceMedido', () => {
  const src = readFileSync(join(RAIZ, 'lib', 'portal.test.ts'), 'utf8')
  // Solo verificar que el test sigue existiendo y que menciona PORTAL_URL
  assert.match(src, /PORTAL_URL/, 'portal.test.ts debe seguir siendo válido')
})
