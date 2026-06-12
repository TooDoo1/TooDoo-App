export const searchTipsQuerySchema = {
  type: 'object',
  properties: {
    take: {
      anyOf: [
        { type: 'integer', minimum: 1, maximum: 20 },
        { type: 'string', pattern: '^[1-9][0-9]?$|^20$' },
      ],
    },
    city: { type: 'string', minLength: 1, maxLength: 120 },
    q: { type: 'string', minLength: 1, maxLength: 80 },
  },
  additionalProperties: false,
} as const;
