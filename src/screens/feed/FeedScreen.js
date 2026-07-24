import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Modal, TextInput, Share, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser } from '../../services/supabase';
import { getFeedPhotos, getFollowingProfiles } from '../../services/followService';
import { getComments, addComment } from '../../services/socialService';
import { getCountryNamePtByCode } from '../../utils/countryUtils';
import { getFlagEmoji } from '../../utils/flagUtils';
import { useUpload } from '../../context/UploadContext';
import StarRating from '../../components/StarRating';
import Avatar from '../../components/Avatar';
import { notify } from '../../utils/dialogs';

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  return `${days}d atrás`;
};

export default function FeedScreen({ navigation }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [feed, setFeed] = useState([]);
  const [following, setFollowing] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const [commentModal, setCommentModal] = useState(false);
  const [commentPhoto, setCommentPhoto] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const { refreshTrigger } = useUpload();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (!user) return;

      const [feedResult, followingResult] = await Promise.all([
        getFeedPhotos(user.id),
        getFollowingProfiles(user.id),
      ]);

      if (feedResult.success) setFeed(feedResult.data);
      if (followingResult.success) setFollowing(followingResult.data);
    } catch {
      setFeed([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => { if (refreshTrigger > 0) loadData(); }, [refreshTrigger]);

  const handleLike = (photoId) => {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const openComments = async (photo) => {
    setCommentPhoto(photo);
    setComments([]);
    setCommentModal(true);
    const result = await getComments(photo.id);
    if (result.success) setComments(result.data);
    else notify('Erro ao carregar comentários', result.error || 'Tente novamente.');
  };

  const submitComment = async () => {
    if (!newComment.trim() || !commentPhoto) return;
    setCommentLoading(true);
    const result = await addComment(commentPhoto.id, newComment.trim());
    if (result.success) {
      setNewComment('');
      const updated = await getComments(commentPhoto.id);
      if (updated.success) setComments(updated.data);
    } else {
      notify('Erro ao salvar comentário', result.error || 'Tente novamente.');
    }
    setCommentLoading(false);
  };

  const handleSharePhoto = async (photo) => {
    try {
      const message = `Veja essa foto de ${photo.city || 'viagem'} no Journi!\n@${photo.profiles?.username || 'viajante'}`;
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title: 'Journi', text: message, url: photo.photo_url });
        } else {
          await navigator.clipboard.writeText(`${message}\n${photo.photo_url}`);
          alert('Link copiado para a área de transferência!');
        }
      } else {
        await Share.share({ message: `${message}\n${photo.photo_url}`, title: 'Journi' });
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        notify('Erro ao compartilhar', 'Não foi possível compartilhar esta foto.');
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feed</Text>
          <Text style={styles.headerSub}>Pessoas que você segue</Text>
        </View>
        <ActivityIndicator color="#6C2BD9" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const isEmpty = feed.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={styles.headerTitle}>Feed</Text>
            <Text style={styles.headerSub}>Pessoas que você segue</Text>
          </View>
          <Image
            source={require('../../../assets/journi_simbolo.png')}
            style={{ width: 28, height: 28, marginTop: 2 }}
            resizeMode="contain"
          />
        </View>
      </View>

      {isEmpty ? (
        <View style={styles.emptyState}>
          <Ionicons name="earth-outline" size={56} color="#ddd" />
          <Text style={styles.emptyTitle}>Seu feed está vazio</Text>
          <Text style={styles.emptySub}>
            Siga viajantes no Explorar para ver as aventuras deles aqui
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('Explore')}
          >
            <Text style={styles.emptyBtnText}>Explorar viajantes</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>

          {following.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stories}
            >
              {following.map((user) => (
                <View key={user.id} style={styles.storyItem}>
                  <View style={styles.storyRing}>
                    <Avatar profile={user} size={44} />
                  </View>
                  <Text style={styles.storyName} numberOfLines={1}>
                    {user.username}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.body}>
            {feed.map((post) => {
              const liked = likedIds.has(post.id);
              return (
                <View key={post.id} style={styles.feedCard}>

                  <View style={styles.postHeader}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      onPress={() => navigation.navigate('PublicProfile', {
                        userId: post.user_id,
                        username: post.profiles?.username,
                      })}
                    >
                      <Avatar profile={post.profiles} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.postAuthorName}>
                          {post.profiles?.display_name || post.profiles?.username || 'Viajante'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {post.country_code && (
                            <Text style={{ fontSize: 13 }}>
                              {getFlagEmoji(post.country_code)}
                            </Text>
                          )}
                          <Text style={styles.postAuthorMeta}>
                            {[post.city, getCountryNamePtByCode(post.country_code, post.country_name)]
                              .filter(Boolean)
                              .join(', ')}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                  </View>

                  <Image
                    source={{ uri: post.photo_url }}
                    style={styles.postImage}
                    resizeMode="cover"
                  />

                  <View style={styles.postBody}>
                    {post.location_name && (
                      <View style={styles.postLocation}>
                        <Ionicons name="location" size={11} color="#6C2BD9" />
                        <Text style={styles.postLocationName} numberOfLines={1}>
                          {post.location_name}
                        </Text>
                        {post.city && <Text style={styles.postLocationCity}>· {post.city}</Text>}
                      </View>
                    )}
                    {post.rating > 0 && (
                      <View style={{ marginBottom: 6 }}>
                        <StarRating rating={post.rating} size={13} />
                      </View>
                    )}
                    {post.review && (
                      <Text style={styles.postReview} numberOfLines={3}>
                        "{post.review}"
                      </Text>
                    )}
                  </View>

                  <View style={styles.postActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleLike(post.id)}
                    >
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={18}
                        color={liked ? '#6C2BD9' : '#999'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => openComments(post)}
                    >
                      <Ionicons name="chatbubble-outline" size={17} color="#999" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleSharePhoto(post)}
                    >
                      <Ionicons name="share-outline" size={18} color="#999" />
                    </TouchableOpacity>
                  </View>

                </View>
              );
            })}
            <View style={{ height: 20 }} />
          </View>
        </ScrollView>
      )}

      {/* MODAL DE COMENTÁRIOS */}
      <Modal
        visible={commentModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentModal(false)}
      >
        <View style={styles.commentOverlay}>
          <View style={styles.commentSheet}>
            <View style={styles.commentSheetHeader}>
              <Text style={styles.commentSheetTitle}>Comentários</Text>
              <TouchableOpacity onPress={() => setCommentModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 4 }}
              ListEmptyComponent={
                <Text style={styles.commentEmpty}>
                  Nenhum comentário ainda. Seja o primeiro!
                </Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    {item.profiles?.avatar_url ? (
                      <Image
                        source={{ uri: item.profiles.avatar_url }}
                        style={{ width: 32, height: 32, borderRadius: 16 }}
                      />
                    ) : (
                      <Text style={styles.commentAvatarText}>
                        {(item.profiles?.username || '?')[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentUsername}>
                      @{item.profiles?.username || 'viajante'}
                    </Text>
                    <Text style={styles.commentContent}>{item.content}</Text>
                  </View>
                </View>
              )}
            />

            <View style={styles.commentInput}>
              <TextInput
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Adicionar comentário..."
                placeholderTextColor="#aaa"
                style={styles.commentTextInput}
                maxLength={1000}
                onSubmitEditing={submitComment}
                returnKeyType="send"
              />
              <TouchableOpacity
                onPress={submitComment}
                disabled={commentLoading || !newComment.trim()}
                style={[
                  styles.commentSendBtn,
                  (!newComment.trim() || commentLoading) && { opacity: 0.5 },
                ]}
              >
                {commentLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="send" size={18} color="white" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  header: { backgroundColor: '#0D1326', padding: 20, paddingTop: 48, paddingBottom: 16 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: '700', fontFamily: 'Poppins_700Bold', letterSpacing: -0.3 },
  headerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  stories: { paddingHorizontal: 12, paddingVertical: 12, gap: 14 },
  storyItem: { alignItems: 'center', gap: 4 },
  storyRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#6C2BD9', padding: 2, alignItems: 'center', justifyContent: 'center' },
  storyName: { fontSize: 10, color: '#888', maxWidth: 52, textAlign: 'center' },
  body: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
  feedCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 10 },
  postAuthorName: { fontSize: 13, fontWeight: '600', color: '#0D1326' },
  postAuthorMeta: { fontSize: 10, color: '#aaa' },
  postTime: { fontSize: 10, color: '#bbb' },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#E3E5EA',
  },
  postBody: { padding: 12, paddingBottom: 4 },
  postLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  postLocationName: { fontSize: 12, fontWeight: '600', color: '#6C2BD9', flex: 1 },
  postLocationCity: { fontSize: 10, color: '#aaa' },
  postReview: { fontSize: 12, color: '#555', fontStyle: 'italic', lineHeight: 18, marginBottom: 4 },
  postActions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#f5f5f5', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#bbb' },
  emptySub: { fontSize: 13, color: '#ccc', textAlign: 'center', lineHeight: 20 },
  emptyBtn: { backgroundColor: '#6C2BD9', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  emptyBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  commentOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  commentSheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 },
  commentSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  commentSheetTitle: { fontSize: 16, fontWeight: '700', color: '#0D1326' },
  commentEmpty: { color: '#aaa', textAlign: 'center', marginTop: 24, fontSize: 13 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  commentAvatarText: { color: 'white', fontWeight: '700', fontSize: 13 },
  commentUsername: { fontSize: 12, fontWeight: '700', color: '#0D1326' },
  commentContent: { fontSize: 13, color: '#444', marginTop: 2, lineHeight: 18 },
  commentInput: { flexDirection: 'row', gap: 8, borderTopWidth: 0.5, borderTopColor: '#eee', paddingVertical: 12 },
  commentTextInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: '#333' },
  commentSendBtn: { backgroundColor: '#6C2BD9', borderRadius: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
});
