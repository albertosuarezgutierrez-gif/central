import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🪤 Cepos de la identidad documentada (05/10/2026, caso «Estibaliz Slava» / «ESLAVA ANTOLI»).
 *
 * Leen el FUENTE (como `cartera-fusion.test.ts`): importar estas rutas arrastra el cliente de Prisma
 * generado, y el job de tests corre sin `prisma generate`. Las reglas puras tienen su test en
 * `packages/module-seguros/src/identidad-documentada.test.ts`.
 */
const raiz = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8')
const cuerpo = (src: string, desde: string, hasta: string) => {
  const i = src.indexOf(desde)
  assert.ok(i >= 0, `no encuentro «${desde}»`)
  const j = src.indexOf(hasta, i + desde.length)
  return src.slice(i, j < 0 ? undefined : j)
}

test('gate: la póliza acredita SOLO con su marca comprobada contra el índice ciego ACTUAL de la ficha', () => {
  const f = cuerpo(leer('lib/cartera-edicion.ts'), 'export async function editarCliente(', '// ─── Descartar')
  assert.match(f, /select: \{ tipo: true, estado: true, extraccion: true \}/)
  assert.match(f, /marcaAcreditaFicha\(d\.extraccion, \{ clienteId, dniLookupHash: ident\?\.dniLookupHash \?\? null \}\)/)
  assert.match(f, /acreditarCambioConDocumento\(\s*d \? \{ tipo: tipoDocumento\(d\.tipo\), estado: estadoDocumento\(d\.estado\), dniCoincideFicha \} : null,/)
})

test('gate: una PÓLIZA acredita solo nombre y apellidos; DNI/fecha con póliza solo con motivo, y se registra como motivo', () => {
  const f = cuerpo(leer('lib/cartera-edicion.ts'), 'export async function editarCliente(', '// ─── Descartar')
  // Los campos tocados y el motivo (con la vía permitida de ESTA llamada) entran en la decisión pura.
  assert.match(f, /camposIdentidadTocados\(r\.identidad\),\s*\{ motivo: edicion\.motivo, permiteMotivo \},/)
  assert.match(f, /if \(!acr\.ok\) return invalido\(acr\.motivo, 'documentoId'\)/)
  // Aceptado por motivo → el historial va por la rama del motivo, no por «acreditado con documento».
  assert.match(f, /if \(acr\.via === 'motivo'\) motivoCambio = acr\.motivoCambio/)
  assert.ok(!/documentoAcredita\(/.test(f), 'el gate no puede volver al booleano que no mira qué campos se tocan')
})

test('sin documento: solo con permiteMotivo explícito; por defecto (portal) NO', () => {
  const ed = leer('lib/cartera-edicion.ts')
  assert.match(ed, /const permiteMotivo = opciones\.permiteMotivo === true/)
  // El portal edita su contacto por `editarCliente` SIN opciones: nunca puede cambiar la identidad con un motivo.
  const portal = leer('lib/contacto-portal.ts')
  assert.ok(!/permiteMotivo/.test(portal), 'el portal no puede pasar permiteMotivo')
  const ruta = leer('app/api/operador/cliente/route.ts')
  assert.match(ruta, /editarCliente\(correduria\.id, body\.id, edicion, actorDe\(body\), \{ permiteMotivo: true \}\)/)
  // Sin documento ni motivo: 400.
  assert.match(ed, /STATUS_SIN_ACREDITAR\.has\(x\.motivo\) \? 400 : 422/)
})

test('el cambio con motivo deja en el historial antes → después (texto puro con DNI enmascarado)', () => {
  const f = cuerpo(leer('lib/cartera-edicion.ts'), 'export async function editarCliente(', '// ─── Descartar')
  assert.match(f, /const texto = motivoCambio\s*\?\s*\[\s*textoCambioIdentidadConMotivo\(/)
})

test('la marca se calcula ANTES del volcado (un DNI escrito por el propio documento no coincide consigo mismo)', () => {
  const src = leer('lib/oportunidad-documento.ts')
  const marca = src.indexOf('identidad.marca = {')
  const volcado = src.indexOf('await volcarPolizaEnFicha(')
  assert.ok(marca > 0 && volcado > 0 && marca < volcado, 'la marca va antes de volcarPolizaEnFicha')
  // Solo subidas verificadas; la propuesta, solo si sube el corredor.
  assert.match(src, /if \(hash && verificado\) identidad\.marca =/)
  assert.match(src, /if \(actual && puedeAbrirFiguras\(quienSube\)\)/)
})

test('la marca (con el hash) no viaja en la respuesta: solo id de ficha, id de documento y la propuesta', () => {
  const r = leer('app/api/operador/leer-documento/route.ts')
  assert.match(r, /identidad = \{ clienteId: p\.clienteId, documentoId: g\.documento\.id, propuesta: p\.propuesta \}/)
  assert.ok(!/dniHash/.test(r), 'la ruta no toca el hash')
  assert.match(r, /guardarExtraccion\(c\.id, g\.documento\.id, r\.bruto \?\? null, marca\)/)
})

test('releer un documento guardado («Leer para oportunidad») guarda su extracción (antes quedaba NULL)', () => {
  const r = leer('app/api/operador/documentos/[id]/route.ts')
  const post = cuerpo(r, 'export const POST', 'export const DELETE')
  assert.match(post, /documentoId: id,/)
})

test('fusión: identidad distinta sin decidir NO se fusiona, y la decisión queda en el historial', () => {
  const f = cuerpo(leer('lib/cartera-fusion.ts'), 'export async function fusionar(', 'async function anotarDecisionIdentidad')
  const sinDecidir = f.indexOf('identidadSinDecidir(campos, r.deAbsorbida, conservar)')
  const sql = f.indexOf('select fusionar_clientes(')
  assert.ok(sinDecidir > 0 && sql > sinDecidir, 'se comprueba antes de llamar a la BD')
  assert.match(f, /if \(sinDecidir\.length > 0\) \{\s*return \{\s*estado: 'invalido'/)
  assert.match(f, /await anotarDecisionIdentidad\(/)
  assert.match(leer('app/api/operador/cliente/fusion/route.ts'), /actor, body\?\.conservar\)/)
})
