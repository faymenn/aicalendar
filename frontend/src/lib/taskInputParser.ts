type ParseOptions = {
  defaultDateKey?: string;
  fallbackTime?: string;
};

type ParsedTaskInput = {
  title: string;
  startTime: string | null;
  endTime: string | null;
};

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function toDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseFallbackTime(time: string | undefined) {
  if (!time) {
    return null;
  }
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return { hour, minute };
}

function toDateTimeString(date: Date, hour: number, minute: number) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${year}-${month}-${day}T${hh}:${mm}:00`;
}

function nextWeekdayDate(targetWeekday: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const delta = (targetWeekday - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + delta);
  return start;
}

export function parseTaskInput(
  rawInput: string,
  options: ParseOptions = {},
): ParsedTaskInput {
  let input = rawInput.trim();
  let date =
    options.defaultDateKey && /^\d{4}-\d{2}-\d{2}$/.test(options.defaultDateKey)
      ? toDateFromKey(options.defaultDateKey)
      : null;
  let startClock = parseFallbackTime(options.fallbackTime);
  let endClock: { hour: number; minute: number } | null = null;

  const isoDateMatch = input.match(/\b(\d{4}-\d{2}-\d{2})\b/i);
  if (isoDateMatch) {
    date = toDateFromKey(isoDateMatch[1]);
    input = input.replace(isoDateMatch[0], " ").trim();
  }

  const dayMonthMatch = input.match(
    /\b(\d{1,2})(st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)(?:\s+(\d{4}))?\b/i,
  );
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const monthKey = dayMonthMatch[3].toLowerCase();
    const year = Number(dayMonthMatch[4] ?? new Date().getFullYear());
    const month = MONTH_INDEX[monthKey];
    if (
      !Number.isNaN(day) &&
      !Number.isNaN(year) &&
      month !== undefined &&
      day >= 1 &&
      day <= 31
    ) {
      date = new Date(year, month, day);
      input = input.replace(dayMonthMatch[0], " ").trim();
    }
  }

  const monthDayMatch = input.match(
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(st|nd|rd|th)?(?:\s+(\d{4}))?\b/i,
  );
  if (monthDayMatch) {
    const monthKey = monthDayMatch[1].toLowerCase();
    const day = Number(monthDayMatch[2]);
    const year = Number(monthDayMatch[4] ?? new Date().getFullYear());
    const month = MONTH_INDEX[monthKey];
    if (
      !Number.isNaN(day) &&
      !Number.isNaN(year) &&
      month !== undefined &&
      day >= 1 &&
      day <= 31
    ) {
      date = new Date(year, month, day);
      input = input.replace(monthDayMatch[0], " ").trim();
    }
  }

  const relativeDateMatch = input.match(/\b(today|tomorrow)\b/i);
  if (relativeDateMatch) {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (relativeDateMatch[1].toLowerCase() === "tomorrow") {
      base.setDate(base.getDate() + 1);
    }
    date = base;
    input = input.replace(relativeDateMatch[0], " ").trim();
  }

  const weekdayMatch = input.match(
    /\b(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)\b/i,
  );
  if (weekdayMatch) {
    const key = weekdayMatch[1].toLowerCase();
    const weekday = WEEKDAY_INDEX[key];
    if (weekday !== undefined) {
      date = nextWeekdayDate(weekday);
      input = input.replace(weekdayMatch[0], " ").trim();
    }
  }

  const ampmRangeMatch = input.match(
    /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  );
  if (ampmRangeMatch) {
    const firstHourRaw = Number(ampmRangeMatch[1]);
    const firstMinute = Number(ampmRangeMatch[2] ?? "0");
    const firstPeriod = ampmRangeMatch[3].toLowerCase();
    const secondHourRaw = Number(ampmRangeMatch[4]);
    const secondMinute = Number(ampmRangeMatch[5] ?? "0");
    const secondPeriod = (ampmRangeMatch[6] ?? ampmRangeMatch[3]).toLowerCase();

    const normalizeHour = (hour: number, period: string) => {
      let normalized = hour;
      if (period === "pm" && normalized < 12) {
        normalized += 12;
      }
      if (period === "am" && normalized === 12) {
        normalized = 0;
      }
      return normalized;
    };

    const firstHour = normalizeHour(firstHourRaw, firstPeriod);
    const secondHour = normalizeHour(secondHourRaw, secondPeriod);
    if (
      !Number.isNaN(firstHour) &&
      !Number.isNaN(firstMinute) &&
      !Number.isNaN(secondHour) &&
      !Number.isNaN(secondMinute)
    ) {
      startClock = { hour: firstHour, minute: firstMinute };
      endClock = { hour: secondHour, minute: secondMinute };
      input = input.replace(ampmRangeMatch[0], " ").trim();
    }
  } else {
    const twentyFourRangeMatch = input.match(
      /\b(?:at\s*)?(\d{1,2}):(\d{2})\s*-\s*(\d{1,2})(?::(\d{2}))?\b/i,
    );
    if (twentyFourRangeMatch) {
      const firstHour = Number(twentyFourRangeMatch[1]);
      const firstMinute = Number(twentyFourRangeMatch[2]);
      const secondHour = Number(twentyFourRangeMatch[3]);
      const secondMinute = Number(twentyFourRangeMatch[4] ?? "0");
      if (
        !Number.isNaN(firstHour) &&
        !Number.isNaN(firstMinute) &&
        !Number.isNaN(secondHour) &&
        !Number.isNaN(secondMinute)
      ) {
        startClock = { hour: firstHour, minute: firstMinute };
        endClock = { hour: secondHour, minute: secondMinute };
        input = input.replace(twentyFourRangeMatch[0], " ").trim();
      }
    } else {
      const ampmTimeMatch = input.match(
        /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
      );
      if (ampmTimeMatch) {
        let hour = Number(ampmTimeMatch[1]);
        const minute = Number(ampmTimeMatch[2] ?? "0");
        const period = ampmTimeMatch[3].toLowerCase();
        if (period === "pm" && hour < 12) {
          hour += 12;
        }
        if (period === "am" && hour === 12) {
          hour = 0;
        }
        if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
          startClock = { hour, minute };
          input = input.replace(ampmTimeMatch[0], " ").trim();
        }
      } else {
        const twentyFourHourMatch = input.match(/\b(?:at\s*)?(\d{1,2}):(\d{2})\b/i);
        if (twentyFourHourMatch) {
          const hour = Number(twentyFourHourMatch[1]);
          const minute = Number(twentyFourHourMatch[2]);
          if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
            startClock = { hour, minute };
            input = input.replace(twentyFourHourMatch[0], " ").trim();
          }
        }
      }
    }
  }

  const title = input.replace(/\s+/g, " ").trim();
  if (!title) {
    return { title: "", startTime: null, endTime: null };
  }

  if (!date && (startClock || endClock)) {
    const today = new Date();
    date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  if (!date) {
    return { title, startTime: null, endTime: null };
  }

  const hour = startClock?.hour ?? 0;
  const minute = startClock?.minute ?? 0;
  return {
    title,
    startTime: toDateTimeString(date, hour, minute),
    endTime: endClock ? toDateTimeString(date, endClock.hour, endClock.minute) : null,
  };
}
