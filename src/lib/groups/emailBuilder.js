function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function ensureAbsoluteUrl(value) {
	const cleaned = cleanText(value);
	if (!cleaned) return '';
	if (/^https?:\/\//i.test(cleaned)) return cleaned;
	return `https://${cleaned.replace(/^\/+/, '')}`;
}

function nl2br(value) {
	return escapeHtml(value).replace(/\n/g, '<br />');
}

export const EMAIL_TEMPLATE_PRESETS = [
	{
		id: 'sunrise',
		label: 'Sunrise Brief',
		description: 'Warm editorial header with a clean card stack.',
		colors: {
			background: '#fffaf3',
			panel: '#ffffff',
			ink: '#122033',
			muted: '#5b6777',
			accent: '#ef7f45',
			accentSoft: '#ffe2d1',
			border: '#f3d5c4'
		}
	},
	{
		id: 'cobalt',
		label: 'Cobalt Bulletin',
		description: 'Bold civic newsletter with cool contrast.',
		colors: {
			background: '#f4f8ff',
			panel: '#ffffff',
			ink: '#0f1b3d',
			muted: '#51607c',
			accent: '#2b6df6',
			accentSoft: '#dbe8ff',
			border: '#cddcff'
		}
	},
	{
		id: 'grove',
		label: 'Grove Campaign',
		description: 'Fresh high-contrast layout for calls to action.',
		colors: {
			background: '#f6fbf2',
			panel: '#ffffff',
			ink: '#18311b',
			muted: '#4b6250',
			accent: '#2f8f57',
			accentSoft: '#daf2e3',
			border: '#c9e4d1'
		}
	}
];

export function createDefaultEmailDraft(group, senderDomains = []) {
	const sender = Array.isArray(senderDomains)
		? senderDomains.find((row) => row.is_default) || senderDomains[0]
		: null;
	return {
		campaignName: `${cleanText(group?.name) || 'Group'} campaign`,
		subject: `${cleanText(group?.name) || 'Group'} update for {{first_name}}`,
		preheader: 'A polished campaign built in your group dashboard.',
		templateId: EMAIL_TEMPLATE_PRESETS[0].id,
		senderDomainId: sender?.id || '',
		replyToEmail: sender?.reply_to_email || sender?.from_email_address || '',
		audienceStatuses: ['active'],
		blocks: [
			{
				id: 'hero-1',
				type: 'hero',
				eyebrow: 'Community update',
				title: `${cleanText(group?.name) || 'Your group'}, in motion`,
				body: 'Lead with one clear message. Summarize what changed, what matters, and why members should care right now.',
				buttonLabel: 'Open the full update',
				buttonUrl: group?.website_url || ''
			},
			{
				id: 'paragraph-1',
				type: 'paragraph',
				title: 'What members should know',
				body: 'Use a concise section to explain the main story, upcoming deadline, or program change.\n\nYou can personalize copy with {{first_name}}, {{membership_tier}}, and {{renewal_date}}.'
			},
			{
				id: 'metrics-1',
				type: 'metrics',
				items: [
					{ label: 'Members reached', value: '{{audience_count}}' },
					{ label: 'Upcoming rides', value: '{{upcoming_ride_count}}' },
					{ label: 'Volunteer shifts', value: '{{upcoming_volunteer_count}}' }
				]
			},
			{
				id: 'button-1',
				type: 'button',
				title: 'Feature a single strong next step',
				buttonLabel: 'Become a host',
				buttonUrl: group?.website_url || ''
			}
		]
	};
}

function renderHero(block, palette) {
	return `
		<section style="padding:32px;background:${palette.accentSoft};border:1px solid ${palette.border};border-radius:28px;">
			<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${palette.accent};font-weight:700;">
				${escapeHtml(block.eyebrow || '')}
			</div>
			<h1 style="margin:14px 0 10px;font-size:34px;line-height:1.1;color:${palette.ink};">
				${escapeHtml(block.title || '')}
			</h1>
			<p style="margin:0;font-size:16px;line-height:1.7;color:${palette.muted};">
				${nl2br(block.body || '')}
			</p>
			${
				block.buttonLabel && block.buttonUrl
					? `<div style="margin-top:20px;"><a href="${escapeHtml(
							ensureAbsoluteUrl(block.buttonUrl)
						)}" style="display:inline-block;background:${palette.accent};color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:999px;font-weight:700;">${escapeHtml(block.buttonLabel)}</a></div>`
					: ''
			}
		</section>
	`;
}

function renderParagraph(block, palette) {
	return `
		<section style="padding:28px 30px;background:${palette.panel};border:1px solid ${palette.border};border-radius:24px;">
			${block.title ? `<h2 style="margin:0 0 12px;color:${palette.ink};font-size:22px;">${escapeHtml(block.title)}</h2>` : ''}
			<p style="margin:0;font-size:16px;line-height:1.8;color:${palette.muted};">${nl2br(block.body || '')}</p>
		</section>
	`;
}

function renderMetrics(block, palette) {
	const items = Array.isArray(block.items)
		? block.items.filter((item) => cleanText(item?.label) || cleanText(item?.value))
		: [];
	if (!items.length) return '';
	return `
		<section style="padding:26px 28px;background:${palette.panel};border:1px solid ${palette.border};border-radius:24px;">
			<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
				<tr>
					${items
						.map(
							(item) => `
								<td style="padding:0 10px;vertical-align:top;" width="${Math.floor(100 / items.length)}%">
									<div style="font-size:28px;line-height:1;color:${palette.ink};font-weight:800;">${escapeHtml(item.value || '')}</div>
									<div style="margin-top:8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${palette.muted};">${escapeHtml(item.label || '')}</div>
								</td>
							`
						)
						.join('')}
				</tr>
			</table>
		</section>
	`;
}

function renderButton(block, palette) {
	if (!block.buttonLabel || !block.buttonUrl) return '';
	return `
		<section style="padding:30px;background:linear-gradient(135deg, ${palette.ink}, ${palette.accent});border-radius:26px;">
			${block.title ? `<h2 style="margin:0 0 10px;color:#ffffff;font-size:24px;">${escapeHtml(block.title)}</h2>` : ''}
			<a href="${escapeHtml(ensureAbsoluteUrl(block.buttonUrl))}" style="display:inline-block;background:#ffffff;color:${palette.ink};text-decoration:none;padding:14px 18px;border-radius:999px;font-weight:800;">
				${escapeHtml(block.buttonLabel)}
			</a>
		</section>
	`;
}

function renderQuote(block, palette) {
	return `
		<section style="padding:30px;background:${palette.panel};border-left:6px solid ${palette.accent};border-radius:20px;">
			<p style="margin:0;font-size:22px;line-height:1.6;color:${palette.ink};">${nl2br(block.body || '')}</p>
			${block.title ? `<div style="margin-top:12px;font-size:13px;color:${palette.muted};font-weight:700;">${escapeHtml(block.title)}</div>` : ''}
		</section>
	`;
}

export function renderCampaignHtml({ draft, group, audienceCount = 0 }) {
	const preset =
		EMAIL_TEMPLATE_PRESETS.find((item) => item.id === draft?.templateId) ||
		EMAIL_TEMPLATE_PRESETS[0];
	const palette = preset.colors;
	const blocks = Array.isArray(draft?.blocks) ? draft.blocks : [];
	const headerName = cleanText(group?.name) || 'Group';
	const renderedBlocks = blocks
		.map((block) => {
			if (block.type === 'hero') return renderHero(block, palette);
			if (block.type === 'paragraph') return renderParagraph(block, palette);
			if (block.type === 'metrics') return renderMetrics(block, palette);
			if (block.type === 'button') return renderButton(block, palette);
			if (block.type === 'quote') return renderQuote(block, palette);
			return '';
		})
		.filter(Boolean)
		.join('<div style="height:18px;line-height:18px;">&nbsp;</div>');

	return `
		<!doctype html>
		<html>
			<body style="margin:0;background:${palette.background};padding:24px 12px;font-family:Inter, Helvetica, Arial, sans-serif;color:${palette.ink};">
				<div style="max-width:720px;margin:0 auto;">
					<div style="padding:0 12px 16px;">
						<div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:${palette.accent};font-weight:800;">
							${escapeHtml(headerName)}
						</div>
						<div style="margin-top:8px;font-size:14px;color:${palette.muted};">
							${escapeHtml(draft?.preheader || '')}
						</div>
					</div>
					${renderedBlocks}
					<div style="padding:20px 12px 0;font-size:12px;line-height:1.7;color:${palette.muted};">
						Prepared for ${audienceCount} member${audienceCount === 1 ? '' : 's'}. Dynamic fields available:
						{{first_name}}, {{membership_tier}}, {{renewal_date}}, {{policy_link}}.
					</div>
				</div>
			</body>
		</html>
	`;
}

export function renderCampaignText({ draft }) {
	const blocks = Array.isArray(draft?.blocks) ? draft.blocks : [];
	return blocks
		.map((block) => {
			if (block.type === 'metrics') {
				return (Array.isArray(block.items) ? block.items : [])
					.map((item) => `${cleanText(item?.label)}: ${cleanText(item?.value)}`)
					.join('\n');
			}
			return [
				cleanText(block.title),
				cleanText(block.body),
				cleanText(block.buttonLabel),
				cleanText(block.buttonUrl)
			]
				.filter(Boolean)
				.join('\n');
		})
		.filter(Boolean)
		.join('\n\n');
}
