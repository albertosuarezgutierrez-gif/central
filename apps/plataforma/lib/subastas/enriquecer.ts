// ────────────────────────────────────────────────────────────────────────────
// Enriquecimiento de una subasta: ficha del Portal del BOE + Catastro.
// Aquí va SOLO la red; el parseo es puro (`@central/module-subastas`).
//
// Notas de campo (probadas contra los servicios reales el 28/07/2026):
//   · Ambos hosts rechazan la conexión sin un User-Agent de navegador.
//   · El endpoint REST `/json/` del Catastro devuelve 400; el que funciona es
//     el `.asmx` que responde XML.
//   · La ficha del BOE son 3 pestañas (`&ver=2` autoridad, `&ver=3` bien); la
//     general no lleva parámetro.
// ────────────────────────────────────────────────────────────────────────────
import {
  errorCatastro,
  parsearCatastro,
  parsearFichaBoe,
  type DatosCatastro,
  type FichaBoe,
} from '@central/module-subastas'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const FICHA = 'https://subastas.boe.es/detalleSubasta.php'
const CATASTRO = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC'

async function bajar(url: string, ms = 20000): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml' },
    signal: AbortSignal.timeout(ms),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

/** Descarga y parsea las tres pestañas de la ficha de una subasta. */
export async function bajarFicha(identificador: string): Promise<FichaBoe> {
  const base = `${FICHA}?idSub=${encodeURIComponent(identificador)}`
  // Las pestañas secundarias son un extra: si fallan, la general ya trae las
  // cifras, que es lo que desbloquea el scoring.
  const [general, bien, autoridad] = await Promise.all([
    bajar(base),
    bajar(`${base}&ver=3`).catch(() => ''),
    bajar(`${base}&ver=2`).catch(() => ''),
  ])
  return parsearFichaBoe(general, bien, autoridad)
}

/** Consulta el Catastro por referencia catastral. `null` si no hay dato. */
export async function bajarCatastro(refCatastral: string): Promise<DatosCatastro | null> {
  const xml = await bajar(`${CATASTRO}?Provincia=&Municipio=&RC=${encodeURIComponent(refCatastral)}`)
  const err = errorCatastro(xml)
  if (err) {
    console.warn('[subastas/catastro]', refCatastral, err)
    return null
  }
  return parsearCatastro(xml)
}
