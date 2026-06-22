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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Usuário não autenticado' };
  const { error } = await supabase
    .from('comments')
    .insert({ photo_id: photoId, user_id: user.id, content });
  return { success: !error, error: error?.message };
};

export const deleteComment = async (commentId) => {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId);
  return { success: !error };
};
