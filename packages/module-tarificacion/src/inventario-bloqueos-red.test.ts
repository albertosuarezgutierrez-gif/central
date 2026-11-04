// 0.3.47 (pilotaje): registro de bloqueos de red en el inventario. Forma cerrada, sin query/cuerpo, ids → `:id`, y la MISMA barrera de
// datos personales (saneado del worker y de asegura) y de valores conocidos (`redactarValoresInventario`). Valores ficticios.
import { describe, expect, it } from 'vitest'
import { MAX_BLOQUEOS_RED_INVENTARIO, lineaBloqueoRed, redactarValoresInventario, sanearInventarioDom } from './index.ts'

const base = { marcos: [{ url: 'https://mediadores.pelayo.com/portal/', nombre: null, elementos: [] }] }

describe('lineaBloqueoRed', () => {
  it('método + origen + ruta, sin query, fragmento, credenciales ni ;matriz; ids y segmentos codificados → :id', () => {
    expect(lineaBloqueoRed('POST', 'https://u:p@api.pelayo.com/uw-auto/contratacion-bff/api/v1/architecture/javascript-logs?s=QX#f', 'fetch', 'url'))
      .toBe('POST https://api.pelayo.com/uw-auto/contratacion-bff/api/v1/architecture/javascript-logs [fetch url]')
    expect(lineaBloqueoRed('GET', 'https://x.es/polizas/12345678/a%40b.es/eyJhbGciOiJ9abc123;jsessionid=Z', 'document', 'navegacion'))
      .toBe('GET https://x.es/polizas/:id/:id/:id [document navegacion]')
    expect(lineaBloqueoRed('POST', 'javascript:alert(1)', 'xhr', 'url')).toBeNull()
    expect(lineaBloqueoRed('post', 'https://x.es/a', 'XHR!', 'cuerpo')).toBe('OTRO https://x.es/a [otro cuerpo]')
  })
})

describe('sanearInventarioDom + bloqueosRed', () => {
  it('conserva solo líneas de forma exacta, deduplica, tope 40 y cuenta lo omitido', () => {
    const ok = 'POST https://api.pelayo.com/uw-auto/logs [xhr url]'
    const muchas = Array.from({ length: 50 }, (_, i) => `POST https://api.pelayo.com/r/p${i} [xhr url]`)
    const inv = sanearInventarioDom({ ...base, bloqueosRed: [ok, ok, 'POST https://x.es/a?q=1 [xhr url]', 'texto libre', 7, ...muchas] })!
    expect(inv.bloqueosRed?.[0]).toBe(ok)
    expect(inv.bloqueosRed).toHaveLength(MAX_BLOQUEOS_RED_INVENTARIO)
    expect(inv.bloqueosRed?.some((l) => l.includes('?'))).toBe(false)
    expect(inv.bloqueosRedOmitidos).toBe(3 + 11)
    // Segunda pasada (asegura) idéntica.
    expect(sanearInventarioDom(JSON.parse(JSON.stringify(inv)))).toEqual(inv)
  })
  it('una línea con forma de dato personal (NIF/correo) no pasa; sin bloqueos no aparece la clave', () => {
    const inv = sanearInventarioDom({ ...base, bloqueosRed: ['POST https://x.es/tomador/12345678Z [xhr url]', 'POST https://x.es/a [xhr url]'] })!
    expect(inv.bloqueosRed).toEqual(['POST https://x.es/a [xhr url]'])
    expect(sanearInventarioDom(base)!.bloqueosRed).toBeUndefined()
  })
  it('redactarValoresInventario quita la línea que contiene un valor conocido', () => {
    const inv = sanearInventarioDom({ ...base, bloqueosRed: ['POST https://x.es/clientes/perezficticio [xhr url]', 'POST https://x.es/a [xhr url]'] })!
    const r = redactarValoresInventario(inv, ['PerezFicticio'])
    expect(r.bloqueosRed).toEqual(['POST https://x.es/a [xhr url]'])
    expect(r.bloqueosRedOmitidos).toBe(1)
  })
})
