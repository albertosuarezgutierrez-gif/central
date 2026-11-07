import { test } from 'node:test'
import assert from 'node:assert/strict'
import { solicitarCodigo, canjearCodigo, claveFirma, type RepoOtp, type OtpFila, type CanalCodigo } from '../lib/acceso.ts'

// El secreto se lee al calcular el hash (no al importar).
process.env.HERRAMIENTAS_SESSION_SECRET = 's'.repeat(40)

function repo() {
  const filas: (OtpFila & { proposito: string; claveHash: string })[] = []
  const r: RepoOtp = {
    async contarRecientesPorClave(p, c) { return filas.filter((f) => f.proposito === p && f.claveHash === c).length },
    async contarRecientesPorIp() { return 0 },
    async crearOtp(f) { filas.push({ id: String(filas.length), codigoHash: f.codigoHash, creadoEn: new Date(), intentos: 0, usadoEn: null, proposito: f.proposito, claveHash: f.claveHash }) },
    async ultimoOtp(p, c) { return [...filas].reverse().find((f) => f.proposito === p && f.claveHash === c) ?? null },
    async reservarIntento(id, max) { const f = filas.find((x) => x.id === id)!; if (f.usadoEn || f.intentos >= max) return false; f.intentos++; return true },
    async gastarOtp(id) { const f = filas.find((x) => x.id === id)!; if (f.usadoEn) return false; f.usadoEn = new Date(); return true },
  }
  return r
}
function canal() { let ultimo = ''; const c: CanalCodigo = { conectado: true, async enviar({ codigo }) { ultimo = codigo; return 'enviado' } }; return { c, codigo: () => ultimo } }

test('CEPO un código de ENTRAR no sirve para FIRMAR (ni el de una versión para otra)', async () => {
  const r = repo(); const k = canal()
  await solicitarCodigo(r, k.c, { email: 'a@b.es', ip: 'x', proposito: 'acceso', destinatarioValido: async () => true })
  const cod = k.codigo()
  assert.equal((await canjearCodigo(r, { email: 'a@b.es', codigo: cod, proposito: 'firma', clave: claveFirma('v1', 'a@b.es') })).ok, false)
  await solicitarCodigo(r, k.c, { email: 'a@b.es', ip: 'x', proposito: 'firma', clave: claveFirma('v1', 'a@b.es'), destinatarioValido: async () => true })
  const codFirma = k.codigo()
  assert.equal((await canjearCodigo(r, { email: 'a@b.es', codigo: codFirma, proposito: 'firma', clave: claveFirma('v2', 'a@b.es') })).ok, false)
  assert.equal((await canjearCodigo(r, { email: 'a@b.es', codigo: codFirma, proposito: 'firma', clave: claveFirma('v1', 'a@b.es') })).ok, true)
  assert.equal((await canjearCodigo(r, { email: 'a@b.es', codigo: codFirma, proposito: 'firma', clave: claveFirma('v1', 'a@b.es') })).ok, false, 'un solo uso')
})

test('correo sin acceso: misma respuesta y NO se envía nada', async () => {
  const r = repo(); let enviados = 0
  const c: CanalCodigo = { conectado: true, async enviar() { enviados++; return 'enviado' } }
  const x = await solicitarCodigo(r, c, { email: 'nadie@b.es', ip: 'x', proposito: 'acceso', destinatarioValido: async () => false })
  assert.deepEqual(x, { ok: true, enviado: true }); assert.equal(enviados, 0)
})
