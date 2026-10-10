import Link from 'next/link'
import { Check } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { Ico, FILA } from '../../iconos'
import { valorLegible, type SolicitudDatos } from '@/lib/seguimiento-asegura'
import { fmt } from './piezas'

// Las respuestas de un enlace de datos (24/09/2026), sacadas de PedirDatos el 29/09/2026 para que
// las compartan la ficha del cliente y la pantalla del riesgo (datos de un familiar), sin duplicar.

/**
 * Lo que contestó una persona por el enlace de datos, con lo que subió y lo que no casa con sus
 * papeles. `quien` = «El cliente» o el nombre del familiar; `tarificar` = el atajo a pedir precio
 * (`null` donde ya hay otro camino, como la pantalla del riesgo).
 */
export function RespuestasSolicitud({ s, quien, tarificar }: { s: SolicitudDatos; quien: string; tarificar: { href: string; ramo: 'moto' | 'auto' } | null }) {
  return (
    <details open>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600, color: 'var(--positive)' }}>
        {quien} contestó{s.completada ? ` el ${fmt(s.completada.slice(0, 10))}` : ''}
      </summary>
      {s.ilegible || !s.respuestas ? (
        <div style={{ color: 'var(--negative)' }}>Sus respuestas no se pueden descifrar aquí (clave de datos personales).</div>
      ) : (
        <dl style={{ margin: '4px 0', display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px' }}>
          {s.campos.filter((c) => s.respuestas && c.clave in s.respuestas).map((c) => (
            <div key={c.clave} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--muted)' }}>{c.etiqueta}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{valorLegible(c, s.respuestas?.[c.clave])}</dd>
            </div>
          ))}
        </dl>
      )}
      <Verificacion s={s} />
      {tarificar && (
        <Link href={tarificar.href} style={{ ...btnStyle('primario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Tarificar {tarificar.ramo === 'moto' ? 'moto' : 'coche'} →
        </Link>
      )}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Declarado por {quien === 'El cliente' ? 'el cliente' : quien} por el enlace: se verifica al emitir.</div>
    </details>
  )
}

const DOC_LEGIBLE: Record<string, string> = {
  ficha: 'ficha', dni: 'DNI', carnet: 'carné', permiso_circulacion: 'permiso de circulación', ficha_tecnica: 'ficha técnica', poliza: 'póliza', otro: 'documento',
}

/** Documentos que subió y lo que no casa con ellos. Sin contraste posible se dice; nunca «todo cuadra» por defecto. */
function Verificacion({ s }: { s: SolicitudDatos }) {
  if (s.documentos === null) {
    return <div style={{ margin: '6px 0', fontSize: 13, color: 'var(--muted)' }}>No se ha podido saber qué documentos subió: míralo en Documentos.</div>
  }
  const n = s.documentos.length
  const docs = s.documentos
  return (
    <div style={{ margin: '6px 0', display: 'grid', gap: 4, fontSize: 13 }}>
      <div>
        {n === 0
          ? 'No ha subido documentos: todo es declarado.'
          : `Subió ${n} documento${n === 1 ? '' : 's'} (${docs.map((d) => DOC_LEGIBLE[d.tipo] ?? 'documento').join(', ')}): los tienes en Documentos.`}
      </div>
      {n > 0 && s.discrepancias === null && <div style={{ color: 'var(--muted)' }}>No se ha podido contrastar lo declarado con sus documentos.</div>}
      {n > 0 && s.discrepancias !== null && s.discrepancias.length === 0 && (
        <div style={{ ...FILA, color: 'var(--positive)' }}><Ico i={Check} size={13} /> Lo declarado coincide con lo leído en sus documentos.</div>
      )}
      {s.discrepancias && s.discrepancias.length > 0 && (
        <div role="alert" style={{ color: 'var(--negative)', display: 'grid', gap: 2 }}>
          <strong>No casa con sus documentos:</strong>
          {s.discrepancias.map((d) => {
            const campo = s.campos.find((c) => c.clave === d.clave) ?? { clave: d.clave, etiqueta: d.clave }
            return (
              <span key={d.clave} style={{ overflowWrap: 'anywhere' }}>
                {campo.etiqueta}: escribió «{valorLegible(campo, d.declarado)}», el {DOC_LEGIBLE[d.tipoDocumento] ?? 'documento'} dice «{valorLegible(campo, d.documento)}».
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
