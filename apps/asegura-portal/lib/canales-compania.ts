// De dónde saca la pantalla el canal de cada compañía.
//
// Desde el 23/09/2026 NO de la BD: del catálogo verificado de
// `@central/module-seguros` (`telefonos-companias.ts`), el mismo que publica
// la web en `/telefonos-siniestros`. Antes se leían las columnas `telefono_*` de
// `companias_dgs`, que eran una segunda copia escrita a mano y se separó: daba a
// Mapfre su línea MÉDICA como «dar parte». Una sola fuente, un solo sitio que
// verificar. Las reglas de qué se puede decir siguen en `canal-compania.ts`
// (`@central/module-seguros-portal`).
//
// 🚨 Solo entran las compañías VERIFICADAS (`esTelefonoPublicable`). Una sin
// verificar no se convierte en una fila vacía: no entra, y la póliza cae en
// `sinDatos`, que dice «pídenoslo». Es lo mismo que hace la web.

import { TELEFONOS_COMPANIAS, esTelefonoPublicable } from '@central/module-seguros'
import type { FilaCompania } from '@central/module-seguros-portal'

/** Las compañías con canal verificado, en la forma que entiende el módulo del portal. */
export function companiasConCanal(): FilaCompania[] {
  return TELEFONOS_COMPANIAS.filter(esTelefonoPublicable).map((c) => ({
    nombreComun: c.nombre,
    telefonoSiniestros: c.siniestros,
    asistencias: c.asistencia.flatMap((a) => a.numeros.map((numero) => ({ para: a.para, numero, horario: a.horario }))),
    whatsappSiniestros: c.whatsapp,
    whatsappNota: c.whatsappNota ?? null,
    horarioSiniestros: c.horario,
    verificadoEn: c.verificadoEl,
  }))
}
