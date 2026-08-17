import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const APP_VERSION = '1.0.0';
const DRAWER_WIDTH = Math.min(320, Math.round(Dimensions.get('window').width * 0.84));

function DrawerItem({ icon, label, color = '#F7F7F2', iconColor = '#C4B5FD', onPress }) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.itemIcon}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <Text style={[styles.itemLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color="#4A5273" />
    </TouchableOpacity>
  );
}

export default function SettingsDrawer({
  visible,
  onClose,
  profile,
  avatarUrl,
  levelInfo,
  onEditProfile,
  onSupport,
  onLogout,
}) {
  const translateX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: visible ? 0 : DRAWER_WIDTH,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: visible ? 1 : 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  // Arrastar o painel para a direita fecha o drawer.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dx > 0) translateX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx > DRAWER_WIDTH * 0.3 || gesture.vx > 0.5) {
          onClose();
        } else {
          Animated.timing(translateX, {
            toValue: 0,
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const initials = profile?.display_name?.[0]?.toUpperCase() || profile?.username?.[0]?.toUpperCase() || '?';
  const photo = profile?.avatar_url || avatarUrl;
  const level = levelInfo?.current;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
            accessibilityLabel="Fechar configurações"
          />
        </Animated.View>

        <Animated.View
          style={[styles.panel, { transform: [{ translateX }] }]}
          {...panResponder.panHandlers}
        >
          <ScrollView contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <LinearGradient
                colors={['#6C2BD9', '#FF4D6D', '#FF9F45']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                <View style={styles.avatarInner}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                </View>
              </LinearGradient>
              {!!profile?.username && <Text style={styles.username}>@{profile.username}</Text>}
              {!!level && (
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>
                    {level.icon} {level.name} nível {level.level}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <DrawerItem icon="person-circle-outline" label="Editar perfil" onPress={onEditProfile} />
              <DrawerItem
                icon="help-buoy-outline"
                label="Ajuda e suporte"
                iconColor="#00D1C1"
                onPress={onSupport}
              />
              {/* Espaço reservado para novos itens (notificações, privacidade, idioma...) */}
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <DrawerItem icon="log-out-outline" label="Sair" color="#FF4D6D" iconColor="#FF4D6D" onPress={onLogout} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Journi v{APP_VERSION}</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,20,0.65)' },
  panel: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: '#131A2E',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.07)',
    ...Platform.select({
      web: { boxShadow: '-8px 0 24px rgba(0,0,0,0.45)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: -6, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 14,
        elevation: 16,
      },
    }),
  },
  panelContent: { paddingTop: 52, paddingBottom: 24, flexGrow: 1 },
  header: { alignItems: 'center', paddingHorizontal: 18, paddingBottom: 20 },
  avatarRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0D1326',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 35 },
  avatarText: { fontSize: 26, fontWeight: '700', fontFamily: 'Poppins_700Bold', color: '#F7F7F2' },
  username: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#F7F7F2',
  },
  levelBadge: {
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(108,43,217,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(196,181,253,0.3)',
  },
  levelBadgeText: { fontSize: 11, fontWeight: '600', color: '#C4B5FD' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 16 },
  section: { paddingVertical: 8, paddingHorizontal: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { flex: 1, fontSize: 14, fontWeight: '700', fontFamily: 'Poppins_700Bold' },
  footer: { marginTop: 'auto', alignItems: 'center', paddingTop: 24 },
  footerText: { fontSize: 11, color: '#5A6180' },
});
