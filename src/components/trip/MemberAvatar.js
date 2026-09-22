// O avatar de um participante: gradiente proprio, iniciais, e o selo de quem
// organiza.
//
// A REGRA QUE ESTE ARQUIVO SEGUE: toda a decisao esta em `utils/memberAvatar`
// (qual gradiente, quais iniciais), e aqui so acontece a pintura. E o mesmo
// arranjo do mapa — logica em modulo puro, renderizacao no componente — e serve
// para o mesmo: o `node:test` afirma a regra sem precisar de browser.
//
// FOTO DE VERDADE GANHA DO GRADIENTE. A direcao visual pede gradiente com
// iniciais no lugar do avatar generico (o circulo roxo com uma letra, igual para
// todo mundo), nao no lugar do rosto de quem subiu uma foto. Quem tem foto
// aparece com ela; o gradiente e o que preenche a ausencia, e preenche de um
// jeito que ainda identifica a pessoa.
//
// Componente React Native puro: o mesmo arquivo nas tres plataformas.
import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { avatarIdentity, GRADIENT_DIRECTION } from '../../utils/memberAvatar';
import { trip, font } from '../../theme/tripCollab';

/**
 * @param {{
 *   person?: { id?: string | null, username?: string | null, display_name?: string | null,
 *              avatar_url?: string | null, role?: string | null } | null,
 *   size?: number,
 *   showOwnerSeal?: boolean,
 *   sealBorderColor?: string,
 * }} props
 */
export default function MemberAvatar({
  person,
  size = 46,
  showOwnerSeal = true,
  // O selo e um circulo dourado com um recorte da cor do fundo em volta, para
  // ele "descolar" do avatar. Essa cor precisa ser a do CARD onde o avatar esta,
  // nao uma constante: o mesmo selo aparece sobre --card na lista e sobre --bg
  // no cabecalho, e um recorte da cor errada vira um anel sujo.
  sealBorderColor = trip.card,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const { initials, gradient, isOwner } = avatarIdentity(person);
  const avatarUrl = typeof person?.avatar_url === 'string' ? person.avatar_url.trim() : '';
  const temFoto = Boolean(avatarUrl) && !imageFailed;

  // URL nova merece nova tentativa: sem isto, uma falha de rede numa foto
  // deixaria a pessoa com as iniciais para sempre, mesmo depois de ela trocar a
  // foto do perfil.
  useEffect(() => { setImageFailed(false); }, [avatarUrl]);

  // O selo cresce com o avatar, senao ele domina um avatar de 34px e some num de
  // 64px. Os divisores sairam do mockup (18px de selo para 46px de avatar).
  const selo = Math.round(size * 0.39);

  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={[gradient.from, gradient.to]}
        start={GRADIENT_DIRECTION.start}
        end={GRADIENT_DIRECTION.end}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      >
        {temFoto ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: '100%', height: '100%' }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text
            style={[styles.initials, { fontSize: Math.round(size * 0.34) }]}
            // As iniciais nunca quebram nem encolhem sozinhas: duas letras cabem
            // sempre, e deixar o RN reduzir a fonte faria avatares vizinhos com
            // tamanhos de texto diferentes.
            numberOfLines={1}
          >
            {initials}
          </Text>
        )}
      </LinearGradient>

      {isOwner && showOwnerSeal ? (
        <View
          style={[
            styles.seal,
            {
              width: selo,
              height: selo,
              borderRadius: selo / 2,
              borderColor: sealBorderColor,
            },
          ]}
        >
          {/* Ionicons, nunca emoji: emoji e desenhado pela fonte do sistema e
              sai diferente em cada aparelho — a regra da casa, cobrada pelo
              teste de invariantes. */}
          <Ionicons name="star" size={Math.round(selo * 0.55)} color="#1A1408" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: '#FFFFFF',
    fontFamily: font.title,
    fontWeight: '600',
    // A Poppins tem espaco lateral generoso; sem o ajuste, duas letras
    // maiusculas parecem deslocadas para a direita dentro do circulo.
    letterSpacing: 0.2,
  },
  seal: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: trip.gold,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
