import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { acuerdosAsegura, companiasAsegura, interpretarCompanias, type Compania, type Contacto } from '@/lib/companias-asegura'
import { interpretarAcuerdos, type RespuestaAcuerdos } from '@/lib/acuerdos-asegura'
import { ChipsAcuerdos } from './AcuerdosVista'
import { etiquetaArea } from '@central/module-seguros'
import { PageHeader, Pagina } from '@/components/ui'
import TelefonoContacto from './TelefonoContacto'

export const dynamic = 'force-dynamic'

/**
 * Directorio de contacto por compañía, como página propia (12/09/2026): Alberto
 * quería llegar a esto desde el `+` de la cabecera, no buscarlo dentro de la
 * pestaña Datos. Misma fuente que `Companias.tsx` (que se queda montado ahí,
 * como referencia rápida); aquí se pinta en tarjetas, una por compañía, con
 * TODOS sus contactos (desde el 13/09/2026 una compañía puede tener varios)
 * y los botones de WhatsApp y correo a mano.
 *
 * Desde el 06/10/2026 (fase 2 de acuerdos con compañías) cada tarjeta lleva
 * también sus claves y acuerdos y enlaza a la ficha `/correduria/companias/[codigo]`;
 * salen además las compañías con acuerdo aunque aún no tengan contacto.
 */
export default async function CompaniasPage() {
  const [{ status, json }, acu] = await Promise.all([companiasAsegura(), acuerdosAsegura()])
  const r = interpretarCompanias(status, json)
  const acuerdos = interpretarAcuerdos(acu.status, acu.json)

  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
          <PageHeader
            titulo="Compañías"
            icono={<Building2 size={20} strokeWidth={1.75} />}
            sub="Contactos, claves y acuerdos de cada aseguradora. Contactos minados del correo de Alberto — no es la ficha oficial de la compañía."
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
          <ListaCompanias companias={r.companias} acuerdos={acuerdos} />
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

function ListaCompanias({ companias, acuerdos }: { companias: Compania[]; acuerdos: RespuestaAcuerdos }) {
  const conAcuerdo = new Set(acuerdos.estado === 'ok' ? acuerdos.acuerdos.map((a) => a.companiaCodigoDgs) : [])
  const conContacto = companias.filter((c) => c.contactos.length > 0 || conAcuerdo.has(c.codigoDgs))
  const sinContacto = companias.filter((c) => !conContacto.includes(c))

  return (
    <>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        {conContacto.length} de {companias.length} compañías con contacto o acuerdo.
      </p>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
        {conContacto.map((c) => (
          <TarjetaCompania key={c.codigoDgs} c={c} acuerdos={acuerdos} />
        ))}
      </div>

      {sinContacto.length > 0 && (
        <div style={tarjeta}>
          <h2 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>{acuerdos.estado === 'ok' ? 'Sin contacto ni acuerdo todavía' : 'Sin contacto (acuerdos aún sin comprobar)'}</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {sinContacto.map((c) => c.nombreComun).join(' · ')}
          </p>
        </div>
      )}
    </>
  )
}

function TarjetaCompania({ c, acuerdos }: { c: Compania; acuerdos: RespuestaAcuerdos }) {
  return (
    <div style={{ ...tarjeta, display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          <Link href={`/correduria/companias/${encodeURIComponent(c.codigoDgs)}`}>{c.nombreComun} →</Link>
        </h2>
        {c.claveMediador && (
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            Mediador {c.claveMediador}
          </span>
        )}
      </div>

      <ChipsAcuerdos codigo={c.codigoDgs} r={acuerdos} />

      {c.contactos.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Sin contacto todavía.</p>}
      {c.contactos.map((ct) => (
        <TarjetaContacto key={ct.id} ct={ct} />
      ))}
    </div>
  )
}

function TarjetaContacto({ ct }: { ct: Contacto }) {
  return (
    <div style={{ display: 'grid', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{ct.nombre}</div>
        {(ct.cargo || ct.area) && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {[ct.cargo, etiquetaArea(ct.area)].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {ct.email && (
        <div style={{ fontSize: 13 }}>
          <a href={`mailto:${ct.email}`} style={{ overflowWrap: 'anywhere' }}>{ct.email}</a>
        </div>
      )}

      <TelefonoContacto contactoId={ct.id} nombre={ct.nombre} telefono={ct.telefono} email={ct.email} />
    </div>
  )
}
