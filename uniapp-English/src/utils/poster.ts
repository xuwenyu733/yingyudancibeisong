import type { WeeklyReport } from "../types/api";

export interface PosterPayload {
  title: string;
  report: WeeklyReport;
}

type Ctx = UniApp.CanvasContext;

function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWeeklyPoster(ctx: Ctx, payload: PosterPayload) {
  const { title, report } = payload;
  const width = 600;
  const height = 900;

  ctx.setFillStyle("#F3F6FB");
  ctx.fillRect(0, 0, width, height);

  ctx.setFillStyle("#3D7EFF");
  roundRect(ctx, 40, 40, 80, 80, 20);
  ctx.fill();
  ctx.setFillStyle("#FFFFFF");
  ctx.setFontSize(40);
  ctx.fillText("词", 62, 94);

  ctx.setFillStyle("#172033");
  ctx.setFontSize(28);
  ctx.fillText("小学单词闯关", 140, 74);
  ctx.setFillStyle("#6B7689");
  ctx.setFontSize(22);
  ctx.fillText("近 7 天学习报告", 140, 108);

  ctx.setFillStyle("#FFFFFF");
  roundRect(ctx, 40, 160, 520, 620, 24);
  ctx.fill();

  ctx.setFillStyle("#172033");
  ctx.setFontSize(34);
  ctx.fillText(title.slice(0, 14), 70, 220);

  const stats = [
    { label: "词次", value: String(report.studiedCount) },
    { label: "正确率", value: `${report.accuracy}%` },
    { label: "连续", value: `${report.streak}天` },
  ];
  stats.forEach((item, i) => {
    const x = 70 + i * 160;
    ctx.setFillStyle("#3D7EFF");
    ctx.setFontSize(40);
    ctx.fillText(item.value, x, 310);
    ctx.setFillStyle("#6B7689");
    ctx.setFontSize(22);
    ctx.fillText(item.label, x, 348);
  });

  const max = Math.max(1, ...report.daily.map((d) => d.count));
  report.daily.forEach((item, i) => {
    const x = 78 + i * 66;
    const h = Math.max(8, Math.round((item.count / max) * 160));
    const y = 560 - h;
    ctx.setFillStyle("#3D7EFF");
    roundRect(ctx, x, y, 28, h, 10);
    ctx.fill();
    ctx.setFillStyle("#6B7689");
    ctx.setFontSize(16);
    ctx.fillText(item.date.slice(5), x - 4, 590);
  });

  ctx.setFillStyle("#172033");
  ctx.setFontSize(26);
  ctx.fillText("薄弱词", 70, 650);
  const wrongs = report.wrongTop.slice(0, 3);
  if (wrongs.length === 0) {
    ctx.setFillStyle("#6B7689");
    ctx.setFontSize(22);
    ctx.fillText("最近没有反复出错的词", 70, 700);
  } else {
    wrongs.forEach((word, i) => {
      ctx.setFillStyle("#172033");
      ctx.setFontSize(22);
      ctx.fillText(`${word.spelling} · ${word.meaning}`, 70, 700 + i * 36);
      ctx.setFillStyle("#D97706");
      ctx.fillText(`错${word.wrongCount}`, 460, 700 + i * 36);
    });
  }

  ctx.setFillStyle("#6B7689");
  ctx.setFontSize(20);
  ctx.fillText("坚持每天一点，进步看得见", 160, 840);
}
