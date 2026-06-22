import { supabase } from './supabase';
import { getAlpha2, getAlpha3 } from '../utils/countryUtils';

const BUCKET = 'country-photos';
const TABLE = 'country_photos';

export const uploadPhoto = async (userId, countryCode, countryName, file, caption = '', cityData = {}) => {
  // Garante sempre alpha-3 no banco, independente do formato recebido
  const normalizedCountryCode = getAlpha3(countryCode) || countryCode;

  console.log('📸 uploadPhoto - iniciando...');
  console.log('👤 userId:', userId);
  console.log('🌍 countryCode original:', countryCode, '| normalizado:', normalizedCountryCode);

  try {
    const path = `${userId}/${normalizedCountryCode}/${Date.now()}.jpg`;
    console.log('📁 Path do upload:', path);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) {
      console.error('❌ Erro no upload:', uploadError);
      return { success: false, error: uploadError.message };
    }

    console.log('✅ Upload concluído, pegando URL pública...');

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    console.log('🔗 URL pública:', publicUrl);

    const { data, error: insertError } = await supabase
      .from(TABLE)
      .insert({
        user_id: userId,
        country_code: normalizedCountryCode,
        country_name: countryName,
        photo_url: publicUrl,
        photo_path: path,
        caption,
        city: cityData.city || null,
        city_lat: cityData.city_lat || null,
        city_lng: cityData.city_lng || null,
        is_public: cityData.is_public ?? true,
        location_name: cityData.location_name || null,
        rating: cityData.rating || null,
        review: cityData.review || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erro ao salvar no banco:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('✅ Foto salva com sucesso:', data);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Exceção em uploadPhoto:', error);
    return { success: false, error: error.message };
  }
};

export const getCountryPhotos = async (userId, countryCode) => {
  console.log('🚨🚨🚨 TESTE CANARIO ATIVO 🚨🚨🚨');
  const alpha2 = getAlpha2(countryCode);
  const possibleCodes = [countryCode];
  if (alpha2) {
    possibleCodes.push(alpha2.toUpperCase());
    possibleCodes.push(alpha2.toLowerCase());
  }
  const uniqueCodes = [...new Set(possibleCodes)];
  console.log('🔍 Buscando fotos com códigos possíveis:', uniqueCodes);

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .in('country_code', uniqueCodes)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar fotos do país:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Fotos encontradas:', data?.length ?? 0);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Exceção em getCountryPhotos:', error);
    return { success: false, error: error.message };
  }
};

export const deletePhoto = async (photoId, photoPath) => {
  console.log('🗑️ deletePhoto - photoId:', photoId, '| path:', photoPath);

  try {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([photoPath]);

    if (storageError) {
      console.error('❌ Erro ao deletar do storage:', storageError);
      return { success: false, error: storageError.message };
    }

    console.log('✅ Arquivo removido do storage');

    const { error: dbError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', photoId);

    if (dbError) {
      console.error('❌ Erro ao deletar do banco:', dbError);
      return { success: false, error: dbError.message };
    }

    console.log('✅ Registro removido do banco');
    return { success: true };
  } catch (error) {
    console.error('❌ Exceção em deletePhoto:', error);
    return { success: false, error: error.message };
  }
};

export const getAllUserPhotos = async (userId) => {
  console.log('📂 getAllUserPhotos - userId:', userId);

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar fotos do usuário:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Total de fotos do usuário:', data?.length ?? 0);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Exceção em getAllUserPhotos:', error);
    return { success: false, error: error.message };
  }
};

export const setCoverPhoto = async (userId, countryCode, photoId, photoUrl) => {
  try {
    console.log('🖼️ Definindo foto de capa...', { userId, countryCode, photoId });

    const alpha3ToAlpha2 = {
      'BRA': 'BR', 'USA': 'US', 'ARG': 'AR', 'PRT': 'PT', 'ESP': 'ES',
      'FRA': 'FR', 'ITA': 'IT', 'DEU': 'DE', 'GBR': 'GB', 'JPN': 'JP',
      'CHN': 'CN', 'MEX': 'MX', 'COL': 'CO', 'CHL': 'CL', 'URY': 'UY',
      'BOL': 'BO', 'PER': 'PE', 'VEN': 'VE', 'ECU': 'EC', 'PRY': 'PY',
    };

    const countryCodeNormalized = alpha3ToAlpha2[countryCode] || countryCode;
    console.log('🔍 setCoverPhoto recebeu countryCode:', countryCode, '→ normalizado:', countryCodeNormalized);

    const countryNames = {
      'BR': 'Brasil', 'US': 'Estados Unidos', 'AR': 'Argentina',
      'PT': 'Portugal', 'ES': 'Espanha', 'FR': 'França',
      'IT': 'Itália', 'DE': 'Alemanha', 'GB': 'Reino Unido',
      'JP': 'Japão', 'CN': 'China', 'MX': 'México',
      'CO': 'Colômbia', 'CL': 'Chile', 'UY': 'Uruguai',
      'BO': 'Bolívia', 'PE': 'Peru', 'VE': 'Venezuela',
      'EC': 'Equador', 'PY': 'Paraguai',
    };

    const countryName = countryNames[countryCodeNormalized] || countryCodeNormalized;
    console.log('🔍 country_name resolvido:', countryName);

    const { data: existing } = await supabase
      .from('visited_countries')
      .select('*')
      .eq('user_id', userId)
      .eq('country_code', countryCodeNormalized);

    console.log('🔍 País encontrado na tabela visited_countries:', existing);

    const { data, error } = await supabase
      .from('visited_countries')
      .update({
        cover_photo_id: photoId,
        cover_photo_url: photoUrl,
      })
      .eq('user_id', userId)
      .eq('country_code', countryCodeNormalized)
      .select();

    console.log('🔍 UPDATE result - data:', data, 'error:', error);

    if (error) {
      console.error('❌ Erro ao atualizar capa:', error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      console.error('❌ Nenhuma linha atualizada - país não encontrado com code:', countryCodeNormalized);
      return { success: false, error: 'País não encontrado na tabela' };
    }

    console.log('✅ Foto de capa definida!', data[0]);
    return { success: true, data: data[0] };
  } catch (error) {
    console.error('❌ Exceção em setCoverPhoto:', error);
    return { success: false, error: error.message };
  }
};

export const removeCoverPhoto = async (userId, countryCode) => {
  try {
    console.log('🗑️ Removendo foto de capa...', { userId, countryCode });

    const { data, error } = await supabase
      .from('visited_countries')
      .update({
        cover_photo_id: null,
        cover_photo_url: null,
      })
      .eq('user_id', userId)
      .eq('country_code', countryCode)
      .select();

    if (error) {
      console.error('❌ Erro ao remover capa:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Capa removida!');
    return { success: true };
  } catch (error) {
    console.error('❌ Exceção em removeCoverPhoto:', error);
    return { success: false, error: error.message };
  }
};

export const getFavoritePhotos = async (userId) => {
  const { data, error } = await supabase
    .from('favorite_photos')
    .select('photo_id, country_photos(id, photo_url, city, city_lat, city_lng, country_code)')
    .eq('user_id', userId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: data.map(f => ({ ...f.country_photos, isFavorite: true })) };
};

export const updatePhotoPrivacy = async (photoId, isPublic) => {
  const { error } = await supabase
    .from('country_photos')
    .update({ is_public: isPublic })
    .eq('id', photoId);
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const addFavorite = async (userId, photoId) => {
  const { error } = await supabase
    .from('favorite_photos')
    .insert({ user_id: userId, photo_id: photoId });
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const removeFavorite = async (userId, photoId) => {
  const { error } = await supabase
    .from('favorite_photos')
    .delete()
    .eq('user_id', userId)
    .eq('photo_id', photoId);
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const getTopPlacesByCountry = async (countryCode) => {
  try {
    // Busca em todos os formatos do código para cobrir dados legados
    const alpha2 = getAlpha2(countryCode);
    const possibleCodes = [countryCode];
    if (alpha2) {
      possibleCodes.push(alpha2.toUpperCase());
      possibleCodes.push(alpha2.toLowerCase());
    }
    const uniqueCodes = [...new Set(possibleCodes)];

    const { data, error } = await supabase
      .from(TABLE)
      .select('city, location_name, rating')
      .in('country_code', uniqueCodes)
      .not('location_name', 'is', null)
      .not('rating', 'is', null);

    if (error) return { success: false, error: error.message };

    // Agrupa por cidade → location_name
    const groups = {};
    data.forEach(({ city, location_name, rating }) => {
      const cityKey = city || 'Outras';
      const placeKey = location_name.trim();
      if (!groups[cityKey]) groups[cityKey] = {};
      if (!groups[cityKey][placeKey]) groups[cityKey][placeKey] = { sum: 0, count: 0 };
      groups[cityKey][placeKey].sum += rating;
      groups[cityKey][placeKey].count += 1;
    });

    // Filtra 3+ avaliações, calcula média, ordena decrescente, top 3 por cidade
    const result = {};
    Object.entries(groups).forEach(([city, places]) => {
      const ranked = Object.entries(places)
        .filter(([, { count }]) => count >= 3)
        .map(([name, { sum, count }]) => ({ name, avgRating: sum / count, count }))
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, 3);
      if (ranked.length > 0) result[city] = ranked;
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

export const getCoverPhoto = async (userId, countryCode) => {
  try {
    const { data, error } = await supabase
      .from('visited_countries')
      .select('cover_photo_url, cover_photo_id')
      .eq('user_id', userId)
      .eq('country_code', countryCode)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao buscar foto de capa:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, data: null };
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ Exceção em getCoverPhoto:', error);
    return { success: false, error: error.message };
  }
};
