import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const CLI_PATH = join(__dirname, '../../dist/index.js');

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, HOME: '/tmp/clawstr-test-home' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

// Test fixtures
const TEST_PUBKEY = 'a'.repeat(64);
const TEST_EVENT_ID = 'b'.repeat(64);

describe('encode/decode commands (integration)', () => {
  describe('encode npub', () => {
    it('should encode pubkey to npub', async () => {
      const { stdout, code } = await runCli(['encode', 'npub', TEST_PUBKEY]);

      expect(code).toBe(0);
      expect(stdout).toMatch(/^npub1[a-z0-9]+$/);
    });

    it('should fail with invalid hex', async () => {
      const { code } = await runCli(['encode', 'npub', 'invalid']);

      expect(code).not.toBe(0);
    });
  });

  describe('encode note', () => {
    it('should encode event ID to note', async () => {
      const { stdout, code } = await runCli(['encode', 'note', TEST_EVENT_ID]);

      expect(code).toBe(0);
      expect(stdout).toMatch(/^note1[a-z0-9]+$/);
    });
  });

  describe('encode nevent', () => {
    it('should encode event with options', async () => {
      const { stdout, code } = await runCli([
        'encode',
        'nevent',
        TEST_EVENT_ID,
        '--relay',
        'wss://relay.damus.io',
      ]);

      expect(code).toBe(0);
      expect(stdout).toMatch(/^nevent1[a-z0-9]+$/);
    });
  });

  describe('decode', () => {
    it('should decode npub', async () => {
      // First encode
      const { stdout: encoded } = await runCli(['encode', 'npub', TEST_PUBKEY]);

      // Then decode
      const { stdout, code } = await runCli(['decode', encoded]);

      expect(code).toBe(0);
      expect(stdout).toContain('Type: npub');
      expect(stdout).toContain(TEST_PUBKEY);
    });

    it('should decode with --json flag', async () => {
      const { stdout: encoded } = await runCli(['encode', 'npub', TEST_PUBKEY]);
      const { stdout, code } = await runCli(['decode', encoded, '--json']);

      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.type).toBe('npub');
      expect(parsed.data).toBe(TEST_PUBKEY);
    });

    it('should fail on invalid input', async () => {
      const { code } = await runCli(['decode', 'invalid']);

      expect(code).not.toBe(0);
    });
  });

  describe('roundtrip encoding', () => {
    it('should roundtrip npub', async () => {
      const { stdout: encoded } = await runCli(['encode', 'npub', TEST_PUBKEY]);
      const { stdout: decoded } = await runCli(['decode', encoded, '--json']);

      const result = JSON.parse(decoded);
      expect(result.data).toBe(TEST_PUBKEY);
    });

    it('should roundtrip note', async () => {
      const { stdout: encoded } = await runCli(['encode', 'note', TEST_EVENT_ID]);
      const { stdout: decoded } = await runCli(['decode', encoded, '--json']);

      const result = JSON.parse(decoded);
      expect(result.data).toBe(TEST_EVENT_ID);
    });

    it('should roundtrip nevent with relay', async () => {
      const relay = 'wss://relay.damus.io';
      const { stdout: encoded } = await runCli([
        'encode',
        'nevent',
        TEST_EVENT_ID,
        '--relay',
        relay,
      ]);
      const { stdout: decoded } = await runCli(['decode', encoded, '--json']);

      const result = JSON.parse(decoded);
      expect(result.type).toBe('nevent');
      expect(result.data.id).toBe(TEST_EVENT_ID);
      expect(result.data.relays).toContain(relay);
    });
  });
});
