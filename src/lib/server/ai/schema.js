export function convertSchemaNode(node, { strict = false } = {}) {
	if (!node || typeof node !== 'object' || Array.isArray(node)) {
		return node;
	}

	const converted = {};
	for (const [key, value] of Object.entries(node)) {
		if (key === 'nullable') continue;
		if (Array.isArray(value)) {
			converted[key] = value.map((item) => convertSchemaNode(item, { strict }));
		} else if (value && typeof value === 'object') {
			converted[key] = convertSchemaNode(value, { strict });
		} else {
			converted[key] = value;
		}
	}

	if (node.nullable) {
		if (typeof converted.type === 'string') {
			converted.type = [converted.type, 'null'];
		} else if (Array.isArray(converted.type) && !converted.type.includes('null')) {
			converted.type = [...converted.type, 'null'];
		} else if (!converted.type) {
			converted.anyOf = [...(converted.anyOf || []), { type: 'null' }];
		}
	}

	const isObjectSchema =
		converted.properties ||
		converted.type === 'object' ||
		(Array.isArray(converted.type) && converted.type.includes('object'));
	if (strict && isObjectSchema) {
		const properties =
			converted.properties && typeof converted.properties === 'object' ? converted.properties : {};
		converted.properties = properties;
		converted.required = Object.keys(properties);
		converted.additionalProperties = false;
	}

	return converted;
}
