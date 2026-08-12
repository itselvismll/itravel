export const SOCIAL_NOTIFICATION_TYPES = Object.freeze(['follow', 'comment', 'like']);

export const isSocialNotification = notification =>
  SOCIAL_NOTIFICATION_TYPES.includes(notification?.type);
