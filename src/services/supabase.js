import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { API_CONFIG } from '../utils/constants';
import { getAlpha2, getAlpha3 } from '../utils/countryUtils';

WebBrowser.maybeCompleteAuthSession();

if (!API_CONFIG.SUPABASE_URL || !API_CONFIG.SUPABASE_ANON_KEY) {
  throw new Error(
    'Configuração do Supabase ausente. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

// Criar cliente do Supabase
export const supabase = createClient(
  API_CONFIG.SUPABASE_URL,
  API_CONFIG.SUPABASE_ANON_KEY
);

// Função de cadastro
export async function signUp(email, password, username, fullName) {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.trim().toLowerCase(),
          full_name: fullName,
          display_name: fullName,
        },
      },
    });

    if (authError) throw authError;

    if (!authData.user) throw new Error('Não foi possível criar o usuário.');

    return { success: true, user: authData.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Função de login
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const getGoogleRedirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }

  return Linking.createURL('auth/callback');
};

const finishNativeOAuthSession = async (callbackUrl) => {
  const parsedUrl = new URL(callbackUrl);
  const code = parsedUrl.searchParams.get('code');

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }

  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (!accessToken || !refreshToken) {
    throw new Error('O Google não retornou uma sessão válida.');
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data.session;
};

export async function signInWithGoogle() {
  try {
    const redirectTo = getGoogleRedirectUrl();
    const isNative = Platform.OS !== 'web';
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: isNative,
      },
    });

    if (error) throw error;

    if (!isNative) {
      return { success: true, redirecting: true };
    }

    if (!data?.url) {
      throw new Error('Não foi possível iniciar o login com Google.');
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
      return { success: false, cancelled: true, error: 'Login cancelado.' };
    }
    if (browserResult.type !== 'success' || !browserResult.url) {
      throw new Error('Não foi possível concluir o login com Google.');
    }

    const session = await finishNativeOAuthSession(browserResult.url);
    return { success: true, user: session?.user || null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Função de logout
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Função para pegar usuário atual
export async function getCurrentUser() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

// Função para pegar perfil do usuário
export async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch {
    return null;
  }
}

// Função para buscar países visitados
export async function getVisitedCountries(userId) {
  try {
    const { data, error } = await supabase
      .from('visited_countries')
      .select('*')
      .eq('user_id', userId)
      .order('visited_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message, data: [] };
  }
}

// Função para marcar país como visitado
export async function markCountryAsVisited(userId, countryCode, countryName) {
  try {
    const normalizedCountryCode = getAlpha3(countryCode)?.toUpperCase() || countryCode?.toUpperCase();
    const { data, error } = await supabase
      .from('visited_countries')
      .upsert([
        {
          user_id: userId,
          country_code: normalizedCountryCode,
          country_name: countryName,
        },
      ], { onConflict: 'user_id,country_code' })
      .select();

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Função para desmarcar país como visitado
export async function unmarkCountryAsVisited(userId, countryCode) {
  try {
    const possibleCodes = [
      getAlpha3(countryCode)?.toUpperCase(),
      getAlpha2(countryCode)?.toUpperCase(),
      countryCode?.toUpperCase(),
    ].filter(Boolean);
    const { error } = await supabase
      .from('visited_countries')
      .delete()
      .eq('user_id', userId)
      .in('country_code', [...new Set(possibleCodes)]);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
