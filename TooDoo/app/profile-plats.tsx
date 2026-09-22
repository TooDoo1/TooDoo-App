import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ProfileScreenShell, profileCardShadow } from '@/components/profile/profile-screen-shell';
import { useThemePreference } from '@/context/theme-preference-context';
import {
  addCustomLocation,
  loadCustomLocationsState,
  MAX_CUSTOM_LOCATIONS,
  removeCustomLocation,
  setActiveCustomLocationId,
  type CustomLocation,
} from '@/lib/custom-locations';
import { geocodeAddressCached, isPlausibleSwedenCoordinate } from '@/lib/geo';
import { showAlert } from '@/lib/show-alert';
import { uiTheme } from '@/lib/ui-theme';

export default function ProfilePlatsScreen() {
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const boxShadowStyle = profileCardShadow(theme);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [locations, setLocations] = useState<CustomLocation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');

  const refresh = useCallback(async () => {
    const state = await loadCustomLocationsState();
    setLocations(state.locations);
    setActiveId(state.activeId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        await refresh();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleUseDevice = async () => {
    const state = await setActiveCustomLocationId(null);
    setLocations(state.locations);
    setActiveId(state.activeId);
  };

  const handleSelect = async (id: string) => {
    const state = await setActiveCustomLocationId(id);
    setLocations(state.locations);
    setActiveId(state.activeId);
  };

  const handleRemove = async (id: string) => {
    const state = await removeCustomLocation(id);
    setLocations(state.locations);
    setActiveId(state.activeId);
  };

  const handleAdd = async () => {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      showAlert('Adress saknas', 'Skriv en adress eller ort att spara.');
      return;
    }
    if (locations.length >= MAX_CUSTOM_LOCATIONS) {
      showAlert(
        'Max antal platser',
        `Du kan spara högst ${MAX_CUSTOM_LOCATIONS} platser.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const coords = await geocodeAddressCached(trimmedAddress);
      if (
        !coords ||
        !isPlausibleSwedenCoordinate(coords.lat, coords.lng)
      ) {
        showAlert(
          'Kunde inte hitta platsen',
          'Kontrollera adressen och försök igen.'
        );
        return;
      }
      const result = await addCustomLocation({
        label: label.trim() || trimmedAddress,
        address: trimmedAddress,
        lat: coords.lat,
        lng: coords.lng,
      });
      if (result.error) {
        showAlert('Kunde inte spara', result.error);
        return;
      }
      setLocations(result.state.locations);
      setActiveId(result.state.activeId);
      setLabel('');
      setAddress('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ProfileScreenShell title="Plats">
      {isLoading ? (
        <View className="items-center py-8">
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <>
          <View
            className="rounded-2xl px-4 py-4"
            style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
          >
            <Text className="text-base font-semibold" style={{ color: theme.text }}>
              Aktiv plats
            </Text>
            <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
              Välj en sparad plats eller enhetens GPS för avstånd och vägvisning.
            </Text>

            <Pressable
              onPress={() => void handleUseDevice()}
              className="mt-4 flex-row items-center rounded-xl px-3 py-3"
              style={{
                backgroundColor:
                  activeId == null ? theme.cardBgMuted : 'transparent',
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Ionicons
                name={activeId == null ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={activeId == null ? theme.primary : theme.textMuted}
              />
              <View className="ml-3 flex-1">
                <Text style={{ color: theme.text, fontWeight: '600' }}>
                  Enhetens plats
                </Text>
                <Text className="mt-0.5 text-sm" style={{ color: theme.textMuted }}>
                  Använd GPS om du delar din position
                </Text>
              </View>
            </Pressable>

            {locations.map((item) => {
              const selected = activeId === item.id;
              return (
                <View
                  key={item.id}
                  className="mt-2 flex-row items-center rounded-xl px-3 py-3"
                  style={{
                    backgroundColor: selected ? theme.cardBgMuted : 'transparent',
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Pressable
                    onPress={() => void handleSelect(item.id)}
                    className="flex-1 flex-row items-center"
                    accessibilityRole="button"
                    accessibilityLabel={`Välj ${item.label}`}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? theme.primary : theme.textMuted}
                    />
                    <View className="ml-3 flex-1 pr-2">
                      <Text style={{ color: theme.text, fontWeight: '600' }}>
                        {item.label}
                      </Text>
                      {item.address ? (
                        <Text
                          className="mt-0.5 text-sm"
                          style={{ color: theme.textMuted }}
                          numberOfLines={2}
                        >
                          {item.address}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleRemove(item.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Ta bort ${item.label}`}
                    className="h-9 w-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: theme.cardBgMuted }}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
                  </Pressable>
                </View>
              );
            })}

            {locations.length === 0 ? (
              <Text className="mt-3 text-sm" style={{ color: theme.textMuted }}>
                Inga sparade platser ännu.
              </Text>
            ) : null}
          </View>

          <View
            className="mt-4 rounded-2xl px-4 py-5"
            style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}
          >
            <Text className="text-base font-semibold" style={{ color: theme.text }}>
              Lägg till plats
            </Text>
            <Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
              {locations.length}/{MAX_CUSTOM_LOCATIONS} sparade
            </Text>

            <Text className="mt-4 mb-1 text-sm" style={{ color: theme.textMuted }}>
              Namn
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="T.ex. Hem, Jobb"
              placeholderTextColor={theme.textFaint}
              style={{
                color: theme.text,
                backgroundColor: theme.cardBgMuted,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
              }}
            />

            <Text className="mt-3 mb-1 text-sm" style={{ color: theme.textMuted }}>
              Adress eller ort
            </Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="T.ex. Drottninggatan 1, Helsingborg"
              placeholderTextColor={theme.textFaint}
              autoCorrect={false}
              style={{
                color: theme.text,
                backgroundColor: theme.cardBgMuted,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
              }}
            />

            <Pressable
              onPress={() => void handleAdd()}
              disabled={isSaving || locations.length >= MAX_CUSTOM_LOCATIONS}
              className="mt-4 rounded-2xl px-4 py-3"
              style={{
                backgroundColor:
                  isSaving || locations.length >= MAX_CUSTOM_LOCATIONS
                    ? 'rgba(255,59,48,0.45)'
                    : '#ff3b30',
              }}
            >
              {isSaving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text
                  className="text-center font-medium"
                  style={{ color: '#ffffff' }}
                >
                  Spara plats
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </ProfileScreenShell>
  );
}
