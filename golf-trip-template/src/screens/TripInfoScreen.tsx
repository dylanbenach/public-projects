import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../theme';
import CrossedClubs from '../components/clubhouse/CrossedClubs';
import Overline from '../components/clubhouse/Overline';
import Card from '../components/clubhouse/Card';

const TRIP_TITLE = 'Golf Trip 2026';

const TRIP_DETAILS = {
  location: 'Your Destination',
  dates: 'Your Dates',
  lodging: 'TBD',
  lodgingNote: 'check-in day 1 afternoon',
};

const ROUNDS: Array<{ id: string; course: string; day: string; time: string; par?: number }> = [
  { id: 'round1', course: 'TBD', day: 'Day 1', time: 'TBD' },
  { id: 'round2', course: 'TBD', day: 'Day 2', time: 'TBD' },
  { id: 'round3', course: 'TBD', day: 'Day 3', time: 'TBD' },
];

const OTHER_PLANS: Array<{ title: string; detail: string }> = [
  { title: 'Awards & Payouts', detail: 'Saturday evening — side-bet payouts and Ryder Cup trophy' },
];

export default function TripInfoScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Title card ── */}
      <View style={styles.titleCard}>
        <CrossedClubs size={28} color={Colors.brass} />
        <Text style={styles.titleText}>{TRIP_TITLE}</Text>
        <Text style={styles.titleLocation}>{TRIP_DETAILS.location}</Text>
        <View style={styles.titleDivider} />
        <Text style={styles.titleDates}>{TRIP_DETAILS.dates.toUpperCase()}</Text>
      </View>

      {/* ── Lodging ── */}
      <Overline style={styles.sectionOverline}>Lodging</Overline>
      <Card padding={14}>
        <Text style={styles.cardTitle}>{TRIP_DETAILS.lodging}</Text>
        <Text style={styles.cardNote}>{TRIP_DETAILS.lodgingNote}</Text>
      </Card>

      {/* ── Rounds ── */}
      <Overline style={styles.sectionOverline}>The Three Rounds</Overline>
      {ROUNDS.map((round, index) => (
        <Card key={round.id} padding={14}>
          <View style={styles.roundRow}>
            <View style={styles.roundLeft}>
              <View style={styles.roundNumBox}>
                <Text style={styles.roundNum}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.courseName}>{round.course}</Text>
                <Text style={styles.courseDay}>
                  {round.day.toUpperCase()}
                  {round.time !== 'TBD' ? ` · TEE-OFF ${round.time}` : ''}
                </Text>
              </View>
            </View>
            {round.par ? (
              <Text style={styles.roundPar}>par {round.par}</Text>
            ) : null}
          </View>
        </Card>
      ))}

      {/* ── Other plans ── */}
      <Overline style={styles.sectionOverline}>And Also</Overline>
      <Card padding={14}>
        {OTHER_PLANS.map((plan, i) => (
          <View
            key={i}
            style={[styles.planItem, i < OTHER_PLANS.length - 1 && styles.planDivider]}
          >
            <Text style={styles.planTitle}>{plan.title}</Text>
            <Text style={styles.planDetail}>{plan.detail}</Text>
          </View>
        ))}
      </Card>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  content: { paddingBottom: 40 },

  // Title card
  titleCard: {
    margin: 16,
    marginBottom: 12,
    backgroundColor: Colors.ink,
    padding: 28,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: Colors.brass,
    borderRadius: 4,
    alignItems: 'center',
  },
  titleText: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 32,
    lineHeight: 36,
    color: Colors.paper,
    textAlign: 'center',
    marginTop: 8,
  },
  titleLocation: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 16,
    color: Colors.brass,
    marginTop: 6,
    textAlign: 'center',
  },
  titleDivider: {
    height: 1,
    backgroundColor: 'rgba(180,138,74,0.4)',
    alignSelf: 'stretch',
    marginHorizontal: 30,
    marginVertical: 14,
  },
  titleDates: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(244,236,221,0.8)',
    textAlign: 'center',
  },

  sectionOverline: {
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 6,
  },

  cardTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 18,
    color: Colors.ink,
  },
  cardNote: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 13,
    color: Colors.mute,
    marginTop: 4,
  },

  // Round card
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  roundNumBox: {
    width: 42,
    height: 42,
    borderWidth: 1.5,
    borderColor: Colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundNum: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 18,
    color: Colors.ink,
  },
  courseName: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 18,
    color: Colors.ink,
  },
  courseDay: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    color: Colors.mute,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  roundPar: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.forest,
  },

  // Other plans
  planItem: { paddingVertical: 6 },
  planDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.ruleSoft,
    marginBottom: 6,
  },
  planTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 18,
    color: Colors.ink,
    marginBottom: 4,
  },
  planDetail: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: Colors.mute,
    lineHeight: 18,
  },
});
