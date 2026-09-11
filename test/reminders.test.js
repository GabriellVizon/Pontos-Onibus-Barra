'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function setup(){
 let stored='[]',timers=[];
 const ctx=vm.createContext({window:{},Date,console,
  localStorage:{getItem:()=>stored,setItem:(_k,v)=>stored=v},
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout:()=>{}});
 for(const f of ['js/horarios.js','js/reminders.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
 return {ctx,reminders:ctx.window.Reminders,timers,store:v=>stored=JSON.stringify(v),read:()=>JSON.parse(stored)};
}
test('migração não dispara lembretes antigos da Circular e preserva Plena',()=>{
 const s=setup();const future=Date.now()+3600000;
 s.store([{id:'circular',stopId:36,triggerAt:future},{id:'entrada',stopId:'13',triggerAt:future},{id:'plena',stopId:101,triggerAt:future}]);
 s.reminders.init();assert.deepEqual(s.read().map(r=>r.id),['plena']);assert.equal(s.timers.length,1);
});
test('Circular não agenda novamente um lembrete sem cobertura confiável',()=>{
 const s=setup();assert.equal(s.reminders.add({stopId:16,departure:'18:00',minutesBefore:5}),null);
 assert.equal(s.timers.length,0);assert.deepEqual(s.read(),[]);
});
