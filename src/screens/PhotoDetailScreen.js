import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPublicPhoto } from '../services/photoService';
import { addComment, getComments } from '../services/socialService';
import Avatar from '../components/Avatar';
import CountryFlag from '../components/CountryFlag';
import StarRating from '../components/StarRating';
import { notify } from '../utils/dialogs';

export default function PhotoDetailScreen({ route, navigation }) {
  const photoId = route.params?.photoId;
  const [photo, setPhoto] = useState(route.params?.photo || null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState('');

  const loadPhoto = useCallback(async () => {
    setLoading(true);
    setError('');

    const [photoResult, commentsResult] = await Promise.all([
      getPublicPhoto(photoId),
      getComments(photoId),
    ]);

    if (!photoResult.success) {
      setPhoto(null);
      setError(photoResult.error || 'Não foi possível carregar esta foto.');
    } else {
      setPhoto(photoResult.data);
    }

    if (commentsResult.success) {
      setComments(commentsResult.data);
    }

    setLoading(false);
  }, [photoId]);

  useEffect(() => {
    loadPhoto();
  }, [loadPhoto]);

  const submitComment = async () => {
    const content = newComment.trim();
    if (!content || commentLoading) return;

    setCommentLoading(true);
    const result = await addComment(photoId, content);
    if (!result.success) {
      notify('Erro ao salvar comentário', result.error || 'Tente novamente.');
      setCommentLoading(false);
      return;
    }

    setNewComment('');
    const updated = await getComments(photoId);
    if (updated.success) setComments(updated.data);
    setCommentLoading(false);
  };

  const openAuthorProfile = () => {
    if (!photo?.profiles?.id) return;
    navigation.navigate('PublicProfile', {
      userId: photo.profiles.id,
      username: photo.profiles.username,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Voltar" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={23} color="#F7F7F2" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Publicação</Text>
        <TouchableOpacity
          accessibilityLabel="Voltar ao menu"
          onPress={() => navigation.navigate('Main')}
        >
          <Ionicons name="home-outline" size={22} color="#F7F7F2" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6C2BD9" size="large" />
        </View>
      ) : error || !photo ? (
        <View style={styles.center}>
          <Ionicons name="image-outline" size={46} color="#68708f" />
          <Text style={styles.errorText}>{error || 'Foto não encontrada.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadPhoto}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.publicationList}
          data={comments}
          keyExtractor={(item) => item.id.toString()}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          ListHeaderComponent={(
            <>
              <TouchableOpacity style={styles.authorRow} onPress={openAuthorProfile}>
                <Avatar profile={photo.profiles} size={42} />
                <View style={styles.authorText}>
                  <Text style={styles.authorName}>
                    {photo.profiles?.display_name || photo.profiles?.username || 'Viajante'}
                  </Text>
                  <Text style={styles.authorUsername}>
                    @{photo.profiles?.username || 'viajante'}
                  </Text>
                </View>
              </TouchableOpacity>

              <Image source={{ uri: photo.photo_url }} style={styles.photo} resizeMode="cover" />

              <View style={styles.details}>
                <View style={styles.locationRow}>
                  {photo.country_code ? (
                    <CountryFlag
                      countryCode={photo.country_code}
                      width={24}
                      height={16}
                      borderRadius={3}
                    />
                  ) : null}
                  <Text style={styles.locationText}>
                    {[photo.location_name || photo.city, photo.country_name]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>

                {photo.rating > 0 ? (
                  <View style={styles.rating}>
                    <StarRating rating={photo.rating} size={15} />
                  </View>
                ) : null}

                {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}
                {photo.review ? <Text style={styles.review}>“{photo.review}”</Text> : null}
              </View>

              <View style={styles.commentsTitleRow}>
                <Ionicons name="chatbubble-outline" size={18} color="#6C2BD9" />
                <Text style={styles.commentsTitle}>
                  Comentários ({comments.length})
                </Text>
              </View>
            </>
          )}
          ListEmptyComponent={(
            <Text style={styles.emptyComments}>Nenhum comentário ainda.</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.commentRow}>
              <Avatar profile={item.profiles} size={34} />
              <View style={styles.commentBubble}>
                <Text style={styles.commentAuthor}>
                  {item.profiles?.display_name || `@${item.profiles?.username || 'viajante'}`}
                </Text>
                <Text style={styles.commentContent}>{item.content}</Text>
              </View>
            </View>
          )}
        />
      )}

      {!loading && photo ? (
        <View style={styles.commentInputRow}>
          <TextInput
            value={newComment}
            onChangeText={setNewComment}
            placeholder="Adicionar comentário..."
            placeholderTextColor="#8c91aa"
            style={styles.commentInput}
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={submitComment}
          />
          <TouchableOpacity
            accessibilityLabel="Enviar comentário"
            style={[styles.sendButton, (!newComment.trim() || commentLoading) && styles.disabled]}
            disabled={!newComment.trim() || commentLoading}
            onPress={submitComment}
          >
            {commentLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={17} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    minHeight: 76,
    paddingTop: 28,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#202744',
  },
  headerTitle: { color: '#F7F7F2', fontSize: 17, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  errorText: { color: '#aeb3c9', marginTop: 12, textAlign: 'center' },
  retryButton: {
    backgroundColor: '#6C2BD9',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 16,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  content: { paddingBottom: 22 },
  publicationList: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  authorRow: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorText: { flex: 1 },
  authorName: { color: '#F7F7F2', fontSize: 14, fontWeight: '700' },
  authorUsername: { color: '#8f96b5', fontSize: 12, marginTop: 1 },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#181e35' },
  details: { padding: 16, gap: 9 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { color: '#aeb3c9', fontSize: 12, flex: 1 },
  rating: { marginTop: 2 },
  caption: { color: '#F7F7F2', fontSize: 14, lineHeight: 21 },
  review: { color: '#d5d7e2', fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  commentsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#202744',
  },
  commentsTitle: { color: '#F7F7F2', fontSize: 14, fontWeight: '700' },
  emptyComments: { color: '#8f96b5', paddingHorizontal: 16, paddingVertical: 18 },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: '#181e35',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  commentAuthor: { color: '#F7F7F2', fontSize: 12, fontWeight: '700', marginBottom: 3 },
  commentContent: { color: '#c7cad8', fontSize: 13, lineHeight: 18 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#11182d',
    borderTopWidth: 1,
    borderTopColor: '#202744',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#202744',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    color: '#F7F7F2',
    fontSize: 13,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C2BD9',
  },
  disabled: { opacity: 0.45 },
});
