import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { elegirDestinoHilo, textoHistorialRecordatorio, validarCerrar, validarRecordar } from './correo-seguimiento-lead-puro.ts'

const src = readFileSync(join(import.meta.dirname, 'correo-seguimiento-lead.ts'), 'utf8')
const route = readFileSync(join(import.meta.dirname, '..', 'app', 'api', 'operador', 'correo', 'seguimiento-lead', 'route.ts'), 'utf8')
const casar = readFileSync(join(import.meta.dirname, 'correo-respuesta-lead.ts'), 'utf8')

const OK = { hiloId: '12', etapa: 'datos_1', ancla: '2026-10-19T10:00:00.000Z', asunto: 'Re: seguro coche', texto: 'Hola, te recuerdo los datos que faltan.', idempotencia: 'clp-55', actor: 'agente:telegram-1' }

test('recordar: la etapa de «¿cerrar?» no manda correo y lo malformado se rechaza', () => {
  assert.equal(validarRecordar(OK).ok, true)
  assert.equal(validarRecordar({ ...OK, etapa: 'datos_cerrar' }).ok, false)
  assert.equal(validarRecordar({ ...OK, etapa: 'propuesta' }).ok, false)
  assert.equal(validarRecordar({ ...OK, hiloId: 'abc' }).ok, false)
  assert.equal(validarRecordar({ ...OK, ancla: 'ayer' }).ok, false)
  assert.equal(validarRecordar({ ...OK, texto: 'corto' }).ok, false)
  assert.equal(validarRecordar({ ...OK, idempotencia: 'a b' }).ok, false)
  assert.equal(validarRecordar({ ...OK, actor: '' }).ok, false)
  assert.equal(validarCerrar({ hiloId: '3', actor: 'x' }).ok, true)
  assert.equal(validarCerrar({ hiloId: '3' }).ok, false)
})

test('destinatario: SOLO la dirección de la ficha que casa con el índice ciego del hilo', () => {
  const cands = [{ claro: 'a@x.es', hash: 'ha' }, { claro: 'b@x.es', hash: 'hb' }, { claro: null, hash: 'hc' }]
  assert.equal(elegirDestinoHilo(cands, 'hb'), 'b@x.es')
  assert.equal(elegirDestinoHilo(cands, 'hz'), null) // ninguna casa: no sale nada
  assert.equal(elegirDestinoHilo(cands, 'hc'), null) // ilegible: no sale nada
  assert.equal(elegirDestinoHilo(cands, null), null) // hilo sin índice ciego: no sale nada
})

test('historial: sin cuerpo y con el OK de quién', () => {
  const t = textoHistorialRecordatorio('datos_2', 'Re: seguro', 'agente:telegram-1')
  assert.match(t, /2º/)
  assert.match(t, /agente:telegram-1/)
})

test('cepo: el envío re-decide el hito con la BD de AHORA antes de mandar (cliente que contesta = no sale)', () => {
  const i = src.indexOf('export async function recordarSeguimiento')
  const cuerpo = src.slice(i, src.indexOf('// ─── cerrar como perdida'))
  const decide = cuerpo.indexOf('hitoSeguimientoLead(grupo.seguimiento, ahora)')
  const envia = cuerpo.indexOf('enviarCorreoSeguido({')
  assert.ok(decide > 0 && envia > decide, 'hitoSeguimientoLead debe ir ANTES de enviarCorreoSeguido')
  assert.match(cuerpo, /mismoHito\(hito, r\.etapa, r\.ancla\)/)
  assert.match(cuerpo, /return \{ estado: 'ya_no_toca' \}/)
  // Mismo camino que F1: en el hilo, con copia oculta a hola@ y clave de idempotencia.
  assert.match(cuerpo, /enRespuestaA: \{ messageId: grupo\.raiz/)
  assert.match(cuerpo, /copiaOculta: MEDIADOR\.identidad\.email/)
  assert.match(cuerpo, /idempotencia: r\.idempotencia/)
})

test('cepo: todo SQL del seguimiento lleva correduria_id y sale por la puerta única', () => {
  assert.match(src, /import \{ prisma \} from '\.\/tenant'/)
  const sqls = src.split('prisma.$').slice(1)
  for (const s of sqls) if (/seguros\.correduria_hilo/.test(s.slice(0, 400))) assert.match(s.slice(0, 2500), /correduria_id = \$\{correduriaId\}::uuid/)
})

test('cepo: cerrar como perdida no borra nada (perder por el camino de siempre) y es de un solo uso', () => {
  assert.doesNotMatch(src, /\bdelete\s+from\b/i)
  assert.match(src, /accion: 'perder', motivo: 'sin_respuesta'/)
  assert.match(src, /and cerrado_perdido_at is null`/)
})

test('cepo: el puerto es una escritura auditada', () => {
  assert.match(route, /export const POST = auditado\(/)
})

test('cepo: casar una respuesta corta la cadena aunque la IA no la lea (no leído ≠ no contestó)', () => {
  const i = casar.indexOf('export async function casarRespuestaLead')
  const cuerpo = casar.slice(i, casar.indexOf('// ─── Guardar'))
  assert.match(cuerpo, /set ultimo_contacto_cliente_at = now\(\)/)
})
