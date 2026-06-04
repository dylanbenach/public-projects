import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../theme';

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Props = { corner: Corner; size?: number; color?: string };

function BracketCorner({ corner, size = 14, color = Colors.brass }: Props) {
  const borderStyle = {
    tl: { borderTopWidth: 1.5, borderLeftWidth: 1.5, top: 0, left: 0 },
    tr: { borderTopWidth: 1.5, borderRightWidth: 1.5, top: 0, right: 0 },
    bl: { borderBottomWidth: 1.5, borderLeftWidth: 1.5, bottom: 0, left: 0 },
    br: { borderBottomWidth: 1.5, borderRightWidth: 1.5, bottom: 0, right: 0 },
  }[corner];

  return (
    <View style={[
      styles.corner,
      { width: size, height: size, borderColor: color },
      borderStyle as any,
    ]} />
  );
}

type BracketsProps = { size?: number; color?: string };

export default function Brackets({ size = 14, color = Colors.brass }: BracketsProps) {
  return (
    <>
      <BracketCorner corner="tl" size={size} color={color} />
      <BracketCorner corner="tr" size={size} color={color} />
      <BracketCorner corner="bl" size={size} color={color} />
      <BracketCorner corner="br" size={size} color={color} />
    </>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
  },
});
