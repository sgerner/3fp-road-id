export const ASSISTANT_MODES = Object.freeze([
	'discover',
	'learn-library',
	'learn-article',
	'safety-report',
	'learn-write',
	'ride-write',
	'group-site-write'
]);

const REPORT_TEMPLATE_ROUTES = [
	{ pattern: /\bpass(?:ing)?\b|\blane position\b/i, campaigns: ['01-give-people-space'] },
	{ pattern: /\bdoor(?:ing)?\b|\bopening a door\b/i, campaigns: ['06-before-the-door'] },
	{
		pattern: /\bturn(?:ing)?\b|\bjunctions?\b|\bintersections?\b/i,
		campaigns: ['07-check-before-you-turn']
	},
	{
		pattern: /\bstor(?:y|ies)\b|\bhuman stor(?:y|ies)\b|\bidentit(?:y|ies)\b|why i'?m here/i,
		campaigns: ['02-why-im-here', '03-a-person-on-a-bike']
	},
	{ pattern: /\blights?\b|\bvisibility\b|\breflective\b/i, campaigns: ['05-light-the-ride'] }
];

export function normalizeReportTopicLabel(rawTopic) {
	if (typeof rawTopic !== 'string') return '';
	return rawTopic
		.trim()
		.replace(/^\d+\.\s*/, '')
		.split(':', 1)[0]
		.trim();
}

const SAFETY_REPORT_VIEW_PROMPTS = Object.freeze({
	'Read Report': [
		'What makes a cycling safety campaign effective?',
		'What does the evidence say about safe passing?',
		'How should we evaluate a campaign?',
		'What are the limitations of this review?'
	],
	'Campaign Kit and Templates': [
		'How should we pretest draft campaign templates before printing?',
		'What practical support should pair with a safe-passing campaign?',
		'How do we avoid blaming riders in dooring and turning materials?',
		'What should we record on the campaign evaluation sheet?'
	],
	'Evidence Table': [
		'What did study R42 measure and what are its limitations?',
		'Which studies measured actual on-road passing distance?',
		'Why do some equipment confidence intervals cross 1?',
		'How do survey comprehension studies differ from crash evaluations?'
	]
});

export function buildSafetyReportPrompts(rawTopic, activeView = 'Read Report') {
	const topicLabel = normalizeReportTopicLabel(rawTopic);
	if (topicLabel) {
		return [
			`What does the review say about ${topicLabel}?`,
			`Which sources support the findings on ${topicLabel}?`,
			`What should a campaign test about ${topicLabel}?`
		];
	}
	return SAFETY_REPORT_VIEW_PROMPTS[activeView] ?? SAFETY_REPORT_VIEW_PROMPTS['Read Report'];
}

export function matchSafetyReportTemplates(report, question, rawTopic = '') {
	if (!report || !Array.isArray(report.campaignGallery)) return [];
	const topicLabel = normalizeReportTopicLabel(rawTopic);
	const context = `${topicLabel} ${String(question || '')}`;
	const campaigns = REPORT_TEMPLATE_ROUTES.filter(({ pattern }) => pattern.test(context)).flatMap(
		({ campaigns: slugs }) => slugs
	);
	const selected = [];
	for (const campaign of campaigns) {
		const item = report.campaignGallery.find(
			(candidate) =>
				candidate?.campaign === campaign &&
				candidate?.page === 1 &&
				candidate?.assetId &&
				candidate?.src &&
				(candidate?.pdfUrl || candidate?.editableUrl || candidate?.canvaTemplateUrl)
		);
		if (!item || selected.some((suggestion) => suggestion.assetId === item.assetId)) continue;
		selected.push({
			assetId: item.assetId,
			title: item.title || 'Campaign template',
			alt: item.alt || item.title || 'Campaign template preview',
			src: item.src,
			pdfUrl: item.pdfUrl || null,
			editableUrl: item.editableUrl || null,
			canvaTemplateUrl: item.canvaTemplateUrl || null
		});
		if (selected.length === 3) break;
	}
	return selected;
}

export function getDiscoveryConfigForPathname(rawPathname = '/') {
	const pathname = String(rawPathname || '/').trim() || '/';

	if (pathname.startsWith('/ride')) {
		return {
			subtitle: 'Find rides, clubs & route ideas',
			placeholder: 'Ask for rides near you, pace options, or help posting a ride',
			starterPrompts: [
				'Find beginner-friendly rides near me',
				'Show recurring social rides this week',
				'I want to post my own community ride'
			]
		};
	}

	if (pathname.startsWith('/groups')) {
		return {
			subtitle: 'Explore cycling clubs & local advocacy groups',
			placeholder: 'Ask for bike groups by city, riding style, or how to start one',
			starterPrompts: [
				'Find welcoming cycling groups near me',
				'Show advocacy and community bike clubs',
				'How do I add or manage a group?'
			]
		};
	}

	if (pathname.startsWith('/volunteer')) {
		return {
			subtitle: 'Volunteer shifts, marshaling & advocacy events',
			placeholder: 'Ask for volunteer opportunities near you or event hosting help',
			starterPrompts: [
				'Find upcoming volunteer shifts near me',
				'Show ride marshaling and safety advocacy events',
				'I want to host a volunteer event'
			]
		};
	}

	if (pathname.startsWith('/learn')) {
		return {
			subtitle: 'Search across rides, groups, volunteer events & Learn',
			placeholder: 'Ask for rides, local groups, volunteer events, or guides',
			starterPrompts: [
				'Find beginner-friendly rides near me',
				'Show local cycling advocacy groups',
				'Recommend practical road safety guides'
			]
		};
	}

	if (pathname.startsWith('/get-involved') || pathname.startsWith('/donate')) {
		return {
			subtitle: 'Ways to ride, volunteer & advocate locally',
			placeholder: 'Ask how to get involved, volunteer, or join a local ride',
			starterPrompts: [
				'How can I get involved locally this month?',
				'Find volunteer events and advocacy groups near me',
				'Show guides for running a 3 Feet Please campaign'
			]
		};
	}

	if (pathname.startsWith('/roadid') || pathname.startsWith('/merch')) {
		return {
			subtitle: 'Safety gear, rides, groups & field guides',
			placeholder: 'Ask for rides, safety guides, local clubs, or volunteer events',
			starterPrompts: [
				'Recommend safety guides for everyday riders',
				'Find welcoming group rides near me',
				'Show local cycling clubs in my area'
			]
		};
	}

	if (pathname.startsWith('/profile') || pathname.startsWith('/messages')) {
		return {
			subtitle: 'Personalized rides, groups & volunteer picks',
			placeholder: 'Ask for recommendations tailored to your city and interests',
			starterPrompts: [
				'Recommend rides and groups for my interests',
				'Find upcoming volunteer shifts near me',
				'Suggest articles for safer commuting'
			]
		};
	}

	return {
		subtitle: 'Personalized rides, groups, volunteer events & guides',
		placeholder: 'Ask for rides, groups, volunteer events, articles, or posting help',
		starterPrompts: [
			'Find beginner-friendly rides near me',
			'Show local cycling groups and volunteer events',
			'Recommend practical cycling safety guides'
		]
	};
}

export function getContextualModeDefaults(mode, options = {}) {
	switch (mode) {
		case 'learn-library': {
			const categoryName = String(options.categoryName || '').trim();
			return {
				mode: 'learn-library',
				tabLabel: 'Library guide',
				buttonBadge: 'Guide',
				subtitle: categoryName
					? `Grounded in Learn · ${categoryName}`
					: 'Grounded in the Learn field guide',
				placeholder: 'What would you like to learn? (e.g. safer commuting, organizing rides)',
				maxLength: 700,
				welcome: categoryName
					? `Ask what you want to learn in ${categoryName} or across the Learn library, and I will point you to the best articles.`
					: 'Tell me what you want to learn and I will point you to the most relevant articles in the Learn library.',
				starterPrompts: categoryName
					? [
							`Where should I start in ${categoryName}?`,
							'I’m new to cycling',
							'Help me organize a community ride'
						]
					: [
							'How can I make my commute safer?',
							'I’m new to cycling',
							'Help me organize a community ride'
						]
			};
		}
		case 'learn-article': {
			const articleTitle = String(options.articleTitle || '').trim();
			return {
				mode: 'learn-article',
				tabLabel: 'This article',
				buttonBadge: 'Article',
				subtitle: articleTitle
					? `Grounded in “${articleTitle}”`
					: 'Grounded in this article (check source details)',
				placeholder: 'Ask a question about this article…',
				maxLength: 700,
				welcome: articleTitle
					? `Ask anything about “${articleTitle}”. Answers stay grounded in this article.`
					: 'Ask for a simpler explanation, a practical example, or key takeaways from this article.',
				starterPrompts: [
					'Explain this article simply',
					'Give me a practical example',
					'What should I remember?'
				]
			};
		}
		case 'safety-report': {
			const topicLabel = normalizeReportTopicLabel(options.topic);
			return {
				mode: 'safety-report',
				tabLabel: 'Safety report',
				buttonBadge: 'Report',
				subtitle: topicLabel
					? `Research review · ${topicLabel}`
					: 'Grounded in Safer Cycling, Better Messages (68 sources)',
				placeholder: 'Ask about the findings, evidence, road encounters, or limitations…',
				maxLength: 1200,
				welcome:
					'Ask about cycling safety campaigns, passing behavior, road encounters, or cited studies. Answers link directly to report sections and sources.',
				starterPrompts: buildSafetyReportPrompts(topicLabel)
			};
		}
		case 'learn-write': {
			return {
				mode: 'learn-write',
				tabLabel: 'Article studio',
				buttonBadge: 'Write',
				subtitle: options.canAskSavedArticle
					? 'Drafting & takeaway previews · Saved article Q&A available'
					: 'Drafting & takeaway previews · Review before applying',
				placeholder: 'Describe how to draft or revise this article (e.g. clearer for new riders)…',
				maxLength: 1200,
				welcome:
					'Describe what you want to write or refine. I will preview draft revisions or key takeaways here before anything changes in your editor.',
				starterPrompts: [
					'Make this clearer and more welcoming for first-time riders',
					'Turn my notes into a practical step-by-step guide',
					'Tighten the structure and add a quick checklist'
				]
			};
		}
		case 'ride-write': {
			return {
				mode: 'ride-write',
				tabLabel: 'Ride Muse',
				buttonBadge: 'Ride AI',
				subtitle: 'Co-plan route details, schedule & copy · Preview before applying',
				placeholder:
					'Monthly coffee ride, 18 miles, casual no-drop pace, first Saturday at 8am downtown…',
				maxLength: 1200,
				welcome:
					'Tell Ride Muse your route vibe, meetup spot, timing, and pace. I will prepare a structured ride draft you can preview, apply, or undo.',
				starterPrompts: [
					'Saturday morning coffee roll, 15 miles, casual no-drop pace',
					'Weekly Tuesday evening training ride, 24 miles, intermediate pace',
					'Family-friendly neighborhood park ride this Sunday at 10am'
				]
			};
		}
		case 'group-site-write': {
			return {
				mode: 'group-site-write',
				tabLabel: 'Website studio',
				buttonBadge: 'Site AI',
				subtitle: 'Update microsite copy, palette & sections · Preview before applying',
				placeholder: 'Example: Make the homepage warmer and put our weekly rides first…',
				maxLength: 1200,
				welcome:
					'Describe the feeling and priorities you want visitors to get. I will propose copy, layout, and style updates you can review before applying.',
				starterPrompts: [
					'Make it welcoming for brand-new riders',
					'Make the site bold, energetic, and action-focused',
					'Polish the copy without changing our voice'
				]
			};
		}
		default: {
			const discovery = getDiscoveryConfigForPathname(options.pathname);
			return {
				mode: 'discover',
				tabLabel: 'General discovery',
				buttonBadge: 'AI',
				subtitle: discovery.subtitle,
				placeholder: discovery.placeholder,
				maxLength: 500,
				welcome:
					'Ask for **rides**, **cycling groups**, **volunteer shifts**, **safety guides**, **Road ID** (`/roadid`), **merch** (`/merch`), or **donations** (`/donate`)—or tell me your city and state to search nearby.',
				starterPrompts: discovery.starterPrompts
			};
		}
	}
}

function normalizeStringArray(values) {
	if (!Array.isArray(values)) return [];
	return values.map((item) => String(item ?? '').trim()).sort();
}

export function rideDraftFingerprint(payload = {}) {
	const source = payload && typeof payload === 'object' ? payload : {};
	const exclusions = Array.isArray(source.exclusions)
		? source.exclusions.map((entry) => ({
				starts_on: String(entry?.starts_on ?? ''),
				ends_on: String(entry?.ends_on ?? ''),
				note: String(entry?.note ?? '')
			}))
		: [];
	const emailTemplates = Array.isArray(source.emailTemplates)
		? source.emailTemplates.map((tpl) => ({
				name: String(tpl?.name ?? ''),
				templateType: String(tpl?.templateType ?? tpl?.template_type ?? ''),
				sendOffsetMinutes: String(tpl?.sendOffsetMinutes ?? tpl?.send_offset_minutes ?? ''),
				subject: String(tpl?.subject ?? ''),
				body: String(tpl?.body ?? ''),
				isActive: Boolean(tpl?.isActive ?? true)
			}))
		: [];

	return JSON.stringify({
		title: String(source.title ?? ''),
		slug: String(source.slug ?? ''),
		summary: String(source.summary ?? ''),
		description: String(source.description ?? ''),
		timezone: String(source.timezone ?? ''),
		startsAt: String(source.startsAt ?? ''),
		endsAt: String(source.endsAt ?? ''),
		status: String(source.status ?? ''),
		hostGroupId: String(source.hostGroupId ?? ''),
		externalEventUrl: String(source.externalEventUrl ?? ''),
		externalOrganizerName: String(source.externalOrganizerName ?? ''),
		contactEmail: String(source.contactEmail ?? ''),
		contactPhone: String(source.contactPhone ?? ''),
		startLocationName: String(source.startLocationName ?? ''),
		startLocationAddress: String(source.startLocationAddress ?? ''),
		startLatitude: String(source.startLatitude ?? ''),
		startLongitude: String(source.startLongitude ?? ''),
		endLocationName: String(source.endLocationName ?? ''),
		endLocationAddress: String(source.endLocationAddress ?? ''),
		endLatitude: String(source.endLatitude ?? ''),
		endLongitude: String(source.endLongitude ?? ''),
		participantVisibility: String(source.participantVisibility ?? ''),
		estimatedDistanceMiles: String(source.estimatedDistanceMiles ?? ''),
		estimatedDurationMinutes: String(source.estimatedDurationMinutes ?? ''),
		elevationGainFeet: String(source.elevationGainFeet ?? ''),
		paceNotes: String(source.paceNotes ?? ''),
		isNoDrop: Boolean(source.isNoDrop),
		surfaceTypes: normalizeStringArray(source.surfaceTypes),
		bikeSuitability: normalizeStringArray(source.bikeSuitability),
		difficultyLevelIds: normalizeStringArray(source.difficultyLevelIds),
		ridingDisciplineIds: normalizeStringArray(source.ridingDisciplineIds),
		accessibilityNotes: String(source.accessibilityNotes ?? ''),
		waiverRequired: Boolean(source.waiverRequired),
		recurrenceEnabled: Boolean(source.recurrenceEnabled),
		recurrenceFrequency: String(source.recurrenceFrequency ?? ''),
		recurrenceInterval: String(source.recurrenceInterval ?? ''),
		recurrenceWeekdays: normalizeStringArray(source.recurrenceWeekdays),
		recurrenceMonthPositions: normalizeStringArray(source.recurrenceMonthPositions),
		recurrenceUntilOn: String(source.recurrenceUntilOn ?? ''),
		exclusions,
		emailTemplates
	});
}

export function summarizeRideDraft(currentPayload = {}, draft = null) {
	if (!draft || typeof draft !== 'object') return [];
	const lines = [];
	const meta = draft.metadata ?? {};
	const ride = draft.ride ?? {};
	const recurrence = draft.recurrence ?? {};

	if (meta.title && meta.title !== currentPayload?.title) {
		lines.push(`Title: ${meta.title}`);
	}
	if (meta.summary && meta.summary !== currentPayload?.summary) {
		const trimmed = meta.summary.length > 90 ? `${meta.summary.slice(0, 87)}...` : meta.summary;
		lines.push(`Summary: ${trimmed}`);
	}
	if (meta.description && meta.description !== currentPayload?.description) {
		lines.push('Updated ride description');
	}
	if (meta.starts_at) {
		lines.push(`Starts: ${meta.starts_at}`);
	}
	if (meta.start_location_name || meta.start_location_address) {
		lines.push(
			`Meetup: ${[meta.start_location_name, meta.start_location_address].filter(Boolean).join(' · ')}`
		);
	}
	const metrics = [];
	if (ride.estimated_distance_miles != null) metrics.push(`${ride.estimated_distance_miles} mi`);
	if (ride.estimated_duration_minutes != null)
		metrics.push(`${ride.estimated_duration_minutes} min`);
	if (ride.elevation_gain_feet != null) metrics.push(`${ride.elevation_gain_feet} ft gain`);
	if (typeof ride.is_no_drop === 'boolean') metrics.push(ride.is_no_drop ? 'No-drop' : 'Drop ride');
	if (metrics.length) {
		lines.push(`Ride stats: ${metrics.join(' · ')}`);
	}
	if (ride.pace_notes) {
		lines.push(`Pace: ${ride.pace_notes}`);
	}
	if (Array.isArray(ride.difficulty_labels) && ride.difficulty_labels.length) {
		lines.push(`Difficulty: ${ride.difficulty_labels.join(', ')}`);
	}
	if (Array.isArray(ride.riding_disciplines) && ride.riding_disciplines.length) {
		lines.push(`Disciplines: ${ride.riding_disciplines.join(', ')}`);
	}
	if (Array.isArray(ride.surface_types) && ride.surface_types.length) {
		lines.push(`Surfaces: ${ride.surface_types.join(', ')}`);
	}
	if (typeof recurrence.enabled === 'boolean') {
		lines.push(
			recurrence.enabled
				? `Schedule: recurring ${recurrence.frequency || 'series'}`
				: 'Schedule: single ride'
		);
	}
	if (Array.isArray(draft.email_templates) && draft.email_templates.length) {
		lines.push(
			`Reminder emails: ${draft.email_templates.length} template${draft.email_templates.length === 1 ? '' : 's'}`
		);
	}
	if (!lines.length) {
		lines.push('Prepared ride details ready to merge into your form.');
	}
	return lines.slice(0, 10);
}

export function verifyBaseFingerprint(currentFingerprint, baseFingerprint, message) {
	if (
		typeof baseFingerprint === 'string' &&
		baseFingerprint.length > 0 &&
		currentFingerprint !== baseFingerprint
	) {
		return {
			ok: false,
			conflict: true,
			error:
				message ||
				'Your draft changed after this suggestion was created. Ask the assistant again so your latest edits are preserved.'
		};
	}
	return { ok: true, conflict: false, error: '' };
}

export function verifyAppliedFingerprint(currentFingerprint, appliedFingerprint, message) {
	if (
		typeof appliedFingerprint !== 'string' ||
		appliedFingerprint.length === 0 ||
		currentFingerprint !== appliedFingerprint
	) {
		return {
			ok: false,
			conflict: true,
			error:
				message ||
				'Your draft changed after you applied this suggestion, so undo was skipped to protect your newer edits.'
		};
	}
	return { ok: true, conflict: false, error: '' };
}
