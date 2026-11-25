import { Platform, StyleSheet, Text, TextInput } from 'react-native';

/** App font family name. */
export const APP_FONT_FAMILY = 'Plus Jakarta Sans';

let defaultsApplied = false;

type Renderable = {
	render?: (props: { style?: unknown }, ref: unknown) => unknown;
};

/**
 * Keep any explicit face that isn't the RN Web System default / our app font.
 * On web, @expo/vector-icons sets fontFamily to the .ttf basename/URL (e.g. a
 * path ending in "Ionicons"), not the short name "ionicons".
 */
function shouldPreserveFontFamily(fontFamily: unknown): boolean {
	if (typeof fontFamily !== 'string' || !fontFamily) return false;
	if (fontFamily === 'System' || fontFamily === APP_FONT_FAMILY) return false;
	return true;
}

/**
 * Make Plus Jakarta Sans the default for Text / TextInput app-wide.
 * On web, overwrite RN Web's `font: 14px System` shorthand (same key) so the custom family wins.
 * Never touch Text that already has an explicit fontFamily (icons, custom faces).
 */
export function applyAppTextDefaults() {
	if (defaultsApplied) return;
	defaultsApplied = true;

	const patch = (Component: Renderable) => {
		const previous = Component.render;
		if (typeof previous !== 'function') return;

		Component.render = function renderWithAppFont(props: { style?: unknown }, ref: unknown) {
			const flat = (StyleSheet.flatten(props.style) ?? {}) as {
				fontFamily?: string;
				fontSize?: number | string;
				fontWeight?: string | number;
				lineHeight?: number | string;
			};

			if (shouldPreserveFontFamily(flat.fontFamily)) {
				return previous.call(this, props, ref);
			}

			if (Platform.OS === 'web') {
				const fontSize =
					typeof flat.fontSize === 'number'
						? flat.fontSize
						: typeof flat.fontSize === 'string' && flat.fontSize.trim()
							? flat.fontSize
							: 14;
				const weight =
					flat.fontWeight === undefined || flat.fontWeight === null
						? ''
						: `${flat.fontWeight} `;
				const lineHeightCss =
					typeof flat.lineHeight === 'number'
						? `/${flat.lineHeight}px`
						: typeof flat.lineHeight === 'string' && flat.lineHeight.trim()
							? `/${flat.lineHeight}`
							: '';
				// Include weight + line-height in `font` — the shorthand resets both if omitted,
				// which clipped hero titles (e.g. Helsingborg) on web/Vercel.
				return previous.call(
					this,
					{
						...props,
						style: [
							props.style,
							{
								font: `${weight}${fontSize}px${lineHeightCss} "${APP_FONT_FAMILY}", system-ui, sans-serif`,
								fontFamily: APP_FONT_FAMILY,
								...(flat.fontWeight != null ? { fontWeight: flat.fontWeight } : null),
								...(flat.lineHeight != null ? { lineHeight: flat.lineHeight } : null),
							},
						],
					},
					ref
				);
			}

			return previous.call(
				this,
				{ ...props, style: [props.style, { fontFamily: APP_FONT_FAMILY }] },
				ref
			);
		};
	};

	patch(Text as Renderable);
	patch(TextInput as Renderable);
}
