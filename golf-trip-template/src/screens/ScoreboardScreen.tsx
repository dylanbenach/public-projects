import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { collection, onSnapshot } from 'firebase/firestore';
import CrossedClubs from '../components/clubhouse/CrossedClubs';
import { db } from '../firebase/config';
import { ROUNDS, ROUND_PAIRINGS, HOLE_INFO, TEAM_A, TEAM_B, TEAM_A_NAME, TEAM_B_NAME } from '../config/gameConfig';
import { courseHandicap, holeResult, matchStatus, HoleResult } from '../utils/handicap';
import { Colors, Shadow, Typography } from '../theme';

type HolesMap = Record<number, number>; // holeNumber -> gross strokes

type PlayerScoreDoc = {
  holes?: Record<string, number>;
  completed?: boolean;
};

type ScoresMap = Record<string, Record<string, PlayerScoreDoc>>; // roundId -> playerName -> doc

type PlayerData = {
  handicapIndex?: number;
};

type PlayersMap = Record<string, PlayerData>;

type TabId = 'cup' | 'individual' | 'byRound';

// ─────────────────────────────────────────────────────────────────────────────

export default function ScoreboardScreen() {
  const [tab, setTab] = useState<TabId>('cup');
  const [scores, setScores] = useState<ScoresMap>({});
  const [players, setPlayers] = useState<PlayersMap>({});
  const [loading, setLoading] = useState(true);

  // Subscribe to scores for all rounds
  useEffect(() => {
    const unsubs = ROUNDS.map((round) => {
      const ref = collection(db, 'scores', round.id, 'players');
      return onSnapshot(ref, (snap) => {
        const roundScores: Record<string, PlayerScoreDoc> = {};
        snap.forEach((d) => {
          roundScores[d.id] = d.data() as PlayerScoreDoc;
        });
        setScores((prev) => ({ ...prev, [round.id]: roundScores }));
      });
    });

    const playerUnsub = onSnapshot(collection(db, 'players'), (snap) => {
      const map: PlayersMap = {};
      snap.forEach((d) => { map[d.id] = d.data() as PlayerData; });
      setPlayers(map);
      setLoading(false);
    });

    return () => {
      unsubs.forEach((u) => u());
      playerUnsub();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brass} />
      </View>
    );
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'cup', label: 'The Cup' },
    { id: 'individual', label: 'Individuals' },
    { id: 'byRound', label: 'By Round' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>The Board</Text>
        <Text style={styles.headerSubtitle}>
          {ROUNDS.length} rounds · match play
        </Text>
        {/* Tab row */}
        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
              onPress={() => setTab(t.id)}
            >
              <Text style={[styles.tabBtnText, tab === t.id && styles.tabBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'cup' && <CupTab scores={scores} players={players} />}
        {tab === 'individual' && <IndividualTab scores={scores} players={players} />}
        {tab === 'byRound' && <ByRoundTab scores={scores} players={players} />}
      </ScrollView>
    </View>
  );
}

// ─── Cup Tab ──────────────────────────────────────────────────────────────────

function CupTab({ scores, players }: { scores: ScoresMap; players: PlayersMap }) {
  let teamAPoints = 0;
  let teamBPoints = 0;

  const roundResults = ROUNDS.map((round) => {
    const pairings = ROUND_PAIRINGS[round.id] ?? [];
    const roundScores = scores[round.id] ?? {};
    let roundA = 0;
    let roundB = 0;

    const pairingResults = pairings.map(({ playerA, playerB }) => {
      const hcpA = courseHandicap(
        players[playerA]?.handicapIndex ?? 0,
        round.slope, round.rating, round.par,
      );
      const hcpB = courseHandicap(
        players[playerB]?.handicapIndex ?? 0,
        round.slope, round.rating, round.par,
      );

      const holesA = parseHoles(roundScores[playerA]?.holes);
      const holesB = parseHoles(roundScores[playerB]?.holes);

      const holeResults: HoleResult[] = HOLE_INFO.map((_, i) =>
        holeResult(holesA[i + 1] ?? 0, holesB[i + 1] ?? 0, hcpA, hcpB, i)
      );

      const status = matchStatus(holeResults);
      const completedA = roundScores[playerA]?.completed;
      const completedB = roundScores[playerB]?.completed;
      const matchDone = !!(completedA && completedB);

      if (matchDone) {
        if (status.lead > 0) roundA += 1;
        else if (status.lead < 0) roundB += 1;
        else { roundA += 0.5; roundB += 0.5; }
      }

      return { playerA, playerB, status, matchDone, hcpA, hcpB };
    });

    teamAPoints += roundA;
    teamBPoints += roundB;

    return { round, pairingResults, roundA, roundB };
  });

  const teamALeading = teamAPoints > teamBPoints;
  const teamBLeading = teamBPoints > teamAPoints;

  const fmtPts = (p: number) => (p % 1 === 0 ? p.toFixed(0) : p.toFixed(1));

  // Determine live round (first round with at least one incomplete pairing)
  const liveRoundIndex = roundResults.findIndex(({ round, pairingResults: pr }) => {
    if (pr.length === 0) return false;
    return pr.some((p) => !p.matchDone);
  });

  return (
    <>
      {/* Cup Ribbon Banner */}
      <View style={styles.cupBanner}>
        <View style={styles.cupTeam}>
          <Text style={styles.cupTeamOverline}>{TEAM_A_NAME.toUpperCase()}</Text>
          <Text style={[styles.cupScore, !teamALeading && { opacity: 0.6 }]}>
            {fmtPts(teamAPoints)}
          </Text>
        </View>

        <View style={styles.cupCenter}>
          <CrossedClubs size={28} color={Colors.brass} />
          <Text style={styles.cupCenterText}>first to 9½</Text>
        </View>

        <View style={styles.cupTeamRight}>
          <Text style={styles.cupTeamOverline}>{TEAM_B_NAME.toUpperCase()}</Text>
          <Text style={[styles.cupScore, !teamBLeading && { opacity: 0.6 }]}>
            {fmtPts(teamBPoints)}
          </Text>
        </View>
      </View>

      {/* Thin rule + round summary */}
      <View style={styles.cupRuleRow}>
        <View style={styles.cupRule} />
        <View style={styles.cupRoundSummaryRow}>
          {roundResults.map(({ round, pairingResults: pr, roundA, roundB }, idx) => {
            const allDone = pr.length > 0 && pr.every((p) => p.matchDone);
            const isLive = idx === liveRoundIndex;
            const label = allDone
              ? `R${idx + 1} · final`
              : isLive
              ? `R${idx + 1} · live`
              : `R${idx + 1} · ${round.course !== 'TBD' ? round.course : `upcoming`}`;
            return (
              <Text key={round.id} style={styles.cupRoundSummaryText}>
                {label}
              </Text>
            );
          })}
        </View>
      </View>

      {/* Live / current round pairings */}
      {roundResults.map(({ round, pairingResults: pr, roundA, roundB }, idx) => {
        if (pr.length === 0) return null;
        const allDone = pr.every((p) => p.matchDone);
        const holesThrough = pr.reduce((max, p) => Math.max(max, p.status.holesPlayed), 0);

        if (!allDone && idx === liveRoundIndex) {
          // Live match pairings card
          return (
            <View key={round.id} style={styles.sectionBlock}>
              <Text style={styles.sectionOverline}>
                {`ROUND ${idx + 1} · SINGLES · THROUGH ${holesThrough}`}
              </Text>
              <View style={styles.matchCard}>
                {pr.map(({ playerA, playerB, status, matchDone }, pIdx) => {
                  const isFirst = pIdx === 0;
                  const statusColor =
                    status.lead > 0
                      ? Colors.forest
                      : status.lead < 0
                      ? Colors.brick
                      : Colors.brassDeep;

                  return (
                    <View
                      key={`${playerA}-${playerB}`}
                      style={[styles.matchRow, !isFirst && styles.matchRowBorder]}
                    >
                      <View style={styles.matchPlayers}>
                        <Text style={styles.matchLeadName}>{playerA}</Text>
                        <Text style={styles.matchVs}>vs</Text>
                        <Text style={styles.matchTrailName}>{playerB}</Text>
                      </View>
                      <View style={styles.matchStatus}>
                        <Text style={[styles.matchStatusLabel, { color: statusColor }]}>
                          {status.label}
                        </Text>
                        <Text style={styles.matchThru}>
                          {`THRU ${status.holesPlayed}`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }

        if (allDone) {
          // Completed round card
          const scoreStr = `${fmtPts(roundA)}–${fmtPts(roundB)}`;
          return (
            <View key={round.id} style={styles.sectionBlock}>
              <Text style={styles.sectionOverline}>
                {`ROUND ${idx + 1} · ${round.course.toUpperCase()} · FINAL · ${scoreStr}`}
              </Text>
              <View style={styles.completedCard}>
                {pr.map(({ playerA, playerB, status }, pIdx) => {
                  const isFirst = pIdx === 0;
                  const resultColor =
                    status.lead > 0
                      ? Colors.forest
                      : status.lead < 0
                      ? Colors.brick
                      : Colors.mute;

                  return (
                    <View
                      key={`${playerA}-${playerB}`}
                      style={[styles.completedRow, !isFirst && styles.completedRowBorder]}
                    >
                      <Text style={styles.completedNames}>
                        {playerA} · {playerB}
                      </Text>
                      <Text style={[styles.completedResult, { color: resultColor }]}>
                        {status.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }

        return null;
      })}

      {/* If no live round and nothing done */}
      {roundResults.every(({ pairingResults: pr }) => pr.length === 0) && (
        <View style={styles.emptyCard}>
          <Text style={styles.empty}>
            Pairings not set yet. Edit ROUND_PAIRINGS in gameConfig.ts.
          </Text>
        </View>
      )}
    </>
  );
}

// ─── By Round Tab ─────────────────────────────────────────────────────────────

function ByRoundTab({ scores, players }: { scores: ScoresMap; players: PlayersMap }) {
  let teamAPoints = 0;
  let teamBPoints = 0;

  const roundResults = ROUNDS.map((round) => {
    const pairings = ROUND_PAIRINGS[round.id] ?? [];
    const roundScores = scores[round.id] ?? {};
    let roundA = 0;
    let roundB = 0;

    const pairingResults = pairings.map(({ playerA, playerB }) => {
      const hcpA = courseHandicap(
        players[playerA]?.handicapIndex ?? 0,
        round.slope, round.rating, round.par,
      );
      const hcpB = courseHandicap(
        players[playerB]?.handicapIndex ?? 0,
        round.slope, round.rating, round.par,
      );

      const holesA = parseHoles(roundScores[playerA]?.holes);
      const holesB = parseHoles(roundScores[playerB]?.holes);

      const holeResults: HoleResult[] = HOLE_INFO.map((_, i) =>
        holeResult(holesA[i + 1] ?? 0, holesB[i + 1] ?? 0, hcpA, hcpB, i)
      );

      const status = matchStatus(holeResults);
      const completedA = roundScores[playerA]?.completed;
      const completedB = roundScores[playerB]?.completed;
      const matchDone = !!(completedA && completedB);

      if (matchDone) {
        if (status.lead > 0) roundA += 1;
        else if (status.lead < 0) roundB += 1;
        else { roundA += 0.5; roundB += 0.5; }
      }

      return { playerA, playerB, status, matchDone, hcpA, hcpB };
    });

    teamAPoints += roundA;
    teamBPoints += roundB;

    return { round, pairingResults, roundA, roundB };
  });

  const fmtPts = (p: number) => (p % 1 === 0 ? p.toFixed(0) : p.toFixed(1));

  return (
    <>
      {roundResults.map(({ round, pairingResults: pr, roundA, roundB }, idx) => {
        const allDone = pr.length > 0 && pr.every((p) => p.matchDone);
        const holesThrough = pr.reduce((max, p) => Math.max(max, p.status.holesPlayed), 0);
        const statusLabel = allDone
          ? `FINAL · ${fmtPts(roundA)}–${fmtPts(roundB)}`
          : pr.length > 0
          ? `THROUGH ${holesThrough}`
          : 'UPCOMING';

        return (
          <View key={round.id} style={styles.sectionBlock}>
            <Text style={styles.sectionOverline}>
              {`ROUND ${idx + 1} · ${round.course.toUpperCase()} · ${statusLabel}`}
            </Text>

            {pr.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.empty}>Pairings not set yet.</Text>
              </View>
            ) : (
              <View style={styles.matchCard}>
                {pr.map(({ playerA, playerB, status, matchDone }, pIdx) => {
                  const isFirst = pIdx === 0;
                  const statusColor =
                    status.lead > 0
                      ? Colors.forest
                      : status.lead < 0
                      ? Colors.brick
                      : Colors.brassDeep;

                  return (
                    <View
                      key={`${playerA}-${playerB}`}
                      style={[styles.matchRow, !isFirst && styles.matchRowBorder]}
                    >
                      <View style={styles.matchPlayers}>
                        <Text style={styles.matchLeadName}>{playerA}</Text>
                        <Text style={styles.matchVs}>vs</Text>
                        <Text style={styles.matchTrailName}>{playerB}</Text>
                      </View>
                      <View style={styles.matchStatus}>
                        <Text style={[styles.matchStatusLabel, { color: statusColor }]}>
                          {status.label}
                        </Text>
                        <Text style={styles.matchThru}>
                          {matchDone ? 'FINAL' : `THRU ${status.holesPlayed}`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

// ─── Individual Tab ───────────────────────────────────────────────────────────

function IndividualTab({ scores, players }: { scores: ScoresMap; players: PlayersMap }) {
  // For individual standings, rank by total holes won across all completed matches
  const playerStats: Record<string, { holesWon: number; holesLost: number; matchesWon: number; matchesPlayed: number }> = {};

  ROUNDS.forEach((round) => {
    const pairings = ROUND_PAIRINGS[round.id] ?? [];
    const roundScores = scores[round.id] ?? {};

    pairings.forEach(({ playerA, playerB }) => {
      const completedA = roundScores[playerA]?.completed;
      const completedB = roundScores[playerB]?.completed;
      if (!completedA || !completedB) return;

      const hcpA = courseHandicap(players[playerA]?.handicapIndex ?? 0, round.slope, round.rating, round.par);
      const hcpB = courseHandicap(players[playerB]?.handicapIndex ?? 0, round.slope, round.rating, round.par);
      const holesA = parseHoles(roundScores[playerA]?.holes);
      const holesB = parseHoles(roundScores[playerB]?.holes);

      const holeResults = HOLE_INFO.map((_, i) =>
        holeResult(holesA[i + 1] ?? 0, holesB[i + 1] ?? 0, hcpA, hcpB, i)
      );
      const status = matchStatus(holeResults);

      if (!playerStats[playerA]) playerStats[playerA] = { holesWon: 0, holesLost: 0, matchesWon: 0, matchesPlayed: 0 };
      if (!playerStats[playerB]) playerStats[playerB] = { holesWon: 0, holesLost: 0, matchesWon: 0, matchesPlayed: 0 };

      playerStats[playerA].holesWon += status.holesWonA;
      playerStats[playerA].holesLost += status.holesWonB;
      playerStats[playerA].matchesPlayed++;
      playerStats[playerB].holesWon += status.holesWonB;
      playerStats[playerB].holesLost += status.holesWonA;
      playerStats[playerB].matchesPlayed++;

      if (status.lead > 0) playerStats[playerA].matchesWon++;
      else if (status.lead < 0) playerStats[playerB].matchesWon++;
    });
  });

  const ranked = Object.entries(playerStats)
    .sort((a, b) => b[1].holesWon - a[1].holesWon);

  if (ranked.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.empty}>
          No completed rounds yet. Individual standings will appear after players finish their rounds.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.matchCard}>
      {/* Header row */}
      <View style={styles.indivHeaderRow}>
        <Text style={[styles.indivHeaderCell, styles.indivRankCell]}>#</Text>
        <Text style={[styles.indivHeaderCell, styles.indivNameCell]}>PLAYER</Text>
        <Text style={[styles.indivHeaderCell, styles.indivStatCell]}>W</Text>
        <Text style={[styles.indivHeaderCell, styles.indivStatCell]}>L</Text>
        <Text style={[styles.indivHeaderCell, styles.indivStatCell]}>MTCH</Text>
      </View>

      {ranked.map(([name, stat], i) => {
        const team = TEAM_A.includes(name) ? 'A' : 'B';
        const isLast = i === ranked.length - 1;
        return (
          <View
            key={name}
            style={[styles.indivRow, !isLast && styles.indivRowBorder]}
          >
            <Text style={[styles.indivRankCell, styles.indivRankText]}>{i + 1}</Text>
            <View style={[styles.indivNameCell, { flexDirection: 'row', alignItems: 'center' }]}>
              <View style={[styles.teamDot, team === 'A' ? styles.teamDotA : styles.teamDotB]} />
              <Text style={styles.indivPlayerName}>{name}</Text>
            </View>
            <Text style={[styles.indivStatCell, styles.indivStatText]}>{stat.holesWon}</Text>
            <Text style={[styles.indivStatCell, styles.indivStatText]}>{stat.holesLost}</Text>
            <Text style={[styles.indivStatCell, styles.indivStatText]}>
              {stat.matchesWon}/{stat.matchesPlayed}
            </Text>
          </View>
        );
      })}

      <Text style={styles.tableNote}>W/L = holes won/lost   Mtch = matches won</Text>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseHoles(raw: Record<string, number> | undefined): HolesMap {
  if (!raw) return {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [Number(k), v]));
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.paper },
  content: { paddingVertical: 16, paddingBottom: 40 },

  // ── Header
  header: {
    backgroundColor: Colors.paper,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.rule,
  },
  headerTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 32,
    color: Colors.ink,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.mute,
    marginTop: 2,
    marginBottom: 14,
  },

  // ── Tab row
  tabRow: {
    flexDirection: 'row',
    gap: 0,
    marginTop: 4,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 4,
  },
  tabBtnActive: {
    borderBottomColor: Colors.brass,
  },
  tabBtnText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.mute,
  },
  tabBtnTextActive: {
    color: Colors.ink,
  },

  // ── Cup Ribbon Banner
  cupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ink,
    borderRadius: 4,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 0,
  },
  cupTeam: {
    flex: 1,
    alignItems: 'flex-start',
  },
  cupTeamRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cupTeamOverline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.brass,
    marginBottom: 4,
  },
  cupScore: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 64,
    letterSpacing: -1,
    color: Colors.paper,
    lineHeight: 68,
  },
  cupCenter: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  cupCenterText: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.brass,
    marginTop: 4,
  },

  // ── Cup rule + round summary
  cupRuleRow: {
    marginHorizontal: 16,
    marginBottom: 18,
  },
  cupRule: {
    height: 1,
    backgroundColor: Colors.brass,
    opacity: 0.35,
    marginTop: 0,
  },
  cupRoundSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    backgroundColor: Colors.ink,
    paddingBottom: 10,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  cupRoundSummaryText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.paper,
    opacity: 0.6,
  },

  // ── Section overline + cards
  sectionBlock: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionOverline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.brassDeep,
    marginBottom: 8,
    marginTop: 4,
  },

  // ── Match card (live pairings)
  matchCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    overflow: 'hidden',
    padding: 0,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  matchRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.ruleSoft,
  },
  matchPlayers: {
    flex: 1,
  },
  matchLeadName: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 17,
    color: Colors.ink,
  },
  matchVs: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 11,
    color: Colors.mute,
    marginVertical: 1,
  },
  matchTrailName: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 17,
    color: Colors.mute,
  },
  matchStatus: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  matchStatusLabel: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 22,
    color: Colors.brassDeep,
  },
  matchThru: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    color: Colors.mute,
    letterSpacing: 0.5,
    marginTop: 1,
  },

  // ── Completed round card
  completedCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    overflow: 'hidden',
    padding: 0,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  completedRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.ruleSoft,
    borderStyle: 'dashed',
  },
  completedNames: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: Colors.inkSoft,
    flex: 1,
  },
  completedResult: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 15,
    color: Colors.mute,
  },

  // ── Empty state
  emptyCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  empty: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.mute,
    textAlign: 'center',
  },

  // ── Individual leaderboard
  indivHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  indivHeaderCell: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Colors.brass,
    textAlign: 'center',
  },
  indivRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.paper,
  },
  indivRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.rule,
  },
  indivRankCell: { width: 28, textAlign: 'center' },
  indivNameCell: { flex: 1 },
  indivStatCell: { width: 44, textAlign: 'center' },
  indivRankText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.mute,
    textAlign: 'center',
  },
  indivPlayerName: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 17,
    color: Colors.ink,
  },
  indivStatText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: Colors.inkSoft,
    textAlign: 'center',
  },
  tableNote: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    letterSpacing: 0.5,
    color: Colors.mute,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.paperDeep,
  },

  teamDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  teamDotA: { backgroundColor: Colors.ink },
  teamDotB: { backgroundColor: Colors.brick },
});
