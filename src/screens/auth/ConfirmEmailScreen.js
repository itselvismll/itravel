import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { COLORS, SIZES } from '../../utils/constants';

export default function ConfirmEmailScreen({ navigation, route }) {
  const email = route?.params?.email || '';
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef(null);

  const handleCopyEmail = async () => {
    if (!email) return;
    await Clipboard.setStringAsync(email);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['#0D1326', '#1a2040']}
        style={styles.container}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.iconCircle}>
          <LinearGradient
            colors={['#6C2BD9', '#FF4D6D', '#FF9A00']}
            style={styles.iconCircleGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="mail-outline" size={48} color="#FFFFFF" />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Confirme seu email</Text>

        <Text style={styles.message}>
          Enviamos um link de confirmação para o email abaixo. Clique no
          link para ativar sua conta e começar a usar o Journi.
        </Text>

        <TouchableOpacity
          style={styles.emailRow}
          onPress={handleCopyEmail}
          activeOpacity={0.75}
        >
          <Text style={styles.emailHighlight} numberOfLines={1}>
            {email}
          </Text>
          <View style={styles.copyIconWrapper}>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={18}
              color={copied ? COLORS.teal : COLORS.textLight}
            />
          </View>
        </TouchableOpacity>
        {copied && <Text style={styles.copiedToast}>Email copiado</Text>}

        <View style={styles.spamNotice}>
          <Ionicons name="alert-circle-outline" size={18} color="#FF9A00" />
          <Text style={styles.spamText}>
            Não encontrou o email? Verifique sua caixa de spam ou lixo eletrônico.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#FF5722', '#FF7043']}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.buttonText}>Voltar para o login</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#0D1326',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 28,
    overflow: 'hidden',
  },
  iconCircleGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: SIZES.h2,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontFamily: 'Poppins_400Regular',
    fontSize: SIZES.body,
    lineHeight: 22,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 20,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: 'rgba(0,209,193,0.1)',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: 'rgba(0,209,193,0.35)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  emailHighlight: {
    flex: 1,
    fontFamily: 'Poppins_700Bold',
    fontSize: SIZES.body,
    color: COLORS.teal,
  },
  copyIconWrapper: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiedToast: {
    fontFamily: 'Poppins_400Regular',
    fontSize: SIZES.small,
    color: COLORS.teal,
    marginBottom: 18,
  },
  spamNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,154,0,0.12)',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: 'rgba(255,154,0,0.3)',
    padding: 14,
    marginBottom: 40,
  },
  spamText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: SIZES.small,
    lineHeight: 18,
    color: COLORS.textLight,
  },
  button: {
    width: '100%',
    borderRadius: SIZES.radius,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  buttonText: {
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    fontSize: 16,
  },
});
