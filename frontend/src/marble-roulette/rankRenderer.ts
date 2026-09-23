import type { Marble } from './marble';
import type { WinnerRange } from './options';
import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';

export class RankRenderer implements UIObject {
  private _currentY = 0;
  private _targetY = 0;
  private fontHeight = 16;
  private _userMoved = 0;
  private _currentWinner = -1;
  private maxY = 0;
  private winners: Marble[] = [];
  private marbles: Marble[] = [];
  private winnerRange: WinnerRange = { start: 0, end: 0 };
  private messageHandler?: (msg: string) => void;

  // 화살표 필드로 바인딩한다 -- addUiObject가 `canvas.addEventListener('wheel', obj.onWheel)`처럼
  // 메서드를 그냥 뜯어서 넘기므로(this 유실) 일반 메서드로 두면 안 된다. 원본은 레거시
  // 데코레이터(@bound)로 같은 효과를 냈는데, 우리 tsconfig는 experimentalDecorators가 꺼져있어
  // 그 문법이 컴파일 에러가 난다.
  onWheel = (e: WheelEvent) => {
    this._targetY += e.deltaY;
    if (this._targetY > this.maxY) {
      this._targetY = this.maxY;
    }
    this._userMoved = 2000;
  };

  // onDblClick은 항상 `obj.onDblClick(...)` 메서드 호출 형태로만 불려서(roulette.ts의
  // mouseHandler) this가 자동으로 맞다 -- 바인딩 불필요.
  onDblClick(e?: MouseEventArgs) {
    if (e) {
      if (navigator.clipboard) {
        const tsv: string[] = [];
        let rank = 0;
        tsv.push(
          ...[...this.winners, ...this.marbles].map((m) => {
            rank++;
            return [rank.toString(), m.name, this.isWinningRank(rank - 1) ? '☆' : ''].join('\t');
          })
        );

        tsv.unshift(['Rank', 'Name', 'Winner'].join('\t'));

        navigator.clipboard.writeText(tsv.join('\n')).then(() => {
          if (this.messageHandler) {
            this.messageHandler('The result has been copied');
          }
        });
      }
    }
  }

  private isWinningRank(rank: number) {
    return rank >= this.winnerRange.start && rank <= this.winnerRange.end;
  }

  onMessage(func: (msg: string) => void) {
    this.messageHandler = func;
  }

  render(
    ctx: CanvasRenderingContext2D,
    { winners, marbles, winnerRange, theme }: RenderParameters,
    width: number,
    height: number
  ) {
    const startX = width - 5;
    const startY = Math.max(-this.fontHeight, this._currentY - height / 2);
    this.maxY = Math.max(0, (marbles.length + winners.length) * this.fontHeight + this.fontHeight);
    this._currentWinner = winners.length;

    this.winners = winners;
    this.marbles = marbles;
    this.winnerRange = winnerRange;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '10pt sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText(`${winners.length} / ${winners.length + marbles.length}`, width - 5, this.fontHeight);

    ctx.beginPath();
    ctx.rect(width - 150, this.fontHeight + 2, width, this.maxY);
    ctx.clip();

    ctx.translate(0, -startY);

    if (winnerRange.end > winnerRange.start) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
      const bandY = winnerRange.start * this.fontHeight + this.fontHeight / 2;
      const bandH = (winnerRange.end - winnerRange.start + 1) * this.fontHeight;
      ctx.fillRect(width - 150, bandY, 150, bandH);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
      ctx.fillRect(width - 150, bandY, 3, bandH);
    }

    ctx.font = 'bold 11pt sans-serif';
    if (theme.rankStroke) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.rankStroke;
    }
    winners.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = rank * this.fontHeight;
      if (y >= startY && y <= startY + ctx.canvas.height) {
        ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness}`;
        ctx.strokeText(`${this.isWinningRank(rank) ? '☆' : '✔'} ${marble.name} #${rank + 1}`, startX, 20 + y);
        ctx.fillText(`${this.isWinningRank(rank) ? '☆' : '✔'} ${marble.name} #${rank + 1}`, startX, 20 + y);
      }
    });
    ctx.font = '10pt sans-serif';
    marbles.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = (rank + winners.length) * this.fontHeight;
      if (y >= startY && y <= startY + ctx.canvas.height) {
        ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness}`;
        ctx.strokeText(`${marble.name} #${rank + 1 + winners.length}`, startX, 20 + y);
        ctx.fillText(`${marble.name} #${rank + 1 + winners.length}`, startX, 20 + y);
      }
    });
    ctx.restore();
  }

  update(deltaTime: number) {
    if (this._currentWinner === -1) {
      return;
    }
    if (this._userMoved > 0) {
      this._userMoved -= deltaTime;
    } else {
      this._targetY = this._currentWinner * this.fontHeight + this.fontHeight;
    }
    if (this._currentY !== this._targetY) {
      this._currentY += (this._targetY - this._currentY) * (deltaTime / 250);
    }
    if (Math.abs(this._currentY - this._targetY) < 1) {
      this._currentY = this._targetY;
    }
  }

  getBoundingBox(): Rect | null {
    return null;
  }
}
