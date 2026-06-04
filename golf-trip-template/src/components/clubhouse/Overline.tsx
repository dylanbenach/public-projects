import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { Colors } from '../../theme';

type Props = {
  children: React.ReactNode;
  color?: string;
  style?: TextStyle;
};

export default function Overline({ children, color = Colors.brassDeep, style }: Props) {
  return (
    <Text style={[styles.overline, { color }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  overline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
