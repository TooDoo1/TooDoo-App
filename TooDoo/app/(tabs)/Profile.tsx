import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';

type UserProfile = {
	id?: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	gender?: 'MALE' | 'FEMALE' | 'OTHER' | string;
	notificationsEnabled?: boolean;
};

const GENDER_OPTIONS: { label: string; value: UserProfile['gender'] }[] = [
	{ label: 'Man', value: 'MALE' },
	{ label: 'Kvinna', value: 'FEMALE' },
	{ label: 'Annat', value: 'OTHER' },
];

export default function ProfileScreen() {
	const router = useRouter();
	const { signOut, token } = useAuth();
	const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://toodoo-backend-ejml.onrender.com';

	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isEditing, setIsEditing] = useState(false);

	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [email, setEmail] = useState('');
	const [gender, setGender] = useState<UserProfile['gender']>('OTHER');
	const [notificationsEnabled, setNotificationsEnabled] = useState(true);

	const loadProfile = useCallback(async () => {
		if (!token) {
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		try {
			const res = await fetch(`${apiBaseUrl}/user/me`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			const json = (await res.json().catch(() => ({}))) as UserProfile;
			setProfile(json);
			setFirstName(json.firstName ?? '');
			setLastName(json.lastName ?? '');
			setEmail(json.email ?? '');
			setGender((json.gender as UserProfile['gender']) ?? 'OTHER');
			if (typeof json.notificationsEnabled === 'boolean') {
				setNotificationsEnabled(json.notificationsEnabled);
			}
		} catch {
			Alert.alert('Kunde inte ladda profil', 'Kontrollera din internetanslutning och försök igen.');
		} finally {
			setIsLoading(false);
		}
	}, [apiBaseUrl, token]);

	useEffect(() => {
		void loadProfile();
	}, [loadProfile]);

	const patchProfile = async (payload: Partial<UserProfile>) => {
		const res = await fetch(`${apiBaseUrl}/user/me`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});
		if (!res.ok) {
			throw new Error(`Request failed with status ${res.status}`);
		}
		return (await res.json().catch(() => ({}))) as UserProfile;
	};

	const handleSave = async () => {
		if (!email.trim()) {
			Alert.alert('Ogiltig e-post', 'E-postadressen får inte vara tom.');
			return;
		}
		setIsSaving(true);
		try {
			const updated = await patchProfile({
				firstName: firstName.trim() || undefined,
				lastName: lastName.trim() || undefined,
				email: email.trim(),
				gender,
			});
			setProfile((prev) => ({ ...(prev ?? {}), ...updated, firstName, lastName, email, gender }));
			setIsEditing(false);
			Alert.alert('Sparat', 'Dina kontouppgifter har uppdaterats.');
		} catch {
			Alert.alert('Kunde inte spara', 'Uppgifterna kunde inte sparas just nu.');
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancelEdit = () => {
		setFirstName(profile?.firstName ?? '');
		setLastName(profile?.lastName ?? '');
		setEmail(profile?.email ?? '');
		setGender((profile?.gender as UserProfile['gender']) ?? 'OTHER');
		setIsEditing(false);
	};

	const handleToggleNotifications = async (next: boolean) => {
		const previous = notificationsEnabled;
		setNotificationsEnabled(next);
		if (!token) return;
		try {
			await patchProfile({ notificationsEnabled: next });
		} catch {
			setNotificationsEnabled(previous);
			Alert.alert('Kunde inte uppdatera', 'Notisinställningen kunde inte sparas just nu.');
		}
	};

	const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'Din profil';

	return (
		<ScrollView className="flex-1 bg-[#000b2a]" contentContainerStyle={{ paddingBottom: 48 }}>
			<View className="min-h-full px-6 pt-24">
				<Text className="text-center text-3xl font-semibold text-white">Profil</Text>

				{isLoading ? (
					<View className="mt-8 items-center">
						<ActivityIndicator color="#ffffff" />
						<Text className="mt-3 text-white/70">Laddar profil...</Text>
					</View>
				) : (
					<>
						<View className="mt-8 rounded-2xl bg-[#0a1535] px-4 py-5">
							<View className="flex-row items-center justify-between">
								<Text className="text-lg font-semibold text-white">Kontouppgifter</Text>
								{!isEditing ? (
									<Pressable onPress={() => setIsEditing(true)}>
										<Text className="font-medium text-blue-400">Redigera</Text>
									</Pressable>
								) : null}
							</View>

							{!isEditing ? (
								<View className="mt-4">
									<Text className="text-sm text-white/50">Namn</Text>
									<Text className="mt-1 text-white">{displayName}</Text>

									<Text className="mt-4 text-sm text-white/50">E-post</Text>
									<Text className="mt-1 text-white">{profile?.email ?? '-'}</Text>

									<Text className="mt-4 text-sm text-white/50">Kön</Text>
									<Text className="mt-1 text-white">
										{GENDER_OPTIONS.find((o) => o.value === profile?.gender)?.label ?? 'Ej angivet'}
									</Text>
								</View>
							) : (
								<View className="mt-4">
									<Text className="text-sm text-white/50">Förnamn</Text>
									<TextInput
										value={firstName}
										onChangeText={setFirstName}
										placeholder="Förnamn"
										placeholderTextColor="rgba(255,255,255,0.3)"
										className="mt-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
									/>

									<Text className="mt-3 text-sm text-white/50">Efternamn</Text>
									<TextInput
										value={lastName}
										onChangeText={setLastName}
										placeholder="Efternamn"
										placeholderTextColor="rgba(255,255,255,0.3)"
										className="mt-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
									/>

									<Text className="mt-3 text-sm text-white/50">E-post</Text>
									<TextInput
										value={email}
										onChangeText={setEmail}
										placeholder="din@mail.se"
										placeholderTextColor="rgba(255,255,255,0.3)"
										keyboardType="email-address"
										autoCapitalize="none"
										className="mt-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white"
									/>

									<Text className="mt-3 text-sm text-white/50">Kön</Text>
									<View className="mt-1 flex-row">
										{GENDER_OPTIONS.map((option, idx) => {
											const active = gender === option.value;
											return (
												<Pressable
													key={option.value}
													onPress={() => setGender(option.value)}
													className={`flex-1 rounded-2xl px-3 py-3 ${active ? 'bg-[#007AFF]' : 'bg-white/10 border border-white/20'} ${idx < GENDER_OPTIONS.length - 1 ? 'mr-2' : ''}`}
												>
													<Text className="text-center font-medium text-white">{option.label}</Text>
												</Pressable>
											);
										})}
									</View>

									<View className="mt-5 flex-row">
										<Pressable
											className="flex-1 mr-2 rounded-2xl bg-white/10 border border-white/20 px-4 py-3"
											onPress={handleCancelEdit}
											disabled={isSaving}
										>
											<Text className="text-center font-medium text-white">Avbryt</Text>
										</Pressable>
										<Pressable
											className={`flex-1 rounded-2xl px-4 py-3 ${isSaving ? 'bg-[#007AFF]/40' : 'bg-[#007AFF]'}`}
											onPress={handleSave}
											disabled={isSaving}
										>
											<Text className="text-center font-medium text-white">
												{isSaving ? 'Sparar...' : 'Spara'}
											</Text>
										</Pressable>
									</View>
								</View>
							)}
						</View>

						<View className="mt-4 rounded-2xl bg-[#0a1535] px-4 py-5">
							<View className="flex-row items-center justify-between">
								<View className="flex-1 pr-3">
									<Text className="text-lg font-semibold text-white">Notiser</Text>
									<Text className="mt-1 text-sm text-white/60">
										Få påminnelser om nya erbjudanden och när dina deals är på väg att utgå.
									</Text>
								</View>
								<Switch
									value={notificationsEnabled}
									onValueChange={handleToggleNotifications}
									trackColor={{ false: '#3a3a3c', true: '#34c759' }}
									thumbColor="#ffffff"
								/>
							</View>
						</View>

						<View className="mt-4 rounded-2xl bg-[#0a1535] px-4 py-5">
							<Pressable
								className="rounded-2xl bg-[#ff3b30] px-4 py-3"
								onPress={() => {
									signOut();
									router.replace('/(tabs)/Loggain');
								}}
							>
								<Text className="text-center font-medium text-white">Logga ut</Text>
							</Pressable>
						</View>
					</>
				)}
			</View>
		</ScrollView>
	);
}
