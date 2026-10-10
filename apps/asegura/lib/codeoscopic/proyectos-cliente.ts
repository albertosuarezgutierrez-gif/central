// Los presupuestos de un cliente en Avant2, hechos donde se hayan hecho (29/09/2026).
//
// Alberto: «para ser indiferente hacerlo en ambos lados». Un presupuesto tarificado en la web de
// Avant2 y uno tarificado desde plataforma son el MISMO recurso en Codeoscopic (medido con la moto de
// Manuel Piña: el 40956228 de la web y los 40934801/40947638/40953692 de plataforma salen juntos en
// `GET /insurances?holderIdentification=`). Esto los lista y, los de la web, los trae a la intranet
// como una tarificación más — con su oportunidad — para que se comparen, se manden al cliente y se
// emitan por el mismo camino.
//
// Todo lo de aquí es GRATIS: `GET /insurances` y `GET /insurances/{id}` son lecturas. Traer uno NO
// vuelve a tarificar: guarda lo que la web ya pagó.
//
// Lo puro (resumen y comprobación del tomador) se prueba contra el crudo REAL del 40956228.

import { peticion } from './cliente.ts'
import type { ConfigCodeoscopic } from './config.ts'
import { idsDeBusqueda, normalizarDni } from './buscar-proyectos.ts'
import { leerCotizacion } from './respuesta.ts'
import { leerEmisionExterna, resumenEmision, type EmisionResumen } from './emision-externa.ts'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Ramos que la intranet sabe retomar (los de `RAMOS_RETOMABLES` de la ruta de tarificación). */
const RAMO_DE_LINEA: Record<string, string> = { Car: 'auto', Motorcycle: 'moto', Home: 'hogar' }

export const MAX_PROYECTOS = 10

export type ResumenProyecto = {
  projectId: string
  creadoEn: string | null
  fechaEfecto: string | null
  /** `auto` | `moto` | `hogar`; `null` = otro ramo (se lista, no se puede traer). */
  ramo: string | null
  lineaNombre: string | null
  /** Matrícula o, en hogar, el código postal. `null` = el proyecto no lo trae. */
  riesgo: string | null
  /** Compañía anterior declarada (`previousInsurance.previousCompany.name`). */
  companiaAnterior: string | null
  precios: number
  /** El precio más barato. `null` = el proyecto no trae ningún precio. */
  mejor: { compania: string | null; modalidad: string | null; primaEur: number | null; firme: boolean } | null
  /** Cuántos precios vienen ya confirmados por la compañía (`estimate: false`). */
  confirmados: number
  avant2Url: string | null
  /** La emisión que cuenta el proyecto (hecha en la web o aquí). `null` = no cuenta ninguna. */
  emision: EmisionResumen | null
}

function ramo(crudo: unknown): string | null {
  const id = str(obj(obj(crudo).insuranceLine).id)
  return id ? RAMO_DE_LINEA[id] ?? null : null
}

function riesgoDe(crudo: unknown): string | null {
  const r = obj(obj(crudo).risk)
  const matricula = str(r.registrationPlate)
  if (matricula) return matricula.toUpperCase().replace(/\s/g, '')
  return str(obj(obj(r).address).postalCode) ?? null
}

/**
 * «Confirmado por la compañía» = `estimate: false`, que en `firmezaDe` es `firme` o `condicionado`
 * (condicionado = confirmado pero con un aviso: Allianz añade siempre «Prima anual real: …» como
 * warning, y eso no lo hace menos confirmado). Solo `estimado` no lo es.
 */
const confirmado = (f: string) => f !== 'estimado'

/** PURO. Lo que la lista enseña de un `GET /insurances/{id}`. Lanza si el crudo no trae id. */
export function resumenProyecto(crudo: unknown): ResumenProyecto {
  const c = leerCotizacion(crudo)
  const r = obj(crudo)
  const conPrima = c.precios.filter((p) => typeof p.primaEur === 'number')
  const mejor = conPrima.length
    ? conPrima.reduce((a, b) => ((b.primaEur as number) < (a.primaEur as number) ? b : a))
    : null
  const emision = leerEmisionExterna(crudo)
  const self = arr(r.appUrls).map(obj).find((u) => str(u.rel) === 'Self')
  return {
    projectId: c.projectId,
    creadoEn: str(r.creationDateTime),
    fechaEfecto: c.fechaEfecto,
    ramo: ramo(crudo),
    lineaNombre: str(obj(r.insuranceLine).name),
    riesgo: riesgoDe(crudo),
    companiaAnterior: str(obj(obj(obj(obj(r.risk).previousInsurance)).previousCompany).name),
    precios: c.precios.length,
    mejor: mejor
      ? { compania: mejor.compania, modalidad: mejor.modalidad, primaEur: mejor.primaEur, firme: confirmado(mejor.firmeza) }
      : null,
    confirmados: c.precios.filter((p) => confirmado(p.firmeza)).length,
    avant2Url: self ? str(self.url) : null,
    emision: emision.estado === 'sin_solicitud' ? null : resumenEmision(emision),
  }
}

/**
 * PURO. ¿Es de este cliente? Por DOCUMENTO normalizado, nunca por nombre: dos homónimos no se
 * funden y un proyecto de otra persona no se cuelga de esta ficha. Sin documento en alguno de los
 * dos lados, NO (no se adivina).
 */
export function esDelTomador(crudo: unknown, dni: string | null): boolean {
  const doc = str(obj(obj(obj(crudo).holder).identificationDocument).id)
  if (!doc || !dni) return false
  return normalizarDni(doc) === normalizarDni(dni)
}

/**
 * La petición que se guarda con una tarificación traída de la web. No es «lo que viajó» (eso lo
 * mandó la web), sino lo que el propio proyecto dice de sí mismo: basta para que la intranet
 * reconstruya el formulario y el riesgo. Mismas claves que `POST /insurances`.
 */
export function peticionDeProyecto(crudo: unknown): Json {
  const r = obj(crudo)
  return {
    insuranceLine: { id: str(obj(r.insuranceLine).id) },
    effectiveDate: str(r.effectiveDate),
    externalId: str(r.externalId),
    holder: r.holder ?? null,
    risk: r.risk ?? null,
  }
}

/**
 * Los proyectos del tomador en el último año (hasta `MAX_PROYECTOS`, los más recientes), cada uno
 * con su crudo. Dos lecturas gratis por proyecto como mucho. Un proyecto que no se deja leer se
 * DECLARA (`error`), no desaparece de la lista.
 */
export async function proyectosDeCliente(
  config: ConfigCodeoscopic,
  dni: string,
  hoy = new Date(),
): Promise<{ projectId: string; crudo: unknown | null; error: string | null }[]> {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const q = new URLSearchParams({
    holderIdentification: normalizarDni(dni),
    fromDate: iso(new Date(hoy.getTime() - 364 * 86_400_000)),
    toDate: iso(hoy),
    pageSize: '100',
  })
  const raw = await peticion(config, { metodo: 'GET', path: `/insurances?${q}`, timeoutMs: config.timeoutGenericoMs })
  const ids = idsDeBusqueda(raw)
  if (!ids) throw new Error('la búsqueda de Codeoscopic devolvió una forma desconocida')
  const recientes = [...ids].sort((a, b) => Number(b) - Number(a)).slice(0, MAX_PROYECTOS)
  return Promise.all(
    recientes.map(async (projectId) => {
      try {
        const crudo = await peticion(config, { metodo: 'GET', path: `/insurances/${projectId}`, timeoutMs: config.timeoutGenericoMs })
        return { projectId, crudo, error: null }
      } catch (e) {
        return { projectId, crudo: null, error: e instanceof Error ? e.message : String(e) }
      }
    }),
  )
}
