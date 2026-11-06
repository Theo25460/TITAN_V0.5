import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
let mockFresh=true, mockStatus='confirmed', mockHeld=false, mockSource='session-1', mockActive=true;
jest.mock('../src/data/auth',()=>({useOwner:()=> 'owner-a'}));
jest.mock('../src/data/api',()=>({momentShare:jest.fn()}));
jest.mock('../src/data/queue',()=>({useQueue:()=>({items:[]})}));
jest.mock('../src/data/receipts',()=>({useReceipt:()=>mockStatus==='confirmed'?{log_id:'session-1',xp:0,credits:0,reward_held:mockHeld}:undefined}));
jest.mock('../src/ads/useSessionInterstitial',()=>({useSessionInterstitial:()=>async()=>{}}));
jest.mock('../src/components/Toast',()=>({useToast:()=>jest.fn()}));
jest.mock('../src/lib/haptics',()=>({haptic:jest.fn()}));
jest.mock('../src/lib/network',()=>({useOnline:()=>true}));
jest.mock('../src/data/hooks',()=>({
 usePrefs:()=>({weeklyGoalSessions:3,cadencePauses:[]}),useProfile:()=>({data:{level:1,xp:0}}),
 useLogs:()=>{const log={id:'session-1',client_event_id:'event-1',sport:'yoga',date:new Date().toISOString().slice(0,10),duration:30,xp:0,syncStatus:mockStatus,details:{duration:30}};return {logs:[log],active:[log]};},
 useAdventure:()=>({data:{owner:'owner-a',selected_world:'aube',level:1,xp:0,campaigns:mockActive?[{id:'aube',chapter:2,target:2,evidence:{days:1,source_ids:[mockSource]}}]:[]},isFetchedAfterMount:mockFresh,isFetching:false,isError:false})
}));
import { SessionResultScreen } from '../src/screens/session/SessionResultScreen';
const nav={navigate:jest.fn(),replace:jest.fn()} as never;
function show(){return render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><SessionResultScreen navigation={nav} route={{params:{eventId:'event-1'}} as never}/></SafeAreaProvider>);}
beforeEach(()=>{mockFresh=true;mockStatus='confirmed';mockHeld=false;mockSource='session-1';mockActive=true;jest.clearAllMocks();});
test('only fresh attributed evidence describes a confirmed chapter contribution',()=>{show();expect(screen.getByText(/Cette séance compte dans le chapitre 2 : 1\/2/)).toBeTruthy();expect(screen.getByLabelText('Avancée du chapitre confirmée')).toBeTruthy();expect(screen.queryByText('Ta semaine')).toBeNull();fireEvent.press(screen.getByLabelText('Mes repères sportifs'));expect(screen.getByText('Ta semaine')).toBeTruthy();});
test.each(['pending','held','cached'])('%s awaits confirmation without a chapter claim',mode=>{mockStatus=mode==='pending'?'pending':'confirmed';mockHeld=mode==='held';mockFresh=mode!=='cached';show();expect(screen.getByText(/attend.*confirmation|attend.*vérification/i)).toBeTruthy();expect(screen.queryByLabelText('Avancée du chapitre confirmée')).toBeNull();});
test('unrelated evidence cannot be attributed to this session',()=>{mockSource='another-session';show();expect(screen.getByText(/n’attribue pas de nouvelle avancée/)).toBeTruthy();expect(screen.queryByLabelText('Avancée du chapitre confirmée')).toBeNull();});
test('no active world has an explicit next action',()=>{mockActive=false;show();expect(screen.getByText(/Aucun monde actif/)).toBeTruthy();fireEvent.press(screen.getByText('Découvrir les mondes'));expect((nav as any).navigate).toHaveBeenCalledWith('Tabs',{screen:'Adventure'});});
