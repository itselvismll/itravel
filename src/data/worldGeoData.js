// Função para carregar dados GeoJSON de todos os países do mundo
import { getWorldGeoData } from '../services/geoService';

export async function loadWorldCountries() {
  try {
    // Carrega dados de ~200 países do GitHub (fonte pública)
    return await getWorldGeoData();
  } catch (error) {
    return null;
  }
}

// Lista de países visitados (códigos ISO A3 corretos)
export const VISITED_COUNTRIES = [
  'ARG', // Argentina (você clicou e viu que é ARG)
  'BRA', // Brasil
  'USA', // Estados Unidos
  'FRA', // França
  'ESP', // Espanha
  'ITA', // Itália
  'JPN', // Japão
  'PRT', // Portugal
  'MEX', // México
];
