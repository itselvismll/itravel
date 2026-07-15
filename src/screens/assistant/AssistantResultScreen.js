import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Share, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PROMPT_TYPES } from '../../services/assistantService';

const AssistantResultScreen = ({ route, navigation }) => {
  const { promptType, destination, response } = route.params;
  const type = PROMPT_TYPES.find(p => p.id === promptType);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${type?.emoji} ${type?.title} — ${destination}\n\n${response}\n\nGerado pelo Journi ✈️`,
        title: `${type?.title} — ${destination}`,
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {type?.emoji} {type?.title}
          </Text>
          <Text style={styles.headerSub}>📍 {destination}</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color="#9aa0c6" />
        </TouchableOpacity>
      </View>

      {/* Conteúdo */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.responseCard}>
          <Text style={styles.responseText}>{response}</Text>
        </View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.newSearchBtn}
        >
          <Ionicons name="sparkles-outline" size={18} color="#6C2BD9" />
          <Text style={styles.newSearchText}>Nova consulta</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1b1f3a', alignItems: 'center', justifyContent: 'center'
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#F7F7F2' },
  headerSub: { fontSize: 12, color: '#9aa0c6', marginTop: 2 },
  shareBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1b1f3a', alignItems: 'center', justifyContent: 'center'
  },
  scroll: { flex: 1 },
  responseCard: {
    backgroundColor: '#1b1f3a', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 20
  },
  responseText: { color: '#F7F7F2', fontSize: 14, lineHeight: 24 },
  newSearchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#6C2BD9'
  },
  newSearchText: { color: '#6C2BD9', fontWeight: '700', fontSize: 14 },
});

export default AssistantResultScreen;
