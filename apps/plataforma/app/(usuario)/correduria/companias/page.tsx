import Link from 'next/link'
import { Building2, Mail } from 'lucide-react'
import { companiasAsegura, interpretarCompanias, type Compania } from '@/lib/companias-asegura'
import { PageHeader } from '@/components/ui'
import BotonWhatsapp from '../BotonWhatsapp'

export const dynamic = 'force-dynamic'

/**
 * Directorio de contacto por compañía, como página propia (12/09/2026): Alberto
 * quería llegar a esto desde el `+` de la cabecera, no buscarlo dentro de la
 * pestaña Datos. Misma fuente que `Companias.tsx` (que se queda montado ahí,
 * como referencia rápida); aquí se pinta en tarjetas, una por compañía, con
 * los botones de WhatsApp y correo a mano.
 */
export default async function CompaniasPage() {
  const { status, json } = await companiasAsegura()
  const r = interpretarCompanias(status, json)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo="Contactos por compañía"
          icono={<Building2 size={20} strokeWidth={1.75} />}
          sub="A quién llamar o escribir en cada aseguradora. Minado del correo de Alberto — no es la ficha oficial de la compañía."
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
        <ListaCompanias companias={r.companias} />
      )}
    </div>
  )
}

const tarjeta: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  background: 'var(--surface)',
}

function ListaCompanias({ companias }: { companias: Compania[] }) {
  const conContacto = companias.filter((c) => c.contactoNombre || c.contactoEmail || c.contactoTelefono)
  const sinContacto = companias.filter((c) => !c.contactoNombre && !c.contactoEmail && !c.contactoTelefono)

  return (
    <>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        {conContacto.length} de {companias.length} compañías con un contacto conocido.
      </p>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {conContacto.map((c) => (
          <TarjetaCompania key={c.codigoDgs} c={c} />
        ))}
      </div>

      {sinContacto.length > 0 && (
        <div style={tarjeta}>
          <h2 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Sin contacto todavía</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {sinContacto.map((c) => c.nombreComun).join(' · ')}
          </p>
        </div>
      )}
    </>
  )
}

function TarjetaCompania({ c }: { c: Compania }) {
  return (
    <div style={{ ...tarjeta, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{c.nombreComun}</h2>
        {c.claveMediador && (
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            Mediador {c.claveMediador}
          </span>
        )}
      </div>

      {c.contactoNombre && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.contactoNombre}</div>
          {c.contactoCargo && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.contactoCargo}</div>}
        </div>
      )}

      {(c.contactoEmail || c.contactoTelefono) && (
        <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          {c.contactoEmail && (
            <a href={`mailto:${c.contactoEmail}`} style={{ overflowWrap: 'anywhere' }}>{c.contactoEmail}</a>
          )}
          {c.contactoTelefono && (
            <a href={`tel:${c.contactoTelefono.replace(/[^0-9+]/g, '')}`}>{c.contactoTelefono}</a>
          )}
        </div>
      )}

      {(c.contactoTelefono || c.contactoEmail) && (
        <div style={{ display: 'flex', gap: 6 }}>
          {c.contactoTelefono && <BotonWhatsapp telefono={c.contactoTelefono} />}
          {c.contactoEmail && (
            <a
              href={`mailto:${c.contactoEmail}`}
              aria-label={`Escribir a ${c.nombreComun}`}
              title={`Escribir a ${c.nombreComun}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 44, height: 44, borderRadius: 10,
                border: '1px solid var(--border)', color: 'var(--text)',
              }}
            >
              <Mail size={18} strokeWidth={1.75} aria-hidden />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
