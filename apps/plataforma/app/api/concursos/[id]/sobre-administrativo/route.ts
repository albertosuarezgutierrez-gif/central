import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  documentosSobreAdministrativo,
  construirDeuc,
  construirDeclaracionResponsable,
} from '@central/module-concursos'
import type { Biblioteca, DatosIdentificacionEmpresa } from '@central/module-concursos'

// Genera el Sobre 1 (administrativo) + DEUC + declaración responsable de un
// concurso, cruzando su ficha con la biblioteca y el perfil de la empresa.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let empresa_id: string
  try { empresa_id = await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  const { id } = await params

  const con = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ficha FROM concursos WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
  `)
  if (!con[0]) return NextResponse.json({ error: 'Concurso no encontrado' }, { status: 404 })
  const ficha = con[0].ficha

  const bibRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT tipo, nombre, vigencia_hasta FROM biblioteca_documentos WHERE empresa_id = ${empresa_id}::uuid
  `)
  const biblioteca: Biblioteca = bibRows.map(d => ({
    tipo: d.tipo, nombre: d.nombre, vigencia_hasta: d.vigencia_hasta ?? undefined,
  }))

  const perRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT razon_social, nif, domicilio, representante, representante_dni, email, telefono, es_pyme
    FROM concursos_perfil_empresa WHERE empresa_id = ${empresa_id}::uuid
  `)
  const p = perRows[0]
  const empresa: DatosIdentificacionEmpresa = {
    razon_social: p?.razon_social ?? '', nif: p?.nif ?? '',
    domicilio: p?.domicilio ?? undefined, representante: p?.representante ?? undefined,
    representante_dni: p?.representante_dni ?? undefined, email: p?.email ?? undefined,
    telefono: p?.telefono ?? undefined, es_pyme: p?.es_pyme ?? true,
  }

  const hoy = new Date().toISOString().slice(0, 10)
  return NextResponse.json({
    sobre: documentosSobreAdministrativo(ficha, biblioteca),
    deuc: construirDeuc(empresa, ficha, hoy),
    declaracion: construirDeclaracionResponsable(empresa, ficha, hoy),
    perfil_completo: Boolean(p?.razon_social && p?.nif),
  })
}
