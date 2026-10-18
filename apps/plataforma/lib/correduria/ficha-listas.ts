/**
 * Listas largas de la ficha del cliente (Documentos e Historial), sin JSX: agrupar, filtrar y
 * paginar. La pantalla pinta, este fichero decide, y el test lo vigila.
 *
 * Regla de la casa (Rendimiento UI): nada monta cientos de filas de golpe. Documentos e Historial
 * enseñan una PÁGINA de filas y un «Ver más»; los grupos plegados no montan ni cuentan filas.
 */
import { etiquetaTipoDocumento, type DocumentoResumen } from '@central/module-seguros'

export const PAGINA_DOCUMENTOS = 50
export const PAGINA_HISTORIAL = 20

/** Sin acentos y en minúsculas: «Póliza» casa con «poliza». */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// ─── Documentos ──────────────────────────────────────────────────────────────

export const GRUPO_CLIENTE = 'cliente'
/** Documentos de un siniestro que no se sabe ligar a ninguna póliza. */
export const GRUPO_SINIESTROS = 'siniestros'

export type GrupoDocumentos = {
  /** `cliente` o el id de la póliza. */
  clave: string
  titulo: string
  /** Dentro del grupo, por tipo (campo `tipo`); cada subgrupo conserva el orden de llegada. */
  porTipo: { tipo: DocumentoResumen['tipo']; etiqueta: string; docs: DocumentoResumen[] }[]
  /** Documentos del grupo que pasan la búsqueda (todos, aunque no se pinten). */
  total: number
}

/**
 * Agrupa por póliza (los sin póliza, en «Del cliente», que va primero) y dentro por tipo.
 * Un documento con `siniestroId` y sin `polizaId` va a la póliza de ese siniestro si `siniestros`
 * (los de la ficha, ya cargados) la dice; si no consta (siniestro desconocido o lista `null` = no
 * se pudo leer), a un grupo propio «Siniestros», el ÚLTIMO: es el residuo de lo que no se sabe
 * ligar, y «Del cliente» conserva su sitio de cabecera. Ningún documento se pierde.
 * `buscar` filtra EN MEMORIA por nombre de fichero (y por el rótulo del tipo, para hallar los
 * «pedidos», que aún no tienen nombre). Una póliza que no está en `polizas` se rotula «Otra póliza».
 */
export function agruparDocumentos(
  docs: readonly DocumentoResumen[],
  polizas: readonly { id: string; etiqueta: string }[],
  buscar = '',
  siniestros: readonly { id: string; polizaId: string }[] | null = null,
): GrupoDocumentos[] {
  const q = normalizar(buscar)
  const polizaDeSiniestro = new Map((siniestros ?? []).map(s => [s.id, s.polizaId]))
  const etiquetas = new Map(polizas.map(p => [p.id, p.etiqueta]))
  const grupos = new Map<string, GrupoDocumentos>()
  const orden: string[] = [GRUPO_CLIENTE, ...polizas.map(p => p.id)]
  for (const d of docs) {
    const etq = etiquetaTipoDocumento(d.tipo)
    if (q && !normalizar(`${d.nombre ?? ''} ${etq}`).includes(q)) continue
    const clave = d.polizaId
      ?? (d.siniestroId ? (polizaDeSiniestro.get(d.siniestroId) || GRUPO_SINIESTROS) : GRUPO_CLIENTE)
    let g = grupos.get(clave)
    if (!g) {
      const titulo = clave === GRUPO_CLIENTE ? 'Del cliente' : clave === GRUPO_SINIESTROS ? 'Siniestros' : etiquetas.get(clave) ?? 'Otra póliza'
      g = { clave, titulo, porTipo: [], total: 0 }
      grupos.set(clave, g)
      if (!orden.includes(clave)) orden.push(clave)
    }
    let t = g.porTipo.find(x => x.tipo === d.tipo)
    if (!t) { t = { tipo: d.tipo, etiqueta: etq, docs: [] }; g.porTipo.push(t) }
    t.docs.push(d)
    g.total++
  }
  // «Siniestros» al final, también tras las «Otra póliza» que se añaden al vuelo.
  const fin = orden.filter(c => c !== GRUPO_SINIESTROS)
  fin.push(GRUPO_SINIESTROS)
  return fin.flatMap(c => (grupos.has(c) ? [grupos.get(c)!] : []))
}

/**
 * Recorta a `max` filas EN TOTAL, de arriba abajo. Los grupos `plegados` no se pintan ni gastan
 * cupo. Devuelve lo visible y cuántas filas quedan por enseñar (las de los grupos abiertos).
 */
export function limitarGrupos(
  grupos: readonly GrupoDocumentos[],
  max: number,
  plegados: ReadonlySet<string> = new Set(),
): { visibles: GrupoDocumentos[]; restantes: number } {
  let cupo = Math.max(0, max)
  let restantes = 0
  const visibles = grupos.map(g => {
    if (plegados.has(g.clave)) return { ...g, porTipo: [] }
    const porTipo: GrupoDocumentos['porTipo'] = []
    for (const t of g.porTipo) {
      const docs = t.docs.slice(0, cupo)
      cupo -= docs.length
      restantes += t.docs.length - docs.length
      if (docs.length > 0) porTipo.push({ ...t, docs })
    }
    return { ...g, porTipo }
  })
  return { visibles, restantes }
}

// ─── Historial ───────────────────────────────────────────────────────────────

type ConTipo = { tipo: string }

/** Los tipos que HAY en la lista (no los posibles), de más a menos frecuentes. */
export function tiposPresentes(lista: readonly ConTipo[]): { tipo: string; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const x of lista) cuenta.set(x.tipo, (cuenta.get(x.tipo) ?? 0) + 1)
  return [...cuenta].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n || a.tipo.localeCompare(b.tipo, 'es'))
}

/** `null` = sin filtro (todas). */
export function filtrarPorTipo<T extends ConTipo>(lista: readonly T[], tipo: string | null): T[] {
  return tipo === null ? [...lista] : lista.filter(x => x.tipo === tipo)
}

/** Una página: las primeras `n` y cuántas quedan. */
export function paginar<T>(lista: readonly T[], n: number): { visibles: T[]; restantes: number } {
  const visibles = lista.slice(0, Math.max(0, n))
  return { visibles, restantes: lista.length - visibles.length }
}
