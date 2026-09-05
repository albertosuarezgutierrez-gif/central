import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Bloque legal 0.4 — el paquete del derecho de acceso (art. 15) y portabilidad
 * (art. 20).
 *
 * 🚨 Lo que se protege aquí no es que compile, sino tres decisiones que, si se
 * deshacen, producen un documento que PARECE correcto:
 *
 * 1. Que lo sirva `apps/asegura` y no el portal. El rol del portal es estrecho
 *    a propósito; ampliarlo para un export dejaría abierto para siempre lo que
 *    hoy está cerrado.
 * 2. Que el hash del correo no viaje disfrazado de correo.
 * 3. Que el endpoint sea de OPERADOR, no una ruta que cualquiera con sesión del
 *    portal pueda llamar.
 */

const RUTA = 'apps/asegura/app/api/operador/export-rgpd/route.ts'
const LIB = 'apps/asegura/lib/export-rgpd.ts'
const MODULO = 'packages/module-seguros/src/export-rgpd.ts'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('el export lo sirve el puerto de OPERADOR, con su autorización', () => {
  const src = leer(RUTA)
  assert.match(src, /operadorAutorizado\(req\)/, 'el endpoint no comprueba la autorización de operador')
  assert.match(src, /status: 401/, 'sin 401 el puerto queda abierto')
})

test('el portal NO expone ninguna ruta de export: no puede leer la cartera', () => {
  // Si alguien añade una en el portal, o devuelve menos de lo que el art. 15
  // exige, o hubo que ampliar los GRANT del rol estrecho. Las dos cosas son
  // decisiones grandes que no deben colarse en un PR pequeño.
  const rutas = ['apps/asegura-portal/app/api/export-rgpd/route.ts', 'apps/asegura-portal/app/api/rgpd/route.ts']
  for (const r of rutas) {
    let existe = true
    try {
      leer(r)
    } catch {
      existe = false
    }
    assert.equal(existe, false, `el portal no debería servir el export: ${r}`)
  }
})

test('el hash del correo NO se pide ni viaja: no es «tu correo»', () => {
  // `portal_canal.valor_hash` es un HMAC irreversible. Devolverlo sería entregar
  // basura presentada como un dato personal del interesado.
  const src = leer(LIB)
  assert.ok(!/valorHash/.test(src), 'se está leyendo el hash del correo para el export')
  assert.match(src, /select: \{ id: true, tipo: true, verificadoEn: true, creadoEn: true \}/)
})

test('cada categoría se lee en su propio try: un fallo no borra un apartado en silencio', () => {
  const src = leer(LIB)
  assert.match(src, /catch \(e\)[\s\S]{0,200}motivo: 'no_consultable'/)
})

test('el paquete lleva la información del art. 15, no solo filas', () => {
  const src = leer(MODULO)
  for (const apartado of ['fines', 'destinatarios', 'conservacion', 'derechos', 'origen']) {
    assert.match(src, new RegExp(`${apartado}:`), `falta el apartado ${apartado} del art. 15`)
  }
  assert.match(src, /decisionesAutomatizadas/)
  assert.match(src, /transferenciasInternacionales/)
})

test('construirExport se niega a montar un paquete al que le falte una categoría', () => {
  const src = leer(MODULO)
  assert.match(src, /faltan las categorías/, 'sin esta guarda un export incompleto sale como completo')
})

test('la portabilidad se decide por el ORIGEN del dato, no a mano', () => {
  // El art. 20 solo cubre lo aportado por la persona. Una lista escrita a mano
  // se desincroniza en cuanto se añade una categoría; derivarlo del origen no.
  const src = leer(MODULO)
  assert.match(src, /export function esPortable[\s\S]{0,200}origen === 'aportado_por_ti'/)
})
