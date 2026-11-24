const GEMINI_THINKING_LEVEL_BY_EFFORT = {
	minimal: 'MINIMAL',
	low: 'LOW',
	medium: 'MEDIUM',
	high: 'HIGH',
	xhigh: 'HIGH'
};

export function clonePlainValue(value) {
	if (Array.isArray(value)) return value.map(clonePlainValue);
	if (value && typeof value === 'object') {
		const out = {};
		for (const [key, entry] of Object.entries(value)) {
			out[key] = clonePlainValue(entry);
		}
		return out;
	}
	return value;
}

/**
 * @param {Record<string, any>} [config]
 * @returns {Record<string, any>}
 */
export function normalizeGeminiGenerationConfig(config = {}) {
	/** @type {Record<string, any>} */
	const normalizedConfig = { ...config };
	const requestedEffort =
		typeof normalizedConfig.reasoningEffort === 'string'
			? normalizedConfig.reasoningEffort.trim().toLowerCase()
			: '';
	delete normalizedConfig.reasoningEffort;

	if (normalizedConfig.signal && !normalizedConfig.abortSignal) {
		normalizedConfig.abortSignal = normalizedConfig.signal;
	}
	delete normalizedConfig.signal;
	delete normalizedConfig.schemaName;
	delete normalizedConfig.store;

	if (Array.isArray(normalizedConfig.tools)) {
		normalizedConfig.tools = clonePlainValue(normalizedConfig.tools);
	}

	const mappedThinkingLevel = GEMINI_THINKING_LEVEL_BY_EFFORT[requestedEffort] || null;
	if (mappedThinkingLevel) {
		const existingThinking =
			normalizedConfig.thinkingConfig && typeof normalizedConfig.thinkingConfig === 'object'
				? normalizedConfig.thinkingConfig
				: {};
		if (!existingThinking.thinkingLevel) {
			normalizedConfig.thinkingConfig = {
				...existingThinking,
				thinkingLevel: mappedThinkingLevel
			};
		}
	}

	return normalizedConfig;
}

export function extractGeminiResponseContent(response) {
	const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
	const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : [];

	if (parts.length > 0) {
		let text = '';
		const toolCalls = [];
		for (const part of parts) {
			if (!part || typeof part !== 'object') continue;
			if (typeof part.text === 'string' && part.thought !== true) {
				text += part.text;
			}
			if (part.functionCall && typeof part.functionCall.name === 'string') {
				const args =
					part.functionCall.args &&
					typeof part.functionCall.args === 'object' &&
					!Array.isArray(part.functionCall.args)
						? { ...part.functionCall.args }
						: {};
				const id = part.functionCall.id || `call_${toolCalls.length + 1}`;
				toolCalls.push({
					id,
					callId: id,
					name: part.functionCall.name,
					args,
					rawArguments: JSON.stringify(args)
				});
			}
		}
		return {
			text,
			toolCalls,
			candidates,
			raw: response
		};
	}

	const directFunctionCalls = Array.isArray(response?.functionCalls) ? response.functionCalls : [];
	const toolCalls = directFunctionCalls
		.filter((call) => call && typeof call.name === 'string')
		.map((call, index) => {
			const args =
				call.args && typeof call.args === 'object' && !Array.isArray(call.args)
					? { ...call.args }
					: {};
			const id = call.id || `call_${index + 1}`;
			return {
				id,
				callId: id,
				name: call.name,
				args,
				rawArguments: JSON.stringify(args)
			};
		});

	const fallbackText =
		toolCalls.length === 0 && typeof response?.text === 'string' ? response.text : '';
	return {
		text: fallbackText,
		toolCalls,
		candidates,
		raw: response
	};
}

function isUnsupportedThinkingConfigError(error) {
	const message = String(error?.message || error || '').toLowerCase();
	return (
		message.includes('thinkinglevel') ||
		message.includes('thinking_level') ||
		message.includes('thinkingconfig') ||
		message.includes('thinking_config') ||
		message.includes('thinking is not supported')
	);
}

/**
 * @param {any} ai
 * @param {{ getFallbackModel?: (model: any) => any }} [options]
 */
export function createGoogleTextProviderClient(ai, { getFallbackModel = () => null } = {}) {
	return {
		async generateContent({ model, contents, config }) {
			const generationConfig = normalizeGeminiGenerationConfig(config);
			const invokeModel = async (targetModel, activeConfig) => {
				try {
					const rawResponse = await ai.models.generateContent({
						model: targetModel,
						contents,
						config: activeConfig
					});
					return extractGeminiResponseContent(rawResponse);
				} catch (error) {
					if (activeConfig?.thinkingConfig && isUnsupportedThinkingConfigError(error)) {
						const withoutThinking = { ...activeConfig };
						delete withoutThinking.thinkingConfig;
						const rawResponse = await ai.models.generateContent({
							model: targetModel,
							contents,
							config: withoutThinking
						});
						return extractGeminiResponseContent(rawResponse);
					}
					throw error;
				}
			};

			try {
				return await invokeModel(model, generationConfig);
			} catch (error) {
				const fallbackModel = getFallbackModel(model);
				if (!fallbackModel) throw error;
				return invokeModel(fallbackModel, generationConfig);
			}
		}
	};
}

function normalizeToolOutputObject(value) {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value;
	}
	return { result: value ?? null };
}

function buildProviderToolContinuation({
	provider,
	initialPrompt,
	roundResponse,
	toolCalls,
	toolOutputs,
	finalInstructions = ''
}) {
	if (provider === 'openai') {
		/** @type {any[]} */
		const items = [
			{
				role: 'user',
				content: [{ type: 'input_text', text: String(initialPrompt || '') }]
			}
		];
		for (let index = 0; index < toolCalls.length; index += 1) {
			const call = toolCalls[index];
			const callId = call.callId || call.id || `call_${index + 1}`;
			items.push({
				type: 'function_call',
				call_id: callId,
				name: call.name,
				arguments:
					typeof call.rawArguments === 'string' && call.rawArguments
						? call.rawArguments
						: JSON.stringify(call.args || {})
			});
			items.push({
				type: 'function_call_output',
				call_id: callId,
				output: JSON.stringify(normalizeToolOutputObject(toolOutputs[index]))
			});
		}
		if (finalInstructions) {
			items.push({
				role: 'user',
				content: [{ type: 'input_text', text: String(finalInstructions) }]
			});
		}
		return items;
	}

	const candidateContent = roundResponse?.candidates?.[0]?.content;
	const modelTurn =
		candidateContent && Array.isArray(candidateContent.parts) && candidateContent.parts.length > 0
			? {
					role: candidateContent.role || 'model',
					parts: clonePlainValue(candidateContent.parts)
				}
			: {
					role: 'model',
					parts: toolCalls.map((call) => ({
						functionCall: {
							...(call.id ? { id: call.id } : {}),
							name: call.name,
							args: call.args || {}
						}
					}))
				};

	/** @type {any[]} */
	const userParts = toolCalls.map((call, index) => ({
		functionResponse: {
			...(call.id ? { id: call.id } : {}),
			name: call.name,
			response: normalizeToolOutputObject(toolOutputs[index])
		}
	}));
	if (finalInstructions) {
		userParts.push({ text: String(finalInstructions) });
	}

	return [
		{ role: 'user', parts: [{ text: String(initialPrompt || '') }] },
		modelTurn,
		{ role: 'user', parts: userParts }
	];
}

/**
 * @param {Record<string, any>} options
 */
export async function runBoundedToolLoop({
	client,
	model,
	prompt,
	tools = [],
	executeTool,
	maxToolRounds = 1,
	maxCallsPerRound = 6,
	reasoningEffort = 'low',
	responseMimeType = null,
	responseSchema = null,
	schemaName = null,
	finalInstructions = '',
	signal = undefined
}) {
	const modelName = typeof model === 'string' ? model : model?.model;
	const provider =
		typeof model === 'object' && model?.provider
			? model.provider
			: String(modelName || '').startsWith('gemini')
				? 'google'
				: 'openai';
	const boundedMaxRounds = Math.max(0, Math.min(Number(maxToolRounds ?? 1) || 0, 2));

	/** @type {Record<string, any>} */
	const baseConfig = {};
	if (reasoningEffort) baseConfig.reasoningEffort = reasoningEffort;
	if (signal) baseConfig.signal = signal;

	/** @type {Record<string, any>} */
	const firstRoundConfig = {
		...baseConfig,
		...(Array.isArray(tools) && tools.length > 0 ? { tools } : {})
	};
	if ((!Array.isArray(tools) || tools.length === 0) && responseMimeType) {
		firstRoundConfig.responseMimeType = responseMimeType;
	}
	if ((!Array.isArray(tools) || tools.length === 0) && responseSchema) {
		firstRoundConfig.responseSchema = responseSchema;
		if (schemaName) firstRoundConfig.schemaName = schemaName;
	}

	const firstResponse = await client.generateContent({
		model: modelName,
		contents: prompt,
		config: firstRoundConfig
	});

	const rawToolCalls = Array.isArray(firstResponse?.toolCalls) ? firstResponse.toolCalls : [];
	if (rawToolCalls.length === 0 || boundedMaxRounds < 1 || typeof executeTool !== 'function') {
		return {
			text: firstResponse?.text ?? '',
			toolCalls: rawToolCalls,
			toolResults: [],
			rounds: 1,
			raw: firstResponse?.raw ?? firstResponse
		};
	}

	const activeToolCalls = rawToolCalls.slice(0, Math.max(1, maxCallsPerRound));
	const toolOutputs = await Promise.all(
		activeToolCalls.map(async (call) => {
			try {
				return await executeTool(call);
			} catch (error) {
				return { error: String(error?.message || 'Tool execution failed.') };
			}
		})
	);

	const toolResults = activeToolCalls.map((call, index) => ({
		call,
		output: toolOutputs[index]
	}));

	const continuationContents = buildProviderToolContinuation({
		provider,
		initialPrompt: prompt,
		roundResponse: firstResponse,
		toolCalls: activeToolCalls,
		toolOutputs,
		finalInstructions
	});

	/** @type {Record<string, any>} */
	const replyConfig = { ...baseConfig };
	if (responseMimeType) replyConfig.responseMimeType = responseMimeType;
	if (responseSchema) replyConfig.responseSchema = responseSchema;
	if (schemaName) replyConfig.schemaName = schemaName;

	const finalResponse = await client.generateContent({
		model: modelName,
		contents: continuationContents,
		config: replyConfig
	});

	return {
		text: finalResponse?.text ?? '',
		toolCalls: activeToolCalls,
		toolResults,
		rounds: 2,
		raw: finalResponse?.raw ?? finalResponse
	};
}
