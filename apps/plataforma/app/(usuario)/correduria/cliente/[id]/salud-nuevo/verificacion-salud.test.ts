// «Verificación antes de pedir precio» del cotizador de SALUD embebido en la oportunidad (13/10/2026). Salud reutiliza la
// verificación de decesos (`ramo: 'salud'`): su petición (`apps/asegura/lib/codeoscopic/peticion-salud.ts`) lleva lo mismo
// — `holder`, `risk.insureds[]` (tomador + asegurados desde FICHAS) y `effectiveDate`; ni importe ni modalidad viajan.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { gruposVerificacionDecesos, type EntradaVerificacionDecesos } from '../decesos-nuevo/verificacion-decesos.ts'
import { verificacionCompleta, type GrupoVerificacion } from '../auto-nuevo/verificacion-embebido.ts'

const dir = new URL('.', import.meta.url)
const fuente = readFileSync(new URL('./SaludNuevo.tsx', dir), 'utf8')
const acciones = readFileSync(new URL('./acciones.ts', dir), 'utf8')
const op = (f: string) => readFileSync(new URL(`../../../oportunidad/[id]/${f}`, dir), 'utf8')
const B = '22222222-2222-4222-8222-222222222222'

const entrada = (c: Partial<EntradaVerificacionDecesos> = {}): EntradaVerificacionDecesos => ({
  ramo: 'salud',
  tomador: { sinPrecalificar: false, faltaCivil: false, aMano: [], enFicha: [] },
  asegurados: [],
  figurasMulti: 'disponible',
  aseguradosSinFicha: 0,
  efecto: { vacia: true, fueraDeLimites: false },
  historialDeclarado: false,
  faltaAlgo: false,
  ...c,
})
const item = (g: GrupoVerificacion[], clave: string) => g.flatMap((x) => x.items).find((i) => i.clave === clave)

test('salud: el riesgo se rotula salud; solo lo de Avant2 (sin importe, modalidad ni preexistencias)', () => {
  const g = gruposVerificacionDecesos(entrada({ asegurados: [{ clienteId: B, nombre: 'Lucía', faltan: [], textoFalta: null, empresa: false }] }))
  assert.deepEqual(g.map((x) => x.titulo), ['1 · Figuras (tomador y asegurados)', '2 · Riesgo: salud'])
  assert.equal(verificacionCompleta(g), true)
  const textos = g.flatMap((x) => x.items).map((i) => i.texto.toLowerCase()).join(' | ')
  for (const p of ['capital', 'importe', 'modalidad', 'preexist', 'forma de pago']) assert.ok(!textos.includes(p), `no debe pedir «${p}»`)
})

test('salud: empresa como asegurado ✗ con el ramo correcto; historial declarado = aviso «no viaja en salud»', () => {
  const g = gruposVerificacionDecesos(entrada({ asegurados: [{ clienteId: B, nombre: 'ACME SL', faltan: ['empresa_no_asegurada'], textoFalta: null, empresa: true }], historialDeclarado: true }))
  assert.equal(item(g, `asegurado-${B}`)!.estado, 'falta')
  assert.match(item(g, `asegurado-${B}`)!.nota!, /asegurado de salud/)
  assert.match(item(g, 'historial-no-viaja')!.nota!, /en salud/)
  assert.equal(verificacionCompleta(g), false)
})

test('salud: asegurados tecleados sin ficha y fecha imposible bloquean (✗)', () => {
  assert.equal(verificacionCompleta(gruposVerificacionDecesos(entrada({ aseguradosSinFicha: 2 }))), false)
  const g = gruposVerificacionDecesos(entrada({ asegurados: [{ clienteId: B, nombre: 'Lucía', faltan: ['fechaNacimiento_invalida'], textoFalta: 'x', empresa: false }] }))
  assert.equal(item(g, `asegurado-${B}`)!.estado, 'falta')
})

// ── Cepos de fuente ─────────────────────────────────────────────────────────────
test('cepo: el botón de 0,50€ exige la verificación (y la guarda síncrona también) y el bloqueo de arriba', () => {
  assert.match(fuente, /const puedePulsarEmb = puedePulsar && \(!embebido \|\| \(delRiesgo !== null && verificacionOk\)\)/)
  assert.match(fuente, /disabled=\{!puedePulsarEmb\}/)
  assert.match(fuente, /if \(embebido && !\(delRiesgo !== null && verificacionOk\)\) return/)
  assert.match(fuente, /if \(bloqueo !== null\) return/)
  assert.match(fuente, /const puedePulsar = !cotizando && !faltaAlgo && bloqueo === null/)
  assert.match(fuente, /gruposVerificacionDecesos\(\{\s*ramo: 'salud',/)
})

test('cepo: embebido NO manda importe, modalidad ni lista tecleada; pide los asegurados de las fichas', () => {
  assert.match(fuente, /resueltos: embebido\s*\? \{ estadoCivilId \}/)
  assert.match(fuente, /aseguradosDeFiguras: embebido,/)
  assert.match(fuente, /\{!embebido && <AseguradosAdicionales /)
  assert.match(acciones, /aseguradosDeFiguras: entrada\.aseguradosDeFiguras === true && !!entrada\.variante\?\.oportunidadId/)
})

test('cepo: toda acción de salud corta sin acceso a la correduría ANTES de hablar con asegura', () => {
  for (const f of ['pedirPrecalificacionSalud', 'pedirCotizacionSalud', 'pedirTarificacionGuardadaSalud', 'abrirCotizadorSaludDeOportunidad']) {
    const i = acciones.indexOf(`export async function ${f}`)
    assert.ok(i >= 0, f)
    const cuerpo = acciones.slice(i, acciones.indexOf('\n}\n', i))
    const g = cuerpo.indexOf('await exigirCorreduria()')
    assert.ok(g > 0, `${f} sin exigirCorreduria`)
    for (const llamada of ['Asegura(', 'riesgoAsegura(']) {
      const j = cuerpo.indexOf(llamada)
      if (j >= 0) assert.ok(j > g, `${f}: ${llamada} antes de la guarda`)
    }
  }
  assert.match(acciones, /if \(l\.riesgo\.oportunidad\.ramo !== 'salud'\) return \{ estado: 'error'/)
})

test('cepo: salud está en el registro de cotizadores embebidos con su carcasa común y sus precios guardados', () => {
  const reg = op('cotizadores-embebidos.tsx')
  assert.match(reg, /salud: PedirPrecioSalud,/)
  assert.match(reg, /salud: PreciosVarianteSalud,/)
  const pp = op('PedirPrecioSalud.tsx')
  assert.match(pp, /abrir=\{abrirCotizadorSaludDeOportunidad\}/)
  assert.match(pp, /key=\{n\}/)
  assert.match(pp, /bloqueo=\{bloqueo\}/)
  assert.match(pp, /\n\s*embebido\n/)
})
