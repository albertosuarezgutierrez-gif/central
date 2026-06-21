import { describe, it, expect, beforeEach } from 'vitest'
import { FirmaPropia, type Evidencia, type ContextoFirma } from '@central/core-firma'
import {
  solicitarCodigoFirma, solicitarFirma, firmarDocumento, hashCodigo, enmascararEmail,
  type DepsFirma, type RepoFirma, type DocFirmable, type OtpGuardado,
} from './index.ts'

const TITULAR = { id: 'tit-1', nombre: 'Pilar Piña', email: 'pilar@x.com', dni: '12345678Z' }

/** Repo de firma en memoria, para probar la orquestación sin BD. */
function repoFake(doc: DocFirmable | null) {
  const state = {
    doc,
    otp: null as OtpGuardado | null,
    firma: null as { evidencia: Evidencia; contexto: ContextoFirma } | null,
  }
  const repo: RepoFirma = {
    async cargarDoc() { return state.doc },
    async guardarOtp(_id, codigoHash, expiraAt) { state.otp = { codigoHash, expiraAt, intentos: 0 } },
    async cargarOtp() { return state.otp },
    async sumarIntentoOtp() { if (state.otp) state.otp.intentos++ },
    async marcarPendiente() { if (state.doc) state.doc.estadoFirma = 'pendiente' },
    async registrarFirma(_id, evidencia, contexto) {
      state.firma = { evidencia, contexto }
      if (state.doc) state.doc.estadoFirma = 'firmado'
      state.otp = null
    },
  }
  return { repo, state }
}

function deps(over: Partial<DepsFirma> & { repo: RepoFirma }): DepsFirma {
  return {
    email: { async enviarCodigo() { return true } },
    storage: { async descargar() { return new TextEncoder().encode('contenido del contrato').buffer } },
    proveedor: new FirmaPropia(),
    ...over,
  }
}

describe('enmascararEmail', () => {
  it('oculta el usuario dejando la inicial', () => {
    expect(enmascararEmail('pilar@x.com')).toBe('p***@x.com')
    expect(enmascararEmail('sinarroba')).toBe('***')
  })
})

describe('solicitarCodigoFirma', () => {
  it('rechaza si el documento no requiere firma', async () => {
    const { repo } = repoFake({ estadoFirma: 'sin_firma', storagePath: 'p', titular: TITULAR })
    await expect(solicitarCodigoFirma(deps({ repo }), 'doc-1')).rejects.toThrow('no requiere firma')
  })

  it('guarda el OTP y reporta el email enmascarado cuando se envía', async () => {
    const { repo, state } = repoFake({ estadoFirma: 'pendiente', storagePath: 'p', titular: TITULAR })
    const r = await solicitarCodigoFirma(deps({ repo }), 'doc-1')
    expect(r).toEqual({ enviado: true, email_parcial: 'p***@x.com' })
    expect(state.otp).not.toBeNull()
  })

  it('sin remitente de email → enviado:false (firma por sesión)', async () => {
    const { repo } = repoFake({ estadoFirma: 'pendiente', storagePath: 'p', titular: TITULAR })
    const r = await solicitarCodigoFirma(deps({ repo, email: null }), 'doc-1')
    expect(r).toEqual({ enviado: false })
  })
})

describe('firmarDocumento', () => {
  let base: ReturnType<typeof repoFake>
  beforeEach(() => { base = repoFake({ estadoFirma: 'pendiente', storagePath: 'p', titular: TITULAR }) })

  it('firma por sesión (sin OTP) y registra evidencia íntegra', async () => {
    const ev = await firmarDocumento(deps({ repo: base.repo }), 'doc-1', {
      nombre_confirmado: 'pilar piña', ip: '1.2.3.4', user_agent: 'test',
    })
    expect(ev.metodo).toBe('sesion_token')
    expect(base.state.doc!.estadoFirma).toBe('firmado')
    expect(base.state.firma!.evidencia.doc_hash).toBe(ev.doc_hash)
  })

  it('rechaza si el nombre confirmado no coincide', async () => {
    await expect(
      firmarDocumento(deps({ repo: base.repo }), 'doc-1', { nombre_confirmado: 'Otro Nombre' })
    ).rejects.toThrow('no coincide')
  })

  it('con OTP emitido exige el código correcto (control exclusivo)', async () => {
    // emitimos un OTP conocido
    const codigo = '654321'
    base.state.otp = { codigoHash: hashCodigo(codigo), expiraAt: new Date(Date.now() + 60_000), intentos: 0 }

    await expect(
      firmarDocumento(deps({ repo: base.repo }), 'doc-1', { nombre_confirmado: 'Pilar Piña' })
    ).rejects.toThrow('Falta el código')

    await expect(
      firmarDocumento(deps({ repo: base.repo }), 'doc-1', { nombre_confirmado: 'Pilar Piña', codigo: '000000' })
    ).rejects.toThrow('Código incorrecto')
    expect(base.state.otp!.intentos).toBe(1)

    const ev = await firmarDocumento(deps({ repo: base.repo }), 'doc-1', {
      nombre_confirmado: 'Pilar Piña', codigo,
    })
    expect(ev.metodo).toBe('otp_email')
    expect(base.state.doc!.estadoFirma).toBe('firmado')
  })

  it('rechaza un documento ya firmado', async () => {
    base.state.doc!.estadoFirma = 'firmado'
    await expect(
      firmarDocumento(deps({ repo: base.repo }), 'doc-1', { nombre_confirmado: 'Pilar Piña' })
    ).rejects.toThrow('ya está firmado')
  })
})

describe('solicitarFirma', () => {
  it('marca el documento como pendiente', async () => {
    const { repo, state } = repoFake({ estadoFirma: 'sin_firma', storagePath: 'p', titular: TITULAR })
    await solicitarFirma(deps({ repo }), 'doc-1')
    expect(state.doc!.estadoFirma).toBe('pendiente')
  })
})
