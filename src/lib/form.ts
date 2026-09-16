/**
 * Password managers scan every form and inject their own icon into fields they
 * think hold credentials. On a date input that icon lands on top of the native
 * calendar button, so the field becomes hard to click. None of these fields are
 * a login, so every manager is told to skip them — each one reads a different
 * attribute, hence the list.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-form-type': 'other', // Dashlane
  'data-lpignore': 'true', // LastPass
  'data-1p-ignore': 'true', // 1Password
  'data-bwignore': 'true', // Bitwarden
  'data-protonpass-ignore': 'true', // Proton Pass
} as const;
