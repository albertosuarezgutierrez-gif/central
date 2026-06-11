// ────────────────────────────────────────────────────────────────────────────
// Sobre administrativo + DEUC (F3) — PURO. Reutiliza el checklist del v1 y el
// clasificador de la biblioteca (F2). Produce datos; la app los renderiza al
// formato oficial. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  Biblioteca,
  DatosIdentificacionEmpresa,
  DeclaracionResponsable,
  Deuc,
  DocumentoBiblioteca,
  FichaConcurso,
  ItemSobreAdministrativo,
  TipoDocumentoBiblioteca,
} from './types'
import { derivarChecklist } from './checklist.ts'
import { tipoDeDocumento } from './biblioteca.ts'

/** Primer documento de la biblioteca por cada tipo (para resolver cobertura). */
function indicePorTipo(biblioteca: Biblioteca): Map<TipoDocumentoBiblioteca, DocumentoBiblioteca> {
  const m = new Map<TipoDocumentoBiblioteca, DocumentoBiblioteca>()
  for (const d of biblioteca) if (!m.has(d.tipo)) m.set(d.tipo, d)
  return m
}

/**
 * Documentos del Sobre 1 (administrativo): los del checklist filtrados a ese
 * sobre, cada uno con el documento de la biblioteca que lo cubre (si existe).
 */
export function documentosSobreAdministrativo(
  ficha: FichaConcurso,
  biblioteca: Biblioteca,
): ItemSobreAdministrativo[] {
  const idx = indicePorTipo(biblioteca)
  return derivarChecklist(ficha)
    .filter(i => i.sobre === 'administrativo')
    .map(i => {
      const tipo = tipoDeDocumento(i.documento)
      const cubiertoPor = tipo ? idx.get(tipo) : undefined
      const out: ItemSobreAdministrativo = { documento: i.documento, obligatorio: i.obligatorio }
      if (i.modelo) out.modelo = i.modelo
      if (cubiertoPor) out.cubiertoPor = cubiertoPor
      return out
    })
}

/**
 * Ensambla el DEUC por partes. Los motivos de exclusión y la veracidad se
 * declaran a favor (el licitador afirma estar limpio y al corriente); la app
 * permite editarlos antes de firmar. La solvencia sale de la ficha.
 */
export function construirDeuc(
  empresa: DatosIdentificacionEmpresa,
  ficha: FichaConcurso,
  hoy?: string,
): Deuc {
  return {
    procedimiento: {
      objeto: ficha.objeto,
      expediente: ficha.expediente,
      organo: ficha.organo_contratacion,
    },
    operador: empresa,
    motivos_exclusion: {
      sin_condenas: true,
      al_corriente_impuestos: true,
      al_corriente_ss: true,
      sin_quiebra: true,
    },
    solvencia: {
      economica: ficha.solvencia.filter(s => s.ambito === 'economica').map(s => s.descripcion),
      tecnica: ficha.solvencia.filter(s => s.ambito === 'tecnica').map(s => s.descripcion),
    },
    declaraciones_finales: { veracidad: true, fecha: hoy },
  }
}
