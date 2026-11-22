import { convertSchemaNode } from './schema.js';

export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
export const OPENAI_GPT_6_LUNA_MODEL = 'gpt-6-luna';

function textFromInputItem(item) {
	if (typeof item === 'string') return item.trim();
	if (item == null) return '';
	if (typeof item === 'object') {
		if (typeof item.text === 'string') return item.text.trim();
		if (typeof item.content === 'string') return item.content.trim();
		if (Array.isArray(item.content)) {
			return item.content
				.map((part) => textFromInputItem(part))
				.filter(Boolean)
				.join('\n\n');
		}
		if (Array.isArray(item.parts)) {
			return item.parts
				.map((part) => textFromInputItem(part))
				.filter(Boolean)
				.join('\n\n');
		}
	}
	return String(item).trim();
}

function parseToolCallArguments(rawArguments) {
	if (rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
		return { ...rawArguments };
	}
	if (typeof rawArguments !== 'string' || !rawArguments.trim()) {
		return {};
	}
	try {
		const parsed = JSON.parse(rawArguments);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

export function buildOpenAiInput(contents) {
	if (typeof contents === 'string') return contents;
	if (Array.isArray(contents)) {
		const hasToolLoopItems = contents.some(
			(item) =>
				item &&
				typeof item === 'object' &&
				(item.type === 'function_call' ||
					item.type === 'function_call_output' ||
					item.type === 'message')
		);
		if (hasToolLoopItems) {
			return contents
				.map((item, index) => {
					if (!item) return null;
					if (typeof item === 'string') {
						return item.trim() ? { role: 'user', content: item.trim() } : null;
					}
					if (item.type === 'function_call') {
						const callId = item.call_id || item.callId || item.id || `call_${index + 1}`;
						const rawArgs =
							typeof item.arguments === 'string'
								? item.arguments
								: JSON.stringify(item.arguments ?? item.args ?? {});
						return {
							type: 'function_call',
							call_id: callId,
							name: item.name,
							arguments: rawArgs
						};
					}
					if (item.type === 'function_call_output') {
						const callId = item.call_id || item.callId || item.id || `call_${index + 1}`;
						const output =
							typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? null);
						return {
							type: 'function_call_output',
							call_id: callId,
							output
						};
					}
					if (typeof item.role === 'string') {
						if (Array.isArray(item.content)) {
							return {
								role: item.role,
								content: item.content.map((part) => ({ ...part }))
							};
						}
						const text = textFromInputItem(item);
						return text ? { role: item.role, content: text } : null;
					}
					const fallbackText = textFromInputItem(item);
					return fallbackText ? { role: 'user', content: fallbackText } : null;
				})
				.filter(Boolean);
		}

		// Responses API multimodal inputs use message content parts such as
		// input_text, input_image, and input_file. Preserve these structured
		// parts instead of flattening them into strings.
		if (
			contents.length > 0 &&
			contents.every(
				(item) =>
					item &&
					typeof item === 'object' &&
					typeof item.role === 'string' &&
					Array.isArray(item.content)
			)
		) {
			return contents.map((item) => ({
				role: item.role,
				content: item.content.map((part) => ({ ...part }))
			}));
		}
		return contents
			.map((item) => textFromInputItem(item))
			.filter(Boolean)
			.join('\n\n');
	}
	return textFromInputItem(contents);
}

function mapOpenAiTools(tools) {
	if (!Array.isArray(tools)) return tools;

	return tools.flatMap((tool) => {
		if (!tool || typeof tool !== 'object') return [];

		if (typeof tool.type === 'string') {
			if (tool.type === 'function' && tool.function) {
				return [
					{
						type: 'function',
						name: tool.function.name,
						description: tool.function.description,
						parameters: convertSchemaNode(
							tool.function.parameters || {
								type: 'object',
								properties: {},
								required: [],
								additionalProperties: false
							},
							{ strict: true }
						),
						strict: tool.strict ?? true
					}
				];
			}
			return [tool];
		}

		if (Array.isArray(tool.functionDeclarations)) {
			return tool.functionDeclarations
				.filter((declaration) => declaration && typeof declaration.name === 'string')
				.map((declaration) => ({
					type: 'function',
					name: declaration.name,
					description: declaration.description,
					parameters: convertSchemaNode(
						declaration.parameters || {
							type: 'object',
							properties: {},
							required: [],
							additionalProperties: false
						},
						{ strict: true }
					),
					strict: true
				}));
		}

		if (tool.googleSearch || tool.urlContext) {
			throw new Error('Google-specific tools must use a Gemini model.');
		}

		throw new Error('Unsupported tool configuration for the OpenAI Responses API.');
	});
}

export function buildOpenAiResponseBody({ model, contents, config = {} }) {
	const body = {
		model,
		input: buildOpenAiInput(contents),
		store: config.store ?? false
	};

	const reasoningEffort =
		config.reasoningEffort || (model === OPENAI_GPT_6_LUNA_MODEL ? 'xhigh' : null);
	if (reasoningEffort) {
		body.reasoning = { effort: reasoningEffort };
	}

	if (config.maxTokens != null) body.max_output_tokens = config.maxTokens;
	if (config.max_output_tokens != null) body.max_output_tokens = config.max_output_tokens;
	if (config.temperature != null) body.temperature = config.temperature;
	if (config.instructions) body.instructions = config.instructions;
	if (config.tools) body.tools = mapOpenAiTools(config.tools);
	if (config.toolChoice != null) body.tool_choice = config.toolChoice;
	if (config.tool_choice != null) body.tool_choice = config.tool_choice;
	if (config.parallelToolCalls != null) body.parallel_tool_calls = config.parallelToolCalls;
	if (config.parallel_tool_calls != null) body.parallel_tool_calls = config.parallel_tool_calls;

	if (config.responseSchema) {
		body.text = {
			format: {
				type: 'json_schema',
				name: config.schemaName || 'structured_response',
				strict: true,
				schema: convertSchemaNode(config.responseSchema, { strict: true })
			}
		};
	} else if (config.responseMimeType === 'application/json') {
		body.text = { format: { type: 'json_object' } };
	}

	if (config.verbosity) {
		body.text = { ...(body.text || {}), verbosity: config.verbosity };
	}

	return body;
}

function textFromOutputPart(part) {
	if (typeof part === 'string') return part;
	if (!part || typeof part !== 'object') return '';
	if (typeof part.text === 'string') return part.text;
	if (typeof part.output_text === 'string') return part.output_text;
	return '';
}

export function extractOpenAiText(data) {
	if (typeof data?.output_text === 'string') return data.output_text;

	return (Array.isArray(data?.output) ? data.output : [])
		.flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
		.map(textFromOutputPart)
		.filter(Boolean)
		.join('');
}

export function extractOpenAiToolCalls(data) {
	if (!Array.isArray(data?.output)) return [];

	return data.output
		.filter((item) => item && item.type === 'function_call' && typeof item.name === 'string')
		.map((item, index) => {
			const callId = item.call_id || item.id || `call_${index + 1}`;
			const args = parseToolCallArguments(item.arguments);
			const rawArguments =
				typeof item.arguments === 'string' && item.arguments.trim()
					? item.arguments
					: JSON.stringify(args);
			return {
				id: callId,
				callId,
				name: item.name,
				args,
				rawArguments
			};
		});
}

export function createOpenAiTextProviderClient(apiKey, fetchImpl = globalThis.fetch) {
	return {
		async generateContent({ model, contents, config = {} }) {
			if (typeof fetchImpl !== 'function') {
				throw new Error('Fetch is not available for the OpenAI Responses API.');
			}

			const fetchOptions = {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify(buildOpenAiResponseBody({ model, contents, config }))
			};
			if (config.signal) {
				fetchOptions.signal = config.signal;
			}

			const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, fetchOptions);

			if (!response.ok) {
				const errorText = await response.text().catch(() => '');
				throw new Error(
					errorText || `OpenAI Responses API request failed with status ${response.status}.`
				);
			}

			const data = await response.json();
			const text = extractOpenAiText(data);
			const toolCalls = extractOpenAiToolCalls(data);
			if (!text && toolCalls.length === 0) {
				const incompleteReason = data?.incomplete_details?.reason;
				if (incompleteReason) {
					throw new Error(`OpenAI response was incomplete: ${incompleteReason}.`);
				}
				throw new Error('OpenAI Responses API returned no text.');
			}

			return { text, toolCalls, raw: data };
		}
	};
}
