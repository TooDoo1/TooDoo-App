import {
  ScrollView,
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

export default function PersonalityScreen() {
  const router = useRouter();
  const { pendingRegistration, clearPendingRegistration, signIn } = useAuth();
  const totalCount = 4;
  const [claimedCount, setClaimedCount] = useState(1);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [isIosDatePickerVisible, setIsIosDatePickerVisible] = useState(false);
  const [selectedGender, setSelectedGender] = useState<'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id?: string; name: string }>>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
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
    setIsIosDatePickerVisible(false);
    setSelectedGender(null);
    setSelectedCategoryIds([]);
  }, [pendingRegistration?.email]);

  const formatBirthDate = (date: Date) => {
    // Keep a stable YYYY-MM-DD regardless of device locale.
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const birthDateToIsoDateTime = (date: Date) => {
    // Backend expects date-time; keep the chosen calendar date stable across timezones.
    const yyyy = date.getFullYear();
    const mm = date.getMonth();
    const dd = date.getDate();
    return new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0, 0)).toISOString();
  };

  const openBirthDatePicker = () => {
    const initialValue = birthDate ?? new Date(2000, 0, 1);
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

    setIsIosDatePickerVisible(true);
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

  const genderOptions = [
    { label: 'Man', value: 'MALE' as const },
    { label: 'Kvinna', value: 'FEMALE' as const },
    { label: 'Ickebinär', value: 'NON_BINARY' as const },
    { label: 'Vill ej ange', value: 'OTHER' as const },
  ];

  return (
    <ScrollView
      className="flex-1 bg-[#000b2a]"
      contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }}
    >
      <View className="flex-1 justify-between px-6 pt-12">
        <View>
        <Text className="pt-10 text-3xl font-semibold text-white">
          Skapa konto🎉
        </Text>
        <Text className="pt-5 text-md font-semibold text-white/70">
          Steg {claimedCount} av {totalCount}
        </Text>
        <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <View
                    className="h-full rounded-full bg-[#007AFF]"
                    style={{ width: `${progressPercent}%` }}
                  />
        </View>

        {claimedCount === 1? (

        <View className="mt-20 rounded-2xl bg-[#0a1535] px-4 py-5">
          <Text className="text-2xl text-white">Berätta om dig själv</Text>

          <Text className="pt-4 text-lg text-white">Förnamn:</Text>
          <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Förnamn"
            placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="words"
            className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
          />
          <Text className="pt-4 text-lg text-white">Efternamn:</Text>
          <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Efternamn"
            placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="words"
            className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
          />
          <Text className="pt-4 text-lg text-white">Födelsedag:</Text>
          <Pressable
            onPress={openBirthDatePicker}
            className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3"
          >
            <Text className={`${birthDate ? 'text-white' : 'text-white/45'}`}>
              {birthDate ? formatBirthDate(birthDate) : 'Välj datum'}
            </Text>
          </Pressable>

          {Platform.OS === 'ios' && isIosDatePickerVisible ? (
            <View className="mt-3 overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-2 py-2">
              <DateTimePicker
                value={birthDate ?? new Date(2000, 0, 1)}
                mode="date"
                maximumDate={new Date()}
                display="spinner"
                themeVariant="dark"
                textColor="#ffffff"
                style={{ height: 190 }}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setBirthDate(selectedDate);
                }}
              />
              <Pressable
                className="mt-2 rounded-2xl bg-[#007AFF] px-4 py-3"
                onPress={() => setIsIosDatePickerVisible(false)}
              >
                <Text className="text-center font-medium text-[#061A47]">Klar</Text>
              </Pressable>
            </View>
          ) : null}

        </View>
        ) : null}

        {claimedCount === 2 ? (
            <View className="">
              <View className="mt-20 pt-20 rounded-2xl px-2 py-5 ">
              <Text className="text-2xl text-white">Välj kön</Text>
              </View>

              <View className=" flex-row flex-wrap justify-between">
                {genderOptions.map((option) => {
                  const isSelected = selectedGender === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      className={`mb-3 w-[48%] rounded-2xl border px-4 py-3 ${isSelected ? "border-[#061A47] bg-[#007AFF]" : "border-[#007AFF] bg-[#061A47]"}`}
                      onPress={() => setSelectedGender(option.value)}
                    >
                      <Text className={`text-center text-lg font-medium ${isSelected ? "text-[#061A47]" : "text-[#66adff]"}`}>
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
              <View className="mt-20 pt-20 rounded-2xl px-2 py-5 ">
              <Text className="text-2xl text-white">Vad tycker du om?</Text>
                    <Text className="pt-2 text-white/70">Välj en eller flera kategorier.</Text>
              </View>

              {isLoadingCategories ? (
                <Text className="text-white/70">Laddar kategorier...</Text>
              ) : null}
              {categoryLoadError ? (
                <Text className="text-white/70">{categoryLoadError}</Text>
              ) : null}

                    <View className="mb-20 flex-row flex-wrap gap-3">
              {categoryOptions.map((option) => {
                const isSelected = selectedCategoryIds.includes(option.id ?? '');
                  return (
                    <Pressable
                    key={option.id ?? option.name}
                      className={`rounded-2xl border px-5 py-3 ${isSelected ? "border-[#061A47] bg-[#007AFF]" : "border-[#007AFF] bg-[#061A47]"}`}
                      onPress={() => {
                        setSelectedCategoryIds((prev) =>
                        prev.includes(option.id ?? '')
                          ? prev.filter((item) => item !== (option.id ?? ''))
                          : [...prev, option.id ?? '']
                        );
                      }}
                    >
                      <Text className={`text-center text-lg font-medium ${isSelected ? "text-[#061A47]" : "text-[#66adff]"}`}>
                      {option.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>


            </View>
        ):null}

        {claimedCount === 4 ? (
          <View className="mt-20 rounded-2xl bg-[#0a1535] px-4 py-8">
            <Text className="text-center text-2xl font-semibold text-white">Börja upptäck platser nära dig!</Text>
          </View>
        ) : null}

        </View>

        {claimedCount === 4 ? (
          <View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-5">
            <Pressable className="rounded-2xl bg-[#007AFF] px-4 py-3" onPress={() => router.replace('/')}>
              <Text className="text-center font-medium text-[#061A47]">Fortsätt</Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-5">
            <Pressable
              className=" rounded-2xl bg-[#007AFF] px-4 py-3"
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

                if (claimedCount === 3) {
                  if (!pendingRegistration) {
                    Alert.alert("Saknad registrering", "Fyll i registrering först innan du fortsätter.");
                    router.replace("/(tabs)/Registrering");
                    return;
                  }

                  setIsSubmittingCreate(true);
                  try {
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
                      }),
                    });

                    const data = (await response.json().catch(() => ({}))) as { error?: string; token?: string };

                    if (response.status === 201) {
                      let tokenToUse = data.token;

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

                        const loginData = (await loginResponse.json().catch(() => ({}))) as { token?: string };
                        tokenToUse = loginResponse.status === 200 ? loginData.token : undefined;
                      }

                      if (tokenToUse) {
                        signIn(tokenToUse);
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

                    Alert.alert('Fel', data.error ?? 'Kunde inte registrera just nu.');
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
              <Text className="text-center font-medium text-[#061A47]">{isSubmittingCreate ? "Skapar konto..." : "Nästa"}</Text>
            </Pressable>

            <Pressable
              className="mt-3 rounded-2xl bg-[#061A47] px-4 py-3"
              onPress={() => {
                if (claimedCount >= 2) {
                  setClaimedCount((prev) => Math.max(prev - 1, 1));
                  return;
                }
                router.push("/(tabs)/Registrering");
              }}
            >
              <Text className="text-center font-medium text-[#007AFF]">
                Tillbaka
              </Text>
            </Pressable>
         </View>
        )}
      </View>
    </ScrollView>
  );
}
