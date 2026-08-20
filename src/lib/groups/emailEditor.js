const escapeHtml = (value) =>
	String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const safeColor = (value, fallback) =>
	/^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? value : fallback;

const safeWebUrl = (value) => {
	const candidate = String(value ?? '').trim();
	try {
		const parsed = new URL(candidate);
		return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname
			? parsed.toString()
			: '';
	} catch {
		return '';
	}
};

const blockId = (type) =>
	`email-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const EMAIL_BLOCK_OPTIONS = [
	{ type: 'heading', label: 'Headline', description: 'A clear opening idea', icon: 'H' },
	{ type: 'eyebrow', label: 'Label', description: 'A short category line', icon: 'Aa' },
	{ type: 'text', label: 'Text', description: 'Details and body copy', icon: '¶' },
	{ type: 'image', label: 'Image', description: 'A responsive photo', icon: '▧' },
	{ type: 'button', label: 'Button', description: 'One next step', icon: '→' },
	{ type: 'divider', label: 'Divider', description: 'A visual break', icon: '—' }
];

export const MAX_EMAIL_BLOCKS = 30;
export const MAX_EMAIL_HTML_LENGTH = 50000;

export const EMAIL_PURPOSES = [
	{
		id: 'newsletter',
		label: 'Newsletter',
		description: 'A friendly roundup with one clear next step.'
	},
	{
		id: 'announcement',
		label: 'Announcement',
		description: 'A short, focused update people can scan quickly.'
	},
	{
		id: 'event',
		label: 'Event invite',
		description: 'The essential details plus a direct RSVP.'
	},
	{
		id: 'fundraiser',
		label: 'Fundraiser',
		description: 'Lead with impact and make donating effortless.'
	},
	{
		id: 'renewal',
		label: 'Membership renewal',
		description: 'A personal reminder focused on member value.'
	}
];

export const EMAIL_BRAND_PRESETS = [
	{
		id: 'group',
		label: 'Group brand',
		primaryColor: '#84CC16',
		backgroundColor: '#F4F4F5',
		inkColor: '#18181B'
	},
	{
		id: 'sunrise',
		label: 'Sunrise',
		primaryColor: '#EA580C',
		backgroundColor: '#FFF7ED',
		inkColor: '#1C1917'
	},
	{
		id: 'cobalt',
		label: 'Cobalt',
		primaryColor: '#2563EB',
		backgroundColor: '#EFF6FF',
		inkColor: '#172554'
	},
	{
		id: 'grove',
		label: 'Grove',
		primaryColor: '#15803D',
		backgroundColor: '#F0FDF4',
		inkColor: '#14532D'
	},
	{
		id: 'rose',
		label: 'Rose',
		primaryColor: '#E11D48',
		backgroundColor: '#FFF1F2',
		inkColor: '#4C0519'
	}
];

export function newEmailBlock(type, actionUrl = '') {
	return {
		id: blockId(type),
		type,
		...(type === 'heading' ? { text: 'A clear, compelling headline' } : {}),
		...(type === 'eyebrow' ? { text: 'Worth knowing' } : {}),
		...(type === 'text' ? { text: 'Click to write your message.' } : {}),
		...(type === 'image' ? { url: '', alt: '' } : {}),
		...(type === 'button'
			? { text: 'Take the next step', url: safeWebUrl(actionUrl) || 'https://3feetplease.org' }
			: {})
	};
}

export const cloneEmailBlocks = (blocks, { freshIds = false } = {}) =>
	(Array.isArray(blocks) ? blocks : []).map((block) => ({
		...block,
		id: freshIds || !block?.id ? blockId(block?.type ?? 'text') : block.id
	}));

export function moveEmailBlock(blocks, from, to) {
	const next = cloneEmailBlocks(blocks);
	if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}

export function duplicateEmailBlock(blocks, id) {
	const next = cloneEmailBlocks(blocks);
	const index = next.findIndex((block) => block.id === id);
	if (index < 0) return next;
	next.splice(index + 1, 0, { ...next[index], id: blockId(next[index].type ?? 'text') });
	return next;
}

export function createPurposeBlocks(purpose, group = {}) {
	const groupName = String(group?.name || 'Your group').trim();
	const siteUrl = safeWebUrl(group?.website_url) || 'https://3feetplease.org';
	const block = (type, values = {}) => ({ ...newEmailBlock(type), ...values });

	if (purpose === 'announcement') {
		return [
			block('eyebrow', { text: 'Important update' }),
			block('heading', { text: 'Here’s what you need to know' }),
			block('text', {
				text: 'Share the change in one or two short paragraphs. Lead with what changed, who it affects, and what happens next.'
			}),
			block('button', { text: 'Read the full update', url: siteUrl })
		];
	}
	if (purpose === 'event') {
		return [
			block('eyebrow', { text: 'You’re invited' }),
			block('heading', { text: 'Join us for our next community event' }),
			block('text', {
				text: 'Saturday · 8:00 AM\nMeet at the usual rollout spot. Bring water, lights, and a friend who has been meaning to join.'
			}),
			block('button', { text: 'RSVP now', url: siteUrl })
		];
	}
	if (purpose === 'fundraiser') {
		return [
			block('eyebrow', { text: 'Make an impact' }),
			block('heading', { text: 'Help keep our community moving' }),
			block('text', {
				text: 'Explain the specific outcome this campaign supports. Show people what their contribution makes possible and why help matters now.'
			}),
			block('button', { text: 'Donate today', url: siteUrl })
		];
	}
	if (purpose === 'renewal') {
		return [
			block('eyebrow', { text: 'Membership reminder' }),
			block('heading', { text: '{{first_name}}, keep rolling with us' }),
			block('text', {
				text: `Your membership helps ${groupName} organize welcoming rides, support volunteers, and keep members connected. Renewing only takes a moment.`
			}),
			block('button', { text: 'Renew membership', url: siteUrl })
		];
	}

	return [
		block('eyebrow', { text: 'Community update' }),
		block('heading', { text: `${groupName}, in motion` }),
		block('text', {
			text: 'Hi {{first_name}},\n\nLead with the one story, opportunity, or deadline members should know this month.'
		}),
		block('divider'),
		block('heading', { text: 'What’s coming up' }),
		block('text', {
			text: 'Add two or three short highlights. Keep each one useful, specific, and easy to scan.'
		}),
		block('button', { text: 'See what’s happening', url: siteUrl })
	];
}

export function createDefaultEmailDraft(group = {}, senderDomains = []) {
	const sender = Array.isArray(senderDomains)
		? senderDomains.find((row) => row.is_default && row.ses_verified_for_sending) ||
			senderDomains.find((row) => row.ses_verified_for_sending) ||
			senderDomains.find((row) => row.is_default) ||
			senderDomains[0]
		: null;
	const purpose = 'newsletter';
	return {
		campaignName: `${String(group?.name || 'Group').trim()} newsletter`,
		subject: `News from ${String(group?.name || 'your group').trim()}`,
		preheader: 'A quick update from your cycling community.',
		purpose,
		brandPresetId: 'group',
		brand: { ...EMAIL_BRAND_PRESETS[0] },
		senderDomainId: sender?.id || '',
		replyToEmail: sender?.reply_to_email || sender?.from_email_address || '',
		audienceStatuses: ['active'],
		includeNewsletterSubscribers: false,
		blocks: createPurposeBlocks(purpose, group)
	};
}

export function getCampaignReadiness({
	draft,
	senderDomains = [],
	audienceCount = 0,
	renderedHtmlLength = 0
}) {
	const content = Array.isArray(draft?.blocks) ? draft.blocks : [];
	const images = content.filter((block) => block.type === 'image');
	const buttons = content.filter((block) => block.type === 'button');
	const unsafeLinks = [...images, ...buttons].filter((block) => !safeWebUrl(block.url));
	const sender = senderDomains.find((row) => row.id === draft?.senderDomainId);
	return [
		{
			key: 'subject',
			label: draft?.subject?.trim() ? 'Subject line is ready' : 'Add a subject line',
			ready: Boolean(draft?.subject?.trim()),
			blocking: true
		},
		{
			key: 'content',
			label:
				renderedHtmlLength > MAX_EMAIL_HTML_LENGTH
					? 'Shorten the message before saving'
					: content.length > MAX_EMAIL_BLOCKS
						? `Reduce the message to ${MAX_EMAIL_BLOCKS} content blocks`
						: content.length
							? `${content.length} content blocks`
							: 'Add message content',
			ready:
				content.length > 0 &&
				content.length <= MAX_EMAIL_BLOCKS &&
				renderedHtmlLength <= MAX_EMAIL_HTML_LENGTH,
			blocking: true
		},
		{
			key: 'audience',
			label:
				audienceCount > 2000
					? 'Audience exceeds the 2,000-recipient limit'
					: audienceCount > 0
						? `${audienceCount} recipients selected`
						: 'Choose a non-empty audience',
			ready: audienceCount > 0 && audienceCount <= 2000,
			blocking: true
		},
		{
			key: 'sender',
			label: sender?.ses_verified_for_sending
				? 'Verified sender selected'
				: 'Choose a verified sender',
			ready: Boolean(sender?.ses_verified_for_sending),
			blocking: true
		},
		{
			key: 'links',
			label: unsafeLinks.length
				? 'Fix missing, incomplete, or unsafe links'
				: 'Links are safe to send',
			ready: unsafeLinks.length === 0,
			blocking: unsafeLinks.length > 0
		},
		{
			key: 'alt',
			label: images.length
				? images.every((block) => block.alt?.trim())
					? 'Images have descriptions'
					: 'Add alt text to every image'
				: 'No images need descriptions',
			ready: images.every((block) => block.alt?.trim()),
			blocking: images.some((block) => !block.alt?.trim())
		},
		{
			key: 'cta',
			label:
				buttons.length === 1
					? 'One clear call to action'
					: buttons.length
						? `${buttons.length} calls to action — consider one`
						: 'Consider adding one call to action',
			ready: buttons.length === 1,
			blocking: false
		}
	];
}

function renderBlockHtml(block, brand) {
	const accent = safeColor(brand?.primaryColor, '#84CC16');
	if (block?.type === 'heading') {
		return `<h2 style="margin:0;padding:12px 0;font-family:Arial,sans-serif;font-size:34px;line-height:1.15;color:${escapeHtml(safeColor(brand?.inkColor, '#18181B'))};">${escapeHtml(block.text)}</h2>`;
	}
	if (block?.type === 'eyebrow') {
		return `<p style="margin:0;padding:10px 0;font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${escapeHtml(accent)};">${escapeHtml(block.text)}</p>`;
	}
	if (block?.type === 'image') {
		const url = safeWebUrl(block.url);
		return url
			? `<img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt)}" width="640" style="display:block;width:100%;height:auto;margin:12px 0;border-radius:16px;">`
			: '';
	}
	if (block?.type === 'button') {
		const url = safeWebUrl(block.url);
		return url
			? `<p style="margin:12px 0 4px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:${escapeHtml(accent)};color:#fff;font-family:Arial,sans-serif;font-weight:700;text-decoration:none;">${escapeHtml(block.text || 'Learn more')}</a></p>`
			: '';
	}
	if (block?.type === 'divider') {
		return '<hr style="margin:20px 0;border:0;border-top:1px solid #D4D4D8;">';
	}
	return `<p style="margin:0;padding:10px 0;font-family:Arial,sans-serif;font-size:17px;line-height:1.7;white-space:pre-line;color:${escapeHtml(safeColor(brand?.inkColor, '#18181B'))};">${escapeHtml(block?.text)}</p>`;
}

export function renderCampaignHtml({ draft, group }) {
	const brand = draft?.brand || EMAIL_BRAND_PRESETS[0];
	const background = safeColor(brand.backgroundColor, '#F4F4F5');
	const ink = safeColor(brand.inkColor, '#18181B');
	const blocks = Array.isArray(draft?.blocks) ? draft.blocks : [];
	return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(draft?.subject || '')}</title></head>
<body style="margin:0;background:${escapeHtml(background)};color:${escapeHtml(ink)};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(draft?.preheader || '')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${escapeHtml(background)};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#fff;border-radius:24px;"><tr><td style="padding:34px 36px 12px;font-family:Arial,sans-serif;font-weight:800;">${escapeHtml(group?.name || 'Your group')}</td></tr><tr><td style="padding:8px 36px 32px;">
${blocks.map((block) => renderBlockHtml(block, brand)).join('')}
<p style="margin:30px 0 0;padding-top:20px;border-top:1px solid #E4E4E7;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#71717A;">You are receiving this because you are a member of ${escapeHtml(group?.name || 'this group')}.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderCampaignText({ draft }) {
	const blocks = Array.isArray(draft?.blocks) ? draft.blocks : [];
	return blocks
		.map((block) => {
			if (block.type === 'divider') return '---';
			if (block.type === 'image') return block.alt ? `[Image: ${block.alt}]` : '';
			if (block.type === 'button') return `${block.text || 'Learn more'}: ${safeWebUrl(block.url)}`;
			return String(block.text || '').trim();
		})
		.filter(Boolean)
		.join('\n\n');
}
