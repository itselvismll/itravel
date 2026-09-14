import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import {
  followUser,
  getFollowCounts,
  getFollowing,
  unfollowUser,
} from '../../services/followService';
import { getPhotoCommentCounts } from '../../services/photoService';
import CountryFlag from '../../components/CountryFlag';
import CountryGridSection from '../../components/profile/CountryGridSection';
import Avatar from '../../components/Avatar';
import { normalizeBio } from '../../utils/bio';
import InstagramBadge from '../../components/profile/InstagramBadge';
import { getLevelInfo } from '../../utils/travelerLevels';
import TravelerLevelCard from '../../components/profile/TravelerLevelCard';
import StarRating from '../../components/StarRating';
import { getOrCreateConversation } from '../../services/messageService';
import { blockUser, isBlockedByMe, unblockUser } from '../../services/moderationService';
import ReportSheet from '../../components/ReportSheet';
import { confirm, notify } from '../../utils/dialogs';

// A lista de níveis que vivia AQUI foi removida.
//
// Ela era uma cópia divergente de utils/travelerLevels.js: nesta tela o
// Explorador começava em 6 países, lá começa em 5 — e o Viajante em 3 contra 2.
// Resultado: o mesmo usuário com 5 países aparecia como "Explorador" no próprio
// perfil e como "Viajante" no público. Agora as duas telas leem getLevelInfo, que
// é a única fonte, e o TravelerLevelCard desenha as duas.

export default function PublicProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [visitedCountries, setVisitedCountries] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsMe, setFollowsMe] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [processandoBloqueio, setProcessandoBloqueio] = useState(false);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const myId = user?.id;

        const [profileRes, countriesRes, photosRes, followCountsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase
            .from('visited_countries')
            .select('country_code, country_name')
            .eq('user_id', userId),
          supabase
            .from('country_photos')
            .select(`
              id,
              user_id,
              photo_url,
              caption,
              city,
              country_name,
              country_code,
              rating,
              review,
              location_name,
              created_at,
              is_public
            `)
            .eq('user_id', userId)
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(24),
          getFollowCounts(userId),
        ]);

        if (!active) return;
        if (profileRes.error) throw profileRes.error;

        const publicPhotos = photosRes.data || [];
        const countResult = await getPhotoCommentCounts(publicPhotos.map((photo) => photo.id));
        if (!active) return;

        setCurrentUserId(myId);
        setProfile(profileRes.data);
        setVisitedCountries(countriesRes.data || []);
        setPhotos(publicPhotos.map((photo) => ({
          ...photo,
          profiles: profileRes.data,
          comment_count: countResult.data?.[photo.id] || 0,
        })));
        setFollowCounts(followCountsRes);

        if (myId && myId !== userId) {
          // Só o MEU lado do bloqueio: se foi a outra pessoa quem bloqueou, o
          // perfil nem chega aqui — some pela policy de `profiles`, e a tela cai
          // no estado de indisponível mais abaixo.
          isBlockedByMe(userId).then((estaBloqueado) => {
            if (active) setBloqueado(estaBloqueado);
          });

          const [followingRes, followsMeRes] = await Promise.all([
            getFollowing(myId),
            supabase
              .from('followers')
              .select('follower_id')
              .eq('follower_id', userId)
              .eq('following_id', myId)
              .maybeSingle(),
          ]);
          if (!active) return;
          setIsFollowing(
            followingRes.success &&
            Array.isArray(followingRes.data) &&
            followingRes.data.includes(userId)
          );
          setFollowsMe(!!followsMeRes.data);
        }
      } catch {
        if (active) setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [userId]);

  const toggleFollow = async () => {
    if (!currentUserId) return;

    const result = isFollowing
      ? await unfollowUser(currentUserId, userId)
      : await followUser(currentUserId, userId);

    if (!result.success) {
      Alert.alert('Erro', result.error || 'Não foi possível atualizar este perfil.');
      return;
    }

    setIsFollowing((current) => !current);
    setFollowCounts((current) => ({
      ...current,
      followers: Math.max(0, current.followers + (isFollowing ? -1 : 1)),
    }));
  };

  const openConversation = async () => {
    if (!currentUserId || currentUserId === userId) return;
    const result = await getOrCreateConversation(userId);
    if (!result.success) {
      Alert.alert('Erro', result.error || 'Não foi possível abrir a conversa.');
      return;
    }
    navigation.navigate('Conversation', { conversationId: result.data, profile });
  };

  // Bloquear e desbloquear.
  //
  // O efeito é do BANCO: a RPC desfaz o "seguir" dos dois lados e as policies
  // escondem tudo daí em diante. A tela não tenta repetir nada disso — só sai
  // do perfil, porque depois do bloqueio ele deixou de existir para quem bloqueou
  // e recarregar aqui mostraria a tela de indisponível na cara de quem acabou de
  // pedir o bloqueio.
  const confirmarBloqueio = async () => {
    setMenuVisible(false);

    const nome = profile?.display_name || `@${profile?.username}` || 'esta pessoa';
    const aceitou = await confirm(
      'Bloquear',
      `${nome} não vai mais ver seu perfil, suas fotos nem seus comentários — e você também não vê os dela.\n\n`
      + 'Se vocês se seguiam, deixam de se seguir agora.\n\n'
      + 'Você pode desfazer em Configurações › Usuários bloqueados.'
    );
    if (!aceitou) return;

    setProcessandoBloqueio(true);
    const resultado = await blockUser(userId);
    setProcessandoBloqueio(false);

    if (!resultado.success) {
      notify('Não foi possível bloquear', resultado.error || 'Tente novamente em instantes.');
      return;
    }

    notify('Usuário bloqueado', 'Vocês não se veem mais. Para desfazer, vá em Configurações › Usuários bloqueados.');
    navigation.goBack();
  };

  const desfazerBloqueio = async () => {
    setMenuVisible(false);

    setProcessandoBloqueio(true);
    const resultado = await unblockUser(userId);
    setProcessandoBloqueio(false);

    if (!resultado.success) {
      notify('Não foi possível desbloquear', resultado.error || 'Tente novamente em instantes.');
      return;
    }

    setBloqueado(false);
    notify('Usuário desbloqueado', 'Vocês voltam a se ver. Vocês NÃO voltam a se seguir.');
  };

  const openPhoto = (photo) => {
    navigation.navigate('PhotoDetail', { photoId: photo.id, photo });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C2BD9" />
      </View>
    );
  }

  // Perfil vazio não é mais só "não existe".
  //
  // Desde o bloqueio, a consulta volta SEM ERRO e SEM LINHA em três situações
  // diferentes: a pessoa bloqueou quem está olhando, a conta está em carência de
  // exclusão, ou o perfil sumiu mesmo. O texto não diz qual delas é — de
  // propósito: "fulano te bloqueou" entrega uma informação privada de quem
  // bloqueou, e é justamente o tipo de aviso que vira retaliação.
  if (!profile) {
    return (
      <View style={styles.center}>
        <Ionicons name="person-remove-outline" size={38} color="#3A4166" />
        <Text style={styles.notFound}>Este perfil não está disponível</Text>
        <Text style={styles.notFoundHint}>
          Ele pode ter sido removido ou não estar mais acessível para você.
        </Text>
        <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('Main')}>
          <Ionicons name="home-outline" size={18} color="#fff" />
          <Text style={styles.menuButtonText}>Voltar ao menu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const levelInfo = getLevelInfo(visitedCountries.length);
  const isOwnProfile = currentUserId === userId;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityLabel="Voltar" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={23} color="#F7F7F2" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Perfil</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            accessibilityLabel="Voltar ao menu"
            style={styles.homeButton}
            onPress={() => navigation.navigate('Main')}
          >
            <Ionicons name="home-outline" size={20} color="#F7F7F2" />
            <Text style={styles.homeText}>Menu</Text>
          </TouchableOpacity>

          {/* Bloquear e denunciar vivem atrás do "..." e não soltos na barra:
              são ações raras e pesadas, e um alvo de toque permanente ao lado do
              botão de mensagem convida ao acidente. Não aparece no próprio
              perfil — ninguém se bloqueia nem se denuncia. */}
          {!isOwnProfile && (
            <TouchableOpacity
              accessibilityLabel="Mais opções"
              accessibilityRole="button"
              style={styles.moreButton}
              onPress={() => setMenuVisible(true)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#F7F7F2" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.avatarRing, isFollowing && styles.avatarRingActive]}>
            <Avatar profile={profile} size={84} />
          </View>
          <Text style={styles.displayName}>{profile.display_name || profile.username}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
          {/* Opcional: sem bio, nada ocupa o lugar. O normalizeBio é a mesma
              defesa do ProfileScreen — bio antiga com muitas linhas em branco
              não abre vão vertical aqui. */}
          {profile.bio ? <Text style={styles.bio}>{normalizeBio(profile.bio)}</Text> : null}

          {/* Badge do Instagram. Opcional: o componente devolve null sem @. */}
          <InstagramBadge username={profile?.instagram_username} style={{ marginTop: 8 }} />

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{visitedCountries.length}</Text>
              <Text style={styles.statLabel}>Países</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{photos.length}</Text>
              <Text style={styles.statLabel}>Fotos</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Connections', { userId, mode: 'followers' })}
            >
              <Text style={styles.statValue}>{followCounts.followers}</Text>
              <Text style={styles.statLabel}>Seguidores</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Connections', { userId, mode: 'following' })}
            >
              <Text style={styles.statValue}>{followCounts.following}</Text>
              <Text style={styles.statLabel}>Seguindo</Text>
            </TouchableOpacity>
          </View>

          {!isOwnProfile ? (
            <View style={styles.profileActions}>
              <TouchableOpacity
                onPress={toggleFollow}
                style={[styles.followButton, isFollowing && styles.followingButton]}
              >
                <Text style={[styles.followText, isFollowing && styles.followingText]}>
                  {isFollowing ? 'Seguindo ✓' : followsMe ? 'Seguir de volta' : 'Seguir'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openConversation} style={styles.messageButton}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#F7F7F2" />
                <Text style={styles.messageButtonText}>Mensagem</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Fora do `styles.section`: o card já traz a própria margem, igual ao
            card de países logo abaixo. Dentro da seção ele ganharia os 18pt de
            paddingHorizontal por cima dos 12 de margem e ficaria mais estreito
            que o vizinho. */}
        <TravelerLevelCard
          countryCount={visitedCountries.length}
          levelInfo={levelInfo}
        />

        {visitedCountries.length > 0 ? (
          <CountryGridSection
            countries={visitedCountries}
            title="Países visitados"
            icon="book-outline"
          />
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PUBLICAÇÕES</Text>
          {photos.length === 0 ? (
            <Text style={styles.emptyPhotos}>Nenhuma foto pública ainda.</Text>
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.photoCard}
                  activeOpacity={0.86}
                  onPress={() => openPhoto(photo)}
                >
                  <Image source={{ uri: photo.photo_url }} style={styles.photoThumb} />
                  <View style={styles.photoInfo}>
                    <View style={styles.photoLocation}>
                      {photo.country_code ? (
                        <CountryFlag
                          countryCode={photo.country_code}
                          width={19}
                          height={13}
                          borderRadius={2}
                        />
                      ) : null}
                      <Text style={styles.photoLocationText} numberOfLines={1}>
                        {photo.location_name || photo.city || photo.country_name}
                      </Text>
                    </View>
                    {photo.rating > 0 ? (
                      <StarRating rating={photo.rating} size={11} />
                    ) : null}
                    {photo.caption ? (
                      <Text style={styles.photoCaption} numberOfLines={2}>
                        {photo.caption}
                      </Text>
                    ) : null}
                    {photo.review ? (
                      <Text style={styles.photoReview} numberOfLines={2}>
                        “{photo.review}”
                      </Text>
                    ) : null}
                    <View style={styles.commentCount}>
                      <Ionicons name="chatbubble-outline" size={13} color="#9aa0c6" />
                      <Text style={styles.commentCountText}>
                        {photo.comment_count} {photo.comment_count === 1 ? 'comentário' : 'comentários'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
          accessibilityLabel="Fechar"
        />
        <View style={styles.menuSheet}>
          <View style={styles.menuHandle} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              setReportVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Denunciar perfil"
          >
            <Ionicons name="flag-outline" size={19} color="#F7F7F2" />
            <View style={styles.menuItemText}>
              <Text style={styles.menuItemLabel}>Denunciar perfil</Text>
              <Text style={styles.menuItemHint}>Nossa equipe analisa. A pessoa não fica sabendo.</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={bloqueado ? desfazerBloqueio : confirmarBloqueio}
            disabled={processandoBloqueio}
            accessibilityRole="button"
            accessibilityLabel={bloqueado ? 'Desbloquear usuário' : 'Bloquear usuário'}
          >
            {processandoBloqueio
              ? <ActivityIndicator size="small" color="#FF4D6D" />
              : <Ionicons name={bloqueado ? 'lock-open-outline' : 'ban-outline'} size={19} color="#FF4D6D" />}
            <View style={styles.menuItemText}>
              <Text style={[styles.menuItemLabel, styles.menuItemDanger]}>
                {bloqueado ? 'Desbloquear' : 'Bloquear'}
              </Text>
              <Text style={styles.menuItemHint}>
                {bloqueado
                  ? 'Vocês voltam a se ver. Não voltam a se seguir.'
                  : 'Vocês deixam de se ver. Reversível quando quiser.'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      <ReportSheet
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetType="profile"
        targetId={userId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D1326' },
  container: { flex: 1 },
  scrollContent: { alignItems: 'center' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1326',
    padding: 24,
  },
  topBar: {
    minHeight: 76,
    paddingTop: 28,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#202744',
  },
  topBarTitle: { color: '#F7F7F2', fontSize: 17, fontWeight: '700' },
  homeButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  homeText: { color: '#F7F7F2', fontSize: 12, fontWeight: '600' },
  notFound: { color: '#9aa0c6', marginBottom: 16 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moreButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  notFoundHint: {
    color: '#5A6180',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: -2,
    marginBottom: 6,
    paddingHorizontal: 24,
  },
  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,7,15,0.6)' },
  menuSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#131A2E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingBottom: 34,
    paddingHorizontal: 18,
  },
  menuHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2B3352',
    marginBottom: 10,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 4 },
  menuItemText: { flex: 1 },
  menuItemLabel: { color: '#F7F7F2', fontSize: 14.5, fontWeight: '600' },
  menuItemDanger: { color: '#FF4D6D' },
  menuItemHint: { color: '#8A90A6', fontSize: 11.5, marginTop: 2 },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#6C2BD9',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  menuButtonText: { color: '#fff', fontWeight: '700' },
  header: {
    width: '100%',
    maxWidth: 1000,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
  },
  avatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#2a2f50',
    padding: 0,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingActive: { borderColor: '#6C2BD9' },
  displayName: { fontSize: 20, fontWeight: '700', color: '#F7F7F2', marginBottom: 4 },
  username: { fontSize: 13, color: '#9aa0c6', marginBottom: 16 },
  // Sem numberOfLines: a bio guarda as quebras de linha que a pessoa escreveu.
  bio: {
    fontSize: 13,
    lineHeight: 19,
    color: '#c8cde8',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: -8,
    marginBottom: 16,

    // Mesma correção do ProfileScreen, e pela mesma razão: o `styles.header`
    // daqui também tem `alignItems: 'center'`, então sem o `stretch` o Text é
    // dimensionado pelo conteúdo e uma sequência sem espaço vaza do card em vez
    // de quebrar. Ver o comentário longo em ProfileScreen.
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 19, fontWeight: '700', color: '#FF9A00' },
  statLabel: { fontSize: 10, color: '#9aa0c6', marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#2a2f50' },
  profileActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  followButton: {
    paddingVertical: 10,
    paddingHorizontal: 44,
    borderRadius: 24,
    backgroundColor: '#6C2BD9',
  },
  followingButton: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#6C2BD9' },
  followText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followingText: { color: '#9b65ef' },
  messageButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, borderRadius: 24, backgroundColor: '#202744', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  messageButtonText: { color: '#F7F7F2', fontWeight: '700', fontSize: 14 },
  section: { width: '100%', maxWidth: 1000, paddingHorizontal: 18, marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9aa0c6',
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 12,
  },
  photoCard: {
    width: '48%',
    minWidth: 156,
    flexGrow: 1,
    backgroundColor: '#1b1f3a',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#262d4d',
  },
  photoThumb: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#202744' },
  photoInfo: { padding: 11, gap: 6 },
  photoLocation: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoLocationText: { flex: 1, color: '#aeb3c9', fontSize: 11 },
  photoCaption: { color: '#F7F7F2', fontSize: 12, lineHeight: 17 },
  photoReview: { color: '#c4c7d7', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  commentCount: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  commentCountText: { color: '#9aa0c6', fontSize: 10 },
  emptyPhotos: { color: '#7f86a5', fontSize: 13 },
  bottomSpace: { height: 70 },
});
