import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { colors } from '../theme/colors';

export default function Avatar({
  profile,
  fallbackName = 'Viajante',
  size = 34,
  fontSize = null,
  ringColor = null,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = profile?.avatar_url?.trim();
  const label = (
    profile?.display_name
    || profile?.username
    || fallbackName
    || 'Viajante'
  ).trim();
  const initial = (label[0] || 'V').toLocaleUpperCase('pt-BR');
  const computedFontSize = fontSize || Math.round(size * 0.42);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: ringColor ? 2 : 0,
      borderColor: ringColor || 'transparent',
    }}>
      {avatarUrl && !imageFailed ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: '100%', height: '100%' }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={{ color: 'white', fontWeight: '700', fontSize: computedFontSize }}>
          {initial}
        </Text>
      )}
    </View>
  );
}
