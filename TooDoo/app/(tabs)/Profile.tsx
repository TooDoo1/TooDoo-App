import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { useThemePreference } from '@/context/theme-preference-context';
import { uiTheme } from '@/lib/ui-theme';

type UserProfile = {
	id?: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	gender?: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER' | string;
	notificationsEnabled?: boolean;
};

const GENDER_OPTIONS: { label: string; value: UserProfile['gender'] }[] = [
	{ label: 'Man', value: 'MALE' },
	{ label: 'Kvinna', value: 'FEMALE' },
	{ label: 'Ickebinär', value: 'NON_BINARY' },
	{ label: 'Annat', value: 'OTHER' },
];

export default function ProfileScreen() {
	const router = useRouter();
	const { signOut, token, authFetch } = useAuth();
	const { mode, setMode } = useThemePreference();
	const theme = uiTheme(mode);
	const boxShadowStyle = {
		shadowColor: theme.isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.25)',
		shadowOffset: { width: 0, height: theme.isDark ? 10 : 6 },
		shadowOpacity: theme.isDark ? 0.35 : 0.14,
		shadowRadius: theme.isDark ? 18 : 12,
		elevation: theme.isDark ? 12 : 7,
	};

	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isEditing, setIsEditing] = useState(false);

	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [gender, setGender] = useState<UserProfile['gender']>('OTHER');
	const [notificationsEnabled, setNotificationsEnabled] = useState(true);
	const isLightMode = mode === 'light';

	const loadProfile = useCallback(async () => {
		if (!token) {
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		try {
			const res = await authFetch('/user/me');
			const json = (await res.json().catch(() => ({}))) as UserProfile;
			setProfile(json);
			setFirstName(json.firstName ?? '');
			setLastName(json.lastName ?? '');
			setGender((json.gender as UserProfile['gender']) ?? 'OTHER');
			if (typeof json.notificationsEnabled === 'boolean') {
				setNotificationsEnabled(json.notificationsEnabled);
			}
		} catch {
			Alert.alert('Kunde inte ladda profil', 'Kontrollera din internetanslutning och försök igen.');
		} finally {
			setIsLoading(false);
		}
	}, [token]);

	useEffect(() => {
		void loadProfile();
	}, [loadProfile]);

	const putProfile = async (payload: Partial<UserProfile>) => {
		const res = await authFetch('/user/me', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});
		if (!res.ok) {
			throw new Error(`Request failed with status ${res.status}`);
		}
		return (await res.json().catch(() => ({}))) as UserProfile;
	};

	const handleSave = async () => {
		setIsSaving(true);
		try {
			const updated = await putProfile({
				firstName: firstName.trim() || undefined,
				lastName: lastName.trim() || undefined,
				gender,
			});
			setProfile((prev) => ({ ...(prev ?? {}), ...updated, firstName, lastName, gender }));
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
		setGender((profile?.gender as UserProfile['gender']) ?? 'OTHER');
		setIsEditing(false);
	};

	const handleToggleNotifications = async (next: boolean) => {
		const previous = notificationsEnabled;
		setNotificationsEnabled(next);
		if (!token) return;
		try {
			await putProfile({ notificationsEnabled: next });
		} catch {
			setNotificationsEnabled(previous);
			Alert.alert('Kunde inte uppdatera', 'Notisinställningen kunde inte sparas just nu.');
		}
	};

	const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'Din profil';

	return (
		<ScrollView className="flex-1" style={{ backgroundColor: theme.screenBg }} contentContainerStyle={{ paddingBottom: 48 }}>
			<View className="min-h-full px-6 pt-24">
				<Text className="text-center text-3xl font-semibold" style={{ color: theme.text }}>Profil</Text>

				{isLoading ? (
					<View className="mt-8 items-center">
						<ActivityIndicator color={theme.isDark ? '#ffffff' : '#000b2a'} />
						<Text className="mt-3" style={{ color: theme.textMuted }}>Laddar profil...</Text>
					</View>
				) : (
					<>
						<View className="mt-8 rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
							<View className="flex-row items-center justify-between">
								<Text className="text-lg font-semibold" style={{ color: theme.text }}>Kontouppgifter</Text>
								{!isEditing ? (
									<Pressable onPress={() => setIsEditing(true)}>
										<Text className="font-medium text-blue-400">Redigera</Text>
									</Pressable>
								) : null}
							</View>

							{!isEditing ? (
								<View className="mt-4">
									<Text className="text-sm" style={{ color: theme.textFaint }}>Namn</Text>
									<Text className="mt-1" style={{ color: theme.text }}>{displayName}</Text>

									<Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>E-post</Text>
									<Text className="mt-1" style={{ color: theme.text }}>{profile?.email ?? '-'}</Text>

									<Text className="mt-4 text-sm" style={{ color: theme.textFaint }}>Kön</Text>
									<Text className="mt-1" style={{ color: theme.text }}>
										{GENDER_OPTIONS.find((o) => o.value === profile?.gender)?.label ?? 'Ej angivet'}
									</Text>
								</View>
							) : (
								<View className="mt-4">
									<Text className="text-sm" style={{ color: theme.textFaint }}>Förnamn</Text>
									<TextInput
										value={firstName}
										onChangeText={setFirstName}
										placeholder="Förnamn"
										placeholderTextColor={theme.textFaint}
										className="mt-1 rounded-2xl border px-4 py-3"
										style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
									/>

									<Text className="mt-3 text-sm" style={{ color: theme.textFaint }}>Efternamn</Text>
									<TextInput
										value={lastName}
										onChangeText={setLastName}
										placeholder="Efternamn"
										placeholderTextColor={theme.textFaint}
										className="mt-1 rounded-2xl border px-4 py-3"
										style={{ borderColor: theme.border, backgroundColor: theme.cardBgMuted, color: theme.text }}
									/>

									<Text className="mt-3 text-sm" style={{ color: theme.textFaint }}>E-post</Text>
									<Text className="mt-1" style={{ color: theme.text }}>{profile?.email ?? '-'}</Text>

									<Text className="mt-3 text-sm" style={{ color: theme.textFaint }}>Kön</Text>
									<View className="mt-1 flex-row">
										{GENDER_OPTIONS.map((option, idx) => {
											const active = gender === option.value;
											return (
												<Pressable
													key={option.value}
													onPress={() => setGender(option.value)}
													className={`flex-1 rounded-2xl px-3 py-3 ${idx < GENDER_OPTIONS.length - 1 ? 'mr-2' : ''}`}
													style={{
														backgroundColor: active ? theme.accentGreen : theme.cardBgMuted,
														borderWidth: active ? 0 : 1,
														borderColor: theme.border,
													}}
												>
													<Text className="text-center font-medium" style={{ color: active ? '#ffffff' : theme.text }}>
														{option.label}
													</Text>
												</Pressable>
											);
										})}
									</View>

									<View className="mt-5 flex-row">
										<Pressable
											className="flex-1 mr-2 rounded-2xl px-4 py-3"
											style={{ backgroundColor: theme.cardBgMuted, borderWidth: 1, borderColor: theme.border }}
											onPress={handleCancelEdit}
											disabled={isSaving}
										>
											<Text className="text-center font-medium" style={{ color: theme.text }}>Avbryt</Text>
										</Pressable>
										<Pressable
											className="flex-1 rounded-2xl px-4 py-3"
											onPress={handleSave}
											disabled={isSaving}
											style={{
												backgroundColor: isSaving
													? (theme.isDark ? 'rgba(255, 155, 70, 0.40)' : 'rgba(186, 219, 194, 0.40)')
													: theme.accentGreen,
											}}
										>
											<Text className="text-center font-medium text-white">
												{isSaving ? 'Sparar...' : 'Spara'}
											</Text>
										</Pressable>
									</View>
								</View>
							)}
						</View>

						<View className="mt-4 rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
							<View className="flex-row items-center justify-between">
								<View className="flex-1 pr-3">
									<Text className="text-lg font-semibold" style={{ color: theme.text }}>Notiser</Text>
									<Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>
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

						<View className="mt-4 rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
							<View className="flex-row items-center justify-between">
								<View className="flex-1 pr-3">
									<Text className="text-lg font-semibold" style={{ color: theme.text }}>Ljust läge</Text>
									<Text className="mt-1 text-sm" style={{ color: theme.textMuted }}>Växla mellan mörkt och ljust tema.</Text>
								</View>
								<Switch
									value={isLightMode}
									onValueChange={(next) => setMode(next ? 'light' : 'dark')}
									trackColor={{ false: '#3a3a3c', true: theme.accentGreen }}
									thumbColor="#ffffff"
								/>
							</View>
						</View>

						<View className="mt-4 rounded-2xl px-4 py-5" style={[{ backgroundColor: theme.cardBg }, boxShadowStyle]}>
							<Pressable
								className="rounded-2xl bg-[#ff3b30] px-4 py-3"
								onPress={async () => {
									await signOut();
									router.replace('/(tabs)/Loggain');
								}}
							>
								<Text
									className="text-center font-medium"
									style={{ color: theme.isDark ? '#ffffff' : theme.text }}
								>
									Logga ut
								</Text>
							</Pressable>
						</View>
					</>
				)}
			</View>
		</ScrollView>
	);
}
