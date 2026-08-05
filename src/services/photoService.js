import { supabase } from './supabase';
import { fetch as expoFetch } from 'expo/fetch';
import { getAlpha2, getAlpha3 } from '../utils/countryUtils';

const BUCKET = 'country-photos';
const TABLE = 'country_photos';

const countryCodeVariants = (countryCode) => {
  const variants = [
    getAlpha3(countryCode)?.toUpperCase(),
    getAlpha2(countryCode)?.toUpperCase(),
    countryCode?.toUpperCase(),
  ].filter(Boolean);

  return [...new Set(variants)];
};

export const uploadPhoto = async (userId, countryCode, countryName, file, caption = '', cityData = {}) => {
  const resolvedCountryCode = countryCode || cityData.country_code;
  const resolvedCountryName = countryName || cityData.country_name;
  const normalizedCountryCode = getAlpha3(resolvedCountryCode)?.toUpperCase();

  try {
    if (!userId) {
      return { success: false, error: 'Usuário não autenticado.' };
    }
    if (!file) {
      return { success: false, error: 'Selecione uma foto para continuar.' };
    }
    if (!normalizedCountryCode || !resolvedCountryName) {
      return {
        success: false,
        error: 'Selecione novamente uma cidade para identificarmos o país da foto.',
      };
    }

    const contentType = file?.type || file?.mimeType || 'image/jpeg';
    const extension = contentType
      .split('/')[1]
      ?.replace('jpeg', 'jpg')
      .replace(/[^a-z0-9]/gi, '') || 'jpg';
    const path = `${userId}/${normalizedCountryCode}/${Date.now()}.${extension}`;
    let uploadBody = file;
    if (file?.uri) {
      const response = await expoFetch(file.uri);
      if (!response.ok) throw new Error('Não foi possível ler a imagem selecionada.');
      uploadBody = await response.arrayBuffer();
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, uploadBody, { contentType, upsert: false });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const { data, error: insertError } = await supabase
      .from(TABLE)
      .insert({
        user_id: userId,
        country_code: normalizedCountryCode,
        country_name: resolvedCountryName,
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
      await supabase.storage.from(BUCKET).remove([path]);
      return { success: false, error: insertError.message };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const getCountryPhotos = async (userId, countryCode) => {
  const alpha2 = getAlpha2(countryCode);
  const possibleCodes = [countryCode];
  if (alpha2) {
    possibleCodes.push(alpha2.toUpperCase());
    possibleCodes.push(alpha2.toLowerCase());
  }
  const uniqueCodes = [...new Set(possibleCodes)];
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .in('country_code', uniqueCodes)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const deletePhoto = async (photoId, photoPath) => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Entre novamente para excluir esta publicação.' };
    }

    const { data: deletedRows, error: dbError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', photoId)
      .eq('user_id', user.id)
      .select('id');

    if (dbError) {
      return { success: false, error: dbError.message };
    }

    if (!deletedRows?.length) {
      return { success: false, error: 'Foto não encontrada ou sem permissão para excluir.' };
    }

    if (!photoPath) {
      return { success: true, warning: 'Publicação excluída. O arquivo antigo não possui caminho de Storage para limpeza automática.' };
    }

    const { error: storageError } = await supabase.storage.from(BUCKET).remove([photoPath]);

    if (storageError) {
      return { success: true, warning: 'O registro foi excluído, mas o arquivo requer limpeza no storage.' };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const getAllUserPhotos = async (userId) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const getPublicPhoto = async (photoId) => {
  if (!photoId) return { success: false, data: null, error: 'Foto inválida.' };

  try {
    const { data: photo, error } = await supabase
      .from(TABLE)
      .select(`
        id,
        user_id,
        photo_url,
        caption,
        city,
        country_name,
        country_code,
        location_name,
        rating,
        review,
        created_at,
        is_public
      `)
      .eq('id', photoId)
      .eq('is_public', true)
      .maybeSingle();

    if (error) return { success: false, data: null, error: error.message };
    if (!photo) return { success: false, data: null, error: 'Foto não encontrada.' };

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', photo.user_id)
      .maybeSingle();

    if (profileError) {
      return { success: false, data: null, error: profileError.message };
    }

    return { success: true, data: { ...photo, profiles: profile || null } };
  } catch (error) {
    return { success: false, data: null, error: error.message };
  }
};

export const getPhotoCommentCounts = async (photoIds) => {
  const ids = [...new Set((photoIds || []).filter(Boolean))];
  if (ids.length === 0) return { success: true, data: {} };

  const { data, error } = await supabase
    .from('comments')
    .select('photo_id')
    .in('photo_id', ids);

  if (error) return { success: false, data: {}, error: error.message };

  const counts = (data || []).reduce((result, comment) => {
    result[comment.photo_id] = (result[comment.photo_id] || 0) + 1;
    return result;
  }, {});

  return { success: true, data: counts };
};

export const setCoverPhoto = async (userId, countryCode, photoId, photoUrl) => {
  try {
    const possibleCodes = countryCodeVariants(countryCode);

    const { data, error } = await supabase
      .from('visited_countries')
      .update({
        cover_photo_id: photoId,
        cover_photo_url: photoUrl,
      })
      .eq('user_id', userId)
      .in('country_code', possibleCodes)
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'País não encontrado na tabela' };
    }

    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const removeCoverPhoto = async (userId, countryCode) => {
  try {
    const possibleCodes = countryCodeVariants(countryCode);

    const { data, error } = await supabase
      .from('visited_countries')
      .update({
        cover_photo_id: null,
        cover_photo_url: null,
      })
      .eq('user_id', userId)
      .in('country_code', possibleCodes)
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const getFavoritePhotos = async (userId) => {
  const { data, error } = await supabase
    .from('favorite_photos')
    .select('photo_id, country_photos(id, photo_url, city, city_lat, city_lng, country_code)')
    .eq('user_id', userId);
  if (error) return { success: false, error: error.message };
  const photos = (data || []).flatMap(favorite => {
    const relatedPhoto = Array.isArray(favorite.country_photos)
      ? favorite.country_photos[0]
      : favorite.country_photos;
    return relatedPhoto ? [{ ...relatedPhoto, isFavorite: true }] : [];
  });
  return { success: true, data: photos };
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
      .eq('is_public', true)
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
    const possibleCodes = countryCodeVariants(countryCode);
    const { data, error } = await supabase
      .from('visited_countries')
      .select('cover_photo_url, cover_photo_id')
      .eq('user_id', userId)
      .in('country_code', possibleCodes)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, data: null };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
