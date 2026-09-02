import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image as NativeImage,
  StyleSheet, ActivityIndicator, Modal, TextInput, Share, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser, supabase } from '../../services/supabase';
import { getFeedPhotos } from '../../services/followService';
import { getUnreadMessageCount } from '../../services/messageService';
import { getComments, addComment } from '../../services/socialService';
import { addFavorite, deletePhoto, removeFavorite } from '../../services/photoService';
import { getCountryNamePtByCode } from '../../utils/countryUtils';
import { useUpload } from '../../context/UploadContext';
import StarRating from '../../components/StarRating';
import Avatar from '../../components/Avatar';
import CountryFlag from '../../components/CountryFlag';
import ShareToJourniModal from '../../components/ShareToJourniModal';
import { confirm, notify } from '../../utils/dialogs';
import { SOCIAL_NOTIFICATION_TYPES, isSocialNotification } from '../../utils/socialNotifications';

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  return `${days}d atrás`;
};

const FEED_PAGE_SIZE = 12;

function CountBadge({ count }) {
  if (!count) return null;
  return (
    <View style={styles.countBadge}>
      <Text style={styles.countBadgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function FeedHeader({ navigation, unreadMessages, unreadNotifications }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Início</Text>
          <Text style={styles.headerSub}>Acompanhe as viagens de quem você segue</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => navigation.navigate('Messages')}
            accessibilityRole="button"
            accessibilityLabel="Abrir conversas"
          >
            <Ionicons name="chatbubbles-outline" size={22} color="#FFFFFF" />
            <CountBadge count={unreadMessages} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => navigation.navigate('Notificações')}
            accessibilityRole="button"
            accessibilityLabel="Abrir notificações"
          >
            <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
            <CountBadge count={unreadNotifications} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function FeedScreen({ navigation }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [feed, setFeed] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [likedIds, setLikedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [commentModal, setCommentModal] = useState(false);
  const [commentPhoto, setCommentPhoto] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [sharePhoto, setSharePhoto] = useState(null);

  const { refreshTrigger } = useUpload();

  const refreshPendingCounts = useCallback(async userId => {
    if (!userId) return;
    const [messagesResult, notificationsResult] = await Promise.all([
      getUnreadMessageCount(),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
        .in('type', SOCIAL_NOTIFICATION_TYPES),
    ]);
    if (messagesResult.success) setUnreadMessages(messagesResult.data);
    setUnreadNotifications(notificationsResult.count || 0);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (!user) return;

      const [feedResult, messagesResult, notificationsResult] = await Promise.all([
        getFeedPhotos(user.id, { from: 0, pageSize: FEED_PAGE_SIZE }),
        getUnreadMessageCount(),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false)
          .in('type', SOCIAL_NOTIFICATION_TYPES),
      ]);

      if (feedResult.success) {
        setFeed(feedResult.data);
        setHasMore(feedResult.hasMore);
      }
      if (messagesResult.success) setUnreadMessages(messagesResult.data);
      setUnreadNotifications(notificationsResult.count || 0);

      const { data: favorites } = await supabase
        .from('favorite_photos')
        .select('photo_id')
        .eq('user_id', user.id);
      setLikedIds(new Set((favorites || []).map(item => item.photo_id)));
    } catch {
      setFeed([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!currentUser?.id || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await getFeedPhotos(currentUser.id, {
        from: feed.length,
        pageSize: FEED_PAGE_SIZE,
      });
      if (result.success) {
        setFeed(current => {
          const knownIds = new Set(current.map(item => item.id));
          return [...current, ...result.data.filter(item => !knownIds.has(item.id))];
        });
        setHasMore(result.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [currentUser?.id, feed.length, hasMore, loading, loadingMore]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => { if (refreshTrigger > 0) loadData(); }, [refreshTrigger]);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const channel = supabase
      .channel(`feed-header-counts-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        payload => {
          if (isSocialNotification(payload.new)) refreshPendingCounts(currentUser.id);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id, refreshPendingCounts]);

  const handleLike = async photoId => {
    if (!currentUser?.id) return;
    const wasLiked = likedIds.has(photoId);

    setLikedIds(previous => {
      const next = new Set(previous);
      if (wasLiked) next.delete(photoId);
      else next.add(photoId);
      return next;
    });

    const result = wasLiked
      ? await removeFavorite(currentUser.id, photoId)
      : await addFavorite(currentUser.id, photoId);

    if (!result.success) {
      setLikedIds(previous => {
        const next = new Set(previous);
        if (wasLiked) next.add(photoId);
        else next.delete(photoId);
        return next;
      });
      notify('Não foi possível atualizar a curtida', result.error || 'Tente novamente.');
    }
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

  const handleDeletePhoto = async (photo) => {
    if (photo.user_id !== currentUser?.id || deletingPhotoId) return;

    const accepted = await confirm(
      'Excluir publicação',
      'A foto, a legenda e os comentários serão excluídos permanentemente. Deseja continuar?'
    );
    if (!accepted) return;

    setDeletingPhotoId(photo.id);
    try {
      const result = await deletePhoto(photo.id, photo.photo_path);
      if (!result.success) {
        notify('Erro ao excluir', result.error || 'Não foi possível excluir a publicação.');
        return;
      }

      setFeed(current => current.filter(item => item.id !== photo.id));
      setLikedIds(current => {
        const next = new Set(current);
        next.delete(photo.id);
        return next;
      });
      if (commentPhoto?.id === photo.id) {
        setCommentModal(false);
        setCommentPhoto(null);
        setComments([]);
      }
      notify('Publicação excluída', result.warning || 'Sua publicação foi removida.');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <FeedHeader navigation={navigation} unreadMessages={unreadMessages} unreadNotifications={unreadNotifications} />
        <ActivityIndicator color="#6C2BD9" style={{ marginTop: 40 }} />
      </View>
    );
  }

  const isEmpty = feed.length === 0;

  return (
    <View style={styles.container}>
      <FeedHeader navigation={navigation} unreadMessages={unreadMessages} unreadNotifications={unreadNotifications} />

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
        <FlatList
          data={feed}
          keyExtractor={post => post.id}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          renderItem={({ item: post }) => {
              const liked = likedIds.has(post.id);
              return (
                <View style={styles.feedCard}>

                  <View style={styles.postHeader}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      onPress={() => navigation.navigate('PublicProfile', {
                        userId: post.user_id,
                        username: post.profiles?.username,
                      })}
                    >
                      <Avatar
                        profile={post.profiles}
                        fallbackName={
                          post.profiles?.display_name
                          || post.profiles?.username
                          || 'Viajante'
                        }
                        size={34}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.postAuthorName}>
                          {post.profiles?.display_name || post.profiles?.username || 'Viajante'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {post.country_code && (
                            <CountryFlag
                              countryCode={post.country_code}
                              width={20}
                              height={13}
                              borderRadius={2}
                            />
                          )}
                          <Text style={styles.postAuthorMeta}>
                            {[post.city, getCountryNamePtByCode(post.country_code, post.country_name)]
                              .filter(Boolean)
                              .join(', ')}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.postHeaderActions}>
                      <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                      {post.user_id === currentUser?.id && (
                        <TouchableOpacity
                          style={styles.deletePostButton}
                          onPress={() => handleDeletePhoto(post)}
                          disabled={deletingPhotoId !== null}
                          accessibilityRole="button"
                          accessibilityLabel="Excluir publicação"
                        >
                          {deletingPhotoId === post.id ? (
                            <ActivityIndicator size="small" color="#D64545" />
                          ) : (
                            <Ionicons name="trash-outline" size={17} color="#D64545" />
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <Image
                    source={post.photo_url}
                    style={styles.postImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                    recyclingKey={post.id}
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
                      onPress={() => setSharePhoto(post)}
                    >
                      <Ionicons name="share-outline" size={18} color="#999" />
                    </TouchableOpacity>
                  </View>

                </View>
              );
            }}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color="#6C2BD9" style={styles.feedFooterLoader} />
          ) : <View style={{ height: 96 }} />}
        />
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
                <TouchableOpacity
                  style={styles.commentRow}
                  onPress={() => {
                    setCommentModal(false);
                    if (item.profiles?.id) {
                      navigation.navigate('PublicProfile', {
                        userId: item.profiles.id,
                        username: item.profiles.username,
                      });
                    }
                  }}
                >
                  <View style={styles.commentAvatar}>
                    {item.profiles?.avatar_url ? (
                      <NativeImage
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
                </TouchableOpacity>
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
      <ShareToJourniModal
        visible={!!sharePhoto}
        onClose={() => setSharePhoto(null)}
        resource={{ photo: sharePhoto }}
        onExternalShare={() => sharePhoto && handleSharePhoto(sharePhoto)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  header: { backgroundColor: '#0D1326', paddingHorizontal: 20, paddingTop: 48, paddingBottom: 16 },
  headerContent: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: '700', fontFamily: 'Poppins_700Bold', letterSpacing: -0.3 },
  headerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActionButton: { position: 'relative', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  countBadge: { position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF4D75', borderWidth: 2, borderColor: '#0D1326' },
  countBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  body: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
  feedFooterLoader: { marginVertical: 24 },
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
  postHeaderActions: { alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  deletePostButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDECEC',
  },
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
