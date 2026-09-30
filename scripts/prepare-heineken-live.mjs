/** Create-only content pack for the full event. No publishing or demo updates.
 * NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... node scripts/prepare-heineken-live.mjs [--equipment /path/to/equipment.json] [--write]
 * Credentials stay in the environment. Run without --write to review the plan.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getStore } from '@netlify/blobs';
import { normalizeMiniPollRecord, normalizeFillGameRecord } from '../netlify/functions/lib/live-modules.mjs';
import { normalizePinboardRecord } from '../netlify/functions/lib/pinboard.mjs';
import { normalizeExperienceRecord, linearStepsToGraph, toExperienceIndexEntry } from '../netlify/functions/lib/experience.mjs';
import { wrapBlobsCasFetch, wrapBlobsCasStore } from '../netlify/functions/lib/cas-store.mjs';

const PACK = 'heineken-live-2026';
export const FLOW_SLUG = 'keg-talk-live';
function id(key) {
  const s = createHash('sha256').update(`${PACK}:${key}`).digest('hex');
  return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;
}
function placeholder(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="460" viewBox="0 0 800 460"><rect width="800" height="460" rx="24" fill="#173f31"/><rect x="28" y="28" width="744" height="404" rx="16" fill="none" stroke="#d3f56a" stroke-width="2" stroke-dasharray="12 10"/><text x="400" y="185" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="32" fill="#f5f4ec">${label}</text><text x="400" y="245" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#d3f56a">APPROVED PHOTO TO FOLLOW</text><text x="400" y="290" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#f5f4ec">Draft placeholder</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const polls = [
  ['Easy pour', 'Which is easier to pour?', ['Stout', 'Lager'], 'Back your choice. Who in the room disagrees?'],
  ['Keg confession', 'Have you ever been sprayed by a keg?', ['Yes', 'No'], 'Be honest. We want the story afterwards.'],
  ['Coupler spotter', 'Which of these is a Bluebird coupler?', ['A', 'B'], 'Draft: equipment photos and correct answer awaiting confirmation.'],
  ['Know your gas', 'Which gas is used in draught systems?', ['Carbon dioxide', 'Nitrogen', 'Both'], 'Draft: correct answer awaiting confirmation.'],
  ['Name that switch', 'What is this?', ['Switch for the return valve', 'Switch to turn off gas'], 'Draft: switch photo, wording and correct answer awaiting confirmation.'],
  ['FOB check', 'Is this FOB vented?', ['Yes', 'No'], 'Draft: photo showing the intended state and correct answer awaiting confirmation.'],
  ['The final step', 'Final step of kegging: release the float or vent the FOB?', ['Release the float', 'Vent the FOB'], 'Draft: correct answer awaiting confirmation.'],
  ['Slow pour', 'The beer is pouring slowly from the tap in the bar. What is the more likely cause?', ['A cooling system issue', 'A gas issue'], 'Draft: correct answer awaiting confirmation.'],
];
const fillQuestions = [
  ['How much has alcohol consumption in Ireland dropped by over the past two decades?', ['10%', '24%', '34%', '40%'], 2],
  ['Non-alcohol beer sales grew by how much in 2024?', ['5%', '12%', '25%', '35%'], 2],
  ['What does “moderation without judgement” mean for bar staff?', ['Making customers feel awkward if they order a 0.0', 'Confidently offering lower/no-alcohol options as part of a great night out', 'Keeping lower/no-alcohol options off the menu', 'Only offering 0.0 when asked'], 1],
  ['How many consumers believe a clean glass is important to drink quality?', ['50%', '69%', '77%', '90%'], 3],
  ['Which of these is the most common cause of a technical callout?', ['Cooler failure', 'Product quality issue', 'Gas-related issues', 'Font replacement'], 2],
  ['Which of these is NOT an ingredient in stout?', ['Roasted barley', 'Water', 'Hops', 'Apples'], 3],
  ['How many pints are in a 50-litre keg?', ['18', '58', '88', '108'], 2],
  ['What is the most likely cause of a pint pouring with too much foam?', ['Incorrect gas pressure', 'A clean and correctly maintained font', 'A full keg being connected correctly', 'A chilled glass being used'], 0],
  ['What should you check first if a tap is pouring slowly or not pouring at all?', ['Replace the font immediately', 'Check that the keg is connected correctly and has product available', 'Change the glassware', 'Increase the gas pressure to maximum'], 1],
  ['What is the purpose of keeping draught equipment lines clean?', ['To make the keg last longer', 'To improve product quality and maintain the perfect serve', 'To increase the gas pressure', 'To change the colour of the beer'], 1],
  ['A customer says their pint tastes flat and has very little carbonation. What should you investigate?', ['Gas supply and pressure', 'Glass shape', 'Font design', 'Keg label'], 0],
  ['The beer is pouring warm. What should you investigate first?', ['Cooler system', 'Glass washer', 'Tap handle', 'Keg label'], 0],
];
const pins = [
  ['Your next skill', 'What’s one skill you’d love to master behind the bar?', 'One skill. Add it to the wall, then see who shares your ambition.'],
  ['Calling the Quality Team', 'What do you think is the most common reason for calling out the Heineken Quality Team?', 'Share your experience. The host will bring a few answers into the conversation.'],
  ['The good shifts', 'What’s the best part of working behind the bar?', 'The people, the pace, the perfect pint? Tell us yours.'],
  ['Famous faces', 'Who’s the most famous person you’ve ever served?', 'Name the person. Save the story for the room.'],
  ['The learning curve', 'What’s the hardest skill to learn in the bar?', 'What took you the longest to get right?'],
  ['Explain it to an alien', 'In three words, explain a keg to an alien without using the word “keg”.', 'Three words. No “keg”. Let’s see what the room comes up with.'],
  ['Your bar’s soundtrack', 'What would your bar’s theme song be?', 'Song title and artist. We’ll compare the room’s picks.'],
  ['Know your system', 'Name three parts of a draught system.', 'Add your three parts to the wall.'],
];

export function buildHeinekenPack({ experience: demo, poll, fill, pinboard, equipment = {} }) {
  const now = new Date().toISOString();
  const common = (slug, title) => ({id:id(slug),slug,title,clientName:'Heineken Ahhh-cademy',projectCode:'KEG-LIVE',designCode:'',updatedAt:now,reportingEnabled:false,reportingLockedAt:null,archived:false,showPoweredBy:false,metadata:{contentPack:PACK}});
  const theme = {...poll.branding,layoutMode:'inherit'};
  const modules = polls.map(([name, question, labels, subquestion], i) => {
    const slug = `${FLOW_SLUG}-poll-${String(i+1).padStart(2,'0')}`;
    const doc = normalizeMiniPollRecord({...poll,...common(slug,`This or That ${i+1} — ${name}`),question,subquestion,correctOptionId:'',revealDurationMs:3000,branding:theme,questionImageUrl:'',questionImageAlt:'',options:labels.map((label,j)=>({id:id(`${slug}-option-${j}`),label,imageUrl:'',accessibleLabel:label}))});
    if (i===2) {
      doc.options=doc.options.map((o,j)=>({...o,imageUrl:(j?equipment.standard:equipment.bluebird)||placeholder(`Coupler ${j?'B':'A'}`),accessibleLabel:`Coupler ${j?'B':'A'}`}));
      if(equipment.bluebird&&equipment.standard){doc.correctOptionId=doc.options[0].id;doc.subquestion='Look closely. Which coupler is the Bluebird?';}
    }
    if (i===4 || i===5) {doc.questionImageUrl=(i===4&&equipment.switch)||placeholder(i===4?'Identify the switch':'Is this FOB vented?');doc.questionImageAlt=i===4&&equipment.switch?'Identify the switch shown':'Draft equipment photograph placeholder';if(i===4&&equipment.switch){doc.correctOptionId=doc.options[0].id;doc.subquestion='Recognise this part of the setup?';}}
    return doc;
  });
  const questions=fillQuestions.map(([prompt, labels, correct],i)=>({id:id(`fill-question-${i}`),enabled:true,prompt,choices:labels.map((label,j)=>({id:id(`fill-question-${i}-choice-${j}`),label})),correctChoiceId:id(`fill-question-${i}-choice-${correct}`)}));

  modules.push(normalizeFillGameRecord({...fill,...common(`${FLOW_SLUG}-fill`,'Fill the Keg — The Cellar Showdown'),presenterHeading:'The Cellar Showdown',presenterBody:'Correct answers fill your keg. Wrong answers lose a point. First full keg wins—or lead when time runs out.',questions,metric:'percent',teams:fill.teams.map((t,i)=>({...t,id:`team-${i?'b':'a'}`,name:i?'Tap Team':'Keg Crew',target:15})),branding:{...fill.branding,layoutMode:'inherit'}}));
  pins.forEach(([name,prompt,subhead],i)=>{
    const slug=`${FLOW_SLUG}-pin-${String(i+1).padStart(2,'0')}`;
    modules.push(normalizePinboardRecord({...structuredClone(pinboard),...common(slug,`Room Talk ${i+1} — ${name}`),board:{...pinboard.board,header:prompt,subhead},mobile:{...pinboard.mobile,headline:prompt,subheadline:subhead,submitLabel:'Send to the wall',thankYouMessage:'Sent. Keep an eye on the screen.',guestSubmit:{allowTypedNotes:true,allowPhotos:false,allowDrawnNotes:false}},layoutMode:'inherit'}));
  });
  // FOB remains editable in the library, outside the event route until its photo is approved.
  const linearSteps=modules.filter(m=>m.slug!==`${FLOW_SLUG}-poll-06`).map((m,i)=>({id:`step-${i+1}`,moduleInstanceId:m.id,moduleType:m.gameType,label:m.title}));
  const outstanding=['Confirm correct answers and host explanations for This or That 4, 7 and 8.','FOB poll 6 is a reserve library item: provide a clear image and answer before adding it to the route.','Review running order and choose which Room Talk prompts to use.','Set the Fill timer and attendance target in Flow Master before the race.'];
  const experience=normalizeExperienceRecord({...demo,...common(FLOW_SLUG,'Keg Talk — Full Live Experience'),status:'draft',publishedAt:null,previewToken:randomUUID(),graph:linearStepsToGraph(linearSteps),linearSteps,metadata:{contentPack:PACK,contentStatus:'Awaiting final content',outstanding},foundation:{...demo.foundation,interactive:true,joinScreen:{...demo.foundation.joinScreen,headline:'KEG TALK',eyebrow:'THE AHHH-CADEMY',headerLabel:'AHHH-CADEMY LIVE',instructions:'Pick a side. Back your crew. Bring your bar stories.',joinCue:'Scan the code and keep your phone handy.',phoneHeadline:'You’re in.',phoneBody:'Keep this screen open. Your host will take it from here.',closingHeadline:'GOOD SHIFTS TAKE GOOD CREWS.',closingTakeaway:'Take one good idea back behind the bar.',closingThanks:'Thanks for bringing the stories, the opinions and the team spirit.'}}});
  return {version:1,contentPack:PACK,experience,modules,outstanding};
}

export async function prepare({siteID,token,write=false,equipment={}}) {
  if(!siteID||!token) throw new Error('NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are required');
  const store=wrapBlobsCasStore(getStore({name:'rngames-platform',siteID,token,consistency:'strong',fetch:wrapBlobsCasFetch()}),'rngames-platform',{readConsistency:'strong'});
  const sourceIndex=await store.get('wheels-index',{type:'json'});
  const expIndex=await store.get('experiences-index',{type:'json'});
  const demoRow=expIndex?.list?.find(x=>x.slug==='keg-talk');
  if(!demoRow)throw new Error('Existing Keg Talk demo not found');
  const source={experience:await store.get(`experience:${demoRow.id}`,{type:'json'})};
  for(const kind of ['poll','fill','pinboard']){const row=sourceIndex.list.find(x=>x.slug===`keg-talk-${kind}`);if(!row)throw new Error(`Missing demo ${kind}`);source[kind]=await store.get(`wheel:${row.id}`,{type:'json'});}
  const pack=buildHeinekenPack({...source,equipment});
  if(write){
    // Append only new records. Re-running never replaces later editorial changes.
    const rows=pack.modules.map(m=>({id:m.id,slug:m.slug,gameType:m.gameType,title:m.title,clientName:m.clientName,projectCode:m.projectCode,designCode:m.designCode,updatedAt:m.updatedAt,reportingEnabled:false,thumbnailUrl:m.thumbnailUrl||'',archived:false}));
    const oldSlugs=[...(sourceIndex?.list||[]),...(expIndex?.list||[])];
    for(const m of [...pack.modules,pack.experience]){const clash=oldSlugs.find(x=>x.slug===m.slug&&x.id!==m.id);if(clash)throw new Error(`Slug already used: ${m.slug}`);}
    for(const m of pack.modules){const key=`wheel:${m.id}`;if(!await store.get(key,{type:'json'}))await store.setJSON(key,m,{onlyIfNew:true});}
    const ekey=`experience:${pack.experience.id}`;
    if(!await store.get(ekey,{type:'json'}))await store.setJSON(ekey,pack.experience,{onlyIfNew:true});
    for(const [key,newRows] of [['wheels-index',rows],['experiences-index',[toExperienceIndexEntry(pack.experience)]]]){
      let complete=false;
      for(let attempt=0;attempt<8;attempt++){
        const old=await store.getWithMetadata(key,{type:'json'});
        const list=old?.data?.list||[];const missing=newRows.filter(x=>!list.some(y=>y.id===x.id));
        if(!missing.length){complete=true;break;}
        const res=await store.setJSON(key,{list:[...list,...missing],updatedAt:new Date().toISOString()},old?.etag?{onlyIfMatch:old.etag}:{onlyIfNew:true});
        if(res.modified){complete=true;break;}
      }
      if(!complete)throw new Error(`Concurrent index edit: retry preparation for ${key}`);
    }
    pack.experience=await store.get(ekey,{type:'json'});
  }
  return pack;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  const equipmentArg=process.argv.indexOf('--equipment');
  const equipment=equipmentArg<0?{}:JSON.parse(await readFile(process.argv[equipmentArg+1],'utf8'));
  const pack=await prepare({siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_AUTH_TOKEN,write:process.argv.includes('--write'),equipment});
  console.log(JSON.stringify({written:process.argv.includes('--write'),experience:{id:pack.experience.id,slug:pack.experience.slug,status:pack.experience.status},modules:pack.modules.map(m=>({id:m.id,slug:m.slug,title:m.title})),outstanding:pack.outstanding},null,2));
}
