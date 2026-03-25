<script>
	import { onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';
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
	import IconMessageCircle from '@lucide/svelte/icons/message-circle';
	import IconReply from '@lucide/svelte/icons/reply';
	import IconSend from '@lucide/svelte/icons/send';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconFacebook from '@lucide/svelte/icons/facebook';
	import IconInstagram from '@lucide/svelte/icons/instagram';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconCornerDownRight from '@lucide/svelte/icons/corner-down-right';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import {
		BIKE_VIBE_STYLE_ID,
		IMAGE_STYLE_PRESETS,
		STATE_MASCOT_STYLE_ID
	} from '$lib/ai/imageStyles';
	import { BIKE_VIBE_OPTIONS, getBikeVibeById } from '$lib/ai/bikeVibes';
	import { getUsStateName, normalizeUsStateCode, US_STATE_OPTIONS } from '$lib/geo/usStates';
	import { toaster } from '../../../routes/toaster-svelte';

	let { slug = '', canManageSocial = false, showClaimMessage = false, group = null } = $props();

	const PLATFORMS = ['facebook', 'instagram'];
	const CALENDAR_HOURS = Array.from({ length: 16 }, (_, index) => index + 6);
	const CALENDAR_STATUSES = new Set(['scheduled', 'queued', 'publishing', 'published', 'failed']);
	const UPCOMING_CARD_STATUSES = new Set(['draft', 'scheduled', 'queued', 'publishing', 'failed']);
	const COMMENTS_PAGE_SIZE = 20;

	const PUBLISHABLE_STATUSES = new Set(['draft', 'scheduled', 'queued', 'failed', 'cancelled']);

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
	let autoCommentSyncStarted = $state(false);

	let submittingIntent = $state('');
	let syncingComments = $state(false);
	let uploadingMedia = $state(false);
	let queuedMediaFiles = $state([]);
	let composerModalOpen = $state(false);
	let composerPreviewExpanded = $state(false);
	let composerReadOnly = $state(false);
	let calendarView = $state('month');
	let calendarReference = $state(new Date());
	let showConnectionsPanel = $state(false);
	let socialConnectionsResolved = $state(false);

	let accountActionPending = $state({});
	let postActionPending = $state({});
	let replyPending = $state({});
	let aiReplyPending = $state({});
	let replyDrafts = $state({});

	let composerCaption = $state('');
	let composerPlatforms = $state([]);
	let composerMedia = $state([]);
	let composerScheduledFor = $state('');
	let composerAiPrompt = $state('');

	let aiPromptInput = $state('');
	let aiStyleId = $state(IMAGE_STYLE_PRESETS[0]?.id ?? 'comic_house');
	let aiGeneratedImages = $state([]);
	let generatingAi = $state(false);
	let groupProfile = $state(null);
	let aiSelectedStateCode = $state('');
	let aiSelectedBikeVibeId = $state('');
	let aiResolvingState = $state(false);
	const selectedAiStyle = $derived.by(
		() => IMAGE_STYLE_PRESETS.find((preset) => preset.id === aiStyleId) ?? null
	);
	const requiresAiStateSelection = $derived(aiStyleId === STATE_MASCOT_STYLE_ID);
	const requiresAiBikeVibeSelection = $derived(aiStyleId === BIKE_VIBE_STYLE_ID);

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
	const hasNextCommentsPage = $derived.by(() => commentsOffset + comments.length < commentsTotal);

	const shouldShowConnectionsPanel = $derived.by(
		() => socialConnectionsResolved && (!hasConnectedAccounts || showConnectionsPanel)
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
		}
	});

	onMount(() => {
		if (canManageSocial) {
			void loadDashboard();
		}
	});

	$effect(() => {
		if (!groupProfile && group) {
			groupProfile = group;
		}
	});

	function inferGroupStateCode() {
		const directCandidates = [
			groupProfile?.state_region,
			group?.state_region,
			groupProfile?.state,
			group?.state
		];
		for (const value of directCandidates) {
			const normalized = normalizeUsStateCode(value);
			if (normalized) return normalized;
		}
		const locationCandidates = [
			[groupProfile?.city, groupProfile?.state_region, groupProfile?.country]
				.filter(Boolean)
				.join(', '),
			[group?.city, group?.state_region, group?.country].filter(Boolean).join(', ')
		];
		for (const value of locationCandidates) {
			const parts = String(value ?? '')
				.split(/[,\u00b7|/]+/g)
				.map((part) => part.trim())
				.filter(Boolean);
			for (const part of parts.reverse()) {
				const normalized = normalizeUsStateCode(part);
				if (normalized) return normalized;
			}
		}
		return '';
	}

	async function resolveAiDefaultStateSelection() {
		if (aiSelectedStateCode || !requiresAiStateSelection || aiResolvingState) return;
		aiResolvingState = true;
		try {
			const fromGroup = inferGroupStateCode();
			if (fromGroup) {
				aiSelectedStateCode = fromGroup;
				return;
			}
			const response = await fetch('/api/location/region');
			const payload = await response.json().catch(() => ({}));
			const fromIp = normalizeUsStateCode(payload?.stateCode);
			if (response.ok && fromIp) aiSelectedStateCode = fromIp;
		} catch {
			// Best effort only.
		} finally {
			aiResolvingState = false;
		}
	}

	$effect(() => {
		if (requiresAiStateSelection) {
			void resolveAiDefaultStateSelection();
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

	function openComposerModal(prefillDate = null, options = {}) {
		const sourcePost = options?.post && typeof options.post === 'object' ? options.post : null;
		composerReadOnly = false;
		composerPreviewExpanded = false;
		if (sourcePost) {
			composerCaption = sourcePost?.caption || '';
			composerPlatforms = Array.isArray(sourcePost?.platforms) ? [...sourcePost.platforms] : [];
			composerMedia = Array.isArray(sourcePost?.media) ? [...sourcePost.media] : [];
			composerAiPrompt = sourcePost?.ai_prompt || '';
			const scheduledDate = parsePostDate(sourcePost?.scheduled_for);
			if (scheduledDate) {
				composerScheduledFor = formatLocalDateTimeInput(scheduledDate);
			} else if (prefillDate instanceof Date && !Number.isNaN(prefillDate.getTime())) {
				const snapped = roundToQuarterHour(prefillDate);
				composerScheduledFor = formatLocalDateTimeInput(snapped);
			}
		} else if (prefillDate instanceof Date && !Number.isNaN(prefillDate.getTime())) {
			const snapped = roundToQuarterHour(prefillDate);
			composerScheduledFor = formatLocalDateTimeInput(snapped);
		} else if (!composerScheduledFor) {
			const next = roundToQuarterHour(new Date(Date.now() + 15 * 60 * 1000));
			composerScheduledFor = formatLocalDateTimeInput(next);
		}
		if (!sourcePost && composerPlatforms.length === 0) {
			composerPlatforms = [...new Set([...connectedPlatforms])];
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

	function getPlatformIcon(platform) {
		return platform === 'instagram' ? IconInstagram : IconFacebook;
	}

	function getPlatformColor(platform) {
		return platform === 'instagram'
			? 'from-pink-500 via-purple-500 to-orange-500'
			: 'from-blue-600 to-blue-500';
	}

	function formatRelativeTime(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const now = new Date();
		const diffMs = now - date;
		const diffSecs = Math.floor(diffMs / 1000);
		const diffMins = Math.floor(diffSecs / 60);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffSecs < 60) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
	}

	function getReplyStatusClass(status) {
		switch (normalizeStatus(status)) {
			case 'sent':
			case 'published':
				return 'text-success-400 bg-success-500/10 border-success-500/20';
			case 'failed':
				return 'text-error-400 bg-error-500/10 border-error-500/20';
			case 'pending':
			case 'sending':
				return 'text-warning-400 bg-warning-500/10 border-warning-500/20';
			default:
				return 'text-surface-400 bg-surface-500/10 border-surface-500/20';
		}
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

	function calendarPostClass(post) {
		const status = normalizeStatus(post?.status);
		if (status === 'published') {
			return 'bg-surface-500/10 text-surface-700-300 opacity-70';
		}
		if (status === 'failed') {
			return 'bg-error-500/10 text-error-700-300';
		}
		if (status === 'publishing') {
			return 'bg-warning-500/10 text-warning-700-300';
		}
		return 'bg-secondary-500/10 text-secondary-800-200';
	}

	function handleCalendarPostClick(post) {
		if (isPublishedPost(post)) {
			openPublishedPostModal(post);
			return;
		}
		openComposerModal(post?._scheduledAt || resolvePostDate(post) || new Date(), { post });
	}

	function openUpcomingCard(post) {
		if (!post?.id) return;
		if (postActionPending[post.id]) return;
		openComposerModal(resolvePostDate(post) || new Date(), { post });
	}

	function accountByPlatform(platform) {
		return accounts.find((account) => account?.platform === platform) || null;
	}

	function activeConnectedPlatforms() {
		return accounts
			.filter((account) => account?.status === 'active')
			.map((account) =>
				String(account.platform || '')
					.trim()
					.toLowerCase()
			)
			.filter(Boolean);
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

	function showActionError(message) {
		const text = String(message || 'Unable to complete this action.');
		actionError = text;
		toaster.error({ title: text });
	}

	function requireComposerPlatformsForPublish(intent) {
		if (intent !== 'schedule' && intent !== 'publish_now') return true;
		if (composerPlatforms.length > 0) return true;
		showActionError('Select at least one network before scheduling or posting.');
		return false;
	}

	function validateComposerPublishRequirements(intent) {
		if (!requireComposerPlatformsForPublish(intent)) return false;
		if (composerPlatforms.includes('instagram') && composerMedia.length === 0) {
			showActionError('Instagram posts require at least one uploaded image.');
			return false;
		}
		return true;
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
		groupProfile =
			socialData.group && typeof socialData.group === 'object' ? socialData.group : groupProfile;
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
			showActionError(error?.message || 'Unable to load comments.');
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
			showActionError(error?.message || 'Unable to load posts.');
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
			if (!autoCommentSyncStarted) {
				autoCommentSyncStarted = true;
				void syncComments({ silent: true, auto: true });
			}
		} catch (error) {
			loadError = error?.message || 'Unable to load social manager data.';
		} finally {
			socialConnectionsResolved = true;
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
			showActionError(error?.message || 'Unable to disconnect account.');
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
			showActionError(error?.message || 'Unable to complete account connection.');
		} finally {
			setPending('account', key, false);
		}
	}

	async function uploadQueuedMedia() {
		if (!slug) return;
		if (composerReadOnly) return;
		if (!queuedMediaFiles.length) {
			showActionError('Select one or more images first.');
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
			showActionError(error?.message || 'Unable to upload media files.');
		} finally {
			uploadingMedia = false;
		}
	}

	async function submitComposer(intent) {
		if (!slug) return;
		if (composerReadOnly) return;
		if (!validateComposerPublishRequirements(intent)) return;
		if (intent === 'schedule' && !composerScheduledFor) {
			showActionError('Choose a date and time before scheduling.');
			return;
		}
		clearFeedback();
		submittingIntent = intent;
		try {
			const payload = {
				intent,
				caption: composerCaption,
				platforms: composerPlatforms,
				media: composerMedia,
				ai_prompt: composerAiPrompt
			};
			if (intent === 'schedule') {
				const scheduleDate = new Date(composerScheduledFor);
				if (Number.isNaN(scheduleDate.getTime())) {
					showActionError('Choose a valid schedule date and time.');
					return;
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
			showActionError(error?.message || 'Unable to save post.');
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
			showActionError('Enter a prompt before generating content.');
			return;
		}
		if (requiresAiStateSelection && !aiSelectedStateCode) {
			showActionError('Select a state or territory for this style.');
			return;
		}
		if (requiresAiBikeVibeSelection && !aiSelectedBikeVibeId) {
			showActionError('Select a bike type or vibe for this style.');
			return;
		}

		clearFeedback();
		generatingAi = true;
		aiGeneratedImages = [];

		try {
			const selectedPlatforms = composerPlatforms.length
				? composerPlatforms
				: Array.from(new Set([...connectedPlatforms]));

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
					styleOptions: {
						...(requiresAiStateSelection
							? {
									stateCode: aiSelectedStateCode,
									stateName: getUsStateName(aiSelectedStateCode)
								}
							: {}),
						...(requiresAiBikeVibeSelection
							? {
									bikeVibeId: aiSelectedBikeVibeId,
									bikeVibeLabel: getBikeVibeById(aiSelectedBikeVibeId)?.label || '',
									bikeVibePrompt: getBikeVibeById(aiSelectedBikeVibeId)?.promptCue || ''
								}
							: {})
					},
					prompt: aiPromptInput,
					context: {
						description: composerCaption || aiPromptInput,
						ridingDisciplines: selectedPlatforms.join(', '),
						groupState: groupProfile?.state_region || '',
						groupLocation: [groupProfile?.city, groupProfile?.state_region, groupProfile?.country]
							.filter(Boolean)
							.join(', ')
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
			showActionError(error?.message || 'Unable to generate AI content.');
		} finally {
			generatingAi = false;
		}
	}

	async function runPostAction(postId, action) {
		if (!slug || !postId) return;
		const pathByAction = {
			publish: 'publish',
			retry: 'retry',
			cancel: 'cancel',
			delete: ''
		};
		const actionPath = pathByAction[action];
		if (actionPath === undefined) return;

		const post = posts.find((entry) => entry?.id === postId);
		const status = normalizeStatus(post?.status);
		const postPlatforms = Array.isArray(post?.platforms)
			? post.platforms.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
			: [];

		if ((action === 'publish' || action === 'retry') && postPlatforms.length === 0) {
			showActionError('This post has no selected networks. Edit the post and choose at least one.');
			return;
		}
		if ((action === 'publish' || action === 'retry') && postPlatforms.includes('instagram')) {
			const media = Array.isArray(post?.media) ? post.media : [];
			if (media.length === 0) {
				showActionError(
					'This post includes Instagram but has no media. Add an image before posting.'
				);
				return;
			}
		}
		if (action === 'delete' && status !== 'draft' && status !== 'scheduled') {
			showActionError('Only draft and scheduled posts can be deleted.');
			return;
		}

		clearFeedback();
		setPending('post', postId, true);
		try {
			const isDelete = action === 'delete';
			const payload = await requestJson(
				isDelete
					? `/api/groups/${slug}/social/posts/${postId}`
					: `/api/groups/${slug}/social/posts/${postId}/${actionPath}`,
				{
					method: isDelete ? 'DELETE' : 'POST'
				}
			);
			const updatedPost = payload?.data;
			if (action === 'delete') {
				posts = posts.filter((entry) => entry.id !== postId);
			} else if (updatedPost?.id) {
				posts = posts.map((post) => (post.id === updatedPost.id ? updatedPost : post));
			} else {
				await refreshPosts();
			}

			if (action === 'retry') actionNotice = 'Retry started.';
			if (action === 'cancel') actionNotice = 'Scheduled post cancelled.';
			if (action === 'publish') actionNotice = 'Publish started.';
			if (action === 'delete') actionNotice = 'Post deleted.';
		} catch (error) {
			showActionError(error?.message || 'Unable to run post action.');
		} finally {
			setPending('post', postId, false);
		}
	}

	async function syncComments({ silent = false, auto = false } = {}) {
		if (!slug) return;
		if (syncingComments) return;
		if (!silent) clearFeedback();
		const platforms = Array.from(new Set(activeConnectedPlatforms()));
		if (!platforms.length) {
			if (!silent) {
				showActionError('Connect a Facebook Page or Instagram professional account first.');
			}
			showConnectionsPanel = true;
			return;
		}

		syncingComments = true;
		try {
			const failures = [];
			let refreshedAny = false;

			for (const platform of platforms) {
				try {
					const syncResult = await requestJson(`/api/groups/${slug}/social/comments/sync`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ limit: 80, platform })
					});
					const summary = Array.isArray(syncResult?.data?.summary) ? syncResult.data.summary : [];
					const platformFailures = summary.filter((entry) => entry?.ok === false);
					failures.push(...platformFailures);
				} catch (error) {
					failures.push({
						platform,
						ok: false,
						error: error?.message || 'Sync failed.'
					});
				}

				await loadCommentsPage(commentsOffset);
				refreshedAny = true;
			}

			const payload = await requestJson(`/api/groups/${slug}/social`);
			hydrateSocialData(payload?.data || {});
			if (!refreshedAny) await loadCommentsPage(commentsOffset);

			if (failures.length) {
				const detail = failures
					.map((entry) => {
						const platform = platformLabel(entry?.platform || '');
						const reason = String(entry?.error || 'Sync failed.');
						return `${platform}: ${reason}`;
					})
					.join(' | ');
				actionError = `Some comments could not be synced. ${detail}`;
				toaster.error({ title: actionError });
				actionNotice = '';
				showConnectionsPanel = true;
			} else if (!silent) {
				actionNotice = 'Comments synced.';
			} else if (!auto) {
				actionNotice = 'Comments synced.';
			}
		} catch (error) {
			showActionError(error?.message || 'Unable to sync comments.');
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
			showActionError(error?.message || 'Unable to generate reply draft.');
		} finally {
			setPending('ai-reply', commentId, false);
		}
	}

	async function sendReply(commentId) {
		if (!slug || !commentId) return;
		const body = String(replyDrafts[commentId] || '').trim();
		if (!body) {
			showActionError('Reply cannot be empty.');
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
			showActionError(error?.message || 'Unable to send reply.');
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
					{#if socialConnectionsResolved}
						<button
							class="btn btn-sm preset-outlined-secondary-500"
							onclick={() => (showConnectionsPanel = !showConnectionsPanel)}
						>
							{shouldShowConnectionsPanel ? 'Hide Connections' : 'Manage Connections'}
						</button>
					{/if}
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
											(event.key === 'Enter' || event.key === ' ') &&
											handleCalendarSlotClick(day.date, 9)}
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
														class={`w-full rounded px-1 py-0.5 text-left text-[11px] font-medium ${calendarPostClass(post)}`}
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
													(event.key === 'Enter' || event.key === ' ') &&
													handleCalendarSlotClick(day.date, 9)}
											>
												<div class="text-[11px] font-semibold">{day.date.getDate()}</div>
												<div class="mt-1 space-y-1 overflow-y-auto">
													{#if day.posts.length === 0}
														<p class="text-surface-500 text-[11px]">Open slot</p>
													{:else}
														{#each day.posts.slice(0, 3) as post}
															<button
																type="button"
																class={`block w-full rounded px-1 py-0.5 text-left text-[11px] font-medium ${calendarPostClass(post)}`}
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
																		class={`mb-1 block w-full rounded px-2 py-1 text-left text-[10px] ${calendarPostClass(post)}`}
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
															class={`mb-1 block w-full rounded px-2 py-1 text-left text-xs ${calendarPostClass(post)}`}
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
											<div
												role="button"
												tabindex="0"
												class="card border-surface-300-700 space-y-2 rounded-xl border p-3"
												onclick={() => openUpcomingCard(post)}
												onkeydown={(event) =>
													(event.key === 'Enter' || event.key === ' ') &&
													openUpcomingCard(post)}
											>
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
											<div class="flex flex-wrap items-center gap-2">
												{#if post.status === 'failed'}
													<button
														type="button"
															class="btn btn-sm preset-outlined-warning-500"
															onclick={(event) => {
																event.stopPropagation();
																runPostAction(post.id, 'retry');
															}}
															disabled={Boolean(postActionPending[post.id])}
														>
															Retry
														</button>
													{/if}
												{#if PUBLISHABLE_STATUSES.has(normalizeStatus(post.status))}
													<button
														type="button"
															class="btn btn-sm preset-filled-primary-500"
															onclick={(event) => {
																event.stopPropagation();
																runPostAction(post.id, 'publish');
															}}
															disabled={Boolean(postActionPending[post.id])}
														>
															Publish Now
													</button>
												{/if}
													<button
														type="button"
														class="btn btn-sm preset-outlined-secondary-500"
														onclick={(event) => {
															event.stopPropagation();
															openComposerModal(resolvePostDate(post), { post });
														}}
													>
														Reschedule
													</button>
												{#if normalizeStatus(post.status) === 'draft' || normalizeStatus(post.status) === 'scheduled'}
													<button
														type="button"
														class="btn btn-sm preset-outlined-error-500 ml-auto px-2"
														onclick={(event) => {
															event.stopPropagation();
															runPostAction(post.id, 'delete');
														}}
														disabled={Boolean(postActionPending[post.id])}
														aria-label="Delete post"
														title="Delete post"
													>
														<IconTrash2 class="h-4 w-4" />
													</button>
												{/if}
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
												{#if requiresAiStateSelection}
													<span class="field-label-sm mt-2 block">State or territory</span>
													<select class="ai-style-select" bind:value={aiSelectedStateCode}>
														<option value="">Select a state</option>
														{#each US_STATE_OPTIONS as option}
															<option value={option.code}>
																{option.name} ({option.code})
															</option>
														{/each}
													</select>
													{#if aiResolvingState}
														<p class="ai-style-description">
															Detecting a default from available location data…
														</p>
													{/if}
												{/if}
												{#if requiresAiBikeVibeSelection}
													<span class="field-label-sm mt-2 block">Bike type or vibe</span>
													<select class="ai-style-select" bind:value={aiSelectedBikeVibeId}>
														<option value="">Select a bike vibe</option>
														{#each BIKE_VIBE_OPTIONS as option}
															<option value={option.id}>{option.label}</option>
														{/each}
													</select>
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
									<button
										type="button"
										class="composer-btn composer-btn--ghost"
										onclick={closeComposerModal}
									>
										Close
									</button>
								</div>
							{:else}
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class="btn preset-filled-primary-500"
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
										class="btn preset-filled-secondary-500"
										onclick={() => submitComposer('publish_now')}
										disabled={Boolean(submittingIntent)}
									>
										{#if submittingIntent === 'publish_now'}
											<IconLoader class="h-4 w-4 animate-spin" />
											Publishing…
										{:else}
											Post Now
										{/if}
									</button>
									<button
										type="button"
										class="btn preset-outlined-secondary-500"
										onclick={() => submitComposer('save_draft')}
										disabled={Boolean(submittingIntent)}
									>
										{submittingIntent === 'save_draft' ? 'Saving…' : 'Draft'}
									</button>
								</div>
							{/if}
						</div>
					</div>
					<!-- /composer-panel -->
				</div>
				<!-- /composer-backdrop -->
			{/if}

			<!-- Enhanced Comments Section -->
			<section class="comments-section space-y-5">
				<!-- Section Header -->
				<div class="comments-header">
					<div class="flex flex-col gap-1">
						<div class="flex items-center gap-2">
							<IconMessageCircle class="text-secondary-400 h-5 w-5" />
							<h3 class="text-lg font-semibold">Comments</h3>
							{#if commentsTotal > 0}
								<span class="comments-count">{commentsTotal}</span>
							{/if}
						</div>
						<p class="text-surface-400 text-sm">
							{#if loadingComments}
								<span class="flex items-center gap-2">
									<IconLoader class="h-3.5 w-3.5 animate-spin" />
									Loading comments...
								</span>
							{:else if commentsTotal > 0}
								Showing <span class="text-surface-200 font-medium"
									>{commentsPageStart}-{commentsPageEnd}</span
								>
								of <span class="text-surface-200 font-medium">{commentsTotal}</span> comments
							{:else}
								Sync to view and reply to comments from your connected accounts
							{/if}
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						{#if commentsTotal > COMMENTS_PAGE_SIZE}
							<div class="bg-surface-800/50 flex items-center gap-1 rounded-lg p-1">
								<button
									type="button"
									class="pagination-btn"
									onclick={goToPreviousCommentsPage}
									disabled={!hasPreviousCommentsPage || loadingComments || syncingComments}
									aria-label="Previous page"
								>
									<IconChevronLeft class="h-4 w-4" />
								</button>
								<span class="pagination-info">
									{Math.floor(commentsOffset / COMMENTS_PAGE_SIZE) + 1}
								</span>
								<button
									type="button"
									class="pagination-btn"
									onclick={goToNextCommentsPage}
									disabled={!hasNextCommentsPage || loadingComments || syncingComments}
									aria-label="Next page"
								>
									<IconChevronRight class="h-4 w-4" />
								</button>
							</div>
						{/if}
						<button
							type="button"
							class="sync-btn"
							onclick={syncComments}
							disabled={syncingComments || loadingComments}
						>
							<IconRefreshCw class="h-4 w-4 {syncingComments ? 'animate-spin' : ''}" />
							<span class="hidden sm:inline"
								>{syncingComments ? 'Syncing...' : 'Sync Comments'}</span
							>
							<span class="sm:hidden">{syncingComments ? 'Syncing...' : 'Sync'}</span>
						</button>
					</div>
				</div>

				{#if loadingComments && comments.length === 0}
					<!-- Loading State -->
					<div class="comments-loading">
						<div class="loading-orb" aria-hidden="true"></div>
						<div class="relative z-10 flex flex-col items-center gap-3">
							<div class="loading-spinner"></div>
							<p class="text-surface-400 text-sm">Loading comments...</p>
						</div>
					</div>
				{:else if !comments.length}
					<!-- Empty State -->
					<div class="comments-empty">
						<div class="empty-orb" aria-hidden="true"></div>
						<div class="empty-icon">
							<IconMessageCircle class="text-surface-500 h-8 w-8" />
						</div>
						<h4 class="text-surface-200 mt-4 text-base font-medium">No comments yet</h4>
						<p class="text-surface-500 mt-1 max-w-xs text-center text-sm">
							Comments from your Facebook and Instagram posts will appear here after syncing.
						</p>
						<button
							type="button"
							class="btn preset-filled-primary-500 mt-4"
							onclick={syncComments}
							disabled={syncingComments}
						>
							<IconRefreshCw class="h-4 w-4 {syncingComments ? 'animate-spin' : ''}" />
							{syncingComments ? 'Syncing...' : 'Sync Comments Now'}
						</button>
					</div>
				{:else}
					<!-- Comments List -->
					<div class="comments-list">
						{#each comments as comment, index (comment.id)}
							{@const PlatformIcon = getPlatformIcon(comment.platform)}
							{@const platformGradient = getPlatformColor(comment.platform)}
							{@const relativeTime = formatRelativeTime(comment.commented_at)}

							<article
								class="comment-card"
								style="--stagger: {index}"
								in:fade={{ duration: 200, delay: index * 50 }}
							>
								<!-- Comment Header -->
								<header class="comment-header">
									<div class="comment-author">
										<div class="author-avatar">
											<span class="text-sm font-semibold">
												{commentAuthorLabel(comment).charAt(0).toUpperCase()}
											</span>
										</div>
										<div class="author-info">
											<div class="flex flex-wrap items-center gap-2">
												<span class="author-name">{commentAuthorLabel(comment)}</span>
												<span class="platform-badge bg-gradient-to-r {platformGradient}">
													<PlatformIcon class="h-3 w-3" />
													<span>{platformLabel(comment.platform)}</span>
												</span>
											</div>
											<div class="comment-meta">
												{#if relativeTime}
													<span class="meta-item" title={formatDateTime(comment.commented_at)}>
														{relativeTime}
													</span>
												{/if}
												<span class="meta-dot"></span>
												<span class="meta-item">{formatDateTime(comment.commented_at)}</span>
											</div>
										</div>
									</div>
									{#if comment.can_reply}
										<span class="reply-status reply-status--enabled">
											<IconCheck class="h-3 w-3" />
											<span>Can Reply</span>
										</span>
									{:else}
										<span class="reply-status reply-status--disabled">
											<span>Reply unavailable</span>
										</span>
									{/if}
								</header>

								<!-- Comment Body -->
								<div class="comment-body">
									<p>{comment.body}</p>
								</div>

								<!-- Linked Post Context -->
								{#if comment.linked_post}
									<div class="linked-post">
										<div class="linked-post-label">
											<IconCornerDownRight class="h-3.5 w-3.5" />
											<span>On Post</span>
										</div>
										<div class="linked-post-content">
											{#if linkedPostImageUrl(comment)}
												<img
													src={linkedPostImageUrl(comment)}
													alt="Post thumbnail"
													class="linked-post-thumb"
												/>
											{/if}
											<div class="linked-post-details">
												<p class="linked-post-caption">{linkedPostCaption(comment)}</p>
												<div class="linked-post-meta">
													<span class="meta-badge">
														{comment.linked_post.origin === 'group_social_post'
															? '3FP Published'
															: 'Platform'}
													</span>
													{#if comment.linked_post.permalink_url}
														<a
															href={comment.linked_post.permalink_url}
															target="_blank"
															rel="noopener noreferrer"
															class="permalink-link"
														>
															<IconExternalLink class="h-3 w-3" />
															<span>View Post</span>
														</a>
													{/if}
												</div>
											</div>
										</div>
									</div>
								{/if}

								<!-- Existing Replies -->
								{#if Array.isArray(comment.replies) && comment.replies.length}
									<div class="replies-section">
										<div class="replies-header">
											<IconReply class="h-3.5 w-3.5" />
											<span
												>{comment.replies.length}
												{comment.replies.length === 1 ? 'Reply' : 'Replies'}</span
											>
										</div>
										<div class="replies-list">
											{#each comment.replies as reply, replyIndex (reply.id)}
												<div
													class="reply-item"
													in:slide={{ duration: 200, delay: replyIndex * 50 }}
												>
													<div class="reply-line" aria-hidden="true"></div>
													<div class="reply-content">
														<p class="reply-text">{reply.body}</p>
														<div class="reply-footer">
															<span class="reply-status-badge {getReplyStatusClass(reply.status)}">
																{reply.status || 'sent'}
															</span>
															<span class="reply-time">{formatDateTime(reply.created_at)}</span>
														</div>
													</div>
												</div>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Reply Input -->
								{#if comment.can_reply}
									<div class="reply-composer">
										<div class="reply-composer-line" aria-hidden="true"></div>
										<div class="reply-composer-content">
											<div class="reply-input-wrapper">
												<textarea
													class="reply-textarea"
													placeholder="Write a reply..."
													value={replyDrafts[comment.id] || ''}
													oninput={(event) =>
														updateReplyDraft(comment.id, event.currentTarget.value)}
													rows="2"
												></textarea>
												<div class="reply-actions">
													<button
														type="button"
														class="ai-reply-btn"
														onclick={() => generateReplyDraft(comment)}
														disabled={Boolean(aiReplyPending[comment.id])}
													>
														{#if aiReplyPending[comment.id]}
															<IconLoader class="h-3.5 w-3.5 animate-spin" />
															<span>Generating...</span>
														{:else}
															<IconSparkles class="h-3.5 w-3.5" />
															<span>AI Reply</span>
														{/if}
													</button>
													<button
														type="button"
														class="send-reply-btn"
														onclick={() => sendReply(comment.id)}
														disabled={!String(replyDrafts[comment.id] || '').trim() ||
															Boolean(replyPending[comment.id]) ||
															Boolean(aiReplyPending[comment.id])}
													>
														{#if replyPending[comment.id]}
															<IconLoader class="h-4 w-4 animate-spin" />
														{:else}
															<IconSend class="h-4 w-4" />
														{/if}
														<span>{replyPending[comment.id] ? 'Sending...' : 'Send Reply'}</span>
													</button>
												</div>
											</div>
										</div>
									</div>
								{:else}
									<div class="reply-disabled-notice">
										<span>Reply not available for this comment</span>
									</div>
								{/if}
							</article>
						{/each}
					</div>

					<!-- Bottom Pagination -->
					{#if commentsTotal > COMMENTS_PAGE_SIZE}
						<div class="comments-pagination-footer">
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="pagination-btn pagination-btn--wide"
									onclick={goToPreviousCommentsPage}
									disabled={!hasPreviousCommentsPage || loadingComments}
								>
									<IconChevronLeft class="h-4 w-4" />
									<span>Previous</span>
								</button>
								<span class="pagination-text">
									Page {Math.floor(commentsOffset / COMMENTS_PAGE_SIZE) + 1} of {Math.ceil(
										commentsTotal / COMMENTS_PAGE_SIZE
									)}
								</span>
								<button
									type="button"
									class="pagination-btn pagination-btn--wide"
									onclick={goToNextCommentsPage}
									disabled={!hasNextCommentsPage || loadingComments}
								>
									<span>Next</span>
									<IconChevronRight class="h-4 w-4" />
								</button>
							</div>
						</div>
					{/if}
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
		z-index: 120;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0;
		background: color-mix(in oklab, var(--color-surface-950) 85%, transparent);
		backdrop-filter: blur(8px);
		padding-bottom: env(safe-area-inset-bottom);
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
		overflow-y: visible;
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
		flex-direction: column;
		align-items: stretch;
		justify-content: flex-start;
		gap: 0.5rem;
		padding: 0.875rem;
		padding-bottom: calc(0.875rem + env(safe-area-inset-bottom));
		border-top: 1px solid color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		flex-shrink: 0;
		position: sticky;
		bottom: 0;
		z-index: 2;
	}

	.composer-footer__actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		width: 100%;
	}

	.composer-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4375rem;
		padding: 0.5625rem 1.125rem;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 600;
		transition: all 0.18s;
		white-space: nowrap;
	}

	.composer-footer > .composer-btn--ghost {
		width: 100%;
	}

	@media (min-width: 640px) {
		.composer-footer {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 0.625rem;
			padding-bottom: 0.875rem;
			position: static;
		}

		.composer-footer__actions {
			display: flex;
			flex-wrap: wrap;
			width: auto;
		}

		.composer-footer > .composer-btn--ghost {
			width: auto;
		}
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

	/* ─── Enhanced Comments Section ─── */
	.comments-section {
		--comment-card-bg: color-mix(
			in oklab,
			var(--color-surface-900) 95%,
			var(--color-primary-500) 5%
		);
		--comment-card-border: color-mix(
			in oklab,
			var(--color-surface-700) 50%,
			var(--color-surface-600) 50%
		);
		--reply-line-color: color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
	}

	.comments-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-700) 40%, transparent);
	}

	.comments-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		height: 1.5rem;
		padding: 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-surface-100);
		background: color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		border-radius: 9999px;
	}

	.pagination-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		color: var(--color-surface-300);
		background: color-mix(in oklab, var(--color-surface-700) 30%, transparent);
		transition: all 0.15s ease;
	}

	.pagination-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-surface-600) 40%, transparent);
		color: var(--color-surface-100);
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pagination-btn--wide {
		width: auto;
		padding: 0 0.875rem;
		gap: 0.375rem;
		font-size: 0.875rem;
	}

	.pagination-info {
		min-width: 2rem;
		text-align: center;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-surface-300);
	}

	.pagination-text {
		font-size: 0.875rem;
		color: var(--color-surface-400);
	}

	.sync-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-primary-300);
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		transition: all 0.15s ease;
	}

	.sync-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		box-shadow: 0 0 16px -4px color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.sync-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Loading State */
	.comments-loading {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 16rem;
		border-radius: 1rem;
		background: var(--comment-card-bg);
		border: 1px solid var(--comment-card-border);
		overflow: hidden;
	}

	.loading-orb {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 60% 50% at 50% 50%,
			color-mix(in oklab, var(--color-secondary-500) 8%, transparent),
			transparent 70%
		);
		animation: pulse-orb 3s ease-in-out infinite;
	}

	.loading-spinner {
		width: 2.5rem;
		height: 2.5rem;
		border: 2px solid color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		border-top-color: var(--color-secondary-500);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulse-orb {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
	}

	/* Empty State */
	.comments-empty {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 18rem;
		padding: 2rem;
		border-radius: 1rem;
		background: var(--comment-card-bg);
		border: 1px solid var(--comment-card-border);
		overflow: hidden;
	}

	.empty-orb {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 60% 50% at 50% 60%,
			color-mix(in oklab, var(--color-primary-500) 8%, transparent),
			transparent 70%
		);
	}

	.empty-icon {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 4rem;
		height: 4rem;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-surface-800) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 30%, transparent);
	}

	/* Comments List */
	.comments-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.comment-card {
		position: relative;
		padding: 1.25rem;
		border-radius: 1rem;
		background: var(--comment-card-bg);
		border: 1px solid var(--comment-card-border);
		animation: comment-in 400ms ease both;
		animation-delay: calc(var(--stagger, 0) * 60ms);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.comment-card:hover {
		border-color: color-mix(in oklab, var(--color-surface-600) 70%, var(--color-secondary-500) 30%);
		box-shadow: 0 4px 20px -4px color-mix(in oklab, var(--color-surface-950) 80%, transparent);
	}

	@keyframes comment-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Comment Header */
	.comment-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.comment-author {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.author-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: linear-gradient(135deg, var(--color-primary-600), var(--color-secondary-600));
		color: white;
		flex-shrink: 0;
		box-shadow: 0 2px 8px -2px color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}

	.author-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.author-name {
		font-weight: 600;
		color: var(--color-surface-100);
		font-size: 0.9375rem;
	}

	.platform-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 600;
		color: white;
	}

	.comment-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--color-surface-500);
	}

	.meta-item {
		font-size: 0.8125rem;
	}

	.meta-dot {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--color-surface-600);
	}

	.reply-status {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.reply-status--enabled {
		color: var(--color-success-400);
		background: color-mix(in oklab, var(--color-success-500) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-success-500) 25%, transparent);
	}

	.reply-status--disabled {
		color: var(--color-surface-500);
		background: color-mix(in oklab, var(--color-surface-700) 30%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 30%, transparent);
	}

	/* Comment Body */
	.comment-body {
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: color-mix(in oklab, var(--color-surface-800) 40%, transparent);
		border-radius: 0.75rem;
		border-left: 3px solid color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	.comment-body p {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.6;
		color: var(--color-surface-200);
		white-space: pre-wrap;
		word-break: break-word;
	}

	/* Linked Post Context */
	.linked-post {
		margin-bottom: 1rem;
	}

	.linked-post-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-surface-500);
		margin-bottom: 0.5rem;
	}

	.linked-post-content {
		display: flex;
		gap: 0.875rem;
		padding: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-800) 30%, transparent);
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-700) 40%, transparent);
		transition: background 0.15s ease;
	}

	.linked-post-content:hover {
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
	}

	.linked-post-thumb {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.5rem;
		object-fit: cover;
		flex-shrink: 0;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 30%, transparent);
	}

	.linked-post-details {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
		flex: 1;
	}

	.linked-post-caption {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--color-surface-300);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		box-orient: vertical;
		overflow: hidden;
	}

	.linked-post-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.meta-badge {
		font-size: 0.6875rem;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		background: color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		color: var(--color-surface-400);
	}

	.permalink-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		color: var(--color-secondary-400);
		transition: color 0.15s ease;
	}

	.permalink-link:hover {
		color: var(--color-secondary-300);
	}

	/* Replies Section */
	.replies-section {
		margin-bottom: 1rem;
	}

	.replies-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-secondary-400);
		margin-bottom: 0.625rem;
	}

	.replies-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.reply-item {
		display: flex;
		gap: 0.75rem;
	}

	.reply-line {
		width: 2px;
		flex-shrink: 0;
		background: var(--reply-line-color);
		border-radius: 1px;
		margin-left: 1rem;
	}

	.reply-content {
		flex: 1;
		min-width: 0;
		padding: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-800) 35%, transparent);
		border-radius: 0.625rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-700) 35%, transparent);
	}

	.reply-text {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--color-surface-200);
	}

	.reply-footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.reply-status-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid;
		text-transform: capitalize;
	}

	.reply-time {
		font-size: 0.75rem;
		color: var(--color-surface-500);
	}

	/* Reply Composer */
	.reply-composer {
		display: flex;
		gap: 0.75rem;
	}

	.reply-composer-line {
		width: 2px;
		flex-shrink: 0;
		background: linear-gradient(to bottom, var(--reply-line-color), transparent);
		border-radius: 1px;
		margin-left: 1rem;
	}

	.reply-composer-content {
		flex: 1;
		min-width: 0;
	}

	.reply-input-wrapper {
		background: color-mix(in oklab, var(--color-surface-800) 40%, transparent);
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 40%, transparent);
		overflow: hidden;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.reply-input-wrapper:focus-within {
		border-color: color-mix(in oklab, var(--color-secondary-500) 50%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-secondary-500) 10%, transparent);
	}

	.reply-textarea {
		width: 100%;
		padding: 0.875rem 1rem;
		background: transparent;
		border: none;
		color: var(--color-surface-100);
		font-size: 0.9375rem;
		line-height: 1.5;
		resize: vertical;
		min-height: 4rem;
		outline: none;
	}

	.reply-textarea::placeholder {
		color: var(--color-surface-500);
	}

	.reply-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-700) 30%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 60%, transparent);
	}

	.ai-reply-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-secondary-300);
		background: color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 25%, transparent);
		transition: all 0.15s ease;
	}

	.ai-reply-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-secondary-500) 25%, transparent);
		box-shadow: 0 0 12px -2px color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
	}

	.ai-reply-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.send-reply-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-950);
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600));
		transition: all 0.15s ease;
	}

	.send-reply-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 14px -2px color-mix(in oklab, var(--color-primary-500) 50%, transparent);
	}

	.send-reply-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.reply-disabled-notice {
		padding: 0.75rem 1rem;
		border-radius: 0.625rem;
		font-size: 0.8125rem;
		color: var(--color-surface-500);
		background: color-mix(in oklab, var(--color-surface-800) 30%, transparent);
		text-align: center;
	}

	/* Pagination Footer */
	.comments-pagination-footer {
		display: flex;
		justify-content: center;
		padding-top: 1rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-700) 40%, transparent);
	}

	/* Mobile Optimizations */
	@media (max-width: 640px) {
		.comment-card {
			padding: 1rem;
		}

		.comment-header {
			flex-direction: column;
			gap: 0.625rem;
		}

		.reply-status {
			align-self: flex-start;
		}

		.reply-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.ai-reply-btn,
		.send-reply-btn {
			justify-content: center;
		}

		.linked-post-content {
			flex-direction: column;
		}

		.linked-post-thumb {
			width: 100%;
			height: 8rem;
		}

		.reply-composer-line,
		.reply-line {
			margin-left: 0.5rem;
		}
	}

	/* Reduce motion preference */
	@media (prefers-reduced-motion: reduce) {
		.comment-card,
		.loading-orb,
		.loading-spinner {
			animation: none;
		}
	}
</style>
