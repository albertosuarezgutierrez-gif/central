// Identidad del SISTEMA INFORMÁTICO DE FACTURACIÓN (SIF) que va en cada registro VeriFactu (bloque <SistemaInformatico>).
//
// 🚨 Es del PRODUCTOR del software (el fabricante, art. 13 RD 1007/2023: nosotros, aunque lo regalemos), NO del taller, y debe
// coincidir con la DECLARACIÓN RESPONSABLE. No se inventa: mientras falte cualquier dato, la emisión FALLA con
// «falta configurar el sistema informático». Rellénalo aquí (es igual para todos los talleres) cuando Alberto y el asesor
// decidan quién figura como productor (persona o sociedad, NIF), el nombre comercial del sistema, su id de 2 caracteres y la versión.
//
// Modalidad y entorno: mientras no haya transporte real a la AEAT ni visto bueno del asesor, el QR apunta al entorno de PRUEBAS.
import type { EntornoAeat, SistemaInformatico } from '@central/core-fiscal'

export interface ConfigSif {
  /** Razón social del productor del software (fabricante). */
  productorNombreRazon: string | null
  /** NIF del productor (9 caracteres). */
  productorNif: string | null
  /** Nombre del sistema tal como figura en la declaración responsable. */
  nombreSistema: string | null
  /** Código de 2 caracteres que asigna el productor (IdSistemaInformatico). */
  idSistema: string | null
  /** Versión declarada. */
  version: string | null
  /** true = sistema VERI*FACTU (remite a la AEAT): QR `ValidarQR` y leyenda. */
  verifactu: boolean
  entorno: EntornoAeat
}

export const CONFIG_SIF: ConfigSif = {
  productorNombreRazon: null,
  productorNif: null,
  nombreSistema: null,
  idSistema: null,
  version: null,
  verifactu: true,
  entorno: 'pruebas',
}

export class SistemaSinConfigurarError extends Error {
  constructor(faltan: string[]) {
    super(`falta configurar el sistema informático de facturación (${faltan.join(', ')}) en apps/taller/lib/sistema-informatico.ts`)
    this.name = 'SistemaSinConfigurarError'
  }
}

/** Bloque <SistemaInformatico> para un taller (NumeroInstalacion = id del taller). Lanza si falta algún dato del productor. */
export function sistemaInformatico(c: ConfigSif, tallerId: string): SistemaInformatico {
  const faltan: string[] = []
  const t = (v: string | null, nombre: string) => {
    const s = (v ?? '').trim()
    if (!s) faltan.push(nombre)
    return s
  }
  const nombreRazon = t(c.productorNombreRazon, 'razón social del productor')
  const nif = t(c.productorNif, 'NIF del productor')
  const nombreSistemaInformatico = t(c.nombreSistema, 'nombre del sistema')
  const idSistemaInformatico = t(c.idSistema, 'id del sistema')
  const version = t(c.version, 'versión')
  if (idSistemaInformatico && idSistemaInformatico.length !== 2) faltan.push('id del sistema de 2 caracteres')
  if (nif && nif.length !== 9) faltan.push('NIF del productor de 9 caracteres')
  if (faltan.length) throw new SistemaSinConfigurarError(faltan)
  return {
    nombreRazon, nif, nombreSistemaInformatico, idSistemaInformatico, version,
    numeroInstalacion: tallerId,
    // Diseñado para operar SOLO en modalidad VERI*FACTU, multi-obligado (cada taller es un obligado) y una instalación por taller.
    tipoUsoPosibleSoloVerifactu: 'S',
    tipoUsoPosibleMultiOT: 'S',
    indicadorMultiplesOT: 'N',
  }
}
