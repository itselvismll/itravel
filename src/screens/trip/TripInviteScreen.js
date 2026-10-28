// Convidar gente para a viagem — e a porta por onde um convite e aceito.
//
// UMA TELA, DUAS ENTRADAS, e e de proposito:
//
//   navigate('TripInvite', { tripId })  -> convidar (busca + link)
//   navigate('TripInvite', { token })   -> resgatar um link recebido
//
// Sao a mesma tela porque sao os dois lados da mesma coisa, e separa-las
// duplicaria o cabecalho, o tratamento de erro e a navegacao de volta. O que
// muda e so QUEM chega: pelo botao de convidar, ou por um link que o sistema
// operacional entregou ao app.
//
// O RESGATE NAO PEDE CONFIRMACAO, e isso e uma decisao. A pessoa ja decidiu
// quando tocou no link; um "deseja entrar?" no meio do caminho so adiciona um
// toque entre a intencao e a viagem. O que ela ve e a viagem abrindo — e, se algo
// falhar, o motivo em portugues, com um caminho de volta.
//
// Mobile-first, React Native puro: o mesmo arquivo nas tres plataformas.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import { searchInvitees } from '../../services/socialService';
import {
  getTripMembers,
  inviteTripMember,
  createTripInviteLink,
  getActiveTripInvite,
  redeemTripInvite,
} from '../../services/tripMemberService';
import { buildInviteUrl, buildInviteShare } from '../../utils/inviteLink';
import MemberAvatar from '../../components/trip/MemberAvatar';
import { useLocale } from '../../i18n/LocaleProvider';
import { notify } from '../../utils/dialogs';
import { trip, font, shadow, radius } from '../../theme/tripCollab';

/** Quanto esperar o dedo parar antes de ir ao banco. */
const DEBOUNCE_MS = 350;
/** Abaixo disso a busca devolveria meio Journi. */
const MIN_BUSCA = 2;

export default function TripInviteScreen({ route, navigation }) {
  const { t } = useLocale();
  const tripId = route?.params?.tripId || null;
  const token = route?.params?.token || null;
  const tripTitle = route?.params?.tripTitle || '';
  const insets = useSafeAreaInsets();

  // ── Resgate de link ───────────────────────────────────────────────────────
  const [redeeming, setRedeeming] = useState(Boolean(token));
  const [redeemError, setRedeemError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    setRedeeming(true);
    redeemTripInvite(token).then((resultado) => {
      if (cancelled) return;
      setRedeeming(false);

      if (!resultado.success || !resultado.data) {
        setRedeemError(resultado.error || 'Este convite não é mais válido.');
        return;
      }

      // `replace` e nao `navigate`: a tela do convite nao deve ficar no
      // historico. Voltar dali reabriria o resgate de um token ja usado e
      // mostraria "convite invalido" para quem acabou de entrar com sucesso.
      navigation.replace('AssistantResult', { planId: resultado.data });
    });

    return () => { cancelled = true; };
  }, [token, navigation]);

  // ── Convidar ──────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState(/** @type {string | null} */ (null));
  const [memberIds, setMemberIds] = useState(/** @type {Array<string>} */ ([]));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(/** @type {Array<any>} */ ([]));
  const [searching, setSearching] = useState(false);
  // Quem ja foi convidado NESTA sessao da tela. O banco e a fonte da verdade,
  // mas recarregar a lista inteira a cada convite piscaria a tela; marcar aqui
  // da a resposta imediata que o toque pede.
  const [convidados, setConvidados] = useState(/** @type {Array<string>} */ ([]));
  const [invitingId, setInvitingId] = useState(/** @type {string | null} */ (null));

  const [inviteToken, setInviteToken] = useState(/** @type {string | null} */ (null));
  const [linkBusy, setLinkBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (token) return undefined;
    let cancelled = false;

    (async () => {
      const [{ data: { user } }, membros, convite] = await Promise.all([
        supabase.auth.getUser(),
        getTripMembers(tripId),
        getActiveTripInvite(tripId),
      ]);
      if (cancelled) return;

      setUserId(user?.id || null);
      setMemberIds((membros.data || []).map((m) => m.id));
      // Mostrar o link que JA existe, em vez de gerar outro a cada abertura:
      // cada geracao revoga a anterior, e quem ja tinha recebido o link ficaria
      // para tras sem ninguem perceber.
      setInviteToken(convite.data?.token || null);
    })();

    return () => { cancelled = true; };
  }, [tripId, token]);

  // Busca com debounce. O `pedido` guarda qual busca esta em voo: sem ele, uma
  // resposta lenta de "mar" chegaria depois de "mariana" e sobrescreveria os
  // resultados certos pelos antigos.
  const pedido = useRef(0);
  useEffect(() => {
    const termo = query.trim();
    if (termo.length < MIN_BUSCA) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    const meu = pedido.current + 1;
    pedido.current = meu;

    const timer = setTimeout(async () => {
      const resultado = await searchInvitees(termo, { currentUserId: userId, memberIds });
      if (pedido.current !== meu) return;
      setResults(resultado.data || []);
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, userId, memberIds]);

  const convidar = useCallback(async (perfil) => {
    setInvitingId(perfil.id);
    const resultado = await inviteTripMember({ tripId, userId: perfil.id });
    setInvitingId(null);

    if (!resultado.success) {
      notify('Não foi possível convidar', resultado.error || 'Tente de novo em instantes.');
      return;
    }
    setConvidados((atual) => [...atual, perfil.id]);
  }, [tripId]);

  const gerarLink = useCallback(async () => {
    setLinkBusy(true);
    const resultado = await createTripInviteLink({ tripId });
    setLinkBusy(false);

    if (!resultado.success || !resultado.data) {
      notify('Não foi possível gerar o link', resultado.error || 'Tente de novo em instantes.');
      return;
    }
    setInviteToken(resultado.data);
  }, [tripId]);

  const inviteUrl = useMemo(() => (inviteToken ? buildInviteUrl(inviteToken) : null), [inviteToken]);

  const copiar = useCallback(async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    setCopiado(true);
    // O "Copiado" volta a ser "Copiar" sozinho: um botao que muda de rotulo para
    // sempre deixa a duvida de se ainda da para copiar de novo.
    setTimeout(() => setCopiado(false), 2000);
  }, [inviteUrl]);

  const compartilhar = useCallback(async () => {
    if (!inviteToken) return;
    const convite = buildInviteShare({ tripTitle, token: inviteToken });
    if (!convite) return;

    // Na web o Share do RN nao existe em todo navegador; copiar e o
    // comportamento que funciona em todos, e e melhor do que um botao que nao
    // faz nada.
    if (Platform.OS === 'web' && !globalThis.navigator?.share) {
      await copiar();
      return;
    }
    await Share.share({ message: convite.message, url: convite.url });
  }, [inviteToken, tripTitle, copiar]);

  // ── Resgate: a tela inteira e um estado ───────────────────────────────────
  if (token) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        {redeeming ? (
          <>
            <ActivityIndicator size="large" color={trip.accentSoft} />
            <Text style={styles.redeemText}>{t('tripInvite.redeeming')}</Text>
          </>
        ) : (
          <>
            <View style={styles.redeemIcon}>
              <Ionicons name="link-outline" size={30} color={trip.accentSoft} />
            </View>
            <Text style={styles.redeemTitle}>{t('tripInvite.unavailableTitle')}</Text>
            <Text style={styles.redeemText}>{redeemError}</Text>
            <TouchableOpacity
              onPress={() => navigation.replace('Main')}
              style={styles.redeemButton}
              accessibilityRole="button"
            >
              <Text style={styles.redeemButtonText}>{t('tripInvite.goHome')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  // ── Convidar ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('tripInvite.backLabel')}
        >
          <Ionicons name="chevron-back" size={20} color={trip.ink} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('tripInvite.invitePeople')}</Text>
          {tripTitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>para {tripTitle}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={trip.inkFaint} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('tripInvite.searchPlaceholder')}
            placeholderTextColor={trip.inkFaint}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? (
            <ActivityIndicator size="small" color={trip.inkFaint} style={styles.searchSpinner} />
          ) : null}
        </View>

        {query.trim().length >= MIN_BUSCA ? (
          <View style={styles.results}>
            <Text style={styles.sectionLabel}>{t('tripInvite.results')}</Text>

            {!searching && !results.length ? (
              <Text style={styles.emptyText}>
                Ninguém encontrado com “{query.trim()}”. Se a pessoa ainda não usa o Journi,
                mande o link abaixo.
              </Text>
            ) : null}

            {results.map((perfil) => {
              const jaConvidado = convidados.includes(perfil.id);
              const enviando = invitingId === perfil.id;

              return (
                <View key={perfil.id} style={styles.resultRow}>
                  <MemberAvatar person={perfil} size={44} showOwnerSeal={false} sealBorderColor={trip.bg} />

                  <View style={styles.resultText}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {perfil.display_name || perfil.username || t('tripInvite.unnamed')}
                    </Text>
                    <Text style={styles.resultHandle} numberOfLines={1}>
                      @{perfil.username}
                    </Text>
                  </View>

                  {jaConvidado ? (
                    // Estado "ja convidado": a acao nao volta a ser oferecida, e
                    // o chip diz por que. Um botao desabilitado no lugar deixaria
                    // a duvida de se o toque falhou.
                    <View style={styles.invitedChip}>
                      <Ionicons name="checkmark" size={12} color={trip.d2} />
                      <Text style={styles.invitedText}>{t('tripInvite.invited')}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => convidar(perfil)}
                      disabled={enviando}
                      style={[styles.inviteChip, enviando && styles.inviteChipBusy]}
                      accessibilityRole="button"
                      accessibilityLabel={`Convidar ${perfil.display_name || perfil.username}`}
                    >
                      {enviando ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.inviteChipText}>{t('tripInvite.invite')}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('tripInvite.orShareLink')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.linkCard}>
          <View style={styles.linkHead}>
            <View style={styles.linkIcon}>
              <Ionicons name="link" size={17} color={trip.accentSoft} />
            </View>
            <View style={styles.linkHeadText}>
              <Text style={styles.linkTitle}>{t('tripInvite.linkTitle')}</Text>
              <Text style={styles.linkDescription}>
                Qualquer pessoa com o link entra como participante. Expira em 30 dias.
              </Text>
            </View>
          </View>

          {inviteUrl ? (
            <>
              <View style={styles.linkBox}>
                <Text style={styles.linkText} numberOfLines={1}>{inviteUrl}</Text>
                <TouchableOpacity
                  onPress={copiar}
                  style={styles.copyButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('tripInvite.copyLinkLabel')}
                >
                  <Ionicons
                    name={copiado ? 'checkmark' : 'copy-outline'}
                    size={13}
                    color={copiado ? trip.d2 : trip.ink}
                  />
                  <Text style={[styles.copyText, copiado && { color: trip.d2 }]}>
                    {copiado ? t('tripInvite.copied') : t('tripInvite.copy_')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={compartilhar} style={styles.shareRow} accessibilityRole="button">
                <Ionicons name="share-social-outline" size={14} color={trip.accentSoft} />
                <Text style={styles.shareText}>{t('tripInvite.shareOtherApp')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={gerarLink}
              disabled={linkBusy}
              style={styles.generateButton}
              accessibilityRole="button"
            >
              {linkBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.generateText}>{t('tripInvite.generateLink')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Aviso do papel padrao COM ICONE, nao texto solto: a estrela dourada e
            a mesma que marca o organizador na lista de participantes, e amarra
            visualmente "papel" nas duas telas. */}
        <View style={styles.roleNotice}>
          <Ionicons name="star" size={16} color={trip.gold} />
          <Text style={styles.roleNoticeText}>
            {t('tripInvite.roleNoticePrefix')}<Text style={styles.roleNoticeStrong}>{t('tripInvite.roleNoticeStrong')}</Text>
            {t('tripInvite.roleNoticeSuffix')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: trip.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    backgroundColor: trip.card,
    borderWidth: 1,
    borderColor: trip.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    color: trip.ink,
    fontFamily: font.title,
    fontSize: 19,
    letterSpacing: -0.2,
  },
  subtitle: { color: trip.inkDim, fontFamily: font.body, fontSize: 12.5, marginTop: 1 },

  scroll: { paddingHorizontal: 20, paddingTop: 22, gap: 0 },

  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  searchInput: {
    height: 48,
    backgroundColor: trip.card,
    borderWidth: 1,
    borderColor: trip.line2,
    borderRadius: radius.field,
    paddingLeft: 42,
    paddingRight: 42,
    color: trip.ink,
    fontFamily: font.body,
    fontSize: 14.5,
  },
  searchSpinner: { position: 'absolute', right: 16 },

  results: { paddingTop: 14, gap: 2 },
  sectionLabel: {
    color: trip.inkFaint,
    fontFamily: font.bodySemi,
    fontSize: 11,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  emptyText: {
    color: trip.inkDim,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  resultText: { flex: 1, minWidth: 0 },
  resultName: { color: trip.ink, fontFamily: font.name, fontSize: 14.5 },
  resultHandle: { color: trip.inkDim, fontFamily: font.body, fontSize: 12.5 },

  inviteChip: {
    minWidth: 88,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.chip,
    backgroundColor: trip.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteChipBusy: { opacity: 0.7 },
  inviteChipText: { color: '#FFFFFF', fontFamily: font.bodySemi, fontSize: 12.5 },
  invitedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(47,217,196,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(47,217,196,0.3)',
  },
  invitedText: { color: trip.d2, fontFamily: font.bodySemi, fontSize: 12 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: trip.line },
  dividerText: { color: trip.inkFaint, fontFamily: font.bodyMedium, fontSize: 11.5 },

  linkCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: trip.card,
    borderWidth: 1,
    borderColor: trip.line2,
    ...shadow.card,
  },
  linkHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.control,
    backgroundColor: 'rgba(108,43,217,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(108,43,217,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkHeadText: { flex: 1, minWidth: 0 },
  linkTitle: { color: trip.ink, fontFamily: font.title, fontSize: 14.5 },
  linkDescription: { color: trip.inkDim, fontFamily: font.body, fontSize: 12, lineHeight: 17, marginTop: 2 },

  linkBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: trip.bg,
    borderWidth: 1,
    // Borda tracejada, como no mockup: ela diz "isto e um valor para levar
    // embora", diferente de um campo solido, que convida a digitar.
    borderStyle: 'dashed',
    borderColor: trip.line2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  linkText: {
    flex: 1,
    minWidth: 0,
    color: trip.inkDim,
    fontSize: 12.5,
    // Monoespacada: o link e para ser conferido caractere a caractere.
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: trip.card2,
    borderWidth: 1,
    borderColor: trip.line2,
  },
  copyText: { color: trip.ink, fontFamily: font.bodySemi, fontSize: 12 },

  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 2 },
  shareText: { color: trip.accentSoft, fontFamily: font.bodyMedium, fontSize: 12.5 },

  generateButton: {
    marginTop: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: trip.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    ...shadow.accentButton,
  },
  generateText: { color: '#FFFFFF', fontFamily: font.bodySemi, fontSize: 13.5 },

  roleNotice: {
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.row,
    backgroundColor: trip.card2,
    borderWidth: 1,
    borderColor: trip.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleNoticeText: { flex: 1, color: trip.inkDim, fontFamily: font.body, fontSize: 12.5, lineHeight: 18 },
  roleNoticeStrong: { color: trip.ink, fontFamily: font.bodySemi },

  redeemIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(108,43,217,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(108,43,217,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemTitle: { color: trip.ink, fontFamily: font.title, fontSize: 18, marginTop: 4 },
  redeemText: {
    color: trip.inkDim,
    fontFamily: font.body,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  redeemButton: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: radius.field,
    backgroundColor: trip.card2,
    borderWidth: 1,
    borderColor: trip.line2,
  },
  redeemButtonText: { color: trip.ink, fontFamily: font.bodySemi, fontSize: 13.5 },
});
