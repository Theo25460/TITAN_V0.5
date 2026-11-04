import AsyncStorage from '@react-native-async-storage/async-storage';
let mockOwner='a';let mockError: unknown=null;let mockResolve: ((v: unknown)=>void)|null=null;
let mockHang=false;let mockHeader='';
const mockRpc=jest.fn((_name: string,_params: unknown)=>{
 const q={setHeader: (_k: string,v: string)=>{mockHeader=v;return q;},then:(ok: (v: unknown)=>unknown,no: (v: unknown)=>unknown)=>{
 const p=mockHang?new Promise(r=>mockResolve=r):Promise.resolve({data:{id:'a',state_version:2,game_state:{user:{weeklyGoalSessions:4}},xp:7,credits:2},error:mockError});return p.then(ok,no);
 }};return q;
});
jest.mock('../src/lib/supabase', () => ({supabase: {
 rpc: (...args: [string, unknown]) => mockRpc(...args),
 auth: {getSession: async () => ({data: {session: {user: {id: mockOwner},access_token: `token-${mockOwner}`}}})}
}}));
import {savePreferences} from '../src/data/api';
import type {Profile} from '../src/core/types';
const profile={id:'a',username:'A',state_version:1,game_state:{user:{weeklyGoalSessions:3}},privacy:{},xp:7,credits:2} as unknown as Profile;
beforeEach(async()=>{await AsyncStorage.clear();mockRpc.mockClear();mockOwner='a';mockError=null;mockHang=false;mockHeader='';mockResolve=null;});
test('preference writes cannot use the replacement account token',async()=>{
 mockOwner='b';await expect(savePreferences(profile,{weeklyGoalSessions:4})).rejects.toThrow('AUTH_REQUIRED');expect(mockRpc).not.toHaveBeenCalled();
});
test('a hundred unchanged preferences cause no RPC',async()=>{
 for(let i=0;i<100;i++)await savePreferences(profile,{weeklyGoalSessions:3});expect(mockRpc).not.toHaveBeenCalled();
});
test('writes pin the token and preserve a copy before response, rejecting a late account switch',async()=>{
 mockHang=true;const sending=savePreferences(profile,{weeklyGoalSessions:4});
 for(let i=0;i<30&&!mockResolve;i++)await new Promise(r=>setImmediate(r));
 const header=mockHeader,keys=await AsyncStorage.getAllKeys();
 mockOwner='b';mockResolve!({data:{id:'a',state_version:2},error:null});
 await expect(sending).rejects.toThrow('AUTH_REQUIRED');
 expect(header).toBe('Bearer token-a');expect(keys.some(k=>k.startsWith('titan.preferences-pending.'))).toBe(true);
});
test('PT409 returns once with a durable pending copy',async()=>{
 mockError={code:'PT409',message:'PROFILE_VERSION_CONFLICT'};
 await expect(savePreferences(profile,{weeklyGoalSessions:4})).rejects.toMatchObject({code:'PT409'});
 expect(mockRpc).toHaveBeenCalledTimes(1);expect((await AsyncStorage.getAllKeys()).some(k=>k.startsWith('titan.preferences-pending.'))).toBe(true);
});

test('reverting while a write is in flight preserves the second intent',async()=>{
 mockHang=true;const first=savePreferences(profile,{weeklyGoalSessions:4});
 const second=savePreferences(profile,{weeklyGoalSessions:3});
 await expect(second).rejects.toThrow('PROFILE_SAVE_IN_PROGRESS');
 for(let i=0;i<30&&!mockResolve;i++)await new Promise(r=>setImmediate(r));
 mockResolve!({data:{id:'a',state_version:2},error:null});await first;
 const {listProfileCopies,mergePreferenceCopy}=require('../src/data/profileCopies');
 const copies=await listProfileCopies('a');expect(copies).toHaveLength(1);
 expect(mergePreferenceCopy(copies[0],{...profile,state_version:2,game_state:{user:{weeklyGoalSessions:4}}}).prefs.weeklyGoalSessions).toBe(3);
 expect(mockRpc).toHaveBeenCalledTimes(1);
});
test.each(['40001','PT409'])('%s never retries, keeps intent and leaves economy out of payload',async code=>{
 mockError={code,message:'PROFILE_VERSION_CONFLICT'};
 await expect(savePreferences(profile,{weeklyGoalSessions:4})).rejects.toMatchObject({code});
 const args=mockRpc.mock.calls[0][1] as any;
 expect(args.p_state).toEqual({user:{weeklyGoalSessions:4},meta:{profileVersion:1}});
 expect(args.p_inventory).toEqual({});expect(mockRpc).toHaveBeenCalledTimes(1);
 const {listProfileCopies}=require('../src/data/profileCopies');
 expect((await listProfileCopies('a'))[0].edit.prefs.weeklyGoalSessions).toBe(4);
 expect(await listProfileCopies('b')).toEqual([]);
});
test('failed durable storage prevents sending',async()=>{
 (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
 await expect(savePreferences(profile,{weeklyGoalSessions:4})).rejects.toThrow('disk full');
 expect(mockRpc).not.toHaveBeenCalled();
});
test('three-way recovery preserves independent nested edits on the other device',async()=>{
 const {protectPreferences,preferenceBase,mergePreferenceCopy,listProfileCopies}=require('../src/data/profileCopies');
 const initial={...profile,game_state:{user:{notifications:{daily:true,weekly:true}}}};
 const edit={prefs:{notifications:{daily:false,weekly:true}}};
 await protectPreferences('a',edit,preferenceBase(initial,edit));
 // Read only persisted data, as after process closure/restart.
 const copy=(await listProfileCopies('a'))[0];
 const fresh={...initial,state_version:2,game_state:{user:{notifications:{daily:true,weekly:false,coach:true}}}};
 expect(mergePreferenceCopy(copy,fresh)).toEqual({prefs:{notifications:{daily:false,weekly:false,coach:true}}});
 expect(()=>mergePreferenceCopy(copy,{...fresh,id:'b'})).toThrow('PROFILE_MISMATCH');
});
