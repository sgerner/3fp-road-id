/**
 * Self-contained ISO/IEC 18004 QR Code vector generator (Versions 1-10, Level M).
 * Generates scannable SVG markup locally without external services or dependencies.
 */

// Error Correction Level M (15% recovery) table for versions 1..10:
// [ecCodewordsPerBlock, group1Blocks, group1DataCw, group2Blocks, group2DataCw, alignmentCenters]
const VERSION_SPECS_M = [
	null,
	[10, 1, 16, 0, 0, []],
	[16, 1, 28, 0, 0, [6, 18]],
	[26, 1, 44, 0, 0, [6, 22]],
	[18, 2, 32, 0, 0, [6, 26]],
	[24, 2, 43, 0, 0, [6, 30]],
	[16, 4, 27, 0, 0, [6, 34]],
	[18, 4, 31, 0, 0, [6, 22, 38]],
	[22, 2, 38, 2, 39, [6, 24, 42]],
	[22, 3, 36, 2, 37, [6, 26, 46]],
	[26, 4, 43, 1, 44, [6, 28, 50]]
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
	let value = 1;
	for (let i = 0; i < 255; i += 1) {
		GF_EXP[i] = value;
		GF_LOG[value] = i;
		value <<= 1;
		if (value & 0x100) value ^= 0x11d;
	}
	for (let i = 255; i < 512; i += 1) {
		GF_EXP[i] = GF_EXP[i - 255];
	}
})();

function gfMul(a, b) {
	if (a === 0 || b === 0) return 0;
	return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildReedSolomonGenerator(degree) {
	let poly = new Uint8Array([1]);
	for (let i = 0; i < degree; i += 1) {
		const next = new Uint8Array(poly.length + 1);
		const root = GF_EXP[i];
		for (let j = 0; j < poly.length; j += 1) {
			next[j] ^= poly[j];
			next[j + 1] ^= gfMul(poly[j], root);
		}
		poly = next;
	}
	return poly;
}

function computeReedSolomonRemainder(data, ecCount) {
	const generator = buildReedSolomonGenerator(ecCount);
	const remainder = new Uint8Array(ecCount);
	for (let i = 0; i < data.length; i += 1) {
		const factor = data[i] ^ remainder[0];
		remainder.copyWithin(0, 1);
		remainder[ecCount - 1] = 0;
		for (let j = 0; j < ecCount; j += 1) {
			remainder[j] ^= gfMul(generator[j + 1], factor);
		}
	}
	return remainder;
}

function totalDataCodewords(version) {
	const spec = VERSION_SPECS_M[version];
	return spec[1] * spec[2] + spec[3] * spec[4];
}

function selectVersion(byteLength) {
	for (let version = 1; version <= 10; version += 1) {
		const countBits = version <= 9 ? 8 : 16;
		const capacityBytes = Math.floor((totalDataCodewords(version) * 8 - 4 - countBits) / 8);
		if (byteLength <= capacityBytes) return version;
	}
	throw new Error('QR payload exceeds supported length.');
}

function pushBits(bits, value, length) {
	for (let i = length - 1; i >= 0; i -= 1) {
		bits.push((value >>> i) & 1);
	}
}

function encodeDataCodewords(bytes, version) {
	const dataCapacityCw = totalDataCodewords(version);
	const capacityBits = dataCapacityCw * 8;
	const bits = [];

	// Byte mode indicator (0100) + character count
	pushBits(bits, 0b0100, 4);
	pushBits(bits, bytes.length, version <= 9 ? 8 : 16);
	for (let i = 0; i < bytes.length; i += 1) {
		pushBits(bits, bytes[i], 8);
	}

	// Terminator (up to 4 zero bits) and byte alignment
	const terminatorLength = Math.min(4, capacityBits - bits.length);
	pushBits(bits, 0, terminatorLength);
	while (bits.length % 8 !== 0) bits.push(0);

	const codewords = new Uint8Array(dataCapacityCw);
	const writtenBytes = bits.length >> 3;
	for (let i = 0; i < writtenBytes; i += 1) {
		let byte = 0;
		for (let b = 0; b < 8; b += 1) {
			byte = (byte << 1) | bits[i * 8 + b];
		}
		codewords[i] = byte;
	}

	const padBytes = [0xec, 0x11];
	for (let i = writtenBytes; i < dataCapacityCw; i += 1) {
		codewords[i] = padBytes[(i - writtenBytes) & 1];
	}
	return codewords;
}

function interleaveCodewords(dataCodewords, version) {
	const [ecCw, g1Blocks, g1DataCw, g2Blocks, g2DataCw] = VERSION_SPECS_M[version];
	const dataBlocks = [];
	const ecBlocks = [];
	let offset = 0;

	for (let i = 0; i < g1Blocks; i += 1) {
		const block = dataCodewords.subarray(offset, offset + g1DataCw);
		offset += g1DataCw;
		dataBlocks.push(block);
		ecBlocks.push(computeReedSolomonRemainder(block, ecCw));
	}
	for (let i = 0; i < g2Blocks; i += 1) {
		const block = dataCodewords.subarray(offset, offset + g2DataCw);
		offset += g2DataCw;
		dataBlocks.push(block);
		ecBlocks.push(computeReedSolomonRemainder(block, ecCw));
	}

	const maxDataLen = Math.max(g1DataCw, g2DataCw);
	const result = [];
	for (let col = 0; col < maxDataLen; col += 1) {
		for (let b = 0; b < dataBlocks.length; b += 1) {
			if (col < dataBlocks[b].length) result.push(dataBlocks[b][col]);
		}
	}
	for (let col = 0; col < ecCw; col += 1) {
		for (let b = 0; b < ecBlocks.length; b += 1) {
			result.push(ecBlocks[b][col]);
		}
	}
	return Uint8Array.from(result);
}

function placeFinderPattern(modules, reserved, topRow, leftCol) {
	const size = modules.length;
	for (let dr = -1; dr <= 7; dr += 1) {
		for (let dc = -1; dc <= 7; dc += 1) {
			const r = topRow + dr;
			const c = leftCol + dc;
			if (r < 0 || r >= size || c < 0 || c >= size) continue;
			const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
			const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
			const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
			modules[r][c] = inOuter && (onBorder || inCenter) ? 1 : 0;
			reserved[r][c] = true;
		}
	}
}

function placeAlignmentPattern(modules, reserved, centerRow, centerCol) {
	for (let dr = -2; dr <= 2; dr += 1) {
		for (let dc = -2; dc <= 2; dc += 1) {
			const r = centerRow + dr;
			const c = centerCol + dc;
			const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
			modules[r][c] = dark ? 1 : 0;
			reserved[r][c] = true;
		}
	}
}

function computeFormatBits(maskPattern) {
	// Level M indicator is 00
	const data = (0b00 << 3) | maskPattern;
	let rem = data << 10;
	for (let i = 14; i >= 10; i -= 1) {
		if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
	}
	return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version) {
	let rem = version << 12;
	for (let i = 17; i >= 12; i -= 1) {
		if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
	}
	return (version << 12) | rem;
}

function writeFormatModules(modules, reserved, maskPattern) {
	const size = modules.length;
	const bits = computeFormatBits(maskPattern);

	const topLeftCoords = [
		[8, 0],
		[8, 1],
		[8, 2],
		[8, 3],
		[8, 4],
		[8, 5],
		[8, 7],
		[8, 8],
		[7, 8],
		[5, 8],
		[4, 8],
		[3, 8],
		[2, 8],
		[1, 8],
		[0, 8]
	];

	for (let i = 0; i < 15; i += 1) {
		const bit = (bits >>> (14 - i)) & 1;
		const [r, c] = topLeftCoords[i];
		modules[r][c] = bit;
		reserved[r][c] = true;
	}

	for (let i = 0; i < 7; i += 1) {
		const bit = (bits >>> (14 - i)) & 1;
		const r = size - 1 - i;
		modules[r][8] = bit;
		reserved[r][8] = true;
	}
	for (let i = 7; i < 15; i += 1) {
		const bit = (bits >>> (14 - i)) & 1;
		const c = size - 15 + i;
		modules[8][c] = bit;
		reserved[8][c] = true;
	}

	modules[size - 8][8] = 1;
	reserved[size - 8][8] = true;
}

function writeVersionModules(modules, reserved, version) {
	if (version < 7) return;
	const size = modules.length;
	const bits = computeVersionBits(version);
	for (let i = 0; i < 18; i += 1) {
		const bit = (bits >>> i) & 1;
		const a = size - 11 + (i % 3);
		const b = Math.floor(i / 3);
		modules[b][a] = bit;
		reserved[b][a] = true;
		modules[a][b] = bit;
		reserved[a][b] = true;
	}
}

function shouldFlipMask(maskPattern, row, col) {
	switch (maskPattern) {
		case 0:
			return (row + col) % 2 === 0;
		case 1:
			return row % 2 === 0;
		case 2:
			return col % 3 === 0;
		case 3:
			return (row + col) % 3 === 0;
		case 4:
			return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
		case 5:
			return ((row * col) % 2) + ((row * col) % 3) === 0;
		case 6:
			return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
		case 7:
			return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
		default:
			return false;
	}
}

function scorePenalty(modules) {
	const size = modules.length;
	let penalty = 0;

	// N1: adjacent modules in row/column
	for (let r = 0; r < size; r += 1) {
		let rowRun = 1;
		let colRun = 1;
		for (let c = 1; c < size; c += 1) {
			if (modules[r][c] === modules[r][c - 1]) {
				rowRun += 1;
				if (rowRun === 5) penalty += 3;
				else if (rowRun > 5) penalty += 1;
			} else {
				rowRun = 1;
			}

			if (modules[c][r] === modules[c - 1][r]) {
				colRun += 1;
				if (colRun === 5) penalty += 3;
				else if (colRun > 5) penalty += 1;
			} else {
				colRun = 1;
			}
		}
	}

	// N2: 2x2 blocks
	for (let r = 0; r < size - 1; r += 1) {
		for (let c = 0; c < size - 1; c += 1) {
			const val = modules[r][c];
			if (val === modules[r][c + 1] && val === modules[r + 1][c] && val === modules[r + 1][c + 1]) {
				penalty += 3;
			}
		}
	}

	// N3: finder-like 1:1:3:1:1 patterns preceded or followed by 4 light modules
	const matchesFinderLike = (line, index) => {
		if (
			line[index] !== 1 ||
			line[index + 1] !== 0 ||
			line[index + 2] !== 1 ||
			line[index + 3] !== 1 ||
			line[index + 4] !== 1 ||
			line[index + 5] !== 0 ||
			line[index + 6] !== 1
		) {
			return false;
		}
		const leftClear =
			index >= 4 &&
			line[index - 4] === 0 &&
			line[index - 3] === 0 &&
			line[index - 2] === 0 &&
			line[index - 1] === 0;
		const rightClear =
			index + 10 < line.length &&
			line[index + 7] === 0 &&
			line[index + 8] === 0 &&
			line[index + 9] === 0 &&
			line[index + 10] === 0;
		return leftClear || rightClear;
	};

	for (let i = 0; i < size; i += 1) {
		const col = new Uint8Array(size);
		for (let r = 0; r < size; r += 1) col[r] = modules[r][i];
		for (let j = 0; j <= size - 7; j += 1) {
			if (matchesFinderLike(modules[i], j)) penalty += 40;
			if (matchesFinderLike(col, j)) penalty += 40;
		}
	}

	// N4: dark module balance
	let darkCount = 0;
	for (let r = 0; r < size; r += 1) {
		for (let c = 0; c < size; c += 1) {
			if (modules[r][c] === 1) darkCount += 1;
		}
	}
	const total = size * size;
	const steps = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
	penalty += steps * 10;

	return penalty;
}

export function encodeQrMatrix(text) {
	const normalized = String(text ?? '');
	if (!normalized) {
		throw new Error('QR content cannot be empty.');
	}
	const bytes = new TextEncoder().encode(normalized);
	const version = selectVersion(bytes.length);
	const size = 17 + version * 4;

	const baseModules = Array.from({ length: size }, () => new Uint8Array(size));
	const reserved = Array.from({ length: size }, () => Array(size).fill(false));

	placeFinderPattern(baseModules, reserved, 0, 0);
	placeFinderPattern(baseModules, reserved, 0, size - 7);
	placeFinderPattern(baseModules, reserved, size - 7, 0);

	const centers = VERSION_SPECS_M[version][5];
	for (const r of centers) {
		for (const c of centers) {
			if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) {
				continue;
			}
			placeAlignmentPattern(baseModules, reserved, r, c);
		}
	}

	for (let i = 8; i < size - 8; i += 1) {
		const bit = i % 2 === 0 ? 1 : 0;
		if (!reserved[6][i]) {
			baseModules[6][i] = bit;
			reserved[6][i] = true;
		}
		if (!reserved[i][6]) {
			baseModules[i][6] = bit;
			reserved[i][6] = true;
		}
	}

	writeFormatModules(baseModules, reserved, 0);
	writeVersionModules(baseModules, reserved, version);

	const dataCodewords = encodeDataCodewords(bytes, version);
	const allCodewords = interleaveCodewords(dataCodewords, version);

	let bitIndex = 0;
	const totalBits = allCodewords.length * 8;
	let upward = true;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let step = 0; step < size; step += 1) {
			const r = upward ? size - 1 - step : step;
			for (let dx = 0; dx < 2; dx += 1) {
				const c = right - dx;
				if (reserved[r][c]) continue;
				let bit = 0;
				if (bitIndex < totalBits) {
					bit = (allCodewords[bitIndex >> 3] >>> (7 - (bitIndex & 7))) & 1;
					bitIndex += 1;
				}
				baseModules[r][c] = bit;
			}
		}
		upward = !upward;
	}

	let bestMatrix = null;
	let bestScore = Infinity;
	for (let mask = 0; mask < 8; mask += 1) {
		const candidate = baseModules.map((row) => Uint8Array.from(row));
		for (let r = 0; r < size; r += 1) {
			for (let c = 0; c < size; c += 1) {
				if (!reserved[r][c] && shouldFlipMask(mask, r, c)) {
					candidate[r][c] ^= 1;
				}
			}
		}
		writeFormatModules(candidate, reserved, mask);
		const score = scorePenalty(candidate);
		if (score < bestScore) {
			bestScore = score;
			bestMatrix = candidate;
		}
	}

	return {
		version,
		size,
		modules: bestMatrix.map((row) => Array.from(row))
	};
}

function escapeXml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function buildQrPathData(modules, offsetX = 0, offsetY = 0) {
	const parts = [];
	for (let r = 0; r < modules.length; r += 1) {
		const row = modules[r];
		let c = 0;
		while (c < row.length) {
			if (row[c] !== 1) {
				c += 1;
				continue;
			}
			let run = 1;
			while (c + run < row.length && row[c + run] === 1) run += 1;
			parts.push(`M${offsetX + c} ${offsetY + r}h${run}v1h-${run}z`);
			c += run;
		}
	}
	return parts.join('');
}

export function renderQrSvg(
	text,
	{ margin = 4, pixelSize = 256, darkColor = '#0a0a0c', lightColor = '#ffffff', label = '' } = {}
) {
	const { size, modules } = encodeQrMatrix(text);
	const quiet = Math.max(4, Number.isInteger(margin) ? margin : 4);
	const viewSize = size + quiet * 2;
	const pathData = buildQrPathData(modules, quiet, quiet);
	const safeLabel = escapeXml(label || `QR code for ${text}`);
	const dimensionAttrs =
		Number.isFinite(pixelSize) && pixelSize > 0
			? ` width="${Math.round(pixelSize)}" height="${Math.round(pixelSize)}"`
			: '';

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}"${dimensionAttrs} shape-rendering="crispEdges" role="img" aria-label="${safeLabel}">`,
		`<title>${safeLabel}</title>`,
		`<rect width="${viewSize}" height="${viewSize}" fill="${escapeXml(lightColor)}"/>`,
		`<path d="${pathData}" fill="${escapeXml(darkColor)}"/>`,
		'</svg>'
	].join('');
}

export function renderPrintableQrSheetSvg({
	codes = [],
	origin = 'https://3fp.org',
	riderName = '',
	copiesPerCode = 1
} = {}) {
	const cleanCodes = Array.from(
		new Set(
			(Array.isArray(codes) ? codes : [])
				.map((entry) => (typeof entry === 'string' ? entry.trim() : entry?.code?.trim?.() || ''))
				.filter(Boolean)
		)
	);
	if (!cleanCodes.length) return '';

	const safeCopies = Math.max(1, Math.min(8, Math.round(Number(copiesPerCode) || 1)));
	const items = [];
	for (const code of cleanCodes) {
		for (let i = 0; i < safeCopies; i += 1) {
			items.push(code);
		}
	}

	const baseOrigin = String(origin || 'https://3fp.org').replace(/\/+$/, '');
	const hostLabel = baseOrigin.replace(/^https?:\/\//i, '');
	const cols = items.length === 1 ? 1 : 2;
	const rows = Math.ceil(items.length / cols);
	const cardWidth = 340;
	const cardHeight = 168;
	const gap = 20;
	const pad = 28;
	const sheetWidth = pad * 2 + cols * cardWidth + (cols - 1) * gap;
	const sheetHeight = pad * 2 + 52 + rows * cardHeight + (rows - 1) * gap;
	const safeRider = escapeXml(
		String(riderName || '')
			.trim()
			.slice(0, 42)
	);

	const cardsSvg = items
		.map((code, index) => {
			const col = index % cols;
			const row = Math.floor(index / cols);
			const x = pad + col * (cardWidth + gap);
			const y = pad + 52 + row * (cardHeight + gap);
			const targetUrl = `${baseOrigin}/roadid/${encodeURIComponent(code)}`;
			const { size, modules } = encodeQrMatrix(targetUrl);
			const quiet = 4;
			const qrUnits = size + quiet * 2;
			const qrBox = 128;
			const scale = (qrBox / qrUnits).toFixed(4);
			const qrPath = buildQrPathData(modules, quiet, quiet);
			const safeCode = escapeXml(code);
			const safeShortUrl = escapeXml(`${hostLabel}/roadid/${code}`);

			return [
				`<g transform="translate(${x} ${y})">`,
				`<rect width="${cardWidth}" height="${cardHeight}" fill="#ffffff" stroke="#0a0a0c" stroke-width="3"/>`,
				`<rect width="8" height="${cardHeight}" fill="#0a0a0c"/>`,
				`<g transform="translate(20 20) scale(${scale})" shape-rendering="crispEdges">`,
				`<rect width="${qrUnits}" height="${qrUnits}" fill="#ffffff"/>`,
				`<path d="${qrPath}" fill="#0a0a0c"/>`,
				'</g>',
				`<text x="160" y="38" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" font-weight="800" letter-spacing="1.6" fill="#0a0a0c">3FP EMERGENCY ID</text>`,
				`<text x="160" y="64" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="18" font-weight="900" font-style="italic" fill="#0a0a0c">SCAN IN EMERGENCY</text>`,
				safeRider
					? `<text x="160" y="90" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#18181b">${safeRider}</text>`
					: '',
				`<rect x="160" y="104" width="160" height="24" fill="#0a0a0c"/>`,
				`<text x="168" y="120" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="800" fill="#ffffff">CODE: ${safeCode}</text>`,
				`<text x="160" y="146" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" font-weight="600" fill="#27272a">${safeShortUrl}</text>`,
				'</g>'
			].join('');
		})
		.join('');

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetWidth} ${sheetHeight}" width="${sheetWidth}" height="${sheetHeight}" role="img" aria-label="3 Feet Please Printable Emergency ID QR Sheet">`,
		`<title>3 Feet Please Printable Emergency ID QR Sheet</title>`,
		`<rect width="${sheetWidth}" height="${sheetHeight}" fill="#ffffff"/>`,
		`<text x="${pad}" y="${pad + 18}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="18" font-weight="900" font-style="italic" fill="#0a0a0c">3 FEET PLEASE · EMERGENCY ID BACKUP QR LABELS</text>`,
		`<text x="${pad}" y="${pad + 36}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" font-weight="600" fill="#3f3f46">Cut along solid borders and apply to helmet, bike frame, or wallet card.</text>`,
		cardsSvg,
		'</svg>'
	].join('');
}
