import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import type Dockerode from 'dockerode';

type ContainerInspectInfo = Awaited<ReturnType<Dockerode.Container['inspect']>>;
type ExecResult = Awaited<ReturnType<Dockerode.Container['exec']>>;

const mockContainer = {
  inspect: jest.fn<() => Promise<ContainerInspectInfo>>(),
  exec: jest.fn<() => Promise<ExecResult>>(),
  restart: jest.fn<() => Promise<void>>(),
  stop: jest.fn<() => Promise<void>>(),
  start: jest.fn<() => Promise<void>>(),
  logs: jest.fn(),
  getArchive: jest.fn(),
  putArchive: jest.fn()
};

const mockDocker = {
  getContainer: jest.fn(() => mockContainer)
};

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn(() => mockDocker)
}));

const docker = await import('../src/services/docker.js');

describe('Docker Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatus', () => {
    test('returns running status with health', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: true,
          Status: 'running',
          StartedAt: '2024-01-01T00:00:00Z',
          Health: { Status: 'healthy' }
        }
      } as ContainerInspectInfo);

      const status = await docker.getStatus();
      expect(status.running).toBe(true);
      expect(status.status).toBe('running');
      expect(status.health).toBe('healthy');
    });

    test('returns not found on error', async () => {
      mockContainer.inspect.mockRejectedValue(new Error('Not found'));
      const status = await docker.getStatus();
      expect(status.running).toBe(false);
      expect(status.status).toBe('not found');
    });

    test('handles missing health status', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: { Running: true, Status: 'running', StartedAt: '2024-01-01T00:00:00Z' }
      } as ContainerInspectInfo);
      const status = await docker.getStatus();
      expect(status.health).toBe('unknown');
    });
  });

  describe('execCommand', () => {
    test('executes command and returns output', async () => {
      const mockStream = {
        on: jest.fn((event: string, cb: (data?: Buffer | Error) => void) => {
          if (event === 'data') {
            cb(Buffer.concat([Buffer.alloc(8), Buffer.from('test output')]));
          }
          if (event === 'end') setTimeout(() => cb(), 10);
          return mockStream;
        })
      };

      mockContainer.exec.mockResolvedValue({
        start: () => Promise.resolve(mockStream)
      } as unknown as ExecResult);

      const output = await docker.execCommand('echo test');
      expect(output).toContain('test output');
    });

    test('handles stream error', async () => {
      const mockStream = {
        on: jest.fn((event: string, cb: (err?: Error) => void) => {
          if (event === 'error') setTimeout(() => cb(new Error('Stream error')), 10);
          return mockStream;
        })
      };

      mockContainer.exec.mockResolvedValue({
        start: () => Promise.resolve(mockStream)
      } as unknown as ExecResult);

      await expect(docker.execCommand('test')).rejects.toThrow('Stream error');
    });
  });

  describe('sendCommand', () => {
    test('returns success/failure appropriately', async () => {
      const mockStream = {
        on: jest.fn((event: string, cb: () => void) => {
          if (event === 'end') setTimeout(cb, 10);
          return mockStream;
        })
      };
      mockContainer.exec.mockResolvedValue({
        start: () => Promise.resolve(mockStream)
      } as unknown as ExecResult);
      expect((await docker.sendCommand('test')).success).toBe(true);

      mockContainer.exec.mockRejectedValue(new Error('Send failed'));
      const result = await docker.sendCommand('test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Send failed');
    });
  });

  describe('Container control', () => {
    test.each(['restart', 'stop', 'start'] as const)('%s returns success/failure', async (action) => {
      mockContainer[action].mockResolvedValue(undefined);
      expect((await docker[action]()).success).toBe(true);

      mockContainer[action].mockRejectedValue(new Error(`${action} failed`));
      expect((await docker[action]()).success).toBe(false);
    });
  });
});
