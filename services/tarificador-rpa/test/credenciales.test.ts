// Credenciales rechazadas / bloqueadas / caducadas: detección por texto, error NO reintentable, aviso y cortocircuito.
// Sintético y puro: sin red ni portales. Usuario y contraseña de prueba son literales que no existen en ningún portal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clasificar, clasificarIntento } from '../src/errores.ts'
import {
  CortocircuitoCredenciales,
  ErrorCredenciales,
  motivoCredenciales,
  motivoDeMensaje,
  textoAvisoCredenciales,
} from '../src/credenciales.ts'

test('detecta contraseña/usuario incorrecto, cuenta bloqueada y contraseña caducada (textos típicos en español)', () => {
  for (const t of ['Usuario o contraseña incorrectos', 'La contraseña es incorrecta', 'Datos incorrectos', 'Credenciales no válidas', 'Autenticación fallida', 'Acceso denegado'])
    assert.equal(motivoCredenciales(t), 'rechazadas', t)
  for (const t of ['Su usuario ha sido bloqueado por demasiados intentos', 'Cuenta bloqueada', 'Usuario suspendido', 'Ha superado el número máximo de intentos'])
    assert.equal(motivoCredenciales(t), 'bloqueada', t)
  for (const t of ['Su contraseña ha caducado', 'Contraseña caducada', 'Debe cambiar su contraseña para continuar', 'La contraseña ha expirado'])
    assert.equal(motivoCredenciales(t), 'caducada', t)
})

test('bloqueada manda sobre caducada y rechazadas; el enlace fijo «Cambiar contraseña» y las pantallas normales NO disparan nada', () => {
  assert.equal(motivoCredenciales('Contraseña incorrecta. Cuenta bloqueada'), 'bloqueada')
  for (const t of ['Acceso\nCódigo de usuario (NUUMA)\nContraseña:\nCambiar contraseña\nEntrar', 'Mediador principal · Nueva póliza', '', 'Recordar contraseña'])
    assert.equal(motivoCredenciales(t), null, t)
})

test('ErrorCredenciales: tipo credenciales, NO transitorio aunque se vea el login o haya un 5xx, y sin secretos', () => {
  const usuario = 'usuario-prueba'
  const clave = 'clave-sintetica-de-prueba'
  for (const m of ['rechazadas', 'bloqueada', 'caducada'] as const) {
    const e = new ErrorCredenciales('mapfre', m)
    assert.equal(clasificar(e).tipo, 'credenciales')
    assert.equal(motivoDeMensaje(e.message), m)
    for (const pistas of [{ logueado: true, loginVisible: true, ultimo5xx: 503 }, { logueado: false, loginVisible: false, ultimo5xx: null }])
      assert.equal(clasificarIntento(e, pistas).transitorio, null)
    assert.ok(!e.message.includes(usuario) && !e.message.includes(clave))
  }
  // El rechazo genérico (sin prefijo) de un adaptador cuenta como «rechazadas».
  assert.equal(motivoDeMensaje('mapfre/login: el formulario sigue visible'), 'rechazadas')
})

test('aviso: texto claro con el fly secret a cambiar y cómo quitar la pausa', () => {
  assert.equal(
    textoAvisoCredenciales('mapfre', 'rechazadas', 'CRED_MAPFRE_WMEDIADORES_PASS'),
    'Mapfre: el portal rechaza la contraseña; actualiza CRED_MAPFRE_WMEDIADORES_PASS en fly secrets y quita la pausa',
  )
  assert.match(textoAvisoCredenciales('allianz', 'bloqueada', 'CRED_ALLIANZ_EPAC_PASS'), /bloqueado.*CRED_ALLIANZ_EPAC_PASS.*quita la pausa/)
  assert.match(textoAvisoCredenciales('occident', 'caducada', 'CRED_OCCIDENT_PORTAL_PASS'), /caducado.*CRED_OCCIDENT_PORTAL_PASS.*quita la pausa/)
})

test('cortocircuito por credencial: tras un rechazo, esa credencial queda cerrada y las demás no', () => {
  const c = new CortocircuitoCredenciales()
  assert.equal(c.motivo('MAPFRE_WMEDIADORES'), null)
  c.bloquear('MAPFRE_WMEDIADORES', 'bloqueada')
  assert.equal(c.motivo('mapfre_wmediadores'), 'bloqueada')
  assert.equal(c.motivo('ALLIANZ_EPAC'), null)
})

test('cepo de estructura: el runner cierra la credencial, no abre el portal si ya está cerrada y los logins usan exigirSinRechazoCredenciales', () => {
  const runner = readFileSync(new URL('../src/runner.ts', import.meta.url), 'utf8')
  assert.match(runner, /cortocircuito\.bloquear\(adaptador\.credencial/)
  assert.match(runner, /cortocircuito\.motivo\(adaptador\.credencial\)/)
  for (const f of ['adapters/mapfre/login.ts', 'adapters/allianz/intranet/sesion.ts', 'adapters/occident/hogar.ts', 'adapters/occident/comunidades.ts'])
    assert.match(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'), /exigirSinRechazoCredenciales/, f)
})

test('tras un login correcto NO disparan avisos, fechas ni recordatorios; sí las frases afirmativas', () => {
  for (const t of [
    'Fecha de caducidad de la contraseña: 31/12/2026',
    'Recuerde que debe cambiar su contraseña cada 90 días',
    'Es necesario actualizar la contraseña',
    'Acceso deshabilitado temporalmente por mantenimiento',
    'Recibos con cuenta bloqueada',
  ]) assert.equal(motivoCredenciales(t), null, t)
  for (const t of ['Su contraseña ha caducado', 'La contraseña ha expirado']) assert.equal(motivoCredenciales(t), 'caducada', t)
  for (const t of ['Su usuario está bloqueado', 'Su cuenta ha sido bloqueada', 'Cuenta bloqueada']) assert.equal(motivoCredenciales(t), 'bloqueada', t)
  for (const t of ['Usuario o contraseña incorrectos', 'Credenciales no válidas']) assert.equal(motivoCredenciales(t), 'rechazadas', t)
})

test('un timeout sin texto afirmativo de rechazo es `portal`, no `credenciales` (cepo de estructura en los 4 logins)', () => {
  const quitar = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  for (const f of ['adapters/mapfre/login.ts', 'adapters/allianz/intranet/sesion.ts', 'adapters/occident/hogar.ts', 'adapters/occident/comunidades.ts']) {
    const src = quitar(f)
    assert.doesNotMatch(src, /throw new ErrorCredenciales\(/, f)
    assert.match(src, /throw new ErrorTarificador\('portal', '[^']*sin mensaje de rechazo/, f)
  }
})
