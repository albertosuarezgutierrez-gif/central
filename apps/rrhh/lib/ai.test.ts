import { describe, it, expect, afterEach } from 'vitest'
import { viaIA, iaDisponible } from './ai'

const ENV = ['AI_GATEWAY_URL', 'AI_GATEWAY_SECRET', 'NVIDIA_API_KEY', 'GEMINI_API_KEY'] as const
function limpia() { for (const k of ENV) delete process.env[k] }

describe('viaIA (enrutado de IA en iarrhh)', () => {
  afterEach(limpia)

  it('prioriza la pasarela cuando AI_GATEWAY_URL + SECRET están', () => {
    limpia()
    process.env.AI_GATEWAY_URL = 'https://plataforma.example'
    process.env.AI_GATEWAY_SECRET = 'secreto'
    process.env.NVIDIA_API_KEY = 'nim' // aunque haya key directa, gana la pasarela
    expect(viaIA()).toBe('pasarela')
    expect(iaDisponible()).toBe(true)
  })

  it('usa key directa si no hay pasarela completa', () => {
    limpia()
    process.env.AI_GATEWAY_URL = 'https://plataforma.example' // falta el secreto
    process.env.NVIDIA_API_KEY = 'nim'
    expect(viaIA()).toBe('directo')
  })

  it('ninguna vía si no hay nada configurado', () => {
    limpia()
    expect(viaIA()).toBe('ninguna')
    expect(iaDisponible()).toBe(false)
  })
})
