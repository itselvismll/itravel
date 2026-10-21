const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseClockMinutes = value => {
  const match = String(value || '').trim().match(CLOCK_PATTERN);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const formatClockMinutes = value => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

const parseDurationMinutes = value => {
  const normalized = String(value || '').toLowerCase().replace(',', '.').trim();
  if (!normalized) return 120;

  const hours = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hora)/)?.[1];
  const minutes = normalized.match(/(\d+)\s*(?:min|m\b)/)?.[1];
  const compactMinutes = normalized.match(/\d+\s*h\s*(\d{1,2})\b/)?.[1];
  const total = (Number(hours) || 0) * 60 + (Number(minutes || compactMinutes) || 0);

  return total > 0 ? Math.max(30, Math.min(360, Math.round(total))) : 120;
};

const preferredStartForPeriod = period => {
  const normalized = String(period || '').toLowerCase();
  if (normalized.includes('noite')) return 19 * 60;
  if (normalized.includes('tarde')) return 14 * 60;
  return 9 * 60;
};

export const normalizeTravelPlanTimeline = plan => ({
  ...(plan || {}),
  days: (plan?.days || []).map(day => {
    let previousEnd = 8 * 60 + 30;
    const activities = (day.activities || []).map((activity, index) => {
      const minimumStart = previousEnd + (index ? 30 : 0);
      const requestedStart = parseClockMinutes(activity.startTime);
      const preferredStart = preferredStartForPeriod(activity.period);
      const start = requestedStart !== null && requestedStart >= minimumStart
        ? requestedStart
        : Math.max(preferredStart, minimumStart);
      const durationMinutes = parseDurationMinutes(activity.duration);
      const requestedEnd = parseClockMinutes(activity.endTime);
      const end = requestedEnd !== null && requestedEnd > start
        ? requestedEnd
        : Math.min(23 * 60 + 59, start + durationMinutes);

      previousEnd = end;
      return {
        ...activity,
        startTime: formatClockMinutes(start),
        endTime: formatClockMinutes(end),
      };
    });

    return { ...day, activities };
  }),
});

export const formatActivitySchedule = activity => {
  const start = parseClockMinutes(activity?.startTime);
  const end = parseClockMinutes(activity?.endTime);
  if (start === null || end === null || end <= start) return '';
  return `${formatClockMinutes(start)} – ${formatClockMinutes(end)}`;
};
