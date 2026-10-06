import React, { useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut, updateRecoveredPassword } from '../../services/supabase';
import { notify } from '../../utils/dialogs';
import { useLocale } from '../../i18n/LocaleProvider';
import { authErrorMessage } from '../../utils/authErrors';
import { PASSWORD_MIN_LENGTH } from '../../utils/authValidation';

export default function ResetPasswordScreen({ onComplete }) {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleSave = async () => {
    // A REGRA NÃO MUDOU: esta tela sempre exigiu só o comprimento mínimo, e
    // continua exigindo. O `8` que estava escrito aqui virou
    // `PASSWORD_MIN_LENGTH`, que é a mesma constante que o cadastro usa — o
    // número era igual nos dois lugares por coincidência, não por ligação.
    //
    // ATENÇÃO para quem for mexer: o cadastro exige maiúscula, minúscula e
    // número ALÉM do comprimento; a recuperação não. Então é possível sair daqui
    // com uma senha que o formulário de cadastro recusaria. Não mudei isso nesta
    // extração, que move texto e não comportamento — mas é divergência real.
    if (password.length < PASSWORD_MIN_LENGTH) {
      notify(
        t('auth.reset.tooShortTitle'),
        t('auth.reset.tooShortMessage', { count: PASSWORD_MIN_LENGTH })
      );
      return;
    }
    if (password !== confirmation) {
      notify(t('auth.reset.mismatchTitle'), t('auth.reset.mismatchMessage'));
      return;
    }

    setLoading(true);
    const result = await updateRecoveredPassword(password);
    if (result.success) {
      await signOut();
      notify(t('auth.reset.doneTitle'), t('auth.reset.doneMessage'));
      onComplete?.();
    } else {
      // O `result.error` cru que estava aqui era o terceiro vazamento de texto do
      // backend nesta pasta. Ver `utils/authErrors.js`.
      notify(t('auth.reset.failedTitle'), authErrorMessage(result, t));
    }
    setLoading(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name="shield-checkmark-outline" size={29} color="#35D3C8" /></View>
        <Text style={styles.title}>{t('auth.reset.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.reset.intro', { count: PASSWORD_MIN_LENGTH })}</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.reset.newPasswordPlaceholder')}
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
          placeholder={t('auth.reset.confirmPasswordPlaceholder')}
          placeholderTextColor="#777F9E"
          secureTextEntry={!visible}
        />
        <TouchableOpacity style={styles.primary} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('auth.reset.submit')}</Text>}
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
