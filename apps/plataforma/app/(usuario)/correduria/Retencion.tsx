'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { eur } from '@/lib/dinero'
import { MOTIVOS_PUERTO, type EnRiesgo, type Impagados } from '@/lib/correduria-puerto'
import { BtnLink } from '@/components/ui'

/**
 * 📞 A quién hay que llamar hoy: los recibos devueltos y los vencidos sin
 * cobrar, ordenados por el RELOJ y no por el importe.
 *
 * ─── Por qué el reloj manda sobre el dinero ────────────────────────────────
 * Un recibo devuelto no avisa a nadie. Al mes la cobertura queda suspendida
 * (art. 15 LCS) y el cliente lo descubre el día que tiene un accidente. A los
 * seis meses el contrato se extingue y ya no se rescata: retenerlo pasa a ser
 * una póliza nueva. En medio hay una ventana en la que **pagar devuelve la
 * cobertura en 24 horas**, y ese es todo el trabajo. Una póliza de 200€ a la
 * que le quedan tres días vale más que una de 800€ devuelta ayer.
 *
 * ─── Lo que esta lista NO puede decir ──────────────────────────────────────
 * Que esté vacía no significa que esté todo cobrado: hay pólizas vivas de las
 * que la compañía no ha mandado ni un recibo, y de esas no se sabe nada. Se
 * cuentan aparte, debajo, porque son el hueco de verdad.
 */
const ESTILO: Record<EnRiesgo['estado'], { icono: string; label: string; color: string }> = {
  suspendida: { icono: '🔴', label: 'Sin cobertura', color: '#d66' },
  sin_fecha: { icono: '❔', label: 'Sin fecha', color: '#c96' },
  en_plazo: { icono: '🟡', label: 'Aún cubierto', color: '#c96' },
  extinguida: { icono: '⚫', label: 'Extinguida', color: 'var(--muted)' },
}

const TIPOS: Record<string, string> = {
  auto: '🚗', moto: '🏍️', hogar: '🏠', vida: '🧬', salud: '🩺',
  decesos: '⚱️', responsabilidad_civil: '⚖️', comercio: '🏪', comunidades: '🏢',
}

const POR_PAGINA = 25

export default function Retencion({ urlAsegura }: { urlAsegura: string }) {
  const [datos, setDatos] = useState<Impagados | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  useEffect(() => {
    fetch('/api/correduria/impagados')
      .then((r) => r.json())
      .then(setDatos)
      .catch(() => setDatos({ estado: 'error', motivo: 'red' }))
  }, [])

  if (datos === null) {
    return <Marco><span style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</span></Marco>
  }

  if (datos.estado === 'sin_configurar') {
    return (
      <Marco>
        <p style={pMuted}>
          ⏳ El puerto con asegura no está conectado. <strong>No lo leas como «no hay nadie a quien
          llamar»</strong>: es que desde aquí no se puede mirar.
        </p>
      </Marco>
    )
  }

  if (datos.estado === 'error') {
    return (
      <Marco>
        <p style={{ ...pMuted, color: '#d66' }}>
          ⚠️ No se ha podido leer: {MOTIVOS_PUERTO[datos.motivo]} <strong>No significa que esté
          todo cobrado.</strong>
        </p>
      </Marco>
    )
  }

  const { filas, resumen } = datos
  const visibles = filas.slice(0, ver)

  return (
    <Marco
      titulo={
        filas.length === 0
          ? '📞 Nadie con recibos sin cobrar'
          : `📞 Hay que llamar · ${filas.length} póliza(s) en riesgo`
      }
      extra={
        filas.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {resumen.primaEnRiesgo === null ? (
              <span title="Ninguna de estas pólizas informa la prima">prima en juego sin dato</span>
            ) : (
              <>{eur(resumen.primaEnRiesgo)} en juego</>
            )}
            {resumen.sinPrima > 0 && ` · ${resumen.sinPrima} sin prima informada`}
          </span>
        )
      }
    >
      {resumen.suspendidas > 0 && (
        <div
          style={{
            border: '1px solid #d66', borderRadius: 8, padding: '10px 12px',
            marginBottom: 12, fontSize: 13, lineHeight: 1.5,
          }}
        >
          🔴 <strong>{resumen.suspendidas} cliente(s) circulan sin cobertura y probablemente no lo
          saben.</strong> Si pagan, vuelven a estar cubiertos en 24 horas — por eso esta llamada es
          la primera del día.
        </div>
      )}

      {filas.length === 0 ? (
        <p style={pMuted}>
          Ningún recibo devuelto ni vencido sin cobrar. Ojo con lo de abajo: no es lo mismo que
          «está todo pagado».
        </p>
      ) : (
        <>
          {/* Cards apiladas en móvil, tabla en escritorio: esto se trabaja con
              el teléfono en la mano, y el botón de llamar tiene que ser táctil. */}
          <div style={{ display: 'grid', gap: 8 }}>
            {visibles.map((f) => (
              <Fila key={f.polizaId} f={f} urlAsegura={urlAsegura} />
            ))}
          </div>
          {ver < filas.length && (
            <button
              onClick={() => setVer((v) => v + POR_PAGINA)}
              style={{
                marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 8,
                border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Ver {Math.min(POR_PAGINA, filas.length - ver)} más
            </button>
          )}
        </>
      )}

      <Huecos datos={datos} />
    </Marco>
  )
}

function Fila({ f, urlAsegura }: { f: EnRiesgo; urlAsegura: string }) {
  const e = ESTILO[f.estado]
  return (
    <div
      style={{
        border: '1px solid var(--border)', borderLeft: `4px solid ${e.color}`,
        borderRadius: 8, padding: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Link href={`/correduria/cliente/${f.clienteId}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {f.cliente}
        </Link>
        <span style={{ color: e.color, fontSize: 12, fontWeight: 600 }}>
          {e.icono} {e.label}
          {f.dias !== null && ` · hace ${f.dias} día(s)`}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
        {TIPOS[f.tipo] ?? '📄'} {f.tipo} · {f.aseguradora}
        {f.matricula && ` · ${f.matricula}`}
        {f.numeroPoliza && ` · nº ${f.numeroPoliza}`}
        {' · '}
        {/* Un importe que no se ha podido leer NO se pinta como 0,00€: en una
            cola de impagados eso diría «no debe nada». */}
        {f.importeRecibo === null ? (
          <span title="El importe del recibo llegó en un formato que no se ha podido leer">
            recibo sin importe legible
          </span>
        ) : (
          <>recibo de {eur(f.importeRecibo)}</>
        )}
        {f.prima !== null && ` · prima ${eur(f.prima)}`}
      </div>

      <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>{f.accion}</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {f.telefono ? (
          <BtnLink href={`tel:${f.telefono.replace(/\s/g, '')}`} variante="secundario">
            📞 {f.telefono}
          </BtnLink>
        ) : (
          <span
            style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}
            title={
              f.telefonoIlegible
                ? 'El teléfono está guardado pero cifrado con otra clave: no se puede leer desde aquí'
                : 'No consta teléfono en su ficha'
            }
          >
            📞 {f.telefonoIlegible ? 'cifrado, no legible' : 'sin teléfono'}
          </span>
        )}

        {/* Retener «en otra compañía» es pedir precio de calle, y eso gasta
            0,50€ reales: vive en asegura, tras su pantalla de confirmación. */}
        {f.retarificable && (
          <a
            href={`${urlAsegura}/cartera/poliza/${f.polizaId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px',
              borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600,
            }}
          >
            Precio en otra compañía ↗
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * Los dos huecos que hacen que esta lista NO sea la foto completa de lo que
 * está sin cobrar. Sin decirlos, una cola vacía se lee como «todo al día».
 */
function Huecos({ datos }: { datos: Extract<Impagados, { estado: 'ok' }> }) {
  const partes: string[] = []
  if (datos.sinRecibosInformados > 0) {
    partes.push(
      `${datos.sinRecibosInformados} póliza(s) vivas no tienen NINGÚN recibo informado por la ` +
        'compañía: de esas no se sabe si están pagadas',
    )
  }
  if (datos.pendientesSinJuzgar > 0) {
    partes.push(
      `${datos.pendientesSinJuzgar} recibo(s) pendientes aún no han vencido o no traen fecha`,
    )
  }
  // -1 = la versión desplegada de asegura no manda el campo. Es distinto de 0.
  if (datos.sinRecibosInformados < 0) {
    partes.push('asegura todavía no informa cuántas pólizas están sin recibos')
  }
  if (partes.length === 0) return null
  return (
    <p style={{ ...pMuted, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      ⚠️ Esto no es todo lo que puede estar sin cobrar: {partes.join(' · ')}.
    </p>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }

function Marco({
  titulo,
  extra,
  children,
}: {
  titulo?: string
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      {titulo && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{titulo}</div>
          {extra}
        </div>
      )}
      {children}
    </div>
  )
}
