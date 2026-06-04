import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PLAYERS, TEAM_A, GHIN_API_TOKEN } from '../config/gameConfig';
import { fetchHandicapFromGHIN } from '../services/ghinService';
import { Colors, Shadow } from '../theme';

type PlayerData = {
  ghinNumber: string;
  handicapIndex: number | null;
  lastRevised?: string;
};

type PlayersMap = Record<string, PlayerData>;

export default function PlayersScreen() {
  const [players, setPlayers] = useState<PlayersMap>({});
  const [fetching, setFetching] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, string>>({}); // player -> temp input value

  useEffect(() => {
    const ref = collection(db, 'players');
    return onSnapshot(ref, (snap) => {
      const map: PlayersMap = {};
      snap.forEach((d) => {
        map[d.id] = d.data() as PlayerData;
      });
      setPlayers(map);
    });
  }, []);

  const savePlayer = useCallback(async (name: string, data: Partial<PlayerData>) => {
    await setDoc(doc(db, 'players', name), data, { merge: true });
  }, []);

  const handleGHINFetch = useCallback(async (name: string) => {
    const ghinNum = players[name]?.ghinNumber ?? '';
    if (!ghinNum.trim()) {
      Alert.alert('Missing GHIN Number', 'Enter a GHIN number before fetching.');
      return;
    }
    if (!GHIN_API_TOKEN) {
      Alert.alert(
        'GHIN Token Required',
        'Set GHIN_API_TOKEN in src/config/gameConfig.ts.\n\nRegister at ghin.com/api to get a token, or enter handicap indexes manually below.',
      );
      return;
    }
    setFetching((f) => ({ ...f, [name]: true }));
    try {
      const result = await fetchHandicapFromGHIN(ghinNum.trim());
      await savePlayer(name, {
        ghinNumber: ghinNum.trim(),
        handicapIndex: result.handicapIndex,
        lastRevised: result.lastRevised,
      });
    } catch (e: unknown) {
      Alert.alert('GHIN Fetch Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setFetching((f) => ({ ...f, [name]: false }));
    }
  }, [players, savePlayer]);

  const handleManualHandicap = useCallback(async (name: string, value: string) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    await savePlayer(name, { handicapIndex: parsed });
  }, [savePlayer]);

  const handleGHINNumberChange = useCallback(async (name: string, value: string) => {
    setEditing((e) => ({ ...e, [name]: value }));
    await savePlayer(name, { ghinNumber: value });
  }, [savePlayer]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.note}>
        Enter each player's GHIN number and tap Fetch, or type their handicap index manually.
      </Text>

      {['A', 'B'].map((team) => {
        const members = team === 'A' ? TEAM_A : PLAYERS.filter((p) => !TEAM_A.includes(p));
        return (
          <View key={team} style={styles.teamCard}>
            <Text style={styles.teamHeader}>Team {team}</Text>
            {members.map((name) => {
              const pd = players[name];
              const isFetching = fetching[name] ?? false;
              const ghinVal = editing[name] ?? pd?.ghinNumber ?? '';
              const hcpRaw = pd?.handicapIndex;
              const hcpDisplay = hcpRaw !== null && hcpRaw !== undefined ? String(hcpRaw) : '';

              return (
                <View key={name} style={styles.playerRow}>
                  <Text style={styles.playerName}>{name}</Text>

                  <View style={styles.inputs}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>GHIN #</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="1234567"
                        keyboardType="number-pad"
                        value={ghinVal}
                        onChangeText={(v) => handleGHINNumberChange(name, v)}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>HCP Index</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="–"
                        keyboardType="decimal-pad"
                        value={hcpDisplay}
                        onChangeText={(v) =>
                          setEditing((e) => ({ ...e, [`${name}_hcp`]: v }))
                        }
                        onEndEditing={(e) =>
                          handleManualHandicap(name, e.nativeEvent.text)
                        }
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.fetchBtn, isFetching && styles.fetchBtnDisabled]}
                      onPress={() => handleGHINFetch(name)}
                      disabled={isFetching}
                    >
                      {isFetching ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.fetchBtnText}>Fetch</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {pd?.lastRevised ? (
                    <Text style={styles.revised}>Updated {pd.lastRevised}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  content: { padding: 16, paddingBottom: 32 },
  note: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  teamCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...Shadow,
  },
  teamHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.navy,
    marginBottom: 12,
  },
  playerRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 8,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  inputs: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputGroup: { flex: 1 },
  label: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 3,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: Colors.offWhite,
    color: Colors.textPrimary,
  },
  fetchBtn: {
    backgroundColor: Colors.blue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  fetchBtnDisabled: { opacity: 0.5 },
  fetchBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  revised: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
