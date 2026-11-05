// Login por correo + código (modelo rrhh): el código NO sale a nadie (canal sin conectar), a la BD va solo el hash, respuesta
// idéntica exista o no el correo, intentos reservados antes de comparar, y la sesión firmada falla cerrada.
// Cepo visto fallar el 05/11/2026: en lib/acceso.ts guardar `codigoHash: codigo` (los dígitos) → rojo en «solo el hash»; restaurado → verde.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  solicitarCodigo, verificarCodigo, empresaInicial, hashEmailAcceso, hashCodigoAcceso, CANAL_NO_CONECTADO,
  type RepoAcceso, type OtpFila, type EmpresaDeUsuario,
} from '../lib/acceso.ts'
import { emitirCookie, leerCookie } from '../lib/sesion-cookie.ts'

const U = '00000000-0000-4000-9000-000000000001'
const E1 = '00000000-0000-4000-8000-00000000000a'
const E2 = '00000000-0000-4000-8000-00000000000b'
beforeEach(() => { process.env.CONTABILIDAD_SESSION_SECRET = 'pimienta-de-prueba' })

function repoFake(empresas: EmpresaDeUsuario[] = [{ empresaId: E1, razonSocial: 'A', rol: 'dueno' }]) {
  const otps: (OtpFila & { emailHash: string; envio: string; ip: string })[] = []
  const repo: RepoAcceso = {
    async contarRecientesPorEmail(h, desde) { return otps.filter((o) => o.emailHash === h && o.creadoEn >= desde).length },
    async contarRecientesPorIp(ip, desde) { return otps.filter((o) => o.ip === ip && o.creadoEn >= desde).length },
    async crearOtp(f) { otps.push({ id: String(otps.length + 1), emailHash: f.emailHash, codigoHash: f.codigoHash, ip: f.ip, envio: f.envio, creadoEn: new Date(), intentos: 0, usadoEn: null }) },
    async ultimoOtp(h) { const o = otps.filter((x) => x.emailHash === h).at(-1); return o ? { ...o } : null },
    async reservarIntento(id, max) { const o = otps.find((x) => x.id === id)!; if (o.usadoEn || o.intentos >= max) return false; o.intentos += 1; return true },
    async gastarOtp(id) { const o = otps.find((x) => x.id === id)!; if (o.usadoEn) return false; o.usadoEn = new Date(); return true },
    async usuarioPorEmail(e) { return e === 'duena@ejemplo.es' ? { id: U, nombre: 'Pilar', sv: 0 } : null },
    async empresasDeUsuario() { return empresas },
  }
  return { repo, otps }
}

/** Para canjear en el test hay que conocer el código: se intercepta el `generarCodigo` a través de un canal «conectado» falso. */
async function pedirConCodigo(repo: RepoAcceso, email: string): Promise<string> {
  let visto = ''
  await solicitarCodigo(repo, { conectado: true, enviar: async (c) => { visto = c.codigo; return 'enviado' } }, { email, ip: '1.1.1.1' })
  return visto
}

test('canal NO conectado: se responde «no enviado», no se llama a ningún envío y la fila queda en estado no_enviado', async () => {
  const { repo, otps } = repoFake()
  let llamadas = 0
  const canal = { conectado: false, enviar: async () => { llamadas += 1; return 'enviado' as const } }
  const r = await solicitarCodigo(repo, canal, { email: 'duena@ejemplo.es', ip: '1.1.1.1' })
  assert.deepEqual(r, { ok: true, enviado: false })
  assert.equal(llamadas, 0)
  assert.equal(otps[0].envio, 'no_enviado')
  assert.deepEqual(await solicitarCodigo(repo, CANAL_NO_CONECTADO, { email: 'nadie@ejemplo.es', ip: '1.1.1.1' }), { ok: true, enviado: false }, 'misma respuesta para un correo sin cuenta')
})

test('solo el hash: la BD nunca guarda los 6 dígitos ni el correo en claro', async () => {
  const { repo, otps } = repoFake()
  const codigo = await pedirConCodigo(repo, 'duena@ejemplo.es')
  assert.match(codigo, /^\d{6}$/)
  assert.equal(otps[0].codigoHash, hashCodigoAcceso(codigo))
  assert.notEqual(otps[0].codigoHash, codigo)
  assert.equal(otps[0].emailHash, hashEmailAcceso('duena@ejemplo.es'))
})

test('canje: código bueno → usuario + empresas (una → entra directo); malo → incorrecto; reusado → ya_usado', async () => {
  const { repo } = repoFake()
  const codigo = await pedirConCodigo(repo, 'Duena@Ejemplo.es')
  const malo = await verificarCodigo(repo, { email: 'duena@ejemplo.es', codigo: codigo === '000000' ? '111111' : '000000' })
  assert.equal(!malo.ok && malo.error, 'incorrecto')
  const bueno = await verificarCodigo(repo, { email: 'duena@ejemplo.es', codigo })
  assert.ok(bueno.ok)
  assert.equal(bueno.ok && empresaInicial(bueno.empresas), E1)
  const otra = await verificarCodigo(repo, { email: 'duena@ejemplo.es', codigo })
  assert.equal(!otra.ok && otra.error, 'ya_usado')
})

test('gestor con varias empresas: no se elige ninguna sola (paso por el selector)', async () => {
  const { repo } = repoFake([{ empresaId: E1, razonSocial: 'A', rol: 'gestor' }, { empresaId: E2, razonSocial: 'B', rol: 'gestor' }])
  const codigo = await pedirConCodigo(repo, 'duena@ejemplo.es')
  const r = await verificarCodigo(repo, { email: 'duena@ejemplo.es', codigo })
  assert.ok(r.ok)
  assert.equal(r.ok && empresaInicial(r.empresas), null)
})

test('5 intentos y bloqueado aunque el sexto sea el bueno; topes por correo', async () => {
  const { repo } = repoFake()
  const codigo = await pedirConCodigo(repo, 'duena@ejemplo.es')
  for (let i = 0; i < 5; i++) await verificarCodigo(repo, { email: 'duena@ejemplo.es', codigo: codigo === '000000' ? '111111' : '000000' })
  const r = await verificarCodigo(repo, { email: 'duena@ejemplo.es', codigo })
  assert.equal(!r.ok && r.error, 'bloqueado')
  for (let i = 0; i < 4; i++) await solicitarCodigo(repo, CANAL_NO_CONECTADO, { email: 'duena@ejemplo.es', ip: `2.2.2.${i}` })
  const tope = await solicitarCodigo(repo, CANAL_NO_CONECTADO, { email: 'duena@ejemplo.es', ip: '3.3.3.3' })
  assert.equal(!tope.ok && tope.status, 429)
})

test('correo sin acceso: el código vale pero no hay usuario → sin_acceso (no entra)', async () => {
  const { repo } = repoFake()
  // A un correo sin cuenta no se le «envía» nada ni con canal conectado; se siembra la fila a mano con un código conocido.
  assert.equal(await pedirConCodigo(repo, 'nadie@ejemplo.es'), '', 'a quien no tiene cuenta no se le envía')
  await repo.crearOtp({ emailHash: hashEmailAcceso('nadie@ejemplo.es'), codigoHash: hashCodigoAcceso('123456'), ip: '1.1.1.1', envio: 'no_enviado' })
  const r = await verificarCodigo(repo, { email: 'nadie@ejemplo.es', codigo: '123456' })
  assert.equal(!r.ok && r.error, 'sin_acceso')
})

test('cookie de sesión: firmada; manipulada, caducada o sin secreto → null (fail-closed)', async () => {
  const ahora = new Date('2026-11-05T10:00:00Z')
  const c = await emitirCookie({ u: U, e: E1, sv: 0 }, ahora)
  assert.deepEqual((await leerCookie(c, ahora))?.e, E1)
  const o = JSON.parse(atob(c)); o.e = E2
  assert.equal(await leerCookie(btoa(JSON.stringify(o)), ahora), null, 'cambiar de empresa a mano invalida la firma')
  assert.equal(await leerCookie(c, new Date(ahora.getTime() + 13 * 3_600_000)), null)
  delete process.env.CONTABILIDAD_SESSION_SECRET
  assert.equal(await leerCookie(c, ahora), null)
})
