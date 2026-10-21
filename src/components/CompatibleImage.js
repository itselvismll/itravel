import React from 'react';
import { Image as NativeImage } from 'react-native';

let ExpoImage = null;

try {
  ExpoImage = require('expo-image').Image;
} catch {
  ExpoImage = null;
}

const resizeModeByContentFit = {
  cover: 'cover',
  contain: 'contain',
  fill: 'stretch',
  none: 'center',
  'scale-down': 'contain',
};

const normalizeSource = source => {
  if (typeof source === 'string') return { uri: source };
  return source;
};

export default function CompatibleImage({
  source,
  contentFit = undefined,
  cachePolicy = undefined,
  transition = undefined,
  recyclingKey = undefined,
  ...props
}) {
  if (ExpoImage) {
    return (
      <ExpoImage
        {...props}
        source={source}
        contentFit={contentFit}
        cachePolicy={cachePolicy}
        transition={transition}
        recyclingKey={recyclingKey}
      />
    );
  }

  return (
    <NativeImage
      {...props}
      source={normalizeSource(source)}
      resizeMode={resizeModeByContentFit[contentFit] || props.resizeMode}
    />
  );
}

export { CompatibleImage };
