/** CineSaga's deterministic, local story model. No generative AI is involved. */
import { identityContinuity, validateIdentity, duplicateCharacterIdentity, getVersion } from './identity.js';
import {validateStoryRecords,assertProposal,assertContractObject} from './story-contract.js';
import {assertManualWork} from './manual-work-contract.js';
import {assertDirectorWork,assertDirectorHistory} from './director-contract.js';
import {assertAgentWork,assertOriginalStory} from './agent-contract.js';
import {assertBridgeWork,assertBridgeStory} from './chatgpt-bridge-contract.js';
export const BACKUP_FORMAT = 'cinesaga-ai-backup';
export const SCHEMA_VERSION = 1;
export const EPISODE_STATUSES = ['Idea', 'Planned', 'Storyboarded', 'Ready for generation', 'Generated', 'Approved'];
const copy = value => structuredClone(value);
export function uid() { return crypto.randomUUID(); }
export function newCharacter() {
  return { id: uid(), name: '', role: '', ageRange: '', appearance: '', clothing: '', personality: '', voice: '', goals: '', fears: '', relationships: '', knows: '', doesNotKnow: '', firstEpisode: 1, referenceImageId: '', archived: false };
}
export function newLocation() {
  return { id: uid(), name: '', description: '', timeOfDay: '', lighting: '', atmosphere: '', importantObjects: '', purpose: '', referenceImageId: '', archived: false };
}
export function newScene(number = 1) {
  return { id: uid(), number, locationId: '', characterIds: [], visual: '', camera: 'Wide shot', action: '', dialogue: '', narration: '', sound: '', music: '', seconds: 30, imageStatus: 'NOT_CONFIGURED', videoStatus: 'NOT_CONFIGURED', knowledgeUsed: '', appearanceOverrides: '', clothingOverrides: '', timeline: '', archived: false };
}
export function newEpisode(number = 1, minutes = 5) {
  return { id: uid(), number, title: `Episode ${number}`, beginning: '', mainEvent: '', turningPoint: '', ending: '', characterIds: [], locationIds: [], durationMinutes: minutes, status: 'Idea', continuedFrom: '', continuityFacts: '', unresolvedEvents: '', currentStates: '', timelineStart: '', scenes: [], archived: false };
}
export function duplicateEntity(entity) {
  const result = copy(entity);
  result.id = uid();
  if (entity.identity) result.identity = duplicateCharacterIdentity(entity);
  if (result.name) result.name += ' (copy)';
  if (result.title) result.title += ' (copy)';
  if (Array.isArray(result.scenes)) result.scenes = result.scenes.map(duplicateEntity);
  result.archived = false;
  return result;
}
export function archiveEntity(entity) { return { ...copy(entity), archived: true }; }
export function restoreEntity(entity) { return { ...copy(entity), archived: false }; }
export function reorderScenes(scenes, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= scenes.length || to >= scenes.length) return copy(scenes);
  const result = copy(scenes);
  const [scene] = result.splice(from, 1);
  result.splice(to, 0, scene);
  return result.map((scene, index) => ({ ...scene, number: index + 1 }));
}

export function createSeries(input = {}) {
  const config = {
    idea: String(input.idea || '').trim(), genre: String(input.genre || 'Mystery'), audience: String(input.audience || 'Family'),
    language: input.language === 'ar' ? 'ar' : 'en', dialect: String(input.dialect || 'Egyptian'), visualStyle: String(input.visualStyle || 'Cinematic realistic'),
    episodeCount: Math.min(24, Math.max(1, Number(input.episodeCount) || 6)), episodeMinutes: Math.min(120, Math.max(1, Number(input.episodeMinutes) || 5)),
    controlMode: String(input.controlMode || 'Direct with me')
  };
  config.episodeCount = Math.round(config.episodeCount);
  const ar = config.language === 'ar';
  const fallbackTitle = ar ? 'حكاية جديدة' : 'An untold story';
  const title = (config.idea ? config.idea.replace(/[.!?؟\n].*$/s, '').split(/\s+/).slice(0, 7).join(' ') : '') || fallbackTitle;
  const premise = config.idea || (ar ? 'رحلة تبدأ باكتشاف غير متوقع.' : 'A journey begins with an unexpected discovery.');
  const time = new Date().toISOString();
  const character = { ...newCharacter(), name: ar ? 'البطل' : 'The protagonist', role: ar ? 'الشخصية الرئيسية' : 'Protagonist', ageRange: config.audience, personality: ar ? 'فضولي ومصمم' : 'Curious and determined', goals: ar ? 'فهم الاكتشاف وحماية الأصدقاء' : 'Understand the discovery and protect their friends', fears: ar ? 'فقدان ثقة الأصدقاء' : 'Losing the trust of friends', firstEpisode: 1 };
  const location = { ...newLocation(), name: ar ? 'بداية الرحلة' : 'The starting place', description: ar ? 'مكان مألوف يخفي شيئًا غير متوقع.' : 'A familiar place concealing something unexpected.', purpose: ar ? 'تقديم العالم وبداية الصراع' : 'Introduce the world and the central conflict', timeOfDay: ar ? 'صباحًا' : 'Morning', lighting: ar ? 'ضوء طبيعي' : 'Natural light' };
  const beats = ar ? [
    ['البداية', 'تظهر علامة غير متوقعة في الحياة اليومية.', 'يقرر البطل متابعة العلامة.', 'تفتح العلامة بابًا لسؤال أكبر.'],
    ['أول اختبار', 'تبدأ محاولة فهم ما حدث.', 'يكشف دليل جديد عن مخاطرة.', 'يواجه البطل اختيارًا صعبًا.'],
    ['خيط خفي', 'تتصل الأدلة السابقة ببعضها.', 'يتغير فهم البطل للمشكلة.', 'يظهر حليف غير متوقع.'],
    ['الثمن', 'يُختبر ولاء الأصدقاء.', 'يتطلب التقدم تضحية.', 'يقترب الخطر من مكان آمن.'],
    ['قبل النهاية', 'يستعد الجميع للمواجهة.', 'تظهر الحقيقة التي كانت مخفية.', 'يصبح القرار الأخير ضروريًا.'],
    ['الاختيار', 'تلتقي الخيوط عند المواجهة الأخيرة.', 'يختار البطل ما يؤمن به.', 'يُحل الصراع وتظهر بداية جديدة.']
  ] : [
    ['The discovery', 'An unexpected sign interrupts ordinary life.', 'The protagonist chooses to follow the sign.', 'The sign opens a door to a larger question.'],
    ['The first test', 'The search for answers begins.', 'A new clue reveals a risk.', 'The protagonist faces a difficult choice.'],
    ['A hidden thread', 'Earlier clues begin to connect.', 'The protagonist reconsiders the conflict.', 'An unexpected ally appears.'],
    ['The cost', 'The friends test their trust in one another.', 'Progress demands a sacrifice.', 'Danger reaches a place that once felt safe.'],
    ['Before the ending', 'Everyone prepares for the confrontation.', 'A hidden truth comes to light.', 'The final choice can no longer wait.'],
    ['The choice', 'The threads converge in a final confrontation.', 'The protagonist acts on their beliefs.', 'The conflict resolves and a new beginning appears.']
  ];
  const episodes = Array.from({ length: config.episodeCount }, (_, index) => {
    const beatIndex = config.episodeCount === 1 ? 5 : Math.round(index / (config.episodeCount - 1) * 5);
    const beat = beats[beatIndex];
    return { ...newEpisode(index + 1, config.episodeMinutes), title: beat[0], beginning: beat[1], mainEvent: premise, turningPoint: beat[2], ending: beat[3], characterIds: [character.id], locationIds: [location.id], status: 'Planned', timelineStart: index + 1, continuityFacts: ar ? 'تظل قواعد العالم وصفات الشخصية ثابتة.' : 'The world rules and character traits remain consistent.', currentStates: ar ? 'البطل يتابع هدفه.' : 'The protagonist is pursuing their goal.' };
  });
  for (let i = 1; i < episodes.length; i++) episodes[i].continuedFrom = episodes[i - 1].ending;
  return {
    id: uid(), title, idea: premise, config, demo: false, createdAt: time, updatedAt: time,
    bible: { title, premise, genreTone: `${config.genre} · ${ar ? 'فضول وأمل' : 'Curiosity and hope'}`, ending: episodes.at(-1).ending,
      worldRules: ar ? 'كل اكتشاف له سبب. لا تعرف الشخصيات أسرارًا قبل تعلّمها.' : 'Every discovery has a cause. Characters cannot know a secret before learning it.',
      timeline: ar ? 'تجري الأحداث بترتيب الحلقات.' : 'Events unfold in episode order.', conflict: ar ? 'على البطل فهم الاكتشاف قبل فوات الأوان.' : 'The protagonist must understand the discovery before time runs out.',
      revealedSecrets: '', unrevealedSecrets: ar ? 'المعنى الحقيقي للاكتشاف.' : 'The true meaning of the discovery.', importantObjects: '', continuityNotes: ar ? 'مخطط محلي قابل للتعديل؛ ليس توليدًا بالذكاء الاصطناعي.' : 'Editable local template; not AI generation.' },
    characters: [character], locations: [location], episodes, events: [], ignoredIssues: {}
  };
}

export function createDemoSeries(language = 'en') {
  const ar = language === 'ar';
  const p = createSeries({ idea: ar ? 'ثلاثة أطفال يكتشفون مدينة مخفية تحت مدرستهم.' : 'Three children discover a hidden city beneath their school.', genre: 'Mystery', audience: 'Children and family', language, dialect: 'Egyptian', visualStyle: '3D animation', episodeCount: 6, episodeMinutes: 5, controlMode: 'Direct with me' });
  p.title = 'The City Beneath the School'; p.demo = true;
  p.bible = {
    title: p.title, premise: p.idea, genreTone: ar ? 'غموض ومغامرة · دهشة وصداقة' : 'Mystery adventure · Wonder, friendship, and gentle suspense',
    ending: ar ? 'يحمي الأطفال المدينة ويساعدون أهلها على التواصل مع العالم فوقهم.' : 'The children protect the city and help its people reconnect with the world above.',
    worldRules: ar ? 'تفتح أبواب المدينة بالنغمات. ينطفئ الضوء الأزرق عند الكذب. لا يمكن إخراج حجر القلب من المدينة.' : 'City doors open to musical notes. Blue lights dim when someone lies. The heartstone cannot leave the city.',
    timeline: ar ? 'ستة أيام متتالية خلال الأسبوع الدراسي، من الاكتشاف حتى إعادة فتح البوابة.' : 'Six consecutive school days, from the discovery to the reopening of the gate.',
    conflict: ar ? 'توشك المدينة على فقدان ضوئها ويجب العثور على حجر القلب.' : 'The city is losing its light; the children must find its missing heartstone.',
    revealedSecrets: ar ? 'يوجد سلم خلف خزانة الخرائط. الأبواب تستجيب للموسيقى.' : 'A staircase hides behind the map cupboard. Doors respond to music.',
    unrevealedSecrets: ar ? 'هوية الحارس. سبب اختفاء حجر القلب.' : 'The guardian’s identity. Why the heartstone disappeared.',
    importantObjects: ar ? 'مفتاح نحاسي، دفتر لينا، حجر القلب.' : 'A brass key, Lina’s notebook, the heartstone.',
    continuityNotes: ar ? 'تظل ملابس الأطفال ثابتة طوال اليوم. توجد مشكلة معرفة متعمدة واحدة في المشهد الخامس للاختبار.' : 'Keep the children’s clothing consistent within each day. Scene 5 contains one deliberate knowledge issue for the checker.'
  };
  const lina = { ...newCharacter(), name: ar ? 'لينا' : 'Lina', role: ar ? 'قائدة المجموعة ورسامة الخرائط' : 'Mapmaker and team leader', ageRange: '11–12', appearance: ar ? 'شعر داكن مجعد ونظارة مستديرة' : 'Dark curly hair, round glasses', clothing: ar ? 'سترة صفراء وحقيبة كحلية' : 'Yellow jacket and navy backpack', personality: ar ? 'فضولية ودقيقة وشجاعة' : 'Curious, observant, quietly brave', voice: ar ? 'صوت طفلة واضح وحيوي' : 'Clear, energetic child voice', goals: ar ? 'رسم خريطة المدينة وحماية أصدقائها' : 'Map the city and keep her friends safe', fears: ar ? 'أن يضل أحد الأصدقاء الطريق' : 'A friend getting lost', relationships: ar ? 'صديقة عمر ويوسف منذ الطفولة' : 'Childhood friend of Omar and Youssef', knows: ar ? 'السلم خلف خزانة الخرائط\nالأبواب تستجيب للموسيقى' : 'The staircase is behind the map cupboard\nDoors respond to music', doesNotKnow: ar ? 'الحارس هو مدير المدرسة' : 'The guardian is the headteacher', firstEpisode: 1 };
  const omar = { ...newCharacter(), name: ar ? 'عمر' : 'Omar', role: ar ? 'المخترع' : 'Inventor', ageRange: '11–12', appearance: ar ? 'شعر أسود قصير ونمش خفيف' : 'Short black hair and light freckles', clothing: ar ? 'قميص أخضر وحذاء رياضي أبيض' : 'Green shirt and white trainers', personality: ar ? 'مرح وعملي ويحب التجربة' : 'Playful, practical, eager to experiment', voice: ar ? 'صوت دافئ سريع الكلام' : 'Warm, quick-speaking child voice', goals: ar ? 'فهم آليات المدينة' : 'Understand the city’s mechanisms', fears: ar ? 'تعطل اختراعه عندما يحتاجه الجميع' : 'His inventions failing when needed', relationships: ar ? 'يساعد لينا ويشجع يوسف' : 'Helps Lina and encourages Youssef', knows: ar ? 'الأبواب تستجيب للموسيقى' : 'Doors respond to music', doesNotKnow: ar ? 'مكان حجر القلب' : 'The heartstone’s location', firstEpisode: 1 };
  const youssef = { ...newCharacter(), name: ar ? 'يوسف' : 'Youssef', role: ar ? 'الموسيقي والملاحظ' : 'Musician and careful observer', ageRange: '10–11', appearance: ar ? 'شعر بني مموج وعينان بنيتان' : 'Wavy brown hair and brown eyes', clothing: ar ? 'كنزة زرقاء وبنطال رمادي' : 'Blue jumper and grey trousers', personality: ar ? 'هادئ وخيالي ومخلص' : 'Thoughtful, imaginative, loyal', voice: ar ? 'صوت لطيف وهادئ' : 'Soft, gentle child voice', goals: ar ? 'معرفة اللحن الذي يحمي المدينة' : 'Find the melody that protects the city', fears: ar ? 'الأصوات العالية والظلام' : 'Loud noises and darkness', relationships: ar ? 'يثق بلينا ويعتمد على عمر' : 'Trusts Lina and relies on Omar', knows: ar ? 'الأبواب تستجيب للموسيقى' : 'Doors respond to music', doesNotKnow: ar ? 'هوية الحارس' : 'The guardian’s identity', firstEpisode: 1 };
  p.characters = [lina, omar, youssef];
  const school = { ...newLocation(), name: ar ? 'غرفة الخرائط' : 'The school map room', description: ar ? 'غرفة هادئة مليئة بالخرائط القديمة وخزانة نحاسية.' : 'A quiet room of faded maps, tall shelves, and one brass-handled cupboard.', timeOfDay: ar ? 'بعد انتهاء الدروس' : 'After school', lighting: ar ? 'شمس ذهبية من نوافذ عالية' : 'Golden sunlight through high windows', atmosphere: ar ? 'مألوف لكنه غامض' : 'Familiar, dusty, expectant', importantObjects: ar ? 'خزانة الخرائط والمفتاح النحاسي' : 'Map cupboard and brass key', purpose: ar ? 'بوابة الاكتشاف' : 'The threshold to the discovery' };
  const city = { ...newLocation(), name: ar ? 'المدينة الزرقاء' : 'The blue city', description: ar ? 'مدينة تحت الأرض، جسور حجرية وقنوات مضيئة وأبراج موسيقية.' : 'An underground city of stone bridges, glowing canals, and musical towers.', timeOfDay: ar ? 'شفق دائم' : 'Perpetual twilight', lighting: ar ? 'ضوء أزرق من البلورات' : 'Blue crystal light', atmosphere: ar ? 'مهيب وجميل وهش' : 'Majestic, beautiful, fragile', importantObjects: ar ? 'بوابة موسيقية ومكان حجر القلب' : 'Musical gate and heartstone pedestal', purpose: ar ? 'العالم السري ومركز الصراع' : 'The hidden world and heart of the conflict' };
  p.locations = [school, city];
  const outlines = ar ? [
    ['السلم الخفي', 'يعود الأطفال إلى غرفة الخرائط بعد الدروس.', 'يفتح مفتاح نحاسي ممرًا خلف الخزانة.', 'يفتح لحن يوسف البوابة الحجرية.', 'تظهر رسالة مضيئة: أعيدوا حجر القلب قبل أن ينطفئ الضوء.'],
    ['المدينة التي تغني', 'يناقش الأطفال رسالة حجر القلب.', 'يتبعون الأصوات عبر المدينة.', 'يفهمون أن الضوء يكشف الكذب.', 'يختفي ظل غريب داخل برج الساعات.'],
    ['ظل البرج', 'يبحث الأطفال عن الظل داخل البرج.', 'يعثرون على دفتر قديم.', 'يشير الدفتر إلى صلة بالمدرسة.', 'يظهر ختم مدير المدرسة على الخريطة القديمة.'],
    ['سر الحارس', 'يفحص الأطفال ختم المدير.', 'يواجهون الحارس في المدينة.', 'يعترف المدير بأنه كان يحمي المكان.', 'يكشف الحارس أن حجر القلب محبوس تحت البوابة.'],
    ['اللحن المفقود', 'يخطط الأطفال لتحرير حجر القلب.', 'يركب عمر جهازًا يكرر النغمات.', 'يكمل يوسف اللحن بمساعدة أصدقائه.', 'تبدأ البوابة في الانهيار قبل تحرير الحجر.'],
    ['نور جديد', 'يحاول الأطفال تثبيت البوابة المنهارة.', 'يعمل الجميع مع الحارس لإنقاذ المدينة.', 'تختار لينا إعادة الحجر بدل الاحتفاظ به.', 'يعود النور وتصبح المدرسة جسرًا بين العالمين.']
  ] : [
    ['The hidden staircase', 'The children return to the map room after school.', 'A brass key opens a passage behind the cupboard.', 'Youssef’s melody opens a stone gate.', 'A glowing message appears: Return the heartstone before the light goes out.'],
    ['The singing city', 'The children discuss the heartstone message.', 'They follow strange sounds across the city.', 'They discover that the lights reveal lies.', 'A mysterious shadow disappears into the clock tower.'],
    ['The tower’s shadow', 'The children follow the shadow into the tower.', 'They find a weathered notebook.', 'The notebook links the city to their school.', 'The headteacher’s seal appears on the old map.'],
    ['The guardian’s secret', 'The children investigate the headteacher’s seal.', 'They confront the city’s guardian.', 'The headteacher admits he has been protecting the city.', 'The guardian reveals that the heartstone is trapped beneath the gate.'],
    ['The lost melody', 'The children plan to free the heartstone.', 'Omar builds a device that repeats musical notes.', 'Youssef completes the melody with help from his friends.', 'The gate begins to collapse before the stone is freed.'],
    ['A new light', 'The children try to hold the collapsing gate.', 'They work with the guardian to save the city.', 'Lina chooses to return the stone instead of keeping it.', 'Light returns, and the school becomes a bridge between the two worlds.']
  ];
  p.episodes = outlines.map((o, index) => ({ ...newEpisode(index + 1, 5), title: o[0], beginning: o[1], mainEvent: o[2], turningPoint: o[3], ending: o[4], characterIds: p.characters.map(c => c.id), locationIds: index ? [city.id] : [school.id, city.id], status: index ? 'Planned' : 'Storyboarded', timelineStart: index + 1,
    continuityFacts: ar ? 'تبقى البوابة موسيقية ولا يغادر حجر القلب المدينة.' : 'The gate responds to music; the heartstone must remain in the city.',
    unresolvedEvents: index < 5 ? (ar ? 'يجب إعادة حجر القلب قبل انطفاء الضوء.' : 'Return the heartstone before the city goes dark.') : '',
    currentStates: ar ? 'لينا تقود، عمر يختبر الآليات، ويوسف يتتبع الألحان.' : 'Lina leads, Omar tests mechanisms, and Youssef listens for melodies.' }));
  for (let i = 1; i < p.episodes.length; i++) p.episodes[i].continuedFrom = p.episodes[i - 1].ending;
  const visuals = ar ? [
    ['أشعة ذهبية تتسلل بين خرائط قديمة.', 'لقطة واسعة', 'تلاحظ لينا خدشًا قرب الخزانة.', 'لينا: الخريطة دي مش كاملة.', 'في آخر يوم عادي، بدأ سر غير عادي.', 'خطوات وورق يتحرك', 'فضول دافئ', school.id],
    ['المفتاح يلمع داخل قفل نحاسي.', 'لقطة قريبة', 'يدير عمر المفتاح وينزلق الرف.', 'عمر: استنوا… فيه سلم هنا!', '', 'طقطقة القفل وصرير الحجر', 'ترقب', school.id],
    ['السلم يقود إلى قوس حجري مضيء.', 'لقطة تتبع', 'يعزف يوسف ثلاث نغمات فيفتح القوس.', 'يوسف: الباب كأنه بيسمعنا.', '', 'ثلاث نغمات وصدى عميق', 'دهشة', city.id],
    ['قنوات زرقاء وأبراج تمتد تحت سقف الكهف.', 'لقطة شديدة الاتساع', 'يتوقف الأطفال أمام المدينة.', 'لينا: مدينة كاملة تحت المدرسة؟', 'كان العالم تحت أقدامهم أكبر مما تخيلوا.', 'مياه وجرس بعيد', 'رهبة واكتشاف', city.id],
    ['رسالة تظهر فوق قاعدة حجرية خالية.', 'لقطة متوسطة', 'تقرأ لينا الرسالة وتدرك أن الوقت قصير.', 'لينا: لازم نرجّع حجر القلب.', '', 'همس بلوري', 'غموض متصاعد', city.id]
  ] : [
    ['Golden shafts of light cross the faded maps.', 'Wide shot', 'Lina notices a scratch beside the cupboard.', 'Lina: This map has a missing piece.', 'On the last ordinary afternoon, an extraordinary secret waited.', 'Footsteps and rustling paper', 'Warm curiosity', school.id],
    ['The brass key glints inside an old lock.', 'Close-up', 'Omar turns the key; the shelves slide aside.', 'Omar: Wait… there are stairs here!', '', 'A lock clicks and stone scrapes', 'Anticipation', school.id],
    ['The stairs end at a softly glowing stone arch.', 'Tracking shot', 'Youssef hums three notes and the arch opens.', 'Youssef: I think the door can hear us.', '', 'Three notes and a deep echo', 'Wonder', city.id],
    ['Blue canals and towers stretch beneath a vast cavern.', 'Extreme wide shot', 'The children stop at the edge of the city.', 'Lina: A whole city beneath our school?', 'The world below their feet was larger than they had imagined.', 'Water and distant bells', 'Awe and discovery', city.id],
    ['A message glows above an empty stone pedestal.', 'Medium shot', 'Lina reads the message and realizes time is running out.', 'Lina: We have to bring the heartstone back.', '', 'A crystalline whisper', 'Rising mystery', city.id]
  ];
  p.episodes[0].scenes = visuals.map((v, index) => ({ ...newScene(index + 1), locationId: v[7], characterIds: p.characters.map(c => c.id), visual: v[0], camera: v[1], action: v[2], dialogue: v[3], narration: v[4], sound: v[5], music: v[6], seconds: [40, 45, 50, 65, 50][index], timeline: 1 }));
  p.episodes[0].scenes[4].knowledgeUsed = `${lina.name}: ${lina.doesNotKnow}`;
  return p;
}

const lines = value => String(value || '').split(/\n+/).map(v => v.trim()).filter(Boolean);
const normalized = value => String(value || '').trim().toLocaleLowerCase().replace(/[.!?؟،,;:]$/g, '');
function knownFact(line, firstEpisode) {
  // Plain lines are baseline knowledge. An optional suffix records a later reveal.
  const timed = line.match(/^(.*?)\s*\|\s*episode:(\d+)(?:\s*\|\s*scene:(\d+))?\s*$/i);
  return timed ? { fact: normalized(timed[1]), episode: Number(timed[2]), scene: Number(timed[3] || 1) } : { fact: normalized(line), episode: Number(firstEpisode) || 1, scene: 1 };
}
function overrideLines(text, character) {
  return lines(text).filter(line => normalized(line.split(':')[0]) === normalized(character.name)).map(line => line.slice(line.indexOf(':') + 1).trim());
}
export function checkContinuity(project) {
  const issues = [];
  const characters = new Map((project.characters || []).map(c => [c.id, c]));
  const locations = new Map((project.locations || []).filter(l => !l.archived).map(l => [l.id, l]));
  const episodes = (project.episodes || []).filter(e => !e.archived).slice().sort((a, b) => a.number - b.number);
  function issue(rule, evidence, episode, scene, suggestion, suffix = '') {
    const id = `${rule}:${episode?.id || 'series'}:${scene?.id || 'episode'}:${suffix}`;
    const messages = {
      introduction: 'Character appears before their introduction.', knowledge: 'Character uses knowledge they have not learned.', archived: 'Archived character is used in a scene.', location: 'Scene location is missing or archived.', cliffhanger: 'Episode does not explicitly continue the previous ending.', appearance: 'Character appearance conflicts with their reference.', clothing: 'Character clothing conflicts with their reference.', timeline: 'Story timeline runs backwards.', duration: 'Scene durations exceed episode duration.', forgotten: 'An unresolved story event has been forgotten.'
    };
    issues.push({ id, rule, message: messages[rule], evidence, episodeId: episode?.id || '', sceneId: scene?.id || '', suggestion, ignoredReason: project.ignoredIssues?.[id] || '' });
  }
  let previousStart = null;
  let priorStoryDay = null;
  for (let i = 0; i < episodes.length; i++) {
    const episode = episodes[i];
    if (i > 0 && episodes[i - 1].ending?.trim() && normalized(episode.continuedFrom) !== normalized(episodes[i - 1].ending)) {
      issue('cliffhanger', `Previous ending: “${episodes[i - 1].ending}” · Continued from: “${episode.continuedFrom || '(empty)'}”`, episode, null, 'Review the previous ending and record its continuation in this episode’s “Continued from” field.');
    }
    const start = episode.timelineStart === '' ? null : Number(episode.timelineStart);
    if (start !== null && Number.isFinite(start)) {
      if (previousStart !== null && start < previousStart) issue('timeline', `Episode timeline ${start} precedes ${previousStart}.`, episode, null, 'Correct the numeric episode timeline or document the flashback in the Story Bible.');
      else if (priorStoryDay !== null && start < priorStoryDay) issue('timeline', `Episode starts on story day ${start}, before the prior episode’s last scene on day ${priorStoryDay}.`, episode, null, 'Correct the episode start or document the intentional flashback in the Story Bible.');
      previousStart = start;
    }
    let previousTime = null;
    const activeScenes = (episode.scenes || []).filter(s => !s.archived);
    const seconds = activeScenes.reduce((sum, scene) => sum + (Number(scene.seconds) || 0), 0);
    if (seconds > Number(episode.durationMinutes) * 60) issue('duration', `${seconds} seconds of scenes exceed the ${Number(episode.durationMinutes) * 60}-second episode budget.`, episode, null, 'Shorten scenes or increase the episode’s duration.');
    for (const scene of activeScenes) {
      if (!locations.has(scene.locationId)) issue('location', `Location ID: ${scene.locationId || '(none selected)'}.`, episode, scene, 'Choose an existing active location, or restore the archived location.');
      const time = scene.timeline === '' ? null : Number(scene.timeline);
      if (time !== null && Number.isFinite(time)) {
        const earlier = previousTime !== null ? previousTime : (start !== null && Number.isFinite(start) ? start : priorStoryDay);
        if (earlier !== null && time < earlier) issue('timeline', `Scene story day ${time} precedes day ${earlier}.`, episode, scene, 'Correct the numeric scene timeline or document the intentional flashback.');
        previousTime = time;
        priorStoryDay = time;
      }
      for (const id of scene.characterIds || []) {
        const c = characters.get(id);
        if (!c) { issue('introduction', `Unknown character ID: ${id}.`, episode, scene, 'Restore the character reference or remove the unknown character from the scene.', id); continue; }
        if (Number(c.firstEpisode) > Number(episode.number)) issue('introduction', `${c.name} first appears in episode ${c.firstEpisode}, but is used in episode ${episode.number}.`, episode, scene, 'Move the introduction earlier, or move this scene after the introduction.', id);
        if (c.archived) issue('archived', `${c.name} is archived but remains in scene ${scene.number}.`, episode, scene, 'Restore the character or remove them from this scene.', id);
        const explicitKnowledge = lines(scene.knowledgeUsed).filter(line => {
          const named = line.includes(':') && [...characters.values()].some(character => normalized(character.name) === normalized(line.split(':')[0]));
          return !named || normalized(line.split(':')[0]) === normalized(c.name);
        }).map(line => {
          const named = line.includes(':') && [...characters.values()].some(character => normalized(character.name) === normalized(line.split(':')[0]));
          return named ? line.slice(line.indexOf(':') + 1).trim() : line;
        });
        const known = lines(c.knows).map(line => knownFact(line, c.firstEpisode)).filter(fact => fact.episode < Number(episode.number) || (fact.episode === Number(episode.number) && fact.scene <= Number(scene.number))).map(fact => fact.fact);
        for (const fact of explicitKnowledge) {
          if (!known.includes(normalized(fact))) issue('knowledge', `${c.name} uses “${fact}”. Their known facts: ${c.knows || '(none recorded)'}.`, episode, scene, `Record when ${c.name} learns this fact, then add it to their known facts; or remove its use from the scene.`, `${id}:${normalized(fact)}`);
        }
        const appearanceVersion=getVersion(c,scene.characterBindings?.find(binding=>binding.characterId===c.id)?.appearanceVersionId);
        const expectedAppearance=appearanceVersion?.board.attributes.face??c.appearance,expectedClothing=appearanceVersion?.board.attributes.clothing??c.clothing;
        for (const value of overrideLines(scene.appearanceOverrides, c)) if (appearanceVersion?.board.locks.face!==false && normalized(value) !== normalized(expectedAppearance)) issue('appearance', `${c.name}: scene “${value}”; character reference “${expectedAppearance}”.`, episode, scene, 'Match the bound appearance version or document a new approved appearance version.', id);
        for (const value of overrideLines(scene.clothingOverrides, c)) if (appearanceVersion?.board.locks.clothing!==false && normalized(value) !== normalized(expectedClothing)) issue('clothing', `${c.name}: scene “${value}”; character reference “${expectedClothing}”.`, episode, scene, 'Match the bound outfit version or create an approved outfit revision.', id);
      }
    }
    for (const event of project.events || []) {
      if (Number(event.introducedEpisode) < Number(episode.number) && (!event.resolvedEpisode || Number(event.resolvedEpisode) > Number(episode.number)) && !normalized(episode.unresolvedEvents).includes(normalized(event.description))) issue('forgotten', `Unresolved since episode ${event.introducedEpisode}: “${event.description}”. It is absent from this episode’s unresolved events.`, episode, null, 'Carry this event into unresolved events, or record the episode in which it was resolved.', event.id);
    }
  }
  return [...issues, ...identityContinuity(project)];
}

export function makeBackup(projects = []) {
  return { format: BACKUP_FORMAT, version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), projects: copy(projects), assets: [], drafts: [], settings: [] };
}
export function mergeProjects(existing = [], incoming = []) {
  const result = new Map(existing.map(project => [project.id, copy(project)]));
  for (const project of incoming) {
    const prior = result.get(project.id);
    if (!prior || (Date.parse(project.updatedAt) || 0) >= (Date.parse(prior.updatedAt) || 0)) result.set(project.id, copy(project));
  }
  return [...result.values()];
}
export function validateBackup(value, { allowMissingAssets = false } = {}) {
  const errors = [];
  const plain = item => item !== null && typeof item === 'object' && !Array.isArray(item);
  const text = (item, field, path, required = false) => { if (typeof item[field] !== 'string' || (required && !item[field].trim())) errors.push(`${path}.${field} must be ${required ? 'a nonempty ' : 'a '}string.`); else if (item[field].length > 200000) errors.push(`${path}.${field} exceeds the text limit.`); };
  const array = (item, field, path) => { if (!Array.isArray(item[field])) { errors.push(`${path}.${field} must be an array.`); return []; } return item[field]; };
  const numeric = (item, field, path, minimum = 0) => { if (!Number.isFinite(Number(item[field])) || Number(item[field]) < minimum) errors.push(`${path}.${field} must be a number ≥ ${minimum}.`); };
  const safeId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id);
  const assetReferences = [];
  if (!plain(value)) return { valid: false, errors: ['Backup must be an object.'] };
  if (value.format !== BACKUP_FORMAT || value.version !== SCHEMA_VERSION) errors.push('Unsupported CineSaga backup format or schema version.');
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) errors.push('Backup export date is missing or invalid.');
  const projects = array(value, 'projects', 'backup');
  if (projects.length > 1000) errors.push('Backup has too many projects.');
  const seenProjects = new Set();
  for (const [i, p] of projects.entries()) {
    const path = `projects[${i}]`;
    if (!plain(p)) { errors.push(`${path} must be an object.`); continue; }
    errors.push(...validateStoryRecords(p));
    try{assertDirectorHistory(p);}catch{errors.push('Invalid director approval history.');}
    try{assertBridgeStory(p);}catch{errors.push('Invalid protected ChatGPT story.');}
    if(p.originalStory!==undefined)try{assertOriginalStory(p.originalStory);if(p.originalStory.episodeCount!==p.config.episodeCount)throw Error('Original episode count changed.');}catch(error){errors.push(error.message);}
    try { const identity = validateIdentity(p); errors.push(...identity.errors); assetReferences.push(...identity.assetReferences); } catch { errors.push(`${path} has malformed identity records.`); }
    text(p, 'id', path, true); text(p, 'title', path, true); text(p, 'idea', path); text(p, 'createdAt', path, true); text(p, 'updatedAt', path, true);
    if (!safeId(p.id)) errors.push(`${path}.id must be a safe local identifier.`);
    if (seenProjects.has(p.id)) errors.push(`${path} duplicates a project ID.`); seenProjects.add(p.id);
    if (!Number.isFinite(Date.parse(p.createdAt)) || !Number.isFinite(Date.parse(p.updatedAt))) errors.push(`${path} has an invalid saved date.`);
    if (typeof p.demo !== 'boolean') errors.push(`${path}.demo must be boolean.`);
    if (!plain(p.config) || !['en', 'ar'].includes(p.config?.language)) errors.push(`${path}.config must contain a supported language.`);
    else {
      for (const key of ['idea', 'genre', 'audience', 'dialect', 'visualStyle', 'controlMode']) text(p.config, key, `${path}.config`);
      if (!Number.isInteger(p.config.episodeCount) || p.config.episodeCount < 1 || p.config.episodeCount > 24) errors.push(`${path}.config.episodeCount must be an integer from 1 to 24.`);
      if (!Number.isFinite(p.config.episodeMinutes) || p.config.episodeMinutes < 1 || p.config.episodeMinutes > 120) errors.push(`${path}.config.episodeMinutes must be from 1 to 120.`);
    }
    if (!plain(p.bible)) errors.push(`${path}.bible must be an object.`);
    else for (const key of ['title', 'premise', 'genreTone', 'ending', 'worldRules', 'timeline', 'conflict', 'revealedSecrets', 'unrevealedSecrets', 'importantObjects', 'continuityNotes']) text(p.bible, key, `${path}.bible`);
    const entities = new Set();
    const inspectId = (entity, entityPath) => { if (!plain(entity)) { errors.push(`${entityPath} must be an object.`); return false; } text(entity, 'id', entityPath, true); if (!safeId(entity.id)) errors.push(`${entityPath}.id must be a safe local identifier.`); if (entities.has(entity.id)) errors.push(`${entityPath} duplicates an entity ID.`); entities.add(entity.id); if (typeof entity.archived !== 'boolean') errors.push(`${entityPath}.archived must be boolean.`); return true; };
    for (const [ci, character] of array(p, 'characters', path).entries()) { const cp = `${path}.characters[${ci}]`; if (!inspectId(character, cp)) continue; for (const key of ['name', 'role', 'ageRange', 'appearance', 'clothing', 'personality', 'voice', 'goals', 'fears', 'relationships', 'knows', 'doesNotKnow', 'referenceImageId']) text(character, key, cp); numeric(character, 'firstEpisode', cp, 1); if (character.referenceImageId) assetReferences.push({ assetId: character.referenceImageId, projectId: p.id, path: cp }); }
    for (const [li, location] of array(p, 'locations', path).entries()) { const lp = `${path}.locations[${li}]`; if (!inspectId(location, lp)) continue; for (const key of ['name', 'description', 'timeOfDay', 'lighting', 'atmosphere', 'importantObjects', 'purpose', 'referenceImageId']) text(location, key, lp); if (location.referenceImageId) assetReferences.push({ assetId: location.referenceImageId, projectId: p.id, path: lp }); }
    for (const [ei, episode] of array(p, 'episodes', path).entries()) {
      const ep = `${path}.episodes[${ei}]`; if (!inspectId(episode, ep)) continue;
      for (const key of ['title', 'beginning', 'mainEvent', 'turningPoint', 'ending', 'continuedFrom', 'continuityFacts', 'unresolvedEvents', 'currentStates']) text(episode, key, ep);
      numeric(episode, 'number', ep, 1); numeric(episode, 'durationMinutes', ep, 0.01);
      if (!EPISODE_STATUSES.includes(episode.status)) errors.push(`${ep}.status is unsupported.`);
      for (const key of ['characterIds', 'locationIds']) if (array(episode, key, ep).some(id => !safeId(id))) errors.push(`${ep}.${key} must contain safe local identifiers.`);
      for (const [si, scene] of array(episode, 'scenes', ep).entries()) {
        const sp = `${ep}.scenes[${si}]`; if (!inspectId(scene, sp)) continue;
        for (const key of ['locationId', 'visual', 'camera', 'action', 'dialogue', 'narration', 'sound', 'music', 'imageStatus', 'videoStatus', 'knowledgeUsed', 'appearanceOverrides', 'clothingOverrides']) text(scene, key, sp);
        numeric(scene, 'number', sp, 1); numeric(scene, 'seconds', sp, 0);
        if (scene.locationId && !safeId(scene.locationId)) errors.push(`${sp}.locationId must be a safe local identifier.`);
        if (array(scene, 'characterIds', sp).some(id => !safeId(id))) errors.push(`${sp}.characterIds must contain safe local identifiers.`);
      }
    }
    for (const [ei, event] of array(p, 'events', path).entries()) { if (!plain(event) || !safeId(event.id) || typeof event.description !== 'string' || !Number.isFinite(Number(event.introducedEpisode))) errors.push(`${path}.events[${ei}] is invalid.`); }
    if (!plain(p.ignoredIssues) || Object.values(p.ignoredIssues).some(reason => typeof reason !== 'string')) errors.push(`${path}.ignoredIssues must map issue IDs to reasons.`);
  }
  const assets = value.assets === undefined ? [] : array(value, 'assets', 'backup');
  const assetIds = new Set();
  for (const [i, asset] of assets.entries()) {
    if (!plain(asset) || !safeId(asset.id) || !safeId(asset.projectId) || typeof asset.name !== 'string' || typeof asset.type !== 'string' || typeof asset.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]*={0,2}$/.test(asset.dataUrl)) errors.push(`assets[${i}] must contain safe IDs and a supported local image data URL.`);
    else { if (asset.type!==asset.dataUrl.slice(5,asset.dataUrl.indexOf(';'))) errors.push(`assets[${i}] image MIME type does not match its data.`); if (assetIds.has(asset.id)) errors.push(`assets[${i}] duplicates an asset ID.`); assetIds.add(asset.id); if (!seenProjects.has(asset.projectId)) errors.push(`assets[${i}] references an unknown project.`); }
  }
  for (const field of ['drafts', 'settings']) if (value[field] !== undefined) for (const [i, row] of array(value, field, 'backup').entries()) if (!plain(row) || typeof row.key !== 'string' || !Object.hasOwn(row, 'value')) errors.push(`${field}[${i}] must have a key and value.`);
  for (const [i, row] of (Array.isArray(value.drafts) ? value.drafts : []).entries()) {
    if(row?.value?.type==='CHATGPT_BRIDGE_WORK')try{assertBridgeWork(row.value,row.key);}catch{errors.push('Invalid ChatGPT bridge work.');}
    if(row?.value?.type==='MANUAL_STORY_WORK')try{assertManualWork(row.value,row.key);}catch{errors.push('Invalid saved manual story work.');}
    if(row?.value?.type==='STORY_DIRECTOR_WORK')try{assertDirectorWork(row.value,row.key);}catch{errors.push('Invalid director work.');}
    if(row?.value?.type==='STORY_AGENT_WORK')try{assertAgentWork(row.value,row.key);}catch(error){errors.push(error.message);}
    if(row?.value?.type==='STORY_PROPOSAL')try{assertContractObject(row.value,['type','projectId','proposal']);assertProposal(row.value.proposal,row.value.projectId);if(row.key!==`${row.value.projectId}:story-proposal`)throw new Error('Invalid story draft key.');}catch(error){errors.push(error.message);}
    if (row?.value?.projectId && !seenProjects.has(row.value.projectId)) errors.push(`drafts[${i}] references an unknown project.`);
    if (row?.value?.data?.referenceImageId) assetReferences.push({ assetId: row.value.data.referenceImageId, projectId: row.value.projectId, path: `drafts[${i}]` });
  }
  for (const reference of assetReferences) {
    if (!safeId(reference.assetId)) errors.push(`${reference.path}.referenceImageId must be a safe local identifier.`);
    const asset = assets.find(item => item?.id === reference.assetId);
    if (!asset && !allowMissingAssets) errors.push(`${reference.path} references a missing local image.`);
    if (asset && asset.projectId !== reference.projectId) errors.push(`${reference.path} references an image owned by another series.`);
  }
  // Never accept prototype-bearing keys from imported JSON, even in drafts.
  const inspect = (item, depth = 0) => {
    if (depth > 40) { errors.push('Backup nesting exceeds the supported depth.'); return; }
    if (item && typeof item === 'object') for (const key of Object.keys(item)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) errors.push('Backup contains an unsafe object key.'); inspect(item[key], depth + 1); }
  };
  inspect(value);
  return { valid: errors.length === 0, errors: errors.slice(0, 100) };
}
