# EIAC V07.1 — tablas de referencia, formatos, lista de procesos y control de cambios

> Fuente: `209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05` (TIREA, 03/06/2026). Texto del PDF (pdftotext -layout) sin cabeceras/pies de página; columnas conservadas tal cual. Sin interpretar.
> Secciones: §7.2 lista de procesos · §10.1 tipos simples con formato · §10.3.1 ramo · §10.3.2 provincia · §10.3.3 país · §10.3.4 RGV-Servicio (uso de vehículo) · §11 control de cambios V07.1 sobre V06.

## §7.2 Lista de procesos (código de proceso -> objeto, origen, destino, clase, transacción)

```text
                          7.2. Lista de procesos
                    Lista de procesos con relación entre Código de proceso y Clase de objeto/ transacción.
  Clave       Objeto               Origen         Destino      Denominación                                Clase           Transacción
          131 Póliza               Entidad        Mediador     Información de Pólizas de Nueva             NP              OR
                                                               Producción
          132    Póliza            Entidad        Mediador     Información de Pólizas de Cartera           CA              OR
          133    Póliza            Entidad        Mediador     Información de Suplementos de Póliza        SU              OR
          134    Póliza            Entidad        Mediador     Precartera de pólizas colectivas            PC              OR
          151    Póliza            Entidad        Mediador     Información de Anulaciones de Póliza        AN              OR
          199    Póliza            Entidad        Mediador     Carga Masiva de Pólizas, Suplementos        NP, CA, SU,     CM
                                                               y Anulaciones                               AN
          211 Recibo               Entidad        Mediador     Emisión de Recibos Nueva Producción         NP              OR
          212 Recibo               Entidad        Mediador     Emisión de Recibos Cartera                  CA              OR
213   Recibo             Entidad        Mediador     Emisión de Recibos de Suplemento       SU              OR
214   Recibo             Entidad        Mediador     Precartera de recibos                  PC              OR
251   Recibo             Entidad        Mediador     Emisión de Recibos Extornos            EX              OR
261   Recibo             Entidad        Mediador     Movimientos de Recibo                  MO              OR
269   Recibo             Entidad        Mediador     Carga Masiva de Movimientos de         MO              CM
                                                     Recibo
299 Recibo               Entidad        Mediador     Carga Masiva de Recibos                NP, CA, SU,     CM
                                                                                            EX
271 Recibo               Entidad        Mediador     Rechazo movimientos de Recibo          MO              RE
771 Recibo               Mediador       Entidad      Rechazo de Emisión de Recibos Nueva    NP              RE
                                                     Producción
772 Recibo               Mediador       Entidad      Rechazo de Emisión de Recibos          CA              RE
                                                     Cartera
773 Recibo               Mediador       Entidad      Rechazo de Emisión de Recibos de       SU              RE
                                                     Suplemento
774 Recibo               Mediador       Entidad      Rechazo de Emisión de Recibos          EX              RE
                                                     Extornos de anulación de póliza
761   Recibo             Mediador       Entidad      Movimientos de Recibo                  MO              OR
775   Recibo             Mediador       Entidad      Rechazo movimientos de Recibo          MO              RE
311   Siniestro          Entidad        Mediador     Declaración de nuevos siniestros       DE              OR
361   Siniestro          Entidad        Mediador     Movimientos y pagos de siniestro       MO              OR
399   Siniestro          Entidad        Mediador     Carga masiva de siniestros             CA              CM
371   Siniestro          Entidad        Mediador     Rechazo de alta nuevos siniestros      DE              RE
372   Siniestro          Entidad        Mediador     Rechazo movimientos y pagos de         MO              RE
                                                     siniestro
841 Siniestro            Mediador       Entidad      Solicitud alta nuevos siniestros       DE              SO
861 Siniestro            Mediador       Entidad      Movimientos y pagos de siniestro       MO              OR
500 Liquidación          Entidad        Mediador     Liquidación de cuenta de efectivo      LI              OR
501 Liquidación          Mediador       Entidad      Liquidación de cuenta de efectivo      LI              OR
502 Cuenta               Entidad        Mediador     Emisión de cuenta de efectivo          CE              OR
    efectivo
601 Mensaje              Entidad        Mediador     Envío de mensaje                       MS              OR
```

## §10.1 Tipos de dato simple: formato

```text
                    10.1. Formato
                Incluyen algún tipo de restricción sobre el formato del campo donde se aplica.
Tipo                Base           Restricción                                             Aplica
_t_bic              xs:string      ISO 9362:2014                                           BIC
_t_codigoDGS        xs:string      Entre 5 y 22 letras mayúsculas, dígitos, "-" , "/" o    Código Emisor, Receptor y Mediador.
                                   espacio en blanco.
_t_edad             xs:unsignedInt Entre 1 y 99                                            Edad
_t_idioma           xs:string      ISO 639-1                                               Idioma
_t_iban             xs:string      ISO 13616-1:2007                                        IBAN
_t_matricula        xs:string      Entre 4 y 12 letras mayúsculas, dígitos, "-".           Matricula
_t_moneda           xs:string      ISO 4217                                                Moneda
_t_pais             xs:string      ISO 3166-1 alpha-3.                                     Pais
_t_provincia        xs:string      Tabla provincias.                                       Provincia
_t_telefono         xs:token       Formato teléfono.                                       Num Teléfono
_t_CnoCnae          xs:string      CNAE 2009. CNO-11.                                      Profesión, Actividad.
_t_num2dec          xs:decimal     Máximo 2 decimales. Aplicar redondeo.                   Importes (excepto capitales)
_t_num2dou          xs:double      Máximo 2 decimales. Admite INF. Aplicar                 Capitales.
                                   redondeo.
_t_usovehiculo      xs:string      Tabla RGV-Servicio                                      Uso vehículo.
_t_codigoDGSea      xs:string      1 letra mayúscula más 4 dígitos.                        Código Entidad.
```

## §10.3.1 Ramo (clave = Grupo + Ramo + Detalle)

```text
        La clave se compone de Grupo + Ramo + Detalle.
Grupo          Ramo         Detalle       Clave        Descripción
           1            1             1            111 Vida individual
           1            2             1            121 Vida colectivo
           2            1             1            211 Accidentes
           2            2             1            221 Enfermedad
           2            3             1            231 Asistencia sanitaria
           2            4             1            241 Autos
           2            5             1            251 Transportes
           2            6             1            261 Incendios y elementos naturales
           2            7             1            271 Otros daños a los bienes: seguros agrarios combinados
           2            7             2            272 Otros daños a los bienes: robo u otros
           2            7             3            273 Otros daños a los bienes: total otros daños
           2            8             1            281 Responsabilidad civil en general: riesgos nucleares
           2            8             2            282 Responsabilidad civil en general: otros riesgos
           2            9             1            291 Crédito
           2           10             1           2101 Caución
           2           11             1           2111 Pérdidas diversas
           2           12             1           2121 Defensa jurídica
           2           13             1           2131 Asistencia
           2           14             1           2141 Decesos
             2            15            1            2151 Multirriesgo hogar
             2            16            1            2161 Multirriesgo comunidades
             2            17            1            2171 Multirriesgo comercios
             2            18            1            2181 Multirriesgo industriales
             2            19            1            2191 Otros multirriesgos
```

## §10.3.2 Provincia (_t_provincia)

```text
Código        Provincia           Código       Provincia
            1 Álava                         27 Lugo
            2 Albacete                      28 Madrid
            3 Alicante                      29 Málaga
            4 Almería                       30 Murcia
            5 Ávila                         31 Navarra
            6 Badajoz                       32 Orense
            7 Baleares                      33 Asturias
            8 Barcelona                     34 Palencia
            9 Burgos                        35 Las Palmas
           10 Cáceres                       36 Pontevedra
           11 Cádiz                         37 Salamanca
           12 Castellón                     38 Santa Cruz de Tenerife
           13 Ciudad Real                   39 Cantabria
           14 Córdoba                       40 Segovia
           15 La Coruña                     41 Sevilla
           16 Cuenca                        42 Soria
           17 Girona                        43 Tarragona
           18 Granada                       44 Teruel
           19 Guadalajara                   45 Toledo
           20 Guipúzcoa                     46 Valencia
           21 Huelva                        47 Valladolid
           22 Huesca                        48 Vizcaya
           23 Jaén                          49 Zamora
           24 León                          50 Zaragoza
           25 Lérida                        51 Ceuta
           26 La Rioja                      52 Melilla
                                             0 EXTRANJERA
```

## §10.3.3 País (_t_pais, ISO 3166-1 alpha-3)

```text
País o Área                                        ISO alpha-3     País o Área                                  ISO alpha-3
Afghanistan                                 AFG              Lesotho                                       LSO
Aland Islands                               ALA              Liberia                                       LBR
Albania                                     ALB              Libya                                         LBY
Algeria                                     DZA              Liechtenstein                                 LIE
American Samoa                              ASM              Lithuania                                     LTU
Andorra                                     AND              Luxembourg                                    LUX
Angola                                      AGO              Macedonia, Republic of                        MKD
Anguilla                                    AIA              Madagascar                                    MDG
Antarctica                                  ATA              Malawi                                        MWI
Antigua and Barbuda                         ATG              Malaysia                                      MYS
Argentina                                   ARG              Maldives                                      MDV
Armenia                                     ARM              Mali                                          MLI
Aruba                                       ABW              Malta                                         MLT
Australia                                   AUS              Marshall Islands                              MHL
Austria                                     AUT              Martinique                                    MTQ
Azerbaijan                                  AZE              Mauritania                                    MRT
Bahamas                                     BHS              Mauritius                                     MUS
Bahrain                                     BHR              Mayotte                                       MYT
Bangladesh                                  BGD              Mexico                                        MEX
Barbados                                    BRB              Micronesia, Federated States of               FSM
Belarus                                     BLR              Moldova                                       MDA
Belgium                                     BEL              Monaco                                        MCO
Belize                                      BLZ              Mongolia                                      MNG
Benin                                       BEN              Montenegro                                    MNE
Bermuda                                     BMU              Montserrat                                    MSR
Bhutan                                      BTN              Morocco                                       MAR
Bolivia                                     BOL              Mozambique                                    MOZ
Bosnia and Herzegovina                      BIH              Myanmar                                       MMR
Botswana                                    BWA              Namibia                                       NAM
Bouvet Island                               BVT              Nauru                                         NRU
Brazil                                      BRA              Nepal                                         NPL
British Virgin Islands                      VGB              Netherlands                                   NLD
British Indian Ocean Territory              IOT              Netherlands Antilles                          ANT
Brunei Darussalam                           BRN              New Caledonia                                 NCL
Bulgaria                                    BGR              New Zealand                                   NZL
Burkina Faso                                BFA              Nicaragua                                     NIC
Burundi                                     BDI              Niger                                         NER
Cambodia                                    KHM              Nigeria                                       NGA
Cameroon                                    CMR              Niue                                          NIU
Canada                                      CAN              Norfolk Island                                NFK
Cape Verde                                  CPV              Northern Mariana Islands                      MNP
Cayman Islands                              CYM              Norway                                        NOR
Central African Republic                        CAF              Oman                                            OMN
Chad                                            TCD              Pakistan                                        PAK
Chile                                           CHL              Palau                                           PLW
China                                           CHN              Palestinian Territory, Occupied                 PSE
Hong Kong, Special Administrative Region of
China                                           HKG              Panama                                          PAN
Macao, Special Administrative Region of China   MAC              Papua New Guinea                                PNG
Christmas Island                                CXR              Paraguay                                        PRY
Cocos (Keeling) Islands                         CCK              Peru                                            PER
Colombia                                        COL              Philippines                                     PHL
Comoros                                         COM              Pitcairn                                        PCN
Congo (Brazzaville)                             COG              Poland                                          POL
Congo, Democratic Republic of the               COD              Portugal                                        PRT
Cook Islands                                    COK              Puerto Rico                                     PRI
Costa Rica                                      CRI              Qatar                                           QAT
Côte d'Ivoire                                   CIV              Réunion                                         REU
Croatia                                         HRV              Romania                                         ROU
Cuba                                            CUB              Russian Federation                              RUS
Cyprus                                          CYP              Rwanda                                          RWA
Czech Republic                                  CZE              Saint-Barthélemy                                BLM
Denmark                                         DNK              Saint Helena                                    SHN
Djibouti                                        DJI              Saint Kitts and Nevis                           KNA
Dominica                                        DMA              Saint Lucia                                     LCA
Dominican Republic                              DOM              Saint-Martin (French part)                      MAF
Ecuador                                         ECU              Saint Pierre and Miquelon                       SPM
Egypt                                           EGY              Saint Vincent and Grenadines                    VCT
El Salvador                                     SLV              Samoa                                           WSM
Equatorial Guinea                               GNQ              San Marino                                      SMR
Eritrea                                         ERI              Sao Tome and Principe                           STP
Estonia                                         EST              Saudi Arabia                                    SAU
Ethiopia                                        ETH              Senegal                                         SEN
Falkland Islands (Malvinas)                     FLK              Serbia                                          SRB
Faroe Islands                                   FRO              Seychelles                                      SYC
Fiji                                            FJI              Sierra Leone                                    SLE
Finland                                         FIN              Singapore                                       SGP
France                                          FRA              Slovakia                                        SVK
French Guiana                                   GUF              Slovenia                                        SVN
French Polynesia                                PYF              Solomon Islands                                 SLB
French Southern Territories                     ATF              Somalia                                         SOM
Gabon                                           GAB              South Africa                                    ZAF
Gambia                                          GMB              South Georgia and the South Sandwich Islands    SGS
Georgia                                         GEO              South Sudan                                     SSD
Germany                                         DEU              Spain                                              ESP
Ghana                                           GHA              Sri Lanka                                          LKA
Gibraltar                                       GIB              Sudan                                              SDN
Greece                                          GRC              Suriname *                                         SUR
Greenland                                       GRL              Svalbard and Jan Mayen Islands                     SJM
Grenada                                         GRD              Swaziland                                          SWZ
Guadeloupe                                      GLP              Sweden                                             SWE
Guam                                            GUM              Switzerland                                        CHE
Guatemala                                       GTM              Syrian Arab Republic (Syria)                       SYR
Guernsey                                        GGY              Taiwan, Republic of China                          TWN
Guinea                                          GIN              Tajikistan                                         TJK
Guinea-Bissau                                   GNB              Tanzania *, United Republic of                     TZA
Guyana                                          GUY              Thailand                                           THA
Haiti                                           HTI              Timor-Leste                                        TLS
Heard Island and Mcdonald Islands               HMD              Togo                                               TGO
Holy See (Vatican City State)                   VAT              Tokelau                                            TKL
Honduras                                        HND              Tonga                                              TON
Hungary                                         HUN              Trinidad and Tobago                                TTO
Iceland                                         ISL              Tunisia                                            TUN
India                                           IND              Turkey                                             TUR
Indonesia                                       IDN              Turkmenistan                                       TKM
Iran, Islamic Republic of                       IRN              Turks and Caicos Islands                           TCA
Iraq                                            IRQ              Tuvalu                                             TUV
Ireland                                         IRL              Uganda                                             UGA
Isle of Man                                     IMN              Ukraine                                            UKR
Israel                                          ISR              United Arab Emirates                               ARE
Italy                                           ITA              United Kingdom                                     GBR
Jamaica                                         JAM              United States of America                           USA
Japan                                           JPN              United States Minor Outlying Islands               UMI
Jersey                                          JEY              Uruguay                                            URY
Jordan                                          JOR              Uzbekistan                                         UZB
Kazakhstan                                      KAZ              Vanuatu                                            VUT
Kenya                                           KEN              Venezuela (Bolivarian Republic of)                 VEN
Kiribati                                        KIR              Viet Nam                                           VNM
Korea, Democratic People's Republic of          PRK              Virgin Islands, US                                 VIR
Korea, Republic of                              KOR              Wallis and Futuna Islands                          WLF
Kuwait                                          KWT              Western Sahara                                     ESH
Kyrgyzstan                                      KGZ              Yemen                                              YEM
Lao PDR                                         LAO              Zambia                                             ZMB
Latvia                                          LVA              Zimbabwe                                           ZWE
Lebanon                                         LBN
```

## §10.3.4 RGV-Servicio (_t_usovehiculo)

```text
REGLAMENTO GENERAL DE VEHÍCULOS
D. Servicio al que se destinan los vehículos
A efectos del servicio al que se destinan los vehículos, que se anota en el permiso de circulación, los vehículos se clasifican con
un código alfanumérico de tres caracteres, indicativo de dicho servicio, del siguiente modo:
Carácter primero, constituido por una letra:
     Servicio público: El vehículo se adscribe a una actividad para cuyo ejercicio su titular necesita de autorización de la
A Administración
B Servicio particular: El vehículo se adscribe a una actividad privada de su titular
Caracteres segundo y tercero, constituidos por dos cifras:
00 Sin especificar: El vehículo no ejerce ninguno de los otros servicios relacionados a continuación
01 Alquiler sin conductor: vehículo destinado a ser arrendado sin conductor
02 Alquiler con conductor (autoturismo): vehículo destinado al transporte de personas y equipajes con conductor
   Aprendizaje de la conducción: vehículo destinado al ejercicio de la enseñanza de la conducción y la realización de pruebas
03 de aptitud para la obtención de permisos y licencias de conducción
04 Taxi: vehículo adscrito al servicio público de viajeros en vehículo turismo
   Auxilio en carretera: vehículo destinado primordialmente al rescate y transporte de vehículos accidentados o averiados.
   Sólo tendrán esta consideración aquellos vehículos cuya capacidad permita que simultáneamente se puedan transportar
   hasta un máximo de dos vehículos en plataforma, y otro mediante un dispositivo de arrastre, y cuenten con el
05 correspondiente utillaje
06 Agrícola: vehículo destinado a realizar labores agrícolas
07 Ambulancia: vehículo destinado a realizar transporte de personas enfermas o accidentadas
08 Funerario: vehículo destinado a realizar transporte de cadáveres
09 Obras: vehículo destinado a la realización de tareas en trabajos de construcción
10 Mercancías peligrosas: vehículo destinado al transporte de materias peligrosas, aunque no se realice con carácter exclusivo
11 Basurero: vehículo destinado al transporte de residuos
12 Transporte escolar: vehículo destinado al transporte escolar y de menores, aunque no se realice con carácter exclusivo
13 Policía: vehículo destinado a los servicios de policía, que se presten por las Fuerzas y Cuerpos de Seguridad
14 Bomberos: vehículo destinado a ser utilizado por los bomberos para la extinción de incendios
15 Protección civil y salvamento: vehículo destinado a realizar servicios de protección civil y salvamento
16 Defensa: vehículo adscrito al Ministerio de Defensa
17 Vivienda: vehículo acondicionado para ser utilizado como vivienda
   Actividad económica: automóvil con al menos cuatro ruedas, destinado al transporte de mercancías, cuya masa máxima
   autorizada es igual o inferior a 3500 kg, que está afectado significativamente a una actividad económica de acuerdo con la
18 normativa tributaria
19 Recreativo: vehículo destinado específicamente al ocio
   Mercancías perecederas: vehículo destinado al transporte terrestre de productos alimentarios a temperatura regulada,
20 aunque no se realice con carácter exclusivo
21 Vehículo para ferias: vehículo adaptado para la maquinaria de circo o ferias recreativas ambulantes
```

## §11 Control de cambios (V07.1 sobre V06)

```text
Cambios introducidos en V07.1 sobre V06.
En las tablas del modelo de datos, los cambios se han marcado en color verde.
 Tipo de dato: Elemento. Obligatoriedad.
 (Si es condicionado no se aplica en esquema, se recoge en Descripción y Normas de uso)
 Tipo de dato                                Elemento                      Cambio
 tipo_poliza                                 DatosImportes                 Obligatorio
 tipo_riesgoRC                               Capitales                     No obligatorio.
 tipo_otrosmultirriesgos                     Capitales                     No obligatorio.
 tipo_datosliquidacion                       EstadoLiquidacion             Obligatorio
 Tipo de dato: Elemento: Tipo de dato
 asignado.
 Elementos con cambio en tipo de dato asignado.
 Tipo de dato                               Elemento                       Tipo asignado
 tipo_datospoliza                           CodigoEntidad                  _t_codigoDGSea
 tipo_datosrecibo                           Fechas                         tipo_fechasrecibo
 tipo_datosliquidacion                      CodigoEntidad                  _t_codigoDGSea
 tipo_cuentaefectivo                        CodigoEntidad                  _t_codigoDGSea
 tipo_domicilio                             CodigoPostal                   _char_20
 tipo_ramo                                  ModalidadRamo                  claves_modalidadramo
 tipo_vehiculo                              UsoVehiculo                    _t_usovehiculo
 tipo_maquina                               Bastidor                       _char_40
 tipo_prestamo                              NumeroPrestamo                 _char_80
 tipo_participacion                         CodigoEntidad                  _t_codigoDGSea
 tipo_pagadorcuadro                         Importe                        _t_num2dec
 tipo_polizacontrario                       CodigoEntidad                  _t_codigoDGSea
 tipo_movimientoliquidacion                 ImporteMovimiento              tipo_importeliquidacion
 Tipos de dato: Elemento.
 Añadidos / Eliminados.
 Tipo                           Elemento                      tipo                              Cambio
 tipo_objeto                    Mensaje                       tipo_mensaje                      Añadido
 tipo_detalleproceso            ClaseMensaje                  claves_clasemensaje               Añadido
 tipo_datospoliza               IdPolizaUnico                 _char_40                          Añadido
 tipo_datosrecibo               IdReciboUnico                 _char_40                          Añadido
 tipo_datosrecibo               Modificable                   xs:boolean                        Añadido
 tipo_datossiniestro            IdSiniestroUnico              _char_40                          Añadido
 tipo_datossiniestro            PorExpediente                 xs:boolean                        Añadido
 tipo_ramo                         PackComercial                   _char_40                          Añadido
 tipo_ramo                         DescripcionPackComercial        xs:string                         Añadido
 tipo_riesgo                       DatosImportes                   tipo_importes                     Añadido
 tipo_expediente                   AccionesExpediente              n_tipo_accionsiniestro            Añadido
 tipo_expediente                   PagosExpediente                 n_tipo_pagosiniestro              Añadido
 tipo_polizacolectiva              ClasePolizaColectiva            claves_clasepolizacolectiva       Añadido
 tipo_expediente                   Cobertura                                                         Eliminado
 tipo_expediente                   Coberturas                                                        Añadido
 Tipos de datos: Nuevos / Eliminados
 Tipo                                              Cambio
 tipo_mensaje                                      Nuevo
 tipo_datosmensaje                                 Nuevo
 tipo_mensajesiniestro                             Nuevo
 tipo_fechasrecibo                                 Nuevo
 tipo_adjunto                                      Nuevo
 n_tipo_adjunto                                    Nuevo
 tipo_importesliquidacion                          Eliminado.
 n_tipoimportesliquidacion                         Eliminado.
 tipo_importeliquidacion                           Nuevo
 Claves: Valores
 Clave                                   Código         Descripción                                   Cambio
 claves_codigoproceso                               601 Envío de mensaje                              Añadido
 claves_clasemovimientorecibo            CG             Cambio en gestión de cobro.                   Añadido
 claves_clasemovimientorecibo            NM             Recibo es no modificable.                     Añadido
 claves_clasevehiculo                    BU             Buggy                                         Añadido
 claves_clasevehiculo                    CG             Carrito de golf                               Añadido
 claves_clasevehiculo                    CC             Ciclo-carro                                   Añadido
 claves_clasevehiculo                    FH             Furgón habitable con pasajeros                Añadido
 claves_clasevehiculo                    MC             Motocarro                                     Añadido
 claves_clasevehiculo                    MV             Motocultor                                    Añadido
 claves_clasevehiculo                    SR             Semirremolque                                 Añadido
 claves_clasevehiculo                    TC             Turismo ciclomotor                            Añadido
 claves_clasevehiculo                    VA             Vehículo agrícola                             Añadido
 claves_formapago                        BI             BIZUM                                         Añadido
 claves_causarelacion                    SD             Sustitución de recibo por devolución.         Añadido
                                                        Confirmación Emisión de Recibos Nueva
 claves_codigoproceso                               721 Producción                                    Eliminado
 claves_codigoproceso                               722 Confirmación de Emisión de Recibos Cartera    Eliminado
                                                        Confirmación de Emisión de Recibos de
 claves_codigoproceso                               723 Suplemento                                     Eliminado
                                                        Confirmación de Emisión de Recibos
 claves_codigoproceso                               724 Extornos de anulación de póliza                Eliminado
 claves_transaccion                      CO             Confirmación                                   Eliminado
 claves_version                          6.0            Versión 6.0                                    Eliminado
 claves_version                          7.1            Versión 7.1                                    Añadido
 claves_combustible                      GE             Híbrido                                        Descripción
 claves_clasesuplemento                  CP             Cambio en gestión de cobro o forma de pago.    Descripción
 Claves: Nuevas / Eliminadas
 Clave                                             Cambio
 claves_clasepolizacolectiva                       Nuevo
 claves_modalidadramo                              Nuevo
 claves_mensajeambito                              Nuevo
 claves_mensajetitulo                              Nuevo
 claves_clasedocumento                             Nuevo
 claves_clasemensaje                               Nuevo
 claves_usovehiculo                                Eliminado.
 Tipos de dato simple
 Tipo simple                                       Cambio
 _t_usovehiculo                                    Añadido
 _t_codigoDGSea                                    Añadido
 _t_cpostal                                        Eliminado
 _t_codigoDGS                                      Modificado: Admite espacio en blanco.
 _t_matricula                                      Modificado: No admite espacios en blanco.
```

