/// <reference types="vite/client" />
/**
 * 背景音樂（從便利商店的音樂模組簡化而來）
 *
 * 【這個檔做什麼】
 *   1. 找歌：把專案根目錄 music/ 資料夾裡的音檔整理成曲目表（buildTracks）
 *   2. 放歌：用瀏覽器內建的 <audio> 播放，邊下載邊放（Music）
 *   3. 記設定：選哪首、音量、靜音存在這台裝置的 localStorage（Music.load / Music.save）
 *   4. 介面：把 index.html 下方的音樂列接上播放器（mountMusicBar）
 *
 * 【怎麼加歌】
 *   把音檔（mp3、m4a、ogg、opus、wav）丟進 music/，重新整理頁面就會出現在選單。
 *   歌名就是檔名（不含副檔名），不用改程式、不用轉檔。
 *
 * 【播放方式】
 *   - 隨機播放：一首放完自動換下一首，不會連放同一首
 *   - 單曲循環：在選單選某一首，就一直重複那首
 *
 * 【誰在用】
 *   main.ts 建立一個 Music、呼叫 mountMusicBar，並在第一次點擊或按鍵時呼叫 music.start()。
 *   遊戲畫面（GameScene）完全不知道有音樂，兩邊互不相干。
 *
 * 【跟便利商店版相比拿掉的】
 *   依時段換歌、試聽、顯示歌曲長度、音效、接 WebAudio 調音量。
 *   因為沒有接 WebAudio，iPhone 上音量拉桿沒作用（iPhone 不讓網頁調 <audio> 的音量），只有靜音有用。
 *   0.2 做出一天的時段後，想要依時段換歌再加回來。
 */

/**
 * music/ 資料夾裡所有音檔：「檔案路徑 → 網址」。
 *
 * import.meta.glob 是 Vite 的功能，在建置時就把資料夾掃一遍：
 *   - eager: true      → 直接拿到結果，不用 await
 *   - query: '?url'    → 只要檔案的網址，不要把音檔內容塞進 JS
 *   - import: 'default'→ 值直接是網址字串
 * 開發時（npm run dev）Vite 會盯著資料夾，新丟進去的歌重新整理就看得到；
 * 建置時（npm run build）會把音檔複製到 dist/assets/，檔名加上雜湊。
 *
 * 範例：{ '/music/music_day.mp3': '/assets/music_day-3f2a.mp3', ... }
 */
const files = import.meta.glob('/music/*.{mp3,m4a,ogg,opus,wav,MP3,M4A,OGG,WAV}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/**
 * 同一首歌有好幾種格式時，優先用哪一個（越前面越優先）。
 * mp3 排第一：串流時只要下載幾 KB 就能開始放，而且每個瀏覽器都支援。
 */
const PREFER = ['mp3', 'm4a', 'ogg', 'opus', 'wav'];

/** 副檔名 → MIME 類型，用來問瀏覽器「這個格式你能不能放」（<audio>.canPlayType） */
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs="opus"',
  wav: 'audio/wav',
};

/** 曲目表裡的一首歌 */
export interface Track {
  /** 歌名 = 檔名去掉副檔名，例如 'music_day' */
  name: string;
  /** 實際要播的網址（已經挑好這台瀏覽器能放的格式） */
  url: string;
}

/**
 * 把「檔案路徑 → 網址」整理成曲目表。
 *
 * 同名不同格式（例如 music_day.ogg 和 music_day.mp3）算同一首，
 * 只留下一個：先去掉瀏覽器不能放的格式，再照 PREFER 的順序挑第一個。
 * 一首歌所有格式都不能放，就不會出現在曲目表裡。
 *
 * 寫成純函式（不碰 <audio>、不碰 Vite），所以可以直接寫單元測試（tests/music.test.ts）。
 *
 * @param files   檔案路徑 → 網址，例如 { '/music/a.mp3': '/assets/a-1234.mp3' }
 * @param canPlay 問瀏覽器能不能放某個 MIME 類型；測試時可以傳 () => true
 * @returns 曲目表，照歌名排序（中文照注音／筆畫順序）
 */
export function buildTracks(files: Record<string, string>, canPlay: (mime: string) => boolean): Track[] {
  // 先依歌名分組：歌名 → 這首歌的所有格式
  const byName = new Map<string, { ext: string; url: string }[]>();
  for (const [path, url] of Object.entries(files)) {
    const file = path.split('/').pop()!; // '/music/music_day.mp3' → 'music_day.mp3'
    const dot = file.lastIndexOf('.');
    const name = file.slice(0, dot); // 'music_day'
    const ext = file.slice(dot + 1).toLowerCase(); // 'mp3'（大寫副檔名也轉成小寫）
    byName.set(name, [...(byName.get(name) ?? []), { ext, url }]);
  }

  // 每首歌挑一個格式：這台瀏覽器能放的裡面，PREFER 排最前面的那個
  const tracks: Track[] = [];
  for (const [name, list] of byName) {
    const best = list
      .filter((f) => canPlay(MIME[f.ext] ?? ''))
      .sort((a, b) => PREFER.indexOf(a.ext) - PREFER.indexOf(b.ext))[0];
    if (best) tracks.push({ name, url: best.url });
  }
  return tracks.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
}

/** 選單上「隨機播放」那一項的值。其他項的值是歌名，所以用空字串跟歌名區分 */
const SHUFFLE = '';

/** localStorage 的鍵。改了這個名字，玩家之前存的設定就讀不到了 */
const STORAGE_KEY = 'potsticker-music';

/**
 * 背景音樂播放器。整個遊戲只建一個（在 main.ts）。
 *
 * 用法：
 *   const music = new Music();   // 建立時就整理好曲目表、讀回上次的設定，但還不會出聲
 *   music.start();               // 在使用者點擊或按鍵時呼叫，才開始放
 *   music.choose('music_day');   // 改成單曲循環這首；choose('') = 隨機
 *   music.next();                // 隨機的下一首
 *   music.setVolume(0.8);        // 音量 0–1
 *   music.toggleMute();          // 靜音／取消靜音
 */
export class Music {
  /** music/ 裡的所有歌（建立時整理一次，之後不變） */
  readonly tracks: Track[];
  /** 現在正在放（或準備要放）的那首；還沒開始放時是 null */
  current: Track | null = null;
  /** 玩家在選單選的：'' = 隨機播放；其他 = 單曲循環的歌名 */
  choice = SHUFFLE;
  /** 音量 0–1（預設一半，背景音樂不要蓋過遊戲） */
  volume = 0.5;
  /** 是否靜音 */
  muted = false;
  /** 換歌時呼叫，讓音樂列更新歌名；由 mountMusicBar 設定 */
  onChange?: () => void;

  /** 真正在放音樂的 <audio>（不放進網頁裡，只在記憶體） */
  private el = new Audio();
  /** 是否已經開始放了（start 被呼叫過）。在這之前所有播放都先不動作 */
  private started = false;

  constructor() {
    // 用這個 <audio> 問瀏覽器能放哪些格式，整理出曲目表
    this.tracks = buildTracks(files, (mime) => this.el.canPlayType(mime) !== '');
    // 讀回上次的設定，套到 <audio> 上
    this.load();
    this.el.volume = this.volume;
    this.el.muted = this.muted;

    // 一首放完：換下一首。
    // 只有隨機模式會觸發 —— 單曲循環時 <audio>.loop = true，放完會自己從頭來，不會發出 ended
    this.el.addEventListener('ended', () => this.next());

    // 切到別的分頁就暫停（不要在背景一直放、一直下載），切回來接著放
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.el.pause();
      else if (this.started) this.el.play().catch(() => {});
    });
  }

  /**
   * 開始放音樂。只有第一次呼叫有作用。
   *
   * 一定要在使用者的點擊或按鍵事件裡呼叫：瀏覽器規定網頁不能自己出聲，
   * 要等使用者跟頁面互動過才行，不然 play() 會被擋下來。
   */
  start() {
    if (this.started) return;
    this.started = true;
    this.play();
  }

  /**
   * 玩家在選單選了「隨機播放」或某一首。
   * @param choice '' = 隨機播放；歌名 = 單曲循環那首
   */
  choose(choice: string) {
    this.choice = choice;
    this.current = null; // 清掉目前這首，讓 play() 重新決定要放哪首
    this.save();
    this.play();
  }

  /** 隨機挑下一首。有兩首以上時不會連放剛剛那首 */
  next() {
    const others = this.tracks.filter((t) => t !== this.current);
    const pool = others.length > 0 ? others : this.tracks; // 只有一首歌時就只能再放它
    this.current = pool[Math.floor(Math.random() * pool.length)] ?? null;
    this.play();
  }

  /**
   * 調音量並記住。
   * @param v 0（無聲）到 1（最大聲）
   */
  setVolume(v: number) {
    this.volume = v;
    this.el.volume = v;
    this.save();
  }

  /** 靜音／取消靜音並記住 */
  toggleMute() {
    this.muted = !this.muted;
    this.el.muted = this.muted;
    this.save();
  }

  /**
   * 照目前的設定放歌。choose、next、start 最後都會走到這裡。
   *
   * 決定放哪首的規則：
   *   - 選了某一首（單曲循環）→ 放那首，並開 loop
   *   - 隨機播放 → 放 current；current 還沒有就先用 next() 抽一首（next 抽完會再呼叫回來）
   */
  private play() {
    if (!this.started || this.tracks.length === 0) return; // 還沒開始、或 music/ 是空的

    const loopTrack = this.tracks.find((t) => t.name === this.choice); // 隨機模式時找不到，是 undefined
    if (loopTrack) this.current = loopTrack;
    if (!this.current) return this.next();

    this.el.loop = !!loopTrack; // 單曲循環才重複；隨機模式要讓它放完觸發 ended

    // 已經在放同一首就不要重設 src，不然會從頭開始。
    // el.src 讀出來是完整網址（http://localhost:5173/...），所以要把 current.url 也轉成完整網址再比
    if (this.el.src !== new URL(this.current.url, location.href).href) this.el.src = this.current.url;

    // 被瀏覽器擋下來（還沒有使用者操作）就算了：之後在選單上換歌、按下一首時會再呼叫一次 play
    this.el.play().catch(() => {});
    this.onChange?.();
  }

  /**
   * 從 localStorage 讀回上次的設定。
   * 讀到的東西不一定可信（舊版、手改過、檔案被刪掉的歌），所以每一項都檢查過才用。
   * 包 try/catch：無痕視窗、iframe 沙箱裡存取 localStorage 可能直接拋例外。
   */
  private load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      // 上次選的歌還在 music/ 裡才用；刪掉了就維持隨機
      if (this.tracks.some((t) => t.name === saved.choice)) this.choice = saved.choice;
      // 音量限制在 0–1
      if (typeof saved.volume === 'number') this.volume = Math.min(1, Math.max(0, saved.volume));
      this.muted = saved.muted === true;
    } catch {
      /* 讀不到或格式壞掉就用預設值 */
    }
  }

  /**
   * 把設定存進 localStorage。
   * 存不進去（無痕視窗、空間滿了）也不影響這次遊戲，只是下次打開會回到預設。
   */
  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice: this.choice, volume: this.volume, muted: this.muted }));
    } catch {
      /* 存不進去就算了，這一輪還是有效 */
    }
  }
}

/**
 * 把畫面下方的音樂列（index.html 裡 id="music" 的那一條）接上播放器。
 * 只在啟動時呼叫一次（main.ts）。
 *
 * 音樂列的元素（都寫在 index.html）：
 *   #music-now    現在放的歌名
 *   #music-track  選單：隨機播放／單曲循環某一首
 *   #music-next   下一首（只有隨機模式顯示）
 *   #music-volume 音量拉桿
 *   #music-mute   靜音按鈕
 *
 * 用一般的 HTML 控制項而不是畫在 Phaser 裡：程式最短，而且手機、鍵盤、螢幕報讀都能直接用。
 */
export function mountMusicBar(music: Music) {
  const bar = document.getElementById('music')!;
  const select = bar.querySelector<HTMLSelectElement>('#music-track')!;
  const next = bar.querySelector<HTMLButtonElement>('#music-next')!;
  const volume = bar.querySelector<HTMLInputElement>('#music-volume')!;
  const mute = bar.querySelector<HTMLButtonElement>('#music-mute')!;
  const now = bar.querySelector<HTMLElement>('#music-now')!;

  // music/ 是空的：只顯示提示，其他控制項藏起來
  if (music.tracks.length === 0) {
    now.textContent = '把 mp3 丟進專案的 music/ 資料夾，重新整理就有音樂';
    for (const el of [select, next, volume, mute]) el.hidden = true;
    return;
  }

  // 填選單：第一項是隨機播放，後面每首歌一項（值是歌名）
  select.add(new Option('隨機播放', SHUFFLE));
  for (const t of music.tracks) select.add(new Option(`單曲循環：${t.name}`, t.name));
  // 顯示上次存的設定
  select.value = music.choice;
  volume.value = String(music.volume);

  /** 依播放器目前的狀態更新音樂列的文字與按鈕 */
  const refresh = () => {
    now.textContent = music.current ? `♪ ${music.current.name}` : '點一下畫面開始播放';
    next.hidden = music.choice !== SHUFFLE; // 單曲循環時「下一首」沒意義，藏起來
    mute.textContent = music.muted ? '取消靜音' : '靜音';
  };
  music.onChange = refresh; // 播放器換歌時（包括一首放完自動換）也會更新
  refresh();

  // 玩家操作 → 呼叫播放器
  select.addEventListener('change', () => music.choose(select.value));
  next.addEventListener('click', () => music.next());
  volume.addEventListener('input', () => music.setVolume(Number(volume.value))); // 拖動時即時改
  mute.addEventListener('click', () => {
    music.toggleMute();
    refresh(); // 靜音不會換歌、不會觸發 onChange，所以自己更新按鈕文字
  });
}
