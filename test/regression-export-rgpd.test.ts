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

// ─────────────────────────────────────────────────────────────────────────────
// Los cepos de abajo leen el fuente **SIN COMENTARIOS** a propósito: la cabecera
// de `lib/export-rgpd.ts` NOMBRA el bug que arregló (`vinculos?.[0]`), así que un
// cepo que buscara esa cadena sobre el fichero entero estaría siempre rojo — y
// uno que exigiera la presencia de una línea casaría dentro de un comentario y
// seguiría verde sobre el código que la ha borrado.
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * El cuerpo de UNA llamada: desde el método hasta la siguiente consulta.
 *
 * El corte importa — con una ventana fija de N caracteres, el `select` de la
 * consulta SIGUIENTE entra en la ventana y el cepo pasa aunque esta no lo
 * tenga. Se vio: quitarle el `select` a `portalConsentimiento` dejaba el test
 * en verde porque alcanzaba el de `portalBien`.
 */
function llamada(src: string, metodo: string): string {
  const i = src.indexOf(metodo)
  assert.notEqual(i, -1, `no se encuentra la llamada ${metodo}`)
  const resto = src.slice(i + metodo.length)
  const fin = resto.search(/db\.[a-zA-Z]+\.find/)
  return metodo + (fin === -1 ? resto : resto.slice(0, fin))
}

test('🚨 la cartera se vuelca de TODOS los vínculos, no solo del primero', () => {
  // Una identidad puede tener varias fichas enlazadas (una persona y su
  // sociedad, una fusión pendiente): el índice único es por identidad+cliente,
  // no por identidad. Con `vinculos?.[0]` el paquete listaba DOS vínculos,
  // enseñaba UNA ficha y salía `completo: true` porque nada había fallado.
  const src = sinComentarios(leer(LIB))
  assert.ok(!/vinculos\??\.?\[0\]/.test(src), 'se está leyendo la cartera de un solo vínculo')
  assert.match(src, /for \(const f of fichas\)[\s\S]{0,400}db\.cliente\.findFirst/, 'la ficha no recorre los vínculos')
  assert.match(src, /for \(const f of fichas\)[\s\S]{0,400}db\.poliza\.findMany/, 'las pólizas no recorren los vínculos')
})

test('🚨 no poder leer los vínculos NO es «no tienes ficha enlazada»', () => {
  // `no_aplica` es una AFIRMACIÓN («tu acceso no está enlazado con ninguna
  // ficha») y además NO rompe la completitud: un fallo de consulta saldría como
  // un paquete completo que niega la cartera de alguien que sí la tiene.
  const src = sinComentarios(leer(LIB))
  for (const categoria of ['ficha_cartera', 'polizas_cartera']) {
    assert.match(
      src,
      new RegExp(`fichas === null\\s*\\?[\\s\\S]{0,200}noConsultable\\('${categoria}'\\)`),
      `${categoria} pinta un fallo de lectura de vínculos como una ausencia comprobada`,
    )
  }
})

test('🚨 partes y acreditaciones se leen con `select` explícito, nunca la fila entera', () => {
  // Sin `select`, una columna nueva de la tabla entra sola en un documento que
  // se le manda a una persona sin que nadie lo decida — y en `partes` esa
  // columna era `poliza_id`, que puede ser de OTRO cliente.
  const src = sinComentarios(leer(LIB))
  for (const modelo of ['db.portalParteSiniestro.findMany(', 'db.portalConsentimiento.findMany(']) {
    assert.match(llamada(src, modelo), /\bselect: \{/, `${modelo} se lleva la fila entera`)
  }
})

test('🚨 la póliza de un parte abierto sobre el contrato de OTRO no viaja', () => {
  // El parte es suyo y se le entrega entero; lo que no puede viajar es el
  // identificador del contrato de la persona que le autorizó a verlo.
  const src = sinComentarios(leer(LIB))
  assert.match(src, /polizaId: poliza === 'propia' \? polizaId : null/, 'el id de una póliza ajena sigue viajando')
  assert.match(src, /'de_un_tercero_que_te_autorizo'/, 'el parte de un tercero no se marca: se omitiría en silencio')
})

test('🚨 no poder comprobar de quién es la póliza NO se lee como «es tuya»', () => {
  const src = sinComentarios(leer(LIB))
  assert.match(src, /propias === null \? 'no_comprobada'/, 'un fallo de comprobación afirma la propiedad')
})
