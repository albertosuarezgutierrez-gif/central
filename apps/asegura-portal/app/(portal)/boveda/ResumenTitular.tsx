// Las tres cifras de cabecera de un titular: Pólizas · Al año · Próximo.
//
// ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
//
// Alberto, viendo el panel de ejemplo de `grupoasegura.es`: «lo ideal es que sea
// igual la intranet, y ese diseño que aparece en la web es mejor que el que hay
// ahora mismo». La web enseña esas tres baldosas y el portal no las tenía: quien
// las ve ahí, entra y no las encuentra.
//
// ── 🚨 Por TITULAR, no una suma global ──────────────────────────────────────
//
// Es la misma decisión que se acaba de tomar un piso más abajo: las pólizas
// personales de alguien y las de su sociedad se pintan separadas. Una baldosa
// «Al año» que sumara las dos cosas volvería a mezclarlas justo en la cifra que
// más se mira, y encima sin que nada lo delatara. En «autorizadas» no se pinta
// ninguna: lo que gasta al año la persona que te dio acceso no es tuyo.
//
// ── Y por qué cada baldosa lleva su nota ────────────────────────────────────
//
// Medido en la cartera real antes de escribir esto: 111 pólizas vivas, 85 con
// prima, **26 sin ninguna**. Un total que sume las 85 y se pinte a secas es más
// bajo que la realidad y no lo parece. Las cuentas —y los tres estados— los
// resuelve `resumirCartera()`, que es puro y tiene sus once cepos; aquí solo se
// eligen las palabras.
import { resumirCartera, type PolizaResumible } from '@central/module-seguros-portal'

import { eur } from '@/lib/dinero'

/** «2 nov». Sin año: en una baldosa de un vistazo el año sobra y estorba. */
function diaMes(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function ResumenTitular({
  polizas,
  hoy,
}: {
  polizas: readonly PolizaResumible[]
  /** Se resuelve en el servidor: la página es `force-dynamic`. */
  hoy: Date
}) {
  // Sin pólizas no hay nada que resumir, y tres baldosas a cero se leen como una
  // afirmación («no pagas nada», «no vence nada») donde solo hay una lista vacía.
  if (polizas.length === 0) return null

  const r = resumirCartera(polizas, hoy)

  return (
    <dl className="resumen-cartera">
      <div className="resumen-baldosa">
        <dt>Pólizas</dt>
        <dd>{r.polizas}</dd>
      </div>

      <div className="resumen-baldosa">
        <dt>Al año</dt>
        {/* 🚨 `gastoAnual === null` NO se pinta como «0,00€»: un cero dice que no
            pagas nada, y lo que hay es que no lo sabemos. */}
        <dd>{r.gastoAnual === null ? '—' : eur(r.gastoAnual)}</dd>
        {r.gastoAnual === null ? (
          <p className="resumen-nota">no consta ninguna prima</p>
        ) : r.sinPrima > 0 ? (
          // Mientras falte una, el total es un MÍNIMO y hay que decirlo: es la
          // diferencia entre «pagas esto» y «de lo que sabemos, pagas esto».
          <p className="resumen-nota">
            de {r.conPrima} de {r.polizas} · faltan {r.sinPrima}
          </p>
        ) : null}
      </div>

      <div className="resumen-baldosa">
        <dt>Próximo</dt>
        {/* El mínimo FUTURO. Una fecha pasada bajo esta palabra sería falsa, y
            hay pólizas vivas ya vencidas. */}
        <dd>{r.proximoVencimiento === null ? '—' : diaMes(r.proximoVencimiento)}</dd>
        {r.proximoVencimiento === null && r.vencidas > 0 ? (
          <p className="resumen-nota">
            {r.vencidas === 1 ? '1 vencida' : `${r.vencidas} vencidas`}
          </p>
        ) : r.proximoVencimiento === null ? (
          <p className="resumen-nota">no consta fecha</p>
        ) : r.vencidas > 0 || r.sinFecha > 0 ? (
          // Las vencidas y las que no traen fecha no desaparecen porque haya una
          // próxima: son justo las que hay que mirar.
          <p className="resumen-nota">
            {[
              r.vencidas > 0 ? `${r.vencidas} vencida${r.vencidas === 1 ? '' : 's'}` : null,
              r.sinFecha > 0 ? `${r.sinFecha} sin fecha` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </dl>
  )
}
