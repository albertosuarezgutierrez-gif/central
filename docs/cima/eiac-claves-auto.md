# EIAC V07.1 — Claves del ramo Autos (vehículo, combustible, conductor, permiso de conducción)

> Fuente: `209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05` (TIREA, 03/06/2026), apartado **10.2 Claves**. Transcripción literal: código -> descripción, sin interpretar. El § es el que figura en la columna «Clave» del PDF (numeración interna `13.x`).
> Cada tabla es el tipo `claves_*` del XSD con el mismo nombre. Buscar: `grep -n 'claves_formapago' docs/cima/eiac-claves*.md`. Índice de todas las tablas en `README.md`.

## claves_categoriavehiculo  (§13.3.4)

| Código | Descripción |
|---|---|
| CA | Camiones |
| MO | Motocicletas |
| TU | Turismos |

## claves_clasevehiculo  (§13.3.16)

| Código | Descripción |
|---|---|
| AU | Autobús |
| AC | Autocaravana |
| BU | Buggy |
| CA | Camión |
| CR | Caravana |
| CG | Carrito de golf |
| CC | Ciclo-carro |
| CI | Ciclomotor |
| CF | Comercial derivado Furgoneta |
| CT | Comercial derivado Todoterreno |
| CV | Comercial derivado Turismo |
| FH | Furgón habitable con pasajeros |
| FU | Furgoneta |
| IN | Industrial General |
| MO | Monovolumen |
| MC | Motocarro |
| MT | Motocicleta |
| MV | Motocultor |
| QD | Quad |
| RE | Remolque |
| SR | Semirremolque |
| TT | Todo Terreno |
| TR | Tractor |
| TU | Turismo |
| TC | Turismo ciclomotor |
| VA | Vehículo agrícola |
| NI | Otro, ninguno de los anteriores |

## claves_combustible  (§13.3.17)

| Código | Descripción |
|---|---|
| DI | Diesel |
| EL | Eléctrico |
| GA | Gasolina |
| GL | Gas |
| GE | Híbrido |
| HI | Hidrógeno |

## claves_conductor  (§13.3.19)

| Código | Descripción |
|---|---|
| HA | Habitual |
| OC | Ocasional |

## claves_permiso  (§13.3.53)

| Código | Descripción |
|---|---|
| AM | Ciclomotores de dos o tres ruedas y cuadriciclos ligeros, aunque podrá estar limitado a la conducción de ciclomotores de tres ruedas y cuadriciclos ligeros. |
| A1 | Motocicletas con una cilindrada máxima de 125 cm³, una potencia máxima de 11 Kw. y una relación potencia/peso máxima de 0,1 Kw./Kg y triciclos de motor cuya potencia máxima no exceda de 15 kW. |
| A2 | Motocicletas con una potencia máxima de 35 kW y una relación potencia/peso máxima de 0,2 Kw/kg y no derivadas de un vehículo con más del doble de su potencia. |
| A | Motocicletas y triciclos de motor. |
| B | Automóviles cuya masa máxima autorizada no exceda de 3.500 Kg. que estén diseñados y construidos para el transporte de no más de ocho pasajeros además del conductor. Dichos automóviles podrán llevar enganchado un remolque cuya masa máxima autorizada no exceda de 750 Kg . Conjuntos de vehículos acoplados compuestos por un vehículo automóvil de los que autoriza a conducir el permiso de la clase B y un remolque cuya masa máxima autorizada exceda de 750 Kg., siempre que la masa máxima del conjunto no exceda de 4.250 Kg., sin perjuicio de las disposiciones que las normas de aprobación de tipo establezcan para estos vehículos. |
| BTP | Vehículos prioritarios cuando circulen en servicio urgente, vehículos que realicen transporte escolar cuando transporten escolares y vehículos destinados al transporte público de viajeros en servicio de tal naturaleza, todos ellos con una masa máxima autorizada no superior a 3500 Kg., y cuyo número de asientos, incluido el del conductor, no exceda de nueve. Hay que indicar que sólo tiene validez dentro del territorio nacional. |
| BE | Conjuntos de vehículos acoplados compuestos por un vehículo tractor de los que autoriza a conducir el permiso de la clase B y un remolque cuya masa máxima autorizada no exceda de 3.500 Kg., sin perjuicio de las disposiciones que las normas de aprobación de tipo establezcan para estos vehículos. |
| C1 | Automóviles distintos de los que autoriza a conducir el permiso de las clases D1 o D, cuya masa máxima autorizada exceda de 3.500 Kg. y no sobrepase los 7.500 Kg., diseñados y construidos para el transporte de no más de ocho pasajeros además del conductor. Dichos automóviles podrán llevar enganchado un remolque cuya masa máxima autorizada no exceda de 750 Kg. |
| C1E | Conjuntos de vehículos acoplados compuestos por un vehículo automóvil de los que autoriza a conducir el permiso de la clase C1 y un remolque o semirremolque cuya masa máxima autorizada exceda de 750 kilogramos, siempre que la masa máxima autorizada del conjunto así formado no exceda de 12.000 kilogramos, sin perjuicio de las disposiciones que las normas de aprobación de tipo establezcan para estos vehículos. Conjuntos de vehículos acoplados compuestos por un vehículo tractor de los que autoriza a conducir el permiso de la clase B y un remolque o semirremolque cuya masa máxima autorizada exceda de 3.500 Kg., siempre que la masa máxima autorizada del conjunto no exceda de 12.000 Kg., sin perjuicio de las disposiciones que las normas de aprobación de tipo establezcan para estos vehículos. |
| C | Automóviles distintos de los que autoriza a conducir el permiso de las clases D1 o D, cuya masa máxima autorizada exceda de 3.500 Kg. que estén diseñados y construidos para el transporte de no más de ocho pasajeros además del conductor. Dichos automóviles podrán llevar enganchado un remolque cuya masa máxima autorizada no exceda de 750 Kg. |
| CE | Conjuntos de vehículos acoplados compuestos por un vehículo tractor de los que autoriza a conducir el permiso de la clase C y un remolque o semirremolque cuya masa máxima autorizada exceda de 750 Kg., sin perjuicio de las disposiciones que las normas de aprobación de tipo establezcan para estos vehículos. |
| D1 | Automóviles diseñados y construidos para el transporte de no más de dieciséis pasajeros además del conductor y cuya longitud máxima no exceda de ocho metros. Dichos automóviles podrán llevar enganchado un remolque cuya masa máxima autorizada no exceda de 750 Kg. |
| D1E | Conjuntos de vehículos acoplados compuestos por un vehículo tractor de los que autoriza a conducir el permiso de la clase D1 y un remolque cuya masa máxima autorizada exceda de 750 Kg., sin perjuicio de las disposiciones que las normas de aprobación de tipo establezcan para estos vehículos. |
| D | Automóviles autoriza para conducir automóviles diseñados y construidos para el transporte de más de ocho pasajeros además del conductor. Dichos automóviles podrán llevar enganchado un remolque cuya masa máxima autorizada no exceda de 750 Kg. |
| DE | Conjuntos de vehículos autoriza para conducir conjuntos de vehículos acoplados compuestos por un vehículo tractor de los que autoriza a conducir el permiso de la clase D y un remolque cuya masa máxima autorizada exceda de 750 kg, sin perjuicio de las disposiciones que las normas de aprobación de tipo establezcan para estos vehículos. |

