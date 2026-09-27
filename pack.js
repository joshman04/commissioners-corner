'use strict';
const $ = id => document.getElementById(id);
let cards=[],index=0,opening=false,muted=false,context;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const music=new Audio('football-music.mp3');
music.preload='auto';music.volume=.45;
function playMusic(){if(!muted&&!document.hidden&&opening)music.play().catch(()=>{$('sound').textContent='Tap for sound';});}
function effect(duration,frequency,volume){
  if(muted||document.hidden)return;
  try{
    context ||= new (window.AudioContext||window.webkitAudioContext)();
    context.resume().catch(()=>{});
    const buffer=context.createBuffer(1,Math.floor(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/data.length)*(.3+.7*Math.abs(Math.sin(i/530)));
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;filter.type='highpass';filter.frequency.value=frequency;gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);gain.connect(context.destination);source.start();
  }catch{}
}
function render(){
  effect(.16,2600,.045);
  const card=cards[index];$('card').src=card.image;$('card').alt=`${card.player}, rank ${card.rank}, ${card.points.toFixed(2)} fantasy points`;
  $('card').classList.remove('arrive');void $('card').offsetWidth;$('card').classList.add('arrive');
  $('player').textContent=card.player;$('details').textContent=`#${card.rank} OF THE WEEK · ${card.points.toFixed(2)} FANTASY POINTS`;
  let teamLabel=$('fantasy-team');
  if(!teamLabel){teamLabel=document.createElement('p');teamLabel.id='fantasy-team';$('player').after(teamLabel);}
  teamLabel.textContent=card.fantasy_team||'';
  teamLabel.style.cssText='color:#c4cfdd;font-size:16px;margin:0 0 10px;line-height:1.4';
  $('count').textContent=`${index+1} / ${cards.length}`;$('prev').disabled=index===0;$('next').disabled=index===cards.length-1;
  $('complete').hidden=index!==cards.length-1;
  [...$('dots').children].forEach((dot,i)=>dot.setAttribute('aria-current',String(i===index)));
  // Effects are optional: a failed animation must never block the card.
  try { celebrate(index); } catch (error) { console.warn('Celebration skipped', error); }
}
function move(step){if($('reveal').hidden||$('zoom').open)return;const next=Math.max(0,Math.min(cards.length-1,index+step));if(next===index)return;index=next;render();}
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'Sound off':'Sound on ♫';$('sound').setAttribute('aria-pressed',String(!muted));if(muted){music.pause();context?.suspend();}else{context?.resume();playMusic();}};
$('open').onclick=()=>{
  if(opening)return;opening=true;$('open').disabled=true;music.currentTime=0;playMusic();effect(.65,1600,.16);
  $('open').classList.add('ripping');setTimeout(()=>{$('sealed').hidden=true;$('reveal').hidden=false;index=0;render();$('card-view').focus();},reduced?0:850);
};
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);
document.addEventListener('keydown',e=>{if($('reveal').hidden||$('zoom').open)return;if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}});
let start,swiped=false;
$('card-view').addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};swiped=false;});
$('card-view').addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){swiped=true;move(dx<0?1:-1);}});
$('card-view').addEventListener('pointercancel',()=>{start=null;});
$('card-view').onclick=()=>{if(swiped){swiped=false;return;}$('large').src=cards[index].image;$('large').alt=$('card').alt;$('download').href=cards[index].image;$('zoom').showModal();};
$('close').onclick=()=>$('zoom').close();
$('replay').onclick=()=>{music.pause();music.currentTime=0;$('reveal').hidden=true;$('sealed').hidden=false;opening=false;$('open').classList.remove('ripping');$('open').disabled=false;$('open').focus();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){music.pause();context?.suspend();}else if(!muted){playMusic();context?.resume();}});
window.addEventListener('pagehide',()=>music.pause());
async function load(){try{
  const response=await fetch('pack-2026-week-2.json', {cache:'no-store'});if(!response.ok)throw Error();cards=(await response.json()).cards;if(!cards?.length)throw Error();
  await Promise.all(cards.map(card=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=card.image;})));
  $('dots').replaceChildren(...cards.map((card,i)=>{const button=document.createElement('button');button.setAttribute('aria-label',`Show card ${i+1}: ${card.player}`);button.onclick=()=>{index=i;render();};return button;}));
  $('loading').textContent='Your pack is ready.';$('open').disabled=false;
}catch{$('loading').textContent='The pack could not load. Refresh to try again.';}}
load();

// Visual effects never modify the supplied card artwork.
const confettiLayer=document.createElement('div');
confettiLayer.style.cssText='position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:80';
confettiLayer.className='confetti-layer';confettiLayer.setAttribute('aria-hidden','true');
document.body.append(confettiLayer);
const cheeredCards=new Set();
let cheerSource;
function celebrate(cardIndex){
  confettiLayer.replaceChildren();
  {
    const finale=cards[cardIndex]?.rank===1;
    const colors=finale?['#ffd700','#d4a017','#fff1a8','#b8860b']:['#b8e629','#122847','#c8d2dc','#ffffff'];
    const total=finale?240:170;
    for(let i=0;i<total;i++){
      const bit=document.createElement('i');
      const left=i%2===0;
      bit.style.cssText=`position:absolute;display:block;border-radius:1px;left:${left?8:92}%;top:${i%3===0?0:55}%;background:${colors[i%colors.length]};width:${6+Math.random()*7}px;height:${10+Math.random()*15}px;`;
      confettiLayer.append(bit);
      const x=(left?1:-1)*(60+Math.random()*innerWidth*.85),y=innerHeight*(.5+Math.random()*.6);
      if(reduced){bit.style.left=`${Math.random()*100}%`;bit.style.top=`${Math.random()*100}%`;setTimeout(()=>bit.remove(),900);continue;}
      const animation=bit.animate([
        {transform:'translate(0,0) rotate(0deg)',opacity:0},
        {transform:`translate(${x*.45}px,${-130-Math.random()*220}px) rotate(160deg)`,opacity:1,offset:.3},
        {transform:`translate(${x}px,${y}px) rotate(${450+Math.random()*500}deg)`,opacity:0}
      ],{duration:3800+Math.random()*1700,delay:Math.random()*(finale?850:500),fill:'backwards',easing:'cubic-bezier(.15,.5,.5,1)'});
      animation.onfinish=()=>bit.remove();
    }
  }
  // One cheer per card per page visit; revisits and replay stay quiet.
  if(cheeredCards.has(cardIndex))return;
  if(muted||document.hidden)return;
  try{
    context ||= new (window.AudioContext||window.webkitAudioContext)();
    context.resume().catch(()=>{});
    cheerSource?.stop();
    // Procedural crowd wash: overlapping, formant-like voices and scattered claps.
    const duration=2.6,rate=context.sampleRate,buffer=context.createBuffer(2,Math.floor(rate*duration),rate);
    for(let channel=0;channel<2;channel++){
      const samples=buffer.getChannelData(channel);
      let wash=0;
      for(let i=0;i<samples.length;i++){
        const t=i/rate,envelope=Math.min(1,t/.18)*Math.pow(1-t/duration,1.4);
        wash=.86*wash+.14*(Math.random()*2-1);
        let voices=0;
        for(let v=0;v<9;v++){
          const f=180+v*29+channel*7+22*Math.sin(t*(2+v*.17));
          voices+=Math.sin(2*Math.PI*f*t)*Math.sin(2*Math.PI*(f*.013)*t)*.013;
        }
        const clap=(Math.sin(t*37+channel)> .94 ? (Math.random()*2-1)*.15 : 0);
        samples[i]=(wash*.65+voices+clap)*envelope;
      }
    }
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;gain.gain.value=1.0;source.connect(gain);gain.connect(context.destination);
    source.start();cheerSource=source;cheeredCards.add(cardIndex);
  }catch{}
}

function ownerStamp(cardIndex){
  document.querySelector('.owner-stamp')?.remove();
  const card=cards[cardIndex];if(!card.owner_logo)return;
  const stamp=document.createElement('div');stamp.className='owner-stamp';
  const ownerStyles={1:['Gino','#ff991f','#43250b'],2:['Rick','#e4c491','#173a36'],3:['Jordan','#45ba64','#163626'],4:['Louis','#26bdf3','#071321'],5:['Josh','#050b10','#149dd6']};
  const [owner,ink,edge]=ownerStyles[card.rank];
  stamp.classList.add('name-stamp');stamp.style.setProperty('--owner-ink',card.rank===1?'#ffd447':'#b8e629');stamp.style.setProperty('--owner-edge','#1769d1');
  const label=document.createElement('span');label.textContent=card.fantasy_team;
  stamp.append(label);$('reveal').append(stamp);
  positionStamp(stamp);
  if(card.rank===1)stamp.classList.add('gold');
  if(reduced)return;
  const animation=stamp.animate([
    {transform:'translate(0,-60px) rotate(-12deg) scale(1.8)',opacity:0},
    {transform:'translate(0,0) rotate(-8deg) scale(.92)',opacity:1,offset:.24},
    {transform:'translate(0,0) rotate(-8deg) scale(1.04)',opacity:1,offset:.29},
    {transform:'translate(0,0) rotate(-8deg) scale(1)',opacity:1,offset:.36},
    {transform:'translate(0,0) rotate(-8deg) scale(1)',opacity:1,offset:.85},
    {transform:'translate(0,0) rotate(-8deg) scale(1)',opacity:1}
  ],{duration:700,delay:1100,fill:'both',easing:'ease-out'});
  // Keep the owner badge visible until the next card replaces it.
}

function positionStamp(stamp=document.querySelector('.owner-stamp')){
  if(!stamp)return;
  document.querySelector('.owner-dock')?.remove();
  const image=$('card'),box=image.getBoundingClientRect(),parent=$('reveal').getBoundingClientRect();
  if(!image.naturalWidth)return;
  const scale=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  stamp.style.width=Math.min(330,width*.52)+'px';
  // Upper-left safe zone below WFC NOW, clear of the player and lower data.
  stamp.style.left=(box.left-parent.left+(box.width-width)/2+width*.055)+'px';
  stamp.style.top=(box.top-parent.top+(box.height-height)/2+height*.105)+'px';
  stamp.style.fontSize=Math.max(22,Math.min(43,width*.078))+'px';
}
$('card').addEventListener('load',()=>positionStamp());
window.addEventListener('resize',()=>positionStamp());
