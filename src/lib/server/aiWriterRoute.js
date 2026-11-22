import { json } from '@sveltejs/kit';
import { isSchemaUnsupportedError, safeParseJson } from './aiJson.js';
import { enforceRateLimit, readJsonBody } from './security.js';

const DEFAULT_IP_RATE_LIMIT = 60;
const DEFAULT_USER_RATE_LIMIT = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024;
const DEFAULT_MODEL_PROFILE = 'structured_text';

let sessionModulePromise = null;
let modelsModulePromise = null;

function loadSessionModule() {
	if (!sessionModulePromise) {
		sessionModulePromise = import('./session.js').catch((error) => {
			sessionModulePromise = null;
			throw error;
		});
	}
	return sessionModulePromise;
}

function loadModelsModule() {
	if (!modelsModulePromise) {
		modelsModulePromise = import('./ai/models.js').catch((error) => {
			modelsModulePromise = null;
			throw error;
		});
	}
	return modelsModulePromise;
}

function assertNonEmptyString(value, name) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new TypeError(`${name} must be a non-empty string.`);
	}
}

function assertPositiveNumber(value, name) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		throw new TypeError(`${name} must be a positive finite number.`);
	}
}

function extractResponseText(response) {
	let text = response?.text ?? '';
	if (typeof text === 'function') {
		text = text.call(response);
	}
	return text ?? '';
}

/**
 * Create a SvelteKit POST handler for conversational AI draft writer routes.
 *
 * Each factory invocation owns an isolated `schemaUnsupported` flag so schema
 * rejection on one endpoint does not disable schema enforcement on others.
 */
export function createAiWriterRoute(options, dependencies = {}) {
	if (!options || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Route factory options object is required.');
	}

	const {
		rateLimit,
		responseSchema,
		responseMimeType,
		buildContents,
		normalizePayload,
		errorLabel,
		errorMessage,
		modelProfile = DEFAULT_MODEL_PROFILE,
		maxBodyBytes = DEFAULT_MAX_BODY_BYTES
	} = options;

	if (!rateLimit || typeof rateLimit !== 'object' || Array.isArray(rateLimit)) {
		throw new TypeError('rateLimit configuration object is required.');
	}

	const {
		ipName,
		userName,
		ipLimit = DEFAULT_IP_RATE_LIMIT,
		userLimit = DEFAULT_USER_RATE_LIMIT,
		windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS
	} = rateLimit;

	assertNonEmptyString(ipName, 'rateLimit.ipName');
	assertNonEmptyString(userName, 'rateLimit.userName');
	assertPositiveNumber(ipLimit, 'rateLimit.ipLimit');
	assertPositiveNumber(userLimit, 'rateLimit.userLimit');
	assertPositiveNumber(windowMs, 'rateLimit.windowMs');

	if (!responseSchema || typeof responseSchema !== 'object' || Array.isArray(responseSchema)) {
		throw new TypeError('responseSchema object is required.');
	}

	if (!Object.hasOwn(options, 'responseMimeType')) {
		throw new TypeError(
			'responseMimeType must be explicitly configured (for example "application/json" or undefined).'
		);
	}

	if (
		responseMimeType !== undefined &&
		(typeof responseMimeType !== 'string' || !responseMimeType.trim())
	) {
		throw new TypeError('responseMimeType must be undefined or a non-empty string.');
	}

	if (typeof buildContents !== 'function') {
		throw new TypeError('buildContents callback function is required.');
	}

	if (typeof normalizePayload !== 'function') {
		throw new TypeError('normalizePayload callback function is required.');
	}

	assertNonEmptyString(errorLabel, 'errorLabel');
	assertNonEmptyString(errorMessage, 'errorMessage');
	assertNonEmptyString(modelProfile, 'modelProfile');
	assertPositiveNumber(maxBodyBytes, 'maxBodyBytes');

	const enforceRateLimitFn = dependencies.enforceRateLimit ?? enforceRateLimit;
	const readJsonBodyFn = dependencies.readJsonBody ?? readJsonBody;
	const safeParseJsonFn = dependencies.safeParseJson ?? safeParseJson;
	const isSchemaUnsupportedErrorFn =
		dependencies.isSchemaUnsupportedError ?? isSchemaUnsupportedError;

	let schemaUnsupported = false;

	async function resolveSession(cookies) {
		const fn =
			dependencies.resolveVerifiedSession ?? (await loadSessionModule()).resolveVerifiedSession;
		return fn(cookies);
	}

	async function resolveModelHelpers() {
		if (
			dependencies.isAiModelConfigured &&
			dependencies.getAiConfigurationError &&
			dependencies.requireAiModel
		) {
			return {
				isAiModelConfigured: dependencies.isAiModelConfigured,
				getAiConfigurationError: dependencies.getAiConfigurationError,
				requireAiModel: dependencies.requireAiModel
			};
		}
		const modelsModule = await loadModelsModule();
		return {
			isAiModelConfigured: dependencies.isAiModelConfigured ?? modelsModule.isAiModelConfigured,
			getAiConfigurationError:
				dependencies.getAiConfigurationError ?? modelsModule.getAiConfigurationError,
			requireAiModel: dependencies.requireAiModel ?? modelsModule.requireAiModel
		};
	}

	async function generateDraft({ requireAiModelFn, contents, useSchema }) {
		const { client, model } = requireAiModelFn(modelProfile);
		const generationConfig = {};
		if (responseMimeType !== undefined) {
			generationConfig.responseMimeType = responseMimeType;
		}
		if (useSchema) {
			generationConfig.responseSchema = responseSchema;
		}
		return client.generateContent({
			model: model.model,
			contents,
			config: Object.keys(generationConfig).length ? generationConfig : undefined
		});
	}

	return async function POST(event) {
		const { request, cookies } = event;

		const limitedByIp = enforceRateLimitFn(event, {
			name: ipName,
			limit: ipLimit,
			windowMs
		});
		if (limitedByIp) return limitedByIp;

		const { user } = await resolveSession(cookies);
		if (!user?.id) return json({ error: 'Authentication required.' }, { status: 401 });

		const limitedByUser = enforceRateLimitFn(event, {
			name: userName,
			limit: userLimit,
			windowMs,
			key: user.id
		});
		if (limitedByUser) return limitedByUser;

		const { isAiModelConfigured, getAiConfigurationError, requireAiModel } =
			await resolveModelHelpers();

		if (!isAiModelConfigured(modelProfile)) {
			return json({ error: getAiConfigurationError(modelProfile) }, { status: 503 });
		}

		const parsedBody = await readJsonBodyFn(request, { maxBytes: maxBodyBytes });
		if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });

		const payload = parsedBody.value;
		if (!payload || !Array.isArray(payload.messages)) {
			return json({ error: 'messages array required' }, { status: 400 });
		}

		const contents = await buildContents(payload, { event, user });
		const useSchema = !schemaUnsupported;

		try {
			const response = await generateDraft({
				requireAiModelFn: requireAiModel,
				contents,
				useSchema
			});
			const text = extractResponseText(response);
			const parsed = safeParseJsonFn(text);
			return json(await normalizePayload(parsed, text));
		} catch (error) {
			if (useSchema && isSchemaUnsupportedErrorFn(error)) {
				schemaUnsupported = true;
				try {
					const fallbackResponse = await generateDraft({
						requireAiModelFn: requireAiModel,
						contents,
						useSchema: false
					});
					const fallbackText = extractResponseText(fallbackResponse);
					const fallbackParsed = safeParseJsonFn(fallbackText);
					return json(await normalizePayload(fallbackParsed, fallbackText));
				} catch (fallbackError) {
					console.error(`${errorLabel} fallback failed`, fallbackError);
					return json({ error: errorMessage }, { status: 500 });
				}
			}

			console.error(`${errorLabel} failed`, error);
			return json({ error: errorMessage }, { status: 500 });
		}
	};
}
