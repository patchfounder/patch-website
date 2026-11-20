import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRecruitmentRuntime } from '../server/app.js';
import { hashCohortPassword, APPLICANT_COOKIE_NAME, createSignedCookieCodec } from '../server/recruitment-access.js';
import { hashAdminPassword } from '../server/recruitment-admin-auth.js';
import { createRecruitmentDatabase } from '../server/recruitment-db.js';
import { normalizeInvitationCode, parseInvitationSeeds } from '../server/recruitment-invitations.js';
const cookieSecret='synthetic-invitation-cookie-secret-2026-11-20';
const password='retired-synthetic-application-password';
async function fixture(t) {
 const dataRoot=mkdtempSync(path.join(os.tmpdir(),'patch-website-invitation-test-'));
 const runtime=await createRecruitmentRuntime({dataRoot,projectRoot:process.cwd(),secureCookies:false,
  env:{NODE_ENV:'test',RECRUITMENT_COOKIE_SECRET:cookieSecret,RECRUITMENT_REVIEWER_SECRET:'REVIEWER1234',
   RECRUITMENT_INVITATIONS_JSON:JSON.stringify(['C045','C007'])},
  adminPasswordHash:await hashAdminPassword('synthetic-administrator-secret'),
  emailSender:{configured:true,sendOutcome(){throw Error('Must not send email');}},
  audioInspector:async()=>({durationSeconds:1})});
 const hashed=await hashCohortPassword(password);
 runtime.database.createNextCohort({monthKey:'2026-11',displayName:'November 2026',opensAt:'2026-11-01T00:00:00.000Z',closesAt:'2027-01-01T00:00:00.000Z',passwordSalt:hashed.salt,passwordHash:hashed.hash,passwordParameters:hashed.parameters,createdAt:new Date().toISOString()});
 runtime.database.activateNext(runtime.database.previewActivateNext(),new Date().toISOString());
 const raw=new DatabaseSync(runtime.storage.databasePath);raw.prepare("UPDATE recruitment_cohorts SET always_open=1 WHERE slot='current'").run();
 const server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));raw.close();runtime.close();rmSync(dataRoot,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(route,{method='GET',body,cookie}={}){const response=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return{response,body:await response.json()};}
 const unlock=code=>request('/api/recruitment/unlock',{method:'POST',body:{invitationCode:code}});
 return{...runtime,raw,base,request,unlock,codec:createSignedCookieCodec(cookieSecret)};
}
const cookieOf=result=>result.response.headers.get('set-cookie').split(';')[0];

test('only registered codes unlock; exact Coach code and attribution survive cookie, upload and private reviewer read',async t=>{
 const f=await fixture(t);
 for(const code of ['C9999','C45','',45,'C045<script>']){const result=await f.unlock(code);assert.equal(result.response.status,401);assert.equal(result.body.code,'invalid_invitation_code');}
 assert.equal((await f.request('/api/recruitment/unlock',{method:'POST',body:{password}})).response.status,401,'old shared applicant password is not an invitation');
 const result=await f.unlock(' c045 ');assert.equal(result.response.status,200);
 const cookie=cookieOf(result),payload=f.codec.unseal(decodeURIComponent(cookie.split('=')[1]));
 assert.equal(payload.v,2);assert.equal(payload.invitationCode,'C045');assert.equal(payload.referrerCoachId,'C045');
 assert.equal((await f.request('/api/recruitment/status',{cookie})).body.unlocked,true);
 assert.doesNotMatch(JSON.stringify((await f.request('/api/recruitment/status')).body),/C045|C007/,'public status does not enumerate invitations');
 const form=new FormData();form.set('fullName','Synthetic Applicant');form.set('email','applicant@example.test');form.set('linkedin','https://example.test/applicant');form.set('audio',new Blob(['synthetic-private-audio'],{type:'audio/webm'}),'voice.webm');form.set('invitationCode','C007');form.set('referrerCoachId','C007');
 const submitted=await fetch(f.base+'/api/recruitment/applications',{method:'POST',headers:{cookie},body:form});assert.equal(submitted.status,201);
 const id=(await submitted.json()).application.applicationId,application=f.database.getApplication(id);
 assert.equal(application.invitationCode,'C045');assert.equal(application.referrerCoachId,'C045','submitted fields cannot replace signed attribution');
 const savedBytes=readFileSync(path.join(f.storage.audioDirectory,application.audioStorageKey));assert.equal(savedBytes.toString(),'synthetic-private-audio');
 const admin=await f.request('/api/recruitment/reviewer/login',{method:'POST',body:{password:'synthetic-administrator-secret'}});assert.equal(admin.response.status,200);
 const state=await f.request('/api/recruitment/reviewer/state',{cookie:cookieOf(admin)});assert.equal(state.body.current.invitationCode,'C045');assert.equal(state.body.current.referrerCoachId,'C045');
 assert.equal((await f.request('/api/recruitment/reviewer/state',{cookie})).response.status,401);
});

test('old applicant cookies, revoked invitations, changed referrers and expired sessions cannot submit',async t=>{
 const f=await fixture(t),cohort=f.database.getCohortBySlot('current');
 const old=f.codec.seal({v:1,kind:'applicant',cohortId:cohort.cohortId,passwordRevision:cohort.passwordRevision,exp:Math.floor(Date.now()/1000)+3600});
 assert.equal((await f.request('/api/recruitment/status',{cookie:`${APPLICANT_COOKIE_NAME}=${old}`})).body.unlocked,false);
 const unlocked=await f.unlock('C045'),cookie=cookieOf(unlocked),payload=f.codec.unseal(decodeURIComponent(cookie.split('=')[1]));
 for(const changes of[{referrerCoachId:'C007'},{invitationCode:'C007'},{exp:0}]){
  const modified=`${APPLICANT_COOKIE_NAME}=${f.codec.seal({...payload,...changes})}`;assert.equal((await f.request('/api/recruitment/status',{cookie:modified})).body.unlocked,false);
 }
 f.database.invitations.revoke('C045');assert.equal((await f.unlock('C045')).response.status,401);
 assert.equal((await f.request('/api/recruitment/status',{cookie})).body.unlocked,false);
 const blocked=await fetch(f.base+'/api/recruitment/applications',{method:'POST',headers:{cookie}});assert.equal(blocked.status,401);
 assert.equal(f.database.listAudioStorageKeys().length,0);
 assert.throws(()=>f.database.invitations.register([{code:'C007',coachId:'C008'}]),/different Coach/);
 f.database.invitations.register(['C045']);assert.equal(f.database.invitations.get('C045').active,false,'startup seeds never reactivate a revoked invitation');
});

test('attribution is revalidated inside the save transaction and rejected audio is cleaned up',async t=>{
 const f=await fixture(t),access=f.service.unlockApplicantInvitation('C045');
 const store=f.storage.storeAudio.bind(f.storage);let storageKey;
 const racingService=(await import('../server/recruitment-service.js')).createRecruitmentService({database:f.database,emailSender:{configured:false},storage:{...f.storage,storeAudio(...args){const result=store(...args);storageKey=result.storageKey;f.database.invitations.revoke('C045');return result;}}});
 assert.throws(()=>racingService.submitApplication({sessionPayload:access.sessionPayload,fullName:'Race Applicant',email:'race@example.test',linkedinUrl:'https://example.test/race',audioDurationSeconds:1,audioBuffer:Buffer.from('race-audio'),audioMimeType:'audio/webm'}),/expired/);
 assert.equal(f.database.listAudioStorageKeys().length,0);assert.equal(existsSync(path.join(f.storage.audioDirectory,storageKey)),false);
});

test('invitation migration is additive and retains old application, email and audio metadata on reopen',async t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'patch-invitation-migration-')),file=path.join(directory,'recruitment.sqlite');let db=createRecruitmentDatabase({databasePath:file});
 const passwordHash=await hashCohortPassword('synthetic-old-password');
 db.createNextCohort({monthKey:'2026-11',displayName:'November 2026',opensAt:'2026-11-01T00:00:00.000Z',closesAt:'2026-12-01T00:00:00.000Z',passwordSalt:passwordHash.salt,passwordHash:passwordHash.hash,passwordParameters:passwordHash.parameters,createdAt:'2026-11-01T00:00:00.000Z'});
 const {current}=db.activateNext(db.previewActivateNext(),'2026-11-01T00:00:00.000Z');
 mkdirSync(path.join(directory,'audio'));const audioPath=path.join(directory,'audio','retained.webm');writeFileSync(audioPath,'private retained recording');
 const application=db.createApplication({cohortId:current.cohortId,fullName:'Retained Applicant',email:'retained@example.test',linkedinUrl:'https://example.test/retained',audioStorageKey:'2026-11/retained.webm',audioMimeType:'audio/webm',audioFileSize:26,audioDurationSeconds:1,submittedAt:'2026-11-02T00:00:00.000Z'});
 db.decideApplication(application.applicationId,'pass','2026-11-03T00:00:00.000Z');db.recordEmailResult(application.applicationId,{ok:true,providerId:'retained-provider'});db.decideTeamApplication(application.applicationId,'invited','2026-11-04T00:00:00.000Z');
 const raw=new DatabaseSync(file);raw.exec('DROP INDEX recruitment_applications_invitation; ALTER TABLE recruitment_applications DROP COLUMN invitation_code; ALTER TABLE recruitment_applications DROP COLUMN referrer_coach_id; DROP TABLE recruitment_invitations; PRAGMA user_version=3;');
 const before=raw.prepare('SELECT * FROM recruitment_applications').all(),cohortsBefore=raw.prepare('SELECT * FROM recruitment_cohorts').all();raw.close();db.close();db=createRecruitmentDatabase({databasePath:file});
 t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});assert.equal(db.healthCheck().schemaVersion,4);
 const inspection=new DatabaseSync(file);try{assert.deepEqual(inspection.prepare('SELECT * FROM recruitment_cohorts').all(),cohortsBefore);const after=inspection.prepare('SELECT * FROM recruitment_applications').all();assert.deepEqual(after.map(({invitation_code,referrer_coach_id,...record})=>record),before.map(record=>({...record})));assert.equal(after[0].invitation_code,null);assert.equal(after[0].referrer_coach_id,null);}finally{inspection.close();}
 assert.equal(readFileSync(audioPath,'utf8'),'private retained recording');assert.equal(db.getApplication(application.applicationId).teamDecision,'invited');
 assert.equal(normalizeInvitationCode('c045'),'C045');assert.equal(normalizeInvitationCode('C0007'),'C0007');
 assert.throws(()=>parseInvitationSeeds('["C045",{"code":"C045","coachId":"bad"}]'),/existing referring Coach/);
});
