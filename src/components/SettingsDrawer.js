import React, { useEffect, useRef, useState } from 'react';
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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import LegalSheet from './LegalSheet';

const APP_VERSION = '1.0.0';
const MEDAL_SIZE = 20;
const DRAWER_WIDTH = Math.min(320, Math.round(Dimensions.get('window').width * 0.84));

// A mesma medalha da trilha de níveis do card Globetrotter, em miniatura: mesmo
// gradiente radial (foco acima e à esquerda, que é o que dá volume), mesmo halo
// roxo por baixo. Antes o selo era um globo em pílula gradiente ciano — bonito
// sozinho, mas sem parentesco com a trilha onde o nível é conquistado, então o
// "nível 4" lia como enfeite em vez de progresso.
//
// A estrela vem do Ionicons, e não de um path escrito à mão, pelo mesmo motivo
// que no card: um desenho na unha ficaria pior e mais difícil de manter.
function LevelMedalMini() {
  const center = MEDAL_SIZE / 2;

  return (
    <View style={styles.medal}>
      <Svg width={MEDAL_SIZE} height={MEDAL_SIZE}>
        <Defs>
          <RadialGradient id="drawerMedalFill" cx="32%" cy="28%" r="78%">
            <Stop offset="0" stopColor="#B79CF0" />
            <Stop offset="1" stopColor="#5B1FB8" />
          </RadialGradient>
        </Defs>
        <Circle cx={center} cy={center} r={center - 1} fill="url(#drawerMedalFill)" />
      </Svg>

      <View style={styles.medalIcon} pointerEvents="none">
        <Ionicons name="star" size={11} color="#FFFFFF" />
      </View>
    </View>
  );
}

// O ícone perdeu a cápsula roxa e ficou só o traço. A cápsula empurrava o peso
// visual de cada linha para o lado do ícone, o que numa lista de CONFIGURAÇÕES
// (onde o que importa é o texto da ação) lia como app infantil.
//
// `labelStyle` existe para o "Sair" cair meio passo de peso em vez de acompanhar
// os outros: continua sendo o item de destaque da lista, sem gritar.
function DrawerItem({ icon, label, color = '#F7F7F2', iconColor = '#A78BFA', labelStyle, onPress }) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.itemIcon}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.itemLabel, labelStyle, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#4A5273" />
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
  onBlockedUsers,
  onLogout,
}) {
  // A folha legal e' irma do drawer, nao filha: um Modal dentro de outro Modal
  // nao empilha de forma confiavel no iOS.
  const [legalVisible, setLegalVisible] = useState(false);

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
                  <LevelMedalMini />
                  <Text style={styles.levelBadgeText}>
                    <Text style={styles.levelBadgeName}>{level.name}</Text>
                    {` · nível ${level.level}`}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <DrawerItem icon="person-outline" label="Editar perfil" onPress={onEditProfile} />
              <DrawerItem
                icon="help-circle-outline"
                label="Ajuda e suporte"
                onPress={onSupport}
              />
              {/* Abre a LegalSheet, e não uma URL direto: são DOIS documentos com
                  nomes próprios, e um item só do menu precisa dar acesso aos dois.
                  "Excluir minha conta" NÃO mora mais lá — foi para a tela de
                  Editar perfil, junto do resto do que é da conta. */}
              <DrawerItem
                icon="shield-checkmark-outline"
                label="Política e Privacidade"
                onPress={() => setLegalVisible(true)}
              />
              {/* Fica ao lado de "Política e Privacidade" porque é do mesmo
                  assunto — o que eu controlo sobre quem me alcança — e porque é
                  o ÚNICO caminho de volta: quem foi bloqueado some de toda busca
                  e do próprio perfil, então não há outro lugar onde desfazer. */}
              <DrawerItem
                icon="ban-outline"
                label="Usuários bloqueados"
                onPress={onBlockedUsers}
              />
              {/* Espaço reservado para novos itens (notificações, idioma...) */}
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <DrawerItem
                icon="log-out-outline"
                label="Sair"
                color="#FF4D6D"
                iconColor="#FF4D6D"
                labelStyle={styles.itemLabelSair}
                onPress={onLogout}
              />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Journi v{APP_VERSION}</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      <LegalSheet visible={legalVisible} onClose={() => setLegalVisible(false)} />
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
  // A pílula recuou: era um gradiente roxo saturado que competia com o avatar
  // logo acima. Agora é a superfície elevada do card com uma borda de um pixel —
  // quem dá a cor é a medalha, que é o elemento com significado.
  levelBadge: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#1B2646',
    borderWidth: 1,
    borderColor: '#262F52',
  },
  levelBadgeText: { fontSize: 11.5, fontWeight: '600', color: '#EDEFF7', letterSpacing: 0.1 },
  levelBadgeName: { color: '#A78BFA', fontWeight: '700' },
  medal: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // Halo discreto, como no card de níveis: no web vira box-shadow, no nativo
    // sombra de elevação.
    shadowColor: '#A78BFA',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  medalIcon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Peso 500 com um fio de letter-spacing: bold na lista inteira lia como quatro
  // botões grandes empilhados, e isto é uma lista de opções.
  itemLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '500',
    fontFamily: 'Poppins_500Medium',
    letterSpacing: 0.2,
  },
  itemLabelSair: { fontWeight: '600', fontFamily: 'Poppins_600SemiBold' },
  footer: { marginTop: 'auto', alignItems: 'center', paddingTop: 24 },
  footerText: { fontSize: 11, color: '#5A6180' },
});
