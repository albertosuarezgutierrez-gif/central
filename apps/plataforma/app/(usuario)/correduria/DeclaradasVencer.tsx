'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PhoneOutgoing } from 'lucide-react'
import { MOTIVOS_PUERTO } from '@/lib/correduria-puerto'
import type { DeclaradasVencerAsegura, DeclaradaPorVencer } from '@/lib/cartera-asegura'
import { Badge } from '@/components/ui'
import Bloque from './Bloque'
import AccionesContacto from './AccionesContacto'

/**
 * 📞 Venta cruzada: pólizas que un cliente tiene con OTRA compañía (las que
 * declara en la bóveda de su portal) y que vencen dentro de poco.
 *
 * ─── Por qué esto es una llamada de Alberto, no un precio automático ───────
 * La idea inicial era comparar el precio declarado contra la cartera propia
 * por compañía/ramo. Con 110 pólizas vivas repartidas en 4 ramos, esa
 * comparación casi siempre se apoyaría en 1-2 pólizas — una media con esa
 * muestra es un número plausible y falso, no un dato (ver
 * `docs/CORREDURIA-INTRANET-IDEAS.md`, idea F). Alberto: «datos minúsculos,
 * mejor avisarme dos meses antes para yo venderle… luego será automático».
 * Así que esto NO tarifica nada: es una lista de a quién llamar antes de que
 * la póliza se renueve sola con la compañía de siempre.
 *
 * ─── El hueco que esta lista declara ───────────────────────────────────────
 * Una declarada nace de una identidad del portal, no de una ficha: si esa
 * identidad no está vinculada a ningún cliente de esta correduría no hay
 * nombre ni teléfono al que llamar. Se cuenta aparte (`sinVincular`) en vez
 * de desaparecer sin más — sería el mismo «no lo sé» disfrazado de «no hay».
 */

const POR_PAGINA = 25

export default function DeclaradasVencer({
  onContador,
  primero,
}: {
  /** `null` = no se ha podido leer, JAMÁS 0: un 0 aquí diría «nadie tiene
   *  nada que renovar con otra compañía», que aquí no se sabe. */
  onContador?: (n: number | null) => void
  primero?: boolean
}) {
  const [datos, setDatos] = useState<DeclaradasVencerAsegura | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  const avisar = useRef(onContador)
  avisar.current = onContador

  useEffect(() => {
    fetch('/api/correduria/declaradas-vencer?dias=60')
      .then((r) => r.json())
      .then((d: DeclaradasVencerAsegura) => {
        setDatos(d)
        avisar.current?.(d.estado === 'ok' ? d.declaradas.length : null)
      })
      .catch(() => {
        setDatos({ estado: 'error', motivo: 'red' })
        avisar.current?.(null)
      })
  }, [])

  if (datos === null) {
    return (
      <Bloque titulo="Otras compañías por vencer" Icono={PhoneOutgoing} primero={primero}>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</span>
      </Bloque>
    )
  }

  if (datos.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Otras compañías por vencer" Icono={PhoneOutgoing} primero={primero}>
        <p style={pMuted}>
          ⏳ El puerto con asegura no está conectado. No lo leas como «no hay nada que renovar»: es
          que desde aquí no se puede mirar.
        </p>
      </Bloque>
    )
  }

  if (datos.estado === 'error') {
    return (
      <Bloque titulo="Otras compañías por vencer" Icono={PhoneOutgoing} tono="malo" primero={primero}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          ⚠️ No se ha podido leer: {MOTIVOS_PUERTO[datos.motivo]} No significa que no venza nada.
        </p>
      </Bloque>
    )
  }

  const { declaradas, sinVincular } = datos
  const visibles = declaradas.slice(0, ver)
  const hayTrabajo = declaradas.length > 0

  return (
    <Bloque
      titulo={
        hayTrabajo
          ? `Vende antes de que renueven · ${declaradas.length} póliza(s)`
          : 'Ninguna declarada vence pronto'
      }
      sub="Pólizas que el cliente tiene con otra compañía, declaradas en su portal, dentro de los próximos 60 días. No hay precio que comparar (muestra insuficiente): llama tú antes de que se renueve sola."
      Icono={PhoneOutgoing}
      tono={hayTrabajo ? 'aviso' : 'neutral'}
      destacado={hayTrabajo}
      primero={primero}
    >
      {declaradas.length === 0 ? (
        <p style={pMuted}>Ninguna póliza declarada de otra compañía vence en los próximos 60 días.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            {visibles.map((d) => (
              <Fila key={d.id} d={d} />
            ))}
          </div>
          {ver < declaradas.length && (
            <button
              onClick={() => setVer((v) => v + POR_PAGINA)}
              style={{
                marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Ver {Math.min(POR_PAGINA, declaradas.length - ver)} más
            </button>
          )}
        </>
      )}

      {sinVincular > 0 && (
        <p style={{ ...pMuted, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          ⚠️ Además hay {sinVincular} póliza(s) declarada(s) en esta ventana cuya identidad del portal
          todavía no está vinculada a ninguna ficha: no hay a quién llamar todavía.
        </p>
      )}
    </Bloque>
  )
}

function Fila({ d }: { d: DeclaradaPorVencer }) {
  const [y, m, dia] = d.fechaVencimiento.split('-')
  const fecha = dia && m && y ? `${dia}/${m}/${y}` : d.fechaVencimiento
  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: '4px solid var(--warning)', borderRadius: 8, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Link href={`/correduria/cliente/${d.clienteId}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {d.cliente}
        </Link>
        <AccionesContacto
          telefono={d.contacto?.telefono ?? null}
          ilegible={d.contacto?.telefonoIlegible ?? false}
          quien={d.cliente}
        />
        <Badge tono="aviso">
          {d.dias === 0 ? 'vence hoy' : d.dias === 1 ? 'vence mañana' : `vence en ${d.dias} días`}
        </Badge>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
        {d.ramo ?? 'ramo sin declarar'} · {d.compania ?? 'compañía sin declarar'}
        {d.numeroPoliza && ` · nº ${d.numeroPoliza}`}
        {' · vence '}{fecha}
      </div>
      {!d.contacto?.telefono && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          {d.contacto?.telefonoIlegible ? 'Teléfono cifrado, no legible' : 'Sin teléfono en su ficha'}
        </div>
      )}
    </div>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
