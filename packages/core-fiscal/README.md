# @central/core-fiscal

Núcleo fiscal compartido de la **casa de marcas** (ia.rest · SIVRA · IALIMP).
Fase 1 de la unificación — ver `docs/HANDOFF-unificacion-casa-marcas.md`.

## Diseño: conector por jurisdicción
- **Universal**: `calcularFiscal` (descomposición de IVA), `escapeXml`.
- **España / AEAT VeriFactu** (`/es`, RD 1007/2023 + Orden HAC/1177/2024), para cualquier sector:
  `construirRegistroAlta` / `construirRegistroAnulacion` (F1/F2/F3/R1-R5, desglose por tipo de IVA,
  encadenamiento, validación), `huellaAlta` / `huellaAnulacion` (conformes: test con los 3 vectores oficiales
  de la AEAT), `urlQrCotejo` (ValidarQR), `xmlSuministroLR` (SuministroLR/SuministroInformacion.xsd) y el
  contrato `TransporteVerifactu` (sin envío ni firma). **Dinero en céntimos enteros** (`centimosAImporte`).

Solo **lógica pura**. Lo específico de cada emisor (bloque `SistemaInformatico`,
identidad, `now()`/huso horario, orquestación de la factura, envío SOAP) se queda
en cada app como **adaptador** (en ia.rest: `src/lib/verifactu.ts`). Así la cadena
legal de huellas (única por emisor) la controla siempre la app, no el paquete.

## Consumo
Igual que `@iarest/core-ai`: alias de `tsconfig` + `transpilePackages` en Next,
enlazado por npm workspaces.
