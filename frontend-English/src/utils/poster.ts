import type { WeeklyReport } from '../types/api'

export interface PosterPayload {
  title: string
  report: WeeklyReport
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function drawWeeklyPoster(ctx: CanvasRenderingContext2D, payload: PosterPayload) {
  const { title, report } = payload
  const width = 600
  const height = 900

  ctx.fillStyle = '#F3F6FB'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#3D7EFF'
  roundRect(ctx, 40, 40, 80, 80, 20)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '700 40px sans-serif'
  ctx.fillText('词', 62, 94)

  ctx.fillStyle = '#172033'
  ctx.font = '700 28px sans-serif'
  ctx.fillText('小学单词闯关', 140, 74)
  ctx.fillStyle = '#6B7689'
  ctx.font = '22px sans-serif'
  ctx.fillText('近 7 天学习报告', 140, 108)

  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, 40, 160, 520, 620, 24)
  ctx.fill()

  ctx.fillStyle = '#172033'
  ctx.font = '700 34px sans-serif'
  ctx.fillText(title.slice(0, 14), 70, 220)

  const stats = [
    { label: '词次', value: String(report.studiedCount) },
    { label: '正确率', value: `${report.accuracy}%` },
    { label: '连续', value: `${report.streak}天` },
  ]
  stats.forEach((item, i) => {
    const x = 70 + i * 160
    ctx.fillStyle = '#3D7EFF'
    ctx.font = '700 40px sans-serif'
    ctx.fillText(item.value, x, 310)
    ctx.fillStyle = '#6B7689'
    ctx.font = '22px sans-serif'
    ctx.fillText(item.label, x, 348)
  })

  const max = Math.max(1, ...report.daily.map((d) => d.count))
  report.daily.forEach((item, i) => {
    const x = 78 + i * 66
    const h = Math.max(8, Math.round((item.count / max) * 160))
    const y = 560 - h
    ctx.fillStyle = '#3D7EFF'
    roundRect(ctx, x, y, 28, h, 10)
    ctx.fill()
    ctx.fillStyle = '#6B7689'
    ctx.font = '16px sans-serif'
    ctx.fillText(item.date.slice(5), x - 4, 590)
  })

  ctx.fillStyle = '#172033'
  ctx.font = '700 26px sans-serif'
  ctx.fillText('薄弱词', 70, 650)
  const wrongs = report.wrongTop.slice(0, 3)
  if (wrongs.length === 0) {
    ctx.fillStyle = '#6B7689'
    ctx.font = '22px sans-serif'
    ctx.fillText('最近没有反复出错的词', 70, 700)
  } else {
    wrongs.forEach((word, i) => {
      ctx.fillStyle = '#172033'
      ctx.font = '22px sans-serif'
      ctx.fillText(`${word.spelling} · ${word.meaning}`, 70, 700 + i * 36)
      ctx.fillStyle = '#D97706'
      ctx.fillText(`错${word.wrongCount}`, 460, 700 + i * 36)
    })
  }

  ctx.fillStyle = '#6B7689'
  ctx.font = '20px sans-serif'
  ctx.fillText('坚持每天一点，进步看得见', 160, 840)
}

export function createWeeklyPosterDataUrl(payload: PosterPayload) {
  const canvas = document.createElement('canvas')
  canvas.width = 600
  canvas.height = 900
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持海报生成')
  drawWeeklyPoster(ctx, payload)
  return canvas.toDataURL('image/png')
}
