export const TRAVELER_LEVELS = [
  { level: 1, name: 'Iniciante',       icon: '🌱', minCountries: 0  },
  { level: 2, name: 'Viajante',        icon: '🧳', minCountries: 2  },
  { level: 3, name: 'Explorador',      icon: '🧭', minCountries: 5  },
  { level: 4, name: 'Globetrotter',    icon: '🌍', minCountries: 10 },
  { level: 5, name: 'Lenda Viajante',  icon: '👑', minCountries: 20 },
];

export const getLevelInfo = (countryCount) => {
  let current = TRAVELER_LEVELS[0];
  let next = null;
  for (let i = 0; i < TRAVELER_LEVELS.length; i++) {
    if (countryCount >= TRAVELER_LEVELS[i].minCountries) {
      current = TRAVELER_LEVELS[i];
      next = TRAVELER_LEVELS[i + 1] || null;
    }
  }
  const progress = next
    ? (countryCount - current.minCountries) / (next.minCountries - current.minCountries)
    : 1;
  return { current, next, progress: Math.min(progress, 1), countryCount };
};
