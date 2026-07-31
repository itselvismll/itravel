const padDatePart = (value) => String(value).padStart(2, '0');

export const toBrazilianDate = (value) => {
  if (!value) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return value;
  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
};

export const maskBrazilianDate = (value, previousValue = '') => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return toBrazilianDate(value);

  const deletingFirstSeparator = previousValue.endsWith('/')
    && value === previousValue.slice(0, -1);
  if (deletingFirstSeparator) {
    return maskBrazilianDate(value.slice(0, -1));
  }

  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}/`;
  if (digits.length < 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length === 4) return `${digits.slice(0, 2)}/${digits.slice(2)}/`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const parseBrazilianDate = (value) => {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

export const toIsoDate = (value) => {
  const date = parseBrazilianDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};
