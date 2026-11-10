import { describe, expect, it, vi } from 'vitest';
import { releaseVoiceCapture } from '@/components/voice-recorder';

describe('voice recorder cleanup', () => {
  it('stops an active recorder and all microphone tracks, then releases playback audio', () => {
    const stopRecorder = vi.fn();
    const stopTrack = vi.fn();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    releaseVoiceCapture(
      { state: 'recording', stop: stopRecorder } as unknown as MediaRecorder,
      { getTracks: () => [{ stop: stopTrack }, { stop: stopTrack }] } as unknown as MediaStream,
      'blob:voice',
    );
    expect(stopRecorder).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith('blob:voice');
    revoke.mockRestore();
  });
});
