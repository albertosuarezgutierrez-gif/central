---
name: idealista-radar
description: Referencia de zonas de playa y del corredor A-49 para buscar casas en idealista. RUTINA DESACTIVADA el 28/10/2026 (condiciones de uso del conector). Sin rutina ni escritura en mercado_comparables. Úsala solo si Alberto pide ver anuncios concretos de idealista en el chat, o para guardar búsquedas con alerta. Sin secretos.
---

# Radar de Idealista: referencia (rutina desactivada)

## ⛔ RUTINA DESACTIVADA (28/10/2026)

- **No ejecutes búsquedas periódicas ni masivas** con el conector de idealista.
- **No escribas anuncios en `mercado_comparables`** (ni con `POST /api/subastas/mercado/idealista`).
- El conector de idealista **solo se usa a petición de Alberto, en el chat**, para ver anuncios concretos.
- Motivo: las condiciones de uso del conector prohíben la vigilancia periódica, la recogida de anuncios
  y alimentar bases de datos o estadísticas.

## Vía permitida: búsquedas guardadas con alerta

Alberto crea las búsquedas en la app de idealista, con alerta activada. Así:

1. Los correos de alerta llegan a Gmail con la etiqueta `inmobiliaria`.
2. `POST /api/sivra/inversion/analyze` (en `apps/plataforma/app/api/sivra/inversion/analyze/`) procesa
   esos correos y guarda los inmuebles en `inmuebles_busqueda`.
3. Se revisan en `/api/sivra/inversion` (`apps/plataforma/app/api/sivra/inversion/route.ts`).

Búsquedas a guardar:

**a) «Corredor A-49 casa grande»**
- Tipo: casas y chalets independientes (no pisos).
- Piscina: sí.
- Habitaciones: 4 o más. Acepta 3, ampliables.
- Baños: 2 o más.
- Precio: hasta 280.000 €.
- Zona: dibuja en el mapa el eje Bormujos – Espartinas – Umbrete – Sanlúcar la Mayor – Benacazón –
  Huévar – Carrión de los Céspedes – Chucena, más Villanueva del Ariscal y Olivares.

**b) Zona de playa**
- Usa la tabla de núcleos de abajo como guía de zonas.
- Crea una búsqueda guardada por zona que Alberto quiera vigilar.

## Referencia: núcleos de playa

Esta tabla es solo referencia geográfica. No es una rutina. Cada fila tiene su centro en `CENTROS`
(`packages/module-subastas/src/idealista-api.ts`). No borres filas. Si añades un núcleo, dale antes
su centro en `CENTROS`. Lo vigila `test/regression-idealista-radar-nucleos.test.ts`.

| turno | nucleo | búsqueda |
|---|---|---|
| diario | Isla Canela | Isla Canela, Ayamonte |
| diario | Isla Cristina | Isla Cristina, Huelva |
| diario | Islantilla | Islantilla, Huelva |
| diario | La Antilla | La Antilla, Lepe |
| diario | El Rompido | El Rompido, Cartaya |
| diario | El Portil | El Portil, Punta Umbría |
| diario | Punta Umbría | Punta Umbría, Huelva |
| diario | Mazagón | Mazagón, Moguer |
| diario | Matalascañas | Matalascañas, Almonte |
| L-X-V | Llanes | Llanes, Asturias |
| L-X-V | Ribadesella | Ribadesella, Asturias |
| L-X-V | Colunga | Colunga, Asturias |
| L-X-V | Villaviciosa | Villaviciosa, Asturias |
| L-X-V | Gijón | Somió, Gijón |
| L-X-V | Castrillón | Castrillón, Asturias |
| L-X-V | Cudillero | Cudillero, Asturias |
| L-X-V | Luarca | Luarca, Valdés |
| L-X-V | Navia | Navia, Asturias |
| L-X-V | Tapia de Casariego | Tapia de Casariego, Asturias |
| M-J-S | San Vicente de la Barquera | San Vicente de la Barquera, Cantabria |
| M-J-S | Comillas | Comillas, Cantabria |
| M-J-S | Suances | Suances, Cantabria |
| M-J-S | Piélagos | Liencres, Piélagos |
| M-J-S | Ribamontán al Mar | Somo, Ribamontán al Mar |
| M-J-S | Noja | Noja, Cantabria |
| M-J-S | Santoña | Santoña, Cantabria |
| M-J-S | Laredo | Laredo, Cantabria |
| M-J-S | Castro Urdiales | Castro Urdiales, Cantabria |
| D | Conil | Conil de la Frontera, Cádiz |
| D | La Barrosa | La Barrosa, Chiclana de la Frontera |
| D | Los Caños de Meca | Los Caños de Meca, Barbate |
| D | El Palmar | playa de El Palmar de Vejer |
| D | Zahara de los Atunes | Zahara de los Atunes, Barbate |

Notas de referencia:
- Gijón se busca como «Somió, Gijón»: con «Gijón» a secas salieron casas de Langreo (27/09/2026).
  El núcleo sigue siendo «Gijón».
- El Palmar: «El Palmar, Vejer de la Frontera» devolvió casas del pueblo de Vejer, a 7 km de la playa.
  Usa «playa de El Palmar de Vejer».
- En el norte, el núcleo es un municipio de costa de `costa-norte.ts`.

## Envs
`PLATAFORMA_URL` + `ALERTA_TOKEN` (si algún proceso los necesita). No uses `CRON_SECRET`.
