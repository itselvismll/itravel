const SOUTH_AMERICA = new Set([
  'BRA', 'ARG', 'CHL', 'COL', 'PER', 'VEN', 'ECU', 'BOL', 'PRY', 'URY', 'GUY', 'SUR',
]);

const EUROPE = new Set([
  'FRA', 'DEU', 'ITA', 'ESP', 'PRT', 'GBR', 'NLD', 'BEL', 'CHE', 'AUT',
  'SWE', 'NOR', 'DNK', 'FIN', 'GRC', 'POL', 'ROU', 'BGR', 'HRV', 'CZE',
  'HUN', 'SVK', 'SVN', 'EST', 'LVA', 'LTU', 'ALB', 'MKD', 'BIH', 'MNE',
  'MDA', 'BLR', 'UKR', 'SRB', 'MCO', 'AND', 'SMR', 'VAT', 'LIE', 'MLT',
  'CYP', 'ISL', 'LUX', 'IRL',
]);

const countSouthAmerica = (codes) =>
  codes.filter(c => SOUTH_AMERICA.has(c.toUpperCase())).length;

const hasEuropeCountry = (codes) =>
  codes.some(c => EUROPE.has(c.toUpperCase()));

export const ACHIEVEMENTS = [
  {
    id: 'first_country',
    icon: '🌍',
    title: 'Primeira Viagem',
    description: 'Visite seu primeiro país',
    check: (countries) => countries.length >= 1,
  },
  {
    id: 'five_countries',
    icon: '✈️',
    title: 'Explorador',
    description: 'Visite 5 países',
    check: (countries) => countries.length >= 5,
  },
  {
    id: 'ten_countries',
    icon: '🗺️',
    title: 'Viajante Frequente',
    description: 'Visite 10 países',
    check: (countries) => countries.length >= 10,
  },
  {
    id: 'south_america',
    icon: '🌴',
    title: 'Sul-americano',
    description: 'Visite 3 países da América do Sul',
    check: (countries) => countSouthAmerica(countries) >= 3,
  },
  {
    id: 'europe',
    icon: '🇪🇺',
    title: 'Primeira Europa',
    description: 'Visite um país europeu',
    check: (countries) => hasEuropeCountry(countries),
  },
  {
    id: 'first_review',
    icon: '⭐',
    title: 'Crítico',
    description: 'Avalie um lugar com nota e review',
    check: (countries, photoCount) => photoCount >= 1,
  },
];

export const getUnlockedAchievements = (visitedCountryCodes, photoCount) =>
  ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: a.check(visitedCountryCodes, photoCount),
  }));
