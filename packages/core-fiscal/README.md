# @iarest/core-fiscal

Núcleo fiscal compartido de la **casa de marcas** (ia.rest · SIVRA · IALIMP).
Fase 1 de la unificación — ver `docs/HANDOFF-unificacion-casa-marcas.md`.

## Diseño: conector por jurisdicción
- **Universal**: `calcularFiscal` (descomposición de IVA), `escapeXml`.
- **España / AEAT VeriFactu** (`/es`): `calcularHuella` (SHA-256 encadenada,
  RD 1007/2023 v1.0.3), `generarQrData` (QR TIKE-CONT), `parseFechaLocalAEAT`,
  tipo `RegistroFactura`.

Solo **lógica pura**. Lo específico de cada emisor (bloque `SistemaInformatico`,
identidad, `now()`/huso horario, orquestación de la factura, envío SOAP) se queda
en cada app como **adaptador** (en ia.rest: `src/lib/verifactu.ts`). Así la cadena
legal de huellas (única por emisor) la controla siempre la app, no el paquete.

## Consumo
Igual que `@iarest/core-ai`: alias de `tsconfig` + `transpilePackages` en Next,
enlazado por npm workspaces.
