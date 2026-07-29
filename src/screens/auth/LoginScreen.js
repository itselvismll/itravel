import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, Image, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../utils/constants';
import { signIn, signInWithGoogle } from '../../services/supabase';

export default function LoginScreen({ navigation, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState(
    /** @type {Record<string, string | null>} */ ({})
  );

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleLogin = async () => {
    setErrors({});
    const newErrors = /** @type {Record<string, string>} */ ({});
    
    if (!email) {
      newErrors.email = 'Email é obrigatório';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Email inválido';
    }

    if (!password) {
      newErrors.password = 'Senha é obrigatória';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);

    if (result.success) {
      if (onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } else {
      let errorMessage = 'Erro ao fazer login';
      
      if (result.error.includes('Invalid login credentials')) {
        errorMessage = 'Email ou senha incorretos';
      } else if (result.error.includes('Email not confirmed')) {
        errorMessage = 'Por favor, confirme seu email antes de fazer login';
      }
      
      Alert.alert('Erro no Login', errorMessage);
    }
  };

  const handleGoogleLogin = async () => {
    if (googleLoading) return;

    setGoogleLoading(true);
    const result = await signInWithGoogle();

    if (!result.success && !result.cancelled) {
      const providerDisabled = result.error?.toLowerCase().includes('provider is not enabled');
      Alert.alert(
        'Erro no login com Google',
        providerDisabled
          ? 'O acesso pelo Google ainda precisa ser habilitado no servidor.'
          : result.error || 'Não foi possível entrar com Google.'
      );
    }

    if (result.success && result.user && onLoginSuccess) {
      onLoginSuccess(result.user);
    }

    if (!result.redirecting) setGoogleLoading(false);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        {/* Header com fotos de viagens */}
        <View style={styles.header}>
          {/* Grade de fotos desfocadas */}
          <View style={styles.photosGrid}>
            <Image 
              source={require('../../assets/images/travel1.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel2.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel3.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel4.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel5.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
            <Image 
              source={require('../../assets/images/travel6.jpeg')} 
              style={[styles.photoItem, { opacity: 0.8 }]}
              resizeMode="cover"
              blurRadius={1.5}
            />
          </View>
          
          {/* Overlay escuro para destaque */}
          <View style={styles.headerOverlay}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../../assets/journi_logo_um_j_so_fundo_escuro.png')}
                style={{ width: 220, height: 98, alignSelf: 'center', marginBottom: 8 }}
                resizeMode="contain"
              />
              <Text style={styles.tagline}>Suas viagens. Suas histórias. Suas conexões.</Text>
            </View>
          </View>
        </View>

        {/* Card de Login */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bem-vindo de volta!</Text>
          <Text style={styles.cardSubtitle}>Entre para continuar sua jornada</Text>

          {/* Email */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={COLORS.textSecondary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors({...errors, email: null});
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          {/* Senha */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputWithIcon]}
                placeholder="Senha"
                placeholderTextColor={COLORS.textSecondary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password) setErrors({...errors, password: null});
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons 
                  name={showPassword ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color={COLORS.gray} 
                />
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          {/* Botão de Login */}
          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <LinearGradient
              colors={['#FF5722', '#FF7043']}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <Text style={styles.buttonText}>Entrando...</Text>
              ) : (
                <>
                  <Text style={styles.buttonText}>Entrar</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Login com Google */}
          <TouchableOpacity
            style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
            onPress={handleGoogleLogin}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#DB4437" />
            ) : (
              <Ionicons name="logo-google" size={20} color="#DB4437" />
            )}
            <Text style={styles.googleButtonText}>
              {googleLoading ? 'Conectando...' : 'Continuar com Google'}
            </Text>
          </TouchableOpacity>

          {/* Link para Cadastro */}
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.linkText}>
              Não tem conta? <Text style={styles.linkTextBold}>Cadastre-se grátis</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: '100%',
    backgroundColor: '#FFFFFF',
  },
  header: {
    position: 'relative',
    height: 340,
    overflow: 'hidden',
  },
  photosGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  photoItem: {
    width: '33.33%',
    height: '50%',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 30,
  },
  logoBackground: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  appName: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    ...Platform.select({
      web: { textShadow: '0 3px 6px rgba(0,0,0,0.8)' },
      default: {
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 3 },
        textShadowRadius: 6,
      },
    }),
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '600',
    ...Platform.select({
      web: { textShadow: '0 2px 4px rgba(0,0,0,0.7)' },
      default: {
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
      },
    }),
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    marginTop: -30,
    boxShadow: '0px -3px 10px rgba(0, 0, 0, 0.1)',
    elevation: 10,
    paddingBottom: 60,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 28,
  },
  inputContainer: {
    marginBottom: 18,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: SIZES.body,
    color: COLORS.text,
  },
  inputWithIcon: {
    paddingRight: 48,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
  button: {
    borderRadius: SIZES.radius,
    overflow: 'hidden',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: COLORS.gray,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  googleButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '500',
  },
  linkButton: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  linkTextBold: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
