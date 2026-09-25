// Cepo de la cola de aprobaciones (pieza 2-c). Lee el FUENTE: lo que vigila es el ORDEN de las
// escrituras en SQL crudo, donde ni tsc ni el build miran, e importar arrastraría Prisma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./aprobaciones.ts', import.meta.url), 'utf8')
const detector = readFileSync(new URL('./eventos-cartera.ts', import.meta.url), 'utf8')

test('un solo sitio envía correo, y solo tras reclamar la fila (pendiente → enviando)', () => {
  assert.equal(src.match(/enviarCorreoSeguido\(/g)?.length, 1)
  assert.doesNotMatch(src, /sendMail\(/)
  const reclamo = src.indexOf("set estado = 'enviando'")
  const envio = src.indexOf('await enviarCorreo(')
  assert.ok(reclamo > 0 && envio > reclamo, 'reclamar ANTES de mandar: un doble clic no manda dos correos')
  assert.match(src, /where id = \$\{id\}::uuid and estado = 'pendiente' and caduca_at >= now\(\)/)
})

test('el envío solo existe detrás de la decisión «aprobar» y el destinatario sale de la ficha', () => {
  const rechazar = src.indexOf("if (d.decision === 'rechazar')")
  assert.ok(rechazar > 0 && rechazar < src.indexOf('await enviarCorreo('))
  assert.match(src, /const ficha = await estadoEmailDeFicha\(correduriaId, a\.clienteId\)/)
  assert.match(src, /destino = ficha\.email/)
})

test('🪤 a la compañía: el buzón es el que ELIGE Alberto entre los de ESA compañía, y la anulación pasa a comunicada SOLO si salió', () => {
  const decidir = src.slice(src.indexOf('export async function decidirAprobacion'))
  // El contacto elegido tiene que ser un activo de la compañía de la póliza: un id de otra compañía no vale.
  assert.match(src, /where id = \$\{contactoId\}::uuid and compania_codigo_dgs = \$\{n\.dgs\} and activo/)
  assert.match(src, /if \(!contactoId\) return \{ estado: 'sin_email'/)
  assert.match(decidir, /destino = r\.email/)
  const comunicada = decidir.indexOf('await marcarComunicada(correduriaId, a.anulacionId)')
  const guarda = decidir.indexOf('if (envio.ok && paraCompania && a.anulacionId)')
  assert.ok(guarda > 0 && comunicada > guarda && comunicada - guarda < 200, 'solo con el envío hecho')
  assert.match(src, /update anulacion set estado = 'comunicada'[^`]*estado = 'firmada'`/)
  // El reclamo exige que la anulación SIGA firmada: desistida entre medias, no sale el correo.
  assert.match(decidir, /accion <> 'enviar_correo_compania'\s+or exists \(select 1 from anulacion n where n\.id = aprobacion\.anulacion_id and n\.estado = 'firmada'\)/)
  // Una sola propuesta viva por anulación: el índice parcial manda, así que el conflicto no va atado a `clave`.
  assert.match(src, /values \(\$\{correduriaId\}::uuid, 'enviar_correo_compania'[\s\S]{0,600}on conflict do nothing/)
  // Lo que se adjunta es la carta GUARDADA al firmar, nunca un texto recompuesto.
  assert.match(src, /adjuntos: await adjuntosFirmados\(`solicitud-anulacion-\$\{num\}`, n\.carta, n\)/)
})

test('antes de decidir se retira lo obsoleto: no se manda «no consta pagado» de un recibo ya cobrado', () => {
  const decidir = src.slice(src.indexOf('export async function decidirAprobacion'))
  const retira = decidir.indexOf('await retirarObsoletas(correduriaId)')
  assert.ok(retira > 0 && retira < decidir.indexOf("set estado = 'enviando'"))
  assert.match(src, /r\.situacion::text is distinct from 'devuelto'/)
})

test('un corte esperando al proveedor NO se da por «no enviado»: se queda a medias', () => {
  const incierto = src.indexOf('if (!envio.ok && envio.incierto)')
  assert.ok(incierto > 0 && incierto < src.indexOf("const final = envio.ok ? 'ejecutada' : 'fallida'"))
  // Cerrar a mano solo lo que lleva >10 min a medias, nunca un envío en curso.
  assert.match(src, /estado = 'enviando' and decidida_at < now\(\) - interval '10 minutes'`\n    if \(n === 0\)/)
})

test('el detector propone el aviso de recibo devuelto en su transacción, con punto de guardado', () => {
  assert.match(detector, /savepoint aprobacion`[\s\S]*proponerReciboDevuelto\(tx,[\s\S]*rollback to savepoint aprobacion/)
  assert.ok(detector.indexOf('proponerReciboDevuelto(tx,') < detector.indexOf('insert into cartera_foto'))
})

test('🪤 carta de nombramiento: sale por la cola como la anulación, adjunta la GUARDADA y pasa a «enviada» SOLO si salió', () => {
  const decidir = src.slice(src.indexOf('export async function decidirAprobacion'))
  // El reclamo exige que la carta SIGA firmada: enviada a mano o desistida entre medias, no sale el correo.
  assert.match(decidir, /or exists \(select 1 from carta_mediador cm where cm\.id = aprobacion\.carta_mediador_id and cm\.estado = 'firmada'\)/)
  const enviada = decidir.indexOf('await marcarCartaEnviada(correduriaId, a.cartaId)')
  const guarda = decidir.indexOf('if (envio.ok && paraCompania && a.cartaId)')
  assert.ok(guarda > 0 && enviada > guarda && enviada - guarda < 200, 'solo con el envío hecho')
  assert.match(src, /update carta_mediador set estado = 'enviada'[^`]*estado = 'firmada'`/)
  // El buzón, entre los activos de ESA compañía; y la carta es la guardada (cifrada), nunca recompuesta.
  assert.match(src, /async function destinoCarta[\s\S]*compania_codigo_dgs = \$\{n\.dgs\} and activo/)
  assert.match(src, /const carta = descifrarCampo\(n\.carta\)[\s\S]{0,900}adjuntosFirmados\(`nombramiento-mediador-\$\{num\}`, carta, n\)/)
  // Cada tipo recuerda su propio buzón.
  assert.match(decidir, /update compania_contactos set recibe_nombramientos = \(id = \$\{contactoElegido\}::uuid\)/)
  assert.match(src, /f\.origen === ORIGEN_CARTA_MEDIADOR \? c\.recibeNombramientos : c\.recibe/)
  // Carta ya no firmada → la propuesta pendiente se retira.
  assert.match(src, /cm\.id = a\.carta_mediador_id and cm\.estado <> 'firmada'/)
})

test('🪤 no se propone el nombramiento de una póliza que se está anulando', () => {
  const p = src.slice(src.indexOf('export async function proponerCartasFirmadas'), src.indexOf('export type BuzonPropuesto'))
  assert.match(p, /not exists \(select 1 from anulacion n where n\.poliza_id = cm\.poliza_id and n\.estado = any\(\$\{\[\.\.\.ESTADOS_ANULACION_ABIERTA\]\}::text\[\]\)\)/)
})

test('🪤 a la compañía va SIEMPRE el original en texto (el de la huella); el PDF va además, nunca en su lugar', () => {
  const f = src.slice(src.indexOf('async function adjuntosFirmados'), src.indexOf('async function enviarCorreo'))
  assert.match(f, /const original: Adjunto = \{ nombre: `\$\{base\}\.txt`, contenido: texto/)
  assert.match(f, /return \[\{ nombre: `\$\{base\}\.pdf`[\s\S]*?\}, original\]/)
  // Sin evidencia, o si el PDF falla, sale el original: la presentación no bloquea un envío.
  assert.match(f, /if \(!f\?\.docHash \|\| !f\.sello\) return \[original\]/)
  assert.match(f, /catch \(e\) \{[\s\S]*return \[original\]/)
  // El justificante no certifica una huella que el texto adjunto no cumple.
  assert.match(f, /createHash\('sha256'\)\.update\(texto, 'utf8'\)\.digest\('hex'\) !== f\.docHash[\s\S]*?return \[original\]/)
})
