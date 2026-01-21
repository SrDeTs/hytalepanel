import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Create a temp directory for testing
let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hytale-servers-test-'));
  process.env.DATA_PATH = tempDir;
});

afterAll(async () => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// Mock child_process exec
jest.unstable_mockModule('node:child_process', () => ({
  exec: jest.fn((_cmd: string, _opts: unknown, cb: (err: Error | null, result: { stdout: string }) => void) => {
    cb(null, { stdout: '' });
  })
}));

const servers = await import('../src/services/servers.js');

describe('Servers Service', () => {
  let createdServerId: string;

  describe('CRUD operations', () => {
    test('creates server with default config', async () => {
      const result = await servers.createServer({ name: 'Integration Test Server' });
      
      expect(result.success).toBe(true);
      expect(result.server).toBeDefined();
      expect(result.server?.name).toBe('Integration Test Server');
      expect(result.server?.config.javaXms).toBe('4G');
      expect(result.server?.config.javaXmx).toBe('8G');
      expect(result.server?.config.autoDownload).toBe(true);
      expect(result.server?.config.useG1gc).toBe(true);
      
      createdServerId = result.server!.id;
    });

    test('lists servers including created one', async () => {
      const result = await servers.listServers();
      
      expect(result.success).toBe(true);
      expect(result.servers.length).toBeGreaterThan(0);
      expect(result.servers.some(s => s.id === createdServerId)).toBe(true);
    });

    test('gets server by id', async () => {
      const result = await servers.getServer(createdServerId);
      
      expect(result.success).toBe(true);
      expect(result.server?.name).toBe('Integration Test Server');
    });

    test('returns error for non-existent server', async () => {
      const result = await servers.getServer('non-existent-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Server not found');
    });

    test('updates server name', async () => {
      const result = await servers.updateServer(createdServerId, { name: 'Updated Server Name' });
      
      expect(result.success).toBe(true);
      expect(result.server?.name).toBe('Updated Server Name');
    });

    test('updates server config', async () => {
      const result = await servers.updateServer(createdServerId, { 
        config: { javaXms: '2G', javaXmx: '4G' } 
      });
      
      expect(result.success).toBe(true);
      expect(result.server?.config.javaXms).toBe('2G');
      expect(result.server?.config.javaXmx).toBe('4G');
    });

    test('prevents duplicate ports', async () => {
      const first = await servers.listServers();
      const usedPort = first.servers[0]?.port || 5520;
      
      const result = await servers.createServer({ name: 'Duplicate Port', port: usedPort });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already in use');
    });

    test('deletes server', async () => {
      // Create a new server specifically for deletion
      const createResult = await servers.createServer({ name: 'Delete Me' });
      expect(createResult.success).toBe(true);
      
      const deleteId = createResult.server!.id;
      const result = await servers.deleteServer(deleteId);
      
      expect(result.success).toBe(true);
      
      // Verify it's gone
      const getResult = await servers.getServer(deleteId);
      expect(getResult.success).toBe(false);
    });
  });

  describe('Container name generation', () => {
    test('generates unique container name', async () => {
      const result = await servers.createServer({ name: 'Container Name Test' });
      
      expect(result.success).toBe(true);
      expect(result.server?.containerName).toMatch(/^hytale-[a-f0-9]{8}$/);
    });
  });

  describe('Helper functions', () => {
    test('getServerDataPath returns correct path', () => {
      const dataPath = servers.getServerDataPath('test-id');
      expect(dataPath).toContain('test-id');
      expect(dataPath).toContain('server');
    });

    test('getServerModsPath returns correct path', () => {
      const modsPath = servers.getServerModsPath('test-id');
      expect(modsPath).toContain('test-id');
      expect(modsPath).toContain('mods');
    });
  });
});
