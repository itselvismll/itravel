import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { API_CONFIG } from '../utils/constants';
import { getAlpha2, getAlpha3 } from '../utils/countryUtils';
import { normalizeUsername } from '../utils/username';

WebBrowser.maybeCompleteAuthSession();

if (!API_CONFIG.SUPABASE_URL || !API_CONFIG.SUPABASE_ANON_KEY) {
  throw new Error(
    'Configuração do Supabase ausente. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

// Criar cliente do Supabase
export const supabase = createClient(
  API_CONFIG.SUPABASE_URL,
  API_CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
    },
  }
);

const clearOAuthParamsFromBrowserUrl = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const cleanUrl = new URL(window.location.href);
  ['code', 'error', 'error_code', 'error_description'].forEach(param => (
    cleanUrl.searchParams.delete(param)
  ));
  cleanUrl.hash = '';
  window.history.replaceState(
    {},
    document.title,
    `${cleanUrl.pathname}${cleanUrl.search}`
  );
};

// Quem troca o `?code=` por sessão é o `detectSessionInUrl` do client, dentro do
// _initialize() que roda no construtor. Esta função NÃO repete essa troca: o code
// do PKCE é de uso único, e as duas chamadas competindo por ele derrubavam o login
// com Google (a perdedora recebia "invalid authorization code"). Aqui só olhamos o
// resultado — getSession() espera o initialize terminar — e reportamos a falha, que
// o auth-js guarda para si e nunca propaga para o app.
export async function completeWebOAuthSession() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const callbackUrl = new URL(window.location.href);
  // O auth-js só trata `error` na URL quando vem com `error_description` junto;
  // um `?error=access_denied` seco passaria batido, então checamos os dois.
  const oauthError = callbackUrl.searchParams.get('error_description')
    || callbackUrl.searchParams.get('error');
  if (oauthError) {
    clearOAuthParamsFromBrowserUrl();
    throw new Error(decodeURIComponent(oauthError.replace(/\+/g, ' ')));
  }

  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
  const isOAuthCallback = Boolean(
    callbackUrl.searchParams.get('code') || hashParams.get('access_token')
  );

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (isOAuthCallback && !data.session) {
    clearOAuthParamsFromBrowserUrl();
    throw new Error(
      'O provedor retornou um código de autorização, mas o Supabase não abriu a sessão. '
      + 'Verifique se a URL de redirecionamento está na allowlist do projeto.'
    );
  }

  // Em caso de sucesso o auth-js já remove o `code`; aqui varremos o que sobrou.
  if (isOAuthCallback) clearOAuthParamsFromBrowserUrl();

  return data.session;
}

// Função de cadastro
export async function signUp(email, password, username, fullName, captchaToken) {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Validado contra a secret key do hCaptcha configurada em
        // Authentication -> Attack Protection no painel do Supabase.
        captchaToken,
        data: {
          username: normalizeUsername(username),
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
export async function signIn(email, password, captchaToken) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    if (error) throw error;

    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const getPasswordRecoveryRedirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL(window.location.origin);
    url.searchParams.set('recovery', '1');
    return url.toString();
  }

  return Linking.createURL('reset-password', { queryParams: { recovery: '1' } });
};

export async function requestPasswordReset(email, captchaToken) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordRecoveryRedirectUrl(),
      // A proteção do hCaptcha no Supabase cobre a recuperação de senha também.
      captchaToken,
    });
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateRecoveredPassword(password) {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const getGoogleRedirectUrl = () => {
  // O PKCE guarda o code_verifier no localStorage da origem onde o fluxo começou.
  // Voltar para uma origem fixa quebraria o login sempre que ele não tivesse
  // começado nela (localhost, preview), porque lá o verifier não existe — por isso
  // o retorno é para a origem atual, com a URL de produção como rede de segurança.
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : API_CONFIG.WEB_APP_URL;
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
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
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
    const countryVariants = [
      normalizedCountryCode,
      getAlpha2(normalizedCountryCode)?.toUpperCase(),
    ].filter(Boolean);
    await supabase
      .from('wishlist')
      .delete()
      .eq('user_id', userId)
      .in('country_code', countryVariants);
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
