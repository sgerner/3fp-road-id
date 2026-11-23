import type { ComponentProps } from 'svelte';
import type ManageActionButton from './ManageActionButton.svelte';

type ActionButtonProps = ComponentProps<typeof ManageActionButton>;

// Valid: visible label
const _validWithLabel: ActionButtonProps = {
	label: 'Reset'
};

// Valid: icon-only button with explicit ariaLabel
const _validIconOnly: ActionButtonProps = {
	ariaLabel: 'Close queued emails sheet',
	iconOnly: true
};

// Invalid: unlabeled control (neither label nor ariaLabel provided) must fail svelte-check
// @ts-expect-error ManageActionButton requires either label or ariaLabel
const _invalidUnlabeled: ActionButtonProps = {
	tone: 'primary'
};

// Invalid: iconOnly without ariaLabel or label must fail svelte-check
// @ts-expect-error ManageActionButton iconOnly control requires ariaLabel
const _invalidIconOnlyWithoutAria: ActionButtonProps = {
	iconOnly: true
};

export type { _validWithLabel, _validIconOnly, _invalidUnlabeled, _invalidIconOnlyWithoutAria };
