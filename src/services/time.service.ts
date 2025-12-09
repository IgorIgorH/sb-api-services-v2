/**
 * Time Service
 *
 * Fetches current date/time from external API to ensure AI assistants
 * always know the correct current date, regardless of server clock.
 */

interface TimeApiResponse {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  seconds: number;
  milliSeconds: number;
  dateTime: string;
  date: string;
  time: string;
  timeZone: string;
  dayOfWeek: string;
  dstActive: boolean;
}

interface FormattedDateTime {
  formatted: string;
  unixTimestamp: number;
  date: string;
  time: string;
  dayOfWeek: string;
  timezone: string;
}

// Cache the time for 1 second to avoid excessive API calls
let cachedTime: FormattedDateTime | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 1000; // 1 second cache

/**
 * Format a Date object into a human-readable string for AI context
 */
function formatDateForAI(
  date: Date,
  dayOfWeek: string,
  timezone: string,
): FormattedDateTime {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  };

  const formatted = date.toLocaleString('en-US', options);
  const unixTimestamp = Math.floor(date.getTime() / 1000);

  return {
    formatted,
    unixTimestamp,
    date: date.toISOString().split('T')[0],
    time: date.toTimeString().split(' ')[0],
    dayOfWeek,
    timezone,
  };
}

/**
 * Fetch current time from external API
 * Falls back to server time if API fails
 */
export async function getCurrentDateTime(): Promise<string> {
  const now = Date.now();

  // Return cached result if still valid
  if (cachedTime && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTime.formatted + ` (Unix: ${cachedTime.unixTimestamp})`;
  }

  try {
    // Try timeapi.io first
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(
      'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Time API returned ${response.status}`);
    }

    const data: TimeApiResponse = await response.json();

    // Parse the API response
    const apiDate = new Date(data.dateTime);
    const result = formatDateForAI(apiDate, data.dayOfWeek, data.timeZone);

    // Cache the result
    cachedTime = result;
    cacheTimestamp = now;

    console.log(`[TimeService] Got time from API: ${result.formatted}`);
    return `${result.formatted} (Unix: ${result.unixTimestamp})`;
  } catch (error: any) {
    // Fallback to server time
    console.warn(
      `[TimeService] External API failed, using server time: ${error.message}`,
    );

    const serverDate = new Date();
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const result = formatDateForAI(
      serverDate,
      dayNames[serverDate.getUTCDay()],
      'UTC',
    );

    // Cache the fallback result
    cachedTime = result;
    cacheTimestamp = now;

    return `${result.formatted} (Unix: ${result.unixTimestamp})`;
  }
}

/**
 * Get full time information object (for session context)
 */
export async function getTimeInfo(): Promise<FormattedDateTime> {
  const now = Date.now();

  if (cachedTime && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTime;
  }

  // Call getCurrentDateTime to populate cache
  await getCurrentDateTime();
  return cachedTime!;
}
