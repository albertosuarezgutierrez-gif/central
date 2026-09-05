// Guardián del lector del PORTAL DEL CLIENTE en plataforma
// (`apps/plataforma/lib/portal-cliente-asegura.ts`). Puro: sin red.
//
// ── Qué protege, y por qué justo esto ───────────────────────────────────────
// El botón «Invitar al portal» (05/09/2026) manda un correo a una persona real
// y la manda a una pantalla. El modo de fallo caro NO es que el correo no
// salga: es que salga cuando el portal no sabría vincular a esa persona con su
// ficha. Entonces entra, teclea su código y ve una bóveda VACÍA, sin ningún
// error, como si no tuviera pólizas. O sea: el fallo se ve idéntico a «este
// señor no tiene seguros».
//
// De ahí los cuatro cepos de este fichero, que son la regla «dato que NO hay ≠
// dato que NO se ha mirado» aplicada a esta pantalla:
//   1. un `estado` desconocido NO se lee como `invitable` (sería prometer que
//      la invitación funciona sin haberlo mirado);
//   2. `identidades: null` («no se pudo contar») ≠ `0` («se contó y no entra
//      nadie»);
//   3. sin `ultimoAccesoEn` se dice «no consta cuándo», JAMÁS «nunca ha
//      entrado» — llegamos ahí porque hay una identidad vinculada, o sea que
//      entrar entró; lo que falta es la marca;
//   4. los siete estados producen textos DISTINTOS: cada uno se arregla en un
//      sitio distinto (pedirle el correo · resolver un duplicado · mirar una
//      variable de Vercel · reintentar), y dos que coincidan es que se han
//      colapsado en un «no se pudo» que no dice a dónde ir.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS_PORTAL,
  FALLOS_INVITACION,
  explicarPortal,
  interpretarInvitacion,
  interpretarPortal,
  leerPortal,
  textoIdentidades,
  textoInvitacion,
  textoMotivoPortal,
  textoUltimoAcceso,
  type EstadoPortalCartera,
} from '../apps/plataforma/lib/portal-cliente-asegura.ts'

const YA_ENTRA = { estado: 'ya_entra', ultimoAccesoEn: '2026-09-03T18:42:00.000Z', identidades: 1 }

test('🚨 un estado desconocido NO se convierte en `invitable`: se lee como «no comprobado»', () => {
  for (const raro of ['invitables', 'INVITABLE', 'ok', '', 'otro', 'desconocido', 42, null, undefined]) {
    const p = leerPortal({ estado: raro, ultimoAccesoEn: null, identidades: null })
    assert.ok(p, `un bloque con estado ${String(raro)} sigue siendo legible`)
    assert.notEqual(p.estado, 'invitable', `«${String(raro)}» no puede acabar en invitable`)
    assert.equal(p.estado, 'no_comprobado')
    // Y lo que la pantalla haga con eso: ningún botón, y no es «no se puede».
    assert.equal(explicarPortal(p).accion, 'ninguna')
  }
  // El valor de cajón tampoco: `'otro'` es «no lo he sabido leer» disfrazado de dato.
  assert.equal(leerPortal({ estado: 'otro' })?.estado, 'no_comprobado')
})

test('los siete estados del puerto se leen tal cual', () => {
  for (const e of ESTADOS_PORTAL) {
    assert.equal(leerPortal({ estado: e, ultimoAccesoEn: null, identidades: 0 })?.estado, e)
  }
})

test('🚨 identidades null se conserva como null, jamás como 0', () => {
  assert.equal(leerPortal({ ...YA_ENTRA, identidades: null })?.identidades, null)
  assert.equal(leerPortal({ ...YA_ENTRA, identidades: undefined })?.identidades, null, 'sin contar ≠ no entra nadie')
  assert.equal(leerPortal({ ...YA_ENTRA, identidades: 'dos' })?.identidades, null)
  assert.equal(leerPortal({ ...YA_ENTRA, identidades: 0 })?.identidades, 0, 'cero contado SÍ es un dato')
  // Y en pantalla son frases distintas, que es donde se nota.
  assert.notEqual(textoIdentidades(null), textoIdentidades(0))
  assert.match(textoIdentidades(null), /no se ha podido contar/)
  assert.match(textoIdentidades(0), /se ha mirado/)
  assert.match(textoIdentidades(1), /1 persona/)
  assert.match(textoIdentidades(3), /3 personas/)
})

test('🚨 sin ultimoAccesoEn se dice «no consta cuándo», NUNCA «nunca ha entrado»', () => {
  const sinFecha = textoUltimoAcceso(null)
  assert.match(sinFecha, /no consta/)
  assert.doesNotMatch(sinFecha, /nunca/i, 'no hay identidad vinculada sin haber entrado: falta la marca, no la visita')
  // La misma frase entra en el titular del bloque, así que se comprueba ahí también.
  const t = explicarPortal({ estado: 'ya_entra', ultimoAccesoEn: null, identidades: 2 }).titulo
  assert.match(t, /Ya entra/)
  assert.doesNotMatch(t, /nunca/i)
  // Una fecha ilegible vale lo mismo que no venir: null, no un día inventado.
  assert.equal(leerPortal({ ...YA_ENTRA, ultimoAccesoEn: 'ayer' })?.ultimoAccesoEn, null)
  assert.equal(leerPortal({ ...YA_ENTRA, ultimoAccesoEn: null })?.ultimoAccesoEn, null)
  assert.equal(leerPortal(YA_ENTRA)?.ultimoAccesoEn, YA_ENTRA.ultimoAccesoEn)
  assert.match(textoUltimoAcceso(YA_ENTRA.ultimoAccesoEn), /3 de septiembre de 2026/)
})

test('🚨 los siete estados dicen SIETE cosas distintas (si dos coinciden, se han colapsado)', () => {
  const titulos = new Set<string>()
  const queHacer = new Set<string>()
  for (const e of ESTADOS_PORTAL) {
    const f = explicarPortal({ estado: e as EstadoPortalCartera, ultimoAccesoEn: null, identidades: null })
    titulos.add(f.titulo)
    queHacer.add(f.queHacer)
    assert.notEqual(f.queHacer.trim(), '', `${e} tiene que decir qué hacer`)
  }
  assert.equal(titulos.size, ESTADOS_PORTAL.length, 'dos estados con el mismo titular')
  assert.equal(queHacer.size, ESTADOS_PORTAL.length, 'dos estados mandan al mismo sitio a arreglarlo')
})

test('solo `invitable` y `ya_entra` ofrecen botón; los otros cinco explican dónde se arregla', () => {
  const accion = (e: EstadoPortalCartera) => explicarPortal({ estado: e, ultimoAccesoEn: null, identidades: null }).accion
  assert.equal(accion('invitable'), 'invitar')
  assert.equal(accion('ya_entra'), 'reenviar')
  for (const e of ['ambiguo', 'resuelve_a_otra', 'sin_email', 'ilegible', 'no_comprobado'] as const) {
    assert.equal(accion(e), 'ninguna', `${e}: invitar ahí es peor que no invitar`)
  }
  // El duplicado manda a resolver la otra ficha; el correo ausente, a la ficha;
  // el ilegible, a Vercel. Que cada frase diga su sitio es el punto entero.
  assert.match(explicarPortal({ estado: 'ambiguo', ultimoAccesoEn: null, identidades: null }).queHacer, /duplicado/)
  assert.match(explicarPortal({ estado: 'sin_email', ultimoAccesoEn: null, identidades: null }).queHacer, /Editar datos del cliente/)
  assert.match(explicarPortal({ estado: 'ilegible', ultimoAccesoEn: null, identidades: null }).queHacer, /Vercel/)
  assert.doesNotMatch(
    explicarPortal({ estado: 'no_comprobado', ultimoAccesoEn: null, identidades: null }).queHacer,
    /no se puede invitar\b(?!:)/,
  )
})

test('GET: ok / no_encontrado / sin_configurar / invalido / error no se confunden', () => {
  const ok = interpretarPortal(200, { estado: 'ok', portal: YA_ENTRA })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') assert.equal(ok.portal.estado, 'ya_entra')

  assert.deepEqual(interpretarPortal(404, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarPortal(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.equal(interpretarPortal(422, { estado: 'invalido', motivo: 'falta clienteId' }).estado, 'invalido')
  assert.equal(interpretarPortal(401, null).estado, 'error')
  assert.equal(interpretarPortal(500, { estado: 'error', causa: 'credenciales' }).estado, 'error')

  // 🚨 Un `ok` sin bloque legible NO se convierte en «no tiene acceso»: es un
  // fallo de lectura y se dice como tal.
  const roto = interpretarPortal(200, { estado: 'ok', portal: 'nada' })
  assert.deepEqual(roto, { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarPortal(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('POST: los ocho desenlaces del puerto llegan cada uno con su nombre', () => {
  for (const f of FALLOS_INVITACION) {
    const r = interpretarInvitacion(f === 'error_envio' ? 502 : 422, { estado: f, motivo: 'porque sí' })
    assert.equal(r.estado, f, `${f} no puede leerse como otra cosa`)
  }
  // Dos comparten el 409 y dos el 503: manda el `estado`, no el código.
  assert.equal(interpretarInvitacion(409, { estado: 'ambiguo', motivo: 'x' }).estado, 'ambiguo')
  assert.equal(interpretarInvitacion(409, { estado: 'resuelve_a_otra', motivo: 'x' }).estado, 'resuelve_a_otra')
  assert.equal(interpretarInvitacion(503, { estado: 'sin_portal', motivo: 'x' }).estado, 'sin_portal')
  assert.equal(interpretarInvitacion(503, { estado: 'no_comprobado', motivo: 'x' }).estado, 'no_comprobado')
  // Sin secreto entre los dos proyectos no se ha invitado a nadie, y se nota.
  assert.equal(interpretarInvitacion(401, null).estado, 'error')
  assert.match(textoInvitacion(interpretarInvitacion(403, null), 'Ana'), /ASEGURA_OPERADOR_SECRET/)
  assert.equal(interpretarInvitacion(503, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  assert.equal(interpretarInvitacion(502, { estado: 'error', motivo: 'red' }).estado, 'error')
})

test('🚨 el correo que SALE no se anuncia como «ya puede entrar»; y sin dato no se afirma que ya entraba', () => {
  const nueva = interpretarInvitacion(200, { estado: 'ok', yaEntraba: false })
  assert.deepEqual(nueva, { estado: 'ok', yaEntraba: false })
  const t = textoInvitacion(nueva, 'Ana')
  assert.match(t, /Invitación enviada/)
  assert.match(t, /el acceso lo abre él/, 'el correo salió; entrar lo hace el cliente con su código')

  const reenvio = textoInvitacion(interpretarInvitacion(200, { estado: 'ok', yaEntraba: true }), 'Ana')
  assert.match(reenvio, /reenviado/)
  assert.notEqual(reenvio, t)

  // `yaEntraba` ausente = «asegura no lo dijo»: tres estados, no dos.
  const mudo = interpretarInvitacion(200, { estado: 'ok' })
  assert.deepEqual(mudo, { estado: 'ok', yaEntraba: null })
  // Un `'si'` de texto tampoco es un booleano: no se interpreta, se declara ausente.
  assert.deepEqual(interpretarInvitacion(200, { estado: 'ok', yaEntraba: 'si' }), { estado: 'ok', yaEntraba: null })
  const mudoTexto = textoInvitacion(mudo, 'Ana')
  assert.doesNotMatch(mudoTexto, /ya entraba\./, 'sin dato no se afirma que usara ya el portal')
  assert.notEqual(mudoTexto, reenvio)
})

test('cada desenlace del POST tiene su frase, y ninguna dice que se haya enviado', () => {
  const textos = new Set<string>()
  for (const f of FALLOS_INVITACION) {
    const frase = textoInvitacion({ estado: f, motivo: 'motivo del puerto' }, 'Ana')
    assert.doesNotMatch(frase, /✅/, `${f} no puede leerse como un envío hecho`)
    textos.add(frase)
  }
  assert.equal(textos.size, FALLOS_INVITACION.length, 'dos fallos con la misma frase: se han colapsado')
})

test('los motivos técnicos se traducen; una frase se deja tal cual', () => {
  assert.match(textoMotivoPortal('secreto_rechazado'), /ASEGURA_OPERADOR_SECRET/)
  assert.match(textoMotivoPortal('red'), /timeout/)
  assert.match(textoMotivoPortal('respuesta_ilegible'), /forma esperada/)
  assert.equal(textoMotivoPortal('Esa ficha no existe.'), 'Esa ficha no existe.')
})
