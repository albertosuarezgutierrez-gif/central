// «Verificación antes de pedir precio» del cotizador de DECESOS embebido en la oportunidad (13/10/2026).
// Lógica pura (`verificacion-decesos.ts`) + cepos de fuente: el botón de 0,50€ exige la verificación, los asegurados
// salen de las fichas (nunca una lista tecleada) y solo se piden los campos de Avant2.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { desdeRiesgoDecesos, gruposVerificacionDecesos, type EntradaVerificacionDecesos } from './verificacion-decesos.ts'
import { verificacionCompleta, type GrupoVerificacion } from '../auto-nuevo/verificacion-embebido.ts'
import { interpretarRiesgo } from '../../../../../../lib/riesgo-asegura.ts'

const dir = new URL('.', import.meta.url)
const fuente = readFileSync(new URL('./DecesosNuevo.tsx', dir), 'utf8')
const acciones = readFileSync(new URL('./acciones.ts', dir), 'utf8')
const op = (f: string) => readFileSync(new URL(`../../../oportunidad/[id]/${f}`, dir), 'utf8')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

function entrada(c: Partial<EntradaVerificacionDecesos> = {}): EntradaVerificacionDecesos {
  return {
    tomador: { sinPrecalificar: false, faltaCivil: false, aMano: [], enFicha: [] },
    asegurados: [],
    figurasMulti: 'disponible',
    aseguradosSinFicha: 0,
    efecto: { vacia: true, fueraDeLimites: false },
    historialDeclarado: false,
    faltaAlgo: false,
    ...c,
  }
}
const item = (g: GrupoVerificacion[], clave: string) => g.flatMap((x) => x.items).find((i) => i.clave === clave)
const aseg = (clienteId: string, nombre: string, faltan: string[] | null, empresa = false) => ({ clienteId, nombre, faltan, textoFalta: faltan === null ? 'No se pudo leer su ficha' : faltan.length ? `Falta en su ficha: ${faltan.join(', ')}` : null, empresa })

test('todo completo: figuras y riesgo, todo en ✓; sin historial declarado no hay grupo 3', () => {
  const g = gruposVerificacionDecesos(entrada({ asegurados: [aseg(B, 'Lucía', [])] }))
  assert.deepEqual(g.map((x) => x.titulo), ['1 · Figuras (tomador y asegurados)', '2 · Riesgo: decesos'])
  assert.equal(verificacionCompleta(g), true)
  assert.match(item(g, 'personas')!.texto, /Se aseguran 2 personas/)
})

test('solo lo de Avant2: no hay ítems de capital, modalidad, forma de pago ni parentesco', () => {
  const textos = gruposVerificacionDecesos(entrada({ asegurados: [aseg(B, 'Lucía', [])] })).flatMap((g) => g.items.map((i) => `${i.clave} ${i.texto}`)).join(' | ')
  assert.doesNotMatch(textos, /capital|modalidad|forma de pago|parentesco|teléfono/i)
})

test('asegurado con la ficha incompleta: ✗ con su nombre y «Editar arriba» a Intervinientes', () => {
  const g = gruposVerificacionDecesos(entrada({ asegurados: [aseg(B, 'Lucía', ['fechaNacimiento'])], faltaAlgo: false }))
  const i = item(g, `asegurado-${B}`)!
  assert.equal(i.estado, 'falta')
  assert.match(i.texto, /Lucía/)
  assert.equal(i.ancla, 'intervinientes')
  assert.equal(i.arriba, true)
  assert.equal(verificacionCompleta(g), false)
})

test('tres estados: ficha ilegible = aviso (no ✓ ni ✗ inventado); empresa = ✗', () => {
  const g = gruposVerificacionDecesos(entrada({ asegurados: [aseg(B, 'Lucía', null), aseg(C, 'ACME SL', ['empresa_no_asegurada'], true)] }))
  assert.equal(item(g, `asegurado-${B}`)!.estado, 'aviso')
  assert.equal(item(g, `asegurado-${C}`)!.estado, 'falta')
})

test('asegurados tecleados SIN ficha en «Datos del riesgo»: ✗ (no viajan: se cotizaría con menos personas)', () => {
  const g = gruposVerificacionDecesos(entrada({ aseguradosSinFicha: 2 }))
  const i = item(g, 'asegurados-sin-ficha')!
  assert.equal(i.estado, 'falta')
  assert.equal(i.ancla, 'datos-riesgo')
  assert.equal(verificacionCompleta(g), false)
})

test('estado civil del tomador y datos a mano: ✗ que se arreglan AQUÍ; lo de su ficha, arriba', () => {
  const g = gruposVerificacionDecesos(entrada({ tomador: { sinPrecalificar: false, faltaCivil: true, aMano: [{ campo: 'sexo', etiqueta: 'Sexo', relleno: false }], enFicha: [{ campo: 'weight', motivo: 'x' }] } }))
  assert.equal(item(g, 'tomador-civil')!.estado, 'falta')
  assert.notEqual(item(g, 'tomador-civil')!.arriba, true)
  assert.equal(item(g, 'tomador-sexo')!.estado, 'falta')
  assert.equal(item(g, 'tomador-ficha-weight')!.arriba, true)
})

test('migración pendiente o no comprobada: aviso, nunca «ninguno»; efecto fuera de fechas: ✗; historial declarado: aviso', () => {
  assert.equal(item(gruposVerificacionDecesos(entrada({ figurasMulti: 'sin_migracion' })), 'asegurados-migracion')!.estado, 'aviso')
  assert.equal(item(gruposVerificacionDecesos(entrada({ figurasMulti: null })), 'asegurados-desconocido')!.estado, 'aviso')
  assert.equal(item(gruposVerificacionDecesos(entrada({ efecto: { vacia: false, fueraDeLimites: true } })), 'efecto')!.estado, 'falta')
  const h = gruposVerificacionDecesos(entrada({ historialDeclarado: true }))
  assert.equal(h.length, 3)
  assert.equal(item(h, 'historial-no-viaja')!.estado, 'aviso')
  assert.equal(verificacionCompleta(h), true, 'un aviso no bloquea')
})

test('faltaAlgo sin ningún ✗ que lo explique: ✗ genérico, nunca un ✓ falso', () => {
  const g = gruposVerificacionDecesos(entrada({ faltaAlgo: true }))
  assert.equal(item(g, 'otro')!.estado, 'falta')
})

test('desdeRiesgoDecesos: asegurados por FICHA (sin el tomador, una vez cada una), lista tecleada e historial', () => {
  const l = interpretarRiesgo(200, {
    estado: 'ok',
    oportunidad: { id: 'op1', clienteId: A, clienteNombre: 'Ana', ramo: 'decesos' },
    roles: ['tomador', 'asegurado'],
    figurasMulti: 'disponible',
    figuras: [
      { rol: 'asegurado', clienteId: A, nombre: 'Ana', faltan: [] },
      { rol: 'asegurado', clienteId: B, nombre: 'Lucía Pérez', faltan: ['sexo'] },
      { rol: 'asegurado', clienteId: C, nombre: 'Lucía Pérez', faltan: [] },
      { rol: 'asegurado', clienteId: B, nombre: 'Lucía Pérez', faltan: ['sexo'] },
    ],
    vinculos: [],
    variantes: [],
    datosRiesgo: { clave: 'datosCapital', datos: { capital: 3000, asegurados: [{ nombre: 'Pepe', apellido1: 'X', fechaNacimiento: '2000-01-01', sexo: 'hombre' }] }, faltan: [] },
    historial: { seguroAnterior: null, historialDeclarado: { companiaActual: 'Ocaso' }, carnet: null },
  })
  assert.equal(l.estado, 'ok')
  if (l.estado !== 'ok') return
  const d = desdeRiesgoDecesos(l.riesgo, A)
  assert.deepEqual(d.asegurados.map((a) => a.clienteId), [B, C], 'mismo nombre, dos fichas = dos asegurados; el tomador no se repite')
  assert.equal(d.asegurados[0].textoFalta, 'Falta en su ficha: sexo')
  assert.equal(d.aseguradosSinFicha, 1)
  assert.equal(d.historialDeclarado, true)
  assert.equal(d.figurasMulti, 'disponible')
})

// ── Cepos de fuente ─────────────────────────────────────────────────────────────
test('cepo: el botón de 0,50€ exige la verificación (y la guarda síncrona también), y el bloqueo de arriba', () => {
  assert.match(fuente, /const puedePulsarEmb = puedePulsar && \(!embebido \|\| \(delRiesgo !== null && verificacionOk\)\)/)
  assert.match(fuente, /disabled=\{!puedePulsarEmb\}/)
  assert.match(fuente, /if \(embebido && !\(delRiesgo !== null && verificacionOk\)\) return/)
  assert.match(fuente, /const puedePulsar = !cotizando && !faltaAlgo && bloqueo === null/)
})

test('cepo: embebido NO manda capital ni lista tecleada; pide los asegurados de las fichas', () => {
  assert.match(fuente, /resueltos: embebido\s*\? \{ estadoCivilId \}/)
  assert.match(fuente, /aseguradosDeFiguras: embebido,/)
  assert.match(fuente, /\{!embebido && <AseguradosAdicionales /)
  assert.match(acciones, /aseguradosDeFiguras: entrada\.aseguradosDeFiguras === true && !!entrada\.variante\?\.oportunidadId/)
})

test('cepo: toda acción de decesos corta sin acceso a la correduría ANTES de hablar con asegura', () => {
  for (const f of ['pedirPrecalificacionDecesos', 'pedirCotizacionDecesos', 'pedirTarificacionGuardadaDecesos', 'abrirCotizadorDecesosDeOportunidad']) {
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
})

test('cepo: decesos está en el registro de cotizadores embebidos con su carcasa común y sus precios guardados', () => {
  const reg = op('cotizadores-embebidos.tsx')
  assert.match(reg, /decesos: PedirPrecioDecesos,/)
  assert.match(reg, /decesos: PreciosVarianteDecesos,/)
  const pp = op('PedirPrecioDecesos.tsx')
  assert.match(pp, /<PedirPrecioEmbebido<AperturaOk>/)
  assert.match(pp, /abrir=\{abrirCotizadorDecesosDeOportunidad\}/)
  assert.match(pp, /key=\{n\}/, 'cada lectura del riesgo monta un cotizador nuevo')
  assert.match(pp, /bloqueo=\{bloqueo\}/)
})

test('fecha de nacimiento imposible de un asegurado: ✗ con texto claro (no el genérico «fecha de nacimiento»)', () => {
  const g = gruposVerificacionDecesos(entrada({ asegurados: [aseg(B, 'Lucía', ['fechaNacimiento_invalida'])] }))
  assert.equal(item(g, `asegurado-${B}`)!.estado, 'falta')
  assert.equal(verificacionCompleta(g), false)
})
