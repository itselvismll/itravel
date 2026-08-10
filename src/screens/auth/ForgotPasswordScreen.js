import React, { useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestPasswordReset } from '../../services/supabase';
import { notify } from '../../utils/dialogs';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      notify('E-mail inválido', 'Informe o e-mail usado na sua conta.');
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(normalizedEmail);
    setLoading(false);

    if (!result.success) {
      notify('Não foi possível enviar', result.error || 'Tente novamente em alguns minutos.');
      return;
    }

    setSent(true);
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Voltar">
        <Ionicons name="arrow-back" size={23} color="#F7F7F2" />
      </TouchableOpacity>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name="key-outline" size={28} color="#A78BFA" /></View>
        <Text style={styles.title}>Recuperar senha</Text>
        <Text style={styles.subtitle}>
          {sent
            ? 'Enviamos as instruções. Abra o link recebido neste mesmo dispositivo para criar uma nova senha.'
            : 'Informe o e-mail da sua conta para receber um link seguro de recuperação.'}
        </Text>

        {!sent && (
          <>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seuemail@exemplo.com"
              placeholderTextColor="#777F9E"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.primary} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Enviar link</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.secondaryText}>Voltar para o login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D1326', alignItems: 'center', justifyContent: 'center', padding: 20 },
  back: { position: 'absolute', top: 24, left: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: '#202744', alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 430, backgroundColor: '#151B33', borderRadius: 22, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(139,92,246,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: '#F7F7F2', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#9BA2BF', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 22 },
  input: { color: '#F7F7F2', backgroundColor: '#202744', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 14, paddingVertical: 14, fontSize: 14 },
  primary: { minHeight: 48, backgroundColor: '#6C2BD9', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  secondary: { alignItems: 'center', paddingTop: 18 },
  secondaryText: { color: '#A78BFA', fontSize: 13, fontWeight: '700' },
});
