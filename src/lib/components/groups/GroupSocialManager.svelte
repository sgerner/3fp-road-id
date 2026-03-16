<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconX from '@lucide/svelte/icons/x';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconImage from '@lucide/svelte/icons/image';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconMaximize2 from '@lucide/svelte/icons/maximize-2';
	import IconMinimize2 from '@lucide/svelte/icons/minimize-2';
	import { IMAGE_STYLE_PRESETS } from '$lib/ai/imageStyles';

	let { slug = '', canManageSocial = false, showClaimMessage = false } = $props();

	const PLATFORMS = ['facebook', 'instagram'];
	const CALENDAR_HOURS = Array.from({ length: 16 }, (_, index) => index + 6);
	const CALENDAR_STATUSES = new Set(['scheduled', 'queued', 'publishing', 'published']);
	const UPCOMING_CARD_STATUSES = new Set(['draft', 'scheduled', 'queued', 'publishing', 'failed']);
	const COMMENTS_PAGE_SIZE = 20;

	const PUBLISHABLE_STATUSES = new Set(['draft', 'scheduled', 'queued', 'failed', 'cancelled']);
	const CANCELLABLE_STATUSES = new Set(['scheduled', 'queued']);

	let loading = $state(false);
	let loadingPosts = $state(false);
	let loadError = $state('');
	let actionError = $state('');
	let actionNotice = $state('');

	let accounts = $state([]);
	let posts = $state([]);
	let comments = $state([]);
	let commentsTotal = $state(0);
	let commentsOffset = $state(0);
	let loadingComments = $state(false);
	let pendingConnections = $state([]);

	let submittingIntent = $state('');
	let syncingComments = $state(false);
	let uploadingMedia = $state(false);
	let queuedMediaFiles = $state([]);
	let composerModalOpen = $state(false);
	let composerPreviewExpanded = $state(false);
	let composerReadOnly = $state(false);
	let calendarView = $state('month');
	let calendarReference = $state(startOfMonth(new Date()));
	let showConnectionsPanel = $state(false);

	let accountActionPending = $state({});
	let postActionPending = $state({});
	let replyPending = $state({});
	let aiReplyPending = $state({});
	let replyDrafts = $state({});

	let composerTitle = $state('');
	let composerCaption = $state('');
	let composerPlatforms = $state([]);
	let composerMedia = $state([]);
	let composerScheduledFor = $state('');
	let composerAiPrompt = $state('');

	let aiPromptInput = $state('');
	let aiStyleId = $state(IMAGE_STYLE_PRESETS[0]?.id ?? 'comic_house');
	let aiGeneratedImages = $state([]);
	let generatingAi = $state(false);
	const selectedAiStyle = $derived.by(
		() => IMAGE_STYLE_PRESETS.find((preset) => preset.id === aiStyleId) ?? null
	);

	const connectedPlatforms = $derived.by(() =>
		accounts
			.filter((account) => account?.status === 'active' && typeof account?.platform === 'string')
			.map((account) => account.platform)
	);

	const effectiveScheduleBucket = $derived.by(() => {
		if (!composerScheduledFor) return null;
		const parsed = new Date(composerScheduledFor);
		if (Number.isNaN(parsed.getTime())) return null;
		const rounded = new Date(parsed);
		rounded.setSeconds(0, 0);
		const minutes = rounded.getMinutes();
		const remainder = minutes % 15;
		if (remainder !== 0) {
			rounded.setMinutes(minutes + (15 - remainder));
		}
		return rounded;
	});

	const scheduledPosts = $derived.by(() =>
		posts
			.map((post) => {
				if (!CALENDAR_STATUSES.has(normalizeStatus(post?.status))) return null;
				const scheduledAt = parsePostDate(post?.scheduled_for);
				if (!scheduledAt) return null;
				return { ...post, _scheduledAt: scheduledAt };
			})
			.filter(Boolean)
			.sort((a, b) => a._scheduledAt - b._scheduledAt)
	);

	const postsByScheduleDay = $derived.by(() =>
		scheduledPosts.reduce((acc, post) => {
			const key = toDateKey(post._scheduledAt);
			if (!key) return acc;
			(acc[key] ??= []).push(post);
			return acc;
		}, {})
	);

	const monthMatrix = $derived(buildCalendarMatrix(calendarReference, postsByScheduleDay));
	const weekDays = $derived(buildWeekDays(calendarReference, postsByScheduleDay));
	const weekRows = $derived.by(() =>
		CALENDAR_HOURS.map((hour) => ({
			hour,
			slots: weekDays.map((day) => {
				const slotDate = new Date(day.date);
				slotDate.setHours(hour, 0, 0, 0);
				const postsInHour = scheduledPosts.filter((entry) => {
					const date = entry?._scheduledAt;
					return date && isSameDay(date, day.date) && date.getHours() === hour;
				});
				return { day, date: slotDate, posts: postsInHour };
			})
		}))
	);
	const daySlots = $derived(buildDaySlots(calendarReference, scheduledPosts));
	const mobileMonthDays = $derived.by(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const weekWithToday = monthMatrix.find((week) =>
			week.some((entry) => entry.date.toDateString() === today.toDateString())
		);
		if (weekWithToday) return weekWithToday;
		const weekWithPosts = monthMatrix.find((week) => week.some((entry) => entry.posts.length > 0));
		return weekWithPosts ?? monthMatrix[0] ?? [];
	});

	const calendarHeaderText = $derived.by(() =>
		new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(calendarReference)
	);

	const weekHeaderText = $derived.by(() => {
		const week = weekDays;
		if (!week.length) return '';
		const start = week[0].date;
		const end = week[6].date;
		const startLabel = new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric'
		}).format(start);
		const endLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
			end
		);
		return `${startLabel} - ${endLabel}`;
	});

	const upcomingCards = $derived.by(() =>
		posts
			.filter((post) => UPCOMING_CARD_STATUSES.has(normalizeStatus(post?.status)))
			.sort((a, b) => {
				const aDate = resolvePostDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
				const bDate = resolvePostDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
				return aDate - bDate;
			})
	);

	const hasConnectedAccounts = $derived.by(() =>
		accounts.some((account) => account?.status === 'active')
	);

	const commentsPageStart = $derived.by(() => (commentsTotal > 0 ? commentsOffset + 1 : 0));
	const commentsPageEnd = $derived.by(() =>
		commentsTotal > 0 ? Math.min(commentsOffset + comments.length, commentsTotal) : 0
	);
	const hasPreviousCommentsPage = $derived.by(() => commentsOffset > 0);
	const hasNextCommentsPage = $derived.by(
		() => commentsOffset + comments.length < commentsTotal
	);

	const shouldShowConnectionsPanel = $derived.by(
		() => !hasConnectedAccounts || showConnectionsPanel
	);

	$effect(() => {
		const connectedSet = new Set(connectedPlatforms);
		if (!connectedSet.size) {
			if (composerPlatforms.length) composerPlatforms = [];
			return;
		}
		const filtered = composerPlatforms.filter((platform) => connectedSet.has(platform));
		if (filtered.length !== composerPlatforms.length) {
			composerPlatforms = filtered;
			return;
		}
		if (composerPlatforms.length === 0) {
			composerPlatforms = [...connectedSet];
		}
	});

	onMount(() => {
		if (canManageSocial) {
			void loadDashboard();
		}
	});

	function normalizeStatus(value) {
		if (!value) return '';
		return String(value).trim().toLowerCase();
	}

	function parsePostDate(value) {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	function resolvePostDate(post) {
		return (
			parsePostDate(post?.scheduled_for) ||
			parsePostDate(post?.published_at) ||
			parsePostDate(post?.updated_at) ||
			parsePostDate(post?.created_at)
		);
	}

	function toDateKey(date) {
		if (!date) return '';
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function startOfMonth(date) {
		return new Date(date.getFullYear(), date.getMonth(), 1);
	}

	function startOfWeek(date) {
		const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		dayStart.setDate(dayStart.getDate() - dayStart.getDay());
		return dayStart;
	}

	function addDays(date, delta) {
		const next = new Date(date);
		next.setDate(next.getDate() + delta);
		return next;
	}

	function isSameDay(a, b) {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function formatLocalDateTimeInput(date) {
		const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
		return local.toISOString().slice(0, 16);
	}

	function roundToQuarterHour(date) {
		const snapped = new Date(date);
		snapped.setSeconds(0, 0);
		const remainder = snapped.getMinutes() % 15;
		if (remainder !== 0) snapped.setMinutes(snapped.getMinutes() + (15 - remainder));
		return snapped;
	}

	function defaultSlotForDay(date, hour = 9) {
		const slot = new Date(date);
		slot.setHours(hour, 0, 0, 0);
		return slot;
	}

	function openComposerModal(prefillDate = null) {
		composerReadOnly = false;
		composerPreviewExpanded = false;
		if (prefillDate instanceof Date && !Number.isNaN(prefillDate.getTime())) {
			const snapped = roundToQuarterHour(prefillDate);
			composerScheduledFor = formatLocalDateTimeInput(snapped);
		} else if (!composerScheduledFor) {
			const next = roundToQuarterHour(new Date(Date.now() + 15 * 60 * 1000));
			composerScheduledFor = formatLocalDateTimeInput(next);
		}
		composerModalOpen = true;
	}

	function closeComposerModal() {
		composerReadOnly = false;
		composerPreviewExpanded = false;
		composerModalOpen = false;
	}

	function openPublishedPostModal(post) {
		composerReadOnly = true;
		composerPreviewExpanded = false;
		composerTitle = post?.title || '';
		composerCaption = post?.caption || '';
		composerPlatforms = Array.isArray(post?.platforms) ? [...post.platforms] : [];
		composerMedia = Array.isArray(post?.media) ? [...post.media] : [];
		composerScheduledFor = '';
		composerAiPrompt = post?.ai_prompt || '';
		composerModalOpen = true;
	}

	function toggleComposerPreviewExpanded() {
		composerPreviewExpanded = !composerPreviewExpanded;
	}

	function handleCalendarSlotClick(date, hour = 9) {
		const slot = defaultSlotForDay(date, hour);
		openComposerModal(slot);
	}

	function buildCalendarMatrix(reference, lookup) {
		const monthStart = startOfMonth(reference);
		const month = monthStart.getMonth();
		const year = monthStart.getFullYear();
		const firstDate = startOfWeek(monthStart);
		const weeks = [];

		for (let w = 0; w < 6; w += 1) {
			const days = [];
			for (let d = 0; d < 7; d += 1) {
				const current = addDays(firstDate, w * 7 + d);
				const key = toDateKey(current);
				days.push({
					date: current,
					key,
					inMonth: current.getMonth() === month && current.getFullYear() === year,
					posts: key && lookup[key] ? lookup[key] : []
				});
			}
			weeks.push(days);
		}
		return weeks;
	}

	function buildWeekDays(reference, lookup) {
		const weekStart = startOfWeek(reference);
		return Array.from({ length: 7 }, (_, index) => {
			const date = addDays(weekStart, index);
			const key = toDateKey(date);
			return {
				date,
				key,
				posts: key && lookup[key] ? lookup[key] : []
			};
		});
	}

	function buildDaySlots(reference, scheduledEntries) {
		return CALENDAR_HOURS.map((hour) => {
			const slot = new Date(reference);
			slot.setHours(hour, 0, 0, 0);
			const postsInHour = scheduledEntries.filter((entry) => {
				const date = entry?._scheduledAt;
				return date && isSameDay(date, reference) && date.getHours() === hour;
			});
			return { hour, date: slot, posts: postsInHour };
		});
	}

	function shiftCalendar(offset) {
		const next = new Date(calendarReference);
		if (calendarView === 'day') next.setDate(next.getDate() + offset);
		else if (calendarView === 'week') next.setDate(next.getDate() + offset * 7);
		else next.setMonth(next.getMonth() + offset);
		calendarReference = next;
	}

	function resetCalendarToToday() {
		calendarReference = new Date();
	}

	function formatHourLabel(hour) {
		const date = new Date();
		date.setHours(hour, 0, 0, 0);
		return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
	}

	function getDraftPreviewImage() {
		return aiGeneratedImages[0] || composerMedia[0] || null;
	}

	function platformLabel(platform) {
		if (platform === 'instagram') return 'Instagram';
		return 'Facebook';
	}

	function formatDateTime(value) {
		if (!value) return 'Not set';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Not set';
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	}

	function captionPreview(value, maxLength = 180) {
		const text = String(value || '').trim();
		if (!text) return 'No caption provided.';
		if (text.length <= maxLength) return text;
		return `${text.slice(0, maxLength - 1)}…`;
	}

	function linkedPostImageUrl(comment) {
		const linked = comment?.linked_post;
		const url = linked?.image_url;
		if (typeof url === 'string' && url.trim()) return url.trim();
		return '';
	}

	function linkedPostCaption(comment) {
		return captionPreview(comment?.linked_post?.caption || '', 140);
	}

	function commentAuthorLabel(comment) {
		const primary = String(comment?.author_name || comment?.author_username || '').trim();
		if (primary) return primary;
		const rawName = String(comment?.raw_payload?.comment?.from?.name || '').trim();
		if (rawName) return rawName;
		const rawId = String(comment?.raw_payload?.comment?.from?.id || '').trim();
		if (rawId) {
			return comment?.platform === 'facebook' ? `Facebook user (${rawId})` : rawId;
		}
		return comment?.platform === 'facebook' ? 'Facebook user' : 'Commenter';
	}

	function postPlatformsLabel(post) {
		const values = Array.isArray(post?.platforms) ? post.platforms : [];
		if (!values.length) return 'No platforms selected';
		return values.map(platformLabel).join(', ');
	}

	function postTimeLabel(post) {
		const status = normalizeStatus(post?.status);
		if (status === 'published') {
			return `Published: ${formatDateTime(post?.published_at || post?.updated_at)}`;
		}
		if (status === 'scheduled' || status === 'queued') {
			return `Scheduled: ${formatDateTime(post?.scheduled_for)}`;
		}
		if (status === 'publishing') {
			return `Publishing since: ${formatDateTime(post?.updated_at)}`;
		}
		return `Updated: ${formatDateTime(post?.updated_at || post?.created_at)}`;
	}

	function postStatusClass(status) {
		switch (normalizeStatus(status)) {
			case 'published':
				return 'chip preset-filled-success-500 text-xs';
			case 'scheduled':
			case 'queued':
				return 'chip preset-filled-secondary-500 text-xs';
			case 'publishing':
				return 'chip preset-filled-warning-500 text-xs';
			case 'failed':
				return 'chip preset-filled-error-500 text-xs';
			default:
				return 'chip preset-tonal-surface text-xs';
		}
	}

	function isPublishedPost(post) {
		return normalizeStatus(post?.status) === 'published';
	}

	function handleCalendarPostClick(post) {
		if (isPublishedPost(post)) {
			openPublishedPostModal(post);
			return;
		}
		openComposerModal(post?._scheduledAt || resolvePostDate(post) || new Date());
	}

	function accountByPlatform(platform) {
		return accounts.find((account) => account?.platform === platform) || null;
	}

	function pendingByPlatform(platform) {
		return pendingConnections.find((entry) => entry?.provider === platform) || null;
	}

	function accountStatusSummary(platform) {
		const account = accountByPlatform(platform);
		if (!account) return 'Not connected';
		if (account.status === 'active') {
			const label = account.account_name || account.username || 'Connected account';
			return `Connected: ${label}`;
		}
		if (account.status === 'revoked') return 'Disconnected';
		if (account.status === 'expired') return 'Token expired. Reconnect required.';
		if (account.status === 'error') return 'Connection error. Reconnect required.';
		return `Status: ${account.status}`;
	}

	function shouldReconnect(platform) {
		const status = accountByPlatform(platform)?.status;
		return status === 'revoked' || status === 'expired' || status === 'error';
	}

	function isConnected(platform) {
		return accountByPlatform(platform)?.status === 'active';
	}

	function toggleComposerPlatform(platform) {
		if (composerPlatforms.includes(platform)) {
			composerPlatforms = composerPlatforms.filter((value) => value !== platform);
			return;
		}
		composerPlatforms = [...composerPlatforms, platform];
	}

	function snapScheduledInput() {
		if (!composerScheduledFor) return;
		const parsed = new Date(composerScheduledFor);
		if (Number.isNaN(parsed.getTime())) return;
		const snapped = new Date(parsed);
		snapped.setSeconds(0, 0);
		const remainder = snapped.getMinutes() % 15;
		if (remainder !== 0) {
			snapped.setMinutes(snapped.getMinutes() + (15 - remainder));
		}
		const localValue = new Date(snapped.getTime() - snapped.getTimezoneOffset() * 60000)
			.toISOString()
			.slice(0, 16);
		composerScheduledFor = localValue;
	}

	function removeMediaItem(index) {
		if (composerReadOnly) return;
		composerMedia = composerMedia.filter((_, i) => i !== index);
	}

	function queueMediaFiles(event) {
		if (composerReadOnly) return;
		const files = Array.from(event.currentTarget?.files || []);
		queuedMediaFiles = files;
	}

	function setPending(mapName, key, value) {
		if (mapName === 'account') {
			accountActionPending = { ...accountActionPending, [key]: value };
			return;
		}
		if (mapName === 'post') {
			postActionPending = { ...postActionPending, [key]: value };
			return;
		}
		if (mapName === 'ai-reply') {
			aiReplyPending = { ...aiReplyPending, [key]: value };
			return;
		}
		replyPending = { ...replyPending, [key]: value };
	}

	function clearFeedback() {
		actionError = '';
		actionNotice = '';
	}

	function isBusy() {
		return (
			loading ||
			loadingPosts ||
			Boolean(submittingIntent) ||
			generatingAi ||
			syncingComments ||
			uploadingMedia
		);
	}

	function connectHref(platform) {
		const redirectTo = `/groups/${slug}/manage/social`;
		return `/api/groups/${slug}/social/connect/${platform}?redirect_to=${encodeURIComponent(redirectTo)}`;
	}

	async function requestJson(url, options = {}) {
		const response = await fetch(url, options);
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.error || 'Request failed.');
		}
		return payload;
	}

	function hydrateSocialData(socialData = {}) {
		accounts = Array.isArray(socialData.accounts) ? socialData.accounts : [];
		pendingConnections = Array.isArray(socialData.pending_connections)
			? socialData.pending_connections
			: [];
	}

	function hydrateCommentsData(payload = {}, fallbackOffset = 0) {
		const rows = Array.isArray(payload?.comments)
			? payload.comments
			: Array.isArray(payload)
				? payload
				: [];
		comments = rows;
		const pagination = payload?.pagination || {};
		const parsedOffset = Number.parseInt(String(pagination.offset ?? fallbackOffset), 10);
		commentsOffset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;
		const parsedTotal = Number.parseInt(String(pagination.total ?? rows.length), 10);
		commentsTotal = Number.isFinite(parsedTotal) ? Math.max(0, parsedTotal) : rows.length;
	}

	async function loadCommentsPage(offset = 0) {
		if (!slug) return;
		loadingComments = true;
		try {
			const safeOffset = Math.max(0, Number.parseInt(String(offset), 10) || 0);
			const payload = await requestJson(
				`/api/groups/${slug}/social/comments?limit=${COMMENTS_PAGE_SIZE}&offset=${safeOffset}`
			);
			hydrateCommentsData(payload?.data || {}, safeOffset);
		} catch (error) {
			actionError = error?.message || 'Unable to load comments.';
		} finally {
			loadingComments = false;
		}
	}

	async function refreshPosts() {
		if (!slug) return;
		loadingPosts = true;
		try {
			const payload = await requestJson(`/api/groups/${slug}/social/posts?limit=120`);
			posts = Array.isArray(payload?.data) ? payload.data : [];
		} catch (error) {
			actionError = error?.message || 'Unable to load posts.';
		} finally {
			loadingPosts = false;
		}
	}

	async function loadDashboard() {
		if (!canManageSocial || !slug) return;
		clearFeedback();
		loadError = '';
		loading = true;
		try {
			const [socialPayload, postsPayload] = await Promise.all([
				requestJson(`/api/groups/${slug}/social`),
				requestJson(`/api/groups/${slug}/social/posts?limit=120`)
			]);
			const socialData = socialPayload?.data || {};
			hydrateSocialData(socialData);
			if (Array.isArray(postsPayload?.data)) {
				posts = postsPayload.data;
			} else if (Array.isArray(socialData.posts)) {
				posts = socialData.posts;
			} else {
				posts = [];
			}
			await loadCommentsPage(0);
		} catch (error) {
			loadError = error?.message || 'Unable to load social manager data.';
		} finally {
			loading = false;
		}
	}

	async function disconnectPlatform(platform) {
		if (!slug) return;
		clearFeedback();
		setPending('account', platform, true);
		try {
			await requestJson(`/api/groups/${slug}/social/accounts/${platform}`, { method: 'DELETE' });
			actionNotice = `${platformLabel(platform)} disconnected.`;
			await loadDashboard();
		} catch (error) {
			actionError = error?.message || 'Unable to disconnect account.';
		} finally {
			setPending('account', platform, false);
		}
	}

	async function selectPendingConnection(platform, pendingId, optionId) {
		if (!slug) return;
		const key = `${platform}:${optionId}`;
		clearFeedback();
		setPending('account', key, true);
		try {
			await requestJson(`/api/groups/${slug}/social/connect/${platform}/select`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pending_id: pendingId, option_id: optionId })
			});
			actionNotice = `${platformLabel(platform)} account connected.`;
			await loadDashboard();
		} catch (error) {
			actionError = error?.message || 'Unable to complete account connection.';
		} finally {
			setPending('account', key, false);
		}
	}

	async function uploadQueuedMedia() {
		if (!slug) return;
		if (composerReadOnly) return;
		if (!queuedMediaFiles.length) {
			actionError = 'Select one or more images first.';
			return;
		}
		clearFeedback();
		uploadingMedia = true;
		try {
			const formData = new FormData();
			for (const file of queuedMediaFiles) {
				formData.append('files', file);
			}
			const payload = await requestJson(`/api/groups/${slug}/social/assets`, {
				method: 'POST',
				body: formData
			});
			const uploaded = Array.isArray(payload?.data) ? payload.data : [];
			composerMedia = [...composerMedia, ...uploaded];
			queuedMediaFiles = [];
			actionNotice = `${uploaded.length} media file${uploaded.length === 1 ? '' : 's'} uploaded.`;
		} catch (error) {
			actionError = error?.message || 'Unable to upload media files.';
		} finally {
			uploadingMedia = false;
		}
	}

	async function submitComposer(intent) {
		if (!slug) return;
		if (composerReadOnly) return;
		if (intent === 'schedule' && !composerScheduledFor) {
			actionError = 'Choose a date and time before scheduling.';
			return;
		}
		clearFeedback();
		submittingIntent = intent;
		try {
			const payload = {
				intent,
				title: composerTitle,
				caption: composerCaption,
				platforms: composerPlatforms,
				media: composerMedia,
				ai_prompt: composerAiPrompt
			};
			if (intent === 'schedule') {
				const scheduleDate = new Date(composerScheduledFor);
				if (Number.isNaN(scheduleDate.getTime())) {
					throw new Error('Choose a valid schedule date and time.');
				}
				payload.scheduled_for = scheduleDate.toISOString();
			}
			await requestJson(`/api/groups/${slug}/social/posts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (intent === 'save_draft') {
				actionNotice = 'Draft saved.';
			} else if (intent === 'schedule') {
				actionNotice = 'Post scheduled.';
			} else {
				actionNotice = 'Publish started.';
			}

			await refreshPosts();
			if (intent !== 'save_draft') {
				composerModalOpen = false;
			}
		} catch (error) {
			actionError = error?.message || 'Unable to save post.';
		} finally {
			submittingIntent = '';
		}
	}

	async function uploadGeneratedImageToSocial(imageUrl, fileName) {
		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error('Unable to fetch generated image for upload.');
		}
		const imageBlob = await response.blob();
		const mimeType = imageBlob.type || 'image/png';
		const extension = mimeType.includes('webp')
			? 'webp'
			: mimeType.includes('jpeg') || mimeType.includes('jpg')
				? 'jpg'
				: mimeType.includes('gif')
					? 'gif'
					: 'png';

		const formData = new FormData();
		formData.append('files', imageBlob, `${fileName}.${extension}`);
		const uploadPayload = await requestJson(`/api/groups/${slug}/social/assets`, {
			method: 'POST',
			body: formData
		});
		return Array.isArray(uploadPayload?.data) ? uploadPayload.data[0] : null;
	}

	async function generateAiAssistedContent() {
		if (!slug) return;
		if (!aiPromptInput.trim()) {
			actionError = 'Enter a prompt before generating content.';
			return;
		}

		clearFeedback();
		generatingAi = true;
		aiGeneratedImages = [];

		try {
			const selectedPlatforms = composerPlatforms.length
				? composerPlatforms
				: Array.from(new Set([...connectedPlatforms]));
			if (!composerPlatforms.length && selectedPlatforms.length) {
				composerPlatforms = [...selectedPlatforms];
			}

			const captionPayload = await requestJson(`/api/groups/${slug}/social/ai-caption`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ride_details: aiPromptInput,
					target_tone: 'Friendly, specific, and action-oriented',
					platforms: selectedPlatforms
				})
			});

			const caption = captionPayload?.data?.caption || '';
			const prompt = captionPayload?.data?.ai_prompt || '';
			if (caption) {
				if (composerCaption.trim() && composerCaption.trim() !== caption.trim()) {
					const overwrite = window.confirm('Replace your current caption with this AI suggestion?');
					if (overwrite) composerCaption = caption;
				} else {
					composerCaption = caption;
				}
			}
			if (prompt) composerAiPrompt = prompt;

			const generated = await requestJson('/api/ai/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					target: 'group',
					aspectRatio: '4:5',
					styleId: aiStyleId,
					prompt: aiPromptInput,
					context: {
						description: composerCaption || aiPromptInput,
						ridingDisciplines: selectedPlatforms.join(', ')
					}
				})
			});

			const generatedUrl = generated?.url || '';
			if (generatedUrl) {
				const uploaded = await uploadGeneratedImageToSocial(
					generatedUrl,
					`ai-social-4x5-${Date.now()}`
				);
				if (uploaded?.url) {
					const imageEntry = {
						...uploaded,
						aspect_ratio: '4:5',
						platform: 'instagram,facebook'
					};
					composerMedia = [...composerMedia, imageEntry];
					aiGeneratedImages = [imageEntry];
				}
			}

			if (!composerScheduledFor) {
				const next = roundToQuarterHour(new Date(Date.now() + 15 * 60 * 1000));
				composerScheduledFor = formatLocalDateTimeInput(next);
			}

			actionNotice = 'Draft generated. Review and schedule, publish now, or save as draft.';
		} catch (error) {
			actionError = error?.message || 'Unable to generate AI content.';
		} finally {
			generatingAi = false;
		}
	}

	async function runPostAction(postId, action) {
		if (!slug || !postId) return;
		const pathByAction = {
			publish: 'publish',
			retry: 'retry',
			cancel: 'cancel'
		};
		const actionPath = pathByAction[action];
		if (!actionPath) return;

		clearFeedback();
		setPending('post', postId, true);
		try {
			const payload = await requestJson(
				`/api/groups/${slug}/social/posts/${postId}/${actionPath}`,
				{
					method: 'POST'
				}
			);
			const updatedPost = payload?.data;
			if (updatedPost?.id) {
				posts = posts.map((post) => (post.id === updatedPost.id ? updatedPost : post));
			} else {
				await refreshPosts();
			}

			if (action === 'retry') actionNotice = 'Retry started.';
			if (action === 'cancel') actionNotice = 'Scheduled post cancelled.';
			if (action === 'publish') actionNotice = 'Publish started.';
		} catch (error) {
			actionError = error?.message || 'Unable to run post action.';
		} finally {
			setPending('post', postId, false);
		}
	}

	async function syncComments() {
		if (!slug) return;
		clearFeedback();
		syncingComments = true;
		try {
			const syncResult = await requestJson(`/api/groups/${slug}/social/comments/sync`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ limit: 80 })
			});
			const summary = Array.isArray(syncResult?.data?.summary) ? syncResult.data.summary : [];
			const failures = summary.filter((entry) => entry?.ok === false);
			const payload = await requestJson(`/api/groups/${slug}/social`);
			hydrateSocialData(payload?.data || {});
			await loadCommentsPage(0);
			if (failures.length) {
				const detail = failures
					.map((entry) => {
						const platform = platformLabel(entry?.platform || '');
						const reason = String(entry?.error || 'Sync failed.');
						return `${platform}: ${reason}`;
					})
					.join(' | ');
				actionError = `Some comments could not be synced. ${detail}`;
				actionNotice = '';
				showConnectionsPanel = true;
			} else {
				actionNotice = 'Comments synced.';
			}
		} catch (error) {
			actionError = error?.message || 'Unable to sync comments.';
		} finally {
			syncingComments = false;
		}
	}

	async function goToPreviousCommentsPage() {
		if (!hasPreviousCommentsPage || loadingComments) return;
		await loadCommentsPage(Math.max(0, commentsOffset - COMMENTS_PAGE_SIZE));
	}

	async function goToNextCommentsPage() {
		if (!hasNextCommentsPage || loadingComments) return;
		await loadCommentsPage(commentsOffset + COMMENTS_PAGE_SIZE);
	}

	function updateReplyDraft(commentId, value) {
		replyDrafts = { ...replyDrafts, [commentId]: value };
	}

	async function generateReplyDraft(comment) {
		const commentId = comment?.id;
		if (!slug || !commentId) return;
		clearFeedback();
		setPending('ai-reply', commentId, true);
		try {
			const payload = await requestJson(
				`/api/groups/${slug}/social/comments/${commentId}/ai-reply`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						target_tone: 'Friendly, helpful, concise'
					})
				}
			);
			const suggested = String(payload?.data?.reply || '').trim();
			if (!suggested) throw new Error('AI did not return a reply draft.');
			const existing = String(replyDrafts[commentId] || '').trim();
			if (existing && existing !== suggested) {
				const overwrite = window.confirm(
					'Replace your current reply draft with the AI suggestion?'
				);
				if (!overwrite) return;
			}
			updateReplyDraft(commentId, suggested);
			actionNotice = 'Reply draft generated.';
		} catch (error) {
			actionError = error?.message || 'Unable to generate reply draft.';
		} finally {
			setPending('ai-reply', commentId, false);
		}
	}

	async function sendReply(commentId) {
		if (!slug || !commentId) return;
		const body = String(replyDrafts[commentId] || '').trim();
		if (!body) {
			actionError = 'Reply cannot be empty.';
			return;
		}
		clearFeedback();
		setPending('reply', commentId, true);
		try {
			const payload = await requestJson(`/api/groups/${slug}/social/comments/${commentId}/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body })
			});
			const createdReply = payload?.data;
			if (createdReply?.id) {
				comments = comments.map((comment) => {
					if (comment.id !== commentId) return comment;
					const replies = Array.isArray(comment.replies) ? comment.replies : [];
					return { ...comment, replies: [createdReply, ...replies] };
				});
			}
			updateReplyDraft(commentId, '');
			actionNotice = 'Reply sent.';
		} catch (error) {
			actionError = error?.message || 'Unable to send reply.';
		} finally {
			setPending('reply', commentId, false);
		}
	}
</script>

{#if canManageSocial || showClaimMessage}
	<section
		class="card border-surface-300-700 bg-surface-100-900/70 space-y-6 rounded-2xl border p-5"
	>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="text-xl font-semibold">Social Media Manager</h2>
			</div>
			{#if canManageSocial}
				<div class="flex items-center gap-2">
					<button
						class="btn btn-sm preset-outlined-secondary-500"
						onclick={() => (showConnectionsPanel = !showConnectionsPanel)}
					>
						{shouldShowConnectionsPanel ? 'Hide Connections' : 'Manage Connections'}
					</button>
					<button
						class="btn btn-sm preset-outlined-primary-500"
						onclick={loadDashboard}
						disabled={isBusy()}
					>
						Refresh
					</button>
				</div>
			{/if}
		</div>

		{#if showClaimMessage && !canManageSocial}
			<div class="card border-warning-400-600/30 bg-warning-500/10 rounded-xl border p-4 text-sm">
				This group must be claimed first before social media management is available.
			</div>
		{:else}
			{#if loadError}
				<div class="card border-error-400-600/35 bg-error-500/10 rounded-xl border p-3 text-sm">
					{loadError}
				</div>
			{/if}
			{#if actionError}
				<div class="card border-error-400-600/35 bg-error-500/10 rounded-xl border p-3 text-sm">
					{actionError}
				</div>
			{/if}
			{#if actionNotice}
				<div class="card border-success-400-600/35 bg-success-500/10 rounded-xl border p-3 text-sm">
					{actionNotice}
				</div>
			{/if}

			{#if shouldShowConnectionsPanel}
				<section
					class="tip-card relative overflow-hidden rounded-xl p-4"
					in:fade={{ duration: 250, delay: 100 }}
				>
					<div class="tip-glow" aria-hidden="true"></div>
					<div class="relative z-10 mb-4 flex items-start gap-3">
						<div
							class="bg-secondary-500/15 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
						>
							<IconSparkles class="text-secondary-400 h-5 w-5" />
						</div>
						<div>
							<h3 class="font-semibold">Connect your social accounts</h3>
							<p class="text-sm">
								Link Facebook Pages and Instagram professional accounts to publish posts directly
								from 3FP. Scheduled posts are published in 15-minute windows.
							</p>
						</div>
					</div>
					<div class="grid gap-3 md:grid-cols-2">
						{#each PLATFORMS as platform}
							{@const account = accountByPlatform(platform)}
							{@const pending = pendingByPlatform(platform)}
							<div class="card border-surface-300-700 rounded-xl border p-4">
								<div class="flex items-start justify-between gap-3">
									<div>
										<div class="font-semibold">{platformLabel(platform)}</div>
										<div class="text-surface-700-300 mt-1 text-sm">
											{accountStatusSummary(platform)}
										</div>
										{#if account?.last_error}
											<div class="text-error-600-400 mt-1 text-xs">{account.last_error}</div>
										{/if}
									</div>
									<span
										class={account?.status === 'active'
											? 'chip preset-filled-success-500 text-xs'
											: 'chip preset-tonal-surface text-xs'}
									>
										{account?.status === 'active' ? 'Connected' : 'Not Connected'}
									</span>
								</div>
								<div class="mt-3 flex flex-wrap gap-2">
									{#if isConnected(platform)}
										<a
											href={connectHref(platform)}
											class="btn btn-sm preset-outlined-secondary-500"
										>
											Reconnect
										</a>
										<button
											class="btn btn-sm preset-outlined-error-500"
											onclick={() => disconnectPlatform(platform)}
											disabled={Boolean(accountActionPending[platform])}
										>
											{accountActionPending[platform] ? 'Disconnecting...' : 'Disconnect'}
										</button>
									{:else}
										<a href={connectHref(platform)} class="btn btn-sm preset-filled-primary-500">
											{shouldReconnect(platform) ? 'Reconnect' : 'Connect'}
										</a>
									{/if}
								</div>

								{#if pending && Array.isArray(pending.options) && pending.options.length}
									<div
										class="card border-warning-400-600/35 bg-warning-500/10 mt-3 space-y-2 rounded-lg border p-3"
									>
										<div class="text-xs font-medium">
											Choose the {platformLabel(platform)} account to connect
										</div>
										{#each pending.options as option}
											{@const optionKey = `${platform}:${option.option_id}`}
											<div class="flex items-center justify-between gap-2">
												<div class="text-xs">
													<div class="font-semibold">{option.label || option.option_id}</div>
													{#if option.description}
														<div class="text-surface-700-300">{option.description}</div>
													{/if}
												</div>
												<button
													type="button"
													class="btn btn-xs preset-filled-primary-500"
													onclick={() =>
														selectPendingConnection(platform, pending.id, option.option_id)}
													disabled={Boolean(accountActionPending[optionKey])}
												>
													{accountActionPending[optionKey] ? 'Saving...' : 'Use This'}
												</button>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<section class="space-y-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 class="text-base font-semibold">Content Calendar</h3>
						<p class="text-surface-700-300 mt-1 text-sm">
							View scheduled content by month, week, day, or upcoming cards.
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						{#if loadingPosts}
							<span class="text-surface-700-300 text-xs">Refreshing posts...</span>
						{/if}
						<button
							type="button"
							class="btn btn-sm preset-outlined-primary-500"
							onclick={refreshPosts}
							disabled={loadingPosts}
						>
							Refresh Posts
						</button>
						<button
							type="button"
							class="btn btn-sm preset-filled-secondary-500"
							onclick={() => openComposerModal()}
						>
							Schedule Content
						</button>
					</div>
				</div>

				<div
					class="bg-surface-200-800/70 border-surface-500/40 inline-flex items-center overflow-hidden rounded-lg border"
				>
					<button
						type="button"
						class={`px-3 py-1.5 text-sm transition-colors ${calendarView === 'month' ? 'bg-secondary-500/20 text-secondary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
						onclick={() => (calendarView = 'month')}
					>
						Month
					</button>
					<button
						type="button"
						class={`px-3 py-1.5 text-sm transition-colors ${calendarView === 'week' ? 'bg-secondary-500/20 text-secondary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
						onclick={() => (calendarView = 'week')}
					>
						Week
					</button>
					<button
						type="button"
						class={`px-3 py-1.5 text-sm transition-colors ${calendarView === 'day' ? 'bg-secondary-500/20 text-secondary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
						onclick={() => (calendarView = 'day')}
					>
						Day
					</button>
					<button
						type="button"
						class={`px-3 py-1.5 text-sm transition-colors ${calendarView === 'upcoming' ? 'bg-secondary-500/20 text-secondary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
						onclick={() => (calendarView = 'upcoming')}
					>
						Upcoming
					</button>
				</div>

				{#if calendarView !== 'upcoming'}
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="text-sm font-semibold">
							{calendarView === 'month'
								? calendarHeaderText
								: calendarView === 'week'
									? weekHeaderText
									: new Intl.DateTimeFormat(undefined, {
											weekday: 'long',
											month: 'long',
											day: 'numeric',
											year: 'numeric'
										}).format(calendarReference)}
						</div>
						<div class="flex gap-2">
							<button
								type="button"
								class="bg-surface-200-800/80 hover:bg-surface-300-700 text-surface-900-100 rounded-lg px-3 py-1.5 text-sm"
								onclick={() => shiftCalendar(-1)}
							>
								Prev
							</button>
							<button
								type="button"
								class="bg-surface-200-800/80 hover:bg-surface-300-700 text-surface-900-100 rounded-lg px-3 py-1.5 text-sm"
								onclick={resetCalendarToToday}
							>
								Today
							</button>
							<button
								type="button"
								class="bg-surface-200-800/80 hover:bg-surface-300-700 text-surface-900-100 rounded-lg px-3 py-1.5 text-sm"
								onclick={() => shiftCalendar(1)}
							>
								Next
							</button>
						</div>
					</div>
				{/if}

				{#key calendarView}
					<div transition:fade={{ duration: 180 }}>
						{#if calendarView === 'month'}
							<div class="grid gap-2 sm:hidden">
								{#each mobileMonthDays as day}
									<div
										role="button"
										tabindex="0"
										class={`event-card bg-surface-50-950/40 border-surface-500/20 rounded-xl border p-3 text-left ${day.inMonth ? 'text-surface-900-100' : 'text-surface-500'}`}
										onclick={() => handleCalendarSlotClick(day.date, 9)}
										onkeydown={(event) =>
											(event.key === 'Enter' || event.key === ' ') && handleCalendarSlotClick(day.date, 9)}
									>
										<div class="flex items-center justify-between">
											<div class="text-xs font-semibold">
												{new Intl.DateTimeFormat(undefined, {
													weekday: 'short',
													month: 'short',
													day: 'numeric'
												}).format(day.date)}
											</div>
											<div class="text-[11px]">{day.posts.length} posts</div>
										</div>
										{#if day.posts.length > 0}
											<div class="mt-2 space-y-1">
												{#each day.posts.slice(0, 2) as post}
													<button
														type="button"
														class={`w-full rounded px-1 py-0.5 text-left text-[11px] font-medium ${isPublishedPost(post) ? 'bg-surface-500/10 text-surface-700-300 opacity-70' : 'bg-secondary-500/10 text-secondary-800-200'}`}
														onclick={(event) => {
															event.stopPropagation();
															handleCalendarPostClick(post);
														}}
													>
														{new Intl.DateTimeFormat(undefined, {
															hour: 'numeric',
															minute: '2-digit'
														}).format(post._scheduledAt)}
														- {captionPreview(post.caption, 30)}
													</button>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
							<div class="hidden sm:block">
								<div
									class="text-surface-700-300 grid grid-cols-7 gap-0 text-center text-[11px] font-semibold tracking-wide uppercase"
								>
									<div>Sun</div>
									<div>Mon</div>
									<div>Tue</div>
									<div>Wed</div>
									<div>Thu</div>
									<div>Fri</div>
									<div>Sat</div>
								</div>
								<div class="grid grid-cols-7 gap-0">
									{#each monthMatrix as week, i}
										{#each week as day, j}
											<div
												role="button"
												tabindex="0"
												class={`event-card bg-surface-50-950/40 border-surface-500/20 hover:bg-surface-200-800/20 flex h-28 flex-col rounded-xl border p-2 text-left transition-colors ${day.inMonth ? 'text-surface-900-100' : 'text-surface-500'}`}
												style="--stagger: {(i * 7 + j) % 21}"
												onclick={() => handleCalendarSlotClick(day.date, 9)}
												onkeydown={(event) =>
													(event.key === 'Enter' || event.key === ' ') && handleCalendarSlotClick(day.date, 9)}
											>
												<div class="text-[11px] font-semibold">{day.date.getDate()}</div>
												<div class="mt-1 space-y-1 overflow-y-auto">
													{#if day.posts.length === 0}
														<p class="text-surface-500 text-[11px]">Open slot</p>
													{:else}
														{#each day.posts.slice(0, 3) as post}
															<button
																type="button"
																class={`block w-full rounded px-1 py-0.5 text-left text-[11px] font-medium ${isPublishedPost(post) ? 'bg-surface-500/10 text-surface-700-300 opacity-70' : 'bg-secondary-500/10 text-secondary-800-200'}`}
																onclick={(event) => {
																	event.stopPropagation();
																	handleCalendarPostClick(post);
																}}
															>
																{new Intl.DateTimeFormat(undefined, {
																	hour: 'numeric',
																	minute: '2-digit'
																}).format(post._scheduledAt)}
																- {captionPreview(post.caption, 36)}
															</button>
														{/each}
														{#if day.posts.length > 3}
															<div class="text-secondary-700-300 text-[10px] font-medium">
																+{day.posts.length - 3} more
															</div>
														{/if}
													{/if}
												</div>
											</div>
										{/each}
									{/each}
								</div>
							</div>
						{:else if calendarView === 'week'}
							<div class="overflow-x-auto">
								<table class="table min-w-[1100px]">
									<thead>
										<tr>
											<th class="w-24">Time</th>
											{#each weekDays as day}
												<th>
													{new Intl.DateTimeFormat(undefined, {
														weekday: 'short',
														month: 'short',
														day: 'numeric'
													}).format(day.date)}
												</th>
											{/each}
										</tr>
									</thead>
									<tbody>
										{#each weekRows as row}
											<tr>
												<td class="text-xs font-semibold whitespace-nowrap">
													{formatHourLabel(row.hour)}
												</td>
												{#each row.slots as slot}
													<td class="p-1 align-top">
														<div
															role="button"
															tabindex="0"
															class="hover:bg-surface-200-800/40 border-surface-400-600/40 min-h-16 w-full rounded-lg border p-2 text-left transition-colors"
															onclick={() => handleCalendarSlotClick(slot.day.date, row.hour)}
															onkeydown={(event) =>
																(event.key === 'Enter' || event.key === ' ') &&
																handleCalendarSlotClick(slot.day.date, row.hour)}
														>
															{#if slot.posts.length === 0}
																<div class="text-surface-600-400 text-[10px]">Open slot</div>
															{:else}
																{#each slot.posts as post}
																	<button
																		type="button"
																		class={`mb-1 block w-full rounded px-2 py-1 text-left text-[10px] ${isPublishedPost(post) ? 'bg-surface-500/10 text-surface-700-300 opacity-70' : 'bg-secondary-500/10'}`}
																		onclick={(event) => {
																			event.stopPropagation();
																			handleCalendarPostClick(post);
																		}}
																	>
																		{captionPreview(post.caption, 38)}
																	</button>
																{/each}
															{/if}
														</div>
													</td>
												{/each}
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else if calendarView === 'day'}
							<div class="card border-surface-300-700 rounded-xl border p-3">
								<div class="space-y-2">
									{#each daySlots as slot}
										<div
											role="button"
											tabindex="0"
											class="hover:bg-surface-200-800/40 border-surface-400-600/40 flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left"
											onclick={() => handleCalendarSlotClick(calendarReference, slot.hour)}
											onkeydown={(event) =>
												(event.key === 'Enter' || event.key === ' ') &&
												handleCalendarSlotClick(calendarReference, slot.hour)}
										>
											<div class="w-20 text-sm font-semibold">
												{new Intl.DateTimeFormat(undefined, {
													hour: 'numeric',
													minute: '2-digit'
												}).format(slot.date)}
											</div>
											<div class="min-w-0 flex-1">
												{#if slot.posts.length === 0}
													<div class="text-surface-600-400 text-xs">Open slot</div>
												{:else}
													{#each slot.posts as post}
														<button
															type="button"
															class={`mb-1 block w-full rounded px-2 py-1 text-left text-xs ${isPublishedPost(post) ? 'bg-surface-500/10 text-surface-700-300 opacity-70' : 'bg-secondary-500/10'}`}
															onclick={(event) => {
																event.stopPropagation();
																handleCalendarPostClick(post);
															}}
														>
															{captionPreview(post.caption, 72)}
														</button>
													{/each}
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="grid gap-3 md:grid-cols-2">
								{#if upcomingCards.length === 0}
									<div class="card border-surface-300-700 rounded-xl border p-3 text-sm">
										No upcoming content yet.
									</div>
								{:else}
									{#each upcomingCards as post}
										<div class="card border-surface-300-700 space-y-2 rounded-xl border p-3">
											<div class="flex flex-wrap items-start justify-between gap-2">
												<div class="space-y-1">
													<div class="text-sm font-semibold">{captionPreview(post.caption)}</div>
													<div class="text-surface-700-300 text-xs">{postPlatformsLabel(post)}</div>
													<div class="text-surface-700-300 text-xs">{postTimeLabel(post)}</div>
												</div>
												<span class={postStatusClass(post.status)}>{post.status || 'draft'}</span>
											</div>
											{#if post.last_publish_error}
												<div
													class="card border-error-400-600/35 bg-error-500/10 rounded-lg border p-2 text-xs"
												>
													{post.last_publish_error}
												</div>
											{/if}
											<div class="flex flex-wrap gap-2">
												{#if post.status === 'failed'}
													<button
														type="button"
														class="btn btn-sm preset-outlined-warning-500"
														onclick={() => runPostAction(post.id, 'retry')}
														disabled={Boolean(postActionPending[post.id])}
													>
														Retry
													</button>
												{/if}
												{#if CANCELLABLE_STATUSES.has(normalizeStatus(post.status))}
													<button
														type="button"
														class="btn btn-sm preset-outlined-error-500"
														onclick={() => runPostAction(post.id, 'cancel')}
														disabled={Boolean(postActionPending[post.id])}
													>
														Cancel
													</button>
												{/if}
												{#if PUBLISHABLE_STATUSES.has(normalizeStatus(post.status))}
													<button
														type="button"
														class="btn btn-sm preset-filled-primary-500"
														onclick={() => runPostAction(post.id, 'publish')}
														disabled={Boolean(postActionPending[post.id])}
													>
														Publish Now
													</button>
												{/if}
												<button
													type="button"
													class="btn btn-sm preset-outlined-secondary-500"
													onclick={() => openComposerModal(resolvePostDate(post))}
												>
													Reschedule
												</button>
											</div>
										</div>
									{/each}
								{/if}
							</div>
						{/if}
					</div>
				{/key}
			</section>

			{#if composerModalOpen}
				<div
					class="composer-backdrop"
					role="dialog"
					aria-modal="true"
					aria-label={composerReadOnly ? 'Post Details' : 'Schedule Content'}
					tabindex="-1"
					onclick={(event) => event.target === event.currentTarget && closeComposerModal()}
					onkeydown={(event) => event.key === 'Escape' && closeComposerModal()}
					transition:fade={{ duration: 200 }}
				>
					<div class="composer-panel">
						<!-- Header -->
						<div class="composer-header">
							<div class="flex items-center gap-3">
								<div class="composer-header-icon">
									<IconSparkles class="h-4 w-4" />
								</div>
								<div>
									<h3 class="composer-title">
										{composerReadOnly ? 'Scheduled Post Details' : 'Schedule Content'}
									</h3>
									<p class="composer-subtitle">
										{composerReadOnly
											? 'Published content is shown in read-only mode.'
											: 'Draft, schedule, or publish to social media'}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								{#if generatingAi}
									<span class="composer-generating-badge">
										<IconLoader class="h-3 w-3 animate-spin" />
										Generating…
									</span>
								{/if}
								<button
									type="button"
									class="composer-close-btn"
									onclick={closeComposerModal}
									aria-label="Close dialog"
								>
									<IconX class="h-4 w-4" />
								</button>
							</div>
						</div>

						<!-- Inline feedback -->
						{#if actionError}
							<div class="composer-feedback composer-feedback--error">{actionError}</div>
						{:else if actionNotice}
							<div class="composer-feedback composer-feedback--success">{actionNotice}</div>
						{/if}

						<!-- Body: two-panel on large screens -->
						<div
							class="composer-body"
							class:composer-body--preview-expanded={composerPreviewExpanded}
						>
							<!-- LEFT: Form -->
							<div class="composer-form" class:composer-form--hidden={composerPreviewExpanded}>
								<!-- AI Quick Draft Panel -->
								<section class="ai-draft-panel" class:ai-draft-panel--active={generatingAi}>
									<div class="ai-draft-panel__header">
										<IconSparkles class="h-4 w-4 flex-shrink-0" />
										<span class="ai-draft-panel__label">AI Quick Draft</span>
										<span class="ai-draft-panel__hint"
											>Caption + 4:5 image for Instagram &amp; Facebook</span
										>
									</div>
									<div class="ai-draft-panel__body">
										<textarea
											class="composer-textarea"
											bind:value={aiPromptInput}
											placeholder="What are you posting about? Include event details, tone, and call-to-action in one prompt."
											rows="3"
											disabled={composerReadOnly}
										></textarea>
										<div class="ai-draft-panel__row">
											<label class="ai-style-label">
												<span class="field-label-sm">Style</span>
												<select class="ai-style-select" bind:value={aiStyleId}>
													{#each IMAGE_STYLE_PRESETS as preset}
														<option value={preset.id}>{preset.label}</option>
													{/each}
												</select>
												{#if selectedAiStyle?.description}
													<p class="ai-style-description">{selectedAiStyle.description}</p>
												{/if}
											</label>
											<button
												type="button"
												class="ai-generate-btn"
												onclick={generateAiAssistedContent}
												disabled={generatingAi || composerReadOnly}
											>
												{#if generatingAi}
													<IconLoader class="h-4 w-4 animate-spin" />
													Generating…
												{:else}
													<IconSparkles class="h-4 w-4" />
													Generate Draft
												{/if}
											</button>
										</div>
									</div>
								</section>

								<!-- Section divider -->
								<div class="composer-divider"><span>Post Details</span></div>

								<!-- Platforms -->
								<div class="field-group">
									<div class="field-label">Publish To</div>
									<div class="platform-toggles">
										{#each PLATFORMS as platform}
											{@const active = composerPlatforms.includes(platform)}
											{@const connected = isConnected(platform)}
											<button
												type="button"
												class="platform-chip"
												class:platform-chip--active={active}
												class:platform-chip--disabled={!connected}
												onclick={() => toggleComposerPlatform(platform)}
												disabled={!connected || composerReadOnly}
												title={connected
													? platformLabel(platform)
													: `${platformLabel(platform)} — not connected`}
											>
												{#if platform === 'facebook'}
													<span class="platform-chip__icon platform-chip__icon--fb">f</span>
												{:else}
													<span class="platform-chip__icon platform-chip__icon--ig">◎</span>
												{/if}
												<span>{platformLabel(platform)}</span>
												{#if active}
													<IconCheck class="platform-chip__check h-3.5 w-3.5" />
												{/if}
											</button>
										{/each}
									</div>
								</div>

								<!-- Post Title -->
								<div class="field-group">
									<label for="composer-title" class="field-label">
										Post Title <span class="field-optional">(optional)</span>
									</label>
									<input
										id="composer-title"
										class="composer-input"
										type="text"
										maxlength="120"
										bind:value={composerTitle}
										placeholder="Weekend community ride"
										disabled={composerReadOnly}
									/>
								</div>

								<!-- Caption -->
								<div class="field-group">
									<label for="composer-caption" class="field-label">Caption</label>
									<textarea
										id="composer-caption"
										class="composer-textarea composer-textarea--tall"
										bind:value={composerCaption}
										placeholder="Share ride details, schedule, and call to action..."
										rows="5"
										disabled={composerReadOnly}
									></textarea>
								</div>

								<!-- Media Uploads -->
								<div class="field-group">
									<div class="field-label">Media</div>
									<label class="media-drop-zone" for="composer-media-input">
										<IconUpload class="h-5 w-5 opacity-50" />
										<span class="text-sm font-medium">Drop images here or <u>browse</u></span>
										<span class="text-xs opacity-60">PNG, JPG, WebP</span>
										<input
											id="composer-media-input"
											type="file"
											multiple
											accept="image/*"
											class="sr-only"
											onchange={queueMediaFiles}
											disabled={composerReadOnly}
										/>
									</label>
									{#if queuedMediaFiles.length > 0}
										<div class="media-queued-row">
											<span class="text-xs opacity-70">
												Queued: {queuedMediaFiles.map((f) => f.name).join(', ')}
											</span>
											<button
												type="button"
												class="media-upload-btn"
												onclick={uploadQueuedMedia}
												disabled={uploadingMedia || composerReadOnly}
											>
												{#if uploadingMedia}
													<IconLoader class="h-3.5 w-3.5 animate-spin" />
													Uploading…
												{:else}
													<IconUpload class="h-3.5 w-3.5" />
													Upload
												{/if}
											</button>
										</div>
									{/if}
									{#if composerMedia.length}
										<div class="media-thumbs">
											{#each composerMedia as item, index}
												<div class="media-thumb">
													{#if item.url}
														<img
															src={item.url}
															alt={item.file_name || 'media'}
															class="media-thumb__img"
														/>
													{:else}
														<IconImage class="h-6 w-6 opacity-40" />
													{/if}
													<button
														type="button"
														class="media-thumb__remove"
														onclick={() => removeMediaItem(index)}
														aria-label="Remove"
														disabled={composerReadOnly}
													>
														<IconX class="h-3 w-3" />
													</button>
												</div>
											{/each}
										</div>
									{/if}
									{#if composerPlatforms.includes('instagram') && composerMedia.length === 0}
										<div class="composer-tip composer-tip--warn">
											Instagram requires at least one uploaded image.
										</div>
									{/if}
								</div>

								<!-- Schedule Time -->
								<div class="field-group">
									<div class="field-label">
										<IconClock class="mr-0.5 inline-block h-3.5 w-3.5 align-text-bottom" />
										Schedule Time
									</div>
									<div class="schedule-row">
										<div class="schedule-row__input-wrap">
											<IconCalendar class="schedule-row__icon h-4 w-4" />
											<input
												class="composer-input schedule-row__input"
												type="datetime-local"
												step="900"
												bind:value={composerScheduledFor}
												onchange={snapScheduledInput}
												disabled={composerReadOnly}
											/>
										</div>
										<div class="schedule-row__meta">
											{#if effectiveScheduleBucket}
												<span class="schedule-slot-badge">
													<IconCheck class="h-3 w-3" />
													Publishes {new Intl.DateTimeFormat(undefined, {
														month: 'short',
														day: 'numeric',
														hour: 'numeric',
														minute: '2-digit'
													}).format(effectiveScheduleBucket)}
												</span>
											{:else}
												<span class="schedule-slot-hint">Posts in 15-min windows</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
							<!-- /composer-form -->

							<!-- RIGHT: Live preview pane -->
							<aside
								class="composer-preview"
								class:composer-preview--expanded={composerPreviewExpanded}
							>
								<div class="composer-preview__header">
									<div class="flex items-center gap-2">
										<span class="preview-label">Preview</span>
									</div>
									{#if getDraftPreviewImage()?.url}
										<button
											type="button"
											class="composer-preview-toggle"
											onclick={toggleComposerPreviewExpanded}
										>
											{#if composerPreviewExpanded}
												<IconMinimize2 class="h-3.5 w-3.5" />
												Back to editor
											{:else}
												<IconMaximize2 class="h-3.5 w-3.5" />
												View large
											{/if}
										</button>
									{/if}
								</div>
								<div class="composer-preview__image-wrap">
									{#if getDraftPreviewImage()?.url}
										<img
											src={getDraftPreviewImage().url}
											alt="Draft preview"
											class="composer-preview__image"
											class:composer-preview__image--expanded={composerPreviewExpanded}
										/>
									{:else}
										<div class="composer-preview__placeholder">
											<IconImage class="h-10 w-10" />
											<span class="mt-2 text-center text-xs"
												>Image appears here after generation</span
											>
										</div>
									{/if}
								</div>
								<div class="composer-preview__caption">
									{#if composerCaption.trim()}
										<p class="text-sm leading-relaxed">{captionPreview(composerCaption, 300)}</p>
									{:else}
										<p class="text-sm italic opacity-30">Your caption will appear here…</p>
									{/if}
								</div>
								{#if effectiveScheduleBucket}
									<div class="composer-preview__time">
										<IconClock class="h-3 w-3 flex-shrink-0" />
										{new Intl.DateTimeFormat(undefined, {
											weekday: 'short',
											month: 'short',
											day: 'numeric',
											hour: 'numeric',
											minute: '2-digit'
										}).format(effectiveScheduleBucket)}
									</div>
								{/if}
							</aside>
						</div>
						<!-- /composer-body -->

						<!-- Sticky Footer -->
						<div class="composer-footer">
							{#if composerReadOnly}
								<div class="w-full text-right">
									<button type="button" class="composer-btn composer-btn--ghost" onclick={closeComposerModal}>
										Close
									</button>
								</div>
							{:else}
								<button
									type="button"
									class="composer-btn composer-btn--ghost"
									onclick={() => submitComposer('save_draft')}
									disabled={Boolean(submittingIntent)}
								>
									{submittingIntent === 'save_draft' ? 'Saving…' : 'Save Draft'}
								</button>
								<div class="composer-footer__actions">
									<button
										type="button"
										class="composer-btn composer-btn--schedule"
										onclick={() => submitComposer('schedule')}
										disabled={Boolean(submittingIntent)}
									>
										{#if submittingIntent === 'schedule'}
											<IconLoader class="h-4 w-4 animate-spin" />
											Scheduling…
										{:else}
											<IconCalendar class="h-4 w-4" />
											Schedule
										{/if}
									</button>
									<button
										type="button"
										class="composer-btn composer-btn--publish"
										onclick={() => submitComposer('publish_now')}
										disabled={Boolean(submittingIntent)}
									>
										{#if submittingIntent === 'publish_now'}
											<IconLoader class="h-4 w-4 animate-spin" />
											Publishing…
										{:else}
											Publish Now
										{/if}
									</button>
								</div>
							{/if}
						</div>
					</div>
					<!-- /composer-panel -->
				</div>
				<!-- /composer-backdrop -->
			{/if}

			<section class="space-y-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 class="text-base font-semibold">Comments</h3>
						<div class="text-surface-700-300 mt-1 text-xs">
							{#if loadingComments}
								Loading comments...
							{:else if commentsTotal > 0}
								Showing {commentsPageStart}-{commentsPageEnd} of {commentsTotal}
							{:else}
								No synced comments yet.
							{/if}
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="btn btn-sm preset-outlined-secondary-500"
							onclick={goToPreviousCommentsPage}
							disabled={!hasPreviousCommentsPage || loadingComments || syncingComments}
						>
							Prev
						</button>
						<button
							type="button"
							class="btn btn-sm preset-outlined-secondary-500"
							onclick={goToNextCommentsPage}
							disabled={!hasNextCommentsPage || loadingComments || syncingComments}
						>
							Next
						</button>
						<button
							type="button"
							class="btn btn-sm preset-outlined-primary-500"
							onclick={syncComments}
							disabled={syncingComments || loadingComments}
						>
							{syncingComments ? 'Syncing...' : 'Sync Comments'}
						</button>
					</div>
				</div>
				{#if loadingComments}
					<div class="card border-surface-300-700 rounded-xl border p-3 text-sm">
						Loading comments...
					</div>
				{:else if !comments.length}
					<div class="card border-surface-300-700 rounded-xl border p-3 text-sm">
						No comments yet.
					</div>
				{:else}
					<div class="space-y-3">
						{#each comments as comment}
							<div class="card border-surface-300-700 space-y-3 rounded-xl border p-3">
								<div class="flex flex-wrap items-start justify-between gap-2">
									<div>
										<div class="text-sm font-semibold">
											{commentAuthorLabel(comment)}
										</div>
										<div class="text-surface-700-300 text-xs">
											{platformLabel(comment.platform)} • {formatDateTime(comment.commented_at)}
										</div>
									</div>
									{#if comment.can_reply}
										<span class="chip preset-tonal-success text-xs">Reply enabled</span>
									{:else}
										<span class="chip preset-tonal-warning text-xs">Reply unavailable</span>
									{/if}
								</div>

								<div class="text-sm">{comment.body}</div>

								{#if comment.linked_post}
									<div class="comment-context card border-surface-300-700 rounded-lg border p-2">
										<div class="text-surface-700-300 mb-2 text-[11px] font-semibold uppercase">
											Commented On Post
										</div>
										<div class="comment-context__row">
											{#if linkedPostImageUrl(comment)}
												<img
													src={linkedPostImageUrl(comment)}
													alt="Associated post"
													class="comment-context__image"
												/>
											{/if}
											<div class="min-w-0 flex-1 space-y-1">
												<div class="text-xs">{linkedPostCaption(comment)}</div>
												<div class="text-surface-700-300 text-[11px]">
													{comment.linked_post.origin === 'group_social_post'
														? 'Published from 3FP'
														: 'Synced from platform'}
													{#if comment.linked_post.created_at}
														• {formatDateTime(comment.linked_post.created_at)}
													{/if}
												</div>
												{#if comment.linked_post.permalink_url}
													<a
														href={comment.linked_post.permalink_url}
														target="_blank"
														rel="noopener noreferrer"
														class="text-secondary-400 text-[11px] underline"
													>
														Open original post
													</a>
												{/if}
											</div>
										</div>
									</div>
								{/if}

								{#if Array.isArray(comment.replies) && comment.replies.length}
									<div class="space-y-2">
										<div class="text-surface-700-300 text-xs font-medium">Replies</div>
										{#each comment.replies as reply}
											<div class="card border-surface-300-700 rounded-lg border p-2 text-xs">
												<div>{reply.body}</div>
												<div class="text-surface-700-300 mt-1">
													{reply.status || 'sent'} • {formatDateTime(reply.created_at)}
												</div>
											</div>
										{/each}
									</div>
								{/if}

								<div class="space-y-2">
									<textarea
										class="textarea min-h-20"
										placeholder="Write a reply..."
										value={replyDrafts[comment.id] || ''}
										oninput={(event) => updateReplyDraft(comment.id, event.currentTarget.value)}
										disabled={!comment.can_reply}
									></textarea>
									<div class="flex flex-wrap gap-2">
										<button
											type="button"
											class="btn btn-sm preset-outlined-secondary-500"
											onclick={() => generateReplyDraft(comment)}
											disabled={!comment.can_reply || Boolean(aiReplyPending[comment.id])}
										>
											{#if aiReplyPending[comment.id]}
												<IconLoader class="h-3.5 w-3.5 animate-spin" />
												Generating...
											{:else}
												<IconSparkles class="h-3.5 w-3.5" />
												Generate Reply
											{/if}
										</button>
										<button
											type="button"
											class="btn btn-sm preset-filled-primary-500"
											onclick={() => sendReply(comment.id)}
											disabled={
												!comment.can_reply ||
												Boolean(replyPending[comment.id]) ||
												Boolean(aiReplyPending[comment.id])
											}
										>
											{replyPending[comment.id] ? 'Sending...' : 'Send'}
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</section>
{/if}

<style>
	/* ─── Existing tip-card / glow (unchanged) ─── */
	.tip-card {
		background: color-mix(in oklab, var(--color-secondary-500) 6%, var(--color-surface-900) 94%);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.tip-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 50% 40% at 0% 100%,
			color-mix(in oklab, var(--color-secondary-500) 10%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	/* ─── Composer Modal ─── */

	.composer-backdrop {
		position: fixed;
		inset: 0;
		margin: 0;
		z-index: 50;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0;
		background: color-mix(in oklab, var(--color-surface-950) 85%, transparent);
		backdrop-filter: blur(8px);
	}

	@media (min-width: 640px) {
		.composer-backdrop {
			align-items: center;
		}
	}

	.composer-panel {
		width: 100%;
		max-width: 42rem;
		max-height: 95dvh;
		display: flex;
		flex-direction: column;
		border-radius: 1.5rem 1.5rem 0 0;
		background: color-mix(in oklab, var(--color-surface-900) 97%, var(--color-secondary-500) 3%);
		border: 1px solid
			color-mix(in oklab, var(--color-surface-700) 60%, var(--color-secondary-500) 40%);
		box-shadow:
			0 -4px 40px -8px color-mix(in oklab, var(--color-secondary-500) 20%, transparent),
			0 25px 60px -12px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}

	@media (min-width: 640px) {
		.composer-panel {
			max-width: 42rem;
			border-radius: 1.5rem;
			max-height: 90dvh;
		}
	}

	@media (min-width: 1024px) {
		.composer-panel {
			max-width: 64rem;
		}
	}

	/* Header */
	.composer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1.125rem 1.25rem 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		flex-shrink: 0;
	}

	.composer-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		color: var(--color-secondary-300);
		flex-shrink: 0;
	}

	.composer-title {
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.25;
		color: var(--color-surface-50);
	}

	.composer-subtitle {
		font-size: 0.75rem;
		color: var(--color-surface-400);
		margin-top: 0.125rem;
	}

	.composer-generating-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--color-secondary-300);
		background: color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
		animation: pulse 2s infinite;
	}

	.composer-close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		color: var(--color-surface-400);
		transition:
			background 0.15s,
			color 0.15s;
	}

	.composer-close-btn:hover {
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		color: var(--color-surface-100);
	}

	/* Feedback banner */
	.composer-feedback {
		padding: 0.625rem 1.25rem;
		font-size: 0.8125rem;
		font-weight: 500;
		flex-shrink: 0;
	}

	.composer-feedback--error {
		background: color-mix(in oklab, var(--color-error-500) 12%, transparent);
		color: var(--color-error-300);
		border-bottom: 1px solid color-mix(in oklab, var(--color-error-500) 25%, transparent);
	}

	.composer-feedback--success {
		background: color-mix(in oklab, var(--color-success-500) 12%, transparent);
		color: var(--color-success-300);
		border-bottom: 1px solid color-mix(in oklab, var(--color-success-500) 25%, transparent);
	}

	/* Body layout */
	.composer-body {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	@media (min-width: 1024px) {
		.composer-body {
			flex-direction: row;
			overflow: hidden;
		}
	}

	.composer-form {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1.125rem;
		padding: 1.25rem;
		overflow-y: auto;
	}

	.composer-form--hidden {
		display: none;
	}

	/* ─── AI Draft Panel ─── */
	.ai-draft-panel {
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 8%, var(--color-surface-950) 92%);
		transition: box-shadow 0.3s;
	}

	.ai-draft-panel--active {
		box-shadow: 0 0 28px -6px color-mix(in oklab, var(--color-secondary-500) 35%, transparent);
		animation: ai-shimmer 2.5s linear infinite;
	}

	@keyframes ai-shimmer {
		0%,
		100% {
			border-color: color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
		}
		50% {
			border-color: color-mix(in oklab, var(--color-secondary-400) 55%, transparent);
		}
	}

	.ai-draft-panel__header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-300);
	}

	.ai-draft-panel__label {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.ai-draft-panel__hint {
		font-size: 0.6875rem;
		opacity: 0.55;
		margin-left: auto;
		display: none;
	}

	@media (min-width: 480px) {
		.ai-draft-panel__hint {
			display: block;
		}
	}

	.ai-draft-panel__body {
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ai-draft-panel__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
	}

	.ai-style-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex-grow: 1;
	}

	.ai-style-select {
		padding: 0.375rem 0.625rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		background: color-mix(in oklab, var(--color-surface-800) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		color: var(--color-surface-100);
		min-width: 10rem;
	}

	.ai-style-description {
		font-size: 0.75rem;
		line-height: 1.3;
		color: color-mix(in oklab, var(--color-surface-100) 78%, transparent);
	}

	.ai-generate-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.125rem;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 600;
		background: var(--color-secondary-600);
		color: white;
		flex: 1;
		justify-content: center;
		max-width: max-content;
		transition:
			background 0.2s,
			box-shadow 0.2s;
	}

	.ai-generate-btn:hover:not(:disabled) {
		background: var(--color-secondary-500);
		box-shadow: 0 0 22px -4px color-mix(in oklab, var(--color-secondary-500) 55%, transparent);
	}

	.ai-generate-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* ─── Field helpers ─── */
	.composer-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-surface-500);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.composer-divider::before,
	.composer-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-surface-400);
	}

	.field-label-sm {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-surface-400);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.field-optional {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		opacity: 0.55;
	}

	/* ─── Platform chips ─── */
	.platform-toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.platform-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.875rem;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 500;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 60%, transparent);
		color: var(--color-surface-300);
		transition: all 0.15s;
		cursor: pointer;
	}

	.platform-chip:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		border-color: var(--color-surface-500);
	}

	.platform-chip--active {
		background: color-mix(in oklab, var(--color-primary-500) 18%, var(--color-surface-900) 82%);
		border-color: color-mix(in oklab, var(--color-primary-500) 60%, transparent);
		color: var(--color-primary-300);
		box-shadow: 0 0 14px -4px color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}

	.platform-chip--disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	.platform-chip__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 0.3125rem;
		font-size: 0.75rem;
		font-weight: 800;
		line-height: 1;
		flex-shrink: 0;
	}

	.platform-chip__icon--fb {
		background: #1877f2;
		color: white;
	}

	.platform-chip__icon--ig {
		background: linear-gradient(
			135deg,
			#f09433 0%,
			#e6683c 25%,
			#dc2743 50%,
			#cc2366 75%,
			#bc1888 100%
		);
		color: white;
	}

	.platform-chip__check {
		margin-left: 0.125rem;
		opacity: 0.8;
	}

	/* ─── Form inputs ─── */
	.composer-input {
		width: 100%;
		padding: 0.5625rem 0.75rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-800) 70%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		color: var(--color-surface-100);
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
		outline: none;
	}

	.composer-input:focus {
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.composer-textarea {
		width: 100%;
		resize: vertical;
		padding: 0.625rem 0.75rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		line-height: 1.5;
		background: color-mix(in oklab, var(--color-surface-800) 70%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		color: var(--color-surface-100);
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
		outline: none;
	}

	.composer-textarea:focus {
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.composer-textarea--tall {
		min-height: 7rem;
	}

	/* ─── Media drop zone ─── */
	.media-drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 1.25rem;
		border-radius: 0.75rem;
		border: 2px dashed color-mix(in oklab, var(--color-surface-600) 55%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 30%, transparent);
		color: var(--color-surface-300);
		cursor: pointer;
		transition:
			border-color 0.2s,
			background 0.2s;
	}

	.media-drop-zone:hover {
		border-color: color-mix(in oklab, var(--color-secondary-500) 50%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 6%, transparent);
	}

	.media-queued-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-surface-700) 30%, transparent);
		color: var(--color-surface-400);
	}

	.media-upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-300);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 35%, transparent);
		transition: background 0.15s;
	}

	.media-upload-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.media-thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.media-thumb {
		position: relative;
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 0.5rem;
		overflow: hidden;
		background: color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 40%, transparent);
	}

	.media-thumb__img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.media-thumb__remove {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 9999px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		transition: background 0.15s;
	}

	.media-thumb__remove:hover {
		background: color-mix(in oklab, var(--color-error-500) 70%, black 30%);
	}

	.comment-context {
		background: color-mix(in oklab, var(--color-surface-800) 35%, transparent);
	}

	.comment-context__row {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
	}

	.comment-context__image {
		width: 3.25rem;
		height: 3.25rem;
		flex-shrink: 0;
		border-radius: 0.375rem;
		object-fit: cover;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 40%, transparent);
	}

	/* ─── Tips ─── */
	.composer-tip {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
	}

	.composer-tip--warn {
		background: color-mix(in oklab, var(--color-warning-500) 12%, transparent);
		color: var(--color-warning-300);
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 25%, transparent);
	}

	/* ─── Schedule row ─── */
	.schedule-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (min-width: 480px) {
		.schedule-row {
			flex-direction: row;
			align-items: center;
		}
	}

	.schedule-row__input-wrap {
		position: relative;
		flex: 1;
	}

	.schedule-row__icon {
		position: absolute;
		left: 0.625rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--color-surface-500);
		pointer-events: none;
	}

	.schedule-row__input {
		padding-left: 2.125rem;
	}

	.schedule-row__meta {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.schedule-slot-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
		padding: 0.3125rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-success-300);
		background: color-mix(in oklab, var(--color-success-500) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-success-500) 28%, transparent);
		white-space: nowrap;
	}

	.schedule-slot-hint {
		font-size: 0.75rem;
		color: var(--color-surface-500);
		white-space: nowrap;
	}

	/* ─── Preview pane ─── */
	.composer-preview {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-700) 50%, transparent);
	}

	@media (min-width: 1024px) {
		.composer-preview {
			width: 16rem;
			flex-shrink: 0;
			border-top: none;
			border-left: 1px solid color-mix(in oklab, var(--color-surface-700) 50%, transparent);
			overflow-y: auto;
			background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		}
	}

	.composer-preview__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.composer-preview-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-primary-300);
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 35%, transparent);
		transition: background 0.15s;
	}

	.composer-preview-toggle:hover {
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
	}

	.preview-label {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-surface-500);
	}

	.preview-platform-badge {
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--color-secondary-400);
		padding: 0.1875rem 0.5rem;
		background: color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
		border-radius: 9999px;
	}

	.composer-preview__image-wrap {
		border-radius: 0.625rem;
		overflow: hidden;
		background: color-mix(in oklab, var(--color-surface-800) 60%, transparent);
		aspect-ratio: 4 / 5;
		border: 1px solid color-mix(in oklab, var(--color-surface-700) 40%, transparent);
	}

	.composer-preview__image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.composer-preview__image--expanded {
		object-fit: contain;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
	}

	.composer-preview__placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: var(--color-surface-500);
	}

	.composer-preview__caption {
		font-size: 0.8125rem;
		color: var(--color-surface-200);
		line-height: 1.5;
		min-height: 2.5rem;
	}

	.composer-preview__time {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--color-surface-400);
		padding: 0.25rem 0.625rem;
		background: color-mix(in oklab, var(--color-surface-700) 35%, transparent);
		border-radius: 0.375rem;
		align-self: flex-start;
	}

	.composer-body--preview-expanded {
		display: block;
	}

	.composer-preview--expanded {
		width: 100%;
		border-top: none;
		border-left: none;
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
	}

	.composer-preview--expanded .composer-preview__image-wrap {
		aspect-ratio: auto;
		height: min(65dvh, 42rem);
	}

	/* ─── Footer ─── */
	.composer-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.625rem;
		padding: 0.875rem 1.25rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		flex-shrink: 0;
	}

	.composer-footer__actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.composer-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4375rem;
		padding: 0.5625rem 1.125rem;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 600;
		transition: all 0.18s;
		white-space: nowrap;
	}

	.composer-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.composer-btn--ghost {
		color: var(--color-surface-400);
		background: transparent;
	}

	.composer-btn--ghost:hover:not(:disabled) {
		color: var(--color-surface-200);
		background: color-mix(in oklab, var(--color-surface-700) 40%, transparent);
	}

	.composer-btn--schedule {
		background: color-mix(in oklab, var(--color-secondary-500) 20%, var(--color-surface-800) 80%);
		color: var(--color-secondary-300);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	.composer-btn--schedule:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-secondary-500) 30%, var(--color-surface-800) 70%);
		box-shadow: 0 0 18px -4px color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	.composer-btn--publish {
		background: var(--color-primary-500);
		color: var(--color-primary-950);
		font-weight: 700;
	}

	.composer-btn--publish:hover:not(:disabled) {
		background: var(--color-primary-400);
		box-shadow: 0 0 20px -4px color-mix(in oklab, var(--color-primary-500) 50%, transparent);
	}

	/* Pulse animation */
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.65;
		}
	}

	/* ─── Legacy unused classes kept for safety ─── */
	.ai-panel {
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 8%, var(--color-surface-900) 92%);
	}

	.ai-panel-header {
		border-bottom: 1px solid color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-300);
	}
</style>
