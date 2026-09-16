import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
	'a',
	'b',
	'body',
	'br',
	'div',
	'em',
	'head',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'html',
	'i',
	'img',
	'li',
	'ol',
	'p',
	'section',
	'span',
	'strong',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'title',
	'tr',
	'u',
	'ul'
];

const GLOBAL_ATTRIBUTES = [
	'align',
	'aria-hidden',
	'aria-label',
	'border',
	'cellpadding',
	'cellspacing',
	'colspan',
	'height',
	'role',
	'rowspan',
	'style',
	'valign',
	'width'
];

const TAG_ATTRIBUTES = {
	a: ['href', 'rel', 'target', 'title'],
	body: ['style'],
	div: ['style'],
	h1: ['style'],
	h2: ['style'],
	h3: ['style'],
	h4: ['style'],
	h5: ['style'],
	h6: ['style'],
	html: ['lang'],
	img: ['src', 'alt', 'width', 'height', 'style'],
	li: ['style'],
	ol: ['style'],
	p: ['style'],
	section: ['style'],
	span: ['style'],
	table: ['role', 'cellpadding', 'cellspacing', 'border', 'width', 'style'],
	tbody: ['style'],
	td: ['align', 'valign', 'colspan', 'rowspan', 'width', 'height', 'style'],
	tfoot: ['style'],
	th: ['align', 'valign', 'colspan', 'rowspan', 'width', 'height', 'style'],
	thead: ['style'],
	tr: ['align', 'valign', 'style'],
	ul: ['style']
};

const ALLOWED_STYLE_PROPERTIES = [
	'background',
	'background-color',
	'background-image',
	'border',
	'border-bottom',
	'border-color',
	'border-left',
	'border-radius',
	'border-right',
	'border-style',
	'border-top',
	'border-width',
	'box-shadow',
	'color',
	'display',
	'font-family',
	'font-size',
	'font-weight',
	'height',
	'letter-spacing',
	'line-height',
	'margin',
	'margin-bottom',
	'margin-left',
	'margin-right',
	'margin-top',
	'max-width',
	'min-width',
	'overflow',
	'padding',
	'padding-bottom',
	'padding-left',
	'padding-right',
	'padding-top',
	'text-align',
	'text-decoration',
	'text-transform',
	'vertical-align',
	'width'
];

const SAFE_STYLE_VALUE = /^(?!.*(?:url\s*\(|expression|javascript|@import))[-\w\s#(),.%'"!+/-]*$/i;

const SANITIZER_OPTIONS = {
	allowedTags: ALLOWED_TAGS,
	allowedAttributes: {
		'*': GLOBAL_ATTRIBUTES,
		...TAG_ATTRIBUTES
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	allowedSchemesByTag: { img: ['https'] },
	allowProtocolRelative: false,
	allowedStyles: {
		'*': Object.fromEntries(
			ALLOWED_STYLE_PROPERTIES.map((property) => [property, [SAFE_STYLE_VALUE]])
		)
	},
	transformTags: {
		a: (_tagName, attributes) => {
			const target = String(attributes.target || '').toLowerCase();
			if (target !== '_blank' && target !== '_self') delete attributes.target;
			else attributes.target = target;
			attributes.rel = 'noopener noreferrer';
			return { tagName: 'a', attribs: attributes };
		}
	}
};

export function sanitizeEmailHtml(value) {
	return sanitizeHtml(typeof value === 'string' ? value : '', SANITIZER_OPTIONS);
}
