import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser } from '../../services/supabase';
import { createSupportTicket, SUPPORT_CATEGORIES } from '../../services/supportService';

const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function SupportScreen({ navigation }) {
  const [loadingUser, setLoadingUser] = useState(true);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      if (currentUser?.email) setEmail(currentUser.email);
      setLoadingUser(false);
    })();
  }, []);

  const isLoggedIn = Boolean(user);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Informe seu email.');
      return;
    }
    if (!validateEmail(email.trim())) {
      setError('Email inválido.');
      return;
    }
    if (!category) {
      setError('Escolha um assunto.');
      return;
    }
    if (!description.trim()) {
      setError('Descreva o que aconteceu.');
      return;
    }

    setError('');
    setSubmitting(true);
    const result = await createSupportTicket({
      userId: user?.id,
      email: email.trim(),
      category,
      description,
    });
    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
    } else {
      setError('Não foi possível enviar sua mensagem agora. Tente novamente.');
    }
  };

  if (submitted) {
    return (
      <View style={styles.container}>
        <View style={styles.successWrapper}>
          <View style={styles.iconCircle}>
            <LinearGradient
              colors={['#6C2BD9', '#FF4D6D', '#FF9A00']}
              style={styles.iconCircleGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="checkmark" size={48} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={styles.successTitle}>Recebemos sua mensagem, obrigado!</Text>
          <Text style={styles.successText}>
            Nossa equipe vai analisar e, se precisar, responde pelo email {email.trim()}.
          </Text>
          <TouchableOpacity
            style={[styles.generateButton, { width: '100%' }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.generateText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Ajuda e suporte</Text>
          <Text style={styles.headerSubtitle}>Conte pra gente o que aconteceu</Text>
        </View>
        <Ionicons name="help-buoy-outline" size={24} color="#8B5CF6" />
      </View>

      {loadingUser ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#6C2BD9" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="mail-outline" size={17} color="#A78BFA" />
              </View>
              <Text style={styles.sectionTitle}>Seu email</Text>
            </View>
            {isLoggedIn ? (
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyText}>{email}</Text>
                <Ionicons name="lock-closed-outline" size={14} color="#757D9D" />
              </View>
            ) : (
              <TextInput
                value={email}
                onChangeText={(text) => { setEmail(text); setError(''); }}
                placeholder="seuemail@exemplo.com"
                placeholderTextColor="#626987"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="pricetag-outline" size={17} color="#A78BFA" />
              </View>
              <Text style={styles.sectionTitle}>Assunto</Text>
            </View>
            <View style={styles.chips}>
              {SUPPORT_CATEGORIES.map(({ id, label }) => {
                const active = category === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => { setCategory(id); setError(''); }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={17} color="#A78BFA" />
              </View>
              <Text style={styles.sectionTitle}>Descreva o que aconteceu</Text>
            </View>
            <TextInput
              value={description}
              onChangeText={(text) => { setDescription(text); setError(''); }}
              placeholder="Quanto mais detalhes, mais rápido conseguimos ajudar..."
              placeholderTextColor="#626987"
              multiline
              style={[styles.input, styles.multiline]}
            />
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={19} color="#FF8AA0" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.generateButton, submitting && styles.disabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Ionicons name="send-outline" size={18} color="#fff" />}
            <Text style={styles.generateText}>{submitting ? 'Enviando...' : 'Enviar'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 48,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  iconButton: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#1B2240', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#F7F7F2', fontFamily: 'Poppins_700Bold', fontSize: 18 },
  headerSubtitle: { color: '#8F96B3', fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 56, gap: 14 },
  section: {
    backgroundColor: '#151B33', borderRadius: 18, padding: 16, gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionIcon: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { color: '#F7F7F2', fontFamily: 'Poppins_700Bold', fontSize: 15 },
  input: {
    color: '#F7F7F2', fontFamily: 'Poppins_400Regular', backgroundColor: '#202744',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 13, paddingVertical: 12, fontSize: 14,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  readonlyField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 13, paddingVertical: 12,
  },
  readonlyText: { color: '#9DA4C3', fontFamily: 'Poppins_400Regular', fontSize: 14, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 99,
    backgroundColor: '#202744', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: { backgroundColor: '#6C2BD9', borderColor: '#9B6EF3' },
  chipText: { color: '#9DA4C3', fontFamily: 'Poppins_700Bold', fontSize: 12 },
  chipTextActive: { color: '#fff' },
  errorBox: {
    flexDirection: 'row', gap: 8, padding: 12, backgroundColor: 'rgba(255,77,109,0.12)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,77,109,0.35)',
  },
  errorText: { color: '#FFB0BF', flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 },
  generateButton: {
    backgroundColor: '#6C2BD9', borderRadius: 15, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  generateText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 15 },
  disabled: { opacity: 0.65 },
  successWrapper: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingVertical: 60, gap: 4,
  },
  iconCircle: { width: 96, height: 96, borderRadius: 48, marginBottom: 28, overflow: 'hidden' },
  iconCircleGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successTitle: {
    fontFamily: 'Poppins_700Bold', fontSize: 22, color: '#FFFFFF',
    textAlign: 'center', marginBottom: 16,
  },
  successText: {
    fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 22, color: '#9DA4C3',
    textAlign: 'center', marginBottom: 32,
  },
});
