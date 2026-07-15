import { NextRequest, NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { subirObjeto, descargarObjeto } from '@/lib/storage'
import { renderToBuffer } from '@react-pdf/renderer'
import {
  AutorizacionMaquinariaPdf, type CamposAutorizacionMaquinaria, type EquipoMaquinaria,
  AcuerdoConfidencialidadPdf, type CamposAcuerdoConfidencialidad,
} from '@/lib/plantillas-prl'
import { createElement } from 'react'

export const maxDuration = 60

const TIPOS_VALIDOS = ['autorizacion_maquinaria', 'acuerdo_con_acceso', 'acuerdo_sin_acceso'] as const
type TipoPrl = typeof TIPOS_VALIDOS[number]

export async function POST(req: NextRequest) {
  let empresa_id: string, usuario: string
  try {
    const s = await getSesion()
    empresa_id = s.empresa_id
    usuario = s.usuario_id
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON requerido' }, { status: 400 })

  const { tipo, empleado_id, campos = {} } = body as { tipo: TipoPrl; empleado_id: string; campos: Record<string, any> }

  if (!TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: 'Tipo de documento no válido' }, { status: 400 })
  if (!empleado_id) return NextResponse.json({ error: 'empleado_id requerido' }, { status: 400 })

  // Obtener datos de empresa
  const [empresa] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT nombre, color_primario, logo_path, nif, representante_nombre, representante_nif,
           domicilio, localidad, email
    FROM rrhh.empresas WHERE id = ${empresa_id}::uuid LIMIT 1`)
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  // Obtener datos del empleado
  const [empleado] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, apellidos, dni, puesto, centro_trabajo
    FROM rrhh.empleados WHERE id = ${empleado_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  // Logo → base64 data URI
  let empresa_logo_b64: string | null = null
  if (empresa.logo_path) {
    try {
      const bytes = await descargarObjeto(empresa.logo_path)
      const b64 = Buffer.from(bytes).toString('base64')
      const ext = empresa.logo_path.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      empresa_logo_b64 = `data:${mime};base64,${b64}`
    } catch { /* sin logo */ }
  }

  if (tipo === 'autorizacion_maquinaria') {
    const camposPdf = generarCamposMaquinaria({ empresa, empresa_logo_b64, empleado, campos })
    const faltantes = validarCampos(camposPdf)
    if (faltantes.length > 0) {
      return NextResponse.json({ error: `Faltan campos: ${faltantes.join(', ')}`, faltantes }, { status: 422 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createElement(AutorizacionMaquinariaPdf, camposPdf) as any)
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

    const fechaStr = new Date().toISOString().split('T')[0]
    const storagePath = `empleado/${empleado_id}/prevencion_riesgos/autorizacion-maquinaria-${fechaStr}-${crypto.randomUUID()}.pdf`
    await subirObjeto(storagePath, arrayBuffer, 'application/pdf')

    const nombre = `autorizacion-maquinaria-${fechaStr}.pdf`

    // Borrar si ya existe uno con el mismo nombre (re-generación)
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM rrhh.documentos
      WHERE empleado_id = ${empleado_id}::uuid AND empresa_id = ${empresa_id}::uuid
        AND carpeta = 'prevencion_riesgos' AND nombre = ${nombre}`)

    const [doc] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO rrhh.documentos
        (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por, requiere_firma_empresa, estado_firma)
      VALUES
        (${empresa_id}::uuid, ${empleado_id}::uuid, 'prevencion_riesgos', ${nombre},
         'application/pdf', ${buffer.length}, ${storagePath}, ${usuario}, true, 'pendiente_empresa')
      RETURNING id`)

    return NextResponse.json({ ok: true, documento_id: doc.id })
  }

  if (tipo === 'acuerdo_con_acceso' || tipo === 'acuerdo_sin_acceso') {
    const camposPdf = generarCamposAcuerdo({ empresa, empresa_logo_b64, empleado, tipo })
    const faltantesAcuerdo = validarCamposAcuerdo(camposPdf)
    if (faltantesAcuerdo.length > 0) {
      return NextResponse.json({ error: `Faltan campos: ${faltantesAcuerdo.join(', ')}`, faltantes: faltantesAcuerdo }, { status: 422 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createElement(AcuerdoConfidencialidadPdf, camposPdf) as any)
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer

    const fechaStr = new Date().toISOString().split('T')[0]
    const slug = tipo === 'acuerdo_con_acceso' ? 'acuerdo-confidencialidad-con-acceso' : 'acuerdo-confidencialidad-sin-acceso'
    const storagePath = `empleado/${empleado_id}/prevencion_riesgos/${slug}-${fechaStr}-${crypto.randomUUID()}.pdf`
    await subirObjeto(storagePath, arrayBuffer, 'application/pdf')

    const nombre = `${slug}-${fechaStr}.pdf`

    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM rrhh.documentos
      WHERE empleado_id = ${empleado_id}::uuid AND empresa_id = ${empresa_id}::uuid
        AND carpeta = 'prevencion_riesgos' AND nombre = ${nombre}`)

    const [doc] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO rrhh.documentos
        (empresa_id, empleado_id, carpeta, nombre, tipo, tamano, storage_path, subido_por, requiere_firma_empresa, estado_firma)
      VALUES
        (${empresa_id}::uuid, ${empleado_id}::uuid, 'prevencion_riesgos', ${nombre},
         'application/pdf', ${buffer.length}, ${storagePath}, ${usuario}, true, 'pendiente_empresa')
      RETURNING id`)

    return NextResponse.json({ ok: true, documento_id: doc.id })
  }

  return NextResponse.json({ error: 'Tipo no implementado' }, { status: 400 })
}

function generarCamposMaquinaria({
  empresa, empresa_logo_b64, empleado, campos,
}: { empresa: any; empresa_logo_b64: string | null; empleado: any; campos: Record<string, any> }): CamposAutorizacionMaquinaria {
  const hoy = new Date()
  const dd = String(hoy.getDate()).padStart(2, '0')
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const yyyy = hoy.getFullYear()

  const nombreCompleto = [empleado.nombre, empleado.apellidos].filter(Boolean).join(' ')

  return {
    empresa_nombre: empresa.nombre ?? '',
    empresa_color: empresa.color_primario ?? '#1a56db',
    empresa_logo_b64,
    empleado_nombre: nombreCompleto,
    empleado_dni: empleado.dni ?? '',
    empleado_puesto: campos.puesto ?? empleado.puesto ?? '',
    obra_centro: campos.obra_centro ?? empleado.centro_trabajo ?? '',
    fecha_emision: `${dd}/${mm}/${yyyy}`,
    equipos: (campos.equipos ?? []) as EquipoMaquinaria[],
    otros_descripcion: campos.otros_descripcion ?? '',
  }
}

function validarCampos(c: CamposAutorizacionMaquinaria): string[] {
  const faltantes: string[] = []
  if (!c.empleado_nombre) faltantes.push('nombre del empleado')
  if (!c.empleado_dni) faltantes.push('DNI/NIE del empleado')
  if (!c.empleado_puesto) faltantes.push('puesto/oficio')
  // obra_centro es opcional
  if (!c.equipos.length) faltantes.push('al menos un equipo autorizado')
  return faltantes
}

function generarCamposAcuerdo({
  empresa, empresa_logo_b64, empleado, tipo,
}: { empresa: any; empresa_logo_b64: string | null; empleado: any; tipo: 'acuerdo_con_acceso' | 'acuerdo_sin_acceso' }): CamposAcuerdoConfidencialidad {
  const hoy = new Date()
  const dd = String(hoy.getDate()).padStart(2, '0')
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const yyyy = hoy.getFullYear()
  const nombreCompleto = [empleado.nombre, empleado.apellidos].filter(Boolean).join(' ')

  return {
    empresa_nombre: empresa.nombre ?? '',
    empresa_nif: empresa.nif ?? '',
    empresa_representante: empresa.representante_nombre ?? '',
    empresa_representante_nif: empresa.representante_nif ?? '',
    empresa_domicilio: empresa.domicilio ?? '',
    empresa_localidad: empresa.localidad ?? '',
    empresa_email: empresa.email ?? '',
    empresa_color: empresa.color_primario ?? '#1a56db',
    empresa_logo_b64,
    empleado_nombre: nombreCompleto,
    empleado_dni: empleado.dni ?? '',
    fecha_emision: `${dd}/${mm}/${yyyy}`,
    tipo: tipo === 'acuerdo_con_acceso' ? 'con_acceso' : 'sin_acceso',
  }
}

function validarCamposAcuerdo(c: CamposAcuerdoConfidencialidad): string[] {
  const faltantes: string[] = []
  if (!c.empleado_nombre) faltantes.push('nombre del empleado')
  if (!c.empleado_dni) faltantes.push('DNI/NIE del empleado')
  if (!c.empresa_nif) faltantes.push('NIF de la empresa (configurar en /admin/cuenta)')
  if (!c.empresa_representante) faltantes.push('representante legal de la empresa (configurar en /admin/cuenta)')
  if (!c.empresa_representante_nif) faltantes.push('NIF del representante (configurar en /admin/cuenta)')
  if (!c.empresa_domicilio) faltantes.push('domicilio de la empresa (configurar en /admin/cuenta)')
  return faltantes
}
