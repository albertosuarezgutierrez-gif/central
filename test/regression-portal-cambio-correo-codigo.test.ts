// Un correo nuevo en la ficha NO se guarda sin el código que le llega a ESE correo (25/09/2026).
//
// El correo de la ficha es la llave del portal: quien entra con él recibe la ficha con nivel
// `gestionar`. Hasta hoy «Mis datos» y «Añadir correo» lo escribían sin comprobar nada (caso Guzmán
// Pueyo/Lozano: el correo del hijo en la ficha del padre). Este cepo vigila que el candado esté en
// el SERVIDOR —una pantalla se salta con un curl— y que vaya ANTES de escribir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('POST /api/mis-datos canjea el código ANTES de guardar un correo, y sin código no guarda', () => {
  const src = sinComentarios(leer('apps/asegura-portal/app/api/mis-datos/route.ts'))
  const exige = src.indexOf("if (!codigoCorreo) return NextResponse.json({ estado: 'codigo_requerido' }")
  const canje = src.indexOf('comprobarCodigoCambioCorreo(identidad.id, libre.email, codigoCorreo)')
  const guarda = src.indexOf('guardarMisDatos(identidad.id, libre)')
  assert.notEqual(exige, -1, 'un correo sin código vuelve a guardarse')
  assert.notEqual(canje, -1, 'el código ya no se comprueba contra el correo que se guarda')
  assert.notEqual(guarda, -1, 'se guarda algo distinto de lo comprobado')
  assert.ok(exige < guarda && canje < guarda, 'se guarda ANTES de comprobar el código')
  assert.match(src, /if \(canje\.estado !== 'valido'\) return/, 'un código no válido no corta el guardado')
  assert.ok(src.indexOf('await gastarCodigo()') > guarda, 'el código se gasta ANTES de saber si se ha guardado: un fallo del guardado lo deja muerto')
})

test('POST /api/mis-datos/contactos exige el mismo código para AÑADIR un correo', () => {
  const src = sinComentarios(leer('apps/asegura-portal/app/api/mis-datos/contactos/route.ts'))
  const canje = src.indexOf('comprobarCodigoCambioCorreo(identidad.id, entrada.valor, codigoCorreo)')
  const anade = src.indexOf('anadirContactoPropio(identidad.id, entrada)')
  assert.notEqual(canje, -1, 'un correo de contacto se añade sin código (y también abre el portal)')
  assert.ok(canje < anade, 'se añade ANTES de comprobar el código')
  assert.match(src, /if \(entrada\.tipo === 'email'\)/)
})

test('el código va atado a la identidad, no abre sesión y reserva el intento antes de comparar', () => {
  const src = sinComentarios(leer('apps/asegura-portal/lib/verificar-correo.ts'))
  // Con `hashCanal(email)` a secas el código serviría para ENTRAR como ese correo y lo podría
  // canjear cualquier identidad.
  assert.match(src, /hashCanal\(`cambio-correo:\$\{identidadId\}:/)
  const reserva = src.indexOf('intentos: { lt: MAX_INTENTOS }')
  const compara = src.indexOf('estadoCodigo(')
  assert.ok(reserva !== -1 && reserva < compara, 'se compara antes de reservar el intento: una ráfaga se salta el tope')
  assert.match(src, /data: \{ usadoEn: new Date\(\) \}/, 'el código no se gasta nunca')
  assert.match(src, /gastar: estado === 'valido' \? gastar : nada/, 'un código no válido se puede gastar')
})

test('las dos pantallas piden el código antes de mandar el correo', () => {
  for (const f of ['MisDatos.tsx', 'GestionContactos.tsx']) {
    const src = leer(`apps/asegura-portal/app/(portal)/boveda/${f}`)
    assert.match(src, /\/api\/mis-datos\/codigo-correo/, `${f} no pide el código`)
    assert.match(src, /codigoCorreo: codigo\.trim\(\)/, `${f} no manda el código al guardar`)
  }
})
