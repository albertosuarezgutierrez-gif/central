// Distribuir documentos desde PDF: e2e con PDF real de 4 páginas (pdf-lib) y prisma/IA/Storage simulados.
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@prisma/client', () => ({
  Prisma: { sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ sql: s.join('?'), values }) },
}))
const { queryRaw, subirObjeto, borrarObjeto, iaChat, avisarDocumento, avisarSolicitudFirma } = vi.hoisted(() => ({
  queryRaw: vi.fn(), subirObjeto: vi.fn(async (_p: string, _b: ArrayBuffer, _c: string) => 'x'), borrarObjeto: vi.fn(async () => {}), iaChat: vi.fn(),
  avisarDocumento: vi.fn(async () => ({ aviso_id: 'a', email_estado: 'enviado', push_estado: 'enviado' })),
  avisarSolicitudFirma: vi.fn(async () => ({ aviso_id: 'a', email_estado: 'enviado', push_estado: 'enviado' })),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: vi.fn() } }))
vi.mock('@/lib/storage', () => ({
  subirObjeto, borrarObjeto, descargarObjeto: vi.fn(), copiarObjeto: vi.fn(), infoObjeto: vi.fn(), listarObjetos: vi.fn(), borrarObjetos: vi.fn(),
}))
vi.mock('@/lib/ai', () => ({ iaChat, iaDisponible: () => true }))
vi.mock('@/lib/avisos', () => ({ avisarDocumento, avisarSolicitudFirma }))

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { distribuirDocumentosPdf, candidatosEmpresa } from '@/lib/distribuir-documentos'

const EMP = '11111111-1111-1111-1111-111111111111'
const OTRA = '99999999-9999-9999-9999-999999999999'
const ANA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Ana', apellidos: 'Pérez Gil', dni: '12345678Z' }
const LUIS = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombre: 'Luis', apellidos: 'Mora Sanz', dni: '87654321X' }

async function pdf(textos: string[]): Promise<ArrayBuffer> {
  const d = await PDFDocument.create()
  const f = await d.embedFont(StandardFonts.Helvetica)
  for (const t of textos) d.addPage().drawText(t, { x: 20, y: 700, size: 10, font: f })
  const u = await d.save()
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}
// PDF: p1 Ana, p2 Ana (continuación con su nombre), p3 Luis, p4 sin nombre.
const PAGINAS = [
  'CONTRATO de Ana Perez Gil con DNI 12345678Z pagina 1 de 2',
  'Ana Perez Gil firma al final del contrato, pagina 2 de 2 ....',
  'CONTRATO de Luis Mora Sanz con DNI 87654321X pagina 1 de 1',
  'Pagina suelta sin ningun nombre ni documento de identidad aqui',
]
type Sql = { sql: string; values: unknown[] }
let inserts: Sql[]
let previos: { id: string; envio_id: string; empleado_id: string }[]
const entrada = { nombreOriginal: 'todo.pdf', carpeta: 'contratos', titulo: 'Contrato', requiereFirma: false, avisar: true }

beforeEach(() => {
  vi.clearAllMocks(); inserts = []; previos = []
  iaChat.mockImplementation(async (m: { role: string; content: string }[]) => {
    const t = m[m.length - 1].content
    if (/Ana Perez Gil/i.test(t)) return 'Ana Pérez Gil'
    if (/Luis Mora Sanz/i.test(t)) return 'Luis Mora Sanz'
    return 'NINGUNO'
  })
  queryRaw.mockImplementation(async (q: Sql) => {
    if (/FROM rrhh\.empleados/.test(q.sql)) return q.values[0] === EMP ? [ANA, LUIS] : []
    if (/INSERT INTO rrhh\.documentos/.test(q.sql)) { inserts.push(q); return [{ id: `doc-${inserts.length}` }] }
    if (/FROM rrhh\.documentos/.test(q.sql)) return previos
    throw new Error('SQL inesperada ' + q.sql)
  })
})

describe('candidatos: solo la empresa de la sesión', () => {
  it('la consulta filtra por empresa_id y estado activo', async () => {
    await candidatosEmpresa(EMP)
    const q = queryRaw.mock.calls[0][0] as Sql
    expect(q.sql).toMatch(/WHERE empresa_id = \?::uuid AND estado = 'activo'/)
    expect(q.values).toEqual([EMP])
  })
  it('otra empresa → sus propios candidatos (aquí ninguno) → error, nada se asigna', async () => {
    await expect(distribuirDocumentosPdf(OTRA, 'u', await pdf(PAGINAS), entrada)).rejects.toThrow(/No hay empleados/)
    expect(subirObjeto).not.toHaveBeenCalled()
  })
  it('a la IA solo se le pasan los nombres (NUNCA el DNI) de los empleados de esa empresa', async () => {
    await distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), entrada)
    for (const call of iaChat.mock.calls) {
      const prompt = (call[0] as { content: string }[])[1].content
      const lista = prompt.split('Texto de la página:')[0] // la lista de candidatos (el texto de la página es el documento)
      expect(lista).toContain('1. Ana Pérez Gil\n2. Luis Mora Sanz')
      expect(lista).not.toMatch(/DNI|12345678Z|87654321X/i)
    }
    const prompt = (iaChat.mock.calls[0][0] as { content: string }[])[1].content
    expect(prompt).not.toMatch(/email|iban|salario/i)
  })
})

describe('homónimos exactos', () => {
  it('dos empleados con el mismo nombre completo → la IA no puede desambiguar → no identificado', async () => {
    const ANA2 = { ...ANA, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', dni: '11111111H' }
    queryRaw.mockImplementation(async (q: Sql) => {
      if (/FROM rrhh\.empleados/.test(q.sql)) return [ANA, ANA2]
      if (/FROM rrhh\.documentos/.test(q.sql)) return []
      throw new Error('SQL inesperada ' + q.sql)
    })
    const r = await distribuirDocumentosPdf(EMP, 'u', await pdf([PAGINAS[0]]), entrada)
    expect(r.documentos.map(d => d.estado)).toEqual(['no_identificado'])
    expect(subirObjeto).not.toHaveBeenCalled()
  })
})

describe('distribuirDocumentosPdf (PDF de 4 páginas)', () => {
  it('Ana págs 1-2 = 1 documento, Luis pág 3, pág 4 no identificada y NO asignada', async () => {
    const r = await distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), entrada)
    expect(r.documentos.map(d => [d.estado, d.empleado_id, d.desde, d.hasta])).toEqual([
      ['ok', ANA.id, 1, 2], ['ok', LUIS.id, 3, 3], ['no_identificado', null, 4, 4],
    ])
    expect(r).toMatchObject({ paginas: 4, ok: 2, no_identificados: 1, errores: 0 })
    expect(subirObjeto).toHaveBeenCalledTimes(2)
    const sub = await PDFDocument.load(subirObjeto.mock.calls[0][1] as unknown as ArrayBuffer)
    expect(sub.getPageCount()).toBe(2) // el contrato de 2 páginas es UN PDF de 2 páginas
    expect(inserts).toHaveLength(2)
    // La empresa del INSERT es la de la sesión; storage bajo el expediente del empleado.
    expect(inserts[0].values[0]).toBe(EMP)
    expect(String(subirObjeto.mock.calls[0][0])).toMatch(new RegExp(`^empleado/${ANA.id}/contratos/`))
    expect(avisarDocumento).toHaveBeenCalledTimes(2)
  })

  it('la IA no puede asignar a quien la página no menciona (alucinación → no identificado)', async () => {
    iaChat.mockResolvedValue('Luis Mora Sanz')
    const r = await distribuirDocumentosPdf(EMP, 'u', await pdf(['Hoja de Ana Perez Gil sin mas datos aqui', 'Otra hoja cualquiera sin nombres de nadie']), entrada)
    expect(r.documentos.map(d => d.estado)).toEqual(['no_identificado', 'no_identificado'])
    expect(subirObjeto).not.toHaveBeenCalled()
  })

  it('respuesta de la IA fuera de la lista → no identificado (sin emparejado parcial)', async () => {
    iaChat.mockResolvedValue('Luis')
    const r = await distribuirDocumentosPdf(EMP, 'u', await pdf([PAGINAS[2]]), entrada)
    expect(r.documentos[0].estado).toBe('no_identificado')
  })

  it('requiere firma → estado pendiente + solicitud de firma (flujo existente), no aviso genérico', async () => {
    await distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), { ...entrada, requiereFirma: true })
    expect(inserts[0].values).toContain('pendiente')
    expect(avisarSolicitudFirma).toHaveBeenCalledTimes(2)
    expect(avisarDocumento).not.toHaveBeenCalled()
  })

  it('firma en una carpeta que no la admite → error y nada se sube', async () => {
    await expect(distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), { ...entrada, carpeta: 'formacion', requiereFirma: true })).rejects.toThrow(/no se pide firma/)
    expect(subirObjeto).not.toHaveBeenCalled()
  })

  it('re-subir el mismo PDF: mismos envio_id → «ya_enviado», sin copiar ni duplicar', async () => {
    const bytes = await pdf(PAGINAS)
    await distribuirDocumentosPdf(EMP, 'u', bytes, entrada)
    const ids = inserts.map(q => q.values.find(v => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) && v !== EMP && v !== ANA.id && v !== LUIS.id))
    expect(new Set(ids).size).toBe(2)
    previos = [
      { id: 'd1', envio_id: ids[0] as string, empleado_id: ANA.id }, { id: 'd2', envio_id: ids[1] as string, empleado_id: LUIS.id },
    ]
    subirObjeto.mockClear(); inserts.length = 0
    const r = await distribuirDocumentosPdf(EMP, 'u', bytes, entrada)
    expect(r.ya_enviados).toBe(2)
    expect(r.ok).toBe(0)
    expect(subirObjeto).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
  })

  it('límites: PDF demasiado grande y carpeta inexistente', async () => {
    await expect(distribuirDocumentosPdf(EMP, 'u', new ArrayBuffer(21 * 1024 * 1024), entrada)).rejects.toThrow(/supera el máximo/)
    await expect(distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), { ...entrada, carpeta: 'no_existe' })).rejects.toThrow()
  })
})

describe('distribuir: documentos OCULTOS al empleado', () => {
  it('visibleEmpleado=false → todas las filas con false y NINGÚN aviso', async () => {
    const r = await distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), { ...entrada, visibleEmpleado: false, avisar: true })
    expect(r.ok).toBe(2)
    expect(inserts).toHaveLength(2)
    for (const i of inserts) { expect(i.sql).toMatch(/visible_empleado/); expect(i.values).toContain(false) }
    expect(avisarDocumento).not.toHaveBeenCalled()
    expect(avisarSolicitudFirma).not.toHaveBeenCalled()
  })
  it('sin indicar nada → visible (por defecto) y se avisa como siempre', async () => {
    await distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), entrada)
    for (const i of inserts) expect(i.values).toContain(true)
    expect(avisarDocumento).toHaveBeenCalled()
  })
  it('oculto + requiere firma → rechazado antes de leer nada', async () => {
    await expect(distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), { ...entrada, visibleEmpleado: false, requiereFirma: true })).rejects.toThrow(/firma.*visible/i)
    expect(queryRaw).not.toHaveBeenCalled()
  })
  it('nóminas no se pueden ocultar', async () => {
    await expect(distribuirDocumentosPdf(EMP, 'u', await pdf(PAGINAS), { ...entrada, carpeta: 'nominas', visibleEmpleado: false })).rejects.toThrow(/nóminas/i)
  })
})
