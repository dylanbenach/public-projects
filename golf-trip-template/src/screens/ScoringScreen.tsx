import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PLAYERS, ROUNDS, ROUND_PAIRINGS, HOLE_INFO } from '../config/gameConfig';
import { courseHandicap, strokesReceivedOnHole } from '../utils/handicap';
import { Colors, Shadow, Typography } from '../theme';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

type ScoreMap = Record<string, Record<number, number>>;
type CompletedMap = Record<string, boolean>;

type PlayerData = { handicapIndex?: number };
type PlayersMap = Record<string, PlayerData>;

function totalScore(holeScores: Record<number, number> | undefined): number {
  if (!holeScores) return 0;
  return Object.values(holeScores).reduce((sum, s) => sum + s, 0);
}

export default function ScoringScreen() {
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);
  const [scores, setScores] = useState<ScoreMap>({});
  const [completed, setCompleted] = useState<CompletedMap>({});
  const [playerData, setPlayerData] = useState<PlayersMap>({});
  const [saving, setSaving] = useState(false);

  // Scroll sync refs
  const headerScrollRef = useRef<ScrollView>(null);
  const parScrollRef = useRef<ScrollView>(null);
  const playerScrollRefs = useRef<(ScrollView | null)[]>([]);
  const isSyncing = useRef(false);

  const syncScroll = useCallback((x: number, sourceIndex: number) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (headerScrollRef.current && sourceIndex !== -1) {
      headerScrollRef.current.scrollTo({ x, animated: false });
    }
    parScrollRef.current?.scrollTo({ x, animated: false });
    playerScrollRefs.current.forEach((ref, i) => {
      if (ref && i !== sourceIndex) {
        ref.scrollTo({ x, animated: false });
      }
    });
    requestAnimationFrame(() => { isSyncing.current = false; });
  }, []);

  const round = ROUNDS[selectedRoundIndex];
  const roundId = round.id;

  useEffect(() => {
    const playersRef = collection(db, 'scores', roundId, 'players');
    const unsubscribe = onSnapshot(playersRef, (snapshot) => {
      const updatedScores: ScoreMap = {};
      const updatedCompleted: CompletedMap = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as { holes?: Record<string, number>; completed?: boolean };
        if (data.holes) {
          updatedScores[docSnap.id] = Object.fromEntries(
            Object.entries(data.holes).map(([k, v]) => [Number(k), v])
          );
        }
        updatedCompleted[docSnap.id] = data.completed ?? false;
      });
      setScores(updatedScores);
      setCompleted(updatedCompleted);
    }, (error) => {
      console.error('Firestore snapshot error:', error);
      Alert.alert('Sync Error', 'Could not connect to Firestore. Check your Firebase config.');
    });
    return unsubscribe;
  }, [roundId]);

  useEffect(() => {
    return onSnapshot(collection(db, 'players'), (snap) => {
      const map: PlayersMap = {};
      snap.forEach((d) => { map[d.id] = d.data() as PlayerData; });
      setPlayerData(map);
    });
  }, []);

  const adjustScore = useCallback(async (player: string, hole: number, delta: number) => {
    if (completed[player]) return;
    const current = scores[player]?.[hole] ?? 0;
    const next = Math.max(0, current + delta);

    setScores((prev) => ({
      ...prev,
      [player]: { ...(prev[player] ?? {}), [hole]: next },
    }));

    setSaving(true);
    try {
      await setDoc(
        doc(db, 'scores', roundId, 'players', player),
        { holes: { [hole]: next } },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to save score:', err);
      Alert.alert('Save Failed', 'Could not save score. Check your connection.');
      setScores((prev) => ({
        ...prev,
        [player]: { ...(prev[player] ?? {}), [hole]: current },
      }));
    } finally {
      setSaving(false);
    }
  }, [scores, completed, roundId]);

  const finishRound = useCallback((player: string) => {
    Alert.alert(
      'Finish Round',
      `Submit ${player}'s round? This locks the scorecard and updates the scoreboard.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await setDoc(
                doc(db, 'scores', roundId, 'players', player),
                { completed: true },
                { merge: true }
              );
            } catch {
              Alert.alert('Error', 'Could not submit round. Try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }, [roundId]);

  const opponentFor = useCallback((player: string): string | null => {
    const pairings = ROUND_PAIRINGS[roundId] ?? [];
    const pair = pairings.find((p) => p.playerA === player || p.playerB === player);
    if (!pair) return null;
    return pair.playerA === player ? pair.playerB : pair.playerA;
  }, [roundId]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Scorecard</Text>
            <Text style={styles.headerSubtitle}>
              {round.label.toLowerCase()} · {round.course} · par {round.par}
            </Text>
          </View>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>
              {`R${selectedRoundIndex + 1}`}
            </Text>
          </View>
        </View>

        {/* Round tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.roundTabScroll}
          contentContainerStyle={styles.roundTabContainer}
        >
          {ROUNDS.map((r, index) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.roundTab, index === selectedRoundIndex && styles.roundTabActive]}
              onPress={() => setSelectedRoundIndex(index)}
            >
              <Text style={[styles.roundTabText, index === selectedRoundIndex && styles.roundTabTextActive]}>
                {`Round ${index + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {saving && (
        <View style={styles.savingBanner}>
          <ActivityIndicator size="small" color={Colors.brass} />
          <Text style={styles.savingText}>Saving…</Text>
        </View>
      )}

      {/* Scorecard table */}
      <ScrollView style={styles.scorecard} stickyHeaderIndices={[0]}>
        {/* Sticky header row */}
        <View style={styles.headerRow}>
          <View style={styles.playerCell}>
            <Text style={styles.headerCellText}>Player</Text>
          </View>
          <ScrollView
            ref={headerScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => syncScroll(e.nativeEvent.contentOffset.x, -1)}
            scrollEventThrottle={16}
          >
            <View style={styles.holesRow}>
              {/* Holes 1-9 */}
              {HOLES.slice(0, 9).map((h) => (
                <View key={h} style={styles.holeCell}>
                  <Text style={styles.headerCellText}>{h}</Text>
                </View>
              ))}
              {/* OUT total */}
              <View style={[styles.holeCell, styles.totalCell]}>
                <Text style={styles.totalHeaderText}>OUT</Text>
              </View>
              {/* Holes 10-18 */}
              {HOLES.slice(9).map((h) => (
                <View key={h} style={styles.holeCell}>
                  <Text style={styles.headerCellText}>{h}</Text>
                </View>
              ))}
              {/* IN total */}
              <View style={[styles.holeCell, styles.totalCell]}>
                <Text style={styles.totalHeaderText}>IN</Text>
              </View>
              {/* TOT */}
              <View style={[styles.holeCell, styles.totalCell]}>
                <Text style={styles.totalHeaderText}>TOT</Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Par row */}
        <View style={styles.parRow}>
          <View style={styles.playerCell}>
            <Text style={styles.parLabelText}>Par</Text>
          </View>
          <ScrollView
            ref={parScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <View style={styles.holesRow}>
              {HOLES.slice(0, 9).map((h) => (
                <View key={h} style={styles.holeCell}>
                  <Text style={styles.parCellText}>{HOLE_INFO[h - 1].par}</Text>
                </View>
              ))}
              <View style={[styles.holeCell, styles.totalCell]}>
                <Text style={styles.parCellText}>
                  {HOLE_INFO.slice(0, 9).reduce((s, h) => s + h.par, 0)}
                </Text>
              </View>
              {HOLES.slice(9).map((h) => (
                <View key={h} style={styles.holeCell}>
                  <Text style={styles.parCellText}>{HOLE_INFO[h - 1].par}</Text>
                </View>
              ))}
              <View style={[styles.holeCell, styles.totalCell]}>
                <Text style={styles.parCellText}>
                  {HOLE_INFO.slice(9).reduce((s, h) => s + h.par, 0)}
                </Text>
              </View>
              <View style={[styles.holeCell, styles.totalCell]}>
                <Text style={styles.parCellText}>
                  {HOLE_INFO.reduce((s, h) => s + h.par, 0)}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {PLAYERS.map((player, pIdx) => {
          const opponent = opponentFor(player);
          const hcpSelf = courseHandicap(
            playerData[player]?.handicapIndex ?? 0,
            round.slope, round.rating, round.par,
          );
          const hcpOpp = opponent
            ? courseHandicap(playerData[opponent]?.handicapIndex ?? 0, round.slope, round.rating, round.par)
            : 0;

          return (
            <PlayerRow
              key={player}
              index={pIdx}
              player={player}
              holeScores={scores[player]}
              isEvenRow={pIdx % 2 === 0}
              isCompleted={completed[player] ?? false}
              courseHcpSelf={hcpSelf}
              courseHcpOpponent={hcpOpp}
              hasOpponent={opponent !== null}
              onAdjust={adjustScore}
              onFinish={finishRound}
              onScroll={syncScroll}
              scrollRefCallback={(r) => { playerScrollRefs.current[pIdx] = r; }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

type PlayerRowProps = {
  index: number;
  player: string;
  holeScores: Record<number, number> | undefined;
  isEvenRow: boolean;
  isCompleted: boolean;
  courseHcpSelf: number;
  courseHcpOpponent: number;
  hasOpponent: boolean;
  onAdjust: (player: string, hole: number, delta: number) => void;
  onFinish: (player: string) => void;
  onScroll: (x: number, sourceIndex: number) => void;
  scrollRefCallback: (ref: ScrollView | null) => void;
};

function scoreDecoration(gross: number, par: number): 'eagle' | 'birdie' | 'bogey' | 'double' | null {
  if (gross <= 0) return null;
  const diff = gross - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 1) return 'bogey';
  if (diff >= 2) return 'double';
  return null;
}

function PlayerRow({
  index, player, holeScores, isEvenRow, isCompleted,
  courseHcpSelf, courseHcpOpponent, hasOpponent,
  onAdjust, onFinish, onScroll, scrollRefCallback,
}: PlayerRowProps) {
  const outScore = HOLES.slice(0, 9).reduce((s, h) => s + (holeScores?.[h] ?? 0), 0);
  const inScore = HOLES.slice(9).reduce((s, h) => s + (holeScores?.[h] ?? 0), 0);
  const total = outScore + inScore;

  return (
    <View style={[styles.playerRow, isEvenRow && styles.playerRowEven, isCompleted && styles.playerRowDone]}>
      <View style={styles.playerCell}>
        <Text style={styles.playerName} numberOfLines={1}>{player}</Text>
        {hasOpponent && (
          <Text style={styles.hcpLabel}>HCP {courseHcpSelf}</Text>
        )}
        {isCompleted ? (
          <View style={styles.doneBadge}>
            <Text style={styles.doneBadgeText}>Done</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.finishBtn} onPress={() => onFinish(player)}>
            <Text style={styles.finishBtnText}>Finish</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRefCallback}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => onScroll(e.nativeEvent.contentOffset.x, index)}
        scrollEventThrottle={16}
      >
        <View style={styles.holesRow}>
          {/* Holes 1-9 */}
          {HOLES.slice(0, 9).map((hole) => {
            const gross = holeScores?.[hole] ?? 0;
            const strokes = strokesReceivedOnHole(courseHcpSelf, courseHcpOpponent, hole - 1);
            const deco = scoreDecoration(gross, HOLE_INFO[hole - 1].par);

            return (
              <View key={hole} style={[styles.holeCell, strokes > 0 && styles.holeCellHandicap]}>
                {!isCompleted ? (
                  <>
                    <TouchableOpacity style={styles.scoreBtn} onPress={() => onAdjust(player, hole, 1)}>
                      <Text style={styles.scoreBtnText}>+</Text>
                    </TouchableOpacity>
                    <ScoreCell value={gross} deco={deco} />
                    <TouchableOpacity style={styles.scoreBtn} onPress={() => onAdjust(player, hole, -1)}>
                      <Text style={styles.scoreBtnText}>–</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <ScoreCell value={gross} deco={deco} />
                )}
                {strokes > 0 && <View style={styles.strokeDot} />}
              </View>
            );
          })}

          {/* OUT total */}
          <View style={[styles.holeCell, styles.totalCell]}>
            <Text style={styles.totalValue}>{outScore > 0 ? outScore : '–'}</Text>
          </View>

          {/* Holes 10-18 */}
          {HOLES.slice(9).map((hole) => {
            const gross = holeScores?.[hole] ?? 0;
            const strokes = strokesReceivedOnHole(courseHcpSelf, courseHcpOpponent, hole - 1);
            const deco = scoreDecoration(gross, HOLE_INFO[hole - 1].par);

            return (
              <View key={hole} style={[styles.holeCell, strokes > 0 && styles.holeCellHandicap]}>
                {!isCompleted ? (
                  <>
                    <TouchableOpacity style={styles.scoreBtn} onPress={() => onAdjust(player, hole, 1)}>
                      <Text style={styles.scoreBtnText}>+</Text>
                    </TouchableOpacity>
                    <ScoreCell value={gross} deco={deco} />
                    <TouchableOpacity style={styles.scoreBtn} onPress={() => onAdjust(player, hole, -1)}>
                      <Text style={styles.scoreBtnText}>–</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <ScoreCell value={gross} deco={deco} />
                )}
                {strokes > 0 && <View style={styles.strokeDot} />}
              </View>
            );
          })}

          {/* IN total */}
          <View style={[styles.holeCell, styles.totalCell]}>
            <Text style={styles.totalValue}>{inScore > 0 ? inScore : '–'}</Text>
          </View>

          {/* TOT total */}
          <View style={[styles.holeCell, styles.totalCell]}>
            <Text style={styles.totalValue}>{total > 0 ? total : '–'}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── ScoreCell ────────────────────────────────────────────────────────────────

type DecoType = 'eagle' | 'birdie' | 'bogey' | 'double' | null;

function ScoreCell({ value, deco }: { value: number; deco: DecoType }) {
  const display = value > 0 ? String(value) : '–';

  if (deco === 'birdie') {
    return (
      <View style={scoreCellStyles.birdieRing}>
        <Text style={styles.scoreValue}>{display}</Text>
      </View>
    );
  }
  if (deco === 'eagle') {
    return (
      <View style={scoreCellStyles.eagleOuter}>
        <View style={scoreCellStyles.eagleInner}>
          <Text style={styles.scoreValue}>{display}</Text>
        </View>
      </View>
    );
  }
  if (deco === 'bogey') {
    return (
      <View style={scoreCellStyles.bogeyBox}>
        <Text style={styles.scoreValue}>{display}</Text>
      </View>
    );
  }
  if (deco === 'double') {
    return (
      <View style={scoreCellStyles.doubleOuter}>
        <View style={scoreCellStyles.doubleInner}>
          <Text style={[styles.scoreValue, { color: Colors.brick }]}>{display}</Text>
        </View>
      </View>
    );
  }

  return <Text style={styles.scoreValue}>{display}</Text>;
}

const scoreCellStyles = StyleSheet.create({
  birdieRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: Colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eagleOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.2,
    borderColor: Colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eagleInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.2,
    borderColor: Colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bogeyBox: {
    width: 20,
    height: 20,
    borderWidth: 1.2,
    borderColor: Colors.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doubleOuter: {
    width: 26,
    height: 26,
    borderWidth: 1.2,
    borderColor: Colors.brick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doubleInner: {
    width: 18,
    height: 18,
    borderWidth: 1.2,
    borderColor: Colors.brick,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const HOLE_CELL_WIDTH = 52;
const PLAYER_CELL_WIDTH = 90;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },

  // ── Header
  header: {
    backgroundColor: Colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.rule,
    paddingTop: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 28,
    color: Colors.ink,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.mute,
    marginTop: 2,
  },
  roundBadge: {
    borderWidth: 1,
    borderColor: Colors.brass,
    borderRadius: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  roundBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.brassDeep,
  },

  // ── Round tab bar
  roundTabScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  roundTabContainer: {
    paddingHorizontal: 14,
    paddingBottom: 0,
    gap: 4,
    alignItems: 'center',
  },
  roundTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 2,
  },
  roundTabActive: {
    borderBottomColor: Colors.brass,
  },
  roundTabText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.mute,
  },
  roundTabTextActive: {
    color: Colors.ink,
  },

  savingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.ink,
    paddingVertical: 4,
    gap: 6,
  },
  savingText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    letterSpacing: 0.5,
    color: Colors.paper,
    marginLeft: 6,
  },

  // ── Scorecard table
  scorecard: { flex: 1 },

  // Sticky header row: ink background, brass text
  headerRow: {
    flexDirection: 'row',
    backgroundColor: Colors.ink,
    height: 36,
  },
  headerCellText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.brass,
    textAlign: 'center',
  },
  totalHeaderText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.brass,
    textAlign: 'center',
  },

  // Par row: paperDeep background, italic serif mute
  parRow: {
    flexDirection: 'row',
    backgroundColor: Colors.paperDeep,
    height: 32,
  },
  parLabelText: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 13,
    color: Colors.mute,
    textAlign: 'center',
  },
  parCellText: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 13,
    color: Colors.mute,
    textAlign: 'center',
  },

  // Score rows
  playerRow: {
    flexDirection: 'row',
    backgroundColor: Colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.ruleSoft,
    minHeight: 40,
  },
  playerRowEven: { backgroundColor: Colors.cardBg },
  playerRowDone: { opacity: 0.75 },

  playerCell: {
    width: PLAYER_CELL_WIDTH,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 3,
  },
  playerName: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 15,
    color: Colors.ink,
  },
  hcpLabel: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    color: Colors.mute,
    letterSpacing: 0.3,
  },
  finishBtn: {
    backgroundColor: Colors.brass,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  finishBtnText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.white,
  },
  doneBadge: {
    backgroundColor: Colors.paperDeep,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  doneBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.mute,
  },

  holesRow: { flexDirection: 'row', alignItems: 'center' },
  holeCell: {
    width: HOLE_CELL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
    height: 40,
  },
  holeCellHandicap: { backgroundColor: 'rgba(26,37,64,0.03)' },
  totalCell: {
    width: HOLE_CELL_WIDTH + 8,
    borderLeftWidth: 1,
    borderLeftColor: Colors.rule,
    backgroundColor: Colors.ink,
  },

  scoreBtn: {
    width: 26,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: Colors.paperDeep,
  },
  scoreBtnText: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 15,
    color: Colors.ink,
    lineHeight: 18,
  },
  scoreValue: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 16,
    color: Colors.ink,
    textAlign: 'center',
  },
  strokeDot: {
    position: 'absolute',
    top: 3,
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.brass,
  },
  totalValue: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 16,
    color: Colors.brass,
    textAlign: 'center',
  },
});
