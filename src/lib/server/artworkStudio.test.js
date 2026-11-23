import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { COVER_MOOD_OPTIONS, IMAGE_TONE_OPTIONS, getImageTonePreset } from '../ai/imageTones.js';
import { SOCIAL_TONE_OPTIONS, getSocialTonePreset } from '../ai/socialTones.js';
import {
	BIKE_VIBE_STYLE_ID,
	STATE_MASCOT_STYLE_ID,
	buildArtworkStyleOptions,
	inferBikeVibeIdFromContext,
	inferStateCodeFromContext,
	resolveDefaultBikeVibeId,
	resolveDefaultStateCode,
	styleRequiresBikeVibeSelection,
	styleRequiresStateSelection,
	validateArtworkStyleSelection
} from '../ai/artworkStudio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const EXPECTED_PRESET_IDS = [
	'passionate_advocate',
	'rebellious',
	'playful',
	'serious_organizer',
	'wonky_teacher',
	'neighborly',
	'bold_beautiful',
	'eccentric',
	'calm_collected',
	'peaceful_mindful',
	'feisty',
	'boisterous',
	'flaming_gay'
];

test('cover mood options preserve all 13 preset IDs with clean visual-only labels and descriptions', () => {
	assert.equal(IMAGE_TONE_OPTIONS, COVER_MOOD_OPTIONS);
	assert.deepEqual(
		COVER_MOOD_OPTIONS.map((option) => option.id),
		EXPECTED_PRESET_IDS
	);

	const profanityPattern = /\b(fuck|fucking|shit|damn|bitch)\b/i;

	for (const option of COVER_MOOD_OPTIONS) {
		assert.equal(typeof option.label, 'string');
		assert.ok(option.label.trim().length > 0, `Missing label for ${option.id}`);
		assert.equal(typeof option.description, 'string');
		assert.ok(option.description.trim().length > 0, `Missing description for ${option.id}`);
		assert.equal(typeof option.imagePrompt, 'string');
		assert.ok(option.imagePrompt.trim().length > 0, `Missing imagePrompt for ${option.id}`);
		assert.equal('guidance' in option, false, `${option.id} should not expose social guidance`);
		assert.equal('example' in option, false, `${option.id} should not expose social example`);
		assert.equal(
			profanityPattern.test(`${option.label} ${option.description} ${option.imagePrompt}`),
			false,
			`${option.id} should not include profanity in cover mood options`
		);
		assert.deepEqual(getImageTonePreset(option.id), option);
	}

	assert.equal(getImageTonePreset('flaming_gay')?.label, 'Joyful Pride');
	assert.equal(getImageTonePreset('unknown_preset'), null);
});

test('social tone presets preserve verbal copywriting guidance for claimed-group social manager', () => {
	assert.deepEqual(
		SOCIAL_TONE_OPTIONS.map((option) => option.id),
		EXPECTED_PRESET_IDS
	);

	for (const option of SOCIAL_TONE_OPTIONS) {
		assert.equal(typeof option.label, 'string');
		assert.ok(option.label.trim().length > 0);
		assert.equal(typeof option.guidance, 'string');
		assert.ok(option.guidance.trim().length > 0);
		assert.equal(typeof option.example, 'string');
		assert.deepEqual(getSocialTonePreset(option.id), option);
	}

	assert.equal(getSocialTonePreset('missing_tone'), null);
});

test('artworkStudio infers state codes and bike vibes from page context', async () => {
	assert.equal(inferStateCodeFromContext({ state: 'az' }), 'AZ');
	assert.equal(inferStateCodeFromContext({ location: 'Tempe, Arizona' }), 'AZ');
	assert.equal(inferStateCodeFromContext({ startLocation: 'Downtown · Portland, OR' }), 'OR');
	assert.equal(inferStateCodeFromContext({ location: 'Somewhere Overseas' }), '');

	assert.equal(
		inferBikeVibeIdFromContext({ disciplines: ['Gravel', 'Social'] }),
		'gravel_adventure'
	);
	assert.equal(
		inferBikeVibeIdFromContext({ summary: 'Family e-bike commuter loop' }),
		'ebike_commuter'
	);
	assert.equal(
		inferBikeVibeIdFromContext({ description: 'Singletrack MTB trail session' }),
		'mountain_trail'
	);
	assert.equal(
		inferBikeVibeIdFromContext({ title: 'Late night fixed gear alley ride' }),
		'fixie_minimal'
	);
	assert.equal(inferBikeVibeIdFromContext({ name: 'Youth & Kids Bike Rodeo' }), 'kids_playbike');
	assert.equal(
		inferBikeVibeIdFromContext({ tagline: 'Fast Tuesday night criterium' }),
		'road_race'
	);
	assert.equal(inferBikeVibeIdFromContext({ title: 'Coffee meetup' }), '');

	assert.equal(
		await resolveDefaultStateCode({
			currentStateCode: 'ca',
			context: { state: 'AZ' },
			fetchImpl: async () => {
				throw new Error('Should not fetch when state already selected');
			}
		}),
		'CA'
	);

	assert.equal(
		await resolveDefaultStateCode({
			currentStateCode: '',
			context: {},
			fetchImpl: async () => ({
				ok: true,
				async json() {
					return { stateCode: 'wa' };
				}
			})
		}),
		'WA'
	);

	assert.equal(
		resolveDefaultBikeVibeId({
			currentBikeVibeId: '',
			context: { description: 'Mixed-surface gravel adventure' }
		}),
		'gravel_adventure'
	);
});

test('artworkStudio validates conditional style options and builds API payloads', () => {
	assert.equal(styleRequiresStateSelection(STATE_MASCOT_STYLE_ID), true);
	assert.equal(styleRequiresStateSelection('comic_house'), false);
	assert.equal(styleRequiresBikeVibeSelection(BIKE_VIBE_STYLE_ID), true);
	assert.equal(styleRequiresBikeVibeSelection('comic_house'), false);

	assert.equal(
		validateArtworkStyleSelection({ styleId: STATE_MASCOT_STYLE_ID, stateCode: '' }),
		'Select a state or territory for this style.'
	);
	assert.equal(
		validateArtworkStyleSelection({ styleId: STATE_MASCOT_STYLE_ID, stateCode: 'CO' }),
		''
	);
	assert.equal(
		validateArtworkStyleSelection({ styleId: BIKE_VIBE_STYLE_ID, bikeVibeId: '' }),
		'Select a bike type or vibe for this style.'
	);
	assert.equal(
		validateArtworkStyleSelection({ styleId: BIKE_VIBE_STYLE_ID, bikeVibeId: 'gravel_adventure' }),
		''
	);

	assert.deepEqual(
		buildArtworkStyleOptions({
			styleId: STATE_MASCOT_STYLE_ID,
			stateCode: 'az',
			bikeVibeId: 'road_race'
		}),
		{
			stateCode: 'AZ',
			stateName: 'Arizona'
		}
	);

	const bikePayload = buildArtworkStyleOptions({
		styleId: BIKE_VIBE_STYLE_ID,
		stateCode: 'AZ',
		bikeVibeId: 'gravel_adventure'
	});
	assert.equal(bikePayload.bikeVibeId, 'gravel_adventure');
	assert.equal(bikePayload.bikeVibeLabel, 'Gravel Adventure Bike');
	assert.ok(bikePayload.bikeVibePrompt.includes('gravel'));
	assert.equal('stateCode' in bikePayload, false);
});

test('authoring forms and CoverMediaField defer AI catalogs until studio modal dynamic import', () => {
	const removedPanelPath = path.join(repoRoot, 'src/lib/components/ai/ImageGeneratorPanel.svelte');
	assert.equal(
		fs.existsSync(removedPanelPath),
		false,
		'ImageGeneratorPanel.svelte must be removed'
	);

	const coverFieldSource = fs.readFileSync(
		path.join(repoRoot, 'src/lib/components/ai/CoverMediaField.svelte'),
		'utf8'
	);
	assert.match(
		coverFieldSource,
		/import\(\s*['"]#lib\/components\/ai\/ArtworkStudioModal\.svelte['"]\s*\)/,
		'CoverMediaField must dynamically import ArtworkStudioModal.svelte'
	);

	const deferredCatalogPattern =
		/^\s*import\s+[^;]*from\s+['"](?:#lib|\.\.?\/)[^'"]*(?:imageStyles|imageTones|socialTones|bikeVibes|usStates|artworkStudio|ArtworkStudioModal)/m;

	const authoringFiles = [
		'src/lib/components/ai/CoverMediaField.svelte',
		'src/routes/groups/new/+page.svelte',
		'src/lib/components/ride/RideEditor.svelte',
		'src/lib/components/learn/LearnAuthoringForm.svelte',
		'src/routes/groups/[slug]/manage/presence/+page.svelte'
	];

	for (const relPath of authoringFiles) {
		const content = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
		assert.equal(
			deferredCatalogPattern.test(content),
			false,
			`${relPath} must not statically import AI style/mood/state/bike catalogs or ArtworkStudioModal`
		);
		assert.equal(
			content.includes('ImageGeneratorPanel'),
			false,
			`${relPath} must not reference ImageGeneratorPanel`
		);
	}

	const studioSource = fs.readFileSync(
		path.join(repoRoot, 'src/lib/components/ai/ArtworkStudioModal.svelte'),
		'utf8'
	);
	assert.equal(
		studioSource.includes('socialTones'),
		false,
		'ArtworkStudioModal must not import socialTones'
	);

	const socialManagerSource = fs.readFileSync(
		path.join(repoRoot, 'src/lib/components/groups/GroupSocialManager.svelte'),
		'utf8'
	);
	assert.match(socialManagerSource, /socialTones/);
	assert.match(
		socialManagerSource,
		/import\(\s*['"]#lib\/components\/ai\/ArtworkStudioModal\.svelte['"]\s*\)/
	);
});
