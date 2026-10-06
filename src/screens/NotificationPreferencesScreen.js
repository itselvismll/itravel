// Tela "Notificações": o que o sino pode te avisar.
//
// O FILTRO DE VERDADE NÃO ESTÁ AQUI
//
// Esta tela só grava booleanos. Quem decide se o aviso nasce é um trigger BEFORE
// INSERT em `notifications`, no banco (migração 20260930120000) — é por isso que
// desligar funciona para os sete caminhos que criam aviso, inclusive os que rodam
// sem o app aberto. Se um dia um interruptor daqui não tiver efeito, o lugar de
// olhar é `public.notification_category`, não este arquivo.
//
// AS SEÇÕES VÊM DE MÓDULO PURO
//
// `NOTIFICATION_PREFERENCE_SECTIONS` mora em `utils/notificationCategories.js`
// porque a lista precisa combinar com as colunas da tabela, e de lá o teste
// consegue cobrar que combina sem renderizar nada. Acrescentar uma categoria é
// mexer em três lugares (migração, aquele módulo, a tabela) — e o teste cobra os
// três.
//
// NÃO EXISTE INTERRUPTOR DE MENSAGEM DIRETA, e não é esquecimento: DM não passa
// por `notifications`. A migração 20260812130000 derrubou o trigger
// `notify_new_message`; o contador de conversa sai de `messages.read_at`, via
// `get_unread_message_count`. Um interruptor aqui gravaria coluna que nenhum
// trigger lê — enfeite que mente para o usuário.
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_SECTIONS,
} from '../utils/notificationCategories';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../services/notificationPreferenceService';
import { useLocale } from '../i18n/LocaleProvider';

const ROXO = '#6C2BD9';
const TRILHO_DESLIGADO = '#2A3354';
// O dourado do aviso de pausa. Não é vermelho de propósito: pausar não é erro nem
// perigo, é um estado que a pessoa escolheu e precisa conseguir enxergar.
const DOURADO = '#E9B949';

/**
 * O interruptor, com a mesma cor nas duas plataformas.
 *
 * `thumbColor` e `ios_backgroundColor` existem porque o Switch do React Native usa
 * o padrão do sistema em cada lado: sem eles, o trilho desligado sai cinza-claro
 * no iOS e quase branco na web, que neste fundo escuro lê como ligado.
 *
 * @param {{ value: boolean, onValueChange: (v: boolean) => void, disabled?: boolean, label: string }} props
 */
function Interruptor({ value, onValueChange, disabled = false, label }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: ROXO, false: TRILHO_DESLIGADO }}
      thumbColor={Platform.OS === 'android' ? (value ? '#EDE4FF' : '#8A92B2') : undefined}
      ios_backgroundColor={TRILHO_DESLIGADO}
      accessibilityLabel={label}
      accessibilityRole="switch"
    />
  );
}

export default function NotificationPreferencesScreen({ navigation }) {
  const { t } = useLocale();
  const [prefs, setPrefs] = useState(
    /** @type {Record<string, boolean>} */ ({ ...DEFAULT_NOTIFICATION_PREFERENCES })
  );
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useFocusEffect(useCallback(() => {
    let ativo = true;
    getNotificationPreferences().then((resultado) => {
      if (!ativo) return;
      setPrefs(resultado.data);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, []));

  const mostrarToast = useCallback((texto) => {
    setToast(texto);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setToast(''); });
  }, [toastOpacity]);

  // Otimista com rollback: o interruptor precisa virar no toque, senão a pessoa
  // toca de novo achando que não pegou. O estado anterior é capturado ANTES do
  // await e restaurado se o banco recusar — sem isso, falha de rede deixaria a
  // tela mostrando uma escolha que não foi gravada, que é pior do que não mudar.
  const alternar = useCallback(async (chave, valor) => {
    const anterior = prefs;
    setPrefs({ ...anterior, [chave]: valor });

    const resultado = await saveNotificationPreferences(anterior, { [chave]: valor });
    if (!resultado.success) {
      setPrefs(anterior);
      mostrarToast(t('common.toast.saveFailed'));
    }
  }, [prefs, mostrarToast, t]);

  const pausado = prefs.all_enabled === false;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notificationPreferences.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      {carregando ? (
        <View style={styles.center}><ActivityIndicator color={ROXO} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* O card do geral ───────────────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardText}>
                <Text style={styles.cardLabel}>{t('notificationPreferences.all.label')}</Text>
              </View>
              <Interruptor
                value={!pausado}
                onValueChange={(valor) => alternar('all_enabled', valor)}
                label={t('notificationPreferences.all.label')}
              />
            </View>
            {/* O texto muda com o estado porque é ele que responde a pergunta que
                a pessoa faz ao desligar: "e as minhas escolhas, perdi?". A
                resposta é não, e ela precisa estar escrita no momento do medo. */}
            <Text style={[styles.cardHelp, pausado && styles.cardHelpPausado]}>
              {pausado
                ? t('notificationPreferences.all.helpPaused')
                : t('notificationPreferences.all.helpOn')}
            </Text>
          </View>

          {/* As categorias ─────────────────────────────────────────────────── */}
          {NOTIFICATION_PREFERENCE_SECTIONS.map((secao) => (
            <View key={secao.titleKey} style={styles.section}>
              <Text style={styles.sectionLabel}>{t(secao.titleKey)}</Text>

              {/* Apagadas e sem toque durante a pausa, mas com o interruptor
                  MOSTRANDO o estado real de cada uma — é a prova visível de que a
                  escolha continua lá. Esconder as linhas, ou forçá-las para
                  desligado, diria o contrário do texto do card. */}
              <View style={[styles.rows, pausado && styles.rowsPausado]} pointerEvents={pausado ? 'none' : 'auto'}>
                {secao.rows.map((linha) => (
                  <View key={linha.key} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Ionicons name={linha.icon} size={20} color="#A78BFA" />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{t(linha.labelKey)}</Text>
                      {!!linha.subtitleKey && <Text style={styles.rowSubtitle}>{t(linha.subtitleKey)}</Text>}
                    </View>
                    <Interruptor
                      value={prefs[linha.key] !== false}
                      onValueChange={(valor) => alternar(linha.key, valor)}
                      disabled={pausado}
                      label={t(linha.labelKey)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.footnote}>{t('notificationPreferences.footnote')}</Text>
        </ScrollView>
      )}

      {!!toast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
          <Ionicons name="alert-circle" size={15} color={DOURADO} />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    backgroundColor: '#0D1326',
    paddingHorizontal: 12,
    paddingTop: 48,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: '#131A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242D4C',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#F7F7F2' },
  cardHelp: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Inter_400Regular',
    color: '#7A82A3',
  },
  cardHelpPausado: { color: DOURADO },

  section: { marginTop: 26 },
  sectionLabel: {
    marginLeft: 2,
    marginBottom: 8,
    fontSize: 10.5,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.1,
    color: '#6B7395',
  },
  rows: { gap: 2 },
  // ~0.4: apagado o suficiente para ler como indisponível, e ainda legível — o
  // estado de cada interruptor precisa continuar visível durante a pausa.
  rowsPausado: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 2 },
  rowIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14.5, fontWeight: '500', fontFamily: 'Inter_500Medium', color: '#F7F7F2' },
  rowSubtitle: { marginTop: 2, fontSize: 11.5, fontFamily: 'Inter_400Regular', color: '#7A82A3' },

  footnote: {
    marginTop: 28,
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
    color: '#5A6180',
  },

  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#1B2646',
    borderWidth: 1,
    borderColor: '#3A3354',
  },
  toastText: { fontSize: 12.5, fontFamily: 'Inter_500Medium', color: '#EDEFF7' },
});
