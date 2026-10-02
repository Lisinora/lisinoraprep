/* LisinoraPrep 纯数据文件：语录库、考试模板、颜色常量 */

/* ============================================================
   语录库 · 五个分类
   ============================================================ */
const QUOTE_TYPE_LABEL = {
  en: '· 英文长句 ·',
  proverb: '· 西谚 ·',
  poem: '· 古诗文 ·',
  person: '· 人物志 ·',
  history: '· 史鉴 ·'
};

const QUOTE_LIBRARY = [
  /* ---------- 英文长句 ---------- */
  { type: 'en',
    text: 'Tell me, what is it you plan to do with your one wild and precious life?',
    trans: '告诉我，对于你那狂野而珍贵的唯一生命，你打算如何度过？',
    source: 'Mary Oliver' },

  { type: 'en',
    text: 'Let everything happen to you: beauty and terror. Just keep going. No feeling is final.',
    trans: '让一切降临于你：美与恐惧。只管前行，没有哪种感受是最终的。',
    source: 'Rainer Maria Rilke' },

  { type: 'en',
    text: 'In the depth of winter, I finally learned that within me there lay an invincible summer.',
    trans: '在隆冬的深处，我终于明白，我身上有一个不可战胜的夏天。',
    source: 'Albert Camus' },

  { type: 'en',
    text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life.',
    trans: '我步入丛林，因为我希望有意识地生活，只面对生活的基本事实。',
    source: 'Henry David Thoreau' },

  { type: 'en',
    text: 'What we call the beginning is often the end. And to make an end is to make a beginning. The end is where we start from.',
    trans: '我们所谓的开始，往往就是结束。而结束，就是新的开始。终点，正是我们出发的地方。',
    source: 'T. S. Eliot' },

  { type: 'en',
    text: 'The mind is its own place, and in itself can make a heaven of hell, a hell of heaven.',
    trans: '心灵自有其处所，它能把地狱变成天堂，也能把天堂变成地狱。',
    source: 'John Milton' },

  { type: 'en',
    text: 'We are all in the gutter, but some of us are looking at the stars.',
    trans: '我们都身处阴沟，但仍有人仰望星空。',
    source: 'Oscar Wilde' },

  { type: 'en',
    text: 'A book must be the axe for the frozen sea within us.',
    trans: '一本书，必须是一把能劈开我们内心冰封海洋的斧头。',
    source: 'Franz Kafka' },

  { type: 'en',
    text: 'To see a World in a Grain of Sand\nAnd a Heaven in a Wild Flower,\nHold Infinity in the palm of your hand\nAnd Eternity in an hour.',
    trans: '一沙一世界，一花一天堂。\n掌心握无限，刹那成永恒。',
    source: 'William Blake' },

  { type: 'en',
    text: 'Not all those who wander are lost.',
    trans: '并非所有徘徊者都迷失了方向。',
    source: 'J. R. R. Tolkien' },

  /* ---------- 西谚 ---------- */
  { type: 'proverb',
    text: 'Still waters run deep.',
    trans: '静水流深。' },

  { type: 'proverb',
    text: 'Smooth seas do not make skillful sailors.',
    trans: '平静的海洋，造就不了熟练的水手。',
    source: 'African Proverb' },

  { type: 'proverb',
    text: 'The wound is the place where the light enters you.',
    trans: '伤口，是光进入你内心的地方。',
    source: 'Rumi' },

  { type: 'proverb',
    text: 'If you want to go fast, go alone. If you want to go far, go together.',
    trans: '独行快，众行远。',
    source: 'African Proverb' },

  { type: 'proverb',
    text: 'He who has a why to live can bear almost any how.',
    trans: '一个人知道自己为什么而活，就可以忍受任何一种生活。',
    source: 'Friedrich Nietzsche' },

  { type: 'proverb',
    text: 'What you seek is seeking you.',
    trans: '你所追寻的，也在追寻你。',
    source: 'Rumi' },

  { type: 'proverb',
    text: 'Per aspera ad astra.',
    trans: '循此苦旅，以达星辰。',
    source: 'Latin Adage' },

  { type: 'proverb',
    text: 'The obstacle is the way.',
    trans: '障碍本身就是道路。',
    source: 'Marcus Aurelius' },

  /* ---------- 古诗文 ---------- */
  { type: 'poem', text: '苔花如米小，\n也学牡丹开。', source: '袁枚《苔》' },
  { type: 'poem', text: '行到水穷处，\n坐看云起时。', source: '王维《终南别业》' },
  { type: 'poem', text: '竹杖芒鞋轻胜马，谁怕？\n一蓑烟雨任平生。', source: '苏轼《定风波》' },
  { type: 'poem', text: '桐花万里丹山路，\n雏凤清于老凤声。', source: '李商隐' },
  { type: 'poem', text: '靡不有初，鲜克有终。', source: '《诗经 · 大雅》' },
  { type: 'poem', text: '悟已往之不谏，知来者之可追。', source: '陶渊明《归去来兮辞》' },
  { type: 'poem', text: '岁寒，然后知松柏之后凋也。', source: '《论语 · 子罕》' },
  { type: 'poem', text: '志之所趋，无远弗届；\n穷山距海，不能限也。', source: '《格言联璧》' },
  { type: 'poem', text: '博观而约取，厚积而薄发。', source: '苏轼' },
  { type: 'poem', text: '路虽远行则将至，事虽难做则必成。', source: '《荀子 · 修身》' },
  { type: 'poem', text: '其作始也简，其将毕也必巨。', source: '《庄子 · 人间世》' },
  { type: 'poem', text: '心之所向，素履以往。', source: '《礼记 · 中庸》' },

  /* ---------- 人物志 ---------- */
  { type: 'person',
    text: '她一生几乎没离开过马萨诸塞州的家，常年穿一袭白衣，把自己关在楼上写诗。写了近 1800 首，生前只发表过十几首。她去世后，妹妹在抽屉里发现那些用针线缝好的小册子——每一本，都是她用手一针一线装订的。',
    source: 'Emily Dickinson · 1830–1886' },

  { type: 'person',
    text: '生前只卖出过一幅画。他写给弟弟提奥的八百多封信里，谈的不是"如何成功"，而是麦田的颜色、星空的漩涡、咖啡馆里的光。他被痛苦反复击倒，却从没放下画笔。',
    source: 'Vincent van Gogh · 1853–1890' },

  { type: 'person',
    text: '从 22 岁到 54 岁，他用三十多年走遍半个中国。没有官方资助，没有随从，草鞋布衣，风餐露宿。他写下六十多万字的游记。临终前他说："张骞凿空，未睹昆仑；唐玄奘、元耶律楚材衔人主之命，乃得西游。吾以老布衣，孤筇双屦，穷河沙，上昆仑，历西域，题名绝国，死不恨矣。"',
    source: '徐霞客 · 1587–1641' },

  { type: 'person',
    text: '明亡后，他披发入山，从锦衣玉食的世家公子，变成在破屋里写字的老人。他写《陶庵梦忆》，写的全是已经失去的东西——灯火、园林、茶道、歌姬、朋友。他把记忆写成文字，对抗遗忘和死亡。',
    source: '张岱 · 1597–1684' },

  { type: 'person',
    text: '白天是布拉格一家保险公司的普通职员，夜晚写作。生前几乎没有正式发表过作品。临终前他嘱咐好友布罗德："烧掉所有手稿。"好友没听他的，才有了后来的《变形记》和《城堡》。',
    source: 'Franz Kafka · 1883–1924' },

  { type: 'person',
    text: '他写下《浮生六记》，记录与妻子陈芸相守的平凡岁月：种花、赏月、喝茶、谈诗、一起变老。芸娘病逝后，他漂泊各地，把两人共度的时光一笔一笔写下来，说："苟不记之笔墨，未免有辜彼苍之厚。"',
    source: '沈复 · 1763–1832' },

  { type: 'person',
    text: '她是波兰裔科学家，两度获得诺贝尔奖——物理和化学各一次。但她没为镭申请专利，反而把提炼方法公之于众，说："镭属于全世界。"一战时她亲自开车上前线，用移动 X 光机为伤兵检查。',
    source: 'Marie Curie · 1867–1934' },

  { type: 'person',
    text: '他 20 岁双目失明，却成为日本最著名的民谣歌手。他说："我的眼睛虽然看不见，但我的心能看见。"他一生创作五百多首歌，唱的是自由、土地和尊严。',
    source: '冈林信康 · 1946–' },

  /* ---------- 史鉴 ---------- */
  { type: 'history',
    text: '明代最有权力的首辅之一。他推行"一条鞭法"，让国库充盈、边防稳固；但他也排除异己、权倾朝野。死后不久就被抄家，长子自尽，家人流放。一个帝国因他而延续，也因他埋下新的裂痕。',
    source: '张居正 · 1525–1582' },

  { type: 'history',
    text: '他看到北宋积贫积弱的病根，主张变法。改革触动了太多人的利益，苏轼也反对他。他一生被贬、被起用、再被贬，最终在钟山隐居，写下"春风又绿江南岸，明月何时照我还"。他的理想失败了，但他看到了问题。',
    source: '王安石 · 1021–1086' },

  { type: 'history',
    text: '因替李陵辩护而触怒汉武帝，遭受宫刑。在给朋友任安的信里，他写道："人固有一死，或重于泰山，或轻于鸿毛。"他选择活着，为了写完父亲未竟的那部史书。后世称它："史家之绝唱，无韵之离骚。"',
    source: '司马迁 · 前 145–前 86' },

  { type: 'history',
    text: '他组建湘军，平定太平天国，被誉为"中兴名臣"；但他也被人批评残忍、手段严厉。他一生在"修身"与"杀伐"之间挣扎，家书里反复告诫自己"克己"。历史人物的复杂性，恰在于此。',
    source: '曾国藩 · 1811–1872' },

  { type: 'history',
    text: '他被雅典法庭判死刑。弟子们安排他逃跑，他拒绝了，说："你们杀了我，将再也找不到像我这样的人。"他平静地喝下毒酒，死前对身边的人说："现在，我该走了。我去赴死，你们去继续生活。"',
    source: 'Socrates · 前 470–前 399' },

  { type: 'history',
    text: '他因支持日心说被宗教裁判所审判，被迫公开认罪。传说他走出审判厅时低声说了一句："Eppur si muove."——但它仍在转动。晚年双目失明，被软禁在家，却仍在研究力学。',
    source: 'Galileo Galilei · 1564–1642' }
];

/* ============================================================
   考试数据层
   ============================================================ */
const STORE_KEY_EXAMS = 'exams_list';

const EXAM_TEMPLATES = {
  zhongkao: {
    name: '中考',
    events: [
      { offset: -150, title: '中考报名' },
      { offset: -120, title: '体育考试' },
      { offset: -90,  title: '实验操作考试' },
      { offset: -60,  title: '一模' },
      { offset: -30,  title: '二模' },
      { offset: -15,  title: '打印准考证' },
      { offset: 0,    title: '正式中考' },
      { offset: 20,   title: '成绩查询' },
      { offset: 30,   title: '志愿填报' },
      { offset: 45,   title: '录取结果' }
    ]
  },
  gaokao: {
    name: '高考',
    events: [
      { offset: -240, title: '高考报名' },
      { offset: -180, title: '英语听说考试' },
      { offset: -120, title: '体检' },
      { offset: -90,  title: '一模' },
      { offset: -30,  title: '二模' },
      { offset: -10,  title: '打印准考证' },
      { offset: 0,    title: '正式高考' },
      { offset: 20,   title: '成绩查询' },
      { offset: 30,   title: '志愿填报' },
      { offset: 50,   title: '录取结果' }
    ]
  },
  zhuanshengben: {
    name: '专升本',
    events: [
      { offset: -120, title: '招生规定/考纲发布' },
      { offset: -90,  title: '网上预报名' },
      { offset: -60,  title: '现场确认' },
      { offset: -15,  title: '打印准考证' },
      { offset: 0,    title: '正式考试' },
      { offset: 20,   title: '成绩查询' },
      { offset: 45,   title: '填报志愿' },
      { offset: 60,   title: '录取结果' }
    ]
  },
  custom: {
    name: '自定义',
    events: []
  }
};

const EXAM_COLORS = ['#52B788', '#7B9FE0', '#E8A87C', '#C38D9E', '#F2C14E', '#9B8EC4'];


/* ============================================================
   数据层
   ============================================================ */
const COLORS = ['#52B788', '#7B9FE0', '#E8A87C', '#C38D9E', '#F2C14E', '#6C9BD2', '#9B8EC4', '#E07A5F', '#81B29A', '#3D8B7D'];
