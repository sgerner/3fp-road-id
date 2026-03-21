const US_STATE_OPTIONS_INTERNAL = [
	{ code: 'AL', name: 'Alabama' },
	{ code: 'AK', name: 'Alaska' },
	{ code: 'AZ', name: 'Arizona' },
	{ code: 'AR', name: 'Arkansas' },
	{ code: 'CA', name: 'California' },
	{ code: 'CO', name: 'Colorado' },
	{ code: 'CT', name: 'Connecticut' },
	{ code: 'DE', name: 'Delaware' },
	{ code: 'FL', name: 'Florida' },
	{ code: 'GA', name: 'Georgia' },
	{ code: 'HI', name: 'Hawaii' },
	{ code: 'ID', name: 'Idaho' },
	{ code: 'IL', name: 'Illinois' },
	{ code: 'IN', name: 'Indiana' },
	{ code: 'IA', name: 'Iowa' },
	{ code: 'KS', name: 'Kansas' },
	{ code: 'KY', name: 'Kentucky' },
	{ code: 'LA', name: 'Louisiana' },
	{ code: 'ME', name: 'Maine' },
	{ code: 'MD', name: 'Maryland' },
	{ code: 'MA', name: 'Massachusetts' },
	{ code: 'MI', name: 'Michigan' },
	{ code: 'MN', name: 'Minnesota' },
	{ code: 'MS', name: 'Mississippi' },
	{ code: 'MO', name: 'Missouri' },
	{ code: 'MT', name: 'Montana' },
	{ code: 'NE', name: 'Nebraska' },
	{ code: 'NV', name: 'Nevada' },
	{ code: 'NH', name: 'New Hampshire' },
	{ code: 'NJ', name: 'New Jersey' },
	{ code: 'NM', name: 'New Mexico' },
	{ code: 'NY', name: 'New York' },
	{ code: 'NC', name: 'North Carolina' },
	{ code: 'ND', name: 'North Dakota' },
	{ code: 'OH', name: 'Ohio' },
	{ code: 'OK', name: 'Oklahoma' },
	{ code: 'OR', name: 'Oregon' },
	{ code: 'PA', name: 'Pennsylvania' },
	{ code: 'RI', name: 'Rhode Island' },
	{ code: 'SC', name: 'South Carolina' },
	{ code: 'SD', name: 'South Dakota' },
	{ code: 'TN', name: 'Tennessee' },
	{ code: 'TX', name: 'Texas' },
	{ code: 'UT', name: 'Utah' },
	{ code: 'VT', name: 'Vermont' },
	{ code: 'VA', name: 'Virginia' },
	{ code: 'WA', name: 'Washington' },
	{ code: 'WV', name: 'West Virginia' },
	{ code: 'WI', name: 'Wisconsin' },
	{ code: 'WY', name: 'Wyoming' },
	{ code: 'DC', name: 'District of Columbia' },
	{ code: 'PR', name: 'Puerto Rico' }
];

export const US_STATE_OPTIONS = [...US_STATE_OPTIONS_INTERNAL];

const US_STATE_CODE_SET = new Set(US_STATE_OPTIONS.map((entry) => entry.code));
const US_STATE_NAME_BY_CODE = new Map(US_STATE_OPTIONS.map((entry) => [entry.code, entry.name]));
const US_STATE_CODE_BY_NAME = new Map(
	US_STATE_OPTIONS.map((entry) => [normalizeKey(entry.name), entry.code])
);

function normalizeKey(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s.-]+/g, ' ');
}

export function normalizeUsStateCode(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return '';

	const asCode = raw.toUpperCase().replace(/[^A-Z]/g, '');
	if (asCode.length === 2 && US_STATE_CODE_SET.has(asCode)) return asCode;

	const byName = US_STATE_CODE_BY_NAME.get(normalizeKey(raw));
	return byName || '';
}

export function getUsStateName(code) {
	const normalized = normalizeUsStateCode(code);
	return normalized ? US_STATE_NAME_BY_CODE.get(normalized) || '' : '';
}
