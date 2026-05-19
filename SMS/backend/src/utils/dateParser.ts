/**
 * Parses a date string in dd/mm/yyyy format and returns a Date object
 * @param dateString - Date string in dd/mm/yyyy format
 * @returns Date object or null if invalid
 */
export function parseDOB(dateString: string): Date | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  // Remove any whitespace
  const trimmed = dateString.trim();
  
  // Check format: dd/mm/yyyy
  const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = trimmed.match(datePattern);
  
  if (!match) {
    return null;
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Validate ranges
  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > 31) {
    return null;
  }

  // Create date object (month is 0-indexed in JavaScript Date)
  const date = new Date(year, month - 1, day);

  // Verify the date is valid (handles invalid dates like 31/02/2024)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Formats a Date object to dd/mm/yyyy string
 * @param date - Date object
 * @returns Formatted string in dd/mm/yyyy format
 */
export function formatDOB(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Compares two dates ignoring time component and timezone
 * @param date1 - First date
 * @param date2 - Second date
 * @returns true if dates are the same day, false otherwise
 */
export function compareDates(date1: Date, date2: Date): boolean {
  // Format both dates to dd/mm/yyyy and compare strings to avoid timezone issues
  const formatted1 = formatDOB(date1);
  const formatted2 = formatDOB(date2);
  return formatted1 === formatted2;
}

