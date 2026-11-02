import { Plan, Textbook, Unit, Word } from '../domain/types';

/** 演示词库，上线前换成自有版权词表，不要直接搬教材原文。 */
export const LIMITS = {
  freeDaily: 10,
  memberDaily: 30,
};

export const PLANS: Plan[] = [
  {
    id: 'month',
    name: '月会员',
    price: 1900,
    days: 30,
    highlight: false,
    desc: '解锁全部单元，每日可学 30 词',
  },
  {
    id: 'term',
    name: '学期会员',
    price: 8800,
    days: 180,
    highlight: true,
    desc: '覆盖一学期，适合家长一次开通',
  },
];

const gradeNames = ['', '一', '二', '三', '四', '五', '六'];

export const TEXTBOOKS: Textbook[] = [1, 2, 3, 4, 5, 6].flatMap((grade) => [
  {
    id: `demo-g${grade}a`,
    name: `演示词库 · ${gradeNames[grade]}年级上`,
    publisher: '自建示例',
    grade,
    volume: '上册',
  },
  {
    id: `demo-g${grade}b`,
    name: `演示词库 · ${gradeNames[grade]}年级下`,
    publisher: '自建示例',
    grade,
    volume: '下册',
  },
]);

type UnitSeed = {
  key: string;
  title: string;
  words: [string, string, string, string][];
};

const GRADE_UNITS: Record<number, UnitSeed[]> = {
  1: [
    {
      key: 'greet',
      title: '第 1 单元 · 打招呼',
      words: [
        ['hello', '/həˈləʊ/', '你好', 'Hello!'],
        ['hi', '/haɪ/', '嗨', 'Hi!'],
        ['bye', '/baɪ/', '再见', 'Bye-bye!'],
        ['yes', '/jes/', '是的', 'Yes.'],
        ['no', '/nəʊ/', '不', 'No.'],
        ['ok', '/ˌəʊˈkeɪ/', '好的', 'OK.'],
        ['mum', '/mʌm/', '妈妈', 'Mum.'],
        ['dad', '/dæd/', '爸爸', 'Dad.'],
      ],
    },
    {
      key: 'number',
      title: '第 2 单元 · 数字',
      words: [
        ['one', '/wʌn/', '一', 'One apple.'],
        ['two', '/tuː/', '二', 'Two books.'],
        ['three', '/θriː/', '三', 'Three cats.'],
        ['four', '/fɔː/', '四', 'Four birds.'],
        ['five', '/faɪv/', '五', 'Five pens.'],
        ['six', '/sɪks/', '六', 'Six dogs.'],
        ['seven', '/ˈsevn/', '七', 'Seven days.'],
        ['eight', '/eɪt/', '八', 'Eight eggs.'],
      ],
    },
  ],
  2: [
    {
      key: 'animal',
      title: '第 1 单元 · 动物',
      words: [
        ['cat', '/kæt/', '猫', 'I have a cat.'],
        ['dog', '/dɒɡ/', '狗', 'The dog is big.'],
        ['bird', '/bɜːd/', '鸟', 'A bird can fly.'],
        ['fish', '/fɪʃ/', '鱼', 'I like fish.'],
        ['duck', '/dʌk/', '鸭子', 'The duck is yellow.'],
        ['pig', '/pɪɡ/', '猪', 'The pig is pink.'],
        ['bear', '/beə/', '熊', 'I see a bear.'],
        ['rabbit', '/ˈræbɪt/', '兔子', 'The rabbit is white.'],
      ],
    },
    {
      key: 'body',
      title: '第 2 单元 · 身体',
      words: [
        ['eye', '/aɪ/', '眼睛', 'I have two eyes.'],
        ['ear', '/ɪə/', '耳朵', 'I have two ears.'],
        ['nose', '/nəʊz/', '鼻子', 'This is my nose.'],
        ['mouth', '/maʊθ/', '嘴巴', 'Open your mouth.'],
        ['hand', '/hænd/', '手', 'Clap your hands.'],
        ['foot', '/fʊt/', '脚', 'My foot is small.'],
        ['head', '/hed/', '头', 'Touch your head.'],
        ['face', '/feɪs/', '脸', 'Wash your face.'],
      ],
    },
  ],
  3: [
    {
      key: 'hello',
      title: '第 1 单元 · 打招呼',
      words: [
        ['hello', '/həˈləʊ/', '你好', 'Hello, I am Tom.'],
        ['hi', '/haɪ/', '嗨', 'Hi, good morning.'],
        ['good', '/ɡʊd/', '好的', 'Good morning, teacher.'],
        ['morning', '/ˈmɔːnɪŋ/', '早晨', 'I say good morning.'],
        ['I', '/aɪ/', '我', 'I am a student.'],
        ['am', '/æm/', '是', 'I am happy.'],
        ['name', '/neɪm/', '名字', 'My name is Amy.'],
        ['please', '/pliːz/', '请', 'Sit down, please.'],
        ['thank', '/θæŋk/', '谢谢', 'Thank you.'],
        ['goodbye', '/ˌɡʊdˈbaɪ/', '再见', 'Goodbye, see you.'],
      ],
    },
    {
      key: 'color',
      title: '第 2 单元 · 颜色',
      words: [
        ['red', '/red/', '红色', 'The apple is red.'],
        ['blue', '/bluː/', '蓝色', 'The sky is blue.'],
        ['green', '/ɡriːn/', '绿色', 'The leaf is green.'],
        ['yellow', '/ˈjeləʊ/', '黄色', 'The sun is yellow.'],
        ['black', '/blæk/', '黑色', 'The cat is black.'],
        ['white', '/waɪt/', '白色', 'The cloud is white.'],
        ['orange', '/ˈɒrɪndʒ/', '橙色', 'I like orange.'],
        ['pink', '/pɪŋk/', '粉色', 'Her bag is pink.'],
      ],
    },
    {
      key: 'school',
      title: '第 3 单元 · 校园',
      words: [
        ['school', '/skuːl/', '学校', 'I go to school.'],
        ['teacher', '/ˈtiːtʃə/', '老师', 'My teacher is kind.'],
        ['book', '/bʊk/', '书', 'This is my book.'],
        ['pen', '/pen/', '钢笔', 'I have a pen.'],
        ['bag', '/bæɡ/', '书包', 'The bag is big.'],
        ['desk', '/desk/', '书桌', 'The pen is on the desk.'],
        ['chair', '/tʃeə/', '椅子', 'Sit on the chair.'],
        ['friend', '/frend/', '朋友', 'She is my friend.'],
      ],
    },
  ],
  4: [
    {
      key: 'food',
      title: '第 1 单元 · 食物',
      words: [
        ['apple', '/ˈæpl/', '苹果', 'I eat an apple.'],
        ['bread', '/bred/', '面包', 'I like bread.'],
        ['milk', '/mɪlk/', '牛奶', 'Drink some milk.'],
        ['egg', '/eɡ/', '鸡蛋', 'I have an egg.'],
        ['rice', '/raɪs/', '米饭', 'Rice is yummy.'],
        ['water', '/ˈwɔːtə/', '水', 'I want water.'],
        ['cake', '/keɪk/', '蛋糕', 'The cake is sweet.'],
        ['juice', '/dʒuːs/', '果汁', 'Orange juice, please.'],
      ],
    },
    {
      key: 'home',
      title: '第 2 单元 · 家庭',
      words: [
        ['home', '/həʊm/', '家', 'I go home.'],
        ['room', '/ruːm/', '房间', 'This is my room.'],
        ['bed', '/bed/', '床', 'The bed is soft.'],
        ['door', '/dɔː/', '门', 'Open the door.'],
        ['window', '/ˈwɪndəʊ/', '窗户', 'Close the window.'],
        ['table', '/ˈteɪbl/', '桌子', 'The table is clean.'],
        ['family', '/ˈfæməli/', '家庭', 'I love my family.'],
        ['sister', '/ˈsɪstə/', '姐妹', 'My sister is kind.'],
      ],
    },
  ],
  5: [
    {
      key: 'weather',
      title: '第 1 单元 · 天气',
      words: [
        ['sunny', '/ˈsʌni/', '晴朗的', 'It is sunny today.'],
        ['rainy', '/ˈreɪni/', '下雨的', 'It is rainy.'],
        ['windy', '/ˈwɪndi/', '有风的', 'It is windy.'],
        ['cloudy', '/ˈklaʊdi/', '多云的', 'It is cloudy.'],
        ['hot', '/hɒt/', '热的', 'It is hot.'],
        ['cold', '/kəʊld/', '冷的', 'It is cold.'],
        ['warm', '/wɔːm/', '温暖的', 'It is warm.'],
        ['cool', '/kuːl/', '凉爽的', 'It is cool.'],
      ],
    },
    {
      key: 'sport',
      title: '第 2 单元 · 运动',
      words: [
        ['run', '/rʌn/', '跑步', 'I can run fast.'],
        ['jump', '/dʒʌmp/', '跳', 'I can jump high.'],
        ['swim', '/swɪm/', '游泳', 'I like to swim.'],
        ['ball', '/bɔːl/', '球', 'Kick the ball.'],
        ['play', '/pleɪ/', '玩', 'Let us play.'],
        ['game', '/ɡeɪm/', '游戏', 'This game is fun.'],
        ['sport', '/spɔːt/', '运动', 'I love sport.'],
        ['team', '/tiːm/', '队伍', 'Our team wins.'],
      ],
    },
  ],
  6: [
    {
      key: 'travel',
      title: '第 1 单元 · 出行',
      words: [
        ['bus', '/bʌs/', '公交车', 'I take a bus.'],
        ['bike', '/baɪk/', '自行车', 'I ride a bike.'],
        ['train', '/treɪn/', '火车', 'The train is fast.'],
        ['plane', '/pleɪn/', '飞机', 'The plane is big.'],
        ['car', '/kɑː/', '小汽车', 'Dad drives a car.'],
        ['map', '/mæp/', '地图', 'Look at the map.'],
        ['park', '/pɑːk/', '公园', 'We go to the park.'],
        ['trip', '/trɪp/', '旅行', 'Have a nice trip.'],
      ],
    },
    {
      key: 'future',
      title: '第 2 单元 · 理想',
      words: [
        ['dream', '/driːm/', '梦想', 'I have a dream.'],
        ['study', '/ˈstʌdi/', '学习', 'I study hard.'],
        ['work', '/wɜːk/', '工作', 'I will work hard.'],
        ['help', '/help/', '帮助', 'I want to help.'],
        ['kind', '/kaɪnd/', '善良的', 'Be kind to others.'],
        ['brave', '/breɪv/', '勇敢的', 'Be brave.'],
        ['future', '/ˈfjuːtʃə/', '未来', 'The future is bright.'],
        ['hope', '/həʊp/', '希望', 'I hope so.'],
      ],
    },
  ],
};

/** 下册先给每套 1 个免费体验单元，方便选册。 */
const GRADE_UNITS_LOWER: Record<number, UnitSeed[]> = {
  1: [
    {
      key: 'review',
      title: '第 1 单元 · 复习巩固',
      words: [
        ['boy', '/bɔɪ/', '男孩', 'He is a boy.'],
        ['girl', '/ɡɜːl/', '女孩', 'She is a girl.'],
        ['big', '/bɪɡ/', '大的', 'A big box.'],
        ['small', '/smɔːl/', '小的', 'A small cat.'],
        ['happy', '/ˈhæpi/', '开心的', 'I am happy.'],
        ['sad', '/sæd/', '难过的', 'Do not be sad.'],
        ['come', '/kʌm/', '来', 'Come here.'],
        ['go', '/ɡəʊ/', '去', 'Go home.'],
      ],
    },
  ],
  2: [
    {
      key: 'review',
      title: '第 1 单元 · 日常用语',
      words: [
        ['sorry', '/ˈsɒri/', '对不起', 'I am sorry.'],
        ['excuse', '/ɪkˈskjuːs/', '打扰', 'Excuse me.'],
        ['help', '/help/', '帮助', 'Help me, please.'],
        ['look', '/lʊk/', '看', 'Look at me.'],
        ['listen', '/ˈlɪsn/', '听', 'Listen carefully.'],
        ['read', '/riːd/', '读', 'Read the book.'],
        ['write', '/raɪt/', '写', 'Write your name.'],
        ['draw', '/drɔː/', '画', 'Draw a cat.'],
      ],
    },
  ],
  3: [
    {
      key: 'review',
      title: '第 1 单元 · 时间',
      words: [
        ['today', '/təˈdeɪ/', '今天', 'Today is Monday.'],
        ['tomorrow', '/təˈmɒrəʊ/', '明天', 'See you tomorrow.'],
        ['yesterday', '/ˈjestədeɪ/', '昨天', 'Yesterday was fun.'],
        ['week', '/wiːk/', '星期', 'This week is busy.'],
        ['month', '/mʌnθ/', '月', 'Next month.'],
        ['year', '/jɪə/', '年', 'Happy New Year.'],
        ['time', '/taɪm/', '时间', 'What time is it?'],
        ['now', '/naʊ/', '现在', 'Do it now.'],
      ],
    },
  ],
  4: [
    {
      key: 'review',
      title: '第 1 单元 · 衣服',
      words: [
        ['coat', '/kəʊt/', '外套', 'Put on your coat.'],
        ['shirt', '/ʃɜːt/', '衬衫', 'A blue shirt.'],
        ['dress', '/dres/', '连衣裙', 'A nice dress.'],
        ['hat', '/hæt/', '帽子', 'Wear a hat.'],
        ['shoes', '/ʃuːz/', '鞋子', 'New shoes.'],
        ['socks', '/sɒks/', '袜子', 'White socks.'],
        ['pants', '/pænts/', '裤子', 'Black pants.'],
        ['wear', '/weə/', '穿', 'What do you wear?'],
      ],
    },
  ],
  5: [
    {
      key: 'review',
      title: '第 1 单元 · 节日',
      words: [
        ['festival', '/ˈfestɪvl/', '节日', 'I like this festival.'],
        ['party', '/ˈpɑːti/', '聚会', 'Come to my party.'],
        ['gift', '/ɡɪft/', '礼物', 'A birthday gift.'],
        ['card', '/kɑːd/', '卡片', 'Make a card.'],
        ['song', '/sɒŋ/', '歌曲', 'Sing a song.'],
        ['dance', '/dɑːns/', '跳舞', 'Let us dance.'],
        ['wish', '/wɪʃ/', '愿望', 'Make a wish.'],
        ['celebrate', '/ˈselɪbreɪt/', '庆祝', 'We celebrate together.'],
      ],
    },
  ],
  6: [
    {
      key: 'review',
      title: '第 1 单元 · 计划',
      words: [
        ['plan', '/plæn/', '计划', 'I have a plan.'],
        ['goal', '/ɡəʊl/', '目标', 'My goal is clear.'],
        ['practice', '/ˈpræktɪs/', '练习', 'Practice every day.'],
        ['improve', '/ɪmˈpruːv/', '提高', 'I want to improve.'],
        ['share', '/ʃeə/', '分享', 'Share with friends.'],
        ['learn', '/lɜːn/', '学习', 'Learn English.'],
        ['finish', '/ˈfɪnɪʃ/', '完成', 'Finish your homework.'],
        ['success', '/səkˈses/', '成功', 'I wish you success.'],
      ],
    },
  ],
};

export const UNITS: Unit[] = [];
export const WORDS: Word[] = [];

function pushUnits(grade: number, textbookId: string, units: UnitSeed[], idPrefix: string) {
  units.forEach((unit, index) => {
    const unitId = `${idPrefix}-${unit.key}`;
    UNITS.push({
      id: unitId,
      textbookId,
      title: unit.title,
      order: index + 1,
      free: index === 0,
    });
    unit.words.forEach((item, wordIndex) => {
      const [spelling, phonetic, meaning, example] = item;
      WORDS.push({
        id: `${unitId}-w${String(wordIndex + 1).padStart(2, '0')}`,
        unitId,
        spelling,
        phonetic,
        meaning,
        example,
      });
    });
  });
}

for (const grade of [1, 2, 3, 4, 5, 6]) {
  pushUnits(grade, `demo-g${grade}a`, GRADE_UNITS[grade], `g${grade}`);
  pushUnits(grade, `demo-g${grade}b`, GRADE_UNITS_LOWER[grade], `g${grade}b`);
}

export interface ShopCatalogItem {
  id: string;
  name: string;
  category: 'furniture' | 'decor' | 'outfit';
  price: number;
  desc: string;
  roomAction: Record<string, unknown>;
}

export const SHOP_CATALOG: ShopCatalogItem[] = [
  {
    id: 'sofa-left',
    name: '沙发靠左摆',
    category: 'furniture',
    price: 120,
    desc: '把沙发挪到靠窗一侧',
    roomAction: {
      type: 'furniture-transform',
      furnitureId: 'sofa',
      position: [0.2, 0, -2.28],
      rotation: [0, -Math.PI / 2, 0],
      scale: 3.7,
    },
  },
  {
    id: 'table-center',
    name: '矮桌居中',
    category: 'furniture',
    price: 80,
    desc: '木质矮桌摆到房间中央',
    roomAction: {
      type: 'furniture-transform',
      furnitureId: 'table',
      position: [0.1, 0, 0.2],
      scale: 1.9,
    },
  },
  {
    id: 'lamp-night',
    name: '暖光夜灯预设',
    category: 'decor',
    price: 60,
    desc: '进入房间时自动打开暖光',
    roomAction: { type: 'decor-flag', flag: 'lampOn', enabled: true },
  },
  {
    id: 'outfit-pink',
    name: '樱花粉滤镜',
    category: 'outfit',
    price: 150,
    desc: '身体偏粉（占位换装）',
    roomAction: { type: 'outfit', outfitId: 'pink', tint: '#f3b6c8' },
  },
  {
    id: 'outfit-mint',
    name: '薄荷绿滤镜',
    category: 'outfit',
    price: 150,
    desc: '身体偏青绿（占位换装）',
    roomAction: { type: 'outfit', outfitId: 'mint', tint: '#9fd6c2' },
  },
  {
    id: 'outfit-default',
    name: '原色毛发',
    category: 'outfit',
    price: 0,
    desc: '恢复默认配色',
    roomAction: { type: 'outfit', outfitId: 'default' },
  },
];

export interface DailyTaskSeed {
  id: string;
  key: string;
  title: string;
  desc: string;
  metric: 'attempts' | 'correct' | 'review_correct';
  target: number;
  reward: number;
  sort: number;
}

export const DAILY_TASKS: DailyTaskSeed[] = [
  {
    id: 'task-study-3',
    key: 'study_words_3',
    title: '今天练 3 个词',
    desc: '任意闯关答题 3 次',
    metric: 'attempts',
    target: 3,
    reward: 15,
    sort: 1,
  },
  {
    id: 'task-correct-5',
    key: 'correct_5',
    title: '答对 5 次',
    desc: '自评「模糊/认识」或答对累计 5 次',
    metric: 'correct',
    target: 5,
    reward: 25,
    sort: 2,
  },
  {
    id: 'task-review-3',
    key: 'review_correct_3',
    title: '复习答对 3 个',
    desc: '到期复习里答对 3 次',
    metric: 'review_correct',
    target: 3,
    reward: 20,
    sort: 3,
  },
];
