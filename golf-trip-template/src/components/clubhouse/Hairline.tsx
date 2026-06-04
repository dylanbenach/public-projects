import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme';

type Props = {
  color?: string;
  my?: number;
  dashed?: boolean;
  style?: ViewStyle;
};

export default function Hairline({ color = Colors.rule, my = 14, dashed = false, style }: Props) {
  return (
    <View style={[
      styles.line,
      { borderColor: color, borderStyle: dashed ? 'dashed' : 'solid', marginVertical: my },
      style,
    ]} />
  );
}

const styles = StyleSheet.create({
  line: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
