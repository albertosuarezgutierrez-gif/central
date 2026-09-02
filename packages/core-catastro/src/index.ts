// Parseo puro + resolución de direcciones. La red vive en `./http` (subpath
// aparte para que los tests y los módulos puros no la importen sin querer).
export {
  parsearCatastro, errorCatastro, superficieUtil, parsearCoordenadas,
  refParcela, direccionCatastro, parsearInmueblesDnploc, parcelaUnica, paramsDnploc,
  parsearVias, elegirVia, normVia, tokensVia, terminoBusquedaVia,
} from './parser.ts'
export type { DatosCatastro, CoordenadasCatastro, DireccionCatastro, InmuebleCatastro, ParamsDnploc } from './parser.ts'
export { precalificarHogar } from './hogar.ts'
export type { DatosHogar, SupuestoHogar, ReparoHogar, PrecalificacionHogar } from './hogar.ts'
