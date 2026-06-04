import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Shadow } from '../../theme';
import Brackets from './Bracket';

type Props = {
  children: React.ReactNode;
  padding?: number;
  style?: ViewStyle;
  bracketed?: boolean;
  bg?: string;
};

export default function Card({ children, padding = 16, style, bracketed = false, bg = Colors.cardBg }: Props) {
  return (
    <View style={[
      styles.card,
      { padding, backgroundColor: bg },
      style,
    ]}>
      {bracketed && <Brackets />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    marginHorizontal: 16,
    marginBottom: 14,
    ...Shadow,
  },
});
