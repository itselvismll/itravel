// Tela "Perguntas frequentes" — segundo nível: as perguntas de UMA categoria,
// em sanfona (toca na pergunta, abre a resposta).
//
// `route.params.categoryKey` chega da FAQScreen. Categoria desconhecida (link
// quebrado, deep link velho) cai no fallback abaixo, em vez de estourar.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { findFaqCategory } from '../utils/faqContent';
import { useLocale } from '../i18n/LocaleProvider';
import useTabBarContentPadding from '../hooks/useTabBarContentPadding';

/**
 * Converte o `**negrito**` e as linhas `- item` da copy (ver
 * `docs/faq-content.md`) em texto de verdade, sem depender de um parser de
 * markdown inteiro — só UMA resposta usa essa marcação hoje (a lista de
 * papéis em "O que cada participante pode fazer?"), então o parser cobre só
 * o que a copy real usa: negrito inline e lista com `-`.
 *
 * @param {{ linha: string }} props `linha`: uma linha da resposta, já sem o `- ` do início
 */
function AnswerInlineText({ linha }) {
  const partes = linha.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={styles.answerText}>
      {partes.map((parte, index) => {
        const negrito = /^\*\*([^*]+)\*\*$/.exec(parte);
        return negrito
          ? <Text key={index} style={styles.answerBold}>{negrito[1]}</Text>
          : <Text key={index}>{parte}</Text>;
      })}
    </Text>
  );
}

/** @param {{ answer: string }} props */
function AnswerBody({ answer }) {
  const linhas = answer.split('\n');
  return (
    <View style={styles.answerBody}>
      {linhas.map((linha, index) => {
        const item = /^- (.*)$/.exec(linha);
        return item ? (
          <View key={index} style={styles.bulletRow}>
            <Text style={styles.bulletMark}>•</Text>
            <AnswerInlineText linha={item[1]} />
          </View>
        ) : (
          <AnswerInlineText key={index} linha={linha} />
        );
      })}
    </View>
  );
}

/**
 * @param {{
 *   question: string,
 *   answer: string,
 *   expanded: boolean,
 *   onToggle: () => void,
 * }} props
 */
function QuestionRow({ question, answer, expanded, onToggle }) {
  return (
    <View>
      <TouchableOpacity
        style={styles.questionRow}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.questionText}>{question}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#A78BFA" />
      </TouchableOpacity>
      {expanded && <AnswerBody answer={answer} />}
    </View>
  );
}

export default function FAQCategoryScreen({ navigation, route }) {
  const { t } = useLocale();
  const category = findFaqCategory(route.params?.categoryKey);
  // A pergunta aberta no momento, pela `key` dela -- uma só por vez, para a
  // tela não crescer sem limite com todas as respostas abertas ao mesmo tempo.
  const [openKey, setOpenKey] = useState(/** @type {string | null} */ (null));
  // A sanfona aberta ainda cresce a lista (a resposta mais longa tem várias
  // linhas) -- a mesma folga da FAQScreen vale aqui, e por mais motivo: sem
  // ela, abrir a última pergunta da categoria some atrás da barra.
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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {category ? t(category.titleKey) : t('faq.title')}
        </Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, tabBarPadding > 0 && { paddingBottom: tabBarPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {category ? (
          <View style={styles.group}>
            {category.questions.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && <View style={styles.separator} />}
                <QuestionRow
                  question={t(item.questionKey)}
                  answer={t(item.answerKey)}
                  expanded={openKey === item.key}
                  onToggle={() => setOpenKey((current) => (current === item.key ? null : item.key))}
                />
              </React.Fragment>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t('faq.categoryNotFound')}</Text>
        )}
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
  headerTitle: { flex: 1, textAlign: 'center', color: '#F7F7F2', fontFamily: 'Poppins_700Bold', fontSize: 16 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 40 },

  group: {
    backgroundColor: '#131A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242D4C',
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  questionText: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold', color: '#F7F7F2' },
  answerBody: { paddingHorizontal: 14, paddingBottom: 16, gap: 6 },
  answerText: { fontSize: 13.5, lineHeight: 20, fontFamily: 'Inter_400Regular', color: '#B6BCD6' },
  answerBold: { fontFamily: 'Inter_600SemiBold', color: '#D9D4F5' },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletMark: { fontSize: 13.5, lineHeight: 20, color: '#A78BFA' },
  emptyText: {
    textAlign: 'center', marginTop: 40,
    fontSize: 13.5, fontFamily: 'Inter_400Regular', color: '#7A82A3',
  },
});
