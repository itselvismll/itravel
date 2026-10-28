// Tela "Perguntas frequentes" — primeiro nível: a lista de categorias.
//
// DOIS NÍVEIS EM DUAS TELAS, NÃO EXPANSÃO NA MESMA
//
// Toda seção de configurações deste app (Idioma, Notificações, Usuários
// bloqueados, Ajuda e suporte) é uma tela própria na `ProfileStack`, nunca uma
// expansão dentro de outra tela — ver AppNavigator.js. 35 perguntas numa única
// tela com dois níveis de sanfona aberta ficaria pesada e difícil de rolar; uma
// tela por nível segue o padrão que o app já usa em todo o resto do menu.
//
// A COPY vem de `src/utils/faqContent.js` (chaves) + `docs/faq-content.md`
// (fonte do texto) — nenhuma pergunta ou resposta nasce aqui.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FAQ_CATEGORIES } from '../utils/faqContent';
import { useLocale } from '../i18n/LocaleProvider';
import useTabBarContentPadding from '../hooks/useTabBarContentPadding';

/**
 * @param {{
 *   icon: React.ComponentProps<typeof Ionicons>['name'],
 *   title: string,
 *   count: number,
 *   countLabel: string,
 *   onPress: () => void,
 * }} props
 */
function CategoryRow({ icon, title, count, countLabel, onPress }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${countLabel}`}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color="#A78BFA" />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{countLabel}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#4A5273" />
    </TouchableOpacity>
  );
}

export default function FAQScreen({ navigation }) {
  const { t } = useLocale();
  // A barra de abas flutua sobre o conteúdo (ver tabBarLayout.js) e não
  // reserva espaço nenhum no layout: sem esta folga, a última categoria da
  // lista nasce atrás dela, rolável até lá mas inacessível.
  const tabBarPadding = useTabBarContentPadding();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
        >
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('faq.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('faq.categoriesSubtitle')}</Text>
        </View>
        <Ionicons name="help-circle-outline" size={24} color="#8B5CF6" />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, tabBarPadding > 0 && { paddingBottom: tabBarPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.group}>
          {FAQ_CATEGORIES.map((category, index) => (
            <React.Fragment key={category.key}>
              {index > 0 && <View style={styles.separator} />}
              <CategoryRow
                icon={category.icon}
                title={t(category.titleKey)}
                count={category.questions.length}
                countLabel={t('common.plural.question', { count: category.questions.length })}
                onPress={() => navigation.navigate('FAQCategory', { categoryKey: category.key })}
              />
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingTop: 48,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  iconButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#1B2240', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#F7F7F2', fontFamily: 'Poppins_700Bold', fontSize: 18 },
  headerSubtitle: { color: '#8F96B3', fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 40 },

  group: {
    backgroundColor: '#131A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242D4C',
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginLeft: 58 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 14,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.14)',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: '500', fontFamily: 'Inter_500Medium', color: '#F7F7F2' },
  rowSubtitle: { marginTop: 2, fontSize: 11.5, fontFamily: 'Inter_400Regular', color: '#7A82A3' },
});
