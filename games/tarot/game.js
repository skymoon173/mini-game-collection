/* ============================================================
   星空塔罗 —— 大阿卡纳占卜
   纯原生实现：内联 SVG 几何牌面 / 程序化星空 / WebAudio 风铃
   零外部依赖，双击 index.html 即可离线游玩
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     一、22 张大阿卡纳数据（0 愚者 ~ 21 世界）
     kw 为核心关键词；up 正位释义；down 逆位释义
     ============================================================ */
  const CARDS = [
    {
      id: 0, num: '0', name: '愚者',
      kw: ['崭新开始', '自由', '冒险心'],
      up: '你正站在一段新旅程的起点，保持纯真与好奇，世界会为勇敢迈步的人让路。相信直觉的牵引，哪怕前路未知，也值得轻盈地纵身一试。',
      down: '计划未稳便冲动行事，容易因盲目乐观而忽略脚下的风险。先看清悬崖边缘、补足准备，再重新出发也不迟。'
    },
    {
      id: 1, num: 'I', name: '魔术师',
      kw: ['意志', '创造', '行动力'],
      up: '你手中已备齐所需的资源，关键在于集中意志，把想法化为行动。专注与自信能点石成金，此刻正是主动创造的好时机。',
      down: '能力被分散或误用，可能流于空谈、投机或自我怀疑。收回散乱的心神，确认动机纯粹，再施展你的手艺。'
    },
    {
      id: 2, num: 'II', name: '女祭司',
      kw: ['直觉', '潜意识', '静观'],
      up: '答案已浮现在你内心深处，只需安静下来便能听见。暂时退守幕后，让直觉与潜意识为你缓缓揭开迷雾。',
      down: '你忽视了内在的声音，或被表象与暂时的情绪牵动判断。给自己独处的空间，秘密自会在沉默中显出轮廓。'
    },
    {
      id: 3, num: 'III', name: '女皇',
      kw: ['丰饶', '滋养', '美'],
      up: '生命力旺盛流淌，关系、创作与生活都进入滋养与收获的季节。用心照顾自己与所爱，美好会自然生长。',
      down: '过度付出或过度依赖让关系失衡，也可能暗示懒散与自我忽视。重新学习爱的边界，先把滋养留给自己。'
    },
    {
      id: 4, num: 'IV', name: '皇帝',
      kw: ['秩序', '权威', '根基'],
      up: '以理性与纪律建立稳固的秩序，你有能力承担责任、掌握局面。用清晰的规则与长期规划，奠定扎实的根基。',
      down: '控制欲过强或僵化固执会让身边人窒息，权力也可能被误用。柔化身段，权威并不等于压制。'
    },
    {
      id: 5, num: 'V', name: '教皇',
      kw: ['传统', '信仰', '引路人'],
      up: '尊重经验与传统，或有师长、团体为你提供可靠的指引。遵循被时间验证过的道路，你会获得归属感与方向。',
      down: '刻板的规则或他人的期待正束缚你的判断。真正的信仰发自内心，你可以礼貌地走出不属于自己的路。'
    },
    {
      id: 6, num: 'VI', name: '恋人',
      kw: ['爱', '选择', '结合'],
      up: '真诚的吸引与价值观的共鸣带来结合，无论是爱情还是合作都值得倾心投入。面对选择时，听从内心真正珍视之物。',
      down: '关系中出现分歧或诱惑，选择变得摇摆。先厘清自己的价值排序，别用逃避拖延那个重要的决定。'
    },
    {
      id: 7, num: 'VII', name: '战车',
      kw: ['意志', '胜利', '驾驭'],
      up: '凭借坚定意志与果断行动，你能驾驭看似对立的力量并赢得胜利。把握方向、稳住节奏，胜利属于不肯松懈的人。',
      down: '方向混乱或用力过猛，让局势有失控的风险。停下不是认输，先统合内在的矛盾，再重新握紧缰绳。'
    },
    {
      id: 8, num: 'VIII', name: '力量',
      kw: ['柔韧', '勇气', '内在力量'],
      up: '真正的强大不是压制，而是以温柔与耐心驯服野性。用从容和同理面对恐惧，你会发现自己比想象中更有力量。',
      down: '自我怀疑或情绪压抑正在消耗底气，本能反应也许会伤到关系。先安抚内心的野兽，力量会随平静回来。'
    },
    {
      id: 9, num: 'IX', name: '隐者',
      kw: ['内省', '寻道', '独处'],
      up: '暂时远离喧嚣，提着内在的灯独自探寻答案。独处不是孤独，而是为了看清那条只属于你的真理之路。',
      down: '孤立、闭门造车或拒绝援手，正让你在迷雾中原地打转。谨慎内省是好的，但也要允许别人的光照进来。'
    },
    {
      id: 10, num: 'X', name: '命运之轮',
      kw: ['转机', '周期', '命运'],
      up: '命运的齿轮开始转动，转机与好运正在靠近。顺势而为，并记住顺境逆境都是循环，保持一颗平常心。',
      down: '正逢低潮或感觉被命运推着走，计划频频生变。与其抗拒周期，不如修好己身，静静等待风再次转向。'
    },
    {
      id: 11, num: 'XI', name: '正义',
      kw: ['公正', '因果', '真相'],
      up: '理性衡量、诚实负责，真相与公平终会得到伸张。你种下的因正结出果，做决定时无愧于心便已足够。',
      down: '逃避责任或心存偏见会让天平倾斜，旧账也许被重新翻起。直面事实、承担该承担的，才是真正的解套。'
    },
    {
      id: 12, num: 'XII', name: '倒吊人',
      kw: ['放下', '换位思考', '暂停'],
      up: '换个角度看世界，主动的等待与放下反而带来顿悟。此刻不宜强攻，悬停之中，自有新的视野在生长。',
      down: '无谓的牺牲与停滞正在消耗你，或者那不过是被动的拖延。问问自己：这份坚持是修行，还是不敢行动的借口。'
    },
    {
      id: 13, num: 'XIII', name: '死神',
      kw: ['结束', '转化', '重生'],
      up: '一个阶段正走向必然的结束，放手才能为新生腾出空间。不要惧怕改变，凋零之后，是更真实的开始。',
      down: '你紧抓着早已失效的人事物不放，让转变拖得漫长而痛苦。与过去和解吧，结束的门后是一段新的旅程。'
    },
    {
      id: 14, num: 'XIV', name: '节制',
      kw: ['调和', '耐心', '平衡'],
      up: '在对立之间找到黄金比例，温和而耐心地调和一切。循序渐进地调配生活，疗愈与融洽会自然发生。',
      down: '失衡、急躁或非黑即白的判断，让事情难以融合。放慢步调、重新校准比例，极端从来都不是答案。'
    },
    {
      id: 15, num: 'XV', name: '恶魔',
      kw: ['执念', '束缚', '欲望'],
      up: '正视欲望与阴影，你会发现许多锁链其实是自己套上的。物质与亲密并非坏事，关键是不被它们支配。',
      down: '你开始觉察执念、成瘾或不健康关系的束缚，松绑的契机已经出现。面对阴影，就是夺回自由的第一步。'
    },
    {
      id: 16, num: 'XVI', name: '高塔',
      kw: ['突变', '崩塌', '惊醒'],
      up: '建立在虚假根基上的结构被闪电击碎，剧变虽痛，却带来真相与解放。旧的不去新的不来，废墟之上可以重建真实。',
      down: '你预感风暴将至却抗拒改变，或正经历缓慢的内耗。与其等待被迫崩塌，不如主动拆除不再稳固的部分。'
    },
    {
      id: 17, num: 'XVII', name: '星星',
      kw: ['希望', '疗愈', '信念'],
      up: '经历风雨之后，宁静的希望重新点亮夜空。相信未来、敞开心，灵感与疗愈正温柔地流向你。',
      down: '失望与疲惫让你暂时看不见星光，信念有些动摇。允许自己休息，希望并未消失，只是被云遮住了一会儿。'
    },
    {
      id: 18, num: 'XVIII', name: '月亮',
      kw: ['迷惘', '幻象', '潜意识'],
      up: '前路笼罩在月光与迷雾中，真相尚未完全显形。接纳不安、倾听梦境与直觉，小心分辨眼前的幻象。',
      down: '迷雾正在散去，曾被压抑的恐惧逐渐被看清。直面那些影子，你会发现多数怪物并没有想象中庞大。'
    },
    {
      id: 19, num: 'XIX', name: '太阳',
      kw: ['喜悦', '成功', '活力'],
      up: '阳光普照，成功、活力与真诚的喜悦充满生活。保持坦荡与热情，你的光芒会自然照亮周围的人。',
      down: '短暂的乌云遮住了阳光，可能是热情减退或成功延迟。别因一时的低沉否定自己，太阳一直都在。'
    },
    {
      id: 20, num: 'XX', name: '审判',
      kw: ['觉醒', '召唤', '释怀'],
      up: '内心响起召唤，是时候聆听真实的自我并作出抉择。宽恕过去、接纳经历，你将迎来一次内在的重生。',
      down: '你对自己过于苛责，或刻意忽视那个反复响起的声音。放下自我审判，诚实地回应内心的召唤。'
    },
    {
      id: 21, num: 'XXI', name: '世界',
      kw: ['圆满', '完成', '整合'],
      up: '一个漫长的周期走向圆满，过往的努力开花结果。带着完整的自己走向下一程，世界广阔，且正在欢迎你。',
      down: '临门一脚还差些许火候，或因害怕结束而迟迟不肯收尾。补上最后的缺口，圆满需要你亲手画上句点。'
    }
  ];

  /* ============================================================
     二、牌面 SVG：每张牌一个几何符号（金色描边 / 基础路径）
     符号绘制于圆徽中心 (100,150)、半径约 50 的区域内
     ============================================================ */

  // 通用几何小工具
  const G = {
    // 由中心向外发散的放射线（太阳、光芒等）
    rays: function (cx, cy, ri, ro, n, offsetDeg) {
      let s = '';
      for (let k = 0; k < n; k++) {
        const a = ((offsetDeg || 0) + k * 360 / n) * Math.PI / 180;
        s += '<line x1="' + (cx + Math.cos(a) * ri).toFixed(1) + '" y1="' + (cy + Math.sin(a) * ri).toFixed(1)
          + '" x2="' + (cx + Math.cos(a) * ro).toFixed(1) + '" y2="' + (cy + Math.sin(a) * ro).toFixed(1) + '"/>';
      }
      return s;
    },
    // 四角星芒
    spark: function (cx, cy, r) {
      const q = r * 0.2;
      return '<path d="M' + cx + ' ' + (cy - r) + ' Q' + (cx + q) + ' ' + (cy - q) + ' ' + (cx + r) + ' ' + cy
        + ' Q' + (cx + q) + ' ' + (cy + q) + ' ' + cx + ' ' + (cy + r)
        + ' Q' + (cx - q) + ' ' + (cy + q) + ' ' + (cx - r) + ' ' + cy
        + ' Q' + (cx - q) + ' ' + (cy - q) + ' ' + cx + ' ' + (cy - r) + ' Z"/>';
    },
    // 小菱形
    diamond: function (cx, cy, r) {
      return '<path d="M' + cx + ' ' + (cy - r) + ' L' + (cx + r) + ' ' + cy + ' ' + cx + ' ' + (cy + r)
        + ' L' + (cx - r) + ' ' + cy + ' Z"/>';
    }
  };

  // 22 个牌意符号，全部由直线、圆、多边形、贝塞尔路径构成
  const SYMBOLS = {
    0: function () { // 愚者：悬崖、旅人、行囊、太阳
      return '<circle cx="128" cy="108" r="6"/><g class="thin">' + G.rays(128, 108, 9, 13, 8) + '</g>'
        + '<path d="M52 194 L82 160 L148 160"/>'
        + '<path class="thin" d="M82 160 L90 152 L148 152"/>'
        + '<circle cx="78" cy="134" r="5"/>'
        + '<path d="M78 139 L78 154 M78 146 L70 141 M78 154 L74 160 M78 154 L83 160"/>'
        + '<line x1="90" y1="124" x2="90" y2="162"/>'
        + '<circle cx="90" cy="121" r="3"/>';
    },
    1: function () { // 魔术师：无限符号与四元素
      return '<path d="M82 118 C82 110 92 108 100 118 C108 128 118 126 118 118 C118 110 108 108 100 118 C92 128 82 126 82 118 Z"/>'
        + '<path d="M66 156 L78 178 L54 178 Z"/>'
        + '<path d="M88 180 L100 158 L76 158 Z"/>'
        + '<circle cx="114" cy="168" r="10"/>'
        + '<rect x="124" y="158" width="20" height="20"/>';
    },
    2: function () { // 女祭司：双柱、新月、十字
      return '<rect x="58" y="110" width="12" height="84"/><rect x="130" y="110" width="12" height="84"/>'
        + '<g class="thin"><path d="M54 110 L74 110 M54 194 L74 194 M126 110 L146 110 M126 194 L146 194"/></g>'
        + '<path d="M110 128 A15 15 0 1 0 110 158 A11 11 0 1 1 110 128 Z"/>'
        + '<line x1="100" y1="166" x2="100" y2="188"/>'
        + '<line x1="92" y1="174" x2="108" y2="174"/>';
    },
    3: function () { // 女皇：王冠与金星符号
      return '<path d="M72 124 L72 110 L86 119 L100 104 L114 119 L128 110 L128 124 Z"/>'
        + '<circle class="solid" cx="72" cy="108" r="2.6"/>'
        + '<circle class="solid" cx="100" cy="101" r="3"/>'
        + '<circle class="solid" cx="128" cy="108" r="2.6"/>'
        + '<circle cx="100" cy="158" r="14"/>'
        + '<line x1="100" y1="172" x2="100" y2="192"/>'
        + '<line x1="89" y1="181" x2="111" y2="181"/>';
    },
    4: function () { // 皇帝：四端正十字
      return '<rect x="93" y="106" width="14" height="88"/><rect x="66" y="143" width="68" height="14"/>'
        + '<circle cx="100" cy="150" r="9"/>'
        + '<circle cx="100" cy="106" r="4"/><circle cx="100" cy="194" r="4"/>'
        + '<circle cx="66" cy="150" r="4"/><circle cx="134" cy="150" r="4"/>';
    },
    5: function () { // 教皇：三重十字
      return '<line x1="100" y1="102" x2="100" y2="190"/>'
        + '<line x1="83" y1="116" x2="117" y2="116"/>'
        + '<line x1="88" y1="132" x2="112" y2="132"/>'
        + '<line x1="93" y1="148" x2="107" y2="148"/>'
        + '<circle cx="100" cy="168" r="11"/><circle class="solid" cx="100" cy="168" r="2.6"/>'
        + '<g class="thin"><line x1="84" y1="184" x2="84" y2="196"/><line x1="116" y1="184" x2="116" y2="196"/></g>';
    },
    6: function () { // 恋人：双星下牵手的两人
      return G.rays(100, 112, 8, 15, 8) + '<circle cx="100" cy="112" r="4.5"/>'
        + '<circle cx="80" cy="140" r="6"/>'
        + '<path d="M80 146 L80 178 M80 154 L97 159 M80 178 L73 193 M80 178 L87 193"/>'
        + '<circle cx="120" cy="140" r="6"/>'
        + '<path d="M120 146 L120 178 M120 154 L103 159 M120 178 L113 193 M120 178 L127 193"/>'
        + '<line class="thin" x1="66" y1="196" x2="134" y2="196"/>';
    },
    7: function () { // 战车：星芒、车身、双轮
      return G.spark(100, 112, 9)
        + '<circle cx="100" cy="132" r="6"/>'
        + '<path d="M76 140 L124 140 L128 180 L72 180 Z"/>'
        + '<line class="thin" x1="100" y1="140" x2="100" y2="180"/>'
        + '<circle cx="86" cy="189" r="9"/><circle class="solid" cx="86" cy="189" r="2.4"/>'
        + '<circle cx="114" cy="189" r="9"/><circle class="solid" cx="114" cy="189" r="2.4"/>';
    },
    8: function () { // 力量：无限符号与柔顺的狮面
      return '<path class="thin" d="M88 114 C88 108 94 106 100 114 C106 122 112 120 112 114 C112 108 106 106 100 114 C94 122 88 120 88 114 Z"/>'
        + G.rays(100, 156, 23, 29, 12, 15)
        + '<circle cx="100" cy="156" r="21"/>'
        + '<path d="M85 141 L81 130 L94 137 Z M115 141 L119 130 L106 137 Z"/>'
        + '<circle class="solid" cx="92" cy="153" r="2.2"/><circle class="solid" cx="108" cy="153" r="2.2"/>'
        + '<path d="M96 161 Q100 165 104 161"/>'
        + '<g class="thin"><line x1="84" y1="163" x2="94" y2="161"/><line x1="116" y1="163" x2="106" y2="161"/></g>';
    },
    9: function () { // 隐者：提灯、手杖与远山
      return '<line x1="76" y1="108" x2="76" y2="194"/>'
        + '<path class="thin" d="M80 116 Q104 120 104 130"/>'
        + '<path d="M104 120 L120 129 L120 147 L104 156 L88 147 L88 129 Z"/>'
        + '<path d="M104 126 L113 151 L95 151 Z M104 150 L95 125 L113 125 Z"/>'
        + '<circle class="solid" cx="104" cy="138" r="2"/>'
        + '<path class="thin" d="M58 194 L86 166 L106 186 L124 162 L144 194"/>';
    },
    10: function () { // 命运之轮：八辐法轮
      return '<circle cx="100" cy="150" r="36"/><circle class="thin" cx="100" cy="150" r="29"/>'
        + G.rays(100, 150, 6, 28, 8)
        + '<circle cx="100" cy="150" r="6"/>'
        + '<circle class="solid" cx="100" cy="114" r="2.6"/><circle class="solid" cx="100" cy="186" r="2.6"/>'
        + '<circle class="solid" cx="64" cy="150" r="2.6"/><circle class="solid" cx="136" cy="150" r="2.6"/>'
        + G.spark(62, 112, 4.5) + G.spark(138, 112, 4.5)
        + G.spark(62, 188, 4.5) + G.spark(138, 188, 4.5);
    },
    11: function () { // 正义：天平与宝剑
      return '<line x1="64" y1="118" x2="136" y2="118"/>'
        + '<line x1="100" y1="118" x2="100" y2="107"/>'
        + '<line x1="70" y1="118" x2="70" y2="132"/><path d="M60 132 Q70 142 80 132"/>'
        + '<line x1="130" y1="118" x2="130" y2="132"/><path d="M120 132 Q130 142 140 132"/>'
        + '<line x1="100" y1="124" x2="100" y2="158"/>'
        + '<line x1="86" y1="160" x2="114" y2="160"/>'
        + '<line x1="100" y1="160" x2="100" y2="172"/>'
        + '<circle class="solid" cx="100" cy="175" r="3"/>';
    },
    12: function () { // 倒吊人：T 型绞架与倒悬者
      return '<line x1="128" y1="110" x2="128" y2="194"/>'
        + '<line x1="66" y1="110" x2="134" y2="110"/>'
        + '<line class="thin" x1="110" y1="194" x2="146" y2="194"/>'
        + '<line x1="100" y1="110" x2="100" y2="126"/>'
        + '<circle class="thin" cx="100" cy="135" r="11"/>'
        + '<circle cx="100" cy="135" r="6"/>'
        + '<path d="M100 141 L100 166 M100 148 L82 138 M100 148 L118 138 M100 166 L88 188 M100 166 L112 188"/>';
    },
    13: function () { // 死神：镰刀、骷髅与新芽
      return '<line x1="70" y1="194" x2="124" y2="104"/>'
        + '<path d="M124 104 Q150 112 140 140 Q132 122 124 118 Z"/>'
        + '<circle cx="86" cy="150" r="17"/>'
        + '<path d="M75 158 L97 158 L94 172 L78 172 Z"/>'
        + '<circle class="solid" cx="80" cy="148" r="2.6"/><circle class="solid" cx="92" cy="148" r="2.6"/>'
        + '<path class="thin" d="M84 155 L86 158 L88 155"/>'
        + '<path class="thin" d="M66 194 Q68 182 74 178 Q80 182 76 190"/>';
    },
    14: function () { // 节制：双杯与调和之水
      return '<circle cx="100" cy="108" r="4.5"/>' + G.rays(100, 108, 7, 11, 8)
        + '<path d="M112 114 L132 114 L124 134 Z"/>'
        + '<path d="M68 178 L88 178 L80 196 Z"/>'
        + '<path class="thin" d="M124 135 Q110 143 118 152 Q126 161 108 170 Q98 175 84 176"/>';
    },
    15: function () { // 恶魔：双角、倒五芒星与锁链
      return '<path d="M78 110 L86 122 L72 122 Z M122 110 L114 122 L128 122 Z"/>'
        + '<circle cx="100" cy="150" r="30"/>'
        + '<g transform="rotate(180 100 150)"><path d="M100 126 L77 143 L86 169 L114 169 L123 143 Z"/></g>'
        + '<circle class="solid" cx="93" cy="135" r="1.8"/><circle class="solid" cx="107" cy="135" r="1.8"/>'
        + '<circle class="solid" cx="100" cy="150" r="2.4"/>'
        + '<g class="thin"><line x1="84" y1="183" x2="116" y2="183"/></g>'
        + '<circle cx="90" cy="189" r="3"/><circle cx="110" cy="189" r="3"/>';
    },
    16: function () { // 高塔：闪电、城塔与落石
      return '<path d="M134 100 L110 134 L118 138 L100 170"/>'
        + '<rect x="86" y="130" width="28" height="62"/>'
        + '<rect x="86" y="120" width="8" height="10"/><rect x="96" y="120" width="8" height="10"/><rect x="106" y="120" width="8" height="10"/>'
        + '<rect class="thin" x="96" y="142" width="8" height="10"/>'
        + '<path d="M95 192 L95 178 Q95 170 100 170 Q105 170 105 178 L105 192"/>'
        + '<line class="thin" x1="62" y1="194" x2="138" y2="194"/>'
        + '<rect class="solid" x="66" y="118" width="4" height="4"/>'
        + '<rect class="solid" x="134" y="136" width="4" height="4"/>'
        + '<rect class="solid" x="70" y="150" width="3" height="3"/>';
    },
    17: function () { // 星星：七角星、侧星与水波
      return '<path d="M100 104 L111.3 153.4 L79.6 113.8 L125.4 135.8 L74.6 135.8 L120.3 113.8 L88.7 153.4 Z"/>'
        + '<circle class="solid" cx="100" cy="130" r="2.2"/>'
        + G.spark(62, 120, 5) + G.spark(138, 124, 4.5)
        + '<g class="thin">'
        + '<path d="M64 178 Q73 171 82 178 T100 178 T118 178 T136 178"/>'
        + '<path d="M68 187 Q77 180 86 187 T104 187 T122 187 T132 187"/>'
        + '<path d="M74 195 Q83 188 92 195 T110 195 T128 195"/>'
        + '</g>';
    },
    18: function () { // 月亮：新月、双塔与蜿蜒小径
      return '<path d="M112 108 A18 18 0 1 0 112 144 A13.5 13.5 0 1 1 112 108 Z"/>'
        + '<rect x="62" y="150" width="12" height="42"/><rect x="62" y="144" width="4" height="8"/><rect x="70" y="144" width="4" height="8"/>'
        + '<rect x="126" y="150" width="12" height="42"/><rect x="126" y="144" width="4" height="8"/><rect x="134" y="144" width="4" height="8"/>'
        + '<path class="thin" d="M100 192 Q90 180 100 168 Q110 156 100 146"/>'
        + '<circle class="solid" cx="86" cy="152" r="1.8"/><circle class="solid" cx="114" cy="154" r="1.8"/>'
        + G.spark(58, 116, 4) + G.spark(142, 112, 4);
    },
    19: function () { // 太阳：双层光芒与笑脸
      return G.rays(100, 150, 23, 31, 12) + G.rays(100, 150, 23, 37, 12, 15)
        + '<circle cx="100" cy="150" r="20"/>'
        + '<circle class="solid" cx="93" cy="146" r="2"/><circle class="solid" cx="107" cy="146" r="2"/>'
        + '<path d="M92 154 Q100 161 108 154"/>';
    },
    20: function () { // 审判：号角、苏醒者与棺椁
      return '<line x1="64" y1="118" x2="110" y2="148"/>'
        + '<path d="M110 138 L142 124 L142 172 L110 158 Z"/>'
        + '<g class="thin"><line x1="143" y1="130" x2="150" y2="126"/><line x1="143" y1="148" x2="151" y2="148"/><line x1="143" y1="166" x2="150" y2="170"/></g>'
        + '<path class="thin" d="M70 194 L130 194 L122 176 L78 176 Z"/>'
        + '<circle cx="84" cy="160" r="4"/><path d="M84 164 L84 176 M84 168 L78 158 M84 168 L90 158"/>'
        + '<circle cx="100" cy="158" r="4"/><path d="M100 162 L100 176 M100 166 L94 156 M100 166 L106 156"/>'
        + '<circle cx="116" cy="160" r="4"/><path d="M116 164 L116 176 M116 168 L110 158 M116 168 L122 158"/>';
    },
    21: function () { // 世界：桂冠环、舞者、双杖与四角星火
      return '<ellipse cx="100" cy="150" rx="29" ry="37"/>'
        + '<ellipse class="thin" cx="100" cy="150" rx="23" ry="31"/>'
        + '<path class="thin" d="M96 112 L104 112 L108 106 L92 106 Z M92 188 L108 188 L104 194 L96 194 Z"/>'
        + '<g class="thin"><path d="M86 166 L114 140 M114 166 L86 140"/></g>'
        + '<circle cx="100" cy="132" r="5"/>'
        + '<line x1="100" y1="137" x2="100" y2="158"/>'
        + '<path d="M100 158 L92 170 M100 158 L108 170 M100 144 L88 150 M100 144 L112 150"/>'
        + G.spark(60, 112, 5) + G.spark(140, 112, 5)
        + G.spark(60, 188, 5) + G.spark(140, 188, 5);
    }
  };

  // 生成一张牌正面的完整 SVG
  function faceSVG(card, reversed) {
    return '<svg class="face-svg' + (reversed ? ' is-rev' : '') + '" viewBox="0 0 200 320" '
      + 'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + card.name + '">'
      + '<rect class="fb" x="2" y="2" width="196" height="316" rx="16"/>'
      + '<rect class="fr fr-outer" x="9" y="9" width="182" height="302" rx="11"/>'
      + '<rect class="fr fr-inner" x="14.5" y="14.5" width="171" height="291" rx="8"/>'
      // 四角菱形装饰
      + '<g class="gem">' + G.diamond(24, 24, 3.2) + G.diamond(176, 24, 3.2)
      + G.diamond(24, 296, 3.2) + G.diamond(176, 296, 3.2) + '</g>'
      // 顶部罗马数字
      + '<text class="f-num" x="100" y="42">' + card.num + '</text>'
      + '<line class="f-sep" x1="70" y1="54" x2="92" y2="54"/>'
      + '<line class="f-sep" x1="108" y1="54" x2="130" y2="54"/>'
      + '<g class="gem">' + G.diamond(100, 54, 2.2) + '</g>'
      // 中央圆徽与牌意符号
      + '<circle class="f-ring" cx="100" cy="150" r="66"/>'
      + '<circle class="f-ring f-ring2" cx="100" cy="150" r="59.5"/>'
      + '<g class="sym-g">' + SYMBOLS[card.id]() + '</g>'
      // 底部牌名
      + '<line class="f-sep" x1="52" y1="232" x2="84" y2="232"/>'
      + '<line class="f-sep" x1="116" y1="232" x2="148" y2="232"/>'
      + '<g class="gem">' + G.diamond(100, 232, 2.4) + G.diamond(46, 232, 1.8) + G.diamond(154, 232, 1.8) + '</g>'
      + '<text class="f-name" x="100" y="258">' + card.name + '</text>'
      + '</svg>';
  }

  // 统一的对称神秘花纹牌背（仅生成一次，多处复用）
  function buildBackSVG() {
    let petals = '';
    for (let k = 0; k < 16; k++) {
      petals += '<ellipse cx="100" cy="98" rx="7" ry="14" transform="rotate(' + (k * 22.5) + ' 100 150)"/>';
    }
    let dots = '';
    for (let k = 0; k < 24; k++) {
      const a = k * 15 * Math.PI / 180;
      dots += '<circle class="solid" cx="' + (100 + 62 * Math.cos(a)).toFixed(1)
        + '" cy="' + (150 + 62 * Math.sin(a)).toFixed(1) + '" r="1.1"/>';
    }
    // 中央八角星：16 个内外交替顶点
    let starPts = '';
    for (let k = 0; k < 16; k++) {
      const r = k % 2 ? 9.5 : 23;
      const a = (-90 + k * 22.5) * Math.PI / 180;
      starPts += (100 + r * Math.cos(a)).toFixed(1) + ',' + (150 + r * Math.sin(a)).toFixed(1) + ' ';
    }
    return '<svg class="back-svg" viewBox="0 0 200 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="塔罗牌背">'
      + '<rect class="bb" x="2" y="2" width="196" height="316" rx="16"/>'
      + '<rect class="fr fr-outer" x="9" y="9" width="182" height="302" rx="11"/>'
      + '<rect class="fr fr-inner" x="14.5" y="14.5" width="171" height="291" rx="8"/>'
      + '<g class="gem">' + G.diamond(24, 24, 3.2) + G.diamond(176, 24, 3.2)
      + G.diamond(24, 296, 3.2) + G.diamond(176, 296, 3.2)
      + G.diamond(100, 30, 2.6) + G.diamond(100, 290, 2.6) + '</g>'
      + '<circle class="f-ring" cx="100" cy="150" r="74"/>'
      + '<circle class="back-dash" cx="100" cy="150" r="69"/>'
      + '<g class="back-petals">' + petals + '</g>'
      + '<g class="back-orn">' + dots + '</g>'
      + '<circle class="back-disc" cx="100" cy="150" r="33"/>'
      + '<polygon class="back-star" points="' + starPts + '"/>'
      + '<circle cx="100" cy="150" r="4.5" fill="#171333" stroke="url(#gGold)" stroke-width="1.4"/>'
      + '<g class="gem">' + G.diamond(100, 76, 3) + G.diamond(100, 224, 3)
      + G.diamond(26, 150, 3) + G.diamond(174, 150, 3) + '</g>'
      + G.spark(52, 102, 3.4) + G.spark(148, 102, 3.4)
      + G.spark(52, 198, 3.4) + G.spark(148, 198, 3.4)
      + '</svg>';
  }

  /* ============================================================
     三、综合解读文案（数据驱动，模板按牌与位置取变，避免堆叠）
     ============================================================ */
  const POS_LABELS = ['过去', '现在', '未来'];

  const LEAD_UP = [
    ['过去的章节里，「{n}」正位，{k}曾为你铺下温暖的底色。',
     '回望过往，「{n}」正位携着{k}的力量，塑造了今天的你。',
     '旧日时光中，「{n}」正位默默守护，{k}是那时埋下的种子。'],
    ['此刻，「{n}」正位当令，{k}的能量正流经你的生活。',
     '立足当下，「{n}」正位提醒你：{k}就在手边，可以立刻取用。',
     '现在的你被「{n}」正位照亮，{k}是处理眼前事务最好的钥匙。'],
    ['望向未来，「{n}」正位预示{k}的光景正在前方成形。',
     '前方的路上，「{n}」正位带着{k}的承诺等候着你。',
     '未来的信号来自「{n}」正位：方向不改，{k}便会如约生长。']
  ];
  const LEAD_DOWN = [
    ['过去的「{n}」逆位，暗示{k}的课题曾让你受挫或迟疑。',
     '旧日里「{n}」逆位投下阴影，关于{k}的遗憾仍需被温柔安放。',
     '回望过往，「{n}」逆位提示你曾在{k}面前用力失衡。'],
    ['眼下「{n}」逆位，{k}的能量略显阻滞，需要你耐心疏通。',
     '现在的你与「{n}」逆位相遇，{k}成了近期要重新学习的功课。',
     '此刻「{n}」逆位提醒：别在{k}的议题上逃避或硬撑。'],
    ['未来的「{n}」逆位是善意的预警：若不调整，{k}的难题可能重演。',
     '前方「{n}」逆位提示，{k}需要你提前留出余地与耐心。',
     '「{n}」逆位落在未来并非坏兆头，而是提醒你修好关于{k}的功课。']
  ];
  const ADVICE = [
    '三张牌皆为正位，能量沿时间线顺畅流动——你正走在与自己一致的路上，保持这份节奏，大胆迈步便是。',
    '正位连成一线，过去的积累、当下的行动与未来的方向彼此印证，相信你已经准备好迎接下一程。',
    '仅有一张逆位，像旅途中一次温柔的提醒：在它所指的位置稍作调整，整条时间线便会重新亮起来。',
    '一张逆位并非阻碍，而是路标，指出此刻最值得你花心思关照的环节。',
    '两张逆位邀请你慢下来：先安顿内在，再推进外在；课题被看见之后，路会比想象中短。',
    '逆位较多时不必慌张，它们只是要求你用更诚实的方式面对自己——调整步调，转机自会出现。',
    '三张逆位共同指向一次必要的内在清理：旧模式已完成使命，松开手，新的循环才会开启。',
    '逆位三连并非宣判，而是命运请你暂停、重估、再生；对自己温柔一些，答案会在松弛中浮现。'
  ];
  const SINGLE_UP = [
    '今日，「{n}」正位来到你身边，带来的讯息是{k}。',
    '今天为你显现的是「{n}」正位，{k}是这一天的主旋律。',
    '「{n}」以正位开启你的一天，不妨带着{k}的心情启程。'
  ];
  const SINGLE_DOWN = [
    '今日，「{n}」以逆位显现，它提醒你温柔照看关于{k}的议题。',
    '今天抽到「{n}」逆位，{k}的能量暂时收敛，正好用来整理与休整。',
    '「{n}」逆位来到今天，不是阻碍，而是请你在{k}面前换一种节奏。'
  ];
  const TIP_UP = [
    '顺势去做那件你犹豫已久的小事，星光会站在行动者一边。',
    '保持开放与觉察，留意今天出现的巧合与暗示。',
    '把注意力放在你能给出的东西上，好运会在行动中显形。'
  ];
  const TIP_DOWN = [
    '慢一点也没关系，今天适合修补，而不是冲刺。',
    '留意反复浮现的情绪，它是在提醒你好好照顾自己。',
    '不必强撑正面，承认疲惫，本身也是一种前进。'
  ];
  const CLOSING = [
    '愿星光照见你的选择。',
    '深呼吸，然后把答案交给生活去验证。',
    '牌面只提供星图，行路的人始终是你。',
    '带着这束光，继续走今天的路吧。'
  ];

  function fillTpl(tpl, card) {
    return tpl.replace('{n}', card.name).replace('{k}', card.kw.join('、'));
  }

  /* ============================================================
     四、DOM 引用与占卜状态
     ============================================================ */
  const $ = function (sel) { return document.querySelector(sel); };

  const screenChoose = $('#screenChoose');
  const screenDeal = $('#screenDeal');
  const dealTitle = $('#dealTitle');
  const dealHint = $('#dealHint');
  const fanWrap = $('#fanWrap');
  const fanEl = $('#fan');
  const randomBtn = $('#randomBtn');
  const slotsEl = $('#slots');
  const readingPanel = $('#readingPanel');
  const muteBtn = $('#muteBtn');
  const muteText = $('#muteText');

  let spreadSize = 1;           // 牌阵规模：1 或 3
  let deckOrder = [];           // 本次洗牌后的牌堆（CARDS 索引）
  let slots = [];               // 牌位：{ card, reversed, flipped }
  let pickedCount = 0;          // 已就位数量
  let flippedCount = 0;         // 已翻开数量
  let session = 0;              // 会话编号，用于作废过期定时器
  let autoRunning = false;      // 随机抽取进行中

  const BACK_SVG = buildBackSVG();

  /* ============================================================
     五、WebAudio 风铃音效（无音频文件，全部合成）
     ============================================================ */
  let audioCtx = null;
  let muted = false;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // 单个泛音音粒
  function tone(freq, startOffset, duration, volume) {
    const ac = ensureAudio();
    if (!ac || muted) return;
    const t0 = ac.currentTime + startOffset;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // 五声音阶风铃
  const CHIME = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  function playPick() {
    const f = CHIME[3 + Math.floor(Math.random() * 3)];
    tone(f, 0, 0.55, 0.07);
  }
  function playFlip() {
    const base = CHIME[Math.floor(Math.random() * CHIME.length)];
    tone(base, 0, 1.15, 0.16);
    tone(base * 2, 0.06, 0.9, 0.05);
  }
  function playReveal() {
    CHIME.slice(1).forEach(function (f, i) { tone(f, i * 0.11, 1.0, 0.11); });
  }

  /* ============================================================
     六、程序化星空（闪烁星点 + 流星微光粒子）
     ============================================================ */
  (function initStars() {
    const canvas = $('#starCanvas');
    const ctx = canvas.getContext('2d');
    let stars = [];
    let shooters = [];
    let w = 0, h = 0, dpr = 1;
    let nextShoot = 120;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const total = Math.min(180, Math.floor(w * h / 8500));
      stars = [];
      for (let i = 0; i < total; i++) {
        const roll = Math.random();
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.4 + Math.random() * 1.3,
          ph: Math.random() * Math.PI * 2,
          sp: 0.4 + Math.random() * 1.1,
          color: roll < 0.12 ? '212,175,122' : (roll < 0.22 ? '34,211,238' : '224,228,255')
        });
      }
    }

    function spawnShooter() {
      const fromLeft = Math.random() < 0.5;
      shooters.push({
        x: fromLeft ? Math.random() * w * 0.5 : w * 0.5 + Math.random() * w * 0.5,
        y: Math.random() * h * 0.32,
        vx: (fromLeft ? 1 : -1) * (3.2 + Math.random() * 2.6),
        vy: 2.2 + Math.random() * 1.8,
        life: 0,
        max: 55 + Math.random() * 25,
        gold: Math.random() < 0.55
      });
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      // 闪烁星点
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const a = 0.25 + 0.7 * Math.abs(Math.sin(t * 0.001 * s.sp + s.ph));
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgb(' + s.color + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // 流星
      nextShoot--;
      if (nextShoot <= 0) {
        spawnShooter();
        nextShoot = 240 + Math.random() * 360;
      }
      shooters = shooters.filter(function (m) { return m.life < m.max; });
      shooters.forEach(function (m) {
        const fade = 1 - m.life / m.max;
        const tailX = m.x - m.vx * 8;
        const tailY = m.y - m.vy * 8;
        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        const c = m.gold ? '212,175,122' : '160,220,255';
        grad.addColorStop(0, 'rgba(' + c + ',0)');
        grad.addColorStop(1, 'rgba(' + c + ',' + (fade * 0.85).toFixed(3) + ')');
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        m.x += m.vx;
        m.y += m.vy;
        m.life++;
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
  })();

  /* ============================================================
     七、占卜流程控制
     ============================================================ */

  // 洗牌（Fisher–Yates）
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // 根据屏宽排布扇形牌堆
  function layoutFan() {
    const step = window.innerWidth < 560 ? 15 : 30;
    const cards = fanEl.querySelectorAll('.fan-card');
    cards.forEach(function (el, idx) {
      const i = idx - (cards.length - 1) / 2;
      el.style.setProperty('--tx', (i * step).toFixed(1) + 'px');
      el.style.setProperty('--ty', (Math.abs(i) * 2.2).toFixed(1) + 'px');
      el.style.setProperty('--rot', (i * 4.3).toFixed(2) + 'deg');
    });
  }

  function setHint(text, glow) {
    dealHint.textContent = text;
    dealHint.classList.toggle('glow', !!glow);
  }

  // 渲染扇形牌堆，并播放交错展开动画
  function renderFan() {
    fanEl.innerHTML = '';
    deckOrder.forEach(function (cardIdx, pos) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fan-card fresh';
      btn.dataset.pos = pos;
      btn.setAttribute('aria-label', '未翻开的塔罗牌');
      btn.innerHTML = BACK_SVG;
      btn.addEventListener('click', function () { pickFromFan(pos); });
      fanEl.appendChild(btn);
    });
    layoutFan();
    // 双帧后开始展开，逐张延迟形成发牌波纹
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        const cards = fanEl.querySelectorAll('.fan-card');
        cards.forEach(function (el, idx) {
          el.style.transitionDelay = (idx * 18) + 'ms';
          el.classList.remove('fresh');
        });
        setTimeout(function () {
          cards.forEach(function (el) { el.style.transitionDelay = ''; });
        }, cards.length * 18 + 700);
      });
    });
  }

  // 渲染牌位
  function renderSlots() {
    slotsEl.innerHTML = '';
    const labels = spreadSize === 1 ? ['今日指引'] : POS_LABELS;
    labels.forEach(function (label, i) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML =
        '<div class="slot-label">' + label + '</div>'
        + '<div class="placeholder"><span></span></div>'
        + '<div class="card-caption"></div>';
      slotsEl.appendChild(slot);
    });
  }

  // 开始一次占卜
  function startSpread(size) {
    session++;
    spreadSize = size;
    slots = [];
    for (let i = 0; i < size; i++) slots.push(null);
    pickedCount = 0;
    flippedCount = 0;
    autoRunning = false;
    deckOrder = shuffle(CARDS.map(function (c) { return c.id; }));

    screenChoose.classList.add('hidden');
    screenDeal.classList.remove('hidden');
    readingPanel.className = 'reading hidden';
    readingPanel.innerHTML = '';
    fanWrap.classList.remove('collapsed');
    randomBtn.classList.remove('hidden');

    dealTitle.textContent = size === 1 ? '今日指引 · 单牌牌阵' : '过去 · 现在 · 未来 · 三牌牌阵';
    setHint('从牌堆中点选 ' + size + ' 张牌，也可以直接使用「随机抽取」。');
    renderSlots();
    renderFan();
  }

  // 从扇形牌堆中抽出一张并就位
  function pickFromFan(pos) {
    if (pickedCount >= spreadSize) return;
    const fanCard = fanEl.querySelector('.fan-card[data-pos="' + pos + '"]');
    if (!fanCard || fanCard.classList.contains('picked')) return;

    const slotIndex = pickedCount;
    const card = CARDS[deckOrder[pos]];
    const reversed = Math.random() < 0.5;
    slots[slotIndex] = { card: card, reversed: reversed, flipped: false };

    fanCard.classList.add('picked');
    dealCardToSlot(slotIndex);
    pickedCount++;
    playPick();

    if (pickedCount >= spreadSize) {
      onAllDealt();
    } else {
      setHint('已选择 ' + pickedCount + ' / ' + spreadSize + ' 张，请继续。');
    }
  }

  // 把牌“发”到对应牌位
  function dealCardToSlot(i) {
    const data = slots[i];
    const slotEl = slotsEl.children[i];
    const placeholder = slotEl.querySelector('.placeholder');
    placeholder.style.display = 'none';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card3d';
    btn.dataset.slot = i;
    btn.style.animationDelay = (i * 0.12) + 's';
    btn.setAttribute('aria-label', '点击翻开这张塔罗牌');
    btn.innerHTML =
      '<div class="card-inner">'
      + '<div class="face face-front">'
      + faceSVG(data.card, data.reversed)
      + (data.reversed ? '<span class="rev-badge">逆位</span>' : '')
      + '</div>'
      + '<div class="face face-back">' + BACK_SVG + '</div>'
      + '</div>';
    btn.addEventListener('click', function () { flipSlot(i); });
    slotEl.insertBefore(btn, slotEl.querySelector('.card-caption'));
  }

  // 全部就位：收起牌堆
  function onAllDealt() {
    autoRunning = false;
    setHint('牌已就位——轻触牌背，让命运逐张翻开。', true);
    const current = session;
    const cards = fanEl.querySelectorAll('.fan-card');
    cards.forEach(function (el) {
      const pos = Number(el.dataset.pos);
      el.style.transitionDelay = (Math.abs(pos - 10.5) * 14) + 'ms';
    });
    fanWrap.classList.add('collapsed');
    setTimeout(function () {
      if (current !== session) return;
      randomBtn.classList.add('hidden');
      fanEl.innerHTML = '';
    }, 650);
  }

  // 随机抽取剩余牌位
  function autoPick() {
    if (autoRunning || pickedCount >= spreadSize) return;
    autoRunning = true;
    const current = session;
    function step() {
      if (current !== session || !autoRunning) return;
      if (pickedCount >= spreadSize) return;
      const remain = [];
      fanEl.querySelectorAll('.fan-card:not(.picked)').forEach(function (el) {
        remain.push(Number(el.dataset.pos));
      });
      if (!remain.length) return;
      const pos = remain[Math.floor(Math.random() * remain.length)];
      pickFromFan(pos);
      if (pickedCount < spreadSize) setTimeout(step, 260);
    }
    setTimeout(step, 120);
  }

  // 翻开某个牌位
  function flipSlot(i) {
    const data = slots[i];
    if (!data || data.flipped) return;
    data.flipped = true;
    flippedCount++;

    const slotEl = slotsEl.children[i];
    const btn = slotEl.querySelector('.card3d');
    btn.classList.add('flipped');
    btn.setAttribute('aria-label', data.card.name + (data.reversed ? ' 逆位' : ' 正位'));
    playFlip();

    // 牌下关键词简述
    const cap = slotEl.querySelector('.card-caption');
    cap.innerHTML =
      '<div class="cap-name">' + data.card.name
      + '<span class="ori ' + (data.reversed ? 'down' : 'up') + '">'
      + (data.reversed ? '逆位' : '正位') + '</span></div>'
      + '<div class="cap-kw">' + data.card.kw.map(function (k) {
        return '<span class="kw-chip">' + k + '</span>';
      }).join('') + '</div>';
    cap.classList.add('show');

    if (flippedCount < spreadSize) {
      setHint('已翻开 ' + flippedCount + ' / ' + spreadSize + ' 张……');
    } else {
      setHint('群星已将答案铺展于你眼前。', true);
      setTimeout(revealReading, 750);
    }
  }

  // 生成并展示综合解读
  function revealReading() {
    playReveal();
    const labels = spreadSize === 1 ? ['今日'] : POS_LABELS;
    let html = '<div class="reading-head"><span class="line"></span><h3>综合解读</h3><span class="line r"></span></div>';

    if (spreadSize === 1) {
      const d = slots[0];
      const pool = d.reversed ? SINGLE_DOWN : SINGLE_UP;
      const tipPool = d.reversed ? TIP_DOWN : TIP_UP;
      html += '<p class="syn-text">' + fillTpl(pool[d.card.id % pool.length], d.card) + '</p>';
      html += '<p class="syn-text">' + (d.reversed ? d.card.down : d.card.up) + '</p>';
      html += '<p class="syn-text"><span class="hl-c">' + tipPool[d.card.id % tipPool.length] + '</span></p>';
    } else {
      let revCount = 0;
      let detail = '<div class="detail-list">';
      const clauses = slots.map(function (d, i) {
        if (d.reversed) revCount++;
        const pool = d.reversed ? LEAD_DOWN[i] : LEAD_UP[i];
        detail += '<div class="detail-item"><div class="detail-title">'
          + '<span class="pos">' + POS_LABELS[i] + '</span>' + d.card.name
          + '<span class="ori ' + (d.reversed ? 'down' : 'up') + '">'
          + (d.reversed ? '逆位' : '正位') + '</span></div>'
          + '<div class="detail-text">' + (d.reversed ? d.card.down : d.card.up) + '</div></div>';
        return fillTpl(pool[d.card.id % pool.length], d.card);
      });
      detail += '</div>';

      // 逆位张数决定建议段；再按三张牌编号和决定取句，保证不可预测又不重复堆叠
      const adviceIdx = revCount * 2 + (slots.reduce(function (s, d) { return s + d.card.id; }, 0) % 2);
      const closingIdx = slots.reduce(function (s, d) { return s + d.card.id * (d.reversed ? 2 : 1) + 3; }, 0) % CLOSING.length;

      html += '<p class="syn-text">' + clauses.join('') + '</p>';
      html += '<p class="syn-text"><span class="hl">' + ADVICE[adviceIdx] + '</span></p>';
      html += '<p class="syn-text">' + CLOSING[closingIdx] + '</p>';
      html += detail;
    }

    html += '<div class="reading-actions"><button id="resetBtn" class="btn-gold" type="button">重新占卜</button></div>';
    readingPanel.innerHTML = html;
    readingPanel.classList.remove('hidden');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { readingPanel.classList.add('show'); });
    });
    $('#resetBtn').addEventListener('click', backToChoose);

    setTimeout(function () {
      readingPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
  }

  // 回到牌阵选择
  function backToChoose() {
    session++;
    autoRunning = false;
    slots = [];
    pickedCount = 0;
    flippedCount = 0;
    fanEl.innerHTML = '';
    slotsEl.innerHTML = '';
    readingPanel.className = 'reading hidden';
    readingPanel.innerHTML = '';
    fanWrap.classList.remove('collapsed');
    randomBtn.classList.add('hidden');
    screenDeal.classList.add('hidden');
    screenChoose.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
     八、事件绑定
     ============================================================ */
  document.querySelectorAll('.spread-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      ensureAudio();
      startSpread(Number(btn.dataset.spread));
    });
  });
  randomBtn.addEventListener('click', function () { ensureAudio(); autoPick(); });
  window.addEventListener('resize', layoutFan);

  muteBtn.addEventListener('click', function () {
    muted = !muted;
    document.body.classList.toggle('sound-off', muted);
    muteText.textContent = muted ? '音效 关' : '音效 开';
    if (!muted) ensureAudio();
  });
})();
