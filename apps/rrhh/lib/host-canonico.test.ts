import { describe, it, expect } from 'vitest'
import { destinoCanonico } from './host-canonico'

describe('destinoCanonico', () => {
  it('producción + vercel.app redirige conservando ruta y query', () => {
    expect(destinoCanonico('production', 'central-rrhh.vercel.app', '/e/fichar', '?a=1')).toBe(
      'https://empleados.grupoasegura.es/e/fichar?a=1'
    )
  })
  it('dominio propio no redirige', () => {
    expect(destinoCanonico('production', 'empleados.grupoasegura.es', '/e')).toBeNull()
    expect(destinoCanonico('production', 'Empleados.GrupoASegura.es:443', '/e')).toBeNull()
  })
  it('exentos: api, _next, estáticos, PWA', () => {
    for (const p of ['/api/cron/nominas', '/api', '/api/operador/empresas', '/_next/static/x.js', '/manifest.json', '/manifest-e.json', '/sw.js', '/robots.txt', '/logo.png'])
      expect(destinoCanonico('production', 'central-rrhh.vercel.app', p)).toBeNull()
  })
  it('preview y local no redirigen', () => {
    expect(destinoCanonico('preview', 'central-rrhh-git-x.vercel.app', '/e')).toBeNull()
    expect(destinoCanonico(undefined, 'localhost:3000', '/e')).toBeNull()
  })
})
