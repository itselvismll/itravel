import React from 'react';
import { Image } from 'react-native';

export default function Logo({ size = 80 }) {
  return (
    <Image
      source={require('../../assets/journi_simbolo.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
