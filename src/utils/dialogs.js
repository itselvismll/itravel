import { Alert, Platform } from 'react-native';

export const confirm = (title, message) => new Promise((resolve) => {
  if (Platform.OS === 'web') {
    resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
    { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) });
});

export const notify = (title, message) => {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
};
