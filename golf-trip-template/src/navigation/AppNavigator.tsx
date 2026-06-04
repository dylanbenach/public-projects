import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import ScoringScreen from '../screens/ScoringScreen';
import ScoreboardScreen from '../screens/ScoreboardScreen';
import SideBetsScreen from '../screens/SideBetsScreen';
import BiosScreen from '../screens/BiosScreen';
import GalleryScreen from '../screens/GalleryScreen';
import TripInfoScreen from '../screens/TripInfoScreen';

// ── Types ────────────────────────────────────────────────────────────────────

export type TabParamList = {
  Home: undefined;
  Board: undefined;
  Score: undefined;
  Bets: undefined;
  Crew: undefined;
  Gallery: undefined;
  TripInfo: undefined;
};

// ── Clubhouse bottom tab bar ─────────────────────────────────────────────────

const TAB_LABELS: Record<string, string> = {
  Home: 'Home',
  Board: 'Board',
  Score: 'Score',
  Bets: 'Bets',
  Crew: 'Crew',
  Gallery: 'Album',
  TripInfo: 'Trip',
};

function ClubhouseTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={tabStyles.bar}>
      {state.routes.map((route, index) => {
        const label = TAB_LABELS[route.name];
        if (!label) return null;
        const active = state.index === index;

        const onPress = () => {
          if (!active) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity
            key={route.key}
            style={tabStyles.item}
            onPress={onPress}
            activeOpacity={0.7}
          >
            <View style={[tabStyles.dot, active ? tabStyles.dotActive : tabStyles.dotInactive]} />
            <Text style={active ? tabStyles.labelActive : tabStyles.labelInactive}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.paperDeep,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    height: 76,
    paddingBottom: 18,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: Colors.brass,
  },
  dotInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.mute,
  },
  labelActive: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 13,
    color: Colors.ink,
  },
  labelInactive: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    color: Colors.mute,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ── Tab navigator ─────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<TabParamList>();

export default function AppNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <ClubhouseTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"     component={HomeScreen} />
      <Tab.Screen name="Board"    component={ScoreboardScreen} />
      <Tab.Screen name="Score"    component={ScoringScreen} />
      <Tab.Screen name="Bets"     component={SideBetsScreen} />
      <Tab.Screen name="Crew"     component={BiosScreen} />
      <Tab.Screen name="Gallery"  component={GalleryScreen} />
      <Tab.Screen name="TripInfo" component={TripInfoScreen} />
    </Tab.Navigator>
  );
}
