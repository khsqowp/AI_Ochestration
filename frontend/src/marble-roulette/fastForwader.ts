import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';

export class FastForwader implements UIObject {
  private bound: Rect = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };

  private isEnabled: boolean = false;

  public get speed(): number {
    return this.isEnabled ? 2 : 1;
  }

  update(_deltaTime: number): void {}

  // 원본은 SVG 아이콘 이미지를 에셋으로 로드해서 그렸다. 스트리머 채널 전용 이미지 자산이라
  // 가져올 게 없어서, 같은 자리에 캔버스로 이중 삼각형(▶▶)을 직접 그린다.
  render(ctx: CanvasRenderingContext2D, _params: RenderParameters, width: number, height: number): void {
    this.bound.w = width / 2;
    this.bound.h = height / 2;
    this.bound.x = this.bound.w / 2;
    this.bound.y = this.bound.h / 2;

    const centerX = this.bound.x + this.bound.w / 2;
    const centerY = this.bound.y + this.bound.h / 2;

    if (this.isEnabled) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'white';
      const s = 40;
      for (const offset of [-s * 0.55, s * 0.55]) {
        ctx.beginPath();
        ctx.moveTo(centerX + offset - s / 2, centerY - s / 2);
        ctx.lineTo(centerX + offset - s / 2, centerY + s / 2);
        ctx.lineTo(centerX + offset + s / 2, centerY);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  getBoundingBox(): Rect | null {
    return this.bound;
  }

  // 영역 밖에서 누르면 mouseHandler 가 undefined 를 넘긴다. 그때도 켜지면 캔버스 어디를 눌러도 2배속이 된다
  onMouseDown?(e?: MouseEventArgs): void {
    this.isEnabled = e !== undefined;
  }

  onMouseUp?(_e?: MouseEventArgs): void {
    this.isEnabled = false;
  }
}
