import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Music, mountMusicBar } from './music';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1C130C',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});

// 背景音樂：瀏覽器規定要有使用者操作才能出聲，所以第一次點擊或按鍵時才開始放
const music = new Music();
mountMusicBar(music);
window.addEventListener('pointerdown', () => music.start(), { once: true });
window.addEventListener('keydown', () => music.start(), { once: true });
