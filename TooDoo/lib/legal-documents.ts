export const TERMS_OF_SERVICE_TEXT = '';

export const PRIVACY_POLICY_TEXT = '';

export type LegalDocumentKey = 'terms' | 'privacy';

export const LEGAL_DOCUMENTS: Record<
  LegalDocumentKey,
  { title: string; body: string }
> = {
  terms: {
    title: 'Användarvillkor',
    body: TERMS_OF_SERVICE_TEXT,
  },
  privacy: {
    title: 'Integritetspolicy',
    body: PRIVACY_POLICY_TEXT,
  },
};
