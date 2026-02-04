import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let TEST_DIR: string;
let WALLET_DIR: string;

// Mock config
vi.mock('../../../src/config.js', () => {
  const testDir = join(tmpdir(), 'clawstr-wallet-config-test-' + process.pid + '-' + Date.now());
  const walletDir = join(testDir, 'wallet');
  return {
    PATHS: {
      configDir: testDir,
      walletDir: walletDir,
      walletDb: join(walletDir, 'wallet.db'),
    },
    DEFAULT_MINT: 'https://mint.minibits.cash/Bitcoin',
  };
});

import {
  isWalletInitialized,
  loadWalletConfig,
  saveWalletConfig,
  createWalletConfig,
  WALLET_PATHS,
  type WalletConfig,
} from '../../../src/lib/wallet/config.js';
import { PATHS } from '../../../src/config.js';

// Test mnemonic (DO NOT USE IN PRODUCTION)
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
const TEST_MINT = 'https://mint.test/Bitcoin';

describe('wallet config module', () => {
  beforeEach(() => {
    TEST_DIR = PATHS.configDir;
    WALLET_DIR = PATHS.walletDir;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(WALLET_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('WALLET_PATHS', () => {
    it('should have correct config directory', () => {
      expect(WALLET_PATHS.configDir).toBe(WALLET_DIR);
    });

    it('should have correct config path', () => {
      expect(WALLET_PATHS.config).toBe(join(WALLET_DIR, 'config.json'));
    });

    it('should have correct db path', () => {
      expect(WALLET_PATHS.db).toBe(join(WALLET_DIR, 'wallet.db'));
    });
  });

  describe('isWalletInitialized', () => {
    it('should return false when no config exists', () => {
      expect(isWalletInitialized()).toBe(false);
    });

    it('should return true when config exists', () => {
      const config = createWalletConfig(TEST_MNEMONIC);
      saveWalletConfig(config);
      expect(isWalletInitialized()).toBe(true);
    });
  });

  describe('createWalletConfig', () => {
    it('should create config with required fields', () => {
      const config = createWalletConfig(TEST_MNEMONIC);

      expect(config.version).toBe(1);
      expect(config.mnemonic).toBe(TEST_MNEMONIC);
      expect(config.encrypted).toBe(false);
      expect(config.mintUrl).toBe('https://mint.minibits.cash/Bitcoin');
      expect(config.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date
    });

    it('should use custom mint URL', () => {
      const config = createWalletConfig(TEST_MNEMONIC, TEST_MINT);
      expect(config.mintUrl).toBe(TEST_MINT);
    });
  });

  describe('saveWalletConfig', () => {
    it('should save config to file', () => {
      const config = createWalletConfig(TEST_MNEMONIC, TEST_MINT);
      saveWalletConfig(config);

      const configPath = join(WALLET_DIR, 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.mnemonic).toBe(TEST_MNEMONIC);
      expect(saved.mintUrl).toBe(TEST_MINT);
    });

    it('should create directory if not exists', () => {
      rmSync(WALLET_DIR, { recursive: true });
      expect(existsSync(WALLET_DIR)).toBe(false);

      const config = createWalletConfig(TEST_MNEMONIC);
      saveWalletConfig(config);

      expect(existsSync(WALLET_DIR)).toBe(true);
    });

    it('should overwrite existing config', () => {
      const config1 = createWalletConfig(TEST_MNEMONIC, 'https://mint1.test');
      saveWalletConfig(config1);

      const config2 = createWalletConfig(TEST_MNEMONIC, 'https://mint2.test');
      saveWalletConfig(config2);

      const loaded = loadWalletConfig();
      expect(loaded?.mintUrl).toBe('https://mint2.test');
    });
  });

  describe('loadWalletConfig', () => {
    it('should return null when no config exists', () => {
      expect(loadWalletConfig()).toBeNull();
    });

    it('should load saved config', () => {
      const config = createWalletConfig(TEST_MNEMONIC, TEST_MINT);
      saveWalletConfig(config);

      const loaded = loadWalletConfig();
      expect(loaded).not.toBeNull();
      expect(loaded!.mnemonic).toBe(TEST_MNEMONIC);
      expect(loaded!.mintUrl).toBe(TEST_MINT);
      expect(loaded!.version).toBe(1);
      expect(loaded!.encrypted).toBe(false);
    });

    it('should return null on invalid JSON', () => {
      const configPath = join(WALLET_DIR, 'config.json');
      writeFileSync(configPath, 'not valid json');

      expect(loadWalletConfig()).toBeNull();
    });
  });

  describe('config security', () => {
    it('should store mnemonic in config', () => {
      const config = createWalletConfig(TEST_MNEMONIC);
      saveWalletConfig(config);

      const loaded = loadWalletConfig();
      expect(loaded?.mnemonic).toBe(TEST_MNEMONIC);
    });

    it('should mark encryption status correctly', () => {
      const config = createWalletConfig(TEST_MNEMONIC);
      expect(config.encrypted).toBe(false);

      // When encryption is implemented:
      // const encryptedConfig = encryptWalletConfig(config, 'password');
      // expect(encryptedConfig.encrypted).toBe(true);
    });
  });
});
