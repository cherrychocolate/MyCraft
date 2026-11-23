const originalForms=models.slice();
function makeSpace(act,r){
 const pieces=[];function part(x,y,z,w,h,d,c,t='brick',moving=false){pieces.push({p:[x,y,z],w,h,d,color:bright[c],type:t,cat:'P',moving})}
 const color=['purple','green','blue','yellow'][r];
 part(0,-1.6,0,6.7,.34,4.6,'white','plate');
 for(let i=-2;i<=2;i++)part(i*1.24,-1.13,1.95,1.2,.44,.39,color);
 for(let i=-2;i<=2;i++)for(let j=0;j<(act===1?1:3);j++)part(i*1.25,-1+j*.7,-1.9,1.23,.68,.52,j===2?color:'white');
 function desk(x,z){for(let dx of [-.72,.72])part(x+dx,-.95,z,.32,.95,.8,color);part(x,-.35,z,2,.25,1.2,'white','plate')}
 desk(-1.45,0);
 if(r===0){part(-1.45,.65,0,1.6,1.8,.25,'purple','tile');for(let i=0;i<3;i++)part(-1.9+i*.4,.6+i*.22,.19,.38,.38,.14,['orange','yellow','cyan'][i],'tile');part(1,-.5,.4,.5,1.5,.5,'blue');part(1.3,.4,.4,1.5,.32,.32,'orange','beam',true)}
 if(r===1){part(-1.45,.25,0,1.35,.9,.3,'cyan','tile');part(-1.45,.28,.19,.62,.18,.1,'white','tile');part(-1.45,.28,.2,.18,.62,.1,'white','tile');part(1.35,-.8,.4,2,.3,1.35,'blue','plate');part(1.3,-.1,.4,1.15,1.15,.56,'orange','wheel',true)}
 if(r===2){part(-1.45,-.1,0,1.85,.22,1.25,'green','tile');for(let i=0;i<3;i++)part(-2+i*.48,.14,0,.32,.34,.34,'yellow','round',true);part(1,-.4,.2,1.8,1.6,.7,'orange');part(1,.58,.2,.75,.27,.36,'blue','beam')}
 if(r===3){part(-1.45,.36,-.2,1.8,1.2,.3,'blue','tile');part(-1.45,-.13,.4,1.65,.15,.62,'cyan','tile');part(1,-.55,.4,1.3,.55,1.25,'purple');part(1,.05,.4,1.12,.48,1.12,'yellow','round',true)}
 if(act===1){if(beat>=1)for(let i=0;i<3;i++)part(-1.6+i*1.15,-.72,1.23,1.08,.82,.86,['cyan','blue','yellow'][i]);if(beat>=2)part(.8,-.04,1.23,.88,.45,.88,'orange','round',true)}
 if(act===2&&(market||joined))for(let i=0;i<3;i++)part(2.5,.26+i*.19,1.1,1.32,.13,1.1,'cyan','plate',true);
 if(act===3){for(let i=0;i<4;i++)part(2+i*.7,-1.38,1.4,.65,.2,.8,'blue','plate');part(docked?2.1:4.15,-.69,1.4,1.65,1,.95,expert?'cyan':'purple');part(docked?2.1:4.15,-.03,1.4,1.85,.28,1.18,'orange','slope')}
 return pieces}
