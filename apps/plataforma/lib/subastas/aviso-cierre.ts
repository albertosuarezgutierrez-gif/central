// ────────────────────────────────────────────────────────────────────────────
// Texto de los avisos de CIERRE de una subasta. Puro (sin BD ni red): la ruta
// del cron reúne los datos y aquí solo se decide qué se dice y cómo.
//
// Vive aparte porque es la frase sobre la que Alberto decide si prepara 8.250 €
// y si puja: si miente o si calla un hueco, se puja a ciegas. Mismo criterio que
// `resumen-docs.ts` y `subastas/resumen-docs`, con sus tests al lado.
//
// Dos avisos y no uno (petición de Alberto, 20/08/2026): el cuello de botella
// real es el DINERO, no la documentación. Para pujar hay que tener el depósito
// consignado ANTES, y avisar la víspera no da tiempo a moverlo.
// ────────────────────────────────────────────────────────────────────────────
import { titularPujas, type CalibracionZona, type PujasFicha } from '@central/module-subastas'
// Import RELATIVO, no `@/`: este archivo lo cargan los tests con `node --test`,
// que no resuelve el alias de Next (`@/lib/...` revienta con ERR_MODULE_NOT_FOUND).
import { eur } from '../dinero.ts'

/** Todo lo que hace falta para redactar el bloque de UNA subasta. */
export interface DatosAviso {
  identificador: string
  descripcion?: string | null
  municipio?: string | null
  provincia?: string | null
  valorSubasta?: number | null
  /** Ya resuelto por quien llama: el publicado por el Portal o el 5% legal. */
  deposito?: number | null
  fechaFin?: string | null
  /** Estado de pujas leído del Portal. `desconocido` = no se pudo comprobar. */
  pujas: PujasFicha
  /** Cuándo se leyó ese estado (ISO). `null` = nunca. */
  pujasAt?: string | null
  /** Suelo del art. 670 LEC (50% del tipo), si el régimen lo tiene. */
  sueloLaj?: number | null
  /** Techo de puja congelado por el clasificador para un 25% de descuento. */
  techoPuja?: number | null
  /** Titular de cargas ya formateado por `titularCargas` (emoji incluido). */
  cargas?: string | null
  url: string
}

/** Escapa lo que va dentro de HTML de Telegram. */
export function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fechaMadrid(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })
}

/**
 * Qué dice el histórico de remates de ESA provincia.
 *
 * 🚨 Nunca se presenta el agregado nacional como si fuera el de la provincia: si
 * la provincia no tiene muestra propia se dice de dónde sale el número. Un ratio
 * mediano es lo que decide si merece la pena bloquear el depósito, y en el
 * corpus real la diferencia es enorme — 6 de 8 remates fueron POR DEBAJO del
 * tipo (0,44-0,76×) y los dos que se dispararon (2,08× y 4,06×) son los dos de
 * Sevilla. `null` = todavía no hay con qué, y entonces no se dice nada.
 */
export function lecturaRatio(calibracion: CalibracionZona[], provincia: string | null | undefined): string | null {
  const prov = (provincia ?? '').trim()
  const suya = prov ? calibracion.find((c) => c.provincia === prov) : undefined
  const global = calibracion.find((c) => c.provincia === '(todas)')
  const elegida = suya?.ratioMediano != null && suya.muestraRatio > 0 ? suya : global

  if (!elegida || elegida.ratioMediano == null || elegida.muestraRatio === 0) return null
  const pct = Math.round(elegida.ratioMediano * 100)
  const n = elegida.muestraRatio
  const remates = `${n} remate${n === 1 ? '' : 's'}`
  return elegida === suya
    ? `📊 En ${prov} el remate mediano va al ${pct}% del tipo (${remates} vistos)`
    : `📊 Sin muestra de ${prov || 'esa provincia'}; en el conjunto del corpus el remate mediano va al ${pct}% del tipo (${remates})`
}

/**
 * Bloque de una subasta para el aviso de Telegram (HTML), como líneas.
 *
 * Todo lo que no se sabe se DICE que no se sabe: un aviso que calla el estado de
 * pujas se lee como «no hay pujas», que es justo la conclusión cara.
 */
export function bloqueSubasta(d: DatosAviso, ratio: string | null): string[] {
  const l: string[] = []
  const cierre = fechaMadrid(d.fechaFin)
  l.push(`• <b>${escapar(d.identificador)}</b>${cierre ? ` — cierra ${escapar(cierre)} (hora Madrid)` : ''}`)

  const sitio = [d.municipio, d.provincia].filter(Boolean).join(', ')
  const descr = (d.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 130)
  if (sitio || descr) l.push(`  ${escapar([sitio, descr].filter(Boolean).join(' · '))}`)

  const tipo = d.valorSubasta != null && d.valorSubasta > 0 ? `Tipo ${eur(d.valorSubasta)}` : 'Tipo no publicado'
  const dep = d.deposito != null && d.deposito > 0
    ? `depósito <b>${eur(d.deposito)}</b>`
    : 'depósito sin calcular (falta el valor de subasta)'
  l.push(`  ${escapar(tipo)} · ${dep}`)

  // Estado de pujas + cuándo se miró. Sin fecha de lectura no se afirma nada.
  const leido = fechaMadrid(d.pujasAt)
  const titular = titularPujas(d.pujas, eur, d.valorSubasta ?? null)
  l.push(`  ${escapar(titular)}${d.pujas.estado !== 'desconocido' && leido ? escapar(` · leído ${leido}`) : ''}`)

  // El suelo legal solo se canta cuando de verdad no hay pujas: decirlo con una
  // puja viva por encima es invitar a pujar por debajo de lo que ya hay.
  if (d.pujas.estado === 'sin_pujas' && d.sueloLaj != null && d.sueloLaj > 0) {
    l.push(`  🧱 Nadie ha pujado: el suelo del art. 670 LEC está en ${eur(d.sueloLaj)} (50% del tipo)`)
  }
  if (ratio) l.push(`  ${escapar(ratio)}`)
  if (d.techoPuja != null && d.techoPuja > 0) {
    l.push(`  🧮 Tu techo para un 25% de descuento real: <b>${eur(d.techoPuja)}</b>`)
  }
  if (d.cargas) l.push(`  ⚖️ ${escapar(d.cargas)}`)
  l.push(`  🔗 ${escapar(d.url)}`)
  return l
}

/** URL pública de la ficha del Portal (la que Alberto abre para identificarse). */
export function urlFicha(identificador: string): string {
  return `https://subastas.boe.es/detalleSubasta.php?idSub=${encodeURIComponent(identificador)}`
}
