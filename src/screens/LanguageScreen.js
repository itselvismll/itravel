// Tela "Idioma".
//
// SEM BANDEIRA, e isso é decisão, não falta de acabamento: bandeira é de país,
// não de idioma. O espanhol daqui serve argentino, mexicano e espanhol; o
// inglês serve quem mora na Irlanda e quem mora na Índia. Escolher uma bandeira
// seria dizer a quase todo falante que o idioma é de outro lugar. A sigla de duas
// letras num quadradinho resolve a mesma função — identificar a linha de relance
// — sem afirmar nada sobre nacionalidade.
//
// "AUTOMÁTICO" MOSTRA EM QUE IDIOMA CAI. Sem isso a opção é uma caixa fechada: a
// pessoa marca "Automático" e não sabe se vai receber português ou inglês, e se o
// aparelho estiver em alemão (que o app não tem) a surpresa é português sem
// explicação.
//
// NESTA FASE escolher inglês ou espanhol muda o LOCALE — data, número, moeda, e o
// campo de nome do mapa — mas os textos continuam em português, porque en.json e
// es.json ainda repetem o pt. É o comportamento esperado da fase 1, e a nota de
// pé da tela diz isso para quem testar não achar que está quebrado.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AUTOMATIC, SUPPORTED_LOCALES, localeDescriptor } from '../i18n';
import { useLocale } from '../i18n/LocaleProvider';

const ROXO = '#6C2BD9';

/**
 * Uma opção da lista.
 *
 * @param {{
 *   short: string,
 *   label: string,
 *   subtitle?: string,
 *   selected: boolean,
 *   onPress: () => void,
 *   selectedLabel: string,
 * }} props
 */
function LanguageRow({ short, label, subtitle, selected, onPress, selectedLabel }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      // O rótulo de acessibilidade diz o estado junto: um leitor de tela
      // anunciando só "Português (Brasil)" não informa qual está ativo.
      accessibilityLabel={selected ? `${label}, ${selectedLabel}` : label}
    >
      {/* O quadradinho da sigla ganha a cor da marca quando é o escolhido — é o
          segundo sinal de seleção, para quem não distingue o ícone à direita. */}
      <View style={[styles.tag, selected && styles.tagSelected]}>
        <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{short}</Text>
      </View>

      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>

      {selected && <Ionicons name="checkmark" size={20} color={ROXO} />}
    </TouchableOpacity>
  );
}

export default function LanguageScreen({ navigation }) {
  const { choice, automaticResolvesTo, changeLocale, t } = useLocale();

  // Em que idioma "Automático" cai agora, escrito na própria língua — o mesmo
  // rótulo que a opção correspondente usa, para a pessoa poder cruzar os dois.
  const automaticLabel = localeDescriptor(automaticResolvesTo).label;

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
        <Text style={styles.headerTitle}>{t('language.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.group} accessibilityRole="radiogroup">
          {/* "Automático" primeiro, e é o padrão de quem nunca escolheu: seguir o
              aparelho é o que acerta sem a pessoa fazer nada. */}
          <LanguageRow
            short="A"
            label={t('language.automatic')}
            subtitle={t('language.automaticSubtitle', { language: automaticLabel })}
            selected={choice === AUTOMATIC}
            onPress={() => changeLocale(AUTOMATIC)}
            selectedLabel={t('language.selectedLabel')}
          />

          <View style={styles.separator} />

          {SUPPORTED_LOCALES.map((locale) => (
            <LanguageRow
              key={locale.code}
              short={locale.short}
              label={locale.label}
              selected={choice === locale.code}
              onPress={() => changeLocale(locale.code)}
              selectedLabel={t('language.selectedLabel')}
            />
          ))}
        </View>

        <Text style={styles.footnote}>{t('language.footnote')}</Text>
      </ScrollView>
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
  content: { padding: 16, paddingBottom: 40 },

  group: {
    backgroundColor: '#131A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242D4C',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 14,
  },
  // O separador só entre "Automático" e a lista: ele marca que são dois grupos
  // de natureza diferente (seguir o sistema × fixar um idioma), e não quatro
  // opções soltas.
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },

  tag: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B2646',
    borderWidth: 1,
    borderColor: '#2C3760',
  },
  tagSelected: { backgroundColor: ROXO, borderColor: ROXO },
  tagText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter_600SemiBold', color: '#8A92B2' },
  tagTextSelected: { color: '#FFFFFF' },

  rowText: { flex: 1 },
  rowLabel: { fontSize: 14.5, fontWeight: '500', fontFamily: 'Inter_500Medium', color: '#F7F7F2' },
  rowSubtitle: { marginTop: 2, fontSize: 11.5, fontFamily: 'Inter_400Regular', color: '#7A82A3' },

  footnote: {
    marginTop: 20,
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
    color: '#5A6180',
  },
});
