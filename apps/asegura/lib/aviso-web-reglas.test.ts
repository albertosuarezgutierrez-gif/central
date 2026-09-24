import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  avisoQueToca,
  cuerpoAviso,
  cuerpoConfirmacion,
  enlaceWeb,
  parsearFecha,
  revisarSolicitud,
  vencimientoDelCiclo,
} from './aviso-web-reglas.ts'

const HOY = new Date(Date.UTC(2026, 8, 24)) // 24/09/2026
const d = (s: string) => parsearFecha(s)!
const iso = (x: Date) => x.toISOString().slice(0, 10)
const BASE = { nombre: 'Ana', email: 'Ana@Correo.es', ramo: 'hogar', vence: '2027-01-15', consentimiento: true }

test('solicitud válida: normaliza el correo y traduce el ramo de la web', () => {
  const r = revisarSolicitud(BASE)
  assert.ok(r.ok)
  assert.equal(r.solicitud.email, 'ana@correo.es')
  assert.equal(r.solicitud.ramo, 'hogar')
  assert.equal(revisarSolicitud({ ...BASE, ramo: 'responsabilidad-civil-autonomos' }).ok && 'rc', 'rc')
})

test('🚨 sin consentimiento EXPLÍCITO no hay suscripción', () => {
  for (const c of [undefined, false, 'true', 'on', 1]) {
    const r = revisarSolicitud({ ...BASE, consentimiento: c })
    assert.equal(r.ok, false, `consentimiento=${String(c)} no puede valer`)
  }
})

test('vida y salud no entra: su renovación tiene reglas propias', () => {
  const r = revisarSolicitud({ ...BASE, ramo: 'vida-y-salud' })
  assert.equal(r.ok, false)
})

test('fechas imposibles o absurdas se rechazan', () => {
  for (const v of ['2026-02-31', '15/01/2027', '1900-01-01', '2099-01-01', '']) {
    assert.equal(revisarSolicitud({ ...BASE, vence: v }).ok, false, v)
  }
})

test('el ciclo es el primer aniversario al que aún se le puede decir que no', () => {
  assert.equal(iso(vencimientoDelCiclo(d('2019-05-10'), HOY)), '2027-05-10')
  assert.equal(iso(vencimientoDelCiclo(d('2020-12-01'), HOY)), '2026-12-01')
  // 24/10 − 30 = 24/09 = hoy: todavía se puede.
  assert.equal(iso(vencimientoDelCiclo(d('2020-10-24'), HOY)), '2026-10-24')
  // 23/10 − 30 = 23/09: ayer. Pasa al año siguiente.
  assert.equal(iso(vencimientoDelCiclo(d('2020-10-23'), HOY)), '2027-10-23')
  assert.equal(iso(vencimientoDelCiclo(d('2024-02-29'), HOY)), '2027-02-28')
})

test('avisos: a 70 días el 1, a 45 el 2, y ninguno dentro del último mes', () => {
  const toca = (vence: string, a1: string | null = null, a2: string | null = null) =>
    avisoQueToca({ vence: d(vence), hoy: HOY, aviso1Para: a1, aviso2Para: a2 })
  assert.equal(toca('2026-12-04'), null) // 71 días: aún no
  assert.deepEqual(toca('2026-12-03'), { tipo: 'aviso1', para: '2026-12-03' }) // 70
  assert.deepEqual(toca('2026-11-09'), { tipo: 'aviso1', para: '2026-11-09' }) // 46
  assert.deepEqual(toca('2026-11-08'), { tipo: 'aviso2', para: '2026-11-08' }) // 45
  assert.deepEqual(toca('2026-10-25'), { tipo: 'aviso2', para: '2026-10-25' }) // 31
  // 30 días: el último día para oponerse es HOY; el ciclo sigue siendo este, pero ya no se escribe.
  assert.equal(toca('2026-10-24'), null)
})

test('idempotencia: cada aviso sale una vez por ciclo, y vuelve al año siguiente', () => {
  assert.equal(avisoQueToca({ vence: d('2026-12-03'), hoy: HOY, aviso1Para: '2026-12-03', aviso2Para: null }), null)
  assert.deepEqual(avisoQueToca({ vence: d('2026-12-03'), hoy: HOY, aviso1Para: '2025-12-03', aviso2Para: null }), {
    tipo: 'aviso1',
    para: '2026-12-03',
  })
  assert.equal(avisoQueToca({ vence: d('2026-11-08'), hoy: HOY, aviso1Para: null, aviso2Para: '2026-11-08' }), null)
})

test('los correos llevan los plazos y nunca prometen ahorro', () => {
  const c = cuerpoConfirmacion({ nombre: 'Ana', ramo: 'hogar', vence: d('2027-01-15'), enlaceConfirmar: 'https://x.es/aviso/confirmar#t=a' })
  assert.match(c.texto, /Confirmar: https:\/\/x\.es/)
  const a = cuerpoAviso({
    tipo: 'aviso1', nombre: 'Ana', ramo: 'hogar', vence: d('2026-12-03'), hoy: HOY,
    enlacePortal: 'https://p.es/', directo: true, enlaceBaja: 'https://x.es/aviso/baja#t=b',
  })
  assert.match(a.texto, /4 de octubre de 2026/) // compañía: 03/12 − 60
  assert.match(a.texto, /3 de noviembre de 2026/) // tomador: 03/12 − 30
  assert.match(a.texto, /no recibir más avisos: https:\/\/x\.es\/aviso\/baja/)
  for (const t of [c.texto, a.texto]) assert.doesNotMatch(t, /ahorr|más barat|mejor precio|garantiz/i)
})

test('🚨 un enlace que no es https no sale en un correo', () => {
  assert.throws(() => cuerpoConfirmacion({ nombre: 'A', ramo: 'auto', vence: HOY, enlaceConfirmar: 'http://x.es' }), /enlace_no_https/)
})

test('el token va en el fragmento, no en la query', () => {
  assert.equal(enlaceWeb('https://w.es', '/aviso/baja', 'abc'), 'https://w.es/aviso/baja#t=abc')
})
