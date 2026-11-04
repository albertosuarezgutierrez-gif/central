// Cepo: pdfjs detacha el ArrayBuffer que recibe; extraerTextoPorPagina debe usar su propia copia
// para que pdf-lib (extraerPagina) pueda leer el original después (bug producción 04/11/2026).
import { vi, describe, it, expect } from 'vitest'

vi.mock('@prisma/client', () => ({
  Prisma: { sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ sql: s.join('?'), values }) },
}))
const { queryRaw, executeRaw, subirObjeto } = vi.hoisted(() => ({
  queryRaw: vi.fn(), executeRaw: vi.fn(async () => 0), subirObjeto: vi.fn(async () => {}),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: executeRaw } }))
vi.mock('@/lib/storage', () => ({ subirObjeto }))
vi.mock('@/lib/ai', () => ({ iaChat: vi.fn(async () => 'Ana Pérez') }))

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { extraerTextoPorPagina, distribuirNominasPdf } from '@/lib/distribuir-nominas'

async function pdfDe(n: number): Promise<ArrayBuffer> {
  const d = await PDFDocument.create()
  const f = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= n; i++) d.addPage().drawText(`Nomina Ana Perez pagina ${i}`, { x: 50, y: 700, font: f })
  const u = await d.save()
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

describe('distribuir nóminas: ArrayBuffer no detached', () => {
  it('extraerTextoPorPagina no deja detached el buffer del llamante', async () => {
    const bytes = await pdfDe(3)
    const textos = await extraerTextoPorPagina(bytes)
    expect(textos).toHaveLength(3)
    expect(bytes.byteLength).toBeGreaterThan(0)
    await expect(PDFDocument.load(bytes)).resolves.toBeTruthy()
  })

  it('distribuirNominasPdf reparte las 3 páginas (sin error de buffer)', async () => {
    queryRaw.mockReset()
    queryRaw
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', nombre: 'Ana Pérez' }])
      .mockResolvedValue([{ id: 'doc-1' }])
    const res = await distribuirNominasPdf('22222222-2222-2222-2222-222222222222', await pdfDe(3), '2026-10', 'u')
    expect(res.map(r => r.estado)).toEqual(['ok', 'ok', 'ok'])
    expect(subirObjeto).toHaveBeenCalledTimes(3)
  })
})
