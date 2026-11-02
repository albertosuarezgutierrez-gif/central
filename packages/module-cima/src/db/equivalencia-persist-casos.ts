/** Casos del cepo de equivalencia de ESCRITURAS (los 6 ficheros de ejemplo de la norma). */
export const CASOS_ESCRITURAS: ReadonlyArray<{
  nombreFichero: string;
  tipoObjeto: "POL" | "REC" | "SIN" | "CEF";
  codigoEntidad: string;
}> = [
  { nombreFichero: "eiac-polizas-V07-1_V06.xml", tipoObjeto: "POL", codigoEntidad: "C0001" },
  { nombreFichero: "eiac-pol-colectiva-V07-1_V06.xml", tipoObjeto: "POL", codigoEntidad: "C0001" },
  { nombreFichero: "eiac-recibos-V07-1_V06.xml", tipoObjeto: "REC", codigoEntidad: "C0001" },
  { nombreFichero: "eiac-siniestro-dec-V07-1_V06.xml", tipoObjeto: "SIN", codigoEntidad: "C0001" },
  { nombreFichero: "eiac-siniestro-mov-pagos-V07-1_V05.xml", tipoObjeto: "SIN", codigoEntidad: "C0001" },
  { nombreFichero: "eiac-ctaefectivo-V07-1_V06.xml", tipoObjeto: "CEF", codigoEntidad: "C0001" },
];
