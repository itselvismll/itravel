import { createClient } from '@supabase/supabase-js';
import { API_CONFIG } from '../utils/constants';

// Criar cliente do Supabase
export const supabase = createClient(
  API_CONFIG.SUPABASE_URL,
  API_CONFIG.SUPABASE_ANON_KEY
);

// Função de cadastro
export async function signUp(email, password, username, fullName) {
  try {
    // 1. Criar usuário na autenticação
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    // 2. Criar perfil do usuário
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          id: authData.user.id,
          username,
          full_name: fullName,
          display_name: fullName,
          avatar_url: null,
          bio: null,
        },
      ]);

    if (profileError) throw profileError;

    return { success: true, user: authData.user };
  } catch (error) {
    console.error('Erro no cadastro:', error);
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
    console.error('Erro no login:', error);
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
    console.error('Erro no logout:', error);
    return { success: false, error: error.message };
  }
}

// Função para pegar usuário atual
export async function getCurrentUser() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
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
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
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
    console.error('Erro ao buscar países visitados:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Função para marcar país como visitado
export async function markCountryAsVisited(userId, countryCode, countryName) {
  try {
    const { data, error } = await supabase
      .from('visited_countries')
      .insert([
        {
          user_id: userId,
          country_code: countryCode,
          country_name: countryName,
        },
      ])
      .select();

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Erro ao marcar país:', error);
    return { success: false, error: error.message };
  }
}

// Função para desmarcar país como visitado
export async function unmarkCountryAsVisited(userId, countryCode) {
  try {
    const { error } = await supabase
      .from('visited_countries')
      .delete()
      .eq('user_id', userId)
      .eq('country_code', countryCode);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Erro ao desmarcar país:', error);
    return { success: false, error: error.message };
  }
}