import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { createServer } from 'vite';

const BANK_CONNECTIONS_PATH = '/rest/v1/group_accounting_bank_connections';

function startPostgrestStub() {
	const server = http.createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === BANK_CONNECTIONS_PATH) {
			res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
			res.end(req.method === 'HEAD' ? undefined : '[]');
			return;
		}

		res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
		res.end(JSON.stringify({ message: `Unhandled stub route: ${req.method} ${url.pathname}` }));
	});

	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject);
			resolve(server);
		});
	});
}

function closeHttpServer(server) {
	if (!server) return Promise.resolve();
	server.closeAllConnections?.();
	return /** @type {Promise<void>} */ (
		new Promise((resolve) => {
			server.close(() => resolve());
		})
	);
}

function restoreEnv(snapshot, keys) {
	for (const key of keys) {
		if (Object.hasOwn(snapshot, key) && snapshot[key] !== undefined) {
			process.env[key] = snapshot[key];
		} else {
			delete process.env[key];
		}
	}
}

function spawnCommand(command, args, env) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: 'inherit',
			env
		});
		const forwardSignal = (signal) => {
			if (!child.killed) child.kill(signal);
		};
		process.on('SIGINT', forwardSignal);
		process.on('SIGTERM', forwardSignal);

		child.once('error', (error) => {
			process.off('SIGINT', forwardSignal);
			process.off('SIGTERM', forwardSignal);
			reject(error);
		});
		child.once('exit', (code, signal) => {
			process.off('SIGINT', forwardSignal);
			process.off('SIGTERM', forwardSignal);
			resolve({ code, signal });
		});
	});
}

const baseEnv = { ...process.env };
const overriddenKeys = [
	'PUBLIC_SUPABASE_URL',
	'PUBLIC_SUPABASE_ANON_KEY',
	'SUPABASE_SERVICE_ROLE_KEY',
	'STRIPE_SECRET_KEY',
	'STRIPE_WEBHOOK_SECRET',
	'STRIPE_CONNECT_WEBHOOK_SECRET'
];

let stubServer = null;
let viteServer = null;

try {
	stubServer = await startPostgrestStub();
	const stubAddress = stubServer.address();
	if (!stubAddress || typeof stubAddress !== 'object') {
		throw new Error('Unable to determine local PostgREST stub address.');
	}

	const stubOrigin = `http://127.0.0.1:${stubAddress.port}`;
	const webhookSecret = `webhook-test-${randomBytes(24).toString('hex')}`;

	process.env.PUBLIC_SUPABASE_URL = stubOrigin;
	process.env.PUBLIC_SUPABASE_ANON_KEY =
		baseEnv.PUBLIC_SUPABASE_ANON_KEY || `anon-test-${randomBytes(12).toString('hex')}`;
	process.env.SUPABASE_SERVICE_ROLE_KEY = `service-role-test-${randomBytes(16).toString('hex')}`;
	process.env.STRIPE_SECRET_KEY = `stripe-key-test-${randomBytes(16).toString('hex')}`;
	process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
	process.env.STRIPE_CONNECT_WEBHOOK_SECRET = '';

	viteServer = await createServer({
		envDir: false,
		logLevel: 'error',
		optimizeDeps: { noDiscovery: true },
		server: {
			host: '127.0.0.1',
			port: 0,
			strictPort: false,
			hmr: false,
			watch: null
		}
	});
	await viteServer.listen();

	const viteAddress = viteServer.httpServer?.address();
	if (!viteAddress || typeof viteAddress !== 'object') {
		throw new Error('Unable to determine local Vite server address.');
	}

	const webhookUrl = `http://127.0.0.1:${viteAddress.port}/api/stripe/webhook`;
	const cliArgs = process.argv.slice(2);
	const [command, ...args] =
		cliArgs.length > 0
			? cliArgs
			: [process.execPath, '--test', 'src/lib/server/groupAccountingWebhook.test.js'];

	const { code, signal } = await spawnCommand(command, args, {
		...baseEnv,
		ACCOUNTING_TEST_WEBHOOK_URL: webhookUrl,
		ACCOUNTING_TEST_WEBHOOK_SECRET: webhookSecret
	});

	if (signal) {
		process.exitCode = 1;
	} else {
		process.exitCode = code ?? 1;
	}
} finally {
	await viteServer?.close();
	await closeHttpServer(stubServer);
	restoreEnv(baseEnv, overriddenKeys);
}
