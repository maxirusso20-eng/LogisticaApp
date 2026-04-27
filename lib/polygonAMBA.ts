// lib/polygonAMBA.ts
//
// Coordenadas del polígono del Área Metropolitana de Buenos Aires (AMBA).
// Se usan en mapa.tsx para crear una "máscara inversa" que oscurece todo
// lo que está fuera del área operativa de la logística.
//
// Antes: este array (~80 puntos, ~6KB) estaba hardcodeado dentro de mapa.tsx,
// bloating el bundle. Ahora está en un módulo aparte → el metro bundler
// lo tree-shake-a bien y solo se carga si mapa.tsx está en el bundle.

export interface LatLng {
  latitude: number;
  longitude: number;
}

// "Mundo" completo — las 4 esquinas de la tierra, para la máscara inversa
export const MUNDO: LatLng[] = [
  { latitude: 90, longitude: -180 },
  { latitude: 90, longitude: 180 },
  { latitude: -90, longitude: 180 },
  { latitude: -90, longitude: -180 },
];

// Polígono que delimita el área operativa AMBA
// Los comentarios documentan cada zona geográfica para futuros cambios
export const POLIGONO_AMBA: LatLng[] = [
  // COSTA NORTE / ZÁRATE / CAMPANA
  { latitude: -34.0950, longitude: -59.0240 }, // Zárate (Río)
  { latitude: -34.1200, longitude: -58.9950 }, // Zárate Costa Sur
  { latitude: -34.1480, longitude: -58.9650 }, // Campana RN9
  { latitude: -34.1650, longitude: -58.9550 }, // Campana Centro
  { latitude: -34.2000, longitude: -58.9200 }, // Cardales (Norte)
  { latitude: -34.2500, longitude: -58.8700 }, // Río Luján

  // ESCOBAR / DELTA
  { latitude: -34.3000, longitude: -58.8200 }, // Otamendi
  { latitude: -34.3350, longitude: -58.7800 }, // Escobar
  { latitude: -34.3500, longitude: -58.7300 }, // Matheu
  { latitude: -34.3750, longitude: -58.6800 }, // Ing Maschwitz
  { latitude: -34.4000, longitude: -58.6200 }, // Benavídez Centro

  // COSTANERA NORTE AMBA (ALTA FIDELIDAD)
  { latitude: -34.4100, longitude: -58.5900 }, // Delta Tigre
  { latitude: -34.4260, longitude: -58.5790 }, // Tigre
  { latitude: -34.4440, longitude: -58.5410 }, // San Fernando
  { latitude: -34.4600, longitude: -58.5200 }, // Beccar / San Isidro
  { latitude: -34.4710, longitude: -58.5040 }, // San Isidro Catedral
  { latitude: -34.4850, longitude: -58.4900 }, // Acassuso
  { latitude: -34.4950, longitude: -58.4850 }, // Martínez / La Lucila
  { latitude: -34.5090, longitude: -58.4750 }, // Olivos
  { latitude: -34.5200, longitude: -58.4600 }, // Vicente López
  { latitude: -34.5300, longitude: -58.4400 }, // CABA Norte (Ciudad Univ)
  { latitude: -34.5500, longitude: -58.4000 }, // Aeroparque
  { latitude: -34.5700, longitude: -58.3800 }, // Recoleta Costa
  { latitude: -34.5900, longitude: -58.3600 }, // Puerto Madero Norte
  { latitude: -34.6150, longitude: -58.3550 }, // Reserva Ecológica
  { latitude: -34.6340, longitude: -58.3550 }, // La Boca

  // COSTANERA SUR (Avellaneda - La Plata)
  { latitude: -34.6500, longitude: -58.3500 }, // Dock Sud / Riachuelo
  { latitude: -34.6700, longitude: -58.3200 }, // Avellaneda Costa
  { latitude: -34.6850, longitude: -58.2900 }, // Bernal costa
  { latitude: -34.7080, longitude: -58.2430 }, // Quilmes costa
  { latitude: -34.7300, longitude: -58.2200 }, // Ezpeleta Costa
  { latitude: -34.7570, longitude: -58.2000 }, // Berazategui costa
  { latitude: -34.7800, longitude: -58.1700 }, // Plátanos
  { latitude: -34.7930, longitude: -58.1400 }, // Hudson costa
  { latitude: -34.8150, longitude: -58.0000 }, // Punta Lara
  { latitude: -34.8500, longitude: -57.9300 }, // Ensenada costa
  { latitude: -34.8700, longitude: -57.8800 }, // Berisso Norte
  { latitude: -34.8900, longitude: -57.8500 }, // Berisso Sur
  { latitude: -34.9300, longitude: -57.8400 }, // Los Talas

  // LÍMITE SUR ESTE (La Plata Sur -> Brandsen)
  { latitude: -34.9700, longitude: -57.9000 }, // Ignacio Correas
  { latitude: -35.0000, longitude: -57.9800 }, // Arana
  { latitude: -35.0400, longitude: -58.0500 }, // Ángel Etcheverry
  { latitude: -35.1000, longitude: -58.1300 }, // Oliden RP 36
  { latitude: -35.1500, longitude: -58.2000 }, // Gómez
  { latitude: -35.1700, longitude: -58.2400 }, // Coronel Brandsen
  { latitude: -35.1650, longitude: -58.2900 }, // Altamirano

  // LÍMITE SUR (San Vicente -> Cañuelas)
  { latitude: -35.1200, longitude: -58.3500 }, // Domselaar
  { latitude: -35.0800, longitude: -58.3800 }, // Limite Korn
  { latitude: -35.0450, longitude: -58.4000 }, // San Vicente / A. Korn
  { latitude: -35.0200, longitude: -58.4400 }, // San Vicente Centro
  { latitude: -35.0500, longitude: -58.5500 }, // RP 16 limit
  { latitude: -35.0600, longitude: -58.7000 }, // Udaondo
  { latitude: -35.0400, longitude: -58.7800 }, // Cañuelas Centro
  { latitude: -34.9900, longitude: -58.8000 }, // Uribelarrea

  // LÍMITE OESTE (Marcos Paz -> Rodríguez -> Luján)
  { latitude: -34.9400, longitude: -58.7800 }, // Ezeiza límite oeste
  { latitude: -34.8800, longitude: -58.7500 }, // Virrey del Pino
  { latitude: -34.7900, longitude: -58.8500 }, // Marcos Paz
  { latitude: -34.7200, longitude: -58.8900 }, // Villars limit
  { latitude: -34.6600, longitude: -58.9400 }, // General Rodríguez Sur
  { latitude: -34.6200, longitude: -58.9600 }, // General Rodríguez Oeste
  { latitude: -34.5800, longitude: -59.1200 }, // Luján Sur / Olivera
  { latitude: -34.5400, longitude: -59.1300 }, // Luján Centro
  { latitude: -34.4800, longitude: -59.1000 }, // Carlos Keen
  { latitude: -34.4300, longitude: -59.0400 }, // Open Door

  // LÍMITE NOROESTE (Pilar -> Capilla del Señor -> Zárate)
  { latitude: -34.4500, longitude: -58.9800 }, // Manzanares
  { latitude: -34.4000, longitude: -58.9200 }, // Pilar Norte / Fátima
  { latitude: -34.3300, longitude: -59.0300 }, // Los Cardales
  { latitude: -34.2900, longitude: -59.1000 }, // Capilla del Señor
  { latitude: -34.2000, longitude: -59.0800 }, // Escalada (Ruta 193)
  { latitude: -34.1200, longitude: -59.0800 }, // Zárate Oeste
  { latitude: -34.0950, longitude: -59.0240 }, // Cierre en Zárate
];