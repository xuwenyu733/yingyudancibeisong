<template>
  <view class="study">
    <view class="bar">
      <view class="exit" @click="backHome">← 退出练习</view>
      <view class="brand">
        <text class="brand-title">单词闯关</text>
        <text class="brand-sub">小学 · 初中</text>
      </view>
    </view>

    <view class="track-row">
      <view class="progress"><view class="progress-fill" :style="{ width: progressPct }" /></view>
      <text class="muted">第 {{ Math.min(index + 1, words.length || 1) }} / {{ words.length || 0 }} 题</text>
      <text class="tag">{{ queueLabel }} · {{ modeLabel }}</text>
    </view>

    <view v-if="loading" class="card">正在出题...</view>
    <view v-else-if="!current" class="card empty">
      <view class="heading">这一关暂时没有单词</view>
      <text class="muted">{{
        sessionMode === "review"
          ? "今天没有到期复习，也没有弱词哦～"
          : "可能是今日额度用完，或这一单元还未解锁。"
      }}</text>
      <button class="btn action" @click="backHome">返回</button>
    </view>
    <view v-else>
      <view class="prompt">{{ promptText }} ✨</view>

      <view class="box-row">
        <text class="box-label">掌握度</text>
        <view class="dots">
          <view v-for="n in 5" :key="n" class="dot" :class="{ on: n <= displayBox }" />
        </view>
      </view>

      <view class="card quiz">
        <text class="tag green">认识新单词</text>

        <!-- 看词选义：只露英文，中文在选项里选 -->
        <template v-if="mode === 'read' && !picked">
          <view class="spell">{{ current.spelling }}</view>
          <text class="phonetic">{{ current.phonetic }}</text>
          <button class="play small" @click="replay">🔊 听发音</button>
        </template>

        <!-- 听音选义：不露拼写与中文 -->
        <template v-else-if="mode === 'listen' && !picked">
          <view class="spell ghost">？？？</view>
          <button class="play" @click="replay">🔊 再听一遍</button>
          <text class="phonetic">听发音，选出正确中文</text>
        </template>

        <!-- 英译汉默写：只露英文 -->
        <template v-else-if="mode === 'en2zh' && !picked">
          <view class="spell">{{ current.spelling }}</view>
          <text class="phonetic">{{ current.phonetic }}</text>
          <button class="play small" @click="replay">🔊 听发音</button>
          <text class="hint">写出中文意思（义项接近即可）</text>
        </template>

        <!-- 汉译英默写：只露中文 -->
        <template v-else-if="mode === 'zh2en' && !picked">
          <view class="meaning">{{ current.meaning }}</view>
          <text class="blank">{{ clozeHint }}</text>
          <button class="play small" @click="replay">🔊 听发音</button>
          <text class="hint">根据释义与例句，写出英文单词</text>
        </template>

        <!-- 作答后揭晓 -->
        <template v-else>
          <view class="spell">{{ current.spelling }}</view>
          <text class="phonetic">{{ current.phonetic }}</text>
          <text class="meaning-line">{{ current.meaning }}</text>
          <text v-if="isTypedMode && !lastCorrect" class="your-answer">
            你的答案：{{ picked }}
          </text>
          <text class="example">{{ current.example }}</text>
        </template>
      </view>

      <view v-if="isTypedMode && !picked" class="write-box">
        <input
          class="write-input"
          type="text"
          :value="typed"
          :focus="true"
          :placeholder="mode === 'en2zh' ? '输入中文释义' : '输入英文单词'"
          confirm-type="done"
          @input="onType"
          @confirm="submitTyped"
        />
        <button class="btn submit" :disabled="!typed.trim()" @click="submitTyped">提交</button>
      </view>

      <!-- 作答后仍保留选项，方便对照哪题对/错 -->
      <view v-else-if="!isTypedMode && options.length" class="choices">
        <button
          v-for="(option, optionIndex) in options"
          :key="option"
          class="choice"
          :class="choiceClass(option)"
          :disabled="!!picked"
          @click="choose(option)"
        >
          <text class="letter">{{ letters[optionIndex] }}</text>
          <text>{{ option }}</text>
        </button>
      </view>

      <view v-if="awaitingRating" class="rate-card card">
        <text class="rate-title">{{ lastCorrect ? "这个词你感觉怎么样？" : "看清正确答案后再继续" }}</text>
        <view class="rate-row">
          <button class="rate again" @click="rate(1)">😵 不认识</button>
          <button class="rate hard" :disabled="!lastCorrect" @click="rate(2)">🤔 模糊</button>
          <button class="rate good" :disabled="!lastCorrect" @click="rate(3)">😊 认识</button>
        </view>
        <text v-if="!lastCorrect" class="muted tip">答错会回到第 1 格；点「不认识」进入下一题</text>
      </view>

    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import {
  fetchReview,
  fetchToday,
  fetchUnitWords,
  submitSession,
} from "../../api";
import type { MasteryRating, Word } from "../../types/api";
import { playWordAudio, stopWordAudio } from "../../utils/audio";
import { errorMessage } from "../../utils/format";
import {
  blankExampleSentence,
  judgeEnToZh,
  judgeZhToEn,
  sameMeaningPeers,
} from "../../utils/quizJudge";
import { saveWrongDetails, type WrongDetail } from "../../utils/sessionReport";

type QuizMode = "read" | "listen" | "en2zh" | "zh2en";

const words = ref<Word[]>([]);
const index = ref(0);
const options = ref<string[]>([]);
const picked = ref("");
const typed = ref("");
const lastCorrect = ref(false);
const awaitingRating = ref(false);
const liveBox = ref(0);
const clozeHint = ref("");
const mode = ref<QuizMode>("read");
const sessionMode = ref<"normal" | "review">("normal");
const answers = ref<{ wordId: string; correct: boolean; rating: MasteryRating }[]>(
  [],
);
const wrongDetails = ref<WrongDetail[]>([]);
const loading = ref(true);
const letters = ["A", "B", "C", "D"];
let timer = 0;

const current = computed(() => words.value[index.value]);
const progressPct = computed(() => {
  if (!words.value.length) return "0%";
  return `${Math.round(((index.value + (picked.value ? 1 : 0)) / words.value.length) * 100)}%`;
});
const isTypedMode = computed(
  () => mode.value === "en2zh" || mode.value === "zh2en",
);
const displayBox = computed(() => {
  if (liveBox.value > 0) return liveBox.value;
  return current.value?.box || 0;
});
const queueLabel = computed(() => {
  const kind = current.value?.queueKind;
  if (kind === "review") return "到期复习";
  if (kind === "new") return "新词";
  return sessionMode.value === "review" ? "复习" : "闯关";
});
const modeLabel = computed(() => {
  const labels: Record<QuizMode, string> = {
    read: "看词选义",
    listen: "听音选义",
    en2zh: "英译汉",
    zh2en: "汉译英",
  };
  return labels[mode.value];
});
const promptText = computed(() => {
  if (mode.value === "listen") return "听发音，选择正确的中文意思";
  if (mode.value === "en2zh") return "看英文，写出中文意思";
  if (mode.value === "zh2en") return "看中文，写出英文单词";
  return "看英文，选择正确的中文意思";
});

onLoad((query) => {
  const unitId = typeof query?.unitId === "string" ? query.unitId : "";
  const review = query?.mode === "review";
  sessionMode.value = review ? "review" : "normal";
  void load(unitId, review);
});

onUnload(() => {
  if (timer) clearTimeout(timer);
  stopWordAudio();
});

async function load(unitId: string, review = false) {
  loading.value = true;
  try {
    if (review) {
      const result = await fetchReview();
      words.value = result.words;
    } else {
      const today = await fetchToday();
      if (unitId) {
        const result = await fetchUnitWords(unitId);
        words.value = result.words.slice(0, today.remaining).map((w) => ({
          ...w,
          queueKind: w.queueKind || "new",
          box: w.box || 0,
        }));
      } else {
        words.value = today.words;
      }
    }
    prepare();
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
    words.value = [];
  } finally {
    loading.value = false;
  }
}

function prepare() {
  const word = current.value;
  if (!word) return;
  const modes: QuizMode[] = ["read", "listen", "en2zh", "zh2en"];
  mode.value = modes[index.value % 4];
  typed.value = "";
  lastCorrect.value = false;
  awaitingRating.value = false;
  liveBox.value = word.box || 0;
  picked.value = "";
  clozeHint.value =
    mode.value === "zh2en"
      ? blankExampleSentence(word.example, word.spelling)
      : "";
  options.value =
    mode.value === "read" || mode.value === "listen"
      ? buildMeaningOptions(word)
      : [];
  if (mode.value === "listen" || mode.value === "zh2en" || mode.value === "en2zh") {
    setTimeout(() => playWordAudio(word), 200);
  }
}

function buildMeaningOptions(word: Word) {
  const pool = words.value
    .map((item) => item.meaning)
    .filter((item) => item !== word.meaning);
  const extras = [...new Set([...pool, "苹果", "学校", "小猫", "铅笔"])].slice(
    0,
    3,
  );
  return shuffle([word.meaning, ...extras]);
}

function onType(event: { detail?: { value?: string } }) {
  typed.value = event.detail?.value ?? "";
}

function openRating(word: Word, correct: boolean, userAnswer: string) {
  lastCorrect.value = correct;
  picked.value = userAnswer;
  awaitingRating.value = true;
  if (!correct) {
    wrongDetails.value.push({
      wordId: word.id,
      spelling: word.spelling,
      meaning: word.meaning,
      mode: mode.value,
      userAnswer,
    });
  }
}

function rate(rating: MasteryRating) {
  const word = current.value;
  if (!word || !awaitingRating.value) return;
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  awaitingRating.value = false;

  // 本地预估格子变化，给即时反馈
  const prev = word.box || 0;
  if (rating === 1) liveBox.value = 1;
  else if (rating === 2) liveBox.value = Math.max(1, prev - 1);
  else liveBox.value = Math.min(5, Math.max(1, prev) + 1);

  answers.value.push({
    wordId: word.id,
    correct: rating >= 2,
    rating,
  });

  timer = setTimeout(() => {
    if (index.value + 1 >= words.value.length) {
      void finish();
      return;
    }
    index.value += 1;
    prepare();
  }, 450) as unknown as number;
}

function choose(option: string) {
  const word = current.value;
  if (!word || picked.value) return;
  openRating(word, option === word.meaning, option);
}

function submitTyped() {
  const word = current.value;
  if (!word || picked.value) return;
  const input = typed.value.trim();
  if (!input) {
    uni.showToast({ title: "请先输入答案", icon: "none" });
    return;
  }
  let correct = false;
  if (mode.value === "en2zh") {
    correct = judgeEnToZh(input, word.meaning);
  } else {
    const peers = sameMeaningPeers(
      { id: word.id, spelling: word.spelling, meaning: word.meaning },
      words.value,
    );
    correct = judgeZhToEn(input, word.spelling, peers);
  }
  openRating(word, correct, input);
}

async function finish() {
  try {
    saveWrongDetails(wrongDetails.value);
    const result = await submitSession(answers.value, sessionMode.value);
    const qs = [
      `correct=${result.correct}`,
      `total=${result.total}`,
      `mode=${sessionMode.value}`,
      `earned=${result.earnedPoints || 0}`,
      `balance=${result.balance ?? ""}`,
      `eventId=${encodeURIComponent(result.eventId || "")}`,
      `learned=${result.learned || 0}`,
      `reviewed=${result.reviewed || 0}`,
    ].join("&");
    uni.redirectTo({ url: `/pages/study/result?${qs}` });
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  }
}

function choiceClass(option: string) {
  if (!picked.value || !current.value) return "";
  if (option === current.value.meaning) return "right";
  if (option === picked.value) return "wrong";
  return "";
}

function replay() {
  if (current.value) playWordAudio(current.value);
}

function backHome() {
  if (sessionMode.value === "review") {
    uni.switchTab({ url: "/pages/wrong/index" });
    return;
  }
  uni.switchTab({ url: "/pages/home/index" });
}

function shuffle(list: string[]) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const left = next[i];
    next[i] = next[j];
    next[j] = left;
  }
  return next;
}
</script>

<style scoped>
.study {
  min-height: 100vh;
  padding: calc(
      24rpx + max(
        var(--status-bar-height, 0px),
        var(--app-status-bar, 0px),
        env(safe-area-inset-top, 0px)
      )
    )
    28rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background:
    radial-gradient(900rpx 320rpx at 10% 0%, #fff6df 0%, transparent 55%),
    linear-gradient(180deg, #fbfaf7 0%, #eef6ef 100%);
}

.bar {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  width: 100%;
}

.brand {
  flex: none;
  margin-left: auto;
  text-align: right;
}

.brand-title {
  display: block;
  font-weight: 800;
  font-size: 28rpx;
}

.brand-sub {
  display: block;
  color: #6b7c8f;
  font-size: 20rpx;
}

.exit {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #1d3557;
  font-size: 24rpx;
  font-weight: 700;
  border: 2rpx solid #e6eee9;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 18rpx 0 22rpx;
}

.track-row .progress {
  flex: 1;
}

.prompt {
  text-align: center;
  font-size: 36rpx;
  font-weight: 800;
  margin-bottom: 16rpx;
}

.box-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.box-label {
  font-size: 22rpx;
  color: #6b7c8f;
  font-weight: 700;
}

.dots {
  display: flex;
  gap: 10rpx;
}

.dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  background: #e6eee9;
}

.dot.on {
  background: #2eb086;
}

.quiz {
  position: relative;
  text-align: center;
  padding: 36rpx 28rpx 48rpx;
  overflow: hidden;
  background: linear-gradient(180deg, #fff 0%, #f7fcf9 100%);
}

.spell {
  font-size: 68rpx;
  font-weight: 800;
  color: #1d3557;
}

.spell.ghost {
  color: #9ab0a4;
}

.meaning {
  font-size: 48rpx;
  font-weight: 800;
}

.blank {
  display: block;
  margin-top: 20rpx;
  font-size: 28rpx;
  line-height: 1.5;
  color: #249672;
  font-weight: 600;
}

.meaning-line {
  display: block;
  margin-top: 12rpx;
  font-size: 32rpx;
  color: #1d3557;
}

.your-answer {
  display: block;
  margin-top: 12rpx;
  color: #ff5d8f;
  font-size: 28rpx;
}

.play {
  margin: 20rpx auto 0;
  width: 240rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 999rpx;
  background: #fff;
  color: #249672;
  font-size: 26rpx;
  font-weight: 700;
  border: 3rpx solid #c9e8da;
}

.play.small {
  width: 200rpx;
}

.phonetic,
.example,
.hint,
.tip {
  display: block;
  margin-top: 12rpx;
  color: #6b7c8f;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
  margin-top: 8rpx;
}

.choice {
  min-height: 100rpx;
  margin: 0;
  padding: 0 18rpx;
  display: flex;
  align-items: center;
  gap: 14rpx;
  background: #ffffff;
  color: #1d3557;
  border-radius: 24rpx;
  font-size: 28rpx;
  border: 3rpx solid #e6eee9;
  font-weight: 700;
  text-align: left;
}

.letter {
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  background: #e8f7f0;
  color: #249672;
  text-align: center;
  line-height: 44rpx;
  font-size: 22rpx;
  flex-shrink: 0;
}

.right {
  background: #e8f8ee;
  color: #15803d;
  border-color: #9ad7b5;
}

.wrong {
  background: #fdecec;
  color: #b91c1c;
  border-color: #f0b4b4;
}

.rate-card {
  text-align: center;
  margin-top: 8rpx;
}

.rate-title {
  display: block;
  font-weight: 800;
  margin-bottom: 20rpx;
}

.rate-row {
  display: flex;
  gap: 12rpx;
}

.rate {
  flex: 1;
  height: 96rpx;
  line-height: 1.2;
  padding: 18rpx 8rpx;
  border-radius: 24rpx;
  font-size: 24rpx;
  font-weight: 700;
  background: #f7faf8;
  color: #1d3557;
  border: 3rpx solid #e6eee9;
}

.rate.again {
  background: #fff0f3;
  border-color: #ffc9d6;
  color: #ff5d8f;
}

.rate.hard {
  background: #fff7e0;
  border-color: #ffe29a;
  color: #c98500;
}

.rate.good {
  background: #e8f7f0;
  border-color: #9ad7b5;
  color: #249672;
}

.rate[disabled] {
  opacity: 0.35;
}

.write-box {
  margin-top: 20rpx;
}

.write-input {
  height: 96rpx;
  padding: 0 28rpx;
  border-radius: 28rpx;
  background: #ffffff;
  border: 3rpx solid #e6eee9;
  font-size: 34rpx;
  text-align: center;
}

.submit {
  margin-top: 20rpx;
}

.heading {
  font-size: 36rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}

.empty {
  text-align: center;
  padding: 48rpx 24rpx;
}

.action {
  margin-top: 28rpx;
}
</style>
