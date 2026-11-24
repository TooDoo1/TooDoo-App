import {
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/auth-context";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { apiUrl } from "@/lib/api";
import {
  geocodeAddressCached,
  hasForegroundLocationPermission,
  isPlausibleSwedenCoordinate,
  peekGeocodeCache,
  resolveUserCityFromDevice,
  type Coords,
} from "@/lib/geo";
import { useThemePreference } from "@/context/theme-preference-context";
import { getCategoryAccentColor, getOnAccentTextColor } from "@/lib/category-colors";
import { setRegionSelection } from "@/lib/region-selection";
import { staticCoordsForCity } from "@/lib/sweden-city-coords";
import {
  findLanByName,
  findLanForCity,
  geocodeQueryForCity,
  SWEDEN_REGIONS,
} from "@/lib/sweden-regions";
import { uiTheme } from "@/lib/ui-theme";
import { RegistrationScreenShell } from "@/components/registration-screen-shell";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatBirthDateDisplay, WebBirthDateWheelPicker } from "@/components/ui/wheel-picker";

type FormStep = 'name' | 'birthday' | 'location' | 'gender' | 'interests';

function buildFormSteps(skipLocation: boolean): FormStep[] {
  return skipLocation
    ? ['name', 'birthday', 'gender', 'interests']
    : ['name', 'birthday', 'location', 'gender', 'interests'];
}

async function persistDetectedRegion(cityName: string, coords: Coords): Promise<string | null> {
  const matchedLan = findLanForCity(cityName);
  const lan = matchedLan?.name ?? cityName;
  const city = matchedLan
    ? (matchedLan.cities.find(
        (item) => item.toLocaleLowerCase('sv-SE') === cityName.trim().toLocaleLowerCase('sv-SE')
      ) ?? cityName)
    : cityName;
  try {
    await setRegionSelection({ lan, city, lat: coords.lat, lng: coords.lng });
    return matchedLan ? lan : null;
  } catch {
    return null;
  }
}

export default function PersonalityScreen() {
  const router = useRouter();
  const { pendingRegistration, clearPendingRegistration, signIn } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const accentColor = theme.danger;
  const [claimedCount, setClaimedCount] = useState(1);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [draftBirthDate, setDraftBirthDate] = useState<Date>(() => new Date(2000, 0, 1));
  const draftBirthDateRef = useRef(draftBirthDate);
  draftBirthDateRef.current = draftBirthDate;
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [selectedGender, setSelectedGender] = useState<'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id?: string; name: string }>>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [selectedLan, setSelectedLan] = useState<string | null>(null);
  const [locationPickerLan, setLocationPickerLan] = useState<string | null>(null);
  const [locationPicking, setLocationPicking] = useState(false);
  const [skipLocationStep, setSkipLocationStep] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const formSteps = buildFormSteps(skipLocationStep);
  const totalCount = formSteps.length + 1;
  const currentFormStep = claimedCount <= formSteps.length ? formSteps[claimedCount - 1] : null;
  const isSuccessStep = claimedCount > formSteps.length;
  const progressPercent = totalCount > 0 ? Math.min((claimedCount / totalCount) * 100, 100) : 0;
  const lastPendingEmailRef = useRef<string | null>(null);

  useEffect(() => {
    const nextEmail = pendingRegistration?.email ?? null;
    if (!nextEmail) return;
    if (lastPendingEmailRef.current === nextEmail) return;
    lastPendingEmailRef.current = nextEmail;

    // Start fresh when a new registration begins (the screen may still be mounted).
    setClaimedCount(1);
    setIsSubmittingCreate(false);
    setFirstName('');
    setLastName('');
    setBirthDate(null);
    setDraftBirthDate(new Date(2000, 0, 1));
    setIsDatePickerVisible(false);
    setSelectedGender(null);
    setSelectedCategoryIds([]);
    setCity('');
    setSelectedLan(null);
    setLocationPickerLan(null);
    setLocationPicking(false);
    setSkipLocationStep(false);
    setIsResolvingLocation(false);

    let cancelled = false;
    void (async () => {
      const result = await resolveUserCityFromDevice({ requestPermission: false });
      if (cancelled) return;

      const resolvedCity = result?.city?.trim();
      if (resolvedCity && result?.coords) {
        const lan = await persistDetectedRegion(resolvedCity, result.coords);
        if (cancelled) return;
        setCity(resolvedCity);
        if (lan) setSelectedLan(lan);
        setSkipLocationStep(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingRegistration?.email]);

  useEffect(() => {
    if (currentFormStep !== 'location') return;

    let cancelled = false;

    const autoDetectLocation = async () => {
      if (Platform.OS === 'web') {
        return;
      }

      setIsResolvingLocation(true);
      try {
        if (await hasForegroundLocationPermission()) {
          const result = await resolveUserCityFromDevice({ requestPermission: false });
          if (!cancelled && result?.city && result.coords) {
            const lan = await persistDetectedRegion(result.city, result.coords);
            if (cancelled) return;
            setCity(result.city);
            if (lan) setSelectedLan(lan);
          }
        }
      } finally {
        if (!cancelled) {
          setIsResolvingLocation(false);
        }
      }
    };

    void autoDetectLocation();

    return () => {
      cancelled = true;
    };
  }, [currentFormStep, pendingRegistration?.email]);

  const birthDateToIsoDateTime = (date: Date) => {
    // Backend expects date-time; keep the chosen calendar date stable across timezones.
    const yyyy = date.getFullYear();
    const mm = date.getMonth();
    const dd = date.getDate();
    return new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0, 0)).toISOString();
  };

  const openBirthDatePicker = () => {
    const initialValue = birthDate ?? new Date(2000, 0, 1);
    setDraftBirthDate(initialValue);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialValue,
        mode: 'date',
        is24Hour: true,
        maximumDate: new Date(),
        onChange: (event, selectedDate) => {
          if (event.type === 'dismissed') return;
          if (selectedDate) setBirthDate(selectedDate);
        },
      });
      return;
    }

    setIsDatePickerVisible(true);
  };

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      setIsLoadingCategories(true);
      setCategoryLoadError('');

      try {
        const response = await fetch(apiUrl('/category'));
        const data = await response.json().catch(() => []);
        const categories = Array.isArray(data)
          ? data
          : Array.isArray(data?.categories)
            ? data.categories
            : Array.isArray(data?.data)
              ? data.data
              : [];

        if (!cancelled) {
          setCategoryOptions(
            categories
              .map((item: { id?: string; name?: string }) => ({ id: item.id, name: item.name }))
              .filter((item: { id?: string; name: string }) => Boolean(item.name))
          );
        }
      } catch {
        if (!cancelled) {
          setCategoryLoadError('Kunde inte hämta kategorier just nu.');
          setCategoryOptions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCategories(false);
        }
      }
    };

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const locationPickerCities = useMemo(() => {
    if (!locationPickerLan) return [];
    return findLanByName(locationPickerLan)?.cities ?? [];
  }, [locationPickerLan]);

  const selectRegistrationCity = async (lan: string, nextCity: string) => {
    if (locationPicking) return;

    const applyCity = async (lat: number, lng: number) => {
      setSelectedLan(lan);
      setCity(nextCity);
      // Stay on the city list so the checkmark stays visible (no separate "Byt" UI).
      setLocationPickerLan(lan);
      try {
        await setRegionSelection({ lan, city: nextCity, lat, lng });
      } catch {
        // Registration can continue with city name even if persist fails.
      }
    };

    const staticCoords = staticCoordsForCity(lan, nextCity);
    if (staticCoords) {
      await applyCity(staticCoords.lat, staticCoords.lng);
      return;
    }

    const query = geocodeQueryForCity(lan, nextCity);
    const cached = peekGeocodeCache(query);
    if (cached && isPlausibleSwedenCoordinate(cached.lat, cached.lng)) {
      await applyCity(cached.lat, cached.lng);
      return;
    }

    setLocationPicking(true);
    try {
      const coordsResult = await geocodeAddressCached(query);
      if (
        !coordsResult ||
        !isPlausibleSwedenCoordinate(coordsResult.lat, coordsResult.lng)
      ) {
        Alert.alert('Kunde inte hitta platsen', 'Försök med en annan ort.');
        return;
      }
      await applyCity(coordsResult.lat, coordsResult.lng);
    } finally {
      setLocationPicking(false);
    }
  };

  const resolveRegistrationLocation = async (): Promise<string | null> => {
    const trimmed = city.trim();
    if (trimmed) return trimmed;

    if (Platform.OS !== 'web') {
      const detected = await resolveUserCityFromDevice({ requestPermission: true });
      if (detected?.city && detected.coords) {
        const lan = await persistDetectedRegion(detected.city, detected.coords);
        setCity(detected.city);
        if (lan) setSelectedLan(lan);
        return detected.city;
      }
    }

    return null;
  };

  const genderOptions = [
    { label: 'Man', value: 'MALE' as const },
    { label: 'Kvinna', value: 'FEMALE' as const },
    { label: 'Ickebinär', value: 'NON_BINARY' as const },
    { label: 'Vill ej ange', value: 'OTHER' as const },
  ];

  return (
    <RegistrationScreenShell
      header={
        <>
          <Text className="text-3xl font-semibold" style={{ color: theme.text }}>
            Skapa konto🎉
          </Text>
          <Text className="pt-2 text-md font-semibold" style={{ color: theme.textMuted }}>
            Steg {claimedCount} av {totalCount}
          </Text>
          <View className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: theme.cardBgMuted }}>
            <View
              className="h-full rounded-full"
              style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}
            />
          </View>
        </>
      }
      footer={
        isSuccessStep ? (
          <Pressable
            className="rounded-2xl px-4 py-3"
            style={{ backgroundColor: accentColor }}
            onPress={() => router.replace('/')}
          >
            <Text className="text-center font-medium text-white">Fortsätt</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              className="rounded-2xl px-4 py-3"
              style={{ backgroundColor: accentColor }}
              onPress={async () => {
                if (currentFormStep === 'name' && (!firstName.trim() || !lastName.trim())) {
                  Alert.alert("Saknad information", "Fyll i förnamn och efternamn innan du går vidare.");
                  return;
                }
                if (currentFormStep === 'birthday' && !birthDate) {
                  Alert.alert("Saknad information", "Välj din födelsedag innan du går vidare.");
                  return;
                }
                if (currentFormStep === 'location' && !city.trim()) {
                  Alert.alert("Saknad stad", "Välj län och stad innan du går vidare.");
                  return;
                }
                if (currentFormStep === 'gender' && !selectedGender) {
                  Alert.alert("Välj ett alternativ", "Välj Man, Kvinna, Ickebinär eller Vill ej ange innan du går vidare.");
                  return;
                }
                if (currentFormStep === 'interests') {
                  if (!pendingRegistration) {
                    Alert.alert("Saknad registrering", "Fyll i registrering först innan du fortsätter.");
                    router.replace("/(tabs)/Registrering");
                    return;
                  }

                  setIsSubmittingCreate(true);
                  try {
                    const registrationLocation = await resolveRegistrationLocation();
                    if (!registrationLocation) {
                      Alert.alert(
                        'Saknad stad',
                        'Vi behöver din stad för att skapa konto. Gå tillbaka till platssteget och ange stad, eller aktivera platsåtkomst.'
                      );
                      return;
                    }

                    const response = await fetch(apiUrl('/user/register'), {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        email: pendingRegistration.email,
                        firstName: firstName.trim(),
                        lastName: lastName.trim(),
                        birthDate: birthDate ? birthDateToIsoDateTime(birthDate) : undefined,
                        gender: selectedGender,
                        password: pendingRegistration.password,
                        interests: selectedCategoryIds,
                        location: registrationLocation,
                      }),
                    });

                    const data = (await response.json().catch(() => ({}))) as {
                      error?: string;
                      details?: Array<{ field?: string; message?: string }>;
                      token?: string;
                      refreshToken?: string;
                      user?: { role?: string };
                    };

                    if (response.status === 201) {
                      let tokenToUse = data.token;
                      let refreshToUse: string | null = data.refreshToken ?? null;
                      let roleToUse: string | null = data.user?.role ?? null;

                      if (!tokenToUse) {
                        const loginResponse = await fetch(apiUrl('/user/login'), {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            email: pendingRegistration.email,
                            password: pendingRegistration.password,
                          }),
                        });

                        const loginData = (await loginResponse.json().catch(() => ({}))) as {
                          token?: string;
                          refreshToken?: string;
                          user?: { role?: string };
                        };
                        tokenToUse = loginResponse.status === 200 ? loginData.token : undefined;
                        refreshToUse = loginData.refreshToken ?? refreshToUse;
                        roleToUse = loginData.user?.role ?? roleToUse;
                      }

                      if (tokenToUse) {
                        await signIn(tokenToUse, refreshToUse, roleToUse);
                      } else {
                        Alert.alert('Konto skapat', 'Kontot skapades men automatisk inloggning misslyckades. Logga in manuellt.');
                      }

                      clearPendingRegistration();
                      setClaimedCount(totalCount);
                      return;
                    }

                    if (response.status === 409) {
                      Alert.alert('E-post upptagen', data.error ?? 'Email already exists');
                      return;
                    }

                    const validationDetail = data.details?.[0]?.message;
                    Alert.alert(
                      'Fel',
                      validationDetail
                        ? `${data.error ?? 'Kunde inte registrera just nu.'}: ${validationDetail}`
                        : data.error ?? 'Kunde inte registrera just nu.'
                    );
                    return;
                  } catch {
                    Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
                    return;
                  } finally {
                    setIsSubmittingCreate(false);
                  }
                }

                setClaimedCount((prev) => Math.min(prev + 1, totalCount));
              }}
              disabled={isSubmittingCreate}
            >
              <Text className="text-center font-medium text-white">{isSubmittingCreate ? "Skapar konto..." : "Nästa"}</Text>
            </Pressable>

            <Pressable
              className="mt-3 rounded-2xl px-4 py-3"
              onPress={() => {
                if (claimedCount >= 2) {
                  setClaimedCount((prev) => Math.max(prev - 1, 1));
                  return;
                }
                router.push("/(tabs)/Registrering");
              }}
              style={{ backgroundColor: theme.primary, borderWidth: 0 }}
            >
              <Text className="text-center font-medium" style={{ color: '#ffffff' }}>
                Tillbaka
              </Text>
            </Pressable>
          </>
        )
      }
    >
        {currentFormStep === 'name' ? (
        <View className="rounded-2xl px-4 py-5" style={{ backgroundColor: theme.cardBgMuted }}>
          <Text className="text-2xl" style={{ color: theme.text }}>Vad heter du?</Text>
          <Text className="pt-2 text-sm" style={{ color: theme.textMuted }}>
            Vi använder ditt namn i appen.
          </Text>

          <Text className="pt-4 text-lg" style={{ color: theme.text }}>Förnamn:</Text>
          <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Förnamn"
            placeholderTextColor={theme.textFaint}
                autoCapitalize="words"
            className="mt-2 rounded-2xl border px-4 py-3"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
          />
          <Text className="pt-4 text-lg" style={{ color: theme.text }}>Efternamn:</Text>
          <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Efternamn"
            placeholderTextColor={theme.textFaint}
                autoCapitalize="words"
            className="mt-2 rounded-2xl border px-4 py-3"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
          />
        </View>
        ) : null}

        {currentFormStep === 'birthday' ? (
        <View className="rounded-2xl px-4 py-5" style={{ backgroundColor: theme.cardBgMuted }}>
          <Text className="text-2xl" style={{ color: theme.text }}>När är du född?</Text>
          <Text className="pt-2 text-sm" style={{ color: theme.textMuted }}>
            Vi använder det för att anpassa din upplevelse.
          </Text>

          <Text className="pt-4 text-lg" style={{ color: theme.text }}>Födelsedag:</Text>
          <Pressable
            onPress={openBirthDatePicker}
            className="mt-2 rounded-2xl border px-4 py-3"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted }}
          >
            <Text style={{ color: birthDate ? theme.text : theme.textFaint }}>
              {birthDate ? formatBirthDateDisplay(birthDate) : 'Välj datum'}
            </Text>
          </Pressable>

          {isDatePickerVisible && Platform.OS !== 'android' ? (
            <View
              className="mt-3 overflow-hidden rounded-2xl px-2 py-2"
              style={{ borderColor: theme.border, borderWidth: 1, backgroundColor: theme.cardBgMuted }}
            >
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={draftBirthDate}
                  mode="date"
                  maximumDate={new Date()}
                  display="spinner"
                  themeVariant={theme.isDark ? 'dark' : 'light'}
                  textColor={theme.text}
                  style={{ height: 190 }}
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) setDraftBirthDate(selectedDate);
                  }}
                />
              ) : (
                <WebBirthDateWheelPicker
                  value={draftBirthDate}
                  maximumDate={new Date()}
                  theme={theme}
                  onChange={setDraftBirthDate}
                />
              )}
              <Pressable
                className="mt-2 rounded-2xl px-4 py-3"
                style={{ backgroundColor: accentColor }}
                onPress={() => {
                  // Let web wheel debounce flush so Klar doesn't keep Jan 1 2000.
                  setTimeout(() => {
                    setBirthDate(draftBirthDateRef.current);
                    setIsDatePickerVisible(false);
                  }, 120);
                }}
              >
                <Text className="text-center font-medium text-white">Klar</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        ) : null}

        {currentFormStep === 'location' ? (
        <View className="rounded-2xl px-4 py-5" style={{ backgroundColor: theme.cardBgMuted }}>
          <Text className="text-2xl" style={{ color: theme.text }}>Var befinner du dig?</Text>
          <Text className="pt-2 text-sm" style={{ color: theme.textMuted }}>
            Välj län och stad — samma som på startsidan.
          </Text>
          {isResolvingLocation && Platform.OS !== 'web' ? (
            <Text className="pt-2 text-sm" style={{ color: theme.textMuted }}>
              Hämtar din plats...
            </Text>
          ) : null}

          <View
            className="mt-4 overflow-hidden"
            style={{
              backgroundColor: 'transparent',
              maxHeight: 320,
            }}
          >
            <View className="flex-row items-center px-3 pt-3 pb-1" style={{ minHeight: 36, gap: 8 }}>
              {locationPickerLan ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tillbaka till län"
                  onPress={() => setLocationPickerLan(null)}
                  hitSlop={8}
                  style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.text} />
                </Pressable>
              ) : null}
              <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '700' }}>
                {locationPickerLan ? 'Välj stad' : 'Välj län'}
              </Text>
              {locationPicking ? (
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Hämtar...</Text>
              ) : null}
            </View>
            <ScrollView
              style={{ maxHeight: 270 }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {locationPickerLan
                ? locationPickerCities.map((item) => {
                    const selected = selectedLan === locationPickerLan && city === item;
                    return (
                      <Pressable
                        key={item}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={locationPicking}
                        onPress={() => void selectRegistrationCity(locationPickerLan, item)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 12,
                          paddingHorizontal: 2,
                          opacity: locationPicking ? 0.6 : 1,
                        }}
                      >
                        <Ionicons
                          name="location-outline"
                          size={18}
                          color={selected ? theme.primary : theme.textMuted}
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 16,
                            letterSpacing: -0.2,
                            color: selected ? theme.text : theme.textMuted,
                            fontWeight: selected ? '700' : '500',
                          }}
                        >
                          {item}
                        </Text>
                        {selected ? (
                          <Ionicons name="checkmark" size={18} color={theme.primary} />
                        ) : null}
                      </Pressable>
                    );
                  })
                : SWEDEN_REGIONS.map((lan) => {
                    const selected = selectedLan === lan.name;
                    return (
                      <Pressable
                        key={lan.name}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setLocationPickerLan(lan.name)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 12,
                          paddingHorizontal: 2,
                        }}
                      >
                        <Ionicons
                          name="map-outline"
                          size={18}
                          color={selected ? theme.primary : theme.textMuted}
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 16,
                            letterSpacing: -0.2,
                            color: selected ? theme.text : theme.textMuted,
                            fontWeight: selected ? '700' : '500',
                          }}
                        >
                          {lan.name}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </View>

          {Platform.OS !== 'web' ? (
            <Pressable
              className="mt-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor: theme.primary }}
              onPress={async () => {
                setIsResolvingLocation(true);
                try {
                  const detected = await resolveUserCityFromDevice({ requestPermission: true });
                  if (detected?.city && detected.coords) {
                    const lan = await persistDetectedRegion(detected.city, detected.coords);
                    setCity(detected.city);
                    setSelectedLan(lan);
                    setLocationPickerLan(lan);
                  } else {
                    Alert.alert(
                      'Kunde inte hitta stad',
                      'Välj län och stad i listan eller aktivera platsåtkomst.'
                    );
                  }
                } finally {
                  setIsResolvingLocation(false);
                }
              }}
              disabled={isResolvingLocation || locationPicking}
            >
              <Text className="text-center font-medium text-white">
                {isResolvingLocation ? 'Hämtar plats...' : 'Använd min plats'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        ) : null}

        {currentFormStep === 'gender' ? (
            <View className="">
            <View
              className="rounded-2xl px-2 py-5"
              style={{ backgroundColor: 'transparent' }}
            >
              <Text className="text-2xl" style={{ color: theme.text }}>
                Välj kön
              </Text>
              </View>

              <View className="mb-4 flex-row flex-wrap gap-3">
                {genderOptions.map((option) => {
                  const isSelected = selectedGender === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      className="rounded-2xl border px-5 py-3"
                      style={{
                        backgroundColor: isSelected ? accentColor : theme.cardBgMuted,
                        borderColor: isSelected ? accentColor : theme.border,
                      }}
                      onPress={() => setSelectedGender(option.value)}
                    >
                      <Text
                        className="text-center text-lg font-medium"
                        style={{
                          color: isSelected
                            ? getOnAccentTextColor(accentColor)
                            : theme.text,
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>


            </View>
        ):null}

        {currentFormStep === 'interests' ? (
           <View className="">
              <View
                className="rounded-2xl px-2 py-5"
                style={{ backgroundColor: 'transparent' }}
              >
                <Text className="text-2xl" style={{ color: theme.text }}>
                  Vad tycker du om?
                </Text>
                <Text className="pt-2" style={{ color: theme.textMuted }}>
                  Välj en eller flera kategorier.
                </Text>
              </View>

              {isLoadingCategories ? (
                <LoadingSpinner label="Laddar kategorier..." />
              ) : null}
              {categoryLoadError ? (
                <Text style={{ color: theme.textFaint }}>{categoryLoadError}</Text>
              ) : null}

                    <View className="mb-20 flex-row flex-wrap gap-3">
              {categoryOptions.map((option) => {
                const isSelected = selectedCategoryIds.includes(option.id ?? '');
                const accent = getCategoryAccentColor(option.name);
                return (
                  <Pressable
                    key={option.id ?? option.name}
                    className="rounded-2xl border px-5 py-3"
                    style={{
                      backgroundColor: isSelected ? accent : theme.cardBgMuted,
                      borderColor: isSelected ? accent : theme.border,
                    }}
                    onPress={() => {
                      setSelectedCategoryIds((prev) =>
                        prev.includes(option.id ?? '')
                          ? prev.filter((item) => item !== (option.id ?? ''))
                          : [...prev, option.id ?? '']
                      );
                    }}
                  >
                    <Text
                      className="text-center text-lg font-medium"
                      style={{ color: isSelected ? getOnAccentTextColor(accent) : theme.text }}
                    >
                      {option.name}
                    </Text>
                  </Pressable>
                );
              })}
              </View>


            </View>
        ):null}

        {isSuccessStep ? (
          <View
            className="rounded-2xl px-4 py-8"
            style={{ backgroundColor: theme.cardBgMuted }}
          >
            <Text className="text-center text-2xl font-semibold" style={{ color: theme.text }}>
              Börja upptäck platser nära dig!
            </Text>
          </View>
        ) : null}
    </RegistrationScreenShell>
  );
}
