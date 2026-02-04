import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_PATH = join(__dirname, '../../dist/index.js');
const TEST_HOME = join(tmpdir(), 'clawstr-social-e2e-test-' + process.pid);

// Test pubkeys (valid hex but not real users)
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const CHARLIE = 'c'.repeat(64);

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, HOME: TEST_HOME },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Process timed out'));
    }, 15000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

describe('social commands e2e tests', () => {
  beforeEach(async () => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });

    // Initialize identity for social commands
    await runCli(['init', '--skip-profile']);
  });

  afterEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true });
    }
  });

  describe('follow/unfollow', () => {
    it('should follow a user (without publishing)', async () => {
      const { stdout, code } = await runCli(['follow', ALICE, '--no-publish']);

      expect(code).toBe(0);
      expect(stdout).toContain('Following');
    });

    it('should show followed user in contacts', async () => {
      await runCli(['follow', ALICE, '--no-publish']);
      const { stdout, code } = await runCli(['contacts']);

      expect(code).toBe(0);
      expect(stdout).toContain('npub1');
    });

    it('should unfollow a user', async () => {
      await runCli(['follow', ALICE, '--no-publish']);
      const { stdout, code } = await runCli(['unfollow', ALICE, '--no-publish']);

      expect(code).toBe(0);
      expect(stdout).toContain('Unfollowed');
    });

    it('should support multiple follows', async () => {
      await runCli(['follow', ALICE, '--no-publish']);
      await runCli(['follow', BOB, '--no-publish']);
      await runCli(['follow', CHARLIE, '--no-publish']);

      const { stdout } = await runCli(['contacts', '--json']);
      const contacts = JSON.parse(stdout);

      expect(contacts.length).toBe(3);
    });

    it('should store petname', async () => {
      await runCli(['follow', ALICE, '--petname', 'alice', '--no-publish']);
      const { stdout } = await runCli(['contacts']);

      expect(stdout).toContain('alice');
    });
  });

  describe('mute/unmute', () => {
    it('should mute a user', async () => {
      const { stdout, code } = await runCli(['mute', ALICE, '--no-publish']);

      expect(code).toBe(0);
      expect(stdout).toContain('Muted');
    });

    it('should show muted user in mutes list', async () => {
      await runCli(['mute', ALICE, '--no-publish']);
      const { stdout, code } = await runCli(['mutes']);

      expect(code).toBe(0);
      expect(stdout).toContain('npub1');
    });

    it('should unmute a user', async () => {
      await runCli(['mute', ALICE, '--no-publish']);
      const { stdout, code } = await runCli(['unmute', ALICE, '--no-publish']);

      expect(code).toBe(0);
      expect(stdout).toContain('Unmuted');
    });

    it('should handle unmute for non-muted user', async () => {
      const { stdout } = await runCli(['unmute', ALICE, '--no-publish']);

      expect(stdout).toContain('Not muted');
    });
  });

  describe('contacts command', () => {
    it('should show empty message when no contacts', async () => {
      const { stdout } = await runCli(['contacts']);

      expect(stdout).toContain('No contacts');
    });

    it('should output JSON with --json flag', async () => {
      await runCli(['follow', ALICE, '--no-publish']);
      const { stdout } = await runCli(['contacts', '--json']);

      const contacts = JSON.parse(stdout);
      expect(contacts).toBeInstanceOf(Array);
      expect(contacts.length).toBe(1);
      expect(contacts[0].pubkey).toBe(ALICE);
    });
  });

  describe('mutes command', () => {
    it('should show empty message when no mutes', async () => {
      const { stdout } = await runCli(['mutes']);

      expect(stdout).toContain('No muted users');
    });

    it('should output JSON with --json flag', async () => {
      await runCli(['mute', ALICE, '--no-publish']);
      const { stdout } = await runCli(['mutes', '--json']);

      const mutes = JSON.parse(stdout);
      expect(mutes).toBeInstanceOf(Array);
      expect(mutes.length).toBe(1);
      expect(mutes[0].pubkey).toBe(ALICE);
    });
  });

  describe('npub support', () => {
    it('should follow by npub', async () => {
      // First encode ALICE to npub
      const { stdout: npub } = await runCli(['encode', 'npub', ALICE]);

      const { code } = await runCli(['follow', npub.trim(), '--no-publish']);
      expect(code).toBe(0);

      const { stdout: contacts } = await runCli(['contacts', '--json']);
      const parsed = JSON.parse(contacts);
      expect(parsed[0].pubkey).toBe(ALICE);
    });

    it('should mute by npub', async () => {
      const { stdout: npub } = await runCli(['encode', 'npub', ALICE]);

      const { code } = await runCli(['mute', npub.trim(), '--no-publish']);
      expect(code).toBe(0);

      const { stdout: mutes } = await runCli(['mutes', '--json']);
      const parsed = JSON.parse(mutes);
      expect(parsed[0].pubkey).toBe(ALICE);
    });
  });
});
