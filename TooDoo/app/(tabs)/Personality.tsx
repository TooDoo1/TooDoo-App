import {
  ScrollView,
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
} from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth-context";

export default function PersonalityScreen() {
  const router = useRouter();
  const { pendingRegistration, clearPendingRegistration, signIn } = useAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';
  const totalCount = 4;
  const [claimedCount, setClaimedCount] = useState(1);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [selectedGender, setSelectedGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id?: string; name: string }>>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const progressPercent = totalCount > 0 ? Math.min((claimedCount / totalCount) * 100, 100) : 0;

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      setIsLoadingCategories(true);
      setCategoryLoadError('');

      try {
        const response = await fetch(`${apiBaseUrl}/category`);
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
  }, [apiBaseUrl]);

  const genderOptions = [
    { label: 'Man', value: 'MALE' as const },
    { label: 'Kvinna', value: 'FEMALE' as const },
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
          <Text className="pt-4 text-lg text-white">Ålder:</Text>
          <TextInput
                value={age}
                onChangeText={setAge}
                placeholder="Ålder"
            placeholderTextColor="rgba(255,255,255,0.45)"
            keyboardType="numeric"
            autoCapitalize="none"
            className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
          />

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
                  Alert.alert("Välj ett alternativ", "Välj Man, Kvinna, Vill ej ange eller Ickebinär innan du går vidare.");
                  return;
                }
                if (claimedCount === 1 && (!firstName.trim() || !lastName.trim())) {
                  Alert.alert("Saknad information", "Fyll i förnamn och efternamn innan du går vidare.");
                  return;
                }
                if (claimedCount === 3 && selectedCategoryIds.length === 0) {
                  Alert.alert("Välj kategori", "Välj minst en kategori innan du går vidare.");
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
                    const response = await fetch(`${apiBaseUrl}/user/register`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        email: pendingRegistration.email,
                        firstName: firstName.trim(),
                        lastName: lastName.trim(),
                        gender: selectedGender,
                        password: pendingRegistration.password,
                        interests: selectedCategoryIds,
                      }),
                    });

                    const data = (await response.json().catch(() => ({}))) as { error?: string; token?: string };

                    if (response.status === 201) {
                      let tokenToUse = data.token;

                      if (!tokenToUse) {
                        const loginResponse = await fetch(`${apiBaseUrl}/user/login`, {
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
