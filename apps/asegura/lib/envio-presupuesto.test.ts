// Cepo del aviso del presupuesto al cliente (PR 3). Lee el FUENTE: lo que vigila es el ORDEN de las
// escrituras, y el módulo importa Prisma, que `node --test` no puede cargar sin generar el cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./envio-presupuesto.ts', import.meta.url), 'utf8')
const avisar = src.slice(src.indexOf('export async function avisarPresupuesto'), src.indexOf('export async function confirmarWhatsapp'))

test('🪤 sin enlace ni correo ni precio real NO se toca la fila: todas las guardas van antes de la primera escritura', () => {
  const primeraEscritura = avisar.indexOf('updateMany(')
  for (const g of [
    "if (!enlace) return error('sin_enlace'",
    "if (ficha.estado !== 'ok') return error('sin_email'",
    // Simulado (Codeoscopic) y sin revisar (ofertas): una sola decisión pura, `decidirSalida` (presupuesto-origen.ts).
    'if (!salida.ok) return error(salida.motivo, salida.detalle)',
    "if (!AVISABLE.has(estado)) return error('no_enviable'",
    "if (portal?.estado !== 'invitable' && portal?.estado !== 'ya_entra') {",
  ]) {
    const i = avisar.indexOf(g)
    assert.ok(i > 0 && i < primeraEscritura, `${g} antes de escribir`)
  }
})

test('🪤 dos clics no mandan dos correos: el token se rota con compare-and-swap sobre el hash anterior', () => {
  assert.match(avisar, /where: \{ id: p\.id, correduriaId, tokenHash: p\.tokenHash,/)
  const cas = avisar.indexOf('if (rotado.count === 0)')
  assert.ok(cas > 0 && cas < avisar.indexOf('await mandarCorreo('), 'el segundo clic se para antes de mandar')
})

test('🪤 `enviado_at` solo se sella si el proveedor aceptó; el WhatsApp solo sella el enlace', () => {
  const fallo = avisar.indexOf("if (envio !== 'enviado')")
  const sello = avisar.indexOf('enviadoAt: ahora')
  assert.ok(fallo > 0 && sello > fallo, 'el sello va detrás del corte por fallo')
  const whatsapp = avisar.slice(avisar.indexOf("if (entrada.canal === 'whatsapp_enlace') {"), avisar.indexOf('const envio = await mandarCorreo('))
  assert.doesNotMatch(whatsapp, /enviadoAt/)
})

test('🪤 si el correo no sale, se devuelve la llave anterior; y solo se confirma un WhatsApp cuyo enlace sigue vivo', () => {
  const fallo = avisar.slice(avisar.indexOf("if (envio !== 'enviado') {"))
  assert.match(fallo.slice(0, 300), /where: \{ id: p\.id, tokenHash: nuevoHash \}, data: \{ tokenHash: p\.tokenHash/)
  const confirmar = src.slice(src.indexOf('export async function confirmarWhatsapp'))
  assert.match(confirmar, /estadoPresupuesto\(p, ahora\) !== 'enlazado' \|\| p\.canalAviso !== 'whatsapp_enlace'/)
})

test('🪤 sin necesidades escritas no se avisa, y se comprueba ANTES de rotar el token', () => {
  const src = readFileSync(new URL('./envio-presupuesto.ts', import.meta.url), 'utf8')
  const avisar = src.slice(src.indexOf('export async function avisarPresupuesto'))
  const nec = avisar.indexOf("error('sin_necesidades'")
  const rota = avisar.indexOf('tokenHash: nuevoHash')
  assert.ok(nec > 0 && rota > nec)
})

test('🪤 el correo lleva acceso directo (tras el compare-and-swap) y el WhatsApp no', () => {
  const avisar = src.slice(src.indexOf('export async function avisarPresupuesto'), src.indexOf('export async function confirmarWhatsapp'))
  const llave = avisar.indexOf('await enlaceDirectoPresupuesto(')
  assert.ok(llave > avisar.indexOf('const rotado = await'), 'la llave solo se crea si este clic ganó el CAS')
  assert.ok(llave > avisar.indexOf("if (entrada.canal === 'whatsapp_enlace') {\n    const mensaje"), 'el WhatsApp no lleva llave')
  assert.match(avisar, /correoPresupuesto\(\{ \.\.\.datos, enlaceDirecto: directo \}\)/)
})

// ─── F4: un aviso EN EL HILO nunca deja al cliente con un enlace muerto (revisión 19/10/2026) ──────────────────
const ejecutar = src.slice(src.indexOf('export async function ejecutarAviso'), src.indexOf('async function enlaceDirectoPresupuesto'))

test('🪤 en el hilo, una clave ya usada (salió o quedó incierta) NO rota el token: se mira ANTES del compare-and-swap', () => {
  const guarda = ejecutar.indexOf("if (hilo && (await claveYaUsada(db, p.id, hilo.idempotencia))) return error('incierto'")
  assert.ok(guarda > 0, 'falta la guarda de la clave usada')
  assert.ok(guarda < ejecutar.indexOf('db.presupuesto.updateMany('), 'la guarda va antes de rotar')
  assert.match(src, /tipo: \{ in: \['enviado', 'envio_incierto'\] \}, detalle: \{ path: \['idempotencia'\], equals: idempotencia \}/)
  // Lo que no se puede leer cuenta como usada.
  assert.match(src, /return n === null \|\| n > 0/)
})

test('🪤 en el hilo, un envío INCIERTO no devuelve la llave vieja (mataría el enlace que quizá ya tiene) y deja rastro', () => {
  const incierto = ejecutar.indexOf("if (envio === 'incierto') {")
  const devolver = ejecutar.indexOf('data: { tokenHash: p.tokenHash')
  assert.ok(incierto > 0 && incierto < devolver, 'el incierto se resuelve ANTES de devolver la llave anterior')
  assert.match(ejecutar.slice(incierto, devolver), /tipo: 'envio_incierto'[\s\S]{0,200}idempotencia: hilo\.idempotencia/)
  assert.match(ejecutar.slice(incierto, devolver), /return error\('incierto'/)
  assert.match(src, /if \(hilo && envioIncierto\(r\)\) return 'incierto'/)
})

test('envioIncierto: red, «aceptado sin id» y 5xx son duda; un 4xx es rechazo seguro', async () => {
  const { envioIncierto } = await import('./correo-hilo.ts')
  assert.equal(envioIncierto({ resultado: 'rechazado' }), true)
  assert.equal(envioIncierto({ resultado: 'rechazado', codigo: '200' }), true)
  assert.equal(envioIncierto({ resultado: 'rechazado', codigo: '503' }), true)
  assert.equal(envioIncierto({ resultado: 'rechazado', codigo: '422' }), false)
  assert.equal(envioIncierto({ resultado: 'enviado' }), false)
  assert.equal(envioIncierto({ resultado: 'sin_proveedor' }), false)
})

test('🪤 la propuesta con una clave ya intentada e incierta no prepara otro presupuesto (retiraría el que quizá tiene)', () => {
  const prop = readFileSync(new URL('./propuesta-lead.ts', import.meta.url), 'utf8')
  assert.match(prop, /e\.tipo in \('enviado', 'envio_incierto'\) and e\.detalle->>'idempotencia' = \$\{idempotencia\}/)
  const f = prop.slice(prop.indexOf('export async function enviarPropuestaLead'))
  const guarda = f.indexOf("if (previo) return { estado: 'fallo_envio', motivo: 'incierto'")
  assert.ok(guarda > 0 && guarda < f.indexOf('prepararPresupuestoDeOfertas('), 'se corta antes de crear/retirar presupuestos')
})

// 🪤 Persona de contacto (21/10/2026). Para verlo en rojo: quita `tercero ? null :` delante de `enlaceDirectoPresupuesto`
// → falla «nunca el acceso directo»; o mueve la guarda `destinatario_no_elegible` detrás del compare-and-swap.
test('🪤 a una persona de contacto: se valida en el servidor ANTES de escribir, y nunca con la llave del portal del tomador', () => {
  const primeraEscritura = avisar.indexOf('updateMany(')
  const guarda = avisar.indexOf("if (!elegido || !email) return error('destinatario_no_elegible'")
  assert.ok(guarda > 0 && guarda < primeraEscritura, 'la regla se comprueba antes de rotar nada')
  assert.match(avisar, /const lectura = await leerDestinatarios\(correduriaId, p\.clienteId\)/)
  assert.match(avisar, /destinatarioElegible\(lectura\.destinatarios, destinatarioId\)/)
  // El acceso directo abre la sesión del portal del TOMADOR: a un tercero, jamás.
  assert.match(avisar, /const directo = tercero \? null : await enlaceDirectoPresupuesto\(/)
  // Su única puerta es el código de ESTE presupuesto, que va en su correo.
  assert.match(avisar, /entrada\.canal === 'whatsapp_enlace' \|\| tercero \? generarCodigo\(\) : null/)
  assert.match(avisar, /correoPresupuestoTercero\(\{ nombre: tercero\.nombre, empresa: nombre,/)
  // Rastro: quién lo recibió, en el evento y en historial_interno.
  assert.match(avisar, /destinatario: \{ clienteId: tercero\.clienteId, relacion: tercero\.relacion, via: tercero\.via \}/)
  assert.match(avisar, /if \(tercero\) await anotarEnvioATercero\(/)
})
