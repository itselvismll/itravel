import { supabase } from './supabase';

const getProfileOrFallback = (profiles, userId) => (
  profiles?.find(profile => profile.id === userId) || {
    id: userId,
    username: `viajante_${String(userId).replaceAll('-', '').slice(0, 6)}`,
    display_name: 'Viajante',
    avatar_url: null,
  }
);

export const followUser = async (followerId, followingId) => {
  const { error } = await supabase
    .from('followers')
    .insert({ follower_id: followerId, following_id: followingId });
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const unfollowUser = async (followerId, followingId) => {
  const { error } = await supabase
    .from('followers')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) return { success: false, error: error.message };
  return { success: true };
};

export const getFollowing = async (userId) => {
  const { data, error } = await supabase
    .from('followers')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) return { success: false, data: [] };
  return { success: true, data: data.map(f => f.following_id) };
};

export const getFollowingProfiles = async (userId) => {
  const { data: follows, error } = await supabase
    .from('followers')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) return { success: false, data: [], error: error.message };
  if (!follows?.length) return { success: true, data: [] };
  const ids = follows.map(f => f.following_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);
  return {
    success: !profilesError,
    data: profiles || [],
    error: profilesError?.message,
  };
};

export const getFollowerProfiles = async (userId) => {
  const { data: follows, error } = await supabase
    .from('followers')
    .select('follower_id')
    .eq('following_id', userId);
  if (error) return { success: false, data: [], error: error.message };
  if (!follows?.length) return { success: true, data: [] };

  const ids = follows.map(f => f.follower_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);
  return {
    success: !profilesError,
    data: profiles || [],
    error: profilesError?.message,
  };
};

export const getFeedPhotos = async (userId) => {
  const { data: follows } = await supabase
    .from('followers')
    .select('following_id')
    .eq('follower_id', userId);
  const followingIds = follows?.map(f => f.following_id) || [];
  const allIds = [userId, ...followingIds];

  const { data, error } = await supabase
    .from('country_photos')
    .select('id, photo_url, photo_path, city, country_name, country_code, location_name, rating, review, created_at, user_id')
    .in('user_id', allIds)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data?.length) return { success: true, data: [] };

  const userIds = [...new Set(data.map(p => p.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds);

  return {
    success: true,
    data: data.map(p => ({
      ...p,
      profiles: getProfileOrFallback(profiles, p.user_id),
    })),
  };
};

export const getRecentPublicPhotos = async (limit = 10) => {
  const { data, error } = await supabase
    .from('country_photos')
    .select('id, photo_url, city, country_name, country_code, location_name, rating, review, created_at, user_id')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data?.length) return { success: false, data: [] };

  const userIds = [...new Set(data.map(p => p.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds);

  return {
    success: true,
    data: data.map(p => ({
      ...p,
      profiles: getProfileOrFallback(profiles, p.user_id),
    })),
  };
};

export const getUsersToDiscover = async (currentUserId) => {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .neq('id', currentUserId)
    .limit(10);

  if (!profiles?.length) return { success: true, data: [] };

  const userIds = profiles.map(p => p.id);
  const { data: countries } = await supabase
    .from('visited_countries')
    .select('user_id')
    .in('user_id', userIds);

  const countMap = {};
  countries?.forEach(c => { countMap[c.user_id] = (countMap[c.user_id] || 0) + 1; });

  return {
    success: true,
    data: profiles
      .map(p => ({ ...p, countries: countMap[p.id] || 0 }))
      .sort((a, b) => b.countries - a.countries),
  };
};

export const getFollowCounts = async (userId) => {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return { followers: followersRes.count || 0, following: followingRes.count || 0 };
};
