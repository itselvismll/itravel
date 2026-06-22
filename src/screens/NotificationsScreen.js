import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../utils/constants';

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>NotificaÃ§Ãµes</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.subtitle}>Suas notificaÃ§Ãµes aparecerÃ£o aqui! ðŸ””</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.lightGray },
  title: { fontSize: SIZES.h3, fontWeight: '600', color: COLORS.text },
  content: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' },
  subtitle: { fontSize: SIZES.body, color: COLORS.gray },
});
