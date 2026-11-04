import React from 'react';
import {render,fireEvent,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaProvider} from 'react-native-safe-area-context';
jest.mock('../src/data/auth',()=>({useOwner:()=> 'a'}));
jest.mock('../src/lib/exportFile',()=>({shareTextFile:jest.fn(async()=>{})}));
jest.mock('../src/data/api',()=>({
 assertOwner:jest.fn(async()=>({user:{id:'a'}})),
 fetchProfile:jest.fn(async()=>({id:'a',state_version:2,game_state:{user:{notifications:{daily:true,weekly:false}}}})),
 savePreferences:jest.fn(async()=>({id:'a',state_version:3}))
}));
import {ProfileRecovery} from '../src/components/ProfileRecovery';
import {protectPreferences,listProfileCopies} from '../src/data/profileCopies';
import {savePreferences} from '../src/data/api';
import {shareTextFile} from '../src/lib/exportFile';
beforeEach(async()=>{jest.clearAllMocks();await AsyncStorage.clear();});
test('a durable edit can be exported then explicitly merged with fresh cloud preferences',async()=>{
 await protectPreferences('a',{prefs:{notifications:{daily:false,weekly:true}}},{prefs:{notifications:{daily:true,weekly:true}}});
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const view=render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:400,height:800},insets:{top:0,left:0,right:0,bottom:0}}}><QueryClientProvider client={client}><ProfileRecovery/></QueryClientProvider></SafeAreaProvider>);
 await waitFor(()=>expect(view.getByText('Préférences à récupérer')).toBeTruthy());
 fireEvent.press(view.getByText('Exporter cette copie'));
 await waitFor(()=>expect(shareTextFile).toHaveBeenCalledTimes(1));
 expect(await listProfileCopies('a')).toHaveLength(1);
 fireEvent.press(view.getByText('Réappliquer cette copie'));
 expect(savePreferences).not.toHaveBeenCalled();
 fireEvent.press(view.getByText('Confirmer la récupération'));
 await waitFor(()=>expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({state_version:2}),{notifications:{daily:false,weekly:false}},expect.any(Object)));
 await waitFor(async()=>expect(await listProfileCopies('a')).toHaveLength(0));
 view.unmount();client.clear();
});
