import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { PLAYERS, TEAM_A, TEAM_B, TEAM_A_NAME, TEAM_B_NAME } from '../config/gameConfig';
import { Colors, Shadow, Typography } from '../theme';

const CARD_WIDTH = (Dimensions.get('window').width - 48) / 2;

type PlayerBio = {
  photoURL?: string;
  homeCourse?: string;
  funFacts?: string;  // free-text, e.g. "Longest drive: 285yds\nFav club: 7-iron"
  handicapIndex?: number;
  ghinNumber?: string;
};

type BiosMap = Record<string, PlayerBio>;

export default function BiosScreen() {
  const [bios, setBios] = useState<BiosMap>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'players'), (snap) => {
      const map: BiosMap = {};
      snap.forEach((d) => { map[d.id] = d.data() as PlayerBio; });
      setBios(map);
    });
  }, []);

  const saveBio = useCallback(async (name: string, data: Partial<PlayerBio>) => {
    await setDoc(doc(db, 'players', name), data, { merge: true });
  }, []);

  const pickAndUploadPhoto = useCallback(async (name: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `player-photos/${name}`);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, resolve);
      });

      const url = await getDownloadURL(storageRef);
      await saveBio(name, { photoURL: url });
    } catch (e) {
      Alert.alert('Upload failed', 'Could not upload photo. Check your Firebase Storage is enabled.');
    } finally {
      setUploading(false);
    }
  }, [saveBio]);

  const selectedBio = selected ? (bios[selected] ?? {}) : null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>The Members</Text>
          <Text style={styles.headerSubtitle}>Twelve gentlemen, in good standing</Text>
        </View>

        {/* Team header row */}
        <View style={styles.teamHeaderRow}>
          <Text style={styles.teamLabel}>{TEAM_A_NAME}</Text>
          <Text style={styles.vsText}>vs.</Text>
          <Text style={styles.teamLabel}>{TEAM_B_NAME}</Text>
        </View>

        {/* Two-column player grid */}
        <View style={styles.teamsRow}>
          <View style={styles.teamColumn}>
            {TEAM_A.map((name) => (
              <PlayerCard
                key={name}
                name={name}
                bio={bios[name] ?? {}}
                onPress={() => setSelected(name)}
                fullWidth
              />
            ))}
          </View>

          <View style={styles.columnDivider} />

          <View style={styles.teamColumn}>
            {TEAM_B.map((name) => (
              <PlayerCard
                key={name}
                name={name}
                bio={bios[name] ?? {}}
                onPress={() => setSelected(name)}
                fullWidth
              />
            ))}
          </View>
        </View>

      </ScrollView>

      {/* Edit modal */}
      {selected && selectedBio !== null && (
        <EditModal
          name={selected}
          bio={selectedBio}
          uploading={uploading}
          onSave={(data) => saveBio(selected, data)}
          onPickPhoto={() => pickAndUploadPhoto(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

// ─── Player initials ──────────────────────────────────────────────────────────

// Replace these with your players' actual initials, keyed by the name strings in gameConfig.ts.
// If a player is not listed here, the app falls back to the first two characters of their name.
const PLAYER_INITIALS: Record<string, string> = {
  'Player 1A': 'P1',
  'Player 2A': 'P2',
  'Player 3A': 'P3',
  'Player 4A': 'P4',
  'Player 5A': 'P5',
  'Player 6A': 'P6',
  'Player 1B': 'P1',
  'Player 2B': 'P2',
  'Player 3B': 'P3',
  'Player 4B': 'P4',
  'Player 5B': 'P5',
  'Player 6B': 'P6',
};

function getInitials(name: string): string {
  return PLAYER_INITIALS[name] ?? name.slice(0, 2).toUpperCase();
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({ name, bio, onPress, fullWidth = false }: { name: string; bio: PlayerBio; onPress: () => void; fullWidth?: boolean }) {
  const isTeamA = TEAM_A.includes(name);
  const initials = getInitials(name);

  return (
    <TouchableOpacity style={[styles.card, fullWidth && styles.cardFullWidth]} onPress={onPress} activeOpacity={0.85}>
      {/* Portrait oval */}
      {bio.photoURL ? (
        <Image source={{ uri: bio.photoURL }} style={styles.portrait} />
      ) : (
        <View style={[styles.portrait, isTeamA ? styles.portraitTeamA : styles.portraitTeamB]}>
          <Text style={[styles.initials, isTeamA ? styles.initialsTeamA : styles.initialsTeamB]}>
            {initials}
          </Text>
        </View>
      )}

      {/* Name */}
      <Text style={styles.cardName} numberOfLines={1}>{name}</Text>

      {/* Home course */}
      {bio.homeCourse ? (
        <Text style={styles.cardCourse} numberOfLines={1}>{bio.homeCourse}</Text>
      ) : (
        <Text style={styles.cardCourseEmpty}>—</Text>
      )}

      {/* HCP badge */}
      {bio.handicapIndex !== undefined && (
        <View style={styles.hcpBadge}>
          <Text style={styles.hcpBadgeText}>HCP {bio.handicapIndex}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

type EditModalProps = {
  name: string;
  bio: PlayerBio;
  uploading: boolean;
  onSave: (data: Partial<PlayerBio>) => Promise<void>;
  onPickPhoto: () => void;
  onClose: () => void;
};

function EditModal({ name, bio, uploading, onSave, onPickPhoto, onClose }: EditModalProps) {
  const [homeCourse, setHomeCourse] = useState(bio.homeCourse ?? '');
  const [funFacts, setFunFacts] = useState(bio.funFacts ?? '');
  const [ghinNumber, setGhinNumber] = useState(bio.ghinNumber ?? '');
  const [handicapIndex, setHandicapIndex] = useState(
    bio.handicapIndex !== undefined ? String(bio.handicapIndex) : '',
  );
  const [saving, setSaving] = useState(false);
  const isTeamA = TEAM_A.includes(name);
  const teamName = isTeamA ? TEAM_A_NAME : TEAM_B_NAME;
  const initials = getInitials(name);

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedHcp = parseFloat(handicapIndex);
      await onSave({
        homeCourse,
        funFacts,
        ghinNumber: ghinNumber || undefined,
        handicapIndex: isNaN(parsedHcp) ? undefined : parsedHcp,
      });
      onClose();
    } catch {
      Alert.alert('Error', 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{name}</Text>
            <TouchableOpacity onPress={handleSave} style={styles.modalSaveBtn} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Photo */}
            <View style={styles.photoSection}>
              {bio.photoURL ? (
                <Image source={{ uri: bio.photoURL }} style={styles.modalAvatar} />
              ) : (
                <View style={[styles.modalAvatar, isTeamA ? styles.portraitTeamA : styles.portraitTeamB, styles.modalAvatarPlaceholder]}>
                  <Text style={[styles.initialsLarge, isTeamA ? styles.initialsTeamA : styles.initialsTeamB]}>{initials}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.changePhotoBtn}
                onPress={onPickPhoto}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.brass} />
                ) : (
                  <Text style={styles.changePhotoText}>
                    {bio.photoURL ? 'Change Photo' : 'Add Photo'}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={[styles.teamBadgeLarge, isTeamA ? styles.teamBadgeA : styles.teamBadgeB]}>
                <Text style={styles.teamBadgeLargeText}>{teamName}</Text>
              </View>
            </View>

            {/* Fields */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>GHIN Number</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 1234567"
                value={ghinNumber}
                onChangeText={setGhinNumber}
                keyboardType="number-pad"
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>HCP Index</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 12.4"
                value={handicapIndex}
                onChangeText={setHandicapIndex}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Home Course</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. Augusta National"
                value={homeCourse}
                onChangeText={setHomeCourse}
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Fun Stats & Facts</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti]}
                placeholder={'e.g. Longest drive: 285 yds\nFav club: 7-iron\nBest round: 78'}
                value={funFacts}
                onChangeText={setFunFacts}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              <Text style={styles.fieldHint}>One fact per line.</Text>
            </View>

            {/* Fun facts display preview */}
            {funFacts.trim().length > 0 && (
              <View style={styles.factsPreview}>
                {funFacts.trim().split('\n').filter(Boolean).map((fact, i) => (
                  <View key={i} style={styles.factRow}>
                    <Text style={styles.factBullet}>·</Text>
                    <Text style={styles.factText}>{fact}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  scrollContent: { paddingBottom: 32 },

  // ── Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    marginBottom: 16,
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

  // ── Two-column team layout
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  teamLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.brassDeep,
    flex: 1,
    textAlign: 'center',
  },
  vsText: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 18,
    color: Colors.mute,
    marginHorizontal: 8,
  },
  teamsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 24,
    alignItems: 'flex-start',
  },
  teamColumn: {
    flex: 1,
  },
  columnDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.rule,
    marginHorizontal: 6,
  },

  // ── Player card
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.rule,
    borderRadius: 4,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  cardFullWidth: {
    width: undefined,
    alignSelf: 'stretch',
  },

  // Portrait oval
  portrait: {
    width: 76,
    height: 92,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: Colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  portraitTeamA: { backgroundColor: Colors.ink },
  portraitTeamB: { backgroundColor: Colors.brick },

  initials: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 30,
  },
  initialsTeamA: { color: Colors.brass },
  initialsTeamB: { color: '#f5cfb6' },

  // Card text
  cardName: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 18,
    color: Colors.ink,
    textAlign: 'center',
  },
  cardCourse: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 12,
    color: Colors.mute,
    marginTop: 2,
    textAlign: 'center',
  },
  cardCourseEmpty: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 12,
    color: Colors.rule,
    marginTop: 2,
  },

  // HCP badge
  hcpBadge: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.brass,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'transparent',
  },
  hcpBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.brassDeep,
    textTransform: 'uppercase',
  },

  // ── Modal
  modalContainer: { flex: 1, backgroundColor: Colors.paper },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 14 : 14,
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

  photoSection: { alignItems: 'center', marginBottom: 28 },
  modalAvatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 12 },
  modalAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsLarge: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 36,
  },
  changePhotoBtn: {
    borderWidth: 1,
    borderColor: Colors.brass,
    borderRadius: 2,
    paddingHorizontal: 18,
    paddingVertical: 7,
    marginBottom: 10,
  },
  changePhotoText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: Colors.brassDeep,
  },
  teamBadgeLarge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 2,
  },
  teamBadgeA: { backgroundColor: Colors.ink },
  teamBadgeB: { backgroundColor: Colors.brick },
  teamBadgeLargeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.white,
    textTransform: 'uppercase',
  },

  fieldGroup: { marginBottom: 20 },
  fieldLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: Colors.brassDeep,
    textTransform: 'uppercase',
    marginBottom: 6,
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
  fieldInputMulti: { minHeight: 110, paddingTop: 11 },
  fieldHint: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 10,
    color: Colors.mute,
    marginTop: 5,
    letterSpacing: 0.5,
  },

  factsPreview: {
    backgroundColor: Colors.cardBg,
    borderRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  factBullet: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 16,
    color: Colors.brass,
    marginRight: 8,
    marginTop: 1,
  },
  factText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    flex: 1,
    color: Colors.ink,
  },
});
