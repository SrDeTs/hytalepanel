import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const mockExecCommand = jest.fn<(cmd: string, timeout?: number) => Promise<string>>();
const mockGetArchive = jest.fn();
const mockPutArchive = jest.fn();

jest.unstable_mockModule('../src/services/docker.js', () => ({
  execCommand: mockExecCommand,
  getArchive: mockGetArchive,
  putArchive: mockPutArchive
}));

const { sanitizePath, isAllowedUpload, checkServerFiles, checkAuth, wipeData } = await import('../src/services/files.js');

describe('Files Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Security: sanitizePath', () => {
    test('blocks path traversal attempts', () => {
      expect(() => sanitizePath('../../../etc/passwd')).toThrow('Path traversal');
      expect(() => sanitizePath('..\\..\\etc\\passwd')).toThrow('Path traversal');
      expect(() => sanitizePath('..\\../etc/passwd')).toThrow('Path traversal');
    });
  });

  describe('Security: isAllowedUpload', () => {
    test('allows safe file types', () => {
      expect(isAllowedUpload('plugin.jar')).toBe(true);
      expect(isAllowedUpload('backup.zip')).toBe(true);
      expect(isAllowedUpload('config.json')).toBe(true);
      expect(isAllowedUpload('config.yaml')).toBe(true);
    });

    test('blocks dangerous file types', () => {
      expect(isAllowedUpload('virus.exe')).toBe(false);
      expect(isAllowedUpload('malware.dll')).toBe(false);
      expect(isAllowedUpload('hack.com')).toBe(false);
    });

    test('handles case insensitivity', () => {
      expect(isAllowedUpload('CONFIG.JSON')).toBe(true);
      expect(isAllowedUpload('VIRUS.EXE')).toBe(false);
    });
  });

  describe('checkServerFiles', () => {
    test('returns ready status based on file existence', async () => {
      mockExecCommand.mockResolvedValue('/opt/hytale/HytaleServer.jar\n/opt/hytale/Assets.zip');
      let result = await checkServerFiles();
      expect(result.ready).toBe(true);

      mockExecCommand.mockResolvedValue('NO_FILES');
      result = await checkServerFiles();
      expect(result.ready).toBe(false);
    });

    test('handles errors gracefully', async () => {
      mockExecCommand.mockRejectedValue(new Error('Container error'));
      const result = await checkServerFiles();
      expect(result.ready).toBe(false);
    });
  });

  describe('checkAuth', () => {
    test('returns true when valid credentials exist', async () => {
      mockExecCommand.mockResolvedValue('{"access_token": "abc123"}');
      expect(await checkAuth()).toBe(true);
    });

    test('returns false when no credentials', async () => {
      mockExecCommand.mockResolvedValue('NO_AUTH');
      expect(await checkAuth()).toBe(false);
    });

    test('returns false on error', async () => {
      mockExecCommand.mockRejectedValue(new Error('Container error'));
      expect(await checkAuth()).toBe(false);
    });
  });

  describe('wipeData', () => {
    test('returns success/failure appropriately', async () => {
      mockExecCommand.mockResolvedValue('');
      expect((await wipeData()).success).toBe(true);

      mockExecCommand.mockRejectedValue(new Error('Permission denied'));
      expect((await wipeData()).success).toBe(false);
    });
  });
});
