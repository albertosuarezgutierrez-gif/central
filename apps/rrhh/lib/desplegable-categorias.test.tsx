// Render REAL del formulario de subida (SSR) — comprueba la lista de categorías
// que ve el usuario, no solo la constante. Pilar pidió «Documentación mensual».
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

vi.mock('@/components/AdminShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import EmpresaClient from '@/app/admin/empresa/EmpresaClient'

const marcado = () => renderToStaticMarkup(
  <EmpresaClient branding={{ nombre: 'Prueba', color_primario: null, logo_url: null, tiene_fichaje: false }} />
)

describe('desplegable de categorías de documento de empresa', () => {
  it('ofrece las categorías esperadas, «Documentación mensual» incluida', () => {
    const select = marcado().match(/<select[^>]*Categoría del documento[^>]*>[\s\S]*?<\/select>/)?.[0] ?? ''
    const opciones = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m => [m[1], m[2]])
    expect(opciones).toEqual([
      ['cif', 'CIF'],
      ['escritura', 'Escritura'],
      ['seguro_social', 'Seguro Social (TC2)'],
      ['poliza', 'Póliza de seguro'],
      ['contrato', 'Contrato'],
      ['mensual', 'Documentación mensual'],
      ['otro', 'Otro'],
    ])
  })

  it('con la categoría por defecto (Contrato) no pide año ni mes', () => {
    const html = marcado()
    expect(html).not.toContain('aria-label="Año"')
    expect(html).not.toContain('aria-label="Mes"')
  })
})
