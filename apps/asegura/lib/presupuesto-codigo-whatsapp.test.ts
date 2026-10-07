// Cepos del código de acceso del presupuesto por WhatsApp, lado asegura (07/10/2026). Lee el FUENTE:
// lo que vigilan es el ORDEN de las escrituras y los `where`, en SQL crudo y en Prisma, donde ni tsc
// ni el build miran (y el módulo importa Prisma, que `node --test` no carga sin generar). Las reglas
// puras (otro presupuesto, caducado, regenerado, sin código, bloqueo) tienen su cepo en
// `packages/module-seguros-portal/src/codigo-whatsapp.test.ts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const src = sinComentarios(readFileSync(new URL('./presupuesto-codigo-whatsapp.ts', import.meta.url), 'utf8'))
const envio = sinComentarios(readFileSync(new URL('./envio-presupuesto.ts', import.meta.url), 'utf8'))
const aceptacion = sinComentarios(readFileSync(new URL('./presupuesto-aceptacion.ts', import.meta.url), 'utf8'))
const puente = sinComentarios(readFileSync(new URL('../app/api/portal/presupuesto/route.ts', import.meta.url), 'utf8'))

const gastar = src.slice(src.indexOf('export async function gastarCodigoWhatsapp'), src.indexOf('export async function fichaDeTokenWhatsapp'))

test('🪤 tras N fallos se bloquea: el intento se RESERVA con escritura condicionada antes de comparar', () => {
  const reserva = gastar.indexOf('set whatsapp_codigo_intentos = whatsapp_codigo_intentos + 1')
  const tope = gastar.indexOf('whatsapp_codigo_intentos < ${MAX_INTENTOS_WHATSAPP}::int')
  const compara = gastar.indexOf('{ codigoHash: gastado.hash')
  assert.ok(reserva > 0 && tope > reserva, 'falta la reserva condicionada al tope')
  assert.ok(compara > tope, 'se compara DESPUÉS de reservar el intento')
  // Sin intento reservado no hay acierto posible.
  const sinReserva = gastar.slice(gastar.indexOf('if (!gastado) {'), gastar.indexOf('const estado = estadoCodigoWhatsapp('))
  assert.doesNotMatch(sinReserva, /estado: 'valido'/)
})

test('🪤 código caducado o de un enlace regenerado no vale: el gasto exige token vigente, vence_el y no retirado', () => {
  const reserva = gastar.slice(gastar.indexOf('update presupuesto set whatsapp_codigo_intentos'), gastar.indexOf('returning'))
  assert.match(reserva, /token_hash = \$\{tokenHash\}/)
  assert.match(reserva, /vence_el > \$\{ahora\}/)
  assert.match(reserva, /retirado_at is null/)
  assert.match(reserva, /whatsapp_codigo_hash is not null/)
})

test('🪤 regenerar el enlace = código nuevo; avisar por correo lo borra; si el correo no sale, vuelve el anterior', () => {
  const avisar = envio.slice(envio.indexOf('export async function avisarPresupuesto'), envio.indexOf('export async function confirmarWhatsapp'))
  const cas = avisar.slice(avisar.indexOf('const rotado = await db.presupuesto.updateMany('), avisar.indexOf('if (rotado.count === 0)'))
  // En el MISMO compare-and-swap que rota el token (para el correo, `nuevoCodigoHash` es null).
  assert.match(cas, /tokenHash: nuevoHash,/)
  assert.match(cas, /whatsappCodigoHash: nuevoCodigoHash,/)
  assert.match(cas, /whatsappCodigoIntentos: 0,/)
  assert.match(avisar, /const nuevoCodigoHash = codigoWhatsapp === null \? null : await hashCodigoWhatsapp\(token, codigoWhatsapp\)/)
  assert.match(avisar, /const codigoWhatsapp = entrada\.canal === 'whatsapp_enlace' \? generarCodigo\(\) : null/)
  assert.match(avisar, /data: \{ tokenHash: p\.tokenHash, canalAviso: p\.canalAviso, whatsappCodigoHash: p\.whatsappCodigoHash,/)
  // El código va en el mensaje y en ningún otro sitio: ni en el evento ni en la respuesta fuera del texto.
  assert.match(avisar, /mensajePresupuestoWhatsapp\(\{ \.\.\.datos, codigo: codigoWhatsapp! \}\)/)
  const evento = avisar.slice(avisar.indexOf("tipo: 'enlace_generado'"), avisar.indexOf("tipo: 'enlace_generado'") + 200)
  assert.doesNotMatch(evento, /codigo/)
})

test('🪤 por WhatsApp sin correo afirmable hace falta un móvil válido, y se comprueba ANTES de escribir', () => {
  const avisar = envio.slice(envio.indexOf('export async function avisarPresupuesto'), envio.indexOf('export async function confirmarWhatsapp'))
  const movil = avisar.indexOf("if (movil !== 'ok') {")
  assert.ok(movil > 0 && movil < avisar.indexOf('updateMany('), 'sin correo ni móvil no se toca la fila')
  assert.match(avisar, /if \(conCorreo === null\) \{\s*const movil = await movilDeFicha\(correduriaId, p\.clienteId\)/)
  // Y el correo NO pasa a obligatorio por WhatsApp: el corte por `sin_email` sin más solo vive en la rama del correo.
  const ramaCorreo = avisar.slice(avisar.indexOf("if (entrada.canal === 'email') {"), avisar.indexOf('} else {', avisar.indexOf("if (entrada.canal === 'email') {")))
  assert.match(ramaCorreo, /if \(ficha\.estado !== 'ok'\) return error\('sin_email'/)
})

test('🪤 sin código no se firma por WhatsApp, y el código de OTRO presupuesto no firma este', () => {
  const firmar = aceptacion.slice(aceptacion.indexOf('export async function firmarAceptacion'))
  const rama = firmar.slice(firmar.indexOf("if (datos.via === 'whatsapp') {"), firmar.indexOf('} else {', firmar.indexOf("if (datos.via === 'whatsapp') {")))
  assert.match(rama, /if \(!\('tokenWhatsapp' in acceso\)\) return \{ estado: 'sin_codigo' \}/)
  // Con el presupuestoId DENTRO: un token de otro presupuesto no encuentra la fila.
  assert.match(rama, /gastarCodigoWhatsapp\(correduriaId, acceso\.tokenWhatsapp, datos\.codigo\.trim\(\), presupuestoId\)/)
  assert.match(rama, /if \(w\.estado !== 'valido'\) return \{ estado: 'sin_codigo' \}/)
  assert.match(rama, /metodo = 'otp_whatsapp'/)
  // El nombre se exige con cualquiera de los dos códigos.
  assert.ok(firmar.indexOf('if (!nombreCoincide(datos.nombre, f.tomador))') > firmar.indexOf("metodo = 'otp_whatsapp'"))
})

test('🪤 quien entró por WhatsApp solo ve SU presupuesto: la ficha sale del propio presupuesto del token', () => {
  const ficha = src.slice(src.indexOf('export async function fichaDeTokenWhatsapp'), src.indexOf('export type MovilDeFicha'))
  for (const c of ['id: presupuestoId', 'correduriaId', 'tokenHash: await hashTokenVista(token)', 'retiradoAt: null', 'whatsappCodigoHash: { not: null }', 'venceEl: { gt: ahora }']) {
    assert.ok(ficha.includes(c), `falta «${c}» en el where`)
  }
  const acc = aceptacion.slice(aceptacion.indexOf('async function fichaDeAcceso'), aceptacion.indexOf('async function base('))
  assert.match(acc, /fichaDeTokenWhatsapp\(correduriaId, acceso\.tokenWhatsapp, presupuestoId\)/)
  assert.match(acc, /\{ estado: 'ajena' as const \}/)
})

test('🪤 el puente solo admite el token del WhatsApp en datos, aviso de dato, preparar, código y firmar', () => {
  const admite = puente.slice(puente.indexOf('const admiteWhatsapp'), puente.indexOf('const acceso: AccesoPortal'))
  const acciones = [...admite.matchAll(/b\?\.accion === '([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(acciones, ['codigo', 'datos', 'datos_incorrectos', 'firmar', 'preparar'])
  assert.match(puente, /via: b\.via === 'whatsapp' \? 'whatsapp' : 'correo',/)
})
