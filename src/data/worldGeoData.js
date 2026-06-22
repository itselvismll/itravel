// Função para carregar dados GeoJSON de todos os países do mundo
export async function loadWorldCountries() {
  try {
    // Carrega dados de ~200 países do GitHub (fonte pública)
    const response = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro ao carregar mapa:', error);
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