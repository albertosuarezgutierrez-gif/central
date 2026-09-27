---
name: idealista-radar
description: Rutina PROGRAMADA diaria que busca CASAS de 3+ dormitorios cerca de la playa (costa de Huelva a diario; Asturias, Cantabria y Cádiz por turnos) con el conector de Idealista y las mete en el corpus `mercado_comparables` (radar de subastas/chollos/lente 🌊). Sustituye a las alertas de correo de Idealista (Fotocasa sigue por correo). Úsala al disparo diario o si Alberto pide "mira Idealista en la costa". Sin secretos.
---

# Radar de Idealista por conector (costa de Huelva)

**Qué haces:** una búsqueda por núcleo de playa con el conector de **Idealista**, mandas los anuncios
a plataforma y dejas el latido. Nada más. No decides compras, no avisas tú de cada casa (los avisos
de chollos, 🌊 casas de playa y **buenas bajadas** —última bajada ≥5 %, o ≥10 % acumulado en dos o
más— los saca el cron `subastas-mercado` sobre el corpus, igual que con los correos) y no contactas con ningún anunciante.

## Por qué existes (24/09/2026)

Las alertas de correo de Idealista solo cubren las búsquedas que Alberto guarda a mano. Un conector
solo se usa desde una sesión, no desde un cron, así que esto es una rutina: **si no corres, el radar
de casas de playa calla y ese silencio se lee como «no hay nada».**

⚠️ **La skill se escribió el 24/09/2026 pero NADIE la programó hasta el 27/09** (sin rutina, sin un
solo latido `subastas_idealista`), mientras aquí se afirmaba que ya era «la única vía». Lo que
sostuvo el corpus esos días fueron las alertas de correo, que siguen llegando (19 correos el 27/09).
**Alberto quita las alertas de correo solo después de ver varios latidos en verde**, no antes.

## 🚨 No romper

- **La zona la manda el NÚCLEO, no el título.** Idealista titula los anuncios de Matalascañas como
  «…, Almonte». Manda cada búsqueda con su `nucleo` exacto de la tabla de abajo. El servidor zonifica
  con ese nombre y descarta lo que cae fuera de su radio (`fueraDeZona`).
- **Manda los anuncios TAL CUAL, recortados a estos campos**: `propertyCode, price, size, rooms,
  priceByArea, status, latitude, longitude, suggestedTexts{title}, detailedType{typology}` y, **si viene,
  `priceInfo{price{priceDropInfo{formerPrice}}}`**: es la bajada que ya declara el portal. Sin ella, una
  casa que entra ya rebajada no genera nunca el aviso de ⬇️ buena bajada, que es de lo que más le importa
  a Alberto.
  **No inventes ni corrijas nada.** Sin `description`, fotos ni teléfonos: no hacen falta y engordan
  el cuerpo (el script pasa el JSON como argumento, y un argumento de más de ~128 KB revienta).
- **«El conector no contestó» NO es «no hay casas».** Cuéntalo como `sinRespuesta` y sigue.
- **0 resultados** en un núcleo pequeño (Matalascañas daba 3) es un dato válido: cuéntalo igual.
- **Auth: `bash scripts/canal-aviso.sh`** (lee `PLATAFORMA_URL` + `ALERTA_TOKEN` del entorno).
  **NO uses `CRON_SECRET`.**

## Pasos

### 1. Busca los núcleos de HOY (`search_properties`)
Parámetros fijos: `country: "es"`, `locale: "es-ES"`, `operation: "SALE"`, **`propertyType: "CHALET"`**
(casas, chalets, adosados y pareados; no pisos) y `maxResults: 50`.
`query` = `casa o chalet de 3 o más dormitorios cerca de la playa en <búsqueda>`.

**Turnos (día de la semana en hora de Madrid):** Huelva **todos los días**; además, lunes/miércoles/viernes
Asturias, martes/jueves/sábado Cantabria y domingo Cádiz. Cada pasada son ≤19 búsquedas: el corpus es
idempotente y una bajada del norte se detecta como mucho con dos días de retraso, que no justifica
triplicar el coste de cada sesión.

| turno | nucleo (se manda tal cual) | búsqueda |
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
| D | El Palmar | El Palmar, Vejer de la Frontera |
| D | Zahara de los Atunes | Zahara de los Atunes, Barbate |

**Gijón se busca por «Somió, Gijón» a propósito:** con «Gijón» a secas el conector devolvió casas de
Langreo (27/09/2026). El núcleo que se manda sigue siendo «Gijón».

Criterios de Alberto: cerca de la playa (en el norte, a ≤25-30 min), **3 o más dormitorios**, casa y
no piso, mejor adosado. Si falta un núcleo, no lo añadas aquí sin darle antes su centro en `CENTROS`
(`packages/module-subastas/src/idealista-api.ts`): sin centro, el servidor rechaza la búsqueda (error
en `porNucleo`). Lo vigila `test/regression-idealista-radar-nucleos.test.ts`, que lee esta tabla.
Y en el norte el `nucleo` tiene que ser un MUNICIPIO de costa de `costa-norte.ts`: es lo que hace
saltar la lente 🌊.

### 2. Escribe (una llamada por núcleo)
```
bash scripts/canal-aviso.sh POST /api/subastas/mercado/idealista '{"busquedas":[{"nucleo":"Islantilla","properties":[{"propertyCode":"110709609","price":185000,"size":68,"rooms":3,"priceByArea":2721,"status":"good","latitude":37.2112431,"longitude":-7.2453481,"suggestedTexts":{"title":"Chalet adosado en Avenida del Deporte, Islantilla Golf, Islantilla"},"detailedType":{"typology":"chalet"},"priceInfo":{"price":{"priceDropInfo":{"formerPrice":199000}}}}]}]}'
```
Devuelve `{comparables, upserts, fueraDeZona, porNucleo[]}`. Es idempotente: repetir un núcleo solo
actualiza el precio, y si el precio ha bajado lo registra como bajada.

### 3. Latido (OBLIGATORIO, también si fue mal)
```
bash scripts/canal-aviso.sh POST /api/internal/latido '{"agente":"subastas_idealista","ok":<true|false>,"detalle":"<parte>"}'
```
`ok = true` solo si escribiste en al menos la mitad de los núcleos de HOY. En el `detalle`, por este orden:
anuncios escritos y núcleos buscados · ⚠️ núcleos sin respuesta del conector · fuera de zona · errores.
Ejemplo: `«41 casas en 19/19 núcleos (Huelva + Asturias) · 3 fuera de zona descartadas»`.

### 4. Cierra
Pon una línea en `docs/AGENTES-BITACORA.md` con los núcleos, los anuncios escritos y lo que falló.
Si hay dos pasadas malas seguidas, avisa con
`bash scripts/canal-aviso.sh POST /api/internal/alerta '<aviso>'`.

## Envs y conector
`PLATAFORMA_URL` + `ALERTA_TOKEN`. Conector requerido: **idealista**, y ninguno más.
