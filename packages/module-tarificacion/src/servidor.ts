// @central/module-tarificacion/servidor — SOLO servidor (Node): funciones con `node:crypto`.
// Nunca lo importes desde un componente cliente ni lo reexportes desde `index.ts`.
export {
  hashDatosEmision,
  generarTokenEmision,
  hashTokenEmision,
  firmarAutorizacionEmision,
  verificarFirmaAutorizacionEmision,
  decidirCanje,
} from './emision-servidor.ts'
