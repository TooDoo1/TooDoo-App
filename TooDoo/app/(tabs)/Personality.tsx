import {
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth-context";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { apiUrl } from "@/lib/api";
import { hasForegroundLocationPermission, resolveUserCityFromDevice } from "@/lib/geo";
import { useThemePreference } from "@/context/theme-preference-context";
import { BrandColors } from "@/lib/brand-colors";
import { getCategoryAccentColor, getOnAccentTextColor } from "@/lib/category-colors";
import { uiTheme } from "@/lib/ui-theme";
import { RegistrationScreenShell } from "@/components/registration-screen-shell";
import { formatBirthDateDisplay, WebBirthDateWheelPicker } from "@/components/ui/wheel-picker";

export default function PersonalityScreen() {
  const router = useRouter();
  const { pendingRegistration, clearPendingRegistration, signIn } = useAuth();
  const { mode } = useThemePreference();
  const theme = uiTheme(mode);
  const accentColor = theme.danger;
  const totalCount = 4;
  const [claimedCount, setClaimedCount] = useState(1);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [selectedGender, setSelectedGender] = useState<'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id?: string; name: string }>>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
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
    setIsDatePickerVisible(false);
    setSelectedGender(null);
    setSelectedCategoryIds([]);
    setCity('');
    setIsResolvingLocation(false);
  }, [pendingRegistration?.email]);

  useEffect(() => {
    if (claimedCount !== 1) return;

    let cancelled = false;

    const autoDetectLocation = async () => {
      if (Platform.OS === 'web') {
        return;
      }

      setIsResolvingLocation(true);
      try {
        if (await hasForegroundLocationPermission()) {
          const result = await resolveUserCityFromDevice({ requestPermission: false });
          if (!cancelled && result?.city) {
            setCity(result.city);
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
  }, [claimedCount, pendingRegistration?.email]);

  const birthDateToIsoDateTime = (date: Date) => {
    // Backend expects date-time; keep the chosen calendar date stable across timezones.
    const yyyy = date.getFullYear();
    const mm = date.getMonth();
    const dd = date.getDate();
    return new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0, 0)).toISOString();
  };

  const openBirthDatePicker = () => {
    const initialValue = birthDate ?? new Date(2000, 0, 1);
    if (!birthDate) {
      setBirthDate(initialValue);
    }
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialValue,
        mode: 'date',
        is24Hour: true,
        maximumDate: new Date(),
        onChange: (_event, selectedDate) => {
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

  const resolveRegistrationLocation = async (): Promise<string | null> => {
    const trimmed = city.trim();
    if (trimmed) return trimmed;

    if (Platform.OS !== 'web') {
      const detected = await resolveUserCityFromDevice({ requestPermission: true });
      if (detected?.city) {
        setCity(detected.city);
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
        claimedCount === 4 ? (
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
                if (claimedCount === 2 && !selectedGender) {
                  Alert.alert("Välj ett alternativ", "Välj Man, Kvinna, Ickebinär eller Vill ej ange innan du går vidare.");
                  return;
                }
                if (claimedCount === 1 && (!firstName.trim() || !lastName.trim())) {
                  Alert.alert("Saknad information", "Fyll i förnamn och efternamn innan du går vidare.");
                  return;
                }
                if (claimedCount === 1 && !birthDate) {
                  Alert.alert("Saknad information", "Välj din födelsedag innan du går vidare.");
                  return;
                }
                if (claimedCount === 1 && !city.trim()) {
                  Alert.alert("Saknad stad", "Ange vilken stad du befinner dig i innan du går vidare.");
                  return;
                }
                if (claimedCount === 3) {
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
                        'Vi behöver din stad för att skapa konto. Gå tillbaka till steg 1 och ange stad, eller aktivera platsåtkomst.'
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
                      setClaimedCount(4);
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
        {claimedCount === 1? (

        <View className="rounded-2xl px-4 py-5" style={{ backgroundColor: theme.cardBgMuted }}>
          <Text className="text-2xl" style={{ color: theme.text }}>Berätta om dig själv</Text>

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
                  value={birthDate ?? new Date(2000, 0, 1)}
                  mode="date"
                  maximumDate={new Date()}
                  display="spinner"
                  themeVariant={theme.isDark ? 'dark' : 'light'}
                  textColor={theme.text}
                  style={{ height: 190 }}
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) setBirthDate(selectedDate);
                  }}
                />
              ) : (
                <WebBirthDateWheelPicker
                  value={birthDate ?? new Date(2000, 0, 1)}
                  maximumDate={new Date()}
                  theme={theme}
                  onChange={setBirthDate}
                />
              )}
              <Pressable
                className="mt-2 rounded-2xl px-4 py-3"
                style={{ backgroundColor: accentColor }}
                onPress={() => setIsDatePickerVisible(false)}
              >
                <Text className="text-center font-medium text-white">Klar</Text>
              </Pressable>
            </View>
          ) : null}

          <Text className="pt-4 text-lg" style={{ color: theme.text }}>Stad:</Text>
          <Text className="pt-1 text-sm" style={{ color: theme.textMuted }}>
            Behövs för att visa erbjudanden nära dig.
          </Text>
          {isResolvingLocation && Platform.OS !== 'web' ? (
            <Text className="pt-2 text-sm" style={{ color: theme.textMuted }}>
              Hämtar din plats...
            </Text>
          ) : null}
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="T.ex. Helsingborg"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="words"
            className="mt-2 rounded-2xl border px-4 py-3"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.cardBgMuted,
              color: theme.text,
              fontSize: 16,
            }}
          />

        </View>
        ) : null}

        {claimedCount === 2 ? (
            <View className="">
            <View
              className="rounded-2xl px-2 py-5"
              style={{ backgroundColor: 'transparent' }}
            >
              <Text className="text-2xl" style={{ color: theme.text }}>
                Välj kön
              </Text>
              </View>

              <View className=" flex-row flex-wrap justify-between">
                {genderOptions.map((option) => {
                  const isSelected = selectedGender === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      className="mb-3 w-[48%] rounded-2xl border px-4 py-3"
                      style={{
                        backgroundColor: isSelected ? accentColor : BrandColors.dark.secondary,
                        borderColor: isSelected ? accentColor : '#ffffff',
                      }}
                      onPress={() => setSelectedGender(option.value)}
                    >
                      <Text
                        className="text-center text-lg font-medium"
                        style={{ color: '#ffffff' }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>


            </View>
        ):null}

        {claimedCount === 3 ? (
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
                <Text style={{ color: theme.textFaint }}>Laddar kategorier...</Text>
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

        {claimedCount === 4 ? (
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
