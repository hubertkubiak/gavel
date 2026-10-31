import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('../../apps/api/', import.meta.url));
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4310);
const API_URL = 'http://localhost:8080';

/** Runs @gavel/api in a child process so a test can stop and restart it. */
export class ApiServer {
  private proc?: ChildProcess;

  async start(): Promise<void> {
    this.proc = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: apiDir,
      env: { ...process.env, WEB_ORIGIN: `http://localhost:${WEB_PORT}`, RPC_LOG: '0' },
      stdio: 'inherit',
    });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${API_URL}/healthz`)).ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('API did not start');
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc || proc.exitCode !== null) return;
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill('SIGKILL');
    await exited;
  }
}

/** Places a bid directly over the Connect JSON protocol — a "second browser" in one line. */
export async function placeBid(itemId: string, nick: string, zloty: number) {
  return fetch(`${API_URL}/auction.v1.AuctionService/PlaceBid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nick}` },
    body: JSON.stringify({ itemId, amount: { amountMinor: String(zloty * 100), currency: 'PLN' } }),
  });
}
