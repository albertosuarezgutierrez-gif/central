// ────────────────────────────────────────────────────────────────────────────
// Biblioteca de empresa (F2) — PURO. Conecta los documentos requeridos por el
// pliego con los que la empresa ya tiene guardados, para autocompletar el
// checklist, listar lo que falta y avisar de caducidades. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  Biblioteca,
  DocumentoBiblioteca,
  DocumentoRequerido,
  FichaConcurso,
  ItemChecklist,
  TipoDocumentoBiblioteca,
} from './types'

/** Reglas nombre→tipo, evaluadas en orden (la primera que casa gana). */
const REGLAS: { tipo: TipoDocumentoBiblioteca; claves: string[] }[] = [
  { tipo: 'certificado_aeat', claves: ['aeat', 'agencia tributaria', 'hacienda'] },
  { tipo: 'certificado_ss', claves: ['seguridad social'] },
  { tipo: 'escritura_constitucion', claves: ['escritura'] },
  { tipo: 'poderes', claves: ['poder', 'apoderamiento'] },
  { tipo: 'cif', claves: ['cif', 'nif', 'identificacion fiscal'] },
  { tipo: 'cuentas_anuales', claves: ['cuentas anuales', 'balance'] },
  { tipo: 'seguro_rc', claves: ['responsabilidad civil', 'poliza', 'seguro'] },
  { tipo: 'clasificacion_empresarial', claves: ['clasificacion'] },
  { tipo: 'certificado_iso', claves: ['iso 9001', 'iso 14001', 'certificado iso'] },
  // DEUC antes que 'declaración responsable' genérica para que el DEUC gane.
  { tipo: 'deuc', claves: ['deuc'] },
  { tipo: 'declaracion_responsable', claves: ['declaracion responsable'] },
]

/** Normaliza: minúsculas, sin acentos, espacios colapsados. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // diacríticos combinados
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clasifica el nombre de un documento requerido en un tipo de biblioteca.
 * Conservador: devuelve `undefined` si no reconoce nada con confianza.
 */
export function tipoDeDocumento(nombre: string): TipoDocumentoBiblioteca | undefined {
  const n = norm(nombre)
  for (const regla of REGLAS) {
    if (regla.claves.some(c => n.includes(c))) return regla.tipo
  }
  return undefined
}

/** Conjunto de tipos presentes en la biblioteca (para lookup O(1)). */
function tiposEnBiblioteca(biblioteca: Biblioteca): Set<TipoDocumentoBiblioteca> {
  return new Set(biblioteca.map(d => d.tipo))
}

/**
 * Devuelve una copia del checklist con `hecho=true` en los ítems cuyo documento
 * esté cubierto por la biblioteca. Conservador: solo marca lo que reconoce.
 */
export function autocompletarChecklist(
  checklist: ItemChecklist[],
  biblioteca: Biblioteca,
): ItemChecklist[] {
  const tipos = tiposEnBiblioteca(biblioteca)
  return checklist.map(item => {
    const tipo = tipoDeDocumento(item.documento)
    const cubierto = tipo !== undefined && tipos.has(tipo)
    return cubierto ? { ...item, hecho: true } : { ...item }
  })
}
