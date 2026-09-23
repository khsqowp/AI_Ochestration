import { pad } from './utils';

export class VideoRecorder {
  private targetCanvas: HTMLCanvasElement;
  private mediaRecorder: MediaRecorder;
  private videoStream: MediaStream;

  private chunks: Blob[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.targetCanvas = canvas;
    this.videoStream = this.targetCanvas.captureStream();
    this.mediaRecorder = new MediaRecorder(this.videoStream, {
      videoBitsPerSecond: 6000000,
    });
  }

  public get isRecording() {
    return this.mediaRecorder.state === 'recording';
  }

  public async start() {
    if (this.isRecording) return;
    return new Promise<void>((rs) => {
      this.chunks = [];
      this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
        this.chunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'video/mp4' });
        const videoUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        const d = new Date();

        // 'marble_roulette_' 아님 -- lazygyu/roulette MIT 라이선스는 소스코드에만 적용되고
        // 'Marble Roulette'/'마블 룰렛' 이름 자체는 상표라 우리 산출물엔 못 쓴다.
        downloadLink.href = videoUrl;
        downloadLink.download = `lunch_roulette_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.mp4`;
        downloadLink.click();
        downloadLink.remove();
        URL.revokeObjectURL(videoUrl);
      };
      this.mediaRecorder.onstart = () => {
        rs();
      };
      this.mediaRecorder.start();
    });
  }

  public stop() {
    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }
}
