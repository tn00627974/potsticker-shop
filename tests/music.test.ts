import { describe, expect, it } from 'vitest';
import { buildTracks } from '../src/music';

const all = () => true;

describe('曲目表', () => {
  it('歌名就是檔名，照名字排', () => {
    const tracks = buildTracks({ '/music/b.mp3': 'b-url', '/music/a.mp3': 'a-url' }, all);
    expect(tracks).toEqual([
      { name: 'a', url: 'a-url' },
      { name: 'b', url: 'b-url' },
    ]);
  });

  it('同一首有 mp3 和 ogg 只留一個，優先 mp3', () => {
    const tracks = buildTracks({ '/music/music_day.ogg': 'ogg-url', '/music/music_day.mp3': 'mp3-url' }, all);
    expect(tracks).toEqual([{ name: 'music_day', url: 'mp3-url' }]);
  });

  it('瀏覽器不能放的格式跳過', () => {
    const onlyOgg = (mime: string) => mime === 'audio/ogg';
    const tracks = buildTracks({ '/music/a.mp3': 'mp3-url', '/music/a.ogg': 'ogg-url', '/music/b.wav': 'wav-url' }, onlyOgg);
    expect(tracks).toEqual([{ name: 'a', url: 'ogg-url' }]);
  });
});
