import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Retarificar una póliza de MOTO de la cartera (23/09/2026). Caso fundacional:
// la moto de Víctor De la Fuente (Allianz 031698897) salía con modelos de COCHE
// porque CIMA la guardó como `auto`; corregida a `moto`, asegura contestaba 409
// «hoy solo se retarifica auto y hogar». Estos cepos fijan las tres piezas que
// lo cierran: el puerto rama moto, la precalificación la sirve, y la pantalla
// de plataforma pide el precio SOBRE LA PÓLIZA (no como moto nueva de calle).

const raiz = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8')

test('asegura: prepararRetarificacion rama moto con su propia preparación', () => {
  const src = leer('apps/asegura/lib/retarificar-cartera.ts')
  assert.match(src, /origen\.tipo === 'moto'\)\s*\{\s*preparado = await prepararMoto\(/)
  // Con la póliza como anterior (bonus), no de calle: la precalificación de cartera.
  assert.match(src, /precalificarMoto\(origen\.cliente, origen\.poliza,/)
  assert.match(src, /construirPeticionMoto\(datos as DatosMoto, moto\.id\)/)
})

test('asegura: /precalificar sirve también moto (si no, la pantalla abriría sin huecos)', () => {
  const src = leer('apps/asegura/app/api/operador/codeoscopic/precalificar/route.ts')
  assert.match(src, /origen\.tipo !== 'auto' && origen\.tipo !== 'moto'/)
  assert.match(src, /origen\.tipo === 'moto'\s*\n?\s*\?\s*precalificarMoto\(/)
})

test('plataforma: la póliza de moto abre la pantalla de moto en modo póliza', () => {
  const page = leer('apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/page.tsx')
  assert.match(page, /if \(ramo === 'moto'\)/)
  assert.match(page, /<MotoNuevo\s+poliza=\{\{/)
})

test('plataforma: en modo póliza el precio se pide por /retarificar de ESA póliza', () => {
  const moto = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx')
  assert.match(
    moto,
    /poliza\s*\n?\s*\?\s*await pedirCotizacion\(\{\s*polizaId: poliza\.id,/,
    'con póliza, la cotización tiene que ir a pedirCotizacion(polizaId): pedirCotizacionMoto la ' +
      'cotizaría de calle, sin la compañía anterior ni la antigüedad que dan el bonus',
  )
})

test('plataforma: en modo póliza un hueco que no se arregla en pantalla apaga el botón', () => {
  const moto = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx')
  assert.match(
    moto,
    /\|\| \(poliza !== null && huerfanos\.length > 0\)/,
    'sin esto, con la compañía o el nº anterior vacíos en la póliza, el botón se enciende y el servidor ' +
      'lo rechaza: la pantalla promete un precio que no llega',
  )
})

test('emisión de moto: el precio de una póliza se puede emitir con el MISMO panel que auto', () => {
  const moto = leer('apps/plataforma/app/(usuario)/correduria/cliente/[id]/moto-nuevo/MotoNuevo.tsx')
  assert.match(moto, /import \{ Emision \} from '\.\.\/\.\.\/\.\.\/poliza\/\[id\]\/retarificar\/emision'/)
  // Solo en modo póliza (hay una póliza de la cartera a la que colgar la nueva)…
  assert.match(moto, /emitible=\{poliza !== null\}/)
  // …y nunca sobre un precio simulado o sin cotización guardada.
  assert.match(moto, /const puedeEmitir = emitible && !r\.simulado && cotizacionId !== null/)
  assert.match(moto, /guardado: r\.guardado,/, 'sin el `guardado` de la respuesta no hay cotizacionId y el botón nunca se enciende')
})

test('ReRate: las opciones por defecto de Allianz AUTO no se mandan a una moto', () => {
  const oferta = leer('apps/asegura/app/api/operador/codeoscopic/oferta/route.ts')
  assert.match(oferta, /opcionesPorDefecto\(compania, t\.producto\)/)
})
