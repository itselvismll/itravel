import { supabase } from './supabase';

export const createProfile = async (userId, username, fullName) => {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, username, full_name: fullName })
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
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
};

export const uploadAvatar = async (userId, imageUri) => {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();

    const mimeType = blob.type || 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const timestamp = Date.now();
    const filePath = `${userId}_${timestamp}.${ext}`;

    console.log('📸 Uploading avatar:', { filePath, mimeType, size: blob.size });

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, {
        upsert: true,
        contentType: mimeType,
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = data.publicUrl;
    console.log('✅ Avatar URL:', avatarUrl);

    const updateResult = await updateProfile(userId, { avatar_url: avatarUrl });
    if (!updateResult.success) return updateResult;

    return { success: true, avatarUrl };
  } catch (e) {
    console.error('❌ Avatar upload exception:', e);
    return { success: false, error: e.message };
  }
};

export const checkUsernameAvailable = async (username) => {
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .maybeSingle();
  return !data;
};
