export function convertUTCToIST(utcDate: Date): Date {
  return new Date(utcDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  switch (period) {
    case 'today':
      return { startDate: today, endDate: tomorrow };
    case 'yesterday':
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      return { startDate: yesterday, endDate: today };
    case 'last7days':
    case '7days':
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
      return { startDate: sevenDaysAgo, endDate: tomorrow };
    case 'last30days':
    case '30days':
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
      return { startDate: thirtyDaysAgo, endDate: tomorrow };
    case 'thisMonth':
      const firstOfMonth = new Date(today);
      firstOfMonth.setUTCDate(1);
      return { startDate: firstOfMonth, endDate: tomorrow };
    case 'lastMonth':
      const firstOfLastMonth = new Date(today);
      firstOfLastMonth.setUTCMonth(firstOfLastMonth.getUTCMonth() - 1);
      firstOfLastMonth.setUTCDate(1);
      const firstOfThisMonth = new Date(today);
      firstOfThisMonth.setUTCDate(1);
      return { startDate: firstOfLastMonth, endDate: firstOfThisMonth };
    case '3months':
      const threeMonthsAgo = new Date(today);
      threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
      return { startDate: threeMonthsAgo, endDate: tomorrow };
    default:
      return { startDate: today, endDate: tomorrow };
  }
}

export function getCustomDateRange(startDate: string, endDate: string): { startDate: Date; endDate: Date } {
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);
  return { startDate: start, endDate: end };
}

export function formatDateIST(date: Date): string {
  const istDate = convertUTCToIST(date);
  return istDate.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTimeIST(date: Date): string {
  const istDate = convertUTCToIST(date);
  return istDate.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getHourOfDay(date: Date): number {
  const istDate = convertUTCToIST(date);
  return istDate.getHours();
}

export function getDayOfWeek(date: Date): string {
  const istDate = convertUTCToIST(date);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[istDate.getDay()];
}

export function getDateOnlyIST(date: Date): Date {
  const istDate = convertUTCToIST(date);
  const dateOnly = new Date(istDate);
  dateOnly.setHours(0, 0, 0, 0);
  return dateOnly;
}

export function isSameDay(date1: Date, date2: Date): boolean {
  const d1 = getDateOnlyIST(date1);
  const d2 = getDateOnlyIST(date2);
  return d1.getTime() === d2.getTime();
}

export function isAfterDate(date: string): (dt: Date) => boolean {
  return (dt: Date) => {
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return getDateOnlyIST(dt) > compareDate;
  };
}

export function isBeforeDate(date: string): (dt: Date) => boolean {
  return (dt: Date) => {
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return getDateOnlyIST(dt) < compareDate;
  };
}
