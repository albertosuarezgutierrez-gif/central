// Saneado del inventario de estructura de pantalla (13/10/2026). Fixtures SINTÉTICAS: NIF, matrícula, correo y
// teléfono inventados.
import { describe, it, expect } from 'vitest'
import { MAX_OPCIONES_INVENTARIO, sanearInventarioDom, urlSinQuery } from './index.ts'

const crudo = (elementos: unknown[], url = 'https://cloud.example.test/ngx-motor-azs/alta?token=abc&nif=12345678Z#x') => ({
  marcos: [{ url, nombre: 'appArea', elementos }],
})

describe('sanearInventarioDom', () => {
  it('nunca copia el value de un input aunque el crudo lo traiga', () => {
    const inv = sanearInventarioDom(crudo([{ tag: 'input', id: 'nombreTomador', type: 'text', value: 'Pepa Pérez', valor: 'Pepa Pérez', placeholder: 'Nombre' }]))!
    const s = JSON.stringify(inv)
    expect(s).not.toContain('Pepa')
    expect(inv.marcos[0].elementos[0]).toEqual({ tag: 'input', id: 'nombreTomador', type: 'text', placeholder: 'Nombre' })
  })

  it('descarta los textos con forma de dato personal (y los cuenta, sin el valor)', () => {
    const inv = sanearInventarioDom(
      crudo([
        { tag: 'button', texto: 'Cliente 12345678Z' },
        { tag: 'label', texto: 'Matrícula 1234 BCD' },
        { tag: 'td', onclick: 'abrir()', texto: 'pepa@correo.test' },
        { tag: 'input', ariaLabel: '612 345 678' },
        { tag: 'button', texto: 'Tarificar', id: 'rate' },
      ]),
    )!
    const s = JSON.stringify(inv)
    for (const dato of ['12345678Z', '1234 BCD', 'pepa@', '612 345 678']) expect(s).not.toContain(dato)
    expect(inv.textosDescartados).toBe(4) // la URL no cuenta: su query se quita antes y la ruta se redacta, no se descarta
    expect(inv.marcos[0].elementos.at(-1)).toEqual({ tag: 'button', texto: 'Tarificar', id: 'rate' })
  })

  it('URL sin query ni fragmento; select con las primeras opciones de catálogo y el total', () => {
    const opciones = Array.from({ length: 55 }, (_, i) => ({ valor: `M${i}`, texto: `Marca ${i}` }))
    const inv = sanearInventarioDom(crudo([{ tag: 'select', id: 'marca', opciones, opcionesTotal: 55, requerido: true }]))!
    expect(inv.marcos[0].url).toBe('https://cloud.example.test/ngx-motor-azs/alta')
    const sel = inv.marcos[0].elementos[0]
    // 0.3.21: tope por select 200 (40 garantizadas + fondo común): las 55 caben enteras.
    expect(MAX_OPCIONES_INVENTARIO).toBe(200)
    expect(sel.opciones).toHaveLength(55)
    expect(sel.opciones![0]).toEqual({ valor: 'M0', texto: 'Marca 0' })
    expect(sel.opcionesTotal).toBe(55)
    expect(sel.requerido).toBe(true)
    expect(inv.recortado).toBeNull()
  })

  it('trunca los textos visibles a ~60 caracteres', () => {
    const inv = sanearInventarioDom(crudo([{ tag: 'button', texto: 'Continuar '.repeat(20) }]))!
    expect(inv.marcos[0].elementos[0].texto!.length).toBeLessThanOrEqual(60)
  })

  it('recorta por tamaño con aviso explícito', () => {
    const muchos = Array.from({ length: 600 }, (_, i) => ({ tag: 'button', id: `boton-${i}`, texto: `Acción número ${i} del formulario` }))
    const inv = sanearInventarioDom(crudo(muchos), 8 * 1024)!
    expect(new TextEncoder().encode(JSON.stringify(inv)).length).toBeLessThanOrEqual(8 * 1024)
    expect(inv.recortado).not.toBeNull()
    expect(inv.recortado!.elementosDescartados).toBe(600 - inv.totalElementos)
    expect(inv.totalElementos).toBeGreaterThan(0)
  })

  it('sin forma de inventario → null; basura dentro se ignora', () => {
    expect(sanearInventarioDom(null)).toBeNull()
    expect(sanearInventarioDom({ marcos: 'x' })).toBeNull()
    const inv = sanearInventarioDom({ marcos: [null, { url: 1, elementos: [{ tag: '<script>' }, 7, { tag: 'INPUT', id: 'a' }] }] })!
    expect(inv.marcos).toHaveLength(1)
    expect(inv.marcos[0].elementos).toEqual([{ tag: 'input', id: 'a' }])
  })

  it('urlSinQuery tapa lo que tenga forma de dato personal en la ruta', () => {
    expect(urlSinQuery('https://x.test/cliente/12345678Z/ficha?a=1')).not.toContain('12345678Z')
  })
})
