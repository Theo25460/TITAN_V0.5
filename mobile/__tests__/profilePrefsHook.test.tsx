import React from 'react';
import {act, renderHook, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider, onlineManager} from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('../src/lib/network',()=>({isOnline:()=>false}));
jest.mock('../src/data/auth',()=>({useOwner:()=> 'a'}));
jest.mock('../src/data/api',()=>({
 assertOwner:async()=>({user:{id:'a'}}),
 fetchProfile:jest.fn(async()=>null),
 savePreferences:jest.fn(async()=>{throw {message:'PROFILE_VERSION_CONFLICT',code:'PT409'};})
}));
import {keys,useSavePrefs} from '../src/data/hooks';
import * as api from '../src/data/api';
const p={id:'a',username:'A',state_version:1,game_state:{user:{weeklyGoalSessions:3}}};
beforeEach(async()=>{await AsyncStorage.clear();jest.clearAllMocks();});
afterEach(()=>onlineManager.setOnline(true));
function setup(cached=true){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:3,retryDelay:0,gcTime:0}}});
 if(cached)client.setQueryData(keys.profile('a'),p);
 const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return {client,...renderHook(()=>useSavePrefs(),{wrapper})};
}
test('offline mutation reaches durable save immediately instead of waiting in memory',async()=>{
 const h=setup();onlineManager.setOnline(false);
 act(()=>h.result.current.mutate({prefs:{weeklyGoalSessions:4}}));
 await waitFor(()=>expect(api.savePreferences).toHaveBeenCalledTimes(1));
 h.unmount();h.client.clear();
});
test('a conflict is never automatically replayed with a fresh version',async()=>{
 const h=setup();let error:unknown;
 await act(async()=>{try{await h.result.current.mutateAsync({prefs:{weeklyGoalSessions:4}});}catch(e){error=e;}});
 expect(error).toMatchObject({code:'PT409'});expect(api.savePreferences).toHaveBeenCalledTimes(1);expect(api.fetchProfile).not.toHaveBeenCalled();
 h.unmount();h.client.clear();
});
test('without a cached profile the intent is durable before any network fetch',async()=>{
 const h=setup(false);
 await act(async()=>{try{await h.result.current.mutateAsync({prefs:{weeklyGoalSessions:4}});}catch{}});
 const values=await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
 expect(values.some(([,v])=>v?.includes('weeklyGoalSessions'))).toBe(true);
 expect(api.fetchProfile).not.toHaveBeenCalled();h.unmount();h.client.clear();
});
