// Render REAL del formulario de subida (SSR) — comprueba la lista de categorías
// que ve el usuario, no solo la constante. Pilar pidió «Documentación mensual».
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import CuentaClient from '@/app/admin/cuenta/CuentaClient'

const marcado = () => renderToStaticMarkup(
  <CuentaClient convenio={{ codigo: '', nombre: '' }} analisis={null} analisisFecha={null} branding={{ nombre: 'Demo', color_primario: null, logo_url: null }} />
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
