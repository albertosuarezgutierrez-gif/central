'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PhoneCall } from 'lucide-react'
import { eur } from '@/lib/dinero'
import { MOTIVOS_PUERTO, type EnRiesgo, type Impagados } from '@/lib/correduria-puerto'
import { urlRetarificar } from '@/lib/ficha-asegura'
import { BtnLink, Badge, type Tono } from '@/components/ui'
import Bloque from './Bloque'

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
 * ─── 🚨 Y lo que NO se puede decir de una fila ─────────────────────────────
 * «Sin cobertura» solo se pinta sobre un recibo que la compañía dice haber
 * DEVUELTO. Un recibo que simplemente no consta cobrado es un dato que falta,
 * no un impago, y va en «Sin confirmar»: se mira en el portal de la compañía,
 * no se llama al cliente a decirle que no está asegurado. Caso fundacional
 * 03/09/2026 en la cabecera de `retencion.ts`.
 *
 * ─── Lo que esta lista NO puede decir ──────────────────────────────────────
 * Que esté vacía no significa que esté todo cobrado: hay pólizas vivas de las
 * que la compañía no ha mandado ni un recibo, y de esas no se sabe nada. Se
 * cuentan aparte, debajo, porque son el hueco de verdad.
 *
 * ─── Por qué ya no pinta su propia caja (03/09/2026) ───────────────────────
 * El marco propio (borde + radio 12 + padding 14) se repetía en seis bloques
 * apilados y ninguno decía «mírame a mí primero». Ahora el envoltorio es
 * `Bloque`, y la CAJA se reserva para la alarma: `destacado` solo cuando hay
 * alguien esperando al otro lado del teléfono. Con la cola vacía —o sin poder
 * leerla— no se destaca nada.
 */

// El estado se lee por la FORMA de la píldora, no por un círculo de color: los
// emojis se pintan distinto en cada sistema y 🟠 y 🟡 son indistinguibles a
// 12px, que es justo donde estaba la diferencia entre «circula sin seguro» y
// «todavía está cubierto».
const ESTILO: Record<EnRiesgo['estado'], { label: string; tono: Tono; color: string }> = {
  suspendida: { label: 'Sin cobertura', tono: 'negativo', color: 'var(--negative)' },
  // Venció y no consta cobrado, pero NADIE ha dicho que se devolviera.
  sin_confirmar: { label: 'Sin confirmar', tono: 'aviso', color: 'var(--warning)' },
  sin_fecha: { label: 'Sin fecha', tono: 'aviso', color: 'var(--warning)' },
  en_plazo: { label: 'Aún cubierto', tono: 'aviso', color: 'var(--warning)' },
  extinguida: { label: 'Extinguida', tono: 'neutral', color: 'var(--border)' },
}

// El ramo va con su NOMBRE, no con un pictograma: 🏍️ y 🚗 se confunden a
// tamaño de lista, y ⚱️ ni siquiera se pinta en todos los sistemas.
const TIPOS: Record<string, string> = {
  auto: 'Auto', moto: 'Moto', hogar: 'Hogar', vida: 'Vida', salud: 'Salud',
  decesos: 'Decesos', responsabilidad_civil: 'R. Civil', comercio: 'Comercio',
  comunidades: 'Comunidades',
}

const POR_PAGINA = 25

export default function Retencion({
  onContador,
  primero,
}: {
  /**
   * Cuántas pólizas en riesgo quedan por gestionar, para el contador de la
   * sección. `null` = «no se ha podido leer» y JAMÁS 0: un 0 aquí afirma que
   * no hay nadie a quien llamar, que es la mentira cara de esta pantalla.
   */
  onContador?: (n: number | null) => void
  primero?: boolean
}) {
  const [datos, setDatos] = useState<Impagados | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  // El aviso viaja por REF: si el padre pasa una lambda nueva en cada render,
  // meterla en las dependencias del efecto relanzaría el fetch en bucle.
  const avisar = useRef(onContador)
  avisar.current = onContador

  useEffect(() => {
    fetch('/api/correduria/impagados')
      .then((r) => r.json())
      .then((d: Impagados) => {
        setDatos(d)
        // Una sola vez por carga, y nunca en el cuerpo del render.
        avisar.current?.(d.estado === 'ok' ? d.filas.length : null)
      })
      .catch(() => {
        setDatos({ estado: 'error', motivo: 'red' })
        avisar.current?.(null)
      })
  }, [])

  if (datos === null) {
    return (
      <Bloque titulo="A quién llamar hoy" Icono={PhoneCall} primero={primero}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</span>
      </Bloque>
    )
  }

  if (datos.estado === 'sin_configurar') {
    return (
      <Bloque titulo="A quién llamar hoy" Icono={PhoneCall} primero={primero}>
        <p style={pMuted}>
          ⏳ El puerto con asegura no está conectado. <strong>No lo leas como «no hay nadie a quien
          llamar»</strong>: es que desde aquí no se puede mirar.
        </p>
      </Bloque>
    )
  }

  if (datos.estado === 'error') {
    return (
      <Bloque titulo="A quién llamar hoy" Icono={PhoneCall} tono="malo" primero={primero}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          ⚠️ No se ha podido leer: {MOTIVOS_PUERTO[datos.motivo]} <strong>No significa que esté
          todo cobrado.</strong>
        </p>
      </Bloque>
    )
  }

  const { filas, resumen } = datos
  const visibles = filas.slice(0, ver)
  const hayTrabajo = filas.length > 0

  return (
    <Bloque
      titulo={
        hayTrabajo
          ? `Hay que llamar · ${filas.length} póliza(s) en riesgo`
          : 'Nadie con recibos sin cobrar'
      }
      // La letra pequeña que CALIFICA el titular: sin ella, «3 pólizas en
      // riesgo» no dice qué se está contando ni por qué ese orden.
      sub="Recibos devueltos y vencidos sin cobrar, ordenados por el reloj (art. 15 LCS) y no por el importe: pagar devuelve la cobertura en 24 horas, pero a los seis meses el contrato ya no se rescata."
      Icono={PhoneCall}
      tono={resumen.suspendidas > 0 ? 'malo' : hayTrabajo ? 'aviso' : 'neutral'}
      // Caja tintada SOLO cuando hay alguien esperando al otro lado. Si todo
      // destaca, no destaca nada.
      destacado={hayTrabajo}
      primero={primero}
      accion={
        hayTrabajo && (
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
      {/* 🚨 Este cartel afirma que alguien no tiene seguro, así que solo cuenta
          los impagos que la compañía CONFIRMA. Ver `resumen.sinConfirmar`. */}
      {resumen.suspendidas > 0 && (
        <div
          style={{
            border: '1px solid var(--negative)', borderRadius: 8, padding: '10px 12px',
            marginBottom: 12, fontSize: 13, lineHeight: 1.5,
          }}
        >
          <Badge tono="negativo">Sin cobertura</Badge>{' '}
          <strong>{resumen.suspendidas} cliente(s) circulan sin cobertura y probablemente no lo
          saben.</strong> Si pagan, vuelven a estar cubiertos en 24 horas — por eso esta llamada es
          la primera del día.
        </div>
      )}

      {resumen.sinConfirmar > 0 && (
        <div
          style={{
            border: '1px solid var(--warning)', borderRadius: 8, padding: '10px 12px',
            marginBottom: 12, fontSize: 13, lineHeight: 1.5,
          }}
        >
          <Badge tono="aviso">Sin confirmar</Badge>{' '}
          <strong>{resumen.sinConfirmar} recibo(s) vencidos sin noticia de la compañía.</strong>{' '}
          No consta que se cobraran, pero <strong>tampoco que se devolvieran</strong>: puede que
          estén pagados y falte el fichero. Se comprueban en el portal de la aseguradora —{' '}
          <strong>no se llama al cliente a decirle que no tiene cobertura.</strong>
        </div>
      )}

      {filas.length === 0 ? (
        <p style={pMuted}>
          Ningún recibo devuelto ni vencido sin cobrar. Ojo con lo de abajo: no es lo mismo que
          «está todo pagado».
        </p>
      ) : (
        <>
          {/* Cards apiladas: esto se trabaja con el teléfono en la mano, y el
              botón de llamar tiene que ser táctil. La plantilla del grid es
              obligatoria — sin ella la pista implícita se dimensiona con el
              contenido más ancho y arrastra la página entera en móvil. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            {visibles.map((f) => (
              <Fila key={f.polizaId} f={f} />
            ))}
          </div>
          {ver < filas.length && (
            <button
              onClick={() => setVer((v) => v + POR_PAGINA)}
              style={{
                marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Ver {Math.min(POR_PAGINA, filas.length - ver)} más
            </button>
          )}
        </>
      )}

      <Huecos datos={datos} />
    </Bloque>
  )
}

function Fila({ f }: { f: EnRiesgo }) {
  const e = ESTILO[f.estado]
  return (
    <div
      style={{
        border: '1px solid var(--border)', borderLeft: `4px solid ${e.color}`,
        borderRadius: 8, padding: 12, minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Link href={`/correduria/cliente/${f.clienteId}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {f.cliente}
        </Link>
        <Badge tono={e.tono}>
          {e.label}
          {f.dias !== null && ` · hace ${f.dias} día(s)`}
        </Badge>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
        {TIPOS[f.tipo] ?? f.tipo} · {f.aseguradora}
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
            {f.telefonoIlegible ? 'Teléfono cifrado, no legible' : 'Sin teléfono'}
          </span>
        )}

        {/* Retener «en otra compañía» es pedir precio de calle, y eso gasta
            0,50€ reales — así que sigue habiendo una pantalla de confirmación
            delante. Lo que cambia desde el 03/09/2026 es DÓNDE: era un salto a
            asegura (otro dominio, otra sesión → 307 al login, medido en
            producción) y ahora es interna, en /correduria. Por eso tampoco
            abre pestaña nueva. Hogar todavía no está portado y `urlRetarificar`
            manda a una pantalla que reenvía a asegura, que es donde funciona. */}
        {f.retarificable && (
          <BtnLink href={urlRetarificar(f.polizaId)} variante="secundario">
            {f.retarificacion?.ramo === 'hogar' ? 'Precio de hogar en otra compañía' : 'Precio en otra compañía'}
          </BtnLink>
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
