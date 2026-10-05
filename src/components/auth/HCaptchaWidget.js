import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Hcaptcha } from '@hcaptcha/react-native-hcaptcha';
import { COLORS, SIZES } from '../../utils/constants';
import { HCAPTCHA_BASE_URL, HCAPTCHA_ENABLED, HCAPTCHA_SITE_KEY } from './hcaptchaConfig';

/**
 * Widget de hCaptcha para iOS/Android. Usamos a versão inline do SDK porque a
 * versão modal invisível pode parecer que vai abrir e não apresentar desafio em
 * alguns runtimes de desenvolvimento.
 *
 * Props e ref seguem o mesmo contrato da versão web.
 */
/**
 * @typedef {object} HCaptchaWidgetProps
 * @property {(token: string | null) => void} [onVerify] Recebe o token gerado,
 *   ou null quando o desafio expira, falha ou é resetado.
 * @property {(error: unknown) => void} [onError]
 * @property {'light' | 'dark'} [theme]
 * @property {import('react-native').StyleProp<import('react-native').ViewStyle>} [style]
 */

/** @typedef {{ reset: () => void, markUsed: () => void, open: () => void }} HCaptchaWidgetHandle */

/**
 * @param {HCaptchaWidgetProps} props
 * @param {import('react').ForwardedRef<HCaptchaWidgetHandle>} ref
 */
function HCaptchaWidgetImpl({ onVerify, onError, theme = 'light', style }, ref) {
  const [verified, setVerified] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState('Conclua a verificação para continuar.');
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDark = theme === 'dark';
  // O widget normal mede cerca de 303 px e o HTML interno ainda possui margens.
  // Deixamos o frame escapar um pouco do padding dos formulários estreitos para
  // não cortar o checkbox. Quando o desafio visual abre, o WebView recebe altura
  // suficiente para mostrar a grade de imagens e os controles por inteiro.
  const captchaWidth = Math.min(Math.max(windowWidth - 24, 180), 400);
  const challengeHeight = Math.max(500, Math.min(windowHeight - 48, 640));

  const clearToken = useCallback(() => {
    setVerified(false);
    setChallengeOpen(false);
    setMessage('Conclua a verificação para continuar.');
    onVerify?.(null);
  }, [onVerify]);

  const reset = useCallback(() => {
    clearToken();
    setReloadKey(current => current + 1);
  }, [clearToken]);

  const markUsed = useCallback(() => {
    setVerified(false);
    setChallengeOpen(false);
    setMessage('Conclua a verificação para continuar.');
    setReloadKey(current => current + 1);
  }, []);

  const open = useCallback(() => {
    if (!verified) {
      setMessage('Resolva a verificação acima antes de continuar.');
    }
  }, [verified]);

  useImperativeHandle(ref, () => ({ reset, markUsed, open }), [reset, markUsed, open]);

  const handleMessage = useCallback((event) => {
    const data = event?.nativeEvent?.data;
    if (!data) return;

    if (event.success && data.length > 35) {
      setVerified(true);
      setChallengeOpen(false);
      setMessage('Verificação concluída.');
      onVerify?.(data);
      return;
    }

    if (data === 'open') {
      setChallengeOpen(true);
      setMessage('Selecione as imagens solicitadas e confirme a verificação.');
      return;
    }

    if (data === 'challenge-closed' || data === 'cancel') {
      setChallengeOpen(false);
      setMessage('Toque na caixa de verificação para tentar novamente.');
      return;
    }

    clearToken();

    if (data === 'expired' || data === 'challenge-expired') {
      setMessage('A verificação expirou. Tente novamente.');
      event?.reset?.();
      return;
    }

    if (data === 'loading timeout') {
      setMessage('Ainda carregando a verificação. Aguarde alguns segundos.');
      return;
    }

    const description = event?.nativeEvent?.description;
    const detail = description || data;
    setMessage(`Não foi possível carregar a verificação: ${detail}`);
    onError?.(detail);
  }, [clearToken, onError, onVerify]);

  if (!HCAPTCHA_ENABLED) {
    return (
      <View style={[styles.container, style]}>
        <Text style={[styles.message, styles.messageError]}>
          Verificação de segurança indisponível: defina EXPO_PUBLIC_HCAPTCHA_SITE_KEY.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.captchaFrame,
          isDark && styles.captchaFrameDark,
          {
            width: captchaWidth,
            height: challengeOpen ? challengeHeight : 118,
          },
        ]}
      >
        <Hcaptcha
          key={reloadKey}
          siteKey={HCAPTCHA_SITE_KEY}
          url={HCAPTCHA_BASE_URL}
          size="normal"
          languageCode="pt"
          theme={theme}
          showLoading
          closableLoading={false}
          loadingIndicatorColor={isDark ? COLORS.textLight : COLORS.primary}
          onMessage={handleMessage}
          style={styles.captchaWebView}
        />
      </View>
      <Text
        style={[
          styles.message,
          isDark && styles.messageDark,
          verified && styles.messageSuccess,
          message.startsWith('Não foi possível') && styles.messageError,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const HCaptchaWidget = forwardRef(HCaptchaWidgetImpl);

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 16,
  },
  captchaFrame: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  captchaFrameDark: {
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#202744',
  },
  captchaWebView: {
    flex: 1,
    height: '100%',
  },
  message: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'center',
  },
  messageDark: {
    color: '#9BA2BF',
  },
  messageSuccess: {
    color: COLORS.success,
    fontWeight: '700',
  },
  messageError: {
    color: COLORS.error,
  },
});

export default HCaptchaWidget;
