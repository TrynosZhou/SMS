/**
 * Phone number validation utility for Zimbabwean phone numbers
 * Supports formats:
 * - 07XXXXXXXX (10 digits)
 * - +2637XXXXXXXX (13 digits with country code)
 */

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Validates a phone number for Zimbabwean format
 * @param phoneNumber - The phone number to validate
 * @param required - Whether the phone number is required (default: false)
 * @returns Validation result with isValid flag and optional error message
 */
export function validatePhoneNumber(phoneNumber: string | null | undefined, required: boolean = false): PhoneValidationResult {
  // Check if required and empty
  if (required && (!phoneNumber || phoneNumber.trim() === '')) {
    return {
      isValid: false,
      error: 'Phone number is required'
    };
  }

  // If not required and empty, it's valid
  if (!phoneNumber || phoneNumber.trim() === '') {
    return {
      isValid: true,
      normalized: ''
    };
  }

  // Remove all whitespace, dashes, parentheses, and other formatting characters
  const cleaned = phoneNumber.replace(/[\s\-()]/g, '');

  // Check if it contains only digits and optionally a leading +
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return {
      isValid: false,
      error: 'Phone number can only contain digits and an optional leading +'
    };
  }

  // Check for Zimbabwean formats
  // Format 1: 07XXXXXXXX (10 digits starting with 07)
  // Format 2: +2637XXXXXXXX (13 digits starting with +2637)
  // Format 3: 2637XXXXXXXX (12 digits starting with 2637)
  
  let normalized = cleaned;
  
  // If it starts with +263, keep it
  if (cleaned.startsWith('+263')) {
    if (cleaned.length !== 13) {
      return {
        isValid: false,
        error: 'Phone number with country code must be 13 digits (e.g., +2637XXXXXXXX)'
      };
    }
    if (!cleaned.startsWith('+2637')) {
      return {
        isValid: false,
        error: 'Zimbabwean phone numbers must start with +2637'
      };
    }
    normalized = cleaned;
  }
  // If it starts with 263 (without +), add the +
  else if (cleaned.startsWith('263')) {
    if (cleaned.length !== 12) {
      return {
        isValid: false,
        error: 'Phone number with country code must be 12 digits (e.g., 2637XXXXXXXX)'
      };
    }
    if (!cleaned.startsWith('2637')) {
      return {
        isValid: false,
        error: 'Zimbabwean phone numbers must start with 2637'
      };
    }
    normalized = '+' + cleaned;
  }
  // If it starts with 07, it's a local format
  else if (cleaned.startsWith('07')) {
    if (cleaned.length !== 10) {
      return {
        isValid: false,
        error: 'Local phone number must be 10 digits (e.g., 07XXXXXXXX)'
      };
    }
    // Normalize to international format
    normalized = '+263' + cleaned.substring(1);
  }
  // If it starts with 7 (without 0), assume it's missing the leading 0
  else if (cleaned.startsWith('7') && cleaned.length === 9) {
    normalized = '+263' + cleaned;
  }
  // Invalid format
  else {
    return {
      isValid: false,
      error: 'Please enter a valid Zimbabwean phone number (e.g., 07XXXXXXXX or +2637XXXXXXXX)'
    };
  }

  // Final validation: should be 10-13 digits total (excluding +)
  const digitsOnly = normalized.replace(/\+/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 13) {
    return {
      isValid: false,
      error: 'Phone number must be between 10 and 13 digits'
    };
  }

  return {
    isValid: true,
    normalized: normalized,
    error: undefined
  };
}

/**
 * Formats a phone number for display
 * @param phoneNumber - The phone number to format
 * @returns Formatted phone number string
 */
export function formatPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return '';
  
  const cleaned = phoneNumber.replace(/[\s\-()]/g, '');
  
  // Format as +263 7XX XXX XXX
  if (cleaned.startsWith('+2637') && cleaned.length === 13) {
    return `+263 ${cleaned.substring(4, 6)} ${cleaned.substring(6, 9)} ${cleaned.substring(9)}`;
  }
  // Format as 07XX XXX XXX
  if (cleaned.startsWith('07') && cleaned.length === 10) {
    return `${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
  }
  
  return phoneNumber;
}

