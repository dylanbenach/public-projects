import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { PLAYERS } from '../config/gameConfig';
import { Colors, Shadow, Typography } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
// 2-column grid: 16 padding each side + 14 gap
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 14) / 2;

// Subtle alternating rotations for polaroid feel
const ROTATIONS = [-1.5, 1.2, -0.8, 1.6];

type GalleryPhoto = {
  id: string;
  url: string;
  uploaderName: string;
  caption: string;
  createdAt: Timestamp | null;
};

export default function GalleryScreen() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Name picker modal state
  const [showNamePicker, setShowNamePicker] = useState(false);

  // Full-screen photo viewer state
  const [viewingPhoto, setViewingPhoto] = useState<GalleryPhoto | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'gallery'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const items: GalleryPhoto[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<GalleryPhoto, 'id'>;
        items.push({ id: d.id, ...data });
      });
      setPhotos(items);
    });
  }, []);

  const handleFabPress = useCallback(() => {
    setShowNamePicker(true);
  }, []);

  const handleSelectPlayer = useCallback(async (playerName: string) => {
    setShowNamePicker(false);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload pictures.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const timestamp = Date.now();
      const storageRef = ref(storage, `gallery/${timestamp}_${playerName}.jpg`);
      const uploadTask = uploadBytesResumable(storageRef, blob);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = snapshot.bytesTransferred / snapshot.totalBytes;
            setUploadProgress(progress);
          },
          reject,
          resolve,
        );
      });

      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'gallery'), {
        url,
        uploaderName: playerName,
        caption: '',
        createdAt: serverTimestamp(),
      });
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Check your Firebase Storage is enabled.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, []);

  const handlePhotoPress = useCallback((photo: GalleryPhoto) => {
    setViewingPhoto(photo);
    setEditCaption(photo.caption);
  }, []);

  const handlePhotoLongPress = useCallback((photo: GalleryPhoto) => {
    const doDelete = async () => {
      try {
        const photoRef = ref(storage, photo.url);
        await deleteObject(photoRef);
      } catch {
        // Storage delete failure is non-fatal (file might already be gone)
      }
      try {
        await deleteDoc(doc(db, 'gallery', photo.id));
      } catch {
        if (Platform.OS === 'web') {
          window.alert('Could not delete photo from database.');
        } else {
          Alert.alert('Error', 'Could not delete photo from database.');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete this photo by ${photo.uploaderName}?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Photo',
        `Remove this photo by ${photo.uploaderName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  }, []);

  const handleSaveCaption = useCallback(async () => {
    if (!viewingPhoto) return;
    setSavingCaption(true);
    try {
      await updateDoc(doc(db, 'gallery', viewingPhoto.id), { caption: editCaption });
      setViewingPhoto((prev) => prev ? { ...prev, caption: editCaption } : prev);
    } catch {
      Alert.alert('Error', 'Could not save caption.');
    } finally {
      setSavingCaption(false);
    }
  }, [viewingPhoto, editCaption]);

  const formatDate = (ts: Timestamp | null): string => {
    if (!ts) return '';
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderItem = useCallback(({ item, index }: { item: GalleryPhoto; index: number }) => {
    const rotation = ROTATIONS[index % ROTATIONS.length];
    return (
      <TouchableOpacity
        style={[styles.polaroid, { transform: [{ rotate: `${rotation}deg` }] }]}
        onPress={() => handlePhotoPress(item)}
        activeOpacity={0.9}
      >
        {/* Photo */}
        <Image source={{ uri: item.url }} style={styles.polaroidImage} />
        {/* Caption */}
        <Text style={styles.polaroidCaption} numberOfLines={2}>
          {item.caption || ' '}
        </Text>
        {/* Uploader */}
        <Text style={styles.polaroidUploader}>BY {item.uploaderName.toUpperCase()}</Text>
        {/* Delete X */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handlePhotoLongPress(item)}
          hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [handlePhotoPress, handlePhotoLongPress]);

  const keyExtractor = (item: GalleryPhoto) => item.id;

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        style={styles.grid}
        contentContainerStyle={photos.length === 0 ? styles.emptyContainer : styles.gridContent}
        columnWrapperStyle={styles.columnWrapper}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.headerTitle}>The Album</Text>
            <Text style={styles.headerSubtitle}>
              {photos.length} picture{photos.length !== 1 ? 's' : ''} · this year so far
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No photos yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add the first shot</Text>
          </View>
        }
      />

      {/* FAB or upload progress */}
      {uploading ? (
        <View style={styles.fab}>
          <ActivityIndicator size="small" color={Colors.paper} />
          <Text style={styles.fabProgressText}>{Math.round(uploadProgress * 100)}%</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.fab} onPress={handleFabPress} activeOpacity={0.85}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Name picker modal */}
      <Modal
        visible={showNamePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNamePicker(false)}
      >
        <View style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowNamePicker(false)} style={styles.pickerCancel}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Who's uploading?</Text>
            <View style={styles.pickerHeaderSpacer} />
          </View>
          <ScrollView contentContainerStyle={styles.pickerList}>
            {PLAYERS.map((player) => (
              <TouchableOpacity
                key={player}
                style={styles.pickerItem}
                onPress={() => handleSelectPlayer(player)}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerItemText}>{player}</Text>
                <Text style={styles.pickerChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Full-screen photo viewer */}
      {viewingPhoto && (
        <Modal
          visible
          animationType="fade"
          onRequestClose={() => setViewingPhoto(null)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.viewer}>
              <TouchableWithoutFeedback onPress={() => setViewingPhoto(null)}>
                <View style={styles.viewerBackdrop} />
              </TouchableWithoutFeedback>

              <View style={styles.viewerCard}>
                <TouchableOpacity style={styles.viewerClose} onPress={() => setViewingPhoto(null)}>
                  <Text style={styles.viewerCloseText}>✕</Text>
                </TouchableOpacity>

                <Image
                  source={{ uri: viewingPhoto.url }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                />

                <View style={styles.viewerMeta}>
                  <Text style={styles.viewerUploader}>by {viewingPhoto.uploaderName}</Text>
                  <Text style={styles.viewerDate}>{formatDate(viewingPhoto.createdAt)}</Text>
                </View>

                <View style={styles.captionRow}>
                  <TextInput
                    style={styles.captionInput}
                    placeholder="Add a caption…"
                    value={editCaption}
                    onChangeText={setEditCaption}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={styles.captionSaveBtn}
                    onPress={handleSaveCaption}
                    disabled={savingCaption}
                  >
                    {savingCaption ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.captionSaveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },

  // ── List header
  listHeader: {
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

  // ── Grid
  grid: { flex: 1 },
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: 14,
    marginBottom: 14,
  },
  emptyContainer: { flex: 1 },

  // ── Polaroid card
  polaroid: {
    width: CARD_WIDTH,
    backgroundColor: Colors.cardBg,
    padding: 10,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: Colors.rule,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  polaroidImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: Colors.paperDeep,
  },
  polaroidCaption: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 11,
    color: Colors.ink,
    textAlign: 'center',
    marginTop: 8,
    minHeight: 14,
  },
  polaroidUploader: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 9,
    color: Colors.mute,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  deleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.brick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    lineHeight: 12,
  },

  // ── Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 22,
    color: Colors.inkSoft,
  },
  emptySubtext: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.mute,
    marginTop: 8,
  },

  // ── FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.brass,
    borderWidth: 2,
    borderColor: Colors.brassDeep,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    gap: 2,
  },
  fabText: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 28,
    color: Colors.paper,
    lineHeight: 32,
  },
  fabProgressText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
    color: Colors.paper,
    letterSpacing: 0.5,
  },

  // ── Name picker
  pickerModal: { flex: 1, backgroundColor: Colors.paper },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.ink,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerTitle: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 22,
    color: Colors.white,
  },
  pickerCancel: { padding: 4 },
  pickerCancelText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: Colors.brass,
  },
  pickerHeaderSpacer: { width: 60 },
  pickerList: { paddingVertical: 8 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ruleSoft,
  },
  pickerItemText: {
    fontFamily: 'DMSerifDisplay_400Regular',
    fontSize: 20,
    color: Colors.ink,
  },
  pickerChevron: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 20,
    color: Colors.mute,
  },

  // ── Viewer
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerBackdrop: { ...StyleSheet.absoluteFillObject },
  viewerCard: {
    marginHorizontal: 0,
    backgroundColor: '#111',
    borderRadius: 0,
    overflow: 'hidden',
  },
  viewerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 16,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseText: { color: Colors.white, fontSize: 16, fontFamily: 'Manrope_700Bold' },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  viewerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
  },
  viewerUploader: {
    fontFamily: 'DMSerifDisplay_400Regular_Italic',
    fontSize: 14,
    color: Colors.brass,
  },
  viewerDate: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    color: Colors.mute,
    letterSpacing: 0.5,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    gap: 8,
  },
  captionInput: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
    color: Colors.white,
    minHeight: 44,
  },
  captionSaveBtn: {
    backgroundColor: Colors.brass,
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  captionSaveText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: Colors.white,
  },
});
