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
};

export const LIMITS = {
  MAX_PHOTOS_PER_POST: 10,
  STORY_DURATION_HOURS: 24,
  MAX_BIO_LENGTH: 150,
  MAX_CAPTION_LENGTH: 500,
};
