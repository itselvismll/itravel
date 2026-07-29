import { supabase } from './supabase';

const normalizeUsername = (username) => username?.trim().toLowerCase();

const sanitizeProfileUpdates = (updates = {}) => {
  const allowedFields = ['username', 'display_name', 'avatar_url'];
  const sanitized = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowedFields.includes(key))
  );

  if (Object.hasOwn(sanitized, 'username')) {
    sanitized.username = normalizeUsername(sanitized.username);
  }

  return sanitized;
};

export const createProfile = async (userId, username, fullName) => {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        username: normalizeUsername(username),
        display_name: fullName?.trim() || null,
      },
      { onConflict: 'id' }
    )
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
};

export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
};

export const updateProfile = async (userId, updates) => {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };

  const sanitizedUpdates = sanitizeProfileUpdates(updates);
  if (
    Object.hasOwn(sanitizedUpdates, 'username')
    && !sanitizedUpdates.username
  ) {
    return { success: false, error: 'O nome de usuário não pode ficar vazio.' };
  }

  // Some legacy auth accounts were created before profiles were generated
  // automatically. Repair the current user's row before applying a partial
  // update such as an avatar-only change.
  const { error: ensureError } = await supabase.rpc('ensure_current_user_profile');
  if (ensureError) return { success: false, error: ensureError.message };

  const { data, error } = await supabase
    .from('profiles')
    .update(sanitizedUpdates)
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) {
    return {
      success: false,
      error: 'Não foi possível preparar seu perfil. Entre novamente e tente de novo.',
    };
  }

  const metadata = {};
  if (Object.hasOwn(sanitizedUpdates, 'username')) {
    metadata.username = sanitizedUpdates.username;
  }
  if (Object.hasOwn(sanitizedUpdates, 'display_name')) {
    metadata.display_name = sanitizedUpdates.display_name;
    metadata.full_name = sanitizedUpdates.display_name;
  }
  if (Object.hasOwn(sanitizedUpdates, 'avatar_url')) {
    metadata.avatar_url = sanitizedUpdates.avatar_url;
  }

  let warning;
  if (Object.keys(metadata).length > 0) {
    const { error: authError } = await supabase.auth.updateUser({ data: metadata });
    warning = authError?.message;
  }

  return { success: true, data, warning };
};

export const uploadAvatar = async (userId, imageUri) => {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();

    const mimeType = blob.type || 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const timestamp = Date.now();
    const filePath = `${userId}_${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, {
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = data.publicUrl;

    const updateResult = await updateProfile(userId, { avatar_url: avatarUrl });
    if (!updateResult.success) return updateResult;

    return { success: true, avatarUrl };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

export const checkUsernameAvailable = async (username, excludingUserId = null) => {
  const candidate = normalizeUsername(username);
  if (!candidate) return false;

  const { data, error } = await supabase.rpc('is_username_available', {
    candidate,
    excluding_user_id: excludingUserId,
  });
  if (error) return false;
  return data === true;
};
