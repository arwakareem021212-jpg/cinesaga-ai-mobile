import {DEMO_LABEL,TEXT_FIELDS} from './story-contract.js';
// Stable local samples exercise the provider contract; they do not understand arbitrary instructions.
function token(value){let n=2166136261;for(const letter of value)n=Math.imul(n^letter.charCodeAt(0),16777619);return(n>>>0).toString(36);}
export class DemoStoryAdapter {
  label=DEMO_LABEL;
  generate({project,context,request,revision=0}) {
    const ar=context.language==='ar',egyptian=ar&&context.dialect==='Egyptian',alt=revision%2,changes=[];
    const say=(en,arabic)=>ar?arabic:en;
    const note=request.instructions?.trim()?say(` Director's note: ${request.instructions}`,` ملاحظة المخرج: ${request.instructions}`):'';
    const take=revision?say(` — alternative ${revision+1}`,` — بديل ${revision+1}`):'';
    const add=(kind,target,field,value,episodeId)=>{const before=field==='$new'?null:target[field];if(field!=='$new'&&before===value)return;const descriptor={kind,id:target.id,...(episodeId?{episodeId}:{})};changes.push({id:'text-'+token(JSON.stringify(descriptor)+field),target:descriptor,field,before,value,selected:true});};
    const bible=project.bible;
    const premise=say(`${project.idea} The discovery forces the protagonist to choose between a private ambition and protecting someone who trusts them.`,` ${project.idea} يفرض الاكتشاف على البطل الاختيار بين طموحه وحماية شخص يثق به.`).trim()+take;
    if(['complete','direction','bible'].includes(request.task)){
      const values={premise,conflict:say(alt?'A trusted ally offers a shortcut with a hidden cost.':'Each attempt to solve the mystery makes a promise harder to keep.','كل محاولة لحل اللغز تجعل الوفاء بوعد سابق أصعب.')+note+take,ending:say('The protagonist earns the answer by accepting the cost of an honest choice.','يصل البطل إلى الإجابة عندما يقبل ثمن اختيار صادق.')+take};
      if(request.task!=='direction')Object.assign(values,{genreTone:`${context.genre} · `+say('Curiosity, mounting consequences, and earned hope','فضول وعواقب متصاعدة وأمل مستحق'),worldRules:(bible.worldRules||say('Every discovery must have a cause.','لكل اكتشاف سبب.'))+'\n'+say('A solution must use an established rule; no unexplained rescue.','يستخدم الحل قاعدة سبق تأسيسها، دون إنقاذ بلا تمهيد.'),timeline:bible.timeline||say('Events follow episode order.','تتبع الأحداث ترتيب الحلقات.'),continuityNotes:say('Track promises, clues, and what each character has actually learned.','تتبّع الوعود والأدلة وما تعلّمته كل شخصية بالفعل.')+take});
      for(const [key,value] of Object.entries(values))add('bible',{...bible,id:project.id},key,value);
    }
    if(['complete','characters'].includes(request.task)){
      const cast=request.task==='characters'?(request.characterId?project.characters.filter(c=>c.id===request.characterId):[]):project.characters.filter(c=>!c.archived);
      if(!cast.length){const id='story-character-'+token(project.id+project.updatedAt+JSON.stringify(request));add('character',{id},'$new',{name:say('The watchkeeper','حارس الساعة')+take,role:say('An ally who challenges the protagonist’s easy answers.','حليف يختبر إجابات البطل السهلة.'),personality:say('Observant, proud, and reluctant to ask for help.','دقيق الملاحظة ومعتز بنفسه ويتردد في طلب المساعدة.'),goals:say('Repair a promise before it is too late.','إصلاح وعد قبل فوات الأوان.')+note,fears:say('Being trusted for the wrong reason.','أن يثق به الآخرون لسبب خاطئ.'),relationships:say('Trust must be earned through actions.','تُكتسب الثقة بالأفعال.'),knows:'',doesNotKnow:'',firstEpisode:1});}
      for(const c of cast){for(const [field,value] of Object.entries({goals:(c.goals||say('Find the truth.','العثور على الحقيقة.'))+' '+say('Choose which promise matters most.','تحديد الوعد الأهم.')+take,personality:(c.personality||say('Curious','فضولي'))+'; '+say(alt?'hides uncertainty behind humor':'notices small details but avoids asking for help',alt?'يخفي قلقه بالمزاح':'يلاحظ التفاصيل ويتردد في طلب المساعدة')+take}))add('character',c,field,value);}
    }
    const episodes=project.episodes.filter(e=>!e.archived).sort((a,b)=>a.number-b.number);
    const proposedEndings=new Map();
    if(['complete','season','episode'].includes(request.task)){
      for(const episode of episodes.filter(e=>request.task!=='episode'||e.id===request.episodeId)){
        const prior=episodes.filter(e=>e.number<episode.number).at(-1),last=episode.id===episodes.at(-1)?.id;
        const ending=last?say('The promise is kept, but the characters must live with the choice.','يُوفى الوعد وتبقى على الشخصيات مسؤولية الاختيار.'):say(`A clue links the discovery to a promise made before episode ${episode.number}.`,`يربط دليل جديد الاكتشاف بوعد سبق الحلقة ${episode.number}.`);
        const values={beginning:prior?say('A direct consequence of the previous ending forces a new decision.','تفرض نتيجة نهاية الحلقة السابقة قرارًا جديدًا.'):say('An ordinary task reveals a detail that should not exist.','تكشف مهمة عادية تفصيلًا لا يفترض وجوده.'),mainEvent:say(`${project.idea} Episode ${episode.number}: the characters test a clue and pay a personal cost.`,`${project.idea} الحلقة ${episode.number}: تختبر الشخصيات دليلًا وتدفع ثمنًا شخصيًا.`)+note+take,turningPoint:say(alt?'A character admits a mistake that changes the plan.':'A useful discovery contradicts the safest plan.',alt?'تعترف شخصية بخطأ يغير الخطة.':'يتعارض اكتشاف مفيد مع الخطة الأكثر أمانًا.')+take,ending:ending+take,continuedFrom:prior?(proposedEndings.get(prior.id)||prior.ending):'',continuityFacts:episode.continuityFacts||context.world.rules,unresolvedEvents:episode.unresolvedEvents||context.events.filter(e=>!e.resolvedEpisode||e.resolvedEpisode>episode.number).map(e=>e.description).join('\n'),currentStates:say('Record only what the characters have learned in approved scenes.','سجّل فقط ما تعلّمته الشخصيات في المشاهد المعتمدة.')};
        proposedEndings.set(episode.id,values.ending);
        for(const [field,value] of Object.entries(values))add('episode',episode,field,value);
      }
    }
    if(['complete','scenes','dialogue'].includes(request.task)){
      const targets=request.task==='complete'?episodes:episodes.filter(e=>e.id===request.episodeId);
      for(const episode of targets){
        const scenes=request.task==='complete'?episode.scenes.filter(s=>!s.archived):episode.scenes.filter(s=>s.id===request.sceneId&&!s.archived);
        const firstCharacter=project.characters.find(c=>!c.archived&&c.firstEpisode<=episode.number),speaker=firstCharacter?.name||say('Narrator','الراوي');
        const dialogue=egyptian?`${speaker}: ${alt?'خلّينا نتأكد الأول… مين هيخسر لو إحنا غلط؟':'استنّى… لو خدنا الطريق السهل، هنكسَر وعدنا.'}${take}`:say(`${speaker}: ${alt?'Before we decide, who pays if we are wrong?':'If we take the easy way, we break our promise.'}${take}`,`${speaker}: ${alt?'قبل أن نقرر، من سيدفع الثمن إن أخطأنا؟':'إذا اخترنا الطريق السهل، سنخلف وعدنا.'}${take}`);
        const values={visual:say('A familiar place becomes unfamiliar when a small detail changes.','يتغير تفصيل صغير فيصبح المكان المألوف غريبًا.')+take,action:say(alt?'The protagonist puts the clue down and asks the ally to make the first choice.':'The protagonist reaches for the clue, pauses, then offers it to the ally.','يمد البطل يده نحو الدليل، يتوقف، ثم يقدمه إلى حليفه.')+note+take,dialogue,narration:say('The answer mattered less than the promise it would test.','لم تكن الإجابة أهم من الوعد الذي ستختبره.')+take};
        if(!scenes.length&&request.task!=='dialogue'){
          const location=project.locations.find(l=>!l.archived);if(!location)continue;
          add('scene',{id:'story-scene-'+token(project.id+project.updatedAt+episode.id+request.task)},'$new',{...values,locationId:location.id,characterIds:project.characters.filter(c=>!c.archived&&c.firstEpisode<=episode.number).map(c=>c.id),seconds:Math.min(45,episode.durationMinutes*60),timeline:episode.timelineStart||episode.number},episode.id);
        }
        for(const scene of scenes)for(const field of TEXT_FIELDS.scene.filter(field=>request.task!=='dialogue'||['dialogue','narration'].includes(field)))add('scene',scene,field,values[field],episode.id);
      }
    }
    return changes;
  }
}
