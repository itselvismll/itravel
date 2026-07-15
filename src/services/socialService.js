import { supabase } from './supabase';

export const getComments = async (photoId) => {
  const { data, error } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, profiles:user_id(username, display_name, avatar_url)')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: true });
  return { success: !error, data: data || [], error: error?.message };
};

export const addComment = async (photoId, content) => {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return { success: false, error: 'Usuário não autenticado' };
  const { error } = await supabase
    .from('comments')
    .insert({ photo_id: photoId, user_id: user.id, content });
  return { success: !error, error: error?.message };
};

export const deleteComment = async (commentId) => {
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  return { success: !error };
};

export const getTravelersByCountry = async (countryCode, currentUserId) => {
  const { data, error } = await supabase
    .from('visited_countries')
    .select('user_id, profiles:user_id(id, username, display_name, avatar_url)')
    .eq('country_code', countryCode);
  if (error) return { success: false, data: [], error: error.message };
  const seen = new Set();
  const travelers = [];
  for (const row of (data || [])) {
    if (!seen.has(row.user_id) && row.user_id !== currentUserId && row.profiles) {
      seen.add(row.user_id);
      travelers.push(row.profiles);
    }
  }
  return { success: true, data: travelers };
};

export const getSuggestedTravelers = async (userId) => {
  if (!userId) return { success: false, data: [] };
  const { data: myCountries } = await supabase
    .from('visited_countries')
    .select('country_code')
    .eq('user_id', userId);
  if (!myCountries || myCountries.length === 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .neq('id', userId)
      .limit(8);
    return { success: !error, data: (data || []).map(p => ({ ...p, commonCountries: 0 })) };
  }
  const myCodes = myCountries.map(c => c.country_code);
  const { data, error } = await supabase
    .from('visited_countries')
    .select('user_id, country_code, profiles:user_id(id, username, display_name, avatar_url)')
    .in('country_code', myCodes)
    .neq('user_id', userId);
  if (error) return { success: false, data: [], error: error.message };
  const overlap = {};
  for (const row of (data || [])) {
    if (!row.profiles) continue;
    if (!overlap[row.user_id]) overlap[row.user_id] = { profile: row.profiles, count: 0 };
    overlap[row.user_id].count++;
  }
  const sorted = Object.values(overlap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(o => ({ ...o.profile, commonCountries: o.count }));
  return { success: true, data: sorted };
};

export const addToWishlist = async (countryCode, countryName) => {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return { success: false, error: 'Não autenticado' };
  const { error } = await supabase
    .from('wishlist')
    .insert({ user_id: user.id, country_code: countryCode, country_name: countryName });
  return { success: !error, error: error?.message };
};

export const removeFromWishlist = async (countryCode) => {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return { success: false, error: 'Não autenticado' };
  const { error } = await supabase
    .from('wishlist')
    .delete()
    .eq('user_id', user.id)
    .eq('country_code', countryCode);
  return { success: !error, error: error?.message };
};

export const getWishlist = async (userId) => {
  const { data, error } = await supabase
    .from('wishlist')
    .select('id, country_code, country_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { success: !error, data: data || [], error: error?.message };
};

export const isInWishlist = async (countryCode) => {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return { success: true, data: false };
  const { data } = await supabase
    .from('wishlist')
    .select('id')
    .eq('user_id', user.id)
    .eq('country_code', countryCode)
    .maybeSingle();
  return { success: true, data: !!data };
};

export const searchTravelers = async (query, currentUserId) => {
  if (!query || query.length < 2) return { success: true, data: [] };
  const [profilesResult, countriesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .neq('id', currentUserId || '')
      .limit(8),
    supabase
      .from('visited_countries')
      .select('user_id, country_name, profiles:user_id(id, username, display_name, avatar_url)')
      .ilike('country_name', `%${query}%`),
  ]);
  const seen = new Set();
  const results = [];
  for (const profile of (profilesResult.data || [])) {
    if (!seen.has(profile.id)) {
      seen.add(profile.id);
      results.push({ ...profile, matchedCountry: null });
    }
  }
  for (const row of (countriesResult.data || [])) {
    if (row.profiles && !seen.has(row.user_id) && row.user_id !== currentUserId) {
      seen.add(row.user_id);
      results.push({ ...row.profiles, matchedCountry: row.country_name });
    }
  }
  return { success: true, data: results.slice(0, 12) };
};
