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
	import IconPlay from '@lucide/svelte/icons/play';
	import IconEdit3 from '@lucide/svelte/icons/edit-3';
	import IconMoreVertical from '@lucide/svelte/icons/more-vertical';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import {
		BIKE_VIBE_STYLE_ID,
		IMAGE_STYLE_PRESETS,
		STATE_MASCOT_STYLE_ID
	} from '$lib/ai/imageStyles';
	import {
		DEFAULT_SOCIAL_IMAGE_GENERATION_MODEL_ID,
		SOCIAL_IMAGE_GENERATION_MODELS
	} from '$lib/ai/imageGenerationModels';
	import { BIKE_VIBE_OPTIONS, getBikeVibeById } from '$lib/ai/bikeVibes';
	import { getUsStateName, normalizeUsStateCode, US_STATE_OPTIONS } from '$lib/geo/usStates';
	import { toaster } from '../../../routes/toaster-svelte';

	let { slug = '', canManageSocial = false, showClaimMessage = false, group = null } = $props();

	const PLATFORMS = ['facebook', 'instagram'];
	const POST_TARGETS = ['page', 'story'];
	const AI_TONE_OPTIONS = [
		{
			id: 'passionate_advocate',
			label: 'Passionate Advocate',
			guidance:
				'Passionate, persuasive, and energizing. Sound like a committed bike advocate rallying people to care and act.',
			example:
				'Example energy: "This law exists for a reason. Riders deserve real space, not excuses."'
		},
		{
			id: 'rebellious',
			label: 'Rebellious',
			guidance:
				'Rebellious, sharp, and defiant without sounding reckless. Challenge the status quo and make the post feel bold.',
			example:
				'Example energy: "No, cyclists are not asking for special treatment. We are asking drivers to follow the law."'
		},
		{
			id: 'playful',
			label: 'Playful',
			guidance:
				'Playful, witty, and socially warm. Keep it clever and light without becoming vague or unserious.',
			example:
				'Example energy: "Three feet is not a huge ask. It is basically one good golden retriever."'
		},
		{
			id: 'serious_organizer',
			label: 'Serious Organizer',
			guidance:
				'Serious, credible, and organized. Sound like a movement leader giving people a clear reason and next step.',
			example:
				'Example energy: "If we want safer streets, we need people who know the law and are willing to insist on it."'
		},
		{
			id: 'wonky_teacher',
			label: 'Wonky Teacher',
			guidance:
				'Wonky, educational, and precise. Explain the issue clearly like a smart bike-law explainer who enjoys the details.',
			example:
				'Example energy: "The 3-foot law is not a courtesy guideline. It is a legal minimum clearance requirement."'
		},
		{
			id: 'neighborly',
			label: 'Neighborly',
			guidance:
				'Neighborly, welcoming, and community-first. Sound like a trusted local group inviting people in.',
			example:
				'Example energy: "We all want to get home safe. Giving people space on bikes is part of being a good neighbor."'
		}
	];
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
	let mobilePreviewOpen = $state(false);
	let mediaDropActive = $state(false);
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
	let composerPostTarget = $state('page');
	let composerPlatforms = $state([]);
	let composerMedia = $state([]);
	let composerScheduledFor = $state('');
	let composerAiPrompt = $state('');

	let aiPromptInput = $state('');
	let aiToneId = $state(AI_TONE_OPTIONS[0].id);
	let aiStyleId = $state(IMAGE_STYLE_PRESETS[0]?.id ?? 'comic_house');
	let aiImageModelId = $state(DEFAULT_SOCIAL_IMAGE_GENERATION_MODEL_ID);
	let aiConversation = $state([]);
	let aiGeneratedImages = $state([]);
	let aiSelectedImageUrl = $state('');
	let generatingAi = $state(false);
	let groupProfile = $state(null);
	let aiSelectedStateCode = $state('');
	let aiSelectedBikeVibeId = $state('');
	let aiResolvingState = $state(false);
	const composerPreviewHasImage = $derived.by(() => Boolean(getDraftPreviewImage()?.url));
	const composerPreviewExpandedEffective = $derived.by(
		() => composerPreviewExpanded && composerPreviewHasImage
	);
	const selectedAiStyle = $derived.by(
		() => IMAGE_STYLE_PRESETS.find((preset) => preset.id === aiStyleId) ?? null
	);
	const selectedAiTone = $derived.by(
		() => AI_TONE_OPTIONS.find((option) => option.id === aiToneId) ?? AI_TONE_OPTIONS[0]
	);
	const minimumSchedulableDate = $derived.by(() => nextSchedulableDate(new Date()));
	const minimumSchedulableInputValue = $derived.by(() =>
		formatLocalDateTimeInput(minimumSchedulableDate)
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

	$effect(() => {
		if (!composerPreviewHasImage && mobilePreviewOpen) {
			mobilePreviewOpen = false;
			composerPreviewExpanded = false;
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

	function nextSchedulableDate(reference = new Date()) {
		return roundToQuarterHour(new Date(reference.getTime() + 1000));
	}

	function defaultSlotForDay(date, hour = 9) {
		const slot = new Date(date);
		slot.setHours(hour, 0, 0, 0);
		return slot;
	}

	function resetComposerDraftState() {
		composerCaption = '';
		composerPostTarget = 'page';
		composerPlatforms = [...new Set([...connectedPlatforms])];
		composerMedia = [];
		composerAiPrompt = '';
		queuedMediaFiles = [];
		aiGeneratedImages = [];
		aiSelectedImageUrl = '';
		mobilePreviewOpen = false;
	}

	function openComposerModal(prefillDate = null, options = {}) {
		const sourcePost = options?.post && typeof options.post === 'object' ? options.post : null;
		clearFeedback();
		composerReadOnly = false;
		composerPreviewExpanded = false;
		mobilePreviewOpen = false;
		aiPromptInput = '';
		aiConversation = [];
		queuedMediaFiles = [];
		aiGeneratedImages = [];
		aiSelectedImageUrl = '';
		if (sourcePost) {
			composerCaption = sourcePost?.caption || '';
			composerPostTarget = normalizePostTarget(sourcePost?.post_target);
			composerPlatforms = Array.isArray(sourcePost?.platforms) ? [...sourcePost.platforms] : [];
			composerMedia = Array.isArray(sourcePost?.media) ? [...sourcePost.media] : [];
			composerAiPrompt = sourcePost?.ai_prompt || '';
			const scheduledDate = parsePostDate(sourcePost?.scheduled_for);
			if (scheduledDate) {
				composerScheduledFor = formatLocalDateTimeInput(scheduledDate);
			} else if (prefillDate instanceof Date && !Number.isNaN(prefillDate.getTime())) {
				const snapped = roundToQuarterHour(prefillDate);
				composerScheduledFor = formatLocalDateTimeInput(snapped);
			} else {
				const next = nextSchedulableDate();
				composerScheduledFor = formatLocalDateTimeInput(next);
			}
		} else {
			resetComposerDraftState();
			const slotDate =
				prefillDate instanceof Date && !Number.isNaN(prefillDate.getTime())
					? roundToQuarterHour(prefillDate)
					: nextSchedulableDate();
			composerScheduledFor = formatLocalDateTimeInput(slotDate);
		}
		composerModalOpen = true;
	}

	function closeComposerModal() {
		composerReadOnly = false;
		composerPreviewExpanded = false;
		mobilePreviewOpen = false;
		mediaDropActive = false;
		aiPromptInput = '';
		aiConversation = [];
		queuedMediaFiles = [];
		composerModalOpen = false;
	}

	function openPublishedPostModal(post) {
		clearFeedback();
		composerReadOnly = true;
		composerPreviewExpanded = false;
		mobilePreviewOpen = false;
		composerCaption = post?.caption || '';
		composerPostTarget = normalizePostTarget(post?.post_target);
		composerPlatforms = Array.isArray(post?.platforms) ? [...post.platforms] : [];
		composerMedia = Array.isArray(post?.media) ? [...post.media] : [];
		composerScheduledFor = '';
		composerAiPrompt = post?.ai_prompt || '';
		queuedMediaFiles = [];
		aiGeneratedImages = [];
		aiSelectedImageUrl = '';
		composerModalOpen = true;
	}

	function toggleComposerPreviewExpanded() {
		if (!composerPreviewHasImage) {
			composerPreviewExpanded = false;
			return;
		}
		composerPreviewExpanded = !composerPreviewExpanded;
	}

	function closeMobilePreview() {
		mobilePreviewOpen = false;
		composerPreviewExpanded = false;
	}

	function toggleMobilePreview() {
		if (!composerPreviewHasImage) return;
		mobilePreviewOpen = !mobilePreviewOpen;
		if (!mobilePreviewOpen) {
			composerPreviewExpanded = false;
		}
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
		const selectedAiImage =
			aiGeneratedImages.find((entry) => entry?.url && entry.url === aiSelectedImageUrl) || null;
		return selectedAiImage || composerMedia[0] || null;
	}

	function platformLabel(platform) {
		if (platform === 'instagram') return 'Instagram';
		return 'Facebook';
	}

	function normalizePostTarget(value) {
		return String(value || '')
			.trim()
			.toLowerCase() === 'story'
			? 'story'
			: 'page';
	}

	function postTargetLabel(value) {
		return normalizePostTarget(value) === 'story' ? 'Story' : 'Page';
	}

	function postTargetClass(value) {
		return normalizePostTarget(value) === 'story'
			? 'inline-flex items-center rounded-full border border-warning-400/60 bg-warning-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-300'
			: 'inline-flex items-center rounded-full border border-surface-500/50 bg-surface-700/35 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-surface-200';
	}

	function composerAspectRatio() {
		return normalizePostTarget(composerPostTarget) === 'story' ? '9:16' : '4:5';
	}

	function isComposerStoryTarget() {
		return normalizePostTarget(composerPostTarget) === 'story';
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
				return 'inline-flex items-center rounded-full border border-success-400/60 bg-success-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success-300';
			case 'scheduled':
			case 'queued':
				return 'inline-flex items-center rounded-full border border-primary-400/60 bg-primary-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-200';
			case 'publishing':
				return 'inline-flex items-center rounded-full border border-warning-400/60 bg-warning-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-300';
			case 'failed':
				return 'inline-flex items-center rounded-full border border-error-400/60 bg-error-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-error-300';
			default:
				return 'inline-flex items-center rounded-full border border-surface-500/50 bg-surface-700/35 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-surface-200';
		}
	}

	function postPrimaryImageUrl(post) {
		const media = Array.isArray(post?.media) ? post.media : [];
		const first = media[0];
		if (typeof first === 'string') return first.trim();
		if (first && typeof first === 'object') {
			const url = String(first.url || first.public_url || first.src || '').trim();
			if (url) return url;
		}
		return '';
	}

	function getStatusColor(status) {
		switch (normalizeStatus(status)) {
			case 'published':
				return 'bg-success-500';
			case 'scheduled':
			case 'queued':
				return 'bg-primary-500';
			case 'publishing':
				return 'bg-warning-500';
			case 'failed':
				return 'bg-error-500';
			default:
				return 'bg-surface-500';
		}
	}

	function formatTimeAgo(post) {
		const status = normalizeStatus(post?.status);
		if (status === 'scheduled' || status === 'queued') {
			const date = parsePostDate(post?.scheduled_for);
			if (!date) return 'Not scheduled';
			const now = new Date();
			const diffMs = date - now;
			const diffMins = Math.floor(diffMs / 60000);
			const diffHours = Math.floor(diffMins / 60);
			const diffDays = Math.floor(diffHours / 24);

			if (diffMins < 0) return 'Overdue';
			if (diffMins < 60) return `in ${diffMins}m`;
			if (diffHours < 24) return `in ${diffHours}h`;
			if (diffDays < 7) return `in ${diffDays}d`;
			return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
		}
		return formatRelativeTime(post?.updated_at || post?.created_at);
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
		const minimumDate = nextSchedulableDate();
		const snapped = roundToQuarterHour(parsed);
		const effectiveDate = snapped.getTime() < minimumDate.getTime() ? minimumDate : snapped;
		composerScheduledFor = formatLocalDateTimeInput(effectiveDate);
	}

	function removeMediaItem(index) {
		if (composerReadOnly) return;
		const removed = composerMedia[index];
		const removedUrl = String(removed?.url || '').trim();
		const nextComposerMedia = composerMedia.filter((_, i) => i !== index);
		composerMedia = nextComposerMedia;
		if (removedUrl) {
			const nextAiGeneratedImages = aiGeneratedImages.filter((entry) => entry?.url !== removedUrl);
			aiGeneratedImages = nextAiGeneratedImages;
			if (aiSelectedImageUrl === removedUrl) {
				aiSelectedImageUrl = nextAiGeneratedImages[0]?.url || nextComposerMedia[0]?.url || '';
			}
		}
	}

	function setComposerPrimaryMedia(item) {
		const url = String(item?.url || '').trim();
		if (!url) return;
		const remaining = composerMedia.filter((entry) => String(entry?.url || '').trim() !== url);
		composerMedia = [item, ...remaining];
	}

	function rememberGeneratedImage(item) {
		const url = String(item?.url || '').trim();
		if (!url) return;
		aiGeneratedImages = [
			item,
			...aiGeneratedImages.filter((entry) => String(entry?.url || '').trim() !== url)
		];
		aiSelectedImageUrl = url;
		setComposerPrimaryMedia(item);
	}

	function selectGeneratedImage(item) {
		const url = String(item?.url || '').trim();
		if (!url) return;
		aiSelectedImageUrl = url;
		setComposerPrimaryMedia(item);
	}

	function removeGeneratedImage(url) {
		const targetUrl = String(url || '').trim();
		if (!targetUrl || composerReadOnly) return;
		const nextAiGeneratedImages = aiGeneratedImages.filter(
			(entry) => String(entry?.url || '').trim() !== targetUrl
		);
		const nextComposerMedia = composerMedia.filter(
			(entry) => String(entry?.url || '').trim() !== targetUrl
		);
		aiGeneratedImages = nextAiGeneratedImages;
		composerMedia = nextComposerMedia;
		if (aiSelectedImageUrl === targetUrl) {
			aiSelectedImageUrl = nextAiGeneratedImages[0]?.url || nextComposerMedia[0]?.url || '';
		}
	}

	async function queueMediaFiles(event) {
		if (composerReadOnly) return;
		const input = event.currentTarget;
		const files = Array.from(input?.files || []);
		if (input && 'value' in input) {
			input.value = '';
		}
		await uploadSelectedMediaFiles(files, { silentIfEmpty: true });
	}

	function handleMediaDragOver(event) {
		if (composerReadOnly) return;
		event.preventDefault();
		mediaDropActive = true;
	}

	function handleMediaDragLeave(event) {
		if (composerReadOnly) return;
		event.preventDefault();
		const related = event.relatedTarget;
		if (related && event.currentTarget?.contains?.(related)) return;
		mediaDropActive = false;
	}

	async function handleMediaDrop(event) {
		if (composerReadOnly) return;
		event.preventDefault();
		mediaDropActive = false;
		const files = Array.from(event.dataTransfer?.files || []);
		await uploadSelectedMediaFiles(files, { silentIfEmpty: true });
	}

	function resetAiConversation() {
		aiPromptInput = '';
		aiConversation = [];
	}

	function buildAssistantReplyMessage(caption) {
		if (isComposerStoryTarget()) {
			return 'I updated the story draft image. Want any changes to the visual style or wording in the image?';
		}
		const trimmedCaption = String(caption || '').trim();
		if (!trimmedCaption) {
			return 'I updated the draft. Want any changes to the tone, wording, or image direction?';
		}
		return `Here’s a draft caption:\n\n${trimmedCaption}\n\nWant any changes to the tone, wording, or image direction?`;
	}

	function handleAiPromptKeydown(event) {
		if (event.key !== 'Enter' || event.shiftKey) return;
		event.preventDefault();
		void generateAiAssistedContent();
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
		if (intent === 'schedule') {
			const minimumDate = nextSchedulableDate();
			const selectedDate = composerScheduledFor ? new Date(composerScheduledFor) : null;
			if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
				showActionError('Choose a valid schedule date and time.');
				return false;
			}
			if (selectedDate.getTime() < minimumDate.getTime()) {
				showActionError(
					`Choose a time at or after the next publish window: ${formatDateTime(minimumDate)}.`
				);
				composerScheduledFor = formatLocalDateTimeInput(minimumDate);
				return false;
			}
		}
		if (normalizePostTarget(composerPostTarget) === 'story' && composerMedia.length === 0) {
			showActionError('Stories require at least one uploaded image.');
			return false;
		}
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

	async function uploadSelectedMediaFiles(files = [], { silentIfEmpty = false } = {}) {
		if (!slug) return;
		if (composerReadOnly) return;
		if (!Array.isArray(files) || files.length === 0) {
			if (!silentIfEmpty) showActionError('Select one or more images first.');
			return;
		}
		if (uploadingMedia) {
			showActionError('An upload is already in progress.');
			return;
		}
		clearFeedback();
		queuedMediaFiles = files;
		uploadingMedia = true;
		try {
			const formData = new FormData();
			for (const file of files) {
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
			queuedMediaFiles = [];
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
			const storyTarget = isComposerStoryTarget();
			const payload = {
				intent,
				caption: storyTarget ? '' : composerCaption,
				post_target: normalizePostTarget(composerPostTarget),
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
		const userMessage = aiPromptInput.trim();
		if (!userMessage) {
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
		aiConversation = [...aiConversation, { role: 'user', content: userMessage }];
		aiPromptInput = '';
		const hadPreviousGeneratedImages = aiGeneratedImages.length > 0;
		try {
			const storyTarget = isComposerStoryTarget();
			const selectedPlatforms = composerPlatforms.length
				? composerPlatforms
				: Array.from(new Set([...connectedPlatforms]));
			let caption = '';
			if (!storyTarget) {
				const captionPayload = await requestJson(`/api/groups/${slug}/social/ai-caption`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						source_prompt: userMessage,
						ride_details: userMessage,
						existing_caption: composerCaption,
						target_tone: `${selectedAiTone.label}: ${selectedAiTone.guidance} ${selectedAiTone.example}`,
						post_target: normalizePostTarget(composerPostTarget),
						platforms: selectedPlatforms,
						conversation_messages: aiConversation
					})
				});

				caption = captionPayload?.data?.caption || '';
				const prompt = captionPayload?.data?.ai_prompt || '';
				if (caption) {
					if (composerCaption.trim() && composerCaption.trim() !== caption.trim()) {
						const overwrite = window.confirm(
							'Replace your current caption with this AI suggestion?'
						);
						if (overwrite) composerCaption = caption;
					} else {
						composerCaption = caption;
					}
				}
				if (prompt) composerAiPrompt = prompt;
			} else {
				composerAiPrompt = userMessage;
			}

			const generated = await requestJson('/api/ai/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					target: 'group',
					modelId: aiImageModelId,
					aspectRatio: composerAspectRatio(),
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
					prompt: userMessage,
					allowTextInImage: storyTarget,
					textOverlay: storyTarget ? userMessage : '',
					context: {
						description: storyTarget ? userMessage : composerCaption || userMessage,
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
						aspect_ratio: composerAspectRatio(),
						platform: 'instagram,facebook'
					};
					rememberGeneratedImage(imageEntry);
				}
			}

			if (!composerScheduledFor) {
				const next = nextSchedulableDate();
				composerScheduledFor = formatLocalDateTimeInput(next);
			}

			aiConversation = [
				...aiConversation,
				{
					role: 'assistant',
					content: buildAssistantReplyMessage(caption)
				}
			];

			actionNotice = hadPreviousGeneratedImages
				? 'Draft updated. Previous AI images stay available below while you iterate.'
				: 'Draft generated. Review and schedule, publish now, or save as draft.';
		} catch (error) {
			aiConversation = aiConversation.slice(0, -1);
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
			? post.platforms
					.map((value) =>
						String(value || '')
							.trim()
							.toLowerCase()
					)
					.filter(Boolean)
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
		if (
			(action === 'publish' || action === 'retry') &&
			normalizePostTarget(post?.post_target) === 'story'
		) {
			const media = Array.isArray(post?.media) ? post.media : [];
			if (media.length === 0) {
				showActionError('Stories require at least one image before posting.');
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
				if (auto) {
					console.warn('social_comments_auto_sync_failed', detail);
				} else {
					actionError = `Some comments could not be synced. ${detail}`;
					toaster.error({ title: actionError });
					actionNotice = '';
					showConnectionsPanel = true;
				}
			} else if (!silent) {
				actionNotice = 'Comments synced.';
			} else if (!auto) {
				actionNotice = 'Comments synced.';
			}
		} catch (error) {
			const message = error?.message || 'Unable to sync comments.';
			if (auto) {
				console.warn('social_comments_auto_sync_exception', message);
			} else {
				showActionError(message);
			}
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
														- [{postTargetLabel(post?.post_target)}] {captionPreview(
															post.caption,
															30
														)}
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
																- [{postTargetLabel(post?.post_target)}] {captionPreview(
																	post.caption,
																	36
																)}
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
																		[{postTargetLabel(post?.post_target)}] {captionPreview(
																			post.caption,
																			38
																		)}
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
															[{postTargetLabel(post?.post_target)}] {captionPreview(
																post.caption,
																72
															)}
														</button>
													{/each}
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="space-y-3">
								{#if upcomingCards.length === 0}
									<div
										class="card preset-filled-surface-100-900 border-surface-200-800 flex flex-col items-center justify-center rounded-xl border p-8 text-center"
									>
										<div
											class="bg-surface-200-800 mb-3 flex h-12 w-12 items-center justify-center rounded-full"
										>
											<IconCalendar class="text-surface-600-400 h-6 w-6" />
										</div>
										<p class="text-surface-700-300 text-sm font-medium">No upcoming content</p>
										<p class="text-surface-600-400 mt-1 text-xs">Schedule posts to see them here</p>
									</div>
								{:else}
									{#each upcomingCards as post}
										<div
											class="card preset-filled-surface-100-900 border-surface-200-800 group hover:border-primary-500/30 relative overflow-hidden rounded-xl border transition-all duration-200"
										>
											<!-- Status indicator line -->
											<div
												class="absolute top-0 bottom-0 left-0 w-1 {getStatusColor(post.status)}"
											></div>

											<div class="flex gap-4 p-4">
												<!-- Media thumbnail -->
												<div
													role="button"
													tabindex="0"
													class="bg-surface-200-800 border-surface-300-700 relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border transition-transform duration-200 hover:scale-105"
													onclick={() => openUpcomingCard(post)}
													onkeydown={(event) =>
														(event.key === 'Enter' || event.key === ' ') && openUpcomingCard(post)}
												>
													{#if postPrimaryImageUrl(post)}
														<img
															src={postPrimaryImageUrl(post)}
															alt="Post preview"
															class="h-full w-full object-cover"
															loading="lazy"
														/>
													{:else}
														<div class="flex h-full w-full items-center justify-center">
															<IconImage class="text-surface-500 h-8 w-8" />
														</div>
													{/if}

													<!-- Target badge overlay -->\t
													<div class="absolute right-1 bottom-1">
														<span
															class="bg-surface-900/80 text-surface-100 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
														>
															{postTargetLabel(post?.post_target)}
														</span>
													</div>
												</div>

												<!-- Content -->
												<div class="flex min-w-0 flex-1 flex-col justify-between">
													<div class="min-w-0">
														<div
															role="button"
															tabindex="0"
															class="hover:text-primary-400 line-clamp-2 cursor-pointer text-sm leading-snug font-medium transition-colors"
															onclick={() => openUpcomingCard(post)}
															onkeydown={(event) =>
																(event.key === 'Enter' || event.key === ' ') &&
																openUpcomingCard(post)}
														>
															{captionPreview(post.caption, 100)}
														</div>

														<!-- Meta row: platforms + time -->
														<div class="mt-2 flex flex-wrap items-center gap-2">
															<!-- Platform icons -->
															<div class="flex items-center gap-1">
																{#if Array.isArray(post?.platforms) && post.platforms.length > 0}
																	{#each post.platforms as platform}
																		<div
																			class="bg-surface-200-800 flex h-5 w-5 items-center justify-center rounded"
																		>
																			{#if platform === 'instagram'}
																				<IconInstagram class="h-3 w-3 text-pink-500" />
																			{:else}
																				<IconFacebook class="h-3 w-3 text-blue-500" />
																			{/if}
																		</div>
																	{/each}
																{:else}
																	<span class="text-surface-600-400 text-xs">No platforms</span>
																{/if}
															</div>

															<!-- Time -->
															<div class="text-surface-600-400 flex items-center gap-1 text-xs">
																<IconClock class="h-3 w-3" />
																<span>{formatTimeAgo(post)}</span>
															</div>
														</div>
													</div>

													<!-- Action buttons -->
													<div class="mt-3 flex items-center gap-1">
														{#if post.status === 'failed'}
															<button
																type="button"
																class="btn-icon btn-icon-sm preset-outlined-warning-500"
																onclick={(event) => {
																	event.stopPropagation();
																	runPostAction(post.id, 'retry');
																}}
																disabled={Boolean(postActionPending[post.id])}
																aria-label="Retry"
																title="Retry"
															>
																<IconRefreshCw class="h-4 w-4" />
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
																Post Now
															</button>
														{/if}

														<button
															type="button"
															class="btn-icon btn-icon-sm preset-outlined-secondary-500"
															onclick={(event) => {
																event.stopPropagation();
																openComposerModal(resolvePostDate(post), { post });
															}}
															aria-label="Edit/Reschedule"
															title="Edit/Reschedule"
														>
															<IconEdit3 class="h-4 w-4" />
														</button>

														{#if normalizeStatus(post.status) === 'draft' || normalizeStatus(post.status) === 'scheduled'}
															<button
																type="button"
																class="btn-icon btn-icon-sm preset-outlined-error-500"
																onclick={(event) => {
																	event.stopPropagation();
																	runPostAction(post.id, 'delete');
																}}
																disabled={Boolean(postActionPending[post.id])}
																aria-label="Delete"
																title="Delete"
															>
																<IconTrash2 class="h-4 w-4" />
															</button>
														{/if}
													</div>
												</div>
											</div>

											<!-- Error banner -->
											{#if post.last_publish_error}
												<div
													class="border-error-500/20 bg-error-500/10 flex items-start gap-2 border-t px-4 py-2"
												>
													<IconAlertCircle class="text-error-500 mt-0.5 h-4 w-4 flex-shrink-0" />
													<p class="text-error-700-300 text-xs">{post.last_publish_error}</p>
												</div>
											{/if}
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
						{#if composerPreviewHasImage && !mobilePreviewOpen}
							<div class="composer-mobile-preview-row">
								<button
									type="button"
									class="composer-mobile-preview-toggle"
									onclick={toggleMobilePreview}
								>
									<IconMaximize2 class="h-3.5 w-3.5" />
									Show preview
								</button>
							</div>
						{/if}

						<!-- Body: two-panel on large screens -->
						<div
							class="composer-body"
							class:composer-body--preview-expanded={composerPreviewExpandedEffective}
						>
							<!-- LEFT: Form -->
							<div
								class="composer-form"
								class:composer-form--hidden={composerPreviewExpandedEffective}
							>
								<div class="field-group">
									<div class="field-label">Post Type</div>
									<div
										class="bg-surface-200-800/70 border-surface-500/40 grid w-full grid-cols-2 items-center overflow-hidden rounded-lg border"
									>
										{#each POST_TARGETS as target}
											<button
												type="button"
												class={`w-full px-3 py-1.5 text-sm transition-colors ${normalizePostTarget(composerPostTarget) === target ? 'bg-primary-500/20 text-primary-800-200 font-medium' : 'text-surface-700-300 hover:bg-surface-300-700/50'}`}
												onclick={() => (composerPostTarget = target)}
												disabled={composerReadOnly}
											>
												{postTargetLabel(target)}
											</button>
										{/each}
									</div>
								</div>

								<!-- AI Quick Draft Panel -->
								<section class="ai-draft-panel" class:ai-draft-panel--active={generatingAi}>
									<div class="ai-draft-panel__header">
										<div class="ai-draft-panel__header-main">
											<div class="ai-draft-panel__avatar">
												<IconSparkles class="h-4 w-4" />
											</div>
											<div class="ai-draft-panel__header-copy">
												<span class="ai-draft-panel__label">AI Assistant</span>
												<p class="ai-draft-panel__subtitle">
													{#if isComposerStoryTarget()}
														Tell me what you want to post and I&apos;ll draft a story image with the
														key text in-image.
													{:else}
														Tell me what you want to post and I&apos;ll draft the caption and image.
													{/if}
												</p>
											</div>
										</div>
										<div class="ai-draft-panel__header-actions">
											<span class="ai-draft-panel__hint"
												>{composerAspectRatio()} image for Instagram &amp; Facebook</span
											>
											{#if aiConversation.length > 0 && !composerReadOnly}
												<button
													type="button"
													class="ai-draft-panel__clear-btn"
													onclick={resetAiConversation}
													title="Clear conversation"
												>
													<IconRefreshCw class="h-4 w-4" />
												</button>
											{/if}
										</div>
									</div>
									<div class="ai-draft-panel__body">
										<div class="ai-draft-panel__thread">
											{#if aiConversation.length === 0}
												<div class="ai-draft-panel__welcome">
													<div class="ai-draft-panel__bubble">
														<p class="ai-draft-panel__bubble-text">
															Describe the post in plain language. Include the angle, emotional
															energy, and what you want people to do next.
														</p>
													</div>
												</div>
											{:else}
												<div class="ai-draft-panel__messages">
													{#each aiConversation as message}
														<div
															class="ai-draft-panel__message"
															class:ai-draft-panel__message--user={message.role === 'user'}
															class:ai-draft-panel__message--assistant={message.role ===
																'assistant'}
														>
															<div class="ai-draft-panel__message-avatar">
																{#if message.role === 'assistant'}
																	<IconSparkles class="h-4 w-4" />
																{:else}
																	<span class="ai-draft-panel__message-avatar-text">You</span>
																{/if}
															</div>
															<div class="ai-draft-panel__message-content">
																<p class="ai-draft-panel__message-text">{message.content}</p>
															</div>
														</div>
													{/each}
													{#if generatingAi}
														<div class="ai-draft-panel__message ai-draft-panel__message--assistant">
															<div class="ai-draft-panel__message-avatar">
																<IconSparkles class="h-4 w-4" />
															</div>
															<div class="ai-draft-panel__message-content">
																<div class="ai-draft-panel__typing">
																	<span></span>
																	<span></span>
																	<span></span>
																</div>
															</div>
														</div>
													{/if}
												</div>
											{/if}
										</div>
										<div class="ai-draft-panel__composer">
											<textarea
												class="composer-textarea ai-draft-panel__textarea"
												bind:value={aiPromptInput}
												onkeydown={handleAiPromptKeydown}
												placeholder={aiConversation.length
													? isComposerStoryTarget()
														? 'Reply with changes to story wording or image direction...'
														: 'Reply with changes to the caption or image...'
													: isComposerStoryTarget()
														? 'Example: Make a story slide that says "3 feet is the law" with a bold rider-rights call to action.'
														: 'Example: Write a rebellious caption about why the 3-foot passing law is legal and enforceable, and end with a rider-rights call to action.'}
												rows="3"
												disabled={composerReadOnly}
											></textarea>
											<button
												type="button"
												class="ai-draft-panel__send-btn"
												onclick={generateAiAssistedContent}
												disabled={generatingAi || composerReadOnly || !aiPromptInput.trim()}
												aria-label="Send message"
											>
												{#if generatingAi}
													<IconLoader class="h-4 w-4 animate-spin" />
												{:else}
													<IconSend class="h-4 w-4" />
												{/if}
											</button>
										</div>
										{#if aiConversation.length > 0}
											<p class="ai-draft-panel__composer-hint">
												Press Enter to send, Shift+Enter for new line
											</p>
										{/if}
										<!-- AI Settings Row -->
										<div class="ai-settings-row">
											<!-- Tone -->
											<div class="ai-setting">
												<label class="ai-setting__label" for="ai-tone">Tone</label>
												<select
													id="ai-tone"
													class="ai-setting__select"
													bind:value={aiToneId}
													disabled={composerReadOnly}
												>
													{#each AI_TONE_OPTIONS as tone}
														<option value={tone.id}>{tone.label}</option>
													{/each}
												</select>
											</div>

											<!-- Style -->
											<div class="ai-setting ai-setting--grow">
												<label class="ai-setting__label" for="ai-style">Style</label>
												<select
													id="ai-style"
													class="ai-setting__select"
													bind:value={aiStyleId}
													disabled={composerReadOnly}
												>
													{#each IMAGE_STYLE_PRESETS as style}
														<option value={style.id}>{style.label}</option>
													{/each}
												</select>
											</div>

											<!-- Model Toggle -->
											<div class="ai-setting">
												<span class="ai-setting__label">Model</span>
												<div class="ai-model-toggle">
													{#each SOCIAL_IMAGE_GENERATION_MODELS as option (option.id)}
														<button
															type="button"
															class="ai-model-toggle__btn"
															class:ai-model-toggle__btn--active={aiImageModelId === option.id}
															onclick={() => (aiImageModelId = option.id)}
															disabled={composerReadOnly}
														>
															{option.label}
														</button>
													{/each}
												</div>
											</div>
										</div>

										<!-- Optional: Tone description hint -->
										{#if selectedAiTone?.guidance}
											<p class="ai-tone-hint">{selectedAiTone.guidance}</p>
										{/if}

										<!-- Conditional Options -->
										{#if requiresAiStateSelection || requiresAiBikeVibeSelection}
											<div class="ai-conditional-row">
												{#if requiresAiStateSelection}
													<div class="ai-setting">
														<label class="ai-setting__label" for="ai-state">State</label>
														<select
															id="ai-state"
															class="ai-setting__select"
															bind:value={aiSelectedStateCode}
															disabled={composerReadOnly}
														>
															<option value="">Select...</option>
															{#each US_STATE_OPTIONS as option}
																<option value={option.code}>{option.code}</option>
															{/each}
														</select>
													</div>
												{/if}
												{#if requiresAiBikeVibeSelection}
													<div class="ai-setting ai-setting--grow">
														<label class="ai-setting__label" for="ai-bike">Bike Vibe</label>
														<select
															id="ai-bike"
															class="ai-setting__select"
															bind:value={aiSelectedBikeVibeId}
															disabled={composerReadOnly}
														>
															<option value="">Select...</option>
															{#each BIKE_VIBE_OPTIONS as option}
																<option value={option.id}>{option.label}</option>
															{/each}
														</select>
													</div>
												{/if}
											</div>
										{/if}
									</div>

									{#if aiGeneratedImages.length > 0}
										<div class="ai-generated-history">
											<div class="ai-generated-history__header">
												<span class="field-label-sm">Recent AI Images</span>
												<span class="ai-generated-history__hint">
													Selecting one makes it the active post image.
												</span>
											</div>
											<div class="ai-generated-history__grid">
												{#each aiGeneratedImages as item}
													{@const selected = item?.url === aiSelectedImageUrl}
													<div
														class="ai-generated-history__card"
														class:ai-generated-history__card--selected={selected}
													>
														<button
															type="button"
															class="ai-generated-history__preview"
															onclick={() => selectGeneratedImage(item)}
															disabled={composerReadOnly}
														>
															<img
																src={item.url}
																alt={item.file_name || 'Generated image'}
																class="ai-generated-history__image"
															/>
														</button>
														<div class="ai-generated-history__actions">
															<button
																type="button"
																class="ai-generated-history__btn"
																onclick={() => selectGeneratedImage(item)}
																disabled={composerReadOnly || selected}
															>
																{selected ? 'Active' : 'Use'}
															</button>
															<button
																type="button"
																class="ai-generated-history__icon-btn"
																onclick={() => removeGeneratedImage(item.url)}
																disabled={composerReadOnly}
																aria-label="Remove image"
																title="Remove image"
															>
																<IconTrash2 class="h-4 w-4" />
															</button>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}
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

								{#if !isComposerStoryTarget()}
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
								{/if}

								<!-- Media Uploads -->
								<div class="field-group">
									<div class="field-label">Media</div>
									<label
										class="media-drop-zone"
										class:media-drop-zone--active={mediaDropActive}
										for="composer-media-input"
										ondragover={handleMediaDragOver}
										ondragenter={handleMediaDragOver}
										ondragleave={handleMediaDragLeave}
										ondrop={handleMediaDrop}
									>
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
									{#if uploadingMedia}
										<div class="media-queued-row">
											<span class="inline-flex items-center gap-2 text-xs opacity-70">
												<IconLoader class="h-3.5 w-3.5 animate-spin" />
												Uploading
												{#if queuedMediaFiles.length > 0}
													: {queuedMediaFiles.map((f) => f.name).join(', ')}
												{/if}
											</span>
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
												min={minimumSchedulableInputValue}
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
								class:composer-preview--expanded={composerPreviewExpandedEffective}
								class:composer-preview--mobile-open={mobilePreviewOpen}
							>
								<div class="composer-preview__header">
									<div class="flex items-center gap-2">
										<span class="preview-label">Preview</span>
										<span class={postTargetClass(composerPostTarget)}>
											{postTargetLabel(composerPostTarget)}
										</span>
									</div>
									{#if getDraftPreviewImage()?.url}
										<button
											type="button"
											class="composer-preview-toggle composer-preview-toggle--desktop"
											onclick={toggleComposerPreviewExpanded}
										>
											<IconMaximize2 class="h-3.5 w-3.5" />
											View large
										</button>
										{#if mobilePreviewOpen}
											<button
												type="button"
												class="composer-preview-toggle composer-preview-toggle--mobile lg:hidden"
												onclick={closeMobilePreview}
											>
												<IconMinimize2 class="h-3.5 w-3.5" />
												Back to editor
											</button>
										{/if}
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
								{#if !isComposerStoryTarget()}
									<div class="composer-preview__caption">
										{#if composerCaption.trim()}
											<p class="composer-preview__caption-text">{composerCaption.trim()}</p>
										{:else}
											<p class="text-sm italic opacity-30">Your caption will appear here…</p>
										{/if}
									</div>
								{/if}
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
		overflow-y: auto;
		min-height: 0;
		scrollbar-gutter: stable;
	}

	@media (min-width: 1024px) {
		.composer-form--hidden {
			display: none;
		}
	}

	/* ─── AI Draft Panel ─── */
	.ai-draft-panel {
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 12%, transparent);
		background: linear-gradient(
			145deg,
			color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%),
			color-mix(in oklab, var(--color-surface-950) 90%, transparent)
		);
		box-shadow:
			0 1px 2px color-mix(in oklab, black 5%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 3%, transparent);
		transition: box-shadow 0.3s;
	}

	.ai-draft-panel--active {
		box-shadow:
			0 0 28px -6px color-mix(in oklab, var(--color-secondary-500) 35%, transparent),
			inset 0 1px 0 color-mix(in oklab, white 3%, transparent);
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

	@keyframes typing-bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.5;
		}
		30% {
			transform: translateY(-0.1875rem);
			opacity: 1;
		}
	}

	.ai-draft-panel__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-800) 30%, transparent);
		color: var(--color-surface-100);
	}

	.ai-draft-panel__header-main {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-width: 0;
	}

	.ai-draft-panel__header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.ai-draft-panel__avatar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		background: linear-gradient(
			135deg,
			var(--color-primary-500),
			color-mix(in oklab, var(--color-primary-500) 70%, var(--color-secondary-500) 30%)
		);
		color: white;
		box-shadow: 0 2px 8px color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.ai-draft-panel__header-copy {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.ai-draft-panel__label {
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}

	.ai-draft-panel__subtitle {
		font-size: 0.6875rem;
		line-height: 1.2;
		color: var(--color-surface-400);
	}

	.ai-draft-panel__hint {
		font-size: 0.6875rem;
		opacity: 0.55;
		margin-left: auto;
		display: none;
		flex-shrink: 0;
	}

	.ai-draft-panel__clear-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		background: transparent;
		color: color-mix(in oklab, var(--color-surface-300) 70%, transparent);
		transition: all 150ms ease;
	}

	.ai-draft-panel__clear-btn:hover {
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		color: var(--color-surface-200);
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

	.ai-draft-panel__thread {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 20rem;
		overflow-y: auto;
		padding-right: 0.125rem;
	}

	.ai-draft-panel__welcome {
		display: flex;
		justify-content: flex-start;
	}

	.ai-draft-panel__bubble {
		max-width: 34rem;
		padding: 0.875rem 1rem;
		border-radius: 1rem;
		border-top-left-radius: 0.25rem;
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
	}

	.ai-draft-panel__bubble-text {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--color-surface-100);
	}

	.ai-draft-panel__composer {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.625rem;
		align-items: end;
	}

	.ai-draft-panel__textarea {
		min-height: 5.5rem;
	}

	.ai-draft-panel__composer-hint {
		font-size: 0.6875rem;
		color: var(--color-surface-500);
	}

	.ai-draft-panel__messages {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ai-draft-panel__message {
		display: flex;
		gap: 0.625rem;
		align-items: flex-start;
	}

	.ai-draft-panel__message--user {
		flex-direction: row-reverse;
	}

	.ai-draft-panel__message-avatar {
		flex-shrink: 0;
		width: 1.75rem;
		height: 1.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-700) 40%, transparent);
		color: color-mix(in oklab, var(--color-surface-300) 80%, transparent);
	}

	.ai-draft-panel__message--assistant .ai-draft-panel__message-avatar {
		background: linear-gradient(
			135deg,
			var(--color-primary-500),
			color-mix(in oklab, var(--color-primary-500) 70%, var(--color-secondary-500) 30%)
		);
		color: white;
	}

	.ai-draft-panel__message-avatar-text {
		font-size: 0.5625rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.ai-draft-panel__message-content {
		flex: 1;
		max-width: calc(100% - 3rem);
		padding: 0.75rem 0.875rem;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
	}

	.ai-draft-panel__message--assistant .ai-draft-panel__message-content {
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		border-top-left-radius: 0.25rem;
	}

	.ai-draft-panel__message--user .ai-draft-panel__message-content {
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		border-top-right-radius: 0.25rem;
	}

	.ai-draft-panel__message-text {
		font-size: 0.8125rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.ai-draft-panel__typing {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem 0;
	}

	.ai-draft-panel__typing span {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-400) 60%, transparent);
		animation: typing-bounce 1.4s ease-in-out infinite;
	}

	.ai-draft-panel__typing span:nth-child(1) {
		animation-delay: 0ms;
	}

	.ai-draft-panel__typing span:nth-child(2) {
		animation-delay: 160ms;
	}

	.ai-draft-panel__typing span:nth-child(3) {
		animation-delay: 320ms;
	}

	.ai-draft-panel__send-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 9999px;
		background: var(--color-secondary-600);
		color: white;
		transition:
			background 0.2s,
			box-shadow 0.2s;
	}

	.ai-draft-panel__send-btn:hover:not(:disabled) {
		background: var(--color-secondary-500);
		box-shadow: 0 0 22px -4px color-mix(in oklab, var(--color-secondary-500) 55%, transparent);
	}

	.ai-draft-panel__send-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.ai-draft-panel__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
	}

	.ai-draft-panel__controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		align-items: start;
	}

	@media (max-width: 767px) {
		.ai-draft-panel__controls {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.ai-style-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex-grow: 1;
		min-width: 0;
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
		min-height: 2rem;
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

	.media-drop-zone--active {
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

	.ai-generated-history {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding-top: 0.25rem;
	}

	.ai-generated-history__header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.375rem 0.75rem;
	}

	.ai-generated-history__hint {
		font-size: 0.75rem;
		color: var(--color-surface-400);
	}

	.ai-generated-history__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
		gap: 0.75rem;
	}

	.ai-generated-history__card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 45%, transparent);
		background: color-mix(in oklab, var(--color-surface-900) 72%, transparent);
	}

	.ai-generated-history__card--selected {
		border-color: color-mix(in oklab, var(--color-primary-500) 70%, transparent);
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-primary-500) 20%, transparent);
	}

	.ai-generated-history__preview {
		display: block;
		width: 100%;
		overflow: hidden;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-surface-800) 70%, transparent);
	}

	.ai-generated-history__image {
		width: 100%;
		aspect-ratio: 4 / 5;
		object-fit: cover;
	}

	.ai-generated-history__actions {
		display: flex;
		gap: 0.5rem;
	}

	.ai-generated-history__btn {
		flex: 1;
		padding: 0.375rem 0.5rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		background: color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		color: var(--color-primary-300);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 35%, transparent);
	}

	.ai-generated-history__btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.ai-generated-history__icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-error-500) 12%, transparent);
		color: var(--color-error-300);
		border: 1px solid color-mix(in oklab, var(--color-error-500) 30%, transparent);
		flex-shrink: 0;
	}

	.ai-generated-history__icon-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.ai-generated-history__icon-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-error-500) 20%, transparent);
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
	.composer-mobile-preview-row {
		display: none;
	}

	.composer-mobile-preview-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary-300);
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 35%, transparent);
	}

	.composer-preview {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-700) 50%, transparent);
	}

	@media (max-width: 1023px) {
		.composer-mobile-preview-row {
			display: flex;
			justify-content: flex-end;
			padding: 0.625rem 1.25rem 0;
		}

		.composer-preview {
			display: none;
		}

		.composer-preview--mobile-open {
			display: flex;
		}

		.composer-preview-toggle--desktop {
			display: none;
		}

		.composer-preview-toggle--mobile {
			display: inline-flex;
		}
	}

	@media (min-width: 1024px) {
		.composer-mobile-preview-row {
			display: none;
		}

		.composer-preview-toggle--mobile {
			display: none;
		}
	}

	@media (min-width: 1024px) {
		.composer-preview {
			width: 16rem;
			flex-shrink: 0;
			min-height: 0;
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

	.composer-preview__caption-text {
		font-size: 0.875rem;
		line-height: 1.55;
		white-space: pre-wrap;
		word-break: break-word;
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
		display: flex;
	}

	@media (min-width: 1024px) {
		.composer-body--preview-expanded {
			display: block;
		}
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

	.composer-footer .composer-btn--ghost {
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

		.composer-footer .composer-btn--ghost {
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
			flex-wrap: wrap;
		}
	}

	/* ─── Compact AI Settings Row ─── */
	.ai-settings-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 40%, transparent);
		border-radius: 0.75rem;
	}

	.ai-setting {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 7rem;
	}

	.ai-setting--grow {
		flex: 1;
		min-width: 10rem;
	}

	.ai-setting__label {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-surface-400);
	}

	.ai-setting__select {
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
		color: var(--color-surface-100);
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		border-radius: 0.5rem;
		cursor: pointer;
		outline: none;
		transition: all 0.15s ease;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd' /%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.5rem center;
		background-size: 1rem;
		padding-right: 1.75rem;
	}

	.ai-setting__select:hover:not(:disabled) {
		background-color: color-mix(in oklab, var(--color-surface-700) 80%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	.ai-setting__select:focus {
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.ai-setting__select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Model Toggle */
	.ai-model-toggle {
		display: flex;
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.ai-model-toggle__btn {
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-surface-400);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.ai-model-toggle__btn:hover:not(:disabled) {
		color: var(--color-surface-200);
		background: color-mix(in oklab, var(--color-surface-600) 40%, transparent);
	}

	.ai-model-toggle__btn--active {
		color: var(--color-surface-100);
		background: color-mix(in oklab, var(--color-secondary-500) 25%, transparent);
	}

	.ai-model-toggle__btn--active:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-secondary-500) 35%, transparent);
	}

	.ai-model-toggle__btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Tone Hint */
	.ai-tone-hint {
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-surface-400);
		margin-top: 0.25rem;
		padding: 0.5rem 0.75rem;
		background: color-mix(in oklab, var(--color-surface-800) 40%, transparent);
		border-radius: 0.5rem;
		border-left: 2px solid color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	/* Conditional Row */
	.ai-conditional-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-800) 40%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 30%, transparent);
		border-radius: 0.75rem;
		margin-top: 0.5rem;
	}

	/* ─── AI Model Chips ─── */
	.ai-model-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.ai-model-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.875rem;
		background: color-mix(in oklab, var(--color-surface-700) 40%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 40%, transparent);
		border-radius: 9999px;
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-surface-100);
	}

	.ai-model-chip:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-500) 50%, transparent);
	}

	.ai-model-chip--selected {
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		color: var(--color-secondary-300);
	}

	.ai-model-chip--selected:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 70%, transparent);
	}

	.ai-model-chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-model-chip__check {
		width: 0.875rem;
		height: 0.875rem;
		color: var(--color-secondary-400);
		flex-shrink: 0;
	}

	.ai-model-chip__name {
		white-space: nowrap;
	}

	.ai-model-chip__badge {
		font-size: 0.625rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		color: white;
		flex-shrink: 0;
	}

	/* ─── Simple Selects ─── */
	.ai-select {
		width: 100%;
		padding: 0.625rem 0.875rem;
		font-size: 0.875rem;
		color: var(--color-surface-100);
		background: color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		border-radius: 0.625rem;
		cursor: pointer;
		outline: none;
		transition: all 0.15s ease;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd' /%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		background-size: 1.25rem;
		padding-right: 2.5rem;
	}

	.ai-select:hover:not(:disabled) {
		background-color: color-mix(in oklab, var(--color-surface-700) 70%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	.ai-select:focus {
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.ai-select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-hint {
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-surface-400);
		margin-top: 0.375rem;
	}

	/* ─── AI Style List ─── */
	.ai-style-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.ai-style-item {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: color-mix(in oklab, var(--color-surface-700) 40%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 40%, transparent);
		border-radius: 9999px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.ai-style-item:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-500) 50%, transparent);
	}

	.ai-style-item--selected {
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		color: var(--color-secondary-300);
	}

	.ai-style-item--selected:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 70%, transparent);
	}

	.ai-style-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-style-item__dot {
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 9999px;
		flex-shrink: 0;
	}

	/* Color dots for each style */
	.ai-style-item__dot[data-style='comic_house'] {
		background: linear-gradient(135deg, #e63946, #f4a261);
	}

	.ai-style-item__dot[data-style='risograph_patchwork'] {
		background: linear-gradient(135deg, #ff6b35, #004e89);
	}

	.ai-style-item__dot[data-style='quiet_gouache'] {
		background: linear-gradient(135deg, #a8dadc, #457b9d);
	}

	.ai-style-item__dot[data-style='wpa_travel_poster'] {
		background: linear-gradient(135deg, #264653, #e9c46a);
	}

	.ai-style-item__dot[data-style='bubbly_nautical_cartoon'] {
		background: linear-gradient(135deg, #00b4d8, #ff006e);
	}

	.ai-style-item__dot[data-style='anime'] {
		background: linear-gradient(135deg, #c77dff, #ffbe0b);
	}

	.ai-style-item__dot[data-style='crafty_clay'] {
		background: linear-gradient(135deg, #d4a373, #ccd5ae);
	}

	.ai-style-item__dot[data-style='fantasy_art'] {
		background: linear-gradient(135deg, #3d1f7a, #f72585);
	}

	.ai-style-item__dot[data-style='line_art'] {
		background: linear-gradient(135deg, #212529, #adb5bd);
	}

	.ai-style-item__dot[data-style='origami'] {
		background: linear-gradient(135deg, #f8f9fa, #adb5bd);
	}

	.ai-style-item__dot[data-style='pixel_art'] {
		background: repeating-linear-gradient(
			45deg,
			#ff0000 0px,
			#ff0000 2px,
			#00ff00 2px,
			#00ff00 4px,
			#0000ff 4px,
			#0000ff 6px
		);
	}

	.ai-style-item__dot[data-style='bike_vibe_spotlight'] {
		background: linear-gradient(135deg, #06d6a0, #118ab2);
	}

	.ai-style-item__dot[data-style='state_mascot_bike'] {
		background: linear-gradient(135deg, #ff9f1c, #2ec4b6);
	}

	.ai-style-item__name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-surface-100);
		white-space: nowrap;
	}

	.ai-style-item--selected .ai-style-item__name {
		color: var(--color-secondary-200);
	}

	.ai-style-item__check {
		width: 0.875rem;
		height: 0.875rem;
		color: var(--color-secondary-400);
		flex-shrink: 0;
	}

	.ai-style-hint {
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-surface-400);
		margin-top: 0.5rem;
	}

	.ai-tone-trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: color-mix(in oklab, var(--color-surface-700) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		border-radius: 0.625rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.ai-tone-trigger:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-surface-700) 70%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	.ai-tone-trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-tone-trigger__content {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		min-width: 0;
	}

	.ai-tone-trigger__name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-surface-100);
	}

	.ai-tone-trigger__preview {
		font-size: 0.75rem;
		color: var(--color-surface-400);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.ai-tone-trigger__chevron {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--color-surface-400);
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}

	.ai-tone-dropdown {
		position: absolute;
		top: calc(100% + 0.375rem);
		left: 0;
		right: 0;
		background: color-mix(in oklab, var(--color-surface-800) 98%, var(--color-surface-700) 2%);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		border-radius: 0.75rem;
		box-shadow:
			0 10px 40px -10px color-mix(in oklab, var(--color-surface-950) 90%, transparent),
			0 0 0 1px color-mix(in oklab, var(--color-surface-700) 30%, transparent);
		z-index: 100;
		max-height: 20rem;
		overflow-y: auto;
		opacity: 0;
		visibility: hidden;
		transform: translateY(-0.5rem);
		transition: all 0.2s ease;
	}

	.ai-tone-dropdown--open {
		opacity: 1;
		visibility: visible;
		transform: translateY(0);
	}

	.ai-tone-option {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		padding: 0.875rem 1rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-600) 20%, transparent);
		cursor: pointer;
		transition: background 0.15s ease;
		text-align: left;
	}

	.ai-tone-option:last-child {
		border-bottom: none;
	}

	.ai-tone-option:hover {
		background: color-mix(in oklab, var(--color-surface-700) 40%, transparent);
	}

	.ai-tone-option--selected {
		background: color-mix(in oklab, var(--color-secondary-500) 10%, transparent);
	}

	.ai-tone-option--selected:hover {
		background: color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.ai-tone-option__header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.ai-tone-option__name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-surface-100);
	}

	.ai-tone-option__check {
		width: 1rem;
		height: 1rem;
		color: var(--color-secondary-400);
	}

	.ai-tone-option__desc {
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--color-surface-400);
	}

	.ai-tone-option__example {
		font-size: 0.6875rem;
		font-style: italic;
		color: var(--color-surface-500);
		padding-left: 0.5rem;
		border-left: 2px solid color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	/* ─── Conditional Fields ─── */
	.ai-conditional-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.ai-conditional-field__label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-surface-300);
	}

	.ai-conditional-field__icon {
		width: 0.875rem;
		height: 0.875rem;
		color: var(--color-secondary-400);
	}

	.ai-conditional-field__select {
		width: 100%;
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
		color: var(--color-surface-100);
		background: color-mix(in oklab, var(--color-surface-700) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-600) 50%, transparent);
		border-radius: 0.5rem;
		cursor: pointer;
		outline: none;
		transition: all 0.15s ease;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd' /%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.625rem center;
		background-size: 1rem;
		padding-right: 2rem;
	}

	.ai-conditional-field__select:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
		background-color: color-mix(in oklab, var(--color-surface-700) 80%, transparent);
	}

	.ai-conditional-field__select:focus {
		border-color: color-mix(in oklab, var(--color-secondary-500) 60%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
	}

	.ai-conditional-field__select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-conditional-field__hint {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.6875rem;
		color: var(--color-surface-400);
	}

	.ai-conditional-field__spinner {
		width: 0.875rem;
		height: 0.875rem;
		animation: spin 1s linear infinite;
	}

	/* ─── Mobile Optimizations for AI Config ─── */
	@media (max-width: 640px) {
		.ai-config-panel {
			padding: 0.875rem;
		}

		.ai-model-grid {
			grid-template-columns: 1fr;
		}

		.ai-style-grid {
			grid-template-columns: repeat(2, 1fr);
			max-height: 14rem;
		}

		.ai-tone-dropdown {
			position: fixed;
			inset: auto;
			left: 0.75rem;
			right: 0.75rem;
			top: 50%;
			transform: translateY(-50%);
			max-height: 60vh;
			box-shadow:
				0 25px 50px -12px color-mix(in oklab, var(--color-surface-950) 95%, transparent),
				0 0 0 9999px color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		}

		.ai-tone-dropdown--open {
			transform: translateY(-50%);
		}
	}

	@media (min-width: 641px) and (max-width: 1023px) {
		.ai-style-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
