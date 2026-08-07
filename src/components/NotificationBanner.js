import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, Animated, Easing, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBadge, getTitle } from '../utils/notificationRouting';

// O driver nativo não existe no react-native-web; sem isso o Animated emite aviso e as
// animações de transform param de rodar na build web.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const AVATAR_SIZE = 44;
const BADGE_SIZE = 20;
const HIDDEN_OFFSET = -160;

// O selo entra depois que o banner já assentou — a leitura é "banner chega, carimbo
// estampa em cima". Abaixo de ~300ms os dois movimentos se confundem num só.
const BADGE_DELAY_MS = 380;

function BannerAvatar({ actor }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = actor?.avatar_url?.trim();
  const label = (actor?.display_name || actor?.username || 'Viajante').trim();
  const initial = (label[0] || 'V').toLocaleUpperCase('pt-BR');

  useEffect(() => { setImageFailed(false); }, [avatarUrl]);

  if (avatarUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={styles.avatarImage}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <LinearGradient
      colors={['#6C2BD9', '#FF4D6D', '#FF9A00']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.avatarFallback}
    >
      <Text style={styles.avatarInitial}>{initial}</Text>
    </LinearGradient>
  );
}

/**
 * Banner puramente apresentacional. Quem decide o que mostrar, por quanto tempo e o que
 * acontece no toque é o GlobalNotificationBanner.
 *
 * @param {object} props
 * @param {object|null} props.notification notificação já enriquecida com `actor`
 * @param {() => void} props.onPress
 * @param {() => void} props.onHidden chamado quando a saída termina
 * @param {number} props.visibleForMs
 */
export default function NotificationBanner({
  notification,
  onPress,
  onHidden,
  visibleForMs = 2500,
}) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const badgeProgress = useRef(new Animated.Value(0)).current;

  const dismissTimerRef = useRef(null);
  const hasExitedRef = useRef(false);
  // Sem ref, o callback de saída fecharia sobre um `onHidden` obsoleto.
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;

  const notificationId = notification?.id ?? null;

  useEffect(() => {
    if (notificationId === null) return undefined;

    hasExitedRef.current = false;
    translateY.setValue(HIDDEN_OFFSET);
    opacity.setValue(0);
    badgeProgress.setValue(0);

    const hide = () => {
      if (hasExitedRef.current) return;
      hasExitedRef.current = true;
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: HIDDEN_OFFSET,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(() => onHiddenRef.current?.());
    };

    const entrance = Animated.parallel([
      // tension/friction baixos = overshoot suave, o equivalente em spring do
      // cubic-bezier(0.34, 1.56, 0.64, 1) do conceito.
      Animated.spring(translateY, {
        toValue: 0,
        tension: 68,
        friction: 9,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      // O selo gira e "encaixa", como um carimbo batendo no passaporte.
      Animated.sequence([
        Animated.delay(BADGE_DELAY_MS),
        Animated.spring(badgeProgress, {
          toValue: 1,
          tension: 130,
          friction: 6,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    ]);

    entrance.start();
    dismissTimerRef.current = setTimeout(hide, visibleForMs);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      entrance.stop();
    };
  }, [notificationId, visibleForMs, translateY, opacity, badgeProgress]);

  if (!notification) return null;

  const actor = notification.actor;
  const actorName = (actor?.display_name || actor?.username || 'Alguém').trim();
  const badge = getBadge(notification.type);
  const title = getTitle(notification, actorName);
  const preview = notification.preview?.trim();

  const badgeRotate = badgeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-140deg', '0deg'],
  });

  const handlePress = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    // O toque descarta na hora: nada de esperar o timer antes de navegar.
    onPress?.();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { paddingTop: insets.top + 8, opacity, transform: [{ translateY }] },
      ]}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
        accessibilityRole="button"
        accessibilityLabel={preview ? `${title}. ${preview}` : title}
      >
        <View style={styles.avatarWrap}>
          <BannerAvatar actor={actor} />
          <Animated.View
            style={[
              styles.badge,
              {
                backgroundColor: badge.color,
                transform: [{ scale: badgeProgress }, { rotate: badgeRotate }],
              },
            ]}
          >
            <Ionicons name={badge.icon} size={11} color="#0D1326" />
          </Animated.View>
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!!preview && (
            <Text style={styles.subtitle} numberOfLines={1}>{preview}</Text>
          )}
        </View>

        {!notification.read && <View style={styles.unreadDot} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 9999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    // Sem expo-blur: opacidade alta sobre a cor do tema dá a mesma leitura de "vidro"
    // sem introduzir dependência nativa nova.
    backgroundColor: 'rgba(20, 27, 51, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(247, 247, 242, 0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  bannerPressed: { opacity: 0.85 },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#F7F7F2', fontSize: 18, fontWeight: '700' },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#141B33',
  },
  textWrap: { flex: 1, gap: 2 },
  title: { color: '#F7F7F2', fontSize: 14, fontWeight: '700' },
  subtitle: { color: '#B7BCD6', fontSize: 12 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D1C1',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
});
