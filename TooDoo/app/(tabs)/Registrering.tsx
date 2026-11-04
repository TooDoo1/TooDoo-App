import { useState } from 'react';
import {
	Alert,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { apiUrl } from '@/lib/api';
import { COMPANY_DETAIL_PATH } from '@/lib/detail-navigation';
import { RegistrationScreenShell } from '@/components/registration-screen-shell';
import { PasswordInput } from '@/components/ui/password-input';
import { useThemePreference } from '@/context/theme-preference-context';
import { brandInkRgba } from '@/lib/brand-colors';
import { TAB_ACTIVE_COLORS } from '@/lib/tab-colors';
import { uiTheme } from '@/lib/ui-theme';

export default function RegistreringScreen() {
	const router = useRouter();
	const { setPendingRegistration, signIn } = useAuth();
	const { mode } = useThemePreference();
	const theme = uiTheme(mode);
	const { accountType, returnTo, returnParams } = useLocalSearchParams<{
		accountType?: string;
		returnTo?: string;
		returnParams?: string;
	}>();
	const isCompanyRegistration = accountType === 'company';
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [companyName, setCompanyName] = useState('');
	const [isSubmittingRegister, setIsSubmittingRegister] = useState(false);

	const fieldStyle = {
		borderColor: theme.border,
		backgroundColor: brandInkRgba(theme.isDark ? 0.1 : 0.04),
		color: theme.text,
	};

	const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

	const handleBack = () => {
		if (returnTo === 'erbjudanden') {
			let parsedParams: Record<string, string | string[]> = {};
			if (returnParams) {
				try {
					parsedParams = JSON.parse(returnParams) as Record<string, string | string[]>;
				} catch {
					parsedParams = {};
				}
			}

			router.replace({ pathname: COMPANY_DETAIL_PATH, params: parsedParams });
			return;
		}

		if (returnTo === 'minadeals') {
			router.replace('/(tabs)/MinaDeals');
			return;
		}

		if (returnTo === 'loggain') {
			router.replace('/(tabs)/Loggain');
			return;
		}

		if (router.canGoBack()) {
			router.back();
			return;
		}

		router.replace('/(tabs)/Loggain');
	};

	const handleRegister = async () => {
		if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
			Alert.alert('Saknad information', 'Fyll i alla fält för att registrera dig.');
			return;
		}

		if (!isValidEmail(email)) {
			Alert.alert('Ogiltig e-post', 'Skriv in en giltig e-postadress.');
			return;
		}

		if (password.length < 8) {
			Alert.alert('Ogiltigt lösenord', 'Lösenord måste vara minst 8 tecken.');
			return;
		}

		if (password !== confirmPassword) {
			Alert.alert('Lösenord matchar inte', 'Kontrollera lösenordet och försök igen.');
			return;
		}

		if (isCompanyRegistration) {
			setIsSubmittingRegister(true);
			try {
				const registerResponse = await fetch(apiUrl('/user/register/manager'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: email.trim(),
						password,
					}),
				});

				const registerData = (await registerResponse.json().catch(() => ({}))) as {
					error?: string;
				};

				if (registerResponse.status !== 201) {
					if (registerResponse.status === 409) {
						Alert.alert(
							'E-post upptagen',
							registerData.error ?? 'Email already exists'
						);
						return;
					}

					Alert.alert(
						'Fel',
						registerData.error ?? 'Kunde inte registrera manager-konto just nu.'
					);
					return;
				}

				const loginResponse = await fetch(apiUrl('/user/login/portal'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						email: email.trim(),
						password,
					}),
				});

				const loginData = (await loginResponse.json().catch(() => ({}))) as {
					token?: string;
					refreshToken?: string;
					error?: string;
					user?: { role?: string };
				};

				if (loginResponse.status === 200 && loginData.token) {
					await signIn(
						loginData.token,
						loginData.refreshToken ?? null,
						loginData.user?.role ?? null
					);
					Alert.alert('Konto skapat', 'Manager-kontot skapades och du är nu inloggad.');
					router.replace('/(tabs)/Profile');
					return;
				}

				Alert.alert(
					'Konto skapat',
					'Kontot skapades, men automatisk inloggning misslyckades. Logga in manuellt.'
				);
				router.replace('/(tabs)/Loggain');
			} catch {
				Alert.alert('Nätverksfel', 'Kunde inte ansluta till servern.');
			} finally {
				setIsSubmittingRegister(false);
			}

			return;
		}

		setPendingRegistration({
			email: email.trim(),
			password,
			accountType: 'user',
		});

		router.push('/(tabs)/Personality');
	};

	return (
		<RegistrationScreenShell
			header={
				<View style={styles.hero}>
					<Ionicons
						name="person-add"
						size={26}
						color={TAB_ACTIVE_COLORS.Profile}
					/>
					<View style={styles.heroCopy}>
						<Text style={[styles.title, { color: theme.text }]}>Registrering</Text>
						<Text style={[styles.subtitle, { color: theme.textMuted }]}>
							{isCompanyRegistration
								? 'Skapa ett företagskonto'
								: 'Skapa konto för att spara deals och favoriter'}
						</Text>
					</View>
				</View>
			}
			footer={
				<View style={styles.footerActions}>
					<Pressable
						onPress={handleRegister}
						disabled={isSubmittingRegister}
						style={({ pressed }) => [
							styles.ctaPrimary,
							{ opacity: isSubmittingRegister || pressed ? 0.88 : 1 },
						]}
					>
						<Text style={styles.ctaPrimaryLabel}>
							{isSubmittingRegister ? 'Skapar konto…' : 'Skapa konto'}
						</Text>
					</Pressable>
					<Pressable
						onPress={handleBack}
						style={({ pressed }) => [
							styles.ctaSecondary,
							{
								borderColor: theme.border,
								backgroundColor: brandInkRgba(theme.isDark ? 0.08 : 0.04),
								opacity: pressed ? 0.85 : 1,
							},
						]}
					>
						<Text style={[styles.ctaSecondaryLabel, { color: theme.text }]}>
							Tillbaka
						</Text>
					</Pressable>
				</View>
			}
		>
			<View style={styles.formBlock}>
				<Text style={[styles.formTitle, { color: theme.text }]}>
					{isCompanyRegistration ? 'Företagskonto' : 'Nytt konto'}
				</Text>
				<Text style={[styles.formSubtitle, { color: theme.textMuted }]}>
					{isCompanyRegistration
						? 'Fyll i uppgifterna för att komma igång.'
						: 'Sedan väljer du intressen i nästa steg.'}
				</Text>

				<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>E-post</Text>
				<TextInput
					value={email}
					onChangeText={setEmail}
					placeholder="Din e-postadress"
					placeholderTextColor={theme.textFaint}
					keyboardType="email-address"
					autoCapitalize="none"
					autoCorrect={false}
					style={[styles.field, fieldStyle]}
				/>

				{isCompanyRegistration ? (
					<>
						<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
							Företagsnamn
						</Text>
						<TextInput
							value={companyName}
							onChangeText={setCompanyName}
							placeholder="Ange företagsnamn"
							placeholderTextColor={theme.textFaint}
							style={[styles.field, fieldStyle]}
						/>
					</>
				) : null}

				<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Lösenord</Text>
				<PasswordInput
					value={password}
					onChangeText={setPassword}
					placeholder="Minst 8 tecken"
					placeholderTextColor={theme.textFaint}
					wrapperClassName=""
					wrapperStyle={[styles.field, styles.passwordField, fieldStyle]}
					style={{ color: theme.text, fontSize: 15 }}
					toggleColor={theme.textMuted}
				/>

				<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
					Bekräfta lösenord
				</Text>
				<PasswordInput
					value={confirmPassword}
					onChangeText={setConfirmPassword}
					placeholder="Upprepa lösenord"
					placeholderTextColor={theme.textFaint}
					wrapperClassName=""
					wrapperStyle={[styles.field, styles.passwordField, fieldStyle]}
					style={{ color: theme.text, fontSize: 15 }}
					toggleColor={theme.textMuted}
				/>

				<View style={styles.loginHint}>
					<Text style={{ color: theme.textMuted, fontSize: 14 }}>Har du redan konto? </Text>
					<Pressable onPress={() => router.replace('/(tabs)/Loggain')}>
						<Text style={{ color: theme.link, fontSize: 14, fontWeight: '700' }}>
							Logga in
						</Text>
					</Pressable>
				</View>
			</View>
		</RegistrationScreenShell>
	);
}

const styles = StyleSheet.create({
	hero: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
	},
	heroCopy: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontSize: 28,
		fontWeight: '800',
		letterSpacing: -0.8,
		lineHeight: 32,
	},
	subtitle: {
		marginTop: 4,
		fontSize: 14,
		fontWeight: '500',
		letterSpacing: -0.1,
		lineHeight: 18,
	},
	formBlock: {
		paddingTop: 4,
	},
	formTitle: {
		fontSize: 18,
		fontWeight: '700',
		letterSpacing: -0.3,
	},
	formSubtitle: {
		marginTop: 4,
		marginBottom: 14,
		fontSize: 13,
		fontWeight: '500',
		lineHeight: 18,
	},
	fieldLabel: {
		marginTop: 12,
		marginBottom: 6,
		fontSize: 12,
		fontWeight: '700',
		letterSpacing: 0.2,
		textTransform: 'uppercase',
	},
	field: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: Platform.OS === 'web' ? 12 : 11,
		fontSize: 15,
		fontWeight: '500',
	},
	passwordField: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: Platform.OS === 'web' ? 10 : 8,
	},
	loginHint: {
		marginTop: 22,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		flexWrap: 'wrap',
	},
	footerActions: {
		gap: 10,
		alignItems: 'center',
	},
	ctaPrimary: {
		alignSelf: 'center',
		borderRadius: 12,
		backgroundColor: '#ff3b30',
		paddingHorizontal: 28,
		paddingVertical: 12,
		minWidth: 180,
	},
	ctaPrimaryLabel: {
		color: '#ffffff',
		fontSize: 15,
		fontWeight: '700',
		letterSpacing: -0.1,
		textAlign: 'center',
	},
	ctaSecondary: {
		alignSelf: 'center',
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 22,
		paddingVertical: 11,
		minWidth: 140,
	},
	ctaSecondaryLabel: {
		fontSize: 14,
		fontWeight: '700',
		letterSpacing: -0.1,
		textAlign: 'center',
	},
});
