import { writable } from 'svelte/store';

const STORAGE_KEY = '3fp_merch_cart_main';

function createCartStore() {
	const { subscribe, set, update } = writable([]);

	function load() {
		if (typeof window === 'undefined') return;
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) set(parsed);
		} catch {
			// ignore malformed storage
		}
	}

	function persist(items) {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
		} catch {
			// ignore storage errors
		}
	}

	function add(item) {
		update((items) => {
			const existingIdx = items.findIndex((entry) => entry.variantId === item.variantId);
			if (existingIdx >= 0) {
				const next = [...items];
				next[existingIdx] = {
					...next[existingIdx],
					quantity: Math.min(
						20,
						Number(next[existingIdx].quantity || 0) + Number(item.quantity || 1)
					)
				};
				persist(next);
				return next;
			}
			const next = [
				...items,
				{
					variantId: item.variantId,
					productName: item.productName,
					productImageUrl: item.productImageUrl || '',
					variantName: item.variantName,
					optionValues: item.optionValues || {},
					partnerProvider: item.partnerProvider || 'manual',
					priceCents: Number(item.priceCents || 0),
					quantity: Math.max(1, Math.min(20, Number(item.quantity || 1)))
				}
			];
			persist(next);
			return next;
		});
	}

	function setQuantity(variantId, quantity) {
		update((items) => {
			const next = items
				.map((item) =>
					item.variantId === variantId
						? { ...item, quantity: Math.max(1, Math.min(20, Number(quantity || 1))) }
						: item
				)
				.filter((item) => item.quantity > 0);
			persist(next);
			return next;
		});
	}

	function remove(variantId) {
		update((items) => {
			const next = items.filter((item) => item.variantId !== variantId);
			persist(next);
			return next;
		});
	}

	function clear() {
		set([]);
		persist([]);
	}

	return { subscribe, load, add, setQuantity, remove, clear, set };
}

export const merchCart = createCartStore();
