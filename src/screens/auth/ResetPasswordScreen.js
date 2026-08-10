import React, { useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut, updateRecoveredPassword } from '../../services/supabase';
import { notify } from '../../utils/dialogs';

export default function ResetPasswordScreen({ onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleSave = async () => {
    if (password.length < 8) {
      notify('Senha muito curta', 'Use pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      notify('Senhas diferentes', 'Digite a mesma senha nos dois campos.');
      return;
    }

    setLoading(true);
    const result = await updateRecoveredPassword(password);
    if (result.success) {
      await signOut();
      notify('Senha atualizada', 'Entre novamente usando sua nova senha.');
      onComplete?.();
    } else {
      notify('Não foi possível atualizar', result.error || 'Solicite um novo link de recuperação.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name="shield-checkmark-outline" size={29} color="#35D3C8" /></View>
        <Text style={styles.title}>Crie uma nova senha</Text>
        <Text style={styles.subtitle}>A nova senha deve ter pelo menos 8 caracteres.</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Nova senha"
            placeholderTextColor="#777F9E"
            secureTextEntry={!visible}
          />
          <TouchableOpacity style={styles.eye} onPress={() => setVisible(value => !value)}>
            <Ionicons name={visible ? 'eye-outline' : 'eye-off-outline'} size={20} color="#9BA2BF" />
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder="Confirmar nova senha"
          placeholderTextColor="#777F9E"
          secureTextEntry={!visible}
        />
        <TouchableOpacity style={styles.primary} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Salvar nova senha</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D1326', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 430, backgroundColor: '#151B33', borderRadius: 22, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(53,211,200,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: '#F7F7F2', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#9BA2BF', fontSize: 13, marginTop: 8, marginBottom: 22 },
  passwordRow: { position: 'relative', marginBottom: 12 },
  input: { color: '#F7F7F2', backgroundColor: '#202744', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 14, paddingVertical: 14, paddingRight: 48, fontSize: 14 },
  eye: { position: 'absolute', right: 6, top: 4, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  primary: { minHeight: 48, backgroundColor: '#6C2BD9', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
