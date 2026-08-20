import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { serializeGroupSiteConfig } from '../src/lib/microsites/config.js';
import { buildThreeFeetPleaseSite } from '../src/lib/microsites/threeFeetPlease.js';

function readEnvValue(source, key) {
	const match = source.match(new RegExp(`^${key}\\s*[:=]\\s*(.+)$`, 'm'));
	if (!match) return '';
	const value = match[1].trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

const envSource = await readFile(new URL('../.env', import.meta.url), 'utf8');
const supabaseUrl =
	process.env.PUBLIC_SUPABASE_URL || readEnvValue(envSource, 'PUBLIC_SUPABASE_URL');
const serviceRoleKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvValue(envSource, 'SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
	throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false }
});

const { data: group, error: groupError } = await supabase
	.from('groups')
	.select('*')
	.eq('slug', '3-feet-please')
	.single();
if (groupError) throw groupError;

const { data: currentConfig, error: configError } = await supabase
	.from('group_site_configs')
	.select('*')
	.eq('group_id', group.id)
	.maybeSingle();
if (configError) throw configError;

const config = buildThreeFeetPleaseSite({ group, currentConfig: currentConfig || {} });
const payload = serializeGroupSiteConfig(config);
const { data: published, error: publishError } = await supabase
	.from('group_site_configs')
	.upsert(
		{ group_id: group.id, ...payload, updated_at: new Date().toISOString() },
		{ onConflict: 'group_id' }
	)
	.select('group_id,published,updated_at,site_pages')
	.single();
if (publishError) throw publishError;

console.log(
	JSON.stringify({
		group: group.slug,
		published: published.published,
		updated_at: published.updated_at,
		pages: published.site_pages.map((page) => page.slug || 'home')
	})
);
