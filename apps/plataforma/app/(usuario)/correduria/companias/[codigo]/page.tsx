import Link from 'next/link'
import { Building2 } from 'lucide-react'
import type { LineaComision } from '@central/module-seguros'
import { PageHeader, Pagina } from '@/components/ui'
import {
  acuerdosAsegura,
  comisionesPactadasAsegura,
  companiasAsegura,
  interpretarCompanias,
  productividadAsegura,
} from '@/lib/companias-asegura'
import { interpretarAcuerdos, interpretarProductividad } from '@/lib/acuerdos-asegura'
import FichaCompania, { type ComisionRealDatos } from './FichaCompania'

export const dynamic = 'force-dynamic'

/**
 * Ficha de una compañía (06/10/2026, fase 2 de acuerdos): contactos, claves, acuerdos
 * (comisión por ramo, objetivos, letra pequeña, cotejo), producción del año y lo firmado
 * frente al % real de CIMA. Spec §4.2:
 * docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
 *
 * Cuatro lecturas independientes del puerto de asegura: si una falla, su bloque dice
 * «no se ha podido comprobar» y las demás se pintan igual.
 */
export default async function FichaCompaniaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: crudo } = await params
  const codigo = decodeURIComponent(crudo)
  const [dir, acu, prod, com] = await Promise.all([
    companiasAsegura(),
    acuerdosAsegura(),
    productividadAsegura(null),
    comisionesPactadasAsegura(),
  ])
  const directorio = interpretarCompanias(dir.status, dir.json)
  const compania = directorio.estado === 'ok' ? directorio.companias.find((c) => c.codigoDgs === codigo) ?? null : null

  return (
    <Pagina ancho="lectura">
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div>
        <Link href="/correduria/companias" style={{ fontSize: 13, color: 'var(--muted)' }}>← Compañías</Link>
        <PageHeader
          titulo={compania?.nombreComun ?? codigo}
          icono={<Building2 size={20} strokeWidth={1.75} />}
          sub={`Código DGS ${codigo}${compania?.claveMediador ? ` · mediador ${compania.claveMediador}` : ''}`}
        />
      </div>
      {directorio.estado !== 'ok' && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          No se ha podido comprobar el directorio de compañías. No significa que la compañía no exista.
        </p>
      )}
      {directorio.estado === 'ok' && !compania && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No hay ninguna compañía activa con el código {codigo}.</p>
      )}
      <FichaCompania
        codigo={codigo}
        compania={compania}
        acuerdos={interpretarAcuerdos(acu.status, acu.json)}
        productividad={interpretarProductividad(prod.status, prod.json)}
        comisionReal={leerComisionReal(com.status, com.json, codigo)}
      />
    </div>
    </Pagina>
  )
}

function leerComisionReal(status: number, json: unknown, codigo: string): ComisionRealDatos {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.lineas)) {
    return { estado: 'error', motivo: typeof o.causa === 'string' ? o.causa : `HTTP ${status}` }
  }
  return {
    estado: 'ok',
    lineas: (o.lineas as LineaComision[]).filter((l) => l?.companiaCodigo === codigo),
    truncado: o.truncado === true,
    sinProducto: typeof o.sinProducto === 'number' ? o.sinProducto : 0,
  }
}
