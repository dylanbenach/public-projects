import { ViewStyle, TextStyle } from 'react-native';

export const Colors = {
  // Clubhouse palette
  paper:     '#f4ecdd',
  paperDeep: '#ebe0c8',
  cardBg:    '#fbf6ea',
  ink:       '#1a2540',
  inkSoft:   '#3a4663',
  forest:    '#22513a',
  brass:     '#b48a4a',
  brassDeep: '#8a6831',
  brick:     '#8b3232',
  rule:      '#d9c8a8',
  ruleSoft:  '#e6d9bf',
  mute:      '#8a7d5e',
  white:     '#ffffff',

  // Legacy aliases (keep existing screens compiling)
  navy:          '#1a2540',
  navyLight:     '#3a4663',
  blue:          '#22513a',
  blueLight:     '#b48a4a',
  bluePale:      '#fbf6ea',
  offWhite:      '#f4ecdd',
  black:         '#000000',
  textPrimary:   '#1a2540',
  textSecondary: '#3a4663',
  textMuted:     '#8a7d5e',
  border:        '#d9c8a8',
  teamA:         '#1a2540',
  teamB:         '#8b3232',
};

export const Fonts = {
  serif:        'DMSerifDisplay_400Regular',
  serifItalic:  'DMSerifDisplay_400Regular_Italic',
  sans:         'Manrope_400Regular',
  sansMedium:   'Manrope_500Medium',
  sansSemi:     'Manrope_600SemiBold',
  sansBold:     'Manrope_700Bold',
  sansBlack:    'Manrope_800ExtraBold',
};

export const Typography = {
  displayHero:       { fontFamily: 'DMSerifDisplay_400Regular', fontSize: 38, letterSpacing: -0.5 } as TextStyle,
  displayLarge:      { fontFamily: 'DMSerifDisplay_400Regular', fontSize: 32, letterSpacing: -0.5 } as TextStyle,
  display:           { fontFamily: 'DMSerifDisplay_400Regular', fontSize: 28, letterSpacing: -0.3 } as TextStyle,
  displayItalic:     { fontFamily: 'DMSerifDisplay_400Regular_Italic', fontSize: 18 } as TextStyle,
  numeral:           { fontFamily: 'DMSerifDisplay_400Regular', fontSize: 64, letterSpacing: -1 } as TextStyle,
  serifBody:         { fontFamily: 'DMSerifDisplay_400Regular', fontSize: 17 } as TextStyle,
  serifSmall:        { fontFamily: 'DMSerifDisplay_400Regular', fontSize: 14 } as TextStyle,
  serifSmallItalic:  { fontFamily: 'DMSerifDisplay_400Regular_Italic', fontSize: 13 } as TextStyle,
  overline:          { fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' } as TextStyle,
  label:             { fontFamily: 'Manrope_700Bold', fontSize: 11, letterSpacing: 1 } as TextStyle,
  body:              { fontFamily: 'Manrope_400Regular', fontSize: 13 } as TextStyle,
  caption:           { fontFamily: 'Manrope_400Regular', fontSize: 11, letterSpacing: 0.5 } as TextStyle,

  // Legacy aliases
  headline:   { fontFamily: 'DMSerifDisplay_400Regular', fontSize: 22 } as TextStyle,
  title:      { fontFamily: 'Manrope_600SemiBold', fontSize: 16 } as TextStyle,
  titleSmall: { fontFamily: 'Manrope_600SemiBold', fontSize: 15 } as TextStyle,
  bodySmall:  { fontFamily: 'Manrope_400Regular', fontSize: 14 } as TextStyle,
};

export const Shadow: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 2,
  elevation: 1,
};
