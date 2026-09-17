// Link de navegação a pé até um lugar, no app de mapas do aparelho.
//
// POR QUE SAIR DO APP. O Journi desenha a área alcançável e lista o que há
// dentro dela, mas não é um app de navegação: ele não tem voz, não recalcula
// rota e não sabe que a rua está interditada. Quem decidiu ir até o lugar quer
// exatamente o que o Google Maps e o Apple Maps já fazem bem.
//
// Módulo puro: recebe um lugar e o sistema operacional, devolve uma URL. Quem
// abre é o chamador (Linking.openURL) — assim a decisão de QUAL link montar fica
// testável sem simulador, sem navegador e sem ninguém sendo levado para fora do
// app no meio do teste.
import { isValidCoordinate } from './planGeography';

/**
 * URL da rota a pé até um lugar.
 *
 * iOS ganha o Apple Maps porque é o que está instalado por padrão — mandar um
 * link do Google Maps para um iPhone sem o app instalado abre o site, que pede
 * para instalar o app. As duas URLs são `https` (e não `maps://` ou
 * `comgooglemaps://`): o esquema https é o único que funciona nos três lugares
 * onde este app roda, incluindo o navegador, e nos aparelhos o próprio sistema
 * redireciona o link para o app nativo.
 *
 * O nome vai junto quando existe: é ele que aparece no cabeçalho do app de
 * mapas, em vez de um par de coordenadas.
 *
 * @param {{ latitude?: number, longitude?: number, name?: string }} place
 * @param {string} [os] 'ios' | 'android' | 'web' (Platform.OS)
 * @returns {string | null} null quando o lugar não tem coordenada utilizável
 */
export const walkingDirectionsUrl = (place, os = 'web') => {
  const latitude = place?.latitude;
  const longitude = place?.longitude;
  if (!isValidCoordinate(latitude, longitude)) return null;

  const destination = `${latitude},${longitude}`;
  const label = typeof place?.name === 'string' ? place.name.trim() : '';

  if (os === 'ios') {
    // `dirflg=w` é o modo a pé do Apple Maps; `q` é o rótulo do destino.
    const parameters = new URLSearchParams({ daddr: destination, dirflg: 'w' });
    if (label) parameters.set('q', label);
    return `https://maps.apple.com/?${parameters.toString()}`;
  }

  const parameters = new URLSearchParams({
    api: '1',
    destination,
    travelmode: 'walking',
  });
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
};
