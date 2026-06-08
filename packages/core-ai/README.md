# @iarest/core-ai

Núcleo IA compartido de la **casa de marcas** (ia.rest · SIVRA · IALIMP). Paquete
**piloto** de la Fase 1 de la unificación — ver `docs/HANDOFF-unificacion-casa-marcas.md`.

## Principio: identity-agnostic
El paquete **no lee `process.env` ni secretos**. La app consumidora construye la
config (con su propia `apiKey`) y la pasa. Así el mismo núcleo sirve a las 3 apps
sin acoplar credenciales ni auth.

## Superficie
- `cleanJSON(raw)` — quita el ```` ```json ```` que envuelven algunos modelos.
- `nimText(config, system, user, maxTokens?)` — texto vía NVIDIA NIM.
- `nimVision(config, system, images, userText, maxTokens?)` — visión multi-imagen.
- Tipos: `ImageInput`, `NimConfig`.

La lógica de **fallback** (p. ej. a Claude), timeouts y selección de modelo se queda
en cada app (ia.rest: `src/lib/ai-client.ts`), que envuelve esta superficie.

## Consumo (Fase 0/1)
Se resuelve como fuente vía alias de `tsconfig` (`@iarest/core-ai`) + `transpilePackages`
en Next; npm workspaces enlaza el paquete. Cuando se monte el monorepo turbo completo,
pasará a resolución de paquete real / build con turbo.
