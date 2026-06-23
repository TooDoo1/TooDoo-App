import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemePreference } from '@/context/theme-preference-context';
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from '@/lib/legal-documents';
import { uiTheme } from '@/lib/ui-theme';

type LegalConsentOverlayProps = {
  onAccept: () => void;
};

function LegalDocumentModal({
  documentKey,
  onClose,
}: {
  documentKey: LegalDocumentKey;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const document = LEGAL_DOCUMENTS[documentKey];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Stäng" />
        <View
          style={[
            styles.documentSheet,
            {
              marginTop: insets.top + 24,
              marginBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.documentHeader}>
            <Text style={styles.documentTitle}>{document.title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stäng"
              onPress={onClose}
              hitSlop={12}
              style={styles.documentCloseButton}
            >
              <Ionicons name="close" size={22} color="#131720" />
            </Pressable>
          </View>
          <ScrollView
            style={styles.documentScroll}
            contentContainerStyle={styles.documentScrollContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.documentBody}>{document.body}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function LegalConsentOverlay({ onAccept }: LegalConsentOverlayProps) {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const insets = useSafeAreaInsets();
  const [hasAccepted, setHasAccepted] = useState(false);
  const [openDocument, setOpenDocument] = useState<LegalDocumentKey | null>(null);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.screenBg }]}
      accessibilityViewIsModal
    >
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.cardBg,
            borderColor: theme.border,
            marginTop: insets.top + 24,
            marginBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: theme.cardBgMuted }]}>
            <Ionicons name="document-text-outline" size={28} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Villkor och integritet</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Läs våra villkor och integritetspolicy innan du fortsätter.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpenDocument('terms')}
            style={({ pressed }) => [
              styles.viewButton,
              {
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                borderColor: theme.border,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Ionicons name="document-outline" size={18} color={theme.text} />
            <Text style={[styles.viewButtonText, { color: theme.text }]}>Visa användarvillkor</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setOpenDocument('privacy')}
            style={({ pressed }) => [
              styles.viewButton,
              {
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                borderColor: theme.border,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.text} />
            <Text style={[styles.viewButtonText, { color: theme.text }]}>Visa integritetspolicy</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: hasAccepted }}
          onPress={() => setHasAccepted((value) => !value)}
          style={styles.checkboxRow}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: hasAccepted ? theme.primary : theme.border,
                backgroundColor: hasAccepted ? theme.primary : 'transparent',
              },
            ]}
          >
            {hasAccepted ? <Ionicons name="checkmark" size={16} color={theme.isDark ? '#ffffff' : '#131720'} /> : null}
          </View>
          <Text style={[styles.checkboxLabel, { color: theme.text }]}>
            Jag godkänner integritetspolicyn och användarvillkoren
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasAccepted }}
          disabled={!hasAccepted}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.acceptButton,
            {
              backgroundColor: theme.primary,
              opacity: !hasAccepted ? 0.45 : pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={[styles.acceptButtonText, { color: theme.isDark ? '#ffffff' : '#131720' }]}>
            Fortsätt
          </Text>
        </Pressable>
      </View>

      {openDocument ? (
        <LegalDocumentModal documentKey={openDocument} onClose={() => setOpenDocument(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 550,
    elevation: 550,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
  },
  viewButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  acceptButton: {
    marginHorizontal: 24,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  documentSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  documentTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#131720',
    paddingRight: 12,
  },
  documentCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  documentScroll: {
    flexGrow: 0,
  },
  documentScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 28,
  },
  documentBody: {
    fontSize: 15,
    lineHeight: 24,
    color: '#131720',
  },
});
