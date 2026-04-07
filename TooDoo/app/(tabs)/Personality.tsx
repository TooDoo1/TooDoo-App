import {
  ScrollView,
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth-context";

export default function PersonalityScreen() {
  const router = useRouter();
  const { pendingRegistration, clearPendingRegistration, signIn } = useAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';
  const totalCount = 4;
  const [claimedCount, setClaimedCount] = useState(1);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [selectedGender, setSelectedGender] = useState<"Man" | "Kvinna" | "Vill ej ange" | "Ickebinär" | null>(null);
  const categoryOptions = [
    "Familj",
    "Nöje",
    "Restauranger",
    "Erbjudanden",
    "Event",
    "Mat & Dryck",
    "Sport",
  ] as const;
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const progressPercent = totalCount > 0 ? Math.min((claimedCount / totalCount) * 100, 100) : 0;

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
            placeholder="Förnamn"
            placeholderTextColor="rgba(255,255,255,0.45)"
            keyboardType="email-address"
            autoCapitalize="none"
            className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
          />
          <Text className="pt-4 text-lg text-white">Efternamn:</Text>
          <TextInput
            placeholder="Efternamn"
            placeholderTextColor="rgba(255,255,255,0.45)"
            keyboardType="email-address"
            autoCapitalize="none"
            className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
          />
          <Text className="pt-4 text-lg text-white">Ålder:</Text>
          <TextInput
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
                {(["Man", "Kvinna", "Vill ej ange", "Ickebinär"] as const).map((option) => {
                  const isSelected = selectedGender === option;
                  return (
                    <Pressable
                      key={option}
                      className={`mb-3 w-[48%] rounded-2xl border px-4 py-3 ${isSelected ? "border-[#061A47] bg-[#007AFF]" : "border-[#007AFF] bg-[#061A47]"}`}
                      onPress={() => setSelectedGender(option)}
                    >
                      <Text className={`text-center text-lg font-medium ${isSelected ? "text-[#061A47]" : "text-[#66adff]"}`}>
                        {option}
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

              <View className="mb-20 flex-row flex-wrap gap-3">
                {categoryOptions.map((option) => {
                  const isSelected = selectedCategories.includes(option);
                  return (
                    <Pressable
                      key={option}
                      className={`rounded-2xl border px-5 py-3 ${isSelected ? "border-[#061A47] bg-[#007AFF]" : "border-[#007AFF] bg-[#061A47]"}`}
                      onPress={() => {
                        setSelectedCategories((prev) =>
                          prev.includes(option)
                            ? prev.filter((item) => item !== option)
                            : [...prev, option]
                        );
                      }}
                    >
                      <Text className={`text-center text-lg font-medium ${isSelected ? "text-[#061A47]" : "text-[#66adff]"}`}>
                        {option}
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
                if (claimedCount === 3 && selectedCategories.length === 0) {
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
                        password: pendingRegistration.password,
                        name: pendingRegistration.accountType === 'company' ? pendingRegistration.companyName : undefined,
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
