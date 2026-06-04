import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { PLAYERS, ROUNDS } from '../config/gameConfig';
import { Colors, Shadow, Typography } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type HoleScores = Record<string, number>;

type SideBetType = 'closestToPin' | 'longestDrive' | 'custom';

type SideBet = {
  id: string;
  type: SideBetType;
  roundId: string;
  hole?: number;
  description: string;
  amount: number;
  winner: string;
};

type SkinResult = {
  hole: number;
  winner: string | null; // null means carried over
  pot: number;           // accumulated pot size (in skins units)
};

// ─── Constants ───────────────────────────────────────────────────────────────

const BET_TYPE_LABELS: Record<SideBetType, string> = {
  closestToPin: 'Closest to Pin',
  longestDrive: 'Longest Drive',
  custom: 'Custom',
};

const DEFAULT_DESCRIPTIONS: Record<SideBetType, string> = {
  closestToPin: 'Closest to Pin',
  longestDrive: 'Longest Drive',
  custom: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateSkins(
  scoresPerPlayer: Record<string, HoleScores>,
  amountPerSkin: number,
): SkinResult[] {
  const results: SkinResult[] = [];
  let carryover = 0;

  for (let h = 1; h <= 18; h++) {
    const holeKey = String(h);
    const scoresThisHole: Array<{ player: string; score: number }> = [];

    for (const player of PLAYERS) {
      const playerHoles = scoresPerPlayer[player];
      if (!playerHoles) continue;
      const score = playerHoles[holeKey] ?? 0;
      if (score > 0) scoresThisHole.push({ player, score });
    }

    if (scoresThisHole.length === 0) {
      // No scores entered yet — skip but carry
      carryover += 1;
      results.push({ hole: h, winner: null, pot: carryover * amountPerSkin });
      continue;
    }

    const minScore = Math.min(...scoresThisHole.map((s) => s.score));
    const winners = scoresThisHole.filter((s) => s.score === minScore);

    if (winners.length === 1) {
      const pot = (carryover + 1) * amountPerSkin;
      results.push({ hole: h, winner: winners[0].player, pot });
      carryover = 0;
    } else {
      // Tied — carry over
      carryover += 1;
      results.push({ hole: h, winner: null, pot: (carryover) * amountPerSkin });
    }
  }

  return results;
}

function buildLedger(
  skinsResults: SkinResult[],
  sideBets: SideBet[],
): Array<{ from: string; to: string; amount: number }> {
  // Accumulate net balances (positive = owed to you, negative = you owe)
  const balance: Record<string, number> = {};
  for (const player of PLAYERS) balance[player] = 0;

  // Skins winnings: winner gets pot from all other players equally
  for (const result of skinsResults) {
    if (!result.winner || result.pot === 0) continue;
    const payers = PLAYERS.filter((p) => p !== result.winner);
    if (payers.length === 0) continue;
    const perPerson = result.pot / payers.length;
    balance[result.winner] = (balance[result.winner] ?? 0) + result.pot;
    for (const payer of payers) {
      balance[payer] = (balance[payer] ?? 0) - perPerson;
    }
  }

  // Side bet winnings
  for (const bet of sideBets) {
    if (!bet.winner || bet.amount === 0) continue;
    const payers = PLAYERS.filter((p) => p !== bet.winner);
    if (payers.length === 0) continue;
    const perPerson = bet.amount / payers.length;
    balance[bet.winner] = (balance[bet.winner] ?? 0) + bet.amount;
    for (const payer of payers) {
      balance[payer] = (balance[payer] ?? 0) - perPerson;
    }
  }

  // Consolidate debts
  const debts: Array<{ from: string; to: string; amount: number }> = [];

  const creditors = PLAYERS.filter((p) => (balance[p] ?? 0) > 0.005).map((p) => ({ player: p, amount: balance[p] ?? 0 }));
  const debtors = PLAYERS.filter((p) => (balance[p] ?? 0) < -0.005).map((p) => ({ player: p, amount: Math.abs(balance[p] ?? 0) }));

  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const settled = Math.min(creditor.amount, debtor.amount);
    if (settled > 0.005) {
      debts.push({ from: debtor.player, to: creditor.player, amount: Math.round(settled * 100) / 100 });
    }
    creditor.amount -= settled;
    debtor.amount -= settled;
    if (creditor.amount < 0.005) ci++;
    if (debtor.amount < 0.005) di++;
  }

  return debts;
}

// ─── Corner Bracket ──────────────────────────────────────────────────────────

function CornerBrackets() {
  const s = 14;
  const t = 1.5;
  return (
    <>
      {/* top-left */}
      <View style={{ position: 'absolute', top: -1, left: -1, width: s, height: s,
        borderTopWidth: t, borderLeftWidth: t, borderColor: Colors.brass }} />
      {/* top-right */}
      <View style={{ position: 'absolute', top: -1, right: -1, width: s, height: s,
        borderTopWidth: t, borderRightWidth: t, borderColor: Colors.brass }} />
      {/* bottom-left */}
      <View style={{ position: 'absolute', bottom: -1, left: -1, width: s, height: s,
        borderBottomWidth: t, borderLeftWidth: t, borderColor: Colors.brass }} />
      {/* bottom-right */}
      <View style={{ position: 'absolute', bottom: -1, right: -1, width: s, height: s,
        borderBottomWidth: t, borderRightWidth: t, borderColor: Colors.brass }} />
    </>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SideBetsScreen() {
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);
  const round = ROUNDS[selectedRoundIndex];
  const roundId = round.id;

  // Skins config per round
  const [amountPerSkin, setAmountPerSkin] = useState(5);
  const [skinsExpanded, setSkinsExpanded] = useState(false);

  // Scores from Firestore
  const [scoresPerPlayer, setScoresPerPlayer] = useState<Record<string, HoleScores>>({});

  // Side bets from Firestore
  const [sideBets, setSideBets] = useState<SideBet[]>([]);

  // Add bet modal state
  const [showAddBet, setShowAddBet] = useState(false);

  // Loading state for skins config
  const [loadingConfig, setLoadingConfig] = useState(false);

  useEffect(() => {
    // Load skins config for this round
    const configRef = doc(db, 'skins', roundId, 'config', 'config');
    return onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as { amountPerSkin?: number };
        if (typeof data.amountPerSkin === 'number') {
          setAmountPerSkin(data.amountPerSkin);
        }
      }
    });
  }, [roundId]);

  useEffect(() => {
    // Load scores for skins calculation
    const playersRef = collection(db, 'scores', roundId, 'players');
    return onSnapshot(playersRef, (snap) => {
      const map: Record<string, HoleScores> = {};
      snap.forEach((d) => {
        const data = d.data() as { holes?: Record<string, number> };
        if (data.holes) map[d.id] = data.holes;
      });
      setScoresPerPlayer(map);
    });
  }, [roundId]);

  useEffect(() => {
    // Load all side bets
    const q = query(collection(db, 'sideBets'), orderBy('amount', 'desc'));
    return onSnapshot(q, (snap) => {
      const bets: SideBet[] = [];
      snap.forEach((d) => {
        bets.push({ id: d.id, ...(d.data() as Omit<SideBet, 'id'>) });
      });
      setSideBets(bets);
    });
  }, []);

  const saveAmountPerSkin = useCallback(async (amount: number) => {
    setLoadingConfig(true);
    try {
      await setDoc(doc(db, 'skins', roundId, 'config', 'config'), { amountPerSkin: amount }, { merge: true });
    } catch {
      Alert.alert('Error', 'Could not save skin amount.');
    } finally {
      setLoadingConfig(false);
    }
  }, [roundId]);

  const adjustSkinAmount = useCallback((delta: number) => {
    const next = Math.max(1, amountPerSkin + delta);
    setAmountPerSkin(next);
    saveAmountPerSkin(next);
  }, [amountPerSkin, saveAmountPerSkin]);

  const deleteSideBet = useCallback((betId: string) => {
    Alert.alert('Delete Bet', 'Remove this bet?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'sideBets', betId));
          } catch {
            Alert.alert('Error', 'Could not delete bet.');
          }
        },
      },
    ]);
  }, []);

  const skinsResults = calculateSkins(scoresPerPlayer, amountPerSkin);
  const holesPlayed = skinsResults.filter((r) => r.winner !== null || Object.keys(scoresPerPlayer).length > 0).length;
  const roundSideBets = sideBets.filter((b) => b.roundId === roundId);
  const allSideBetsForLedger = sideBets;
  const allSkinsForLedger = calculateSkins(scoresPerPlayer, amountPerSkin);
  const ledger = buildLedger(allSkinsForLedger, allSideBetsForLedger);

  // Skins summary per player for this round
  const skinsSummary: Record<string, number> = {};
  for (const player of PLAYERS) skinsSummary[player] = 0;
  for (const result of skinsResults) {
    if (result.winner) {
      skinsSummary[result.winner] = (skinsSummary[result.winner] ?? 0) + result.pot;
    }
  }

  const playedCount = skinsResults.filter((r) => {
    const holeKey = String(r.hole);
    return PLAYERS.some((p) => scoresPerPlayer[p]?.[holeKey]);
  }).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>The Ledger</Text>
        <Text style={styles.headerSubtitle}>Skins · side action · debts owed</Text>
      </View>

      {/* ── Section A: Skins ── */}
      <Text style={styles.overline}>SKINS · ROUND {selectedRoundIndex + 1}</Text>

      {/* Round selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.roundSelector}
      >
        {ROUNDS.map((r, index) => (
          <TouchableOpacity
            key={r.id}
            style={[styles.roundTab, index === selectedRoundIndex && styles.roundTabActive]}
            onPress={() => setSelectedRoundIndex(index)}
          >
            <Text style={[styles.roundTabText, index === selectedRoundIndex && styles.roundTabTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Config card */}
      <View style={styles.configCard}>
        <View style={styles.configRow}>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => adjustSkinAmount(-1)}
              disabled={loadingConfig}
            >
              <Text style={styles.stepBtnText}>–</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>${amountPerSkin}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => adjustSkinAmount(1)}
              disabled={loadingConfig}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.configSummary}>
            ${amountPerSkin} per skin · {playedCount} of 18 played
          </Text>
        </View>
      </View>

      {/* Skins results toggle */}
      <TouchableOpacity style={styles.collapseToggle} onPress={() => setSkinsExpanded(v => !v)}>
        <Text style={styles.collapseToggleText}>
          {skinsExpanded ? 'HIDE ▴' : 'SHOW RESULTS ▾'}
        </Text>
      </TouchableOpacity>

      {skinsExpanded && (
        <View style={styles.table}>
          {/* Table header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableHeaderText, styles.tableCellHole]}>HOLE</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellWinner]}>WINNER</Text>
            <Text style={[styles.tableHeaderText, styles.tableCellPot]}>POT</Text>
          </View>
          {skinsResults.map((result, idx) => (
            <View
              key={result.hole}
              style={[
                styles.tableRow,
                result.winner ? styles.tableRowWon : styles.tableRowCarry,
                idx === skinsResults.length - 1 && styles.tableRowLast,
              ]}
            >
              <Text style={[styles.tableCellText, styles.tableCellHole]}>{result.hole}</Text>
              <Text style={[
                styles.tableCellText,
                styles.tableCellWinner,
                !result.winner && styles.tableCellCarryText,
              ]}>
                {result.winner ?? 'carried over'}
              </Text>
              <Text style={[
                styles.tableCellText,
                styles.tableCellPot,
                result.winner ? styles.tableCellWonAmount : styles.tableCellCarryAmount,
              ]}>
                {result.winner ? `$${result.pot}` : `→`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Section B: Other Bets ── */}
      <Text style={[styles.overline, styles.overlineSpaced]}>SIDE ACTION</Text>

      {roundSideBets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No bets for this round yet.</Text>
        </View>
      ) : (
        roundSideBets.map((bet) => (
          <View key={bet.id} style={styles.betCard}>
            <View style={styles.betCardTop}>
              <Text style={styles.betTypeOverline}>{BET_TYPE_LABELS[bet.type]}</Text>
              <TouchableOpacity onPress={() => deleteSideBet(bet.id)} style={styles.deleteBetBtn}>
                <Text style={styles.deleteBetText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.betDescription}>{bet.description}</Text>
            <View style={styles.betBottom}>
              <Text style={styles.betWinner}>won by {bet.winner}</Text>
              <Text style={styles.betAmount}>
                {bet.amount > 0 ? `$${bet.amount}` : 'pride only'}
              </Text>
            </View>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.addBetBtn} onPress={() => setShowAddBet(true)}>
        <Text style={styles.addBetText}>+ Add Bet</Text>
      </TouchableOpacity>

      {/* ── Section C: Ledger ── */}
      <Text style={[styles.overline, styles.overlineSpaced]}>SETTLEMENT · WHO OWES WHOM</Text>

      <View style={styles.ledgerCard}>
        <CornerBrackets />
        {ledger.length === 0 ? (
          <Text style={styles.allSquareText}>All square.</Text>
        ) : (
          ledger.map((entry, i) => (
            <View
              key={i}
              style={[styles.ledgerRow, i === ledger.length - 1 && styles.ledgerRowLast]}
            >
              <Text style={styles.ledgerFrom}>{entry.from}</Text>
              <Text style={styles.ledgerOwes}> owes </Text>
              <Text style={styles.ledgerTo}>{entry.to}</Text>
              <Text style={styles.ledgerAmount}>${entry.amount.toFixed(2)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.bottomPad} />

      {/* Add Bet Modal */}
      <AddBetModal
        visible={showAddBet}
        roundId={roundId}
        onClose={() => setShowAddBet(false)}
      />
    </ScrollView>
  );
}

// ─── Add Bet Modal ────────────────────────────────────────────────────────────

type AddBetModalProps = {
  visible: boolean;
  roundId: string;
  onClose: () => void;
};

function AddBetModal({ visible, roundId, onClose }: AddBetModalProps) {
  const [betType, setBetType] = useState<SideBetType>('closestToPin');
  const [description, setDescription] = useState(DEFAULT_DESCRIPTIONS.closestToPin);
  const [selectedRoundId, setSelectedRoundId] = useState(roundId);
  const [hole, setHole] = useState('');
  const [amount, setAmount] = useState('');
  const [winner, setWinner] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setBetType('closestToPin');
      setDescription(DEFAULT_DESCRIPTIONS.closestToPin);
      setSelectedRoundId(roundId);
      setHole('');
      setAmount('');
      setWinner('');
    }
  }, [visible, roundId]);

  const handleTypeChange = (type: SideBetType) => {
    setBetType(type);
    setDescription(DEFAULT_DESCRIPTIONS[type]);
  };

  const handleSave = async () => {
    if (!winner) {
      Alert.alert('Missing info', 'Please select a winner.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount))) {
      Alert.alert('Missing info', 'Please enter an amount.');
      return;
    }
    setSaving(true);
    try {
      const data: Omit<SideBet, 'id'> & { hole?: number } = {
        type: betType,
        roundId: selectedRoundId,
        description,
        amount: parseFloat(amount),
        winner,
      };
      if (hole) data.hole = parseInt(hole, 10);
      await addDoc(collection(db, 'sideBets'), data);
      onClose();
    } catch {
      Alert.alert('Error', 'Could not save bet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Bet</Text>
            <TouchableOpacity onPress={handleSave} style={styles.modalSaveBtn} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Type picker */}
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeRow}>
              {(['closestToPin', 'longestDrive', 'custom'] as SideBetType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typePill, betType === t && styles.typePillActive]}
                  onPress={() => handleTypeChange(t)}
                >
                  <Text style={[styles.typePillText, betType === t && styles.typePillTextActive]}>
                    {BET_TYPE_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.fieldInput}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Closest to pin on #7"
            />

            {/* Round picker */}
            <Text style={styles.fieldLabel}>Round</Text>
            <View style={styles.typeRow}>
              {ROUNDS.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.typePill, selectedRoundId === r.id && styles.typePillActive]}
                  onPress={() => setSelectedRoundId(r.id)}
                >
                  <Text style={[styles.typePillText, selectedRoundId === r.id && styles.typePillTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Hole */}
            <Text style={styles.fieldLabel}>Hole (optional)</Text>
            <TextInput
              style={styles.fieldInput}
              value={hole}
              onChangeText={setHole}
              placeholder="e.g. 7"
              keyboardType="number-pad"
            />

            {/* Amount */}
            <Text style={styles.fieldLabel}>Amount ($)</Text>
            <TextInput
              style={styles.fieldInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="e.g. 10"
              keyboardType="decimal-pad"
            />

            {/* Winner */}
            <Text style={styles.fieldLabel}>Winner</Text>
            <View style={styles.playerGrid}>
              {PLAYERS.map((player) => (
                <TouchableOpacity
                  key={player}
                  style={[styles.playerPill, winner === player && styles.playerPillActive]}
                  onPress={() => setWinner(player)}
                >
                  <Text style={[styles.playerPillText, winner === player && styles.playerPillTextActive]}>
                    {player}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  content: { paddingTop: 0, paddingBottom: 40 },

  // ── Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 30,
    color: Colors.ink,
    lineHeight: 34,
  },
  headerSubtitle: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 13,
    color: Colors.mute,
    marginTop: 4,
  },

  // ── Overlines
  overline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: Colors.brassDeep,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  overlineSpaced: {
    marginTop: 24,
  },

  // ── Round selector
  roundSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  roundTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 2,
    backgroundColor: Colors.paperDeep,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  roundTabActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  roundTabText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: Colors.mute,
  },
  roundTabTextActive: {
    color: Colors.white,
  },

  // ── Config card
  configCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 2,
    backgroundColor: Colors.paperDeep,
    borderWidth: 1,
    borderColor: Colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 18,
    color: Colors.ink,
    lineHeight: 20,
  },
  stepValue: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 20,
    color: Colors.ink,
    minWidth: 36,
    textAlign: 'center',
  },
  configSummary: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 20,
    color: Colors.ink,
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
  },

  // ── Collapse toggle
  collapseToggle: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginVertical: 8,
  },
  collapseToggleText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.brassDeep,
  },

  // ── Skins table
  table: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeader: {
    backgroundColor: Colors.ink,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
  },
  tableHeaderText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: Colors.brass,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ruleSoft,
    alignItems: 'center',
  },
  tableRowWon: { backgroundColor: Colors.cardBg },
  tableRowCarry: { backgroundColor: Colors.paper },
  tableRowLast: { borderBottomWidth: 0 },
  tableCellText: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 16,
    color: Colors.ink,
  },
  tableCellHole: { width: 50, textAlign: 'center' },
  tableCellWinner: { flex: 1 },
  tableCellPot: { width: 60, textAlign: 'right' },
  tableCellCarryText: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    color: Colors.mute,
  },
  tableCellWonAmount: { color: Colors.forest, fontFamily: 'DMSerifDisplay_400Regular' },
  tableCellCarryAmount: { color: Colors.mute },

  // ── Side bet cards
  betCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  betCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  betTypeOverline: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: Colors.brick,
    textTransform: 'uppercase',
  },
  deleteBetBtn: { padding: 4 },
  deleteBetText: { fontSize: 14, color: Colors.mute },
  betDescription: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 17,
    color: Colors.ink,
    marginBottom: 8,
  },
  betBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  betWinner: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 15,
    color: Colors.forest,
  },
  betAmount: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 18,
    color: Colors.ink,
  },

  emptyCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 14,
  },
  emptyText: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.mute,
  },

  addBetBtn: {
    borderWidth: 1,
    borderColor: Colors.rule,
    borderStyle: 'dashed',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  addBetText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: Colors.brassDeep,
  },

  // ── Ledger
  ledgerCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    position: 'relative',
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.ruleSoft,
  },
  ledgerRowLast: {
    borderBottomWidth: 0,
  },
  ledgerFrom: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 16,
    color: Colors.brick,
  },
  ledgerOwes: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 16,
    color: Colors.mute,
  },
  ledgerTo: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 16,
    color: Colors.ink,
    flex: 1,
  },
  ledgerAmount: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 16,
    color: Colors.forest,
  },
  allSquareText: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 16,
    color: Colors.mute,
    textAlign: 'center',
    paddingVertical: 8,
  },

  bottomPad: { height: 20 },

  // ── Modal
  modalContainer: { flex: 1, backgroundColor: Colors.paper },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 22,
    color: Colors.white,
  },
  modalCancel: { padding: 4 },
  modalCancelText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: Colors.brass,
  },
  modalSaveBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalSaveText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: Colors.white,
  },
  modalContent: { padding: 20, paddingBottom: 40 },

  fieldLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: Colors.brassDeep,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  fieldInput: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: Colors.ink,
  },

  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 2,
    backgroundColor: Colors.paperDeep,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  typePillActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  typePillText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: Colors.mute,
  },
  typePillTextActive: { color: Colors.white },

  playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 2,
    backgroundColor: Colors.paperDeep,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  playerPillActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  playerPillText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: Colors.mute,
  },
  playerPillTextActive: { color: Colors.white },
});
