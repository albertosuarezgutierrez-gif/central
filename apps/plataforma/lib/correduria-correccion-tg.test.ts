import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { DocumentoResumen } from '@central/module-seguros'
import {
  documentoQueAcredita, edicionDeCambios, faltaValorActual, huellaAntes, prepararCorreccion, resultadoCorreccion, textoCorreccion,
  urlCliente, type FichaActual,
} from './correduria-correccion-tg.ts'

// Fase 3b (26/09/2026): corregir la ficha desde Telegram. Lo puro se prueba de verdad; lo que vive en
// SQL y en el webhook se vigila leyendo el FUENTE, porque ni `tsc` ni el build miran dentro de un `Prisma.sql`.

const CLIENTE = '9588dad8-893f-4c27-af63-60a53b755d3b'
const FICHA = urlCliente(CLIENTE, 'https://p.test')

const ficha = (o: Partial<FichaActual> = {}): FichaActual => ({
  nombre: 'Pablo Franco Ruz', dniEnmascarado: '*****678Z', identidad: { nombre: 'Pablo', apellidos: 'Franco Ruz' },
  contacto: { direccion: 'Calle Feria 3', direccionIlegible: false, codigoPostal: '41003', ciudad: 'Sevilla', provincia: 'Sevilla' },
  ...o,
})

const doc = (id: string, tipo: string, estado: string, creado: string) =>
  ({ id, tipo, estado, creado, nombre: null, mime: null, bytes: null, sha256: null, notas: null, subidoPor: 'corredor',
     clienteId: CLIENTE, polizaId: null, siniestroId: null, revisadoEn: null }) as unknown as DocumentoResumen

test('la dirección se normaliza con las reglas de la ficha y no toca identidad', () => {
  const r = prepararCorreccion({ clienteId: CLIENTE, direccion: '  Calle  Socorro 24 ', codigoPostal: '41003', ciudad: 'Sevilla' })
  assert.ok(r.ok)
  assert.equal(r.tocaIdentidad, false)
  assert.deepEqual(r.cambios, [
    { campo: 'direccion', valor: 'Calle Socorro 24' },
    { campo: 'codigoPostal', valor: '41003' },
    { campo: 'ciudad', valor: 'Sevilla' },
  ])
})

test('un código postal que no es español se rechaza antes de proponer', () => {
  const r = prepararCorreccion({ direccion: 'Calle Socorro 24', codigoPostal: '99999' })
  assert.equal(r.ok, false)
})

test('por chat no se borra nada: un campo vacío es un error, no un «déjalo en blanco»', () => {
  const r = prepararCorreccion({ direccion: '   ' })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /no se borra/)
})

test('DNI, fecha de nacimiento, notas o un IBAN no se corrigen por chat: se ignoran', () => {
  const r = prepararCorreccion({ dni: '12345678Z', fechaNacimiento: '1980-01-01', notas: 'x', iban: 'ES00' })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /nada que cambiar/)
})

test('nombre y apellidos marcan identidad', () => {
  const r = prepararCorreccion({ apellidos: 'Franco Ruz' })
  assert.ok(r.ok)
  assert.equal(r.tocaIdentidad, true)
})

test('el cuerpo del PATCH lleva exactamente lo enseñado, y el documento solo si toca identidad', () => {
  assert.deepEqual(edicionDeCambios([{ campo: 'ciudad', valor: 'Sevilla' }], 'd1'), { libre: { ciudad: 'Sevilla' } })
  assert.deepEqual(edicionDeCambios([{ campo: 'apellidos', valor: 'Franco Ruz' }, { campo: 'ciudad', valor: 'Sevilla' }], 'd1'), {
    identidad: { apellidos: 'Franco Ruz' }, libre: { ciudad: 'Sevilla' }, documentoId: 'd1',
  })
})

test('acredita el DNI recibido más reciente; un DNI solo PEDIDO no acredita nada', () => {
  assert.equal(documentoQueAcredita([doc('a', 'dni', 'pedido', '2026-09-20T00:00:00Z')]), null)
  const d = documentoQueAcredita([
    doc('viejo', 'dni', 'recibido', '2026-01-01T00:00:00Z'),
    doc('otro', 'permiso', 'recibido', '2026-09-25T00:00:00Z'),
    doc('nuevo', 'dni', 'revisado', '2026-06-01T00:00:00Z'),
  ])
  assert.equal(d?.id, 'nuevo')
})

test('el mensaje lo escribe el servidor, escapado, y dice con qué DNI se acredita', () => {
  const t = textoCorreccion(ficha({ nombre: 'Pablo <b>' }), [{ campo: 'apellidos', valor: 'Franco & Ruz' }], doc('d', 'dni', 'recibido', '2026-06-01T10:00:00Z'))
  assert.match(t, /Pablo &lt;b&gt;/)
  assert.match(t, /Franco &amp; Ruz/)
  assert.match(t, /DNI archivado el 01\/06\/2026/)
})

test('enseña ANTES → DESPUÉS y con qué reconocer la ficha (dos homónimos no se confunden)', () => {
  const t = textoCorreccion(ficha(), [{ campo: 'direccion', valor: 'Calle Socorro 24' }, { campo: 'provincia', valor: 'Cádiz' }], null)
  assert.match(t, /DNI \*{5}678Z · Sevilla/)
  assert.match(t, /Dirección: Calle Feria 3 → <b>Calle Socorro 24<\/b>/)
  const vacia = textoCorreccion(ficha({ dniEnmascarado: null, contacto: { ...ficha().contacto, direccion: null, direccionIlegible: true } }),
    [{ campo: 'direccion', valor: 'Calle Socorro 24' }], null)
  assert.match(vacia, /sin DNI en la ficha/)
  assert.match(vacia, /cifrada, no se puede leer →/)
})

test('la huella cambia si la ficha cambia en los campos tocados, y no si cambia otro', () => {
  const c = [{ campo: 'direccion' as const, valor: 'Calle Socorro 24' }]
  const h = huellaAntes(ficha(), c)
  assert.equal(huellaAntes(ficha({ nombre: 'Otro' }), c), h)
  assert.notEqual(huellaAntes(ficha({ contacto: { ...ficha().contacto, direccion: 'Calle Sierpes 1' } }), c), h)
})

test('sin identidad legible no se propone un cambio de nombre', () => {
  assert.match(faltaValorActual(ficha({ identidad: null }), [{ campo: 'apellidos', valor: 'Ruz' }]) ?? '', /nombre actual/)
  assert.equal(faltaValorActual(ficha({ identidad: null }), [{ campo: 'ciudad', valor: 'Sevilla' }]), null)
})

test('un código postal que llega como número se acepta; otro tipo es formato no válido', () => {
  const r = prepararCorreccion({ codigoPostal: 41003 })
  assert.ok(r.ok)
  assert.deepEqual(r.cambios, [{ campo: 'codigoPostal', valor: '41003' }])
  const m = prepararCorreccion({ ciudad: ['Sevilla'] })
  assert.match(!m.ok ? m.motivo : '', /formato no válido/)
})

test('solo un ok es «aplicada»; un fallo de red dice que no sabe si se guardó', () => {
  assert.equal(resultadoCorreccion({ estado: 'ok', id: null, contacto: null, contactos: null }, FICHA).estado, 'aplicada')
  assert.equal(resultadoCorreccion({ estado: 'error', motivo: 'secreto_rechazado' }, FICHA).estado, 'rechazada')
  const red = resultadoCorreccion({ estado: 'error', motivo: 'red' }, FICHA)
  assert.equal(red.estado, 'error')
  assert.match(red.texto, /No sé si se ha guardado/)
  const doc = resultadoCorreccion({ estado: 'invalido', motivo: 'documento_no_acredita', campo: 'documentoId' }, FICHA)
  assert.equal(doc.estado, 'rechazada')
  assert.match(doc.texto, /No se ha cambiado nada/)
  for (const r of [
    { estado: 'no_encontrado' as const }, { estado: 'sin_configurar' as const },
    { estado: 'conflicto' as const, coincidencias: [], forzable: false },
  ]) assert.doesNotMatch(resultadoCorreccion(r, FICHA).texto, /corregida/)
})

// ── Cepos sobre el fuente ────────────────────────────────────────────────────────────────────────

const fuente = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const tg = fuente('./correduria-asistente-telegram.ts')
const proponer = tg.slice(tg.indexOf('async function proponerCorreccion'), tg.indexOf('type FilaCorreccion'))
const aplicar = tg.slice(tg.indexOf('async function aplicarCorreccion'), tg.indexOf('// ── Un turno'))

test('el botón es de un solo uso y caduca: el UPDATE exige propuesta y plazo vivo', () => {
  assert.match(aplicar, /SET estado = 'aplicando'[\s\S]*?WHERE id = \$\{id\} AND estado = 'propuesta' AND caduca_at > now\(\)/)
})

test('el interruptor se mira ANTES de gastar el botón y antes de proponer', () => {
  assert.ok(aplicar.indexOf('emisionTgActiva(') > 0)
  assert.ok(aplicar.indexOf('emisionTgActiva(') < aplicar.indexOf("SET estado = 'aplicando'"))
  assert.ok(proponer.indexOf('emisionTgActiva(') < proponer.indexOf('INSERT INTO correduria_asistente_correccion'))
})

test('un cambio de identidad sin DNI archivado (o sin poder comprobarlo) no llega a proponerse', () => {
  const guarda = proponer.indexOf('if (prep.tocaIdentidad)')
  assert.ok(guarda > 0 && guarda < proponer.indexOf('INSERT INTO correduria_asistente_correccion'))
  assert.match(proponer, /docs\.estado !== 'ok'\) \{\s*return/)
  assert.match(proponer, /if \(!documento\) \{\s*return/)
})

test('escribe por el puerto auditado, firmado por el asistente en el cuerpo Y en la cabecera', () => {
  assert.match(aplicar, /editarClienteAsegura\(\{ id: fila\.cliente_id, \.\.\.edicion, actor: ACTOR_EMISION_TG \}, ACTOR_EMISION_TG\)/)
})

test('el webhook exige la persona autorizada también para corregir', () => {
  const wh = fuente('../app/api/sivra/mensajes/telegram-webhook/route.ts')
  const rama = wh.slice(wh.indexOf("if (prefix === 'cas')"))
  const filtro = rama.indexOf("(action === 'emitir' || action === 'corregir') && String(cb.from?.id")
  assert.ok(filtro > 0)
  assert.ok(filtro < rama.indexOf('resolverBotonCorreduria('))
})

test('al pulsar se relee la ficha y se compara la huella ANTES de escribir', () => {
  const huella = aplicar.indexOf('huellaAntes(ahora, fila.cambios) !== fila.huella')
  assert.ok(huella > 0)
  assert.ok(huella < aplicar.indexOf('editarClienteAsegura('))
})

test('toda fila que se cierra suelta los valores (solo quedan los nombres de campo)', () => {
  const cierres = tg.match(/UPDATE correduria_asistente_correccion SET estado = [^\n]+/g) ?? []
  const terminales = cierres.filter((l) => !l.includes("'aplicando'"))
  assert.ok(terminales.length >= 4)
  for (const l of terminales) assert.match(l, /\$\{SOLO_CAMPOS\}/, l)
})
