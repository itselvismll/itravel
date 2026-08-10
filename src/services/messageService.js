import { supabase } from './supabase';
import { getFollowerProfiles, getFollowingProfiles } from './followService';

const LOCAL_KEY = 'journi.localConversations';
let memoryConversations = [];
const readLocal = () => {
  if (typeof globalThis.localStorage === 'undefined') return memoryConversations;
  try { return JSON.parse(globalThis.localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
};
const writeLocal = conversations => {
  memoryConversations = conversations;
  if (typeof globalThis.localStorage !== 'undefined') globalThis.localStorage.setItem(LOCAL_KEY, JSON.stringify(conversations));
};

const currentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getShareRecipients = async () => {
  const user = await currentUser();
  if (!user) return { success: false, data: [], error: 'Entre novamente.' };
  const [followers, following] = await Promise.all([
    getFollowerProfiles(user.id),
    getFollowingProfiles(user.id),
  ]);
  const unique = new Map();
  [...(followers.data || []), ...(following.data || [])].forEach(profile => unique.set(profile.id, profile));
  return { success: true, data: [...unique.values()] };
};

export const getOrCreateConversation = async (otherUserId) => {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { other_user_id: otherUserId });
  if (!error) return { success: true, data };
  const existing = readLocal().find(item => item.otherUserId === otherUserId);
  if (existing) return { success: true, data: existing.id, local: true };
  const id = `local-conversation-${otherUserId}`;
  writeLocal([{ id, otherUserId, messages: [], updated_at: new Date().toISOString() }, ...readLocal()]);
  return { success: true, data: id, local: true };
};

export const createPassportShare = async (recipientId, snapshot) => {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Entre novamente.' };
  const payload = { sender_id: user.id, recipient_id: recipientId, snapshot };
  const { data, error } = await supabase.from('passport_shares').insert(payload).select().single();
  if (!error) return { success: true, data };
  return {
    success: true,
    local: true,
    warning: error.message,
    data: { ...payload, id: `local-passport-${Date.now()}`, created_at: new Date().toISOString() },
  };
};

export const getPassportShare = async (passportShareId) => {
  if (passportShareId?.startsWith('local-passport-')) return { success: false, data: null };
  const { data, error } = await supabase.from('passport_shares').select('*').eq('id', passportShareId).single();
  if (error || !data) return { success: false, data: null, error: error?.message };
  const { data: sender } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', data.sender_id)
    .maybeSingle();
  return { success: true, data: { ...data, sender: sender || data.snapshot?.profile || null } };
};

export const sendMessage = async (conversationId, { body = '', photo = null, plan = null, passport = null } = {}) => {
  const user = await currentUser();
  if (!user) return { success: false, error: 'Entre novamente.' };
  const payload = {
    conversation_id: conversationId,
    sender_id: user.id,
    body: String(body || '').trim() || null,
    shared_photo_id: photo?.id ? String(photo.id) : null,
    shared_photo: photo ? {
      id: photo.id,
      photo_url: photo.photo_url,
      city: photo.city,
      country_name: photo.country_name,
      review: photo.review,
      user_id: photo.user_id,
    } : null,
    shared_plan: plan || null,
    shared_passport_id: passport?.id && !String(passport.id).startsWith('local-') ? passport.id : null,
    shared_passport: passport ? (passport.snapshot || passport) : null,
  };
  if (conversationId?.startsWith('local-conversation-')) {
    const message = { ...payload, id: `local-message-${Date.now()}`, created_at: new Date().toISOString() };
    writeLocal(readLocal().map(item => item.id === conversationId ? { ...item, messages: [...item.messages, message], updated_at: message.created_at } : item));
    return { success: true, data: message, local: true };
  }
  const { data, error } = await supabase.from('messages').insert(payload).select().single();
  return { success: !error, data, error: error?.message };
};

export const shareWithUser = async (otherUserId, resource) => {
  let resourceToSend = resource;
  if (resource?.passport) {
    const passportResult = await createPassportShare(otherUserId, resource.passport);
    if (!passportResult.success) return passportResult;
    resourceToSend = { passport: passportResult.data };
  }
  const conversation = await getOrCreateConversation(otherUserId);
  if (!conversation.success) return conversation;
  if (conversation.local) {
    const recipients = await getShareRecipients();
    const profile = (recipients.data || []).find(item => item.id === otherUserId) || null;
    writeLocal(readLocal().map(item => item.id === conversation.data ? { ...item, profile } : item));
  }
  const result = await sendMessage(conversation.data, resourceToSend);
  return { ...result, conversationId: conversation.data };
};

export const getConversations = async () => {
  const user = await currentUser();
  if (!user) return { success: false, data: [], error: 'Entre novamente.' };
  const { data: mine, error } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', user.id);
  const local = readLocal().map(item => ({ id: item.id, profile: item.profile || null, lastMessage: item.messages?.[item.messages.length - 1] || null }));
  if (error || !mine?.length) return { success: true, data: local, warning: error?.message };
  const ids = mine.map(item => item.conversation_id);
  const [{ data: participants }, { data: messages }] = await Promise.all([
    supabase.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', ids),
    supabase.from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false }),
  ]);
  const otherIds = [...new Set((participants || []).filter(item => item.user_id !== user.id).map(item => item.user_id))];
  const { data: profiles } = otherIds.length
    ? await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', otherIds)
    : { data: [] };
  return {
    success: true,
    data: [...local, ...ids.map(id => {
      const participant = (participants || []).find(item => item.conversation_id === id && item.user_id !== user.id);
      return {
        id,
        profile: (profiles || []).find(profile => profile.id === participant?.user_id) || null,
        lastMessage: (messages || []).find(message => message.conversation_id === id) || null,
      };
    })].sort((a, b) => new Date(b.lastMessage?.created_at || 0).getTime() - new Date(a.lastMessage?.created_at || 0).getTime()),
  };
};

export const getConversationMessages = async (conversationId) => {
  if (conversationId?.startsWith('local-conversation-')) {
    return { success: true, data: readLocal().find(item => item.id === conversationId)?.messages || [] };
  }
  const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(200);
  return { success: !error, data: data || [], error: error?.message };
};
