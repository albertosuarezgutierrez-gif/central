import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { acuerdosAsegura, companiasAsegura, interpretarCompanias, productividadAsegura } from '@/lib/companias-asegura'
import { interpretarAcuerdos, interpretarProductividad } from '@/lib/acuerdos-asegura'
import ListaCompanias from './ListaCompanias'
import { PageHeader, Pagina } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Directorio de contacto por compañía, como página propia (12/09/2026): Alberto
 * quería llegar a esto desde el `+` de la cabecera, no buscarlo dentro de la
 * pestaña Datos. Misma fuente que `Companias.tsx` (que se queda montado ahí,
 * como referencia rápida); aquí se pinta con el panel de objetivos y la lista plegable, con
 * TODOS sus contactos (desde el 13/09/2026 una compañía puede tener varios)
 * y los botones de WhatsApp y correo a mano.
 *
 * Desde el 06/10/2026 (fase 2 de acuerdos con compañías) cada tarjeta lleva
 * también sus claves y acuerdos y enlaza a la ficha `/correduria/companias/[codigo]`;
 * salen además las compañías con acuerdo aunque aún no tengan contacto.
 */
export default async function CompaniasPage() {
  const [{ status, json }, acu, prod] = await Promise.all([companiasAsegura(), acuerdosAsegura(), productividadAsegura(null)])
  const r = interpretarCompanias(status, json)
  const acuerdos = interpretarAcuerdos(acu.status, acu.json)
  const productividad = interpretarProductividad(prod.status, prod.json)

  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
          <PageHeader
            titulo="Compañías"
            icono={<Building2 size={20} strokeWidth={1.75} />}
            sub="Producción y objetivos frente a los acuerdos, y contactos de cada aseguradora (minados del correo de Alberto — no es la ficha oficial de la compañía)."
          />
        </div>

        {r.estado !== 'ok' ? (
          <div style={tarjeta}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              No se ha podido comprobar el directorio. No significa que esté vacío.
              {r.estado === 'error' && <> <strong>{r.motivo}</strong></>}
              {r.estado === 'sin_configurar' && <> Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto.</>}
            </p>
          </div>
        ) : (
          <ListaCompanias companias={r.companias} acuerdos={acuerdos} productividad={productividad} />
        )}
      </div>
    </Pagina>
  )
}

const tarjeta: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  background: 'var(--surface)',
}
