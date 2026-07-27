import React from 'react';
import { View, Text, Image } from 'react-native';
import { colors } from '../theme/colors';

export default function Avatar({ profile, size = 34, fontSize = null, ringColor = null }) {
  const initial = (profile?.display_name || profile?.username || '?')[0].toUpperCase();
  const computedFontSize = fontSize || Math.round(size * 0.42);
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
      {profile?.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={{ color: 'white', fontWeight: '700', fontSize: computedFontSize }}>
          {initial}
        </Text>
      )}
    </View>
  );
}
