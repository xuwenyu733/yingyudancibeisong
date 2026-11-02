<template>
  <view class="page">
    <view v-if="loading" class="card">正在出题...</view>
    <view v-else-if="!current" class="card">
      <view class="heading">这一关暂时没有单词</view>
      <text class="muted">{{
        sessionMode === "review"
          ? "今天没有到期复习，也没有弱词哦～"
          : "可能是今日额度用完，或这一单元还未解锁。"
      }}</text>
      <button class="btn action" @click="backHome">返回首页</button>
    </view>
    <view v-else>
      <view class="top">
        <text>{{ index + 1 }}/{{ words.length }}</text>
        <text>{{ queueLabel }} · {{ modeLabel }}</text>
      </view>

      <view class="box-row">
        <text class="box-label">掌握度</text>
        <view class="dots">
          <view
            v-for="n in 5"
            :key="n"
            class="dot"
            :class="{ on: n <= displayBox }"
          />
        </view>
      </view>

      <view class="card quiz">
        <template v-if="mode === 'en2zh' && !picked">
          <view class="spell">{{ current.spelling }}</view>
          <text class="phonetic">{{ current.phonetic }}</text>
          <button class="play small" @click="replay">▶ 听发音</button>
          <text class="hint">写出中文意思（义项接近即可）</text>
        </template>

        <template v-else-if="mode === 'zh2en' && !picked">
          <view class="meaning">{{ current.meaning }}</view>
          <text class="blank">{{ clozeHint }}</text>
          <button class="play small" @click="replay">▶ 听发音</button>
          <text class="hint">根据释义与例句，写出英文单词</text>
        </template>

        <template v-else-if="mode === 'read' || picked">
          <view class="spell">{{ current.spelling }}</view>
          <text class="phonetic">{{ current.phonetic }}</text>
          <text class="meaning-line">{{ current.meaning }}</text>
          <text v-if="picked && isTypedMode && !lastCorrect" class="your-answer">
            你的答案：{{ picked }}
          </text>
        </template>

        <template v-else>
          <button class="play" @click="replay">▶ 再听一遍</button>
          <text class="phonetic">听发音，选出正确中文</text>
        </template>

        <text v-if="picked" class="example">{{ current.example }}</text>
      </view>

      <view v-if="awaitingRating" class="rate-card card">
        <text class="rate-title">这个词你感觉怎么样？</text>
        <view class="rate-row">
          <button class="rate again" @click="rate(1)">😵 不认识</button>
          <button class="rate hard" :disabled="!lastCorrect" @click="rate(2)">
            🤔 模糊
          </button>
          <button class="rate good" :disabled="!lastCorrect" @click="rate(3)">
            😊 认识
          </button>
        </view>
        <text v-if="!lastCorrect" class="muted tip"
          >答错了会回到第 1 格，明天还会见面哦～</text
        >
      </view>

      <view v-else-if="isTypedMode && !picked" class="write-box">
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
        <button class="btn submit" :disabled="!typed.trim()" @click="submitTyped">
          提交
        </button>
      </view>

      <template v-else-if="!isTypedMode && !picked">
        <button
          v-for="option in options"
          :key="option"
          class="choice"
          :class="choiceClass(option)"
          :disabled="!!picked"
          @click="choose(option)"
        >
          {{ option }}
        </button>
      </template>
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
let timer = 0;

const current = computed(() => words.value[index.value]);
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
    // 答错默认进「不认识」，稍停一下让孩子看清答案
    timer = setTimeout(() => rate(1), 900) as unknown as number;
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

function backWrong() {
  uni.navigateTo({ url: "/pages/wrong/index" });
}

function backHome() {
  if (sessionMode.value === "review") {
    backWrong();
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
.top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
  color: #7a8499;
  font-weight: 600;
  font-size: 24rpx;
}

.box-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.box-label {
  font-size: 22rpx;
  color: #7a8499;
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
  background: #ffe0d4;
}

.dot.on {
  background: linear-gradient(135deg, #ffc857, #ff6b6b);
}

.quiz {
  text-align: center;
  padding: 56rpx 32rpx;
  background: linear-gradient(180deg, #fff9f5 0%, #ffffff 55%);
}

.spell {
  font-size: 68rpx;
  font-weight: 800;
  color: #2b3550;
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
  color: #ff6b6b;
  font-weight: 600;
}

.meaning-line {
  display: block;
  margin-top: 12rpx;
  font-size: 32rpx;
  color: #2b3550;
}

.your-answer {
  display: block;
  margin-top: 12rpx;
  color: #ff5d8f;
  font-size: 28rpx;
}

.play {
  margin: 0 auto;
  width: 280rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: #e6fbf7;
  color: #1aa894;
  font-size: 30rpx;
  font-weight: 700;
  border: 3rpx solid #b8f0e6;
}

.play.small {
  margin-top: 24rpx;
  width: 220rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 26rpx;
}

.phonetic,
.example,
.hint,
.tip {
  display: block;
  margin-top: 12rpx;
  color: #7a8499;
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
  background: #fff4ef;
  color: #2b3550;
  border: 3rpx solid #ffe0d4;
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
  background: #e6fbf7;
  border-color: #9aefe4;
  color: #1aa894;
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
  border: 3rpx solid #ffd4c8;
  font-size: 34rpx;
  text-align: center;
}

.submit {
  margin-top: 20rpx;
}

.choice {
  margin-top: 20rpx;
  background: #ffffff;
  color: #2b3550;
  border-radius: 28rpx;
  height: 96rpx;
  line-height: 96rpx;
  font-size: 30rpx;
  border: 3rpx solid #ffe0d4;
  font-weight: 600;
}

.right {
  background: #e6fbf7;
  color: #1aa894;
  border-color: #9aefe4;
}

.wrong {
  background: #fff0f3;
  color: #ff5d8f;
  border-color: #ffc9d6;
}

.heading {
  font-size: 36rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}

.action {
  margin-top: 28rpx;
}
</style>
