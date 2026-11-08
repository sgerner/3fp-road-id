/**
 * Build six Sunday-first weeks for a month using the caller's date keys.
 * @template T
 * @param {Date} reference
 * @param {Record<string, T[]>} itemsByDate
 * @param {(date: Date) => string} toDateKey
 */
export function buildMonthGrid(reference, itemsByDate, toDateKey) {
	const month = reference.getMonth();
	const year = reference.getFullYear();
	const firstDate = new Date(year, month, 1);
	firstDate.setDate(firstDate.getDate() - firstDate.getDay());

	return Array.from({ length: 6 }, (_, week) =>
		Array.from({ length: 7 }, (_, weekday) => {
			const date = new Date(firstDate);
			date.setDate(firstDate.getDate() + week * 7 + weekday);
			const key = toDateKey(date);
			return {
				date,
				key,
				inMonth: date.getMonth() === month && date.getFullYear() === year,
				items: itemsByDate[key] ?? []
			};
		})
	);
}
