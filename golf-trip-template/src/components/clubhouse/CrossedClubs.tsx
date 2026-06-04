import React from 'react';
import Svg, { Line, Circle } from 'react-native-svg';
import { Colors } from '../../theme';

type Props = { size?: number; color?: string };

export default function CrossedClubs({ size = 22, color = Colors.brass }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* Club 2 shaft — back */}
      <Line x1="27" y1="4" x2="7" y2="25" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Club 1 shaft — front */}
      <Line x1="5" y1="4" x2="25" y2="25" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Grip caps */}
      <Circle cx="5" cy="4" r="2.2" fill={color} />
      <Circle cx="27" cy="4" r="2.2" fill={color} />
      {/* Club 1 iron head — short hosel then blade drops nearly vertically */}
      <Line x1="25" y1="25" x2="26" y2="27" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="26" y1="27" x2="25" y2="32" stroke={color} strokeWidth="4" strokeLinecap="round" />
      {/* Club 2 iron head — mirror */}
      <Line x1="7" y1="25" x2="6" y2="27" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="6" y1="27" x2="7" y2="32" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </Svg>
  );
}
