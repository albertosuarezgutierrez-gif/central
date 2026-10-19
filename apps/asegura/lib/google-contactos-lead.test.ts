import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 🪤 Lead de correo → Google Contacts (19/10/2026). Leer el fuente es a propósito: estas funciones hablan
// con Prisma y con Google. La lógica de QUÉ se escribe es pura y la prueba
// `packages/module-seguros/src/google-contactos-lead.test.ts`.
const lead = readFileSync(new URL('./google-contactos-lead.ts', import.meta.url), 'utf8')
const inicio = lead.indexOf('export async function anadirFichasAGoogle')
const cuerpo = lead.slice(inicio, lead.indexOf('\n}\n', inicio))

test('anadirFichasAGoogle consulta la compuerta del cron ANTES de cualquier escritura o llamada a Google', () => {
  assert.ok(inicio >= 0)
  const iPuerta = cuerpo.indexOf('puertaSync(conexion)')
  assert.ok(iPuerta > 0, 'no consulta puertaSync')
  // Cada estado de la puerta que no es «adelante» corta con su estado claro.
  assert.match(cuerpo, /if \(puerta === 'pendiente_activar'\) return \{ estado: 'no_activada'/)
  assert.match(cuerpo, /if \(puerta !== 'adelante' \|\| !conexion\) return \{ estado: 'sin_conexion'/)
  const iCorte = cuerpo.indexOf("if (puerta !== 'adelante'")
  for (const escritura of ['.update(', '.create(', '.createMany(', '.deleteMany(', 'asegurarGrupo(', 'encolarRevisiones(', 'guardarVinculo(', 'accesoDesdeRefresh(', 'new People(', 'crearLote(', 'actualizarLote(']) {
    const i = cuerpo.indexOf(escritura)
    if (i >= 0) assert.ok(i > iCorte, `${escritura} va ANTES de la compuerta`)
  }
})

test('sin clave PII que abra la cartera no se escribe nada (regla 7), y el ensayo sale antes de escribir', () => {
  const iPii = cuerpo.indexOf("estadoClavePii(")
  const iEnsayo = cuerpo.indexOf('if (ensayo) return salida()')
  assert.ok(iPii > 0 && iEnsayo > 0)
  for (const escritura of ['encolarRevisiones(', 'guardarVinculo(', 'crearLote(', 'actualizarLote(']) {
    const i = cuerpo.indexOf(escritura)
    assert.ok(i > iPii, `${escritura} va antes de mirar la clave PII`)
    assert.ok(i > iEnsayo, `${escritura} va antes del corte del ensayo`)
  }
  // `asegurarGrupo` CREA la etiqueta: en ensayo solo se busca.
  assert.match(cuerpo, /ensayo \? \(\(await people\.buscarGrupo\(\)\) \?\? ''\) : await people\.asegurarGrupo\(\)/)
})

test('solo ejecuta lo de las fichas pedidas (accionesParaFichas), nunca el plan entero', () => {
  assert.match(cuerpo, /accionesParaFichas\(/)
  for (const prohibido of ['plan.crear', 'plan.actualizar', 'plan.retirar', 'plan.desvincular', 'plan.olvidar', 'plan.apartar', 'plan.reasignar', 'plan.refrescar', 'borrarLote(lote']) {
    assert.ok(!cuerpo.includes(prohibido), `ejecuta ${prohibido}: eso es del cron`)
  }
})

// La selección del cron mantiene los leads de correo que YA tienen vínculo: sin esto el cron los retiraría
// (no salen en `contactosMovil`) en la pasada siguiente al alta.
const seleccion = readFileSync(new URL('./contactos-google.ts', import.meta.url), 'utf8')
test('la selección de Google incluye los leads de correo vinculados (y solo los pedidos, sin vínculo)', () => {
  assert.match(seleccion, /\[\.\.\.new Set\(\[\.\.\.vinculadas, \.\.\.\(opciones\.leadsCorreo \?\? \[\]\)\]\)\]/)
  assert.match(seleccion, /fuente: 'correo', activo: true, mergedIntoClienteId: null/)
  assert.match(seleccion, /\.\.\.deLeadsCorreo,/)
  // Sin poder leer su contacto la selección NO está completa (si no, el cron los retiraría).
  assert.match(seleccion, /contactoCorreo !== null/)
})

// 🪤 RELLENO AUTOMÁTICO de leads de correo antiguos (19/10/2026): lo hace el cron horario, sin Bearer a mano.
const cron = readFileSync(new URL('../app/api/cron/google-contactos/route.ts', import.meta.url), 'utf8')
const iR = lead.indexOf('export async function rellenarLeadsCorreo')
const relleno = lead.slice(iR, lead.indexOf('\n}\n', iR))

test('el cron horario hace el relleno DESPUÉS de sincronizar y un fallo suyo no tumba el cron', () => {
  const iSync = cron.indexOf('await sincronizarGoogleContactos(')
  const iRel = cron.indexOf('await rellenarLeadsCorreo(')
  assert.ok(iSync > 0 && iRel > iSync, 'el relleno no va después de la sincronización')
  assert.match(cron, /try \{\s*relleno = await rellenarLeadsCorreo[\s\S]*?\} catch/)
  assert.match(cron, /r\.estado !== 'pii_no_descifra'/)
})

test('el relleno es acotado, se para solo y reutiliza la ruta idempotente (sin PII en logs)', () => {
  assert.ok(iR > 0)
  assert.match(lead, /export const LOTE_RELLENO = 10/)
  assert.match(lead, /export const MAX_LOTES_RELLENO = 3/)
  assert.match(relleno, /while \(lotes < maxLotes && Date\.now\(\) - desde < presupuesto\)/)
  assert.match(relleno, /if \(ids\.length === 0\) break/)          // sin pendientes no se pide ni un lote
  assert.match(relleno, /excluir: intentados/)                      // no repite fichas dentro de la pasada
  assert.match(relleno, /anadirFichasAGoogle\(correduriaId, ids\)/) // misma compuerta + vínculo ⇒ ya_estaba
  assert.match(relleno, /pendientes === 0 \? 'fin'/)
  assert.ok(!/console\./.test(relleno), 'el relleno no debe loguear')
})

test('el candidato del relleno excluye vinculadas y con duda en cola; el endpoint informa de `pendientes`', () => {
  assert.match(lead, /const SIN_CONTACTO = /)
  const cond = lead.slice(lead.indexOf('const SIN_CONTACTO'), lead.indexOf('export async function leadsCorreoSinContacto'))
  assert.match(cond, /google_contactos_vinculo/)
  assert.match(cond, /google_contactos_revision/)
  const ruta = readFileSync(new URL('../app/api/operador/google-contactos/lead/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /pendientes: await contarLeadsCorreoSinContacto/)
})
