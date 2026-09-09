// Journi theme constants
export const COLORS = {
  primary: '#6C2BD9',
  primaryLight: 'rgba(108,43,217,0.15)',
  primaryDark: '#5621B0',
  accent: '#FF4D6D',
  teal: '#00D1C1',
  warning: '#FF9A00',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#666666',
  lightGray: '#E5E5E5',
  background: '#FAFAFA',
  dark: '#0D1326',
  text: '#0D1326',
  textLight: '#F7F7F2',
  textSecondary: '#999999',
  border: '#F0F0F0',
  success: '#00D1C1',
  error: '#FF4D6D',
  warning2: '#FF9A00',
};

export const SIZES = {
  base: 8,
  font: 14,
  radius: 12,
  padding: 16,
  margin: 16,
  h1: 36,
  h2: 28,
  h3: 22,
  h4: 18,
  body: 14,
  small: 12,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// Configurações da API
export const API_CONFIG = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  WEB_APP_URL: process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://journi.expo.app',
  // Style vetorial do mapa (Stadia Maps): rótulos, fronteiras e ruas. Em localhost
  // e em domínios autorizados no painel da Stadia a key é opcional; fora deles os
  // tiles retornam 401 sem ela.
  STADIA_API_KEY: process.env.EXPO_PUBLIC_STADIA_API_KEY || '',
  // Imagem de satélite do globo (Mapbox Raster Tiles API). Token PÚBLICO (pk.*):
  // ele viaja em toda requisição de tile e está no bundle por natureza — o que o
  // protege é a lista de URLs autorizadas no painel do Mapbox, não o segredo.
  // Sem ele o globo carrega a style vetorial e fica sem imagem de satélite.
  MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '',
  // Site key publica do hCaptcha. A secret key fica so no painel do Supabase
  // (Authentication -> Attack Protection); aqui entra apenas a metade publica.
  HCAPTCHA_SITE_KEY: process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY || '',
};

export const LIMITS = {
  MAX_PHOTOS_PER_POST: 10,
  STORY_DURATION_HOURS: 24,
  MAX_BIO_LENGTH: 150,
  MAX_CAPTION_LENGTH: 500,
};
