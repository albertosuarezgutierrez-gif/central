// Cepos de la felicitación a EX-CLIENTES (30/10/2026). Reglas puras + texto + puerta; el SQL se vigila leyendo el FUENTE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MEDIADOR } from '@central/module-seguros'
import {
  botonesExcliente, clientePorOtraFicha, iniciales, leerBotonFex, posiblementeVigente, varianteSigueIgual, modoExclientes, propuestaDelDia, telefonoCorto, textoPropuestaTelegram, varianteExcliente,
} from './felicitaciones-exclientes-reglas.ts'
import { cuerpoFelicitacionExcliente } from './correo-felicitacion.ts'
import { felicitarExclientes } from './felicitaciones-exclientes.ts'

const src = readFileSync(new URL('./felicitaciones-exclientes.ts', import.meta.url), 'utf8')
const ENLACE = 'https://clientes.grupoasegura.es/'

// Pólizas tipo: viva (CIMA), volcado (import_ref sin EIAC).
const vivaEnVigor = { importRef: null, eiacXmlHash: 'h', estado: 'activa', sustituidaAt: null }
const vivaCancelada = { importRef: null, eiacXmlHash: 'h', estado: 'cancelada', sustituidaAt: null }
const volcadoVigente = { importRef: 'X1', eiacXmlHash: null, estado: 'en_vigor', sustituidaAt: null }
const volcadoCancelado = { importRef: 'X2', eiacXmlHash: null, estado: 'cancelada', sustituidaAt: null }
const HOY = new Date('2026-10-31T10:00:00Z')
const v = (ps: Parameters<typeof varianteExcliente>[0]) => varianteExcliente(ps, HOY)

test('elegibilidad: sin pólizas (lead) o con cartera en vigor → no entra', () => {
  assert.equal(v([]), null)
  assert.equal(v([vivaEnVigor]), null)
  assert.equal(v([vivaEnVigor, vivaCancelada, volcadoVigente]), null, 'con UNA en vigor ya la felicita el cron de clientes')
})

test('variante: vigente fuera de CIMA → posible_cliente; el resto → ex_cliente', () => {
  assert.equal(v([vivaCancelada]), 'ex_cliente')
  assert.equal(v([volcadoCancelado]), 'ex_cliente')
  assert.equal(v([volcadoVigente]), 'posible_cliente')
  assert.equal(v([vivaCancelada, volcadoVigente]), 'posible_cliente')
  // Viva vigente pero SUSTITUIDA no es «no viva»: no la convierte en posible cliente.
  assert.equal(v([{ ...vivaEnVigor, sustituidaAt: new Date() }]), 'ex_cliente')
})

test('🚨 la consulta: persona física, no fusionada, con póliza, sin cartera en vigor, sin baja y con fecha', () => {
  assert.match(src, /OR: \[\{ tipoPersona: null \}, \{ NOT: \{ tipoPersona: 'juridica' \} \}\]/)
  assert.match(src, /mergedIntoClienteId: null, emailOptOutAt: null, fechaNacimiento: \{ not: null \}/)
  assert.match(src, /polizas: \{ some: \{ mergedIntoPolizaId: null \} \}/)
  assert.match(src, /polizas: \{ none: \{ mergedIntoPolizaId: null, \.\.\.WHERE_CARTERA_EN_VIGOR \} \}/)
  // Sin email válido no se reserva nada (aquí no hay «solo en la app»).
  const bucle = src.slice(src.indexOf('for (const f of deHoy)'))
  assert.ok(bucle.indexOf('if (!destino) { r.sinCorreo += 1; continue }') < bucle.indexOf('insert into felicitacion'))
})

test('🚨 idempotencia: la MISMA reserva por persona y año, antes de Telegram o del correo', () => {
  const bucle = src.slice(src.indexOf('for (const f of deHoy)'))
  const reserva = bucle.indexOf('on conflict (cliente_id, anio) do nothing')
  assert.ok(reserva > 0 && reserva < bucle.indexOf('tgSendButtons(') && reserva < bucle.indexOf('enviarFelicitacionExcliente('))
  assert.match(bucle, /if \(reservada === 0\) \{ r\.yaFelicitados \+= 1; continue \}/)
  // El botón reclama la fila ANTES de mandar.
  const decide = src.slice(src.indexOf('export async function decidirFelicitacionExcliente'))
  assert.ok(decide.indexOf("donde('enviando')") < decide.indexOf('enviarFelicitacionExcliente('))
})

test('puerta: solo `aprobar` o `auto` exactos; lo demás apaga', () => {
  assert.equal(modoExclientes(undefined), 'apagado')
  assert.equal(modoExclientes(''), 'apagado')
  assert.equal(modoExclientes('1'), 'apagado')
  assert.equal(modoExclientes('aprovar'), 'apagado')
  assert.equal(modoExclientes(' Aprobar '), 'aprobar')
  assert.equal(modoExclientes('auto'), 'auto')
})

test('🚨 puerta apagada = 0 envíos y ni se abre la BD', async () => {
  const r = await felicitarExclientes('00000000-0000-0000-0000-000000000000', { env: {} })
  assert.equal(r.modo, 'apagado')
  assert.equal(r.enviados + r.propuestos + r.cumpleHoy, 0)
  assert.ok(src.indexOf("if (modo === 'apagado') return r") < src.indexOf("await import('./asegura-db')"))
})

test('en modo aprobar no se envía: solo Telegram con botones', () => {
  const bucle = src.slice(src.indexOf('for (const f of deHoy)'))
  const aprobar = bucle.slice(bucle.indexOf("if (modo === 'aprobar') {"), bucle.indexOf('const res = await enviarFelicitacionExcliente('))
  assert.match(aprobar, /tgSendButtons\(/)
  assert.doesNotMatch(aprobar, /enviarFelicitacion/)
  assert.match(aprobar, /r\.propuestos \+= 1\n\s+continue/)
})

test('asunto con 🎂 y saludo con el nombre', () => {
  for (const variante of ['ex_cliente', 'posible_cliente'] as const) {
    const c = cuerpoFelicitacionExcliente({ nombre: 'María', enlace: ENLACE, variante })
    assert.equal(c.asunto, '🎂 ¡Feliz cumpleaños, María!')
    assert.match(c.texto, /🎉/)
    assert.match(c.html, /Entrar en mi área de clientes/)
    assert.match(c.texto, /dejamos de enviarlas/, 'sin baja no sale')
    assert.match(c.html, /logotipo-asegura-correo\.png/)
  }
  assert.equal(cuerpoFelicitacionExcliente({ nombre: null, enlace: ENLACE, variante: 'ex_cliente' }).asunto, '🎂 ¡Feliz cumpleaños!')
  assert.throws(() => cuerpoFelicitacionExcliente({ nombre: null, enlace: 'http://x.es', variante: 'ex_cliente' }), /enlace_no_https/)
})

test('🚨 ex_cliente lleva la reconquista; posible_cliente NO', () => {
  const ex = cuerpoFelicitacionExcliente({ nombre: 'Juan', enlace: ENLACE, variante: 'ex_cliente' }).texto
  const pos = cuerpoFelicitacionExcliente({ nombre: 'Juan', enlace: ENLACE, variante: 'posible_cliente' }).texto
  const reconquista = `aquí nos tienes: ${telefonoCorto()} (también por WhatsApp)`
  assert.ok(ex.includes('aunque ahora no tengas tus seguros con nosotros'))
  assert.ok(ex.includes(reconquista))
  assert.ok(!pos.includes('aunque ahora no tengas tus seguros con nosotros'))
  assert.ok(!pos.includes('revisemos tus seguros'))
  for (const t of [ex, pos]) {
    assert.match(t, /Te recordamos que sigues teniendo acceso gratuito a tu área de clientes/)
    assert.match(t, /Alberto Suárez — Grupo ASegura/)
  }
})

test('teléfono y firma salen de MEDIADOR, no a mano', () => {
  assert.equal(telefonoCorto('+34637349990'), '637 349 990')
  assert.equal(telefonoCorto(), telefonoCorto(MEDIADOR.identidad.telefono))
  const correo = readFileSync(new URL('./correo-felicitacion.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(correo, /637 ?349 ?990|Alberto Suárez/)
  // Remitente fijo hola@grupoasegura.es (Alberto, 30/10/2026), por la constante.
  assert.match(correo, /remitente: remitenteCorreo\(REMITENTE_CORREDURIA\)/)
})

test('Telegram: botones ≤ 64 bytes que se leen de vuelta; resumen sin email', () => {
  const id = '3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'
  const [[ok, no]] = botonesExcliente(id, 2026)
  assert.ok(Buffer.byteLength(ok.callback) <= 64)
  const leer = (c: string) => { const [h, ...a] = c.split(':'); return leerBotonFex(h.slice(h.indexOf('_') + 1), a) }
  assert.deepEqual(leer(ok.callback), { decision: 'ok', clienteId: id, anio: 2026 })
  assert.deepEqual(leer(no.callback), { decision: 'no', clienteId: id, anio: 2026 })
  assert.equal(leerBotonFex('si', [id, '2026']), null)
  assert.equal(leerBotonFex('ok', ['x', '2026']), null)
  const t = textoPropuestaTelegram({ nombre: 'María', iniciales: iniciales('María', 'López García'), variante: 'posible_cliente', texto: 'a@b.es <x>' })
  assert.match(t, /M\. L\. G\./)
  assert.match(t, /&lt;x&gt;/)
})

test('una propuesta solo se envía el día del cumpleaños', () => {
  assert.equal(propuestaDelDia('2026-10-30', '2026-10-30'), true)
  assert.equal(propuestaDelDia('2026-10-30', '2026-10-31'), false)
})

test('🚨 variante conservadora: anula al vencimiento o baja sin fecha pasada = posiblemente vigente', () => {
  const viva = (estado: string, extra: Record<string, unknown> = {}) => ({ importRef: null, eiacXmlHash: 'h', estado, sustituidaAt: null, ...extra })
  assert.equal(posiblementeVigente(viva('anula_al_vencimiento'), HOY), true)
  assert.equal(posiblementeVigente(viva('fin_riesgo'), HOY), true, 'sin fechas no se da la baja por consumada')
  assert.equal(posiblementeVigente(viva('competencia', { fechaVencimiento: new Date('2027-03-01') }), HOY), true)
  assert.equal(posiblementeVigente(viva('competencia', { fechaVencimiento: new Date('2026-10-31') }), HOY), true, 'hoy no está pasado')
  assert.equal(posiblementeVigente(viva('fin_riesgo', { fechaVencimiento: new Date('2026-01-01') }), HOY), false)
  assert.equal(posiblementeVigente(viva('competencia', { fechaSituacion: new Date('2025-06-01') }), HOY), false)
  assert.equal(posiblementeVigente(viva('cancelada'), HOY), false)
  assert.equal(v([viva('anula_al_vencimiento')]), 'posible_cliente')
  assert.equal(v([viva('fin_riesgo')]), 'posible_cliente')
  assert.equal(v([viva('fin_riesgo', { fechaVencimiento: new Date('2026-01-01') })]), 'ex_cliente')
})

test('🚨 identidad: otra ficha (mismo DNI ciego) con cartera en vigor = cliente → fuera, aquí y al pulsar ✅', () => {
  const enVigor = new Set(['hashA'])
  assert.equal(clientePorOtraFicha('hashA', enVigor), true)
  assert.equal(clientePorOtraFicha('hashB', enVigor), false)
  assert.equal(clientePorOtraFicha(null, enVigor), false, 'sin hash no se funde a nadie')
  assert.equal(clientePorOtraFicha('', new Set([''])), false)
  const bucle = src.slice(src.indexOf('for (const f of deHoy)'))
  assert.ok(bucle.indexOf('clientePorOtraFicha(f.dniLookupHash, enVigorPorDni)') < bucle.indexOf('insert into felicitacion'))
  const decide = src.slice(src.indexOf('export async function decidirFelicitacionExcliente'))
  assert.ok(decide.indexOf('clientePorOtraFicha(ficha.dniLookupHash') < decide.indexOf('enviarFelicitacionExcliente('))
  assert.match(src, /dniLookupHash: \{ in: unicos \}, polizas: \{ some: \{ mergedIntoPolizaId: null, \.\.\.WHERE_CARTERA_EN_VIGOR \} \}/)
})

test('🚨 al pulsar ✅ solo sale si la variante recalculada es la reservada (el texto aprobado)', () => {
  assert.equal(varianteSigueIgual('ex_cliente', 'ex_cliente'), true)
  assert.equal(varianteSigueIgual('ex_cliente', 'posible_cliente'), false)
  assert.equal(varianteSigueIgual('posible_cliente', 'ex_cliente'), false)
  assert.equal(varianteSigueIgual(null, 'ex_cliente'), false)
  assert.equal(varianteSigueIgual('ex_cliente', null), false)
  const decide = src.slice(src.indexOf('export async function decidirFelicitacionExcliente'))
  assert.ok(decide.indexOf('varianteSigueIgual(fila.variante, variante)') < decide.indexOf('enviarFelicitacionExcliente('))
})
