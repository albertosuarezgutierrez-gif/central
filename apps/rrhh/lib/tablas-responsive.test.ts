import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Guardián: toda <table bajo app/ debe poder scrollear/colapsar en móvil (≥320 px):
// dentro de <Tabla>, con la clase `tabla-cards` o dentro de un contenedor `overflow-x-auto`.
const RAIZ = join(__dirname, '..', 'app')

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return tsx(p)
    return p.endsWith('.tsx') ? [p] : []
  })
}

/** Devuelve las `<table` sin protección (ruta:línea). */
export function tablasDesprotegidas(archivos: { ruta: string; src: string }[]): string[] {
  const malas: string[] = []
  for (const { ruta, src } of archivos) {
    for (const m of src.matchAll(/<table\b/g)) {
      const idx = m.index ?? 0
      const etiqueta = src.slice(idx, src.indexOf('>', idx) + 1)
      const antes = src.slice(Math.max(0, idx - 400), idx)
      const linea = src.slice(0, idx).split('\n').length
      const ok = /tabla-cards/.test(etiqueta) || /<Tabla\b[^>]*>\s*$/.test(antes) || /overflow-x-auto[^>]*>\s*$/.test(antes)
      if (!ok) malas.push(`${ruta}:${linea}`)
    }
  }
  return malas
}

describe('tablas responsive', () => {
  const archivos = tsx(RAIZ).map(ruta => ({ ruta: ruta.replace(RAIZ, 'app'), src: readFileSync(ruta, 'utf8') }))

  it('toda <table bajo app/ va en <Tabla, con tabla-cards o en un overflow-x-auto', () => {
    expect(tablasDesprotegidas(archivos)).toEqual([])
  })

  it('el detector caza una tabla pelada y acepta las tres formas válidas', () => {
    const f = (src: string) => tablasDesprotegidas([{ ruta: 'x.tsx', src }])
    expect(f('<div><table className="w-full">')).toHaveLength(1)
    expect(f('<div className="overflow-x-auto"><table className="w-full">')).toEqual([])
    expect(f('<table className="tabla-cards w-full">')).toEqual([])
  })
})
