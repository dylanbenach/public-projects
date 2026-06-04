import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../theme';
import CrossedClubs from '../components/clubhouse/CrossedClubs';
import Overline from '../components/clubhouse/Overline';
import Brackets from '../components/clubhouse/Bracket';
import Card from '../components/clubhouse/Card';
import Hairline from '../components/clubhouse/Hairline';
import { TEAM_A_NAME, TEAM_B_NAME } from '../config/gameConfig';

// ─── Edit these to match your trip ───────────────────────────────────────────
const TRIP_NAME = 'Golf Trip 2026';
const TRIP_YEAR = '2026';
const TRIP_LOCATION = 'Your Destination';
const TRIP_DATES = 'Month DD–DD, 2026';
const TRIP_START = new Date('2026-10-01T00:00:00');
// ─────────────────────────────────────────────────────────────────────────────

function getDaysUntil(): number | null {
  const diff = TRIP_START.getTime() - Date.now();
  if (diff <= 0) return null;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const QUICK_LINKS = [
  { label: 'Scorecards',         sub: 'live scoring · 3 rounds',   target: 'Score' },
  { label: 'The Board',          sub: 'cup · individual · skins',   target: 'Board' },
  { label: 'Side Bets & Ledger', sub: 'who owes whom, settled',     target: 'Bets' },
  { label: 'Member Bios',        sub: '12 gentlemen, 12 stories',   target: 'Crew' },
  { label: 'The Album',          sub: 'this year, in pictures',     target: 'Gallery' },
  { label: 'Trip Itinerary',     sub: 'lodging · tee times · plans',target: 'TripInfo' },
] as const;

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const days = getDaysUntil();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Hero ── */}
      <View style={styles.hero}>
        <Overline color={Colors.brass} style={styles.heroOverline}>
          Golf Weekend · {TRIP_YEAR}
        </Overline>
        <Text style={styles.heroTitle}>{TRIP_NAME}</Text>
        <Text style={styles.heroLocation}>{TRIP_LOCATION}</Text>
        <Text style={styles.heroMeta}>{TRIP_DATES} · 3 rounds · 12 players</Text>
        <View style={styles.heroCrossed}>
          <CrossedClubs size={56} color={Colors.brass} />
        </View>
        {/* double brass rule = two 1px lines with 2px gap */}
        <View style={styles.doubleRuleGap} />
        <View style={styles.doubleRuleLine1} />
        <View style={styles.doubleRuleLine2} />
      </View>

      {/* ── Countdown ── */}
      <View style={styles.countdownWrap}>
        <Card padding={22} bracketed style={styles.countdownCard}>
          <Overline style={{ textAlign: 'center' }}>Tee-off in</Overline>
          <Text style={styles.countdownNum}>
            {days !== null ? String(days) : '—'}
          </Text>
          <Text style={styles.countdownLabel}>days, gentlemen</Text>
        </Card>
      </View>

      {/* ── Cup preview ── */}
      <Card padding={18}>
        <Overline>The Cup · live</Overline>
        <View style={styles.cupRow}>
          <View>
            <Text style={styles.cupTeam}>{TEAM_A_NAME}</Text>
            <Text style={[styles.cupScore, { color: Colors.forest }]}>—</Text>
          </View>
          <Text style={styles.cupVs}>vs</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.cupTeam}>{TEAM_B_NAME}</Text>
            <Text style={[styles.cupScore, { color: Colors.brick }]}>—</Text>
          </View>
        </View>
        <Hairline my={10} />
        <Text style={styles.cupNote}>Standings update as scores are entered</Text>
      </Card>

      {/* ── Quick links ── */}
      <Overline style={styles.linksOverline}>The Clubhouse</Overline>
      <View style={styles.linksList}>
        {QUICK_LINKS.map(({ label, sub, target }, i) => (
          <TouchableOpacity
            key={label}
            style={[styles.linkRow, i < QUICK_LINKS.length - 1 && styles.linkBorder]}
            onPress={() => navigation.navigate(target as string)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>{label}</Text>
              <Text style={styles.linkSub}>{sub}</Text>
            </View>
            <Text style={styles.linkArrow}>{'→'}</Text>
          </TouchableOpacity>
        ))}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  content: { paddingBottom: 40 },

  // Hero
  hero: {
    backgroundColor: Colors.ink,
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: 28,
  },
  heroOverline: { marginBottom: 10 },
  heroTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -0.5,
    color: Colors.paper,
  },
  heroLocation: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 18,
    color: Colors.brass,
    marginTop: 8,
  },
  heroMeta: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: 'rgba(244,236,221,0.6)',
    marginTop: 6,
    letterSpacing: 0.5,
    marginBottom: 0,
  },
  heroCrossed: { alignItems: 'center', marginTop: 16, marginBottom: 4 },

  // Double brass rule below hero (two 1px lines with a 2px gap)
  doubleRuleGap: { height: 2, backgroundColor: Colors.ink },
  doubleRuleLine1: { height: 1, backgroundColor: Colors.brass },
  doubleRuleLine2: { height: 1, backgroundColor: Colors.brass, marginTop: 2 },

  // Countdown
  countdownWrap: { marginTop: 18 },
  countdownCard: { alignItems: 'center' },
  countdownNum: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 72,
    lineHeight: 72,
    color: Colors.ink,
    marginTop: 8,
    textAlign: 'center',
  },
  countdownLabel: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 16,
    color: Colors.forest,
    marginTop: 4,
    textAlign: 'center',
  },

  // Cup
  cupRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cupTeam: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 22,
    color: Colors.ink,
  },
  cupScore: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 40,
    lineHeight: 44,
  },
  cupVs: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 18,
    color: Colors.mute,
  },
  cupNote: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 12,
    color: Colors.mute,
  },

  // Quick links
  linksOverline: {
    marginHorizontal: 24,
    marginTop: 6,
    marginBottom: 8,
  },
  linksList: { marginHorizontal: 16 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 6,
  },
  linkBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.ruleSoft,
  },
  linkTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 18,
    color: Colors.ink,
  },
  linkSub: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    color: Colors.mute,
    marginTop: 2,
  },
  linkArrow: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 18,
    color: Colors.brass,
    marginLeft: 8,
  },
});
