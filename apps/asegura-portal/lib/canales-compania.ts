// De dónde saca la pantalla el canal de cada compañía.
//
// Es la capa de BD de `canal-compania.ts` (`@central/module-seguros-portal`),
// que es donde viven las reglas. Aquí solo se lee la tabla.
//
// 📌 **Este fichero NO filtra por identidad, y es correcto.** `companias_dgs` es
// un catálogo público —códigos de la DGSFP y teléfonos que las propias
// compañías publican—, no la cartera de nadie: no hay ningún «mis compañías»
// que filtrar. Por eso tampoco entra en la lista de modelos de cartera que
// vigila `test/regression-portal-aislamiento.test.ts`. Se dice en voz alta
// porque en esta app la ausencia de un filtro por `identidadId` es, en
// cualquier otro sitio, el fallo que más caro sale.

import type { FilaCompania } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'

/**
 * Las compañías activas con su canal.
 *
 * 🚨 **Sin `try/catch`: si la consulta falla, que suba.** Devolver `[]` haría
 * que todas las pólizas cayeran en «no tenemos verificado su teléfono» — o sea,
 * un fallo de BD disfrazado de dato. Es la regla de la casa aplicada al sitio
 * donde peor sienta: alguien que acaba de tener un percance leyendo que no
 * sabemos a quién tiene que llamar, cuando sí lo sabemos.
 *
 * La tabla tiene ~200 filas y no crece: se lee entera y se cruza en memoria, sin
 * una consulta por póliza.
 */
export async function companiasConCanal(): Promise<FilaCompania[]> {
  const filas = await prisma.companiaDgs.findMany({
    where: { activa: true },
    select: {
      nombreComun: true,
      telefonoSiniestros: true,
      telefonoAsistencia: true,
      whatsappSiniestros: true,
      horarioSiniestros: true,
      telefonoVerificadoEn: true,
    },
  })

  return filas.map((f) => ({
    nombreComun: f.nombreComun,
    telefonoSiniestros: f.telefonoSiniestros,
    telefonoAsistencia: f.telefonoAsistencia,
    whatsappSiniestros: f.whatsappSiniestros,
    horarioSiniestros: f.horarioSiniestros,
    // Una columna `date` de Postgres llega como medianoche UTC. Se corta la
    // cadena ISO en vez de formatear con la zona del servidor, que en Vercel no
    // es la del cliente y desplazaría la fecha un día — sobre un dato cuyo
    // sentido entero es «cuándo se comprobó esto por última vez».
    verificadoEn: f.telefonoVerificadoEn === null ? null : f.telefonoVerificadoEn.toISOString().slice(0, 10),
  }))
}
