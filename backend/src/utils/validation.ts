export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: any[];
  items?: string;
  optional?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validate(data: any, schema: { [key: string]: ValidationRule }): ValidationResult {
  const errors: string[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Skip if field is optional and not provided
    if (rules.optional && (value === undefined || value === null)) {
      continue;
    }

    // Required field validation
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip validation if field is not provided and not required
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    switch (rules.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${field} must be a string`);
        } else {
          // Length validation
          if (rules.minLength && value.length < rules.minLength) {
            errors.push(`${field} must be at least ${rules.minLength} characters long`);
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${field} must not exceed ${rules.maxLength} characters`);
          }
          // Enum validation
          if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
          }
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${field} must be a number`);
        } else {
          // Range validation
          if (rules.min !== undefined && value < rules.min) {
            errors.push(`${field} must be at least ${rules.min}`);
          }
          if (rules.max !== undefined && value > rules.max) {
            errors.push(`${field} must not exceed ${rules.max}`);
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${field} must be a boolean`);
        }
        break;

      case 'date':
        // Skip validation for empty strings if field is optional
        if (rules.optional && (value === '' || value === null || value === undefined)) {
          break;
        }
        const dateValue = new Date(value);
        if (isNaN(dateValue.getTime())) {
          errors.push(`${field} must be a valid date`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${field} must be an array`);
        } else {
          // Array length validation
          if (rules.minLength && value.length < rules.minLength) {
            errors.push(`${field} must have at least ${rules.minLength} items`);
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${field} must not exceed ${rules.maxLength} items`);
          }
          // Array item validation
          if (rules.items) {
            for (let i = 0; i < value.length; i++) {
              const item = value[i];
              switch (rules.items) {
                case 'string':
                  if (typeof item !== 'string') {
                    errors.push(`${field}[${i}] must be a string`);
                  }
                  break;
                case 'number':
                  if (typeof item !== 'number' || isNaN(item)) {
                    errors.push(`${field}[${i}] must be a number`);
                  }
                  break;
                // Add more item types as needed
              }
            }
          }
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`${field} must be an object`);
        }
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Common validation schemas
export const commonSchemas = {
  pagination: {
    page: { type: 'number', min: 1, optional: true },
    limit: { type: 'number', min: 1, max: 100, optional: true }
  },
  search: {
    search: { type: 'string', minLength: 1, maxLength: 100, optional: true }
  },
  dateRange: {
    startDate: { type: 'date', optional: true },
    endDate: { type: 'date', optional: true }
  }
};
