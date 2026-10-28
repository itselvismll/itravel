import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Hcaptcha } from '@hcaptcha/react-native-hcaptcha';
import { COLORS, SIZES } from '../../utils/constants';
import { useLocale } from '../../i18n/LocaleProvider';
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
  const { t } = useLocale();
  const [verified, setVerified] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [message, setMessage] = useState(() => t('auth.captchaWidget.initial'));
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
    setHasLoadError(false);
    setMessage(t('auth.captchaWidget.initial'));
    onVerify?.(null);
  }, [onVerify, t]);

  const reset = useCallback(() => {
    clearToken();
    setReloadKey(current => current + 1);
  }, [clearToken]);

  const markUsed = useCallback(() => {
    setVerified(false);
    setChallengeOpen(false);
    setHasLoadError(false);
    setMessage(t('auth.captchaWidget.initial'));
    setReloadKey(current => current + 1);
  }, [t]);

  const open = useCallback(() => {
    if (!verified) {
      setMessage(t('auth.captchaWidget.openPrompt'));
    }
  }, [verified, t]);

  useImperativeHandle(ref, () => ({ reset, markUsed, open }), [reset, markUsed, open]);

  const handleMessage = useCallback((event) => {
    const data = event?.nativeEvent?.data;
    if (!data) return;

    if (event.success && data.length > 35) {
      setVerified(true);
      setChallengeOpen(false);
      setHasLoadError(false);
      setMessage(t('auth.captchaWidget.success'));
      onVerify?.(data);
      return;
    }

    if (data === 'open') {
      setChallengeOpen(true);
      setHasLoadError(false);
      setMessage(t('auth.captchaWidget.selectImages'));
      return;
    }

    if (data === 'challenge-closed' || data === 'cancel') {
      setChallengeOpen(false);
      setHasLoadError(false);
      setMessage(t('auth.captchaWidget.retry'));
      return;
    }

    clearToken();

    if (data === 'expired' || data === 'challenge-expired') {
      setMessage(t('auth.captchaWidget.expired'));
      event?.reset?.();
      return;
    }

    if (data === 'loading timeout') {
      setMessage(t('auth.captchaWidget.loadingTimeout'));
      return;
    }

    const description = event?.nativeEvent?.description;
    const detail = description || data;
    setHasLoadError(true);
    setMessage(t('auth.captchaWidget.loadError', { detail }));
    onError?.(detail);
  }, [clearToken, onError, onVerify, t]);

  if (!HCAPTCHA_ENABLED) {
    return (
      <View style={[styles.container, style]}>
        <Text style={[styles.message, styles.messageError]}>
          {t('auth.captchaWidget.disabled')}
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
          hasLoadError && styles.messageError,
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
