import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
let mockFresh=true, mockStatus='confirmed', mockHeld=false, mockSource='session-1', mockActive=true, mockHasLog=true;
jest.mock('../src/data/auth',()=>({useOwner:()=> 'owner-a',useAuth:()=>({isDiscovery:false})}));
jest.mock('../src/data/api',()=>({momentShare:jest.fn()}));
jest.mock('../src/data/queue',()=>({useQueue:()=>({items:[]})}));
jest.mock('../src/data/receipts',()=>({useReceipt:()=>mockStatus==='confirmed'?{log_id:'session-1',xp:0,credits:0,reward_held:mockHeld}:undefined}));
jest.mock('../src/ads/useSessionInterstitial',()=>({useSessionInterstitial:()=>async()=>{}}));
jest.mock('../src/components/Toast',()=>({useToast:()=>jest.fn()}));
jest.mock('../src/lib/haptics',()=>({haptic:jest.fn()}));
jest.mock('../src/screens/community/EventsScreen',()=>({useEvents:()=>({data:undefined})}));
jest.mock('../src/lib/network',()=>({useOnline:()=>true}));
jest.mock('../src/data/hooks',()=>({
 useSocial:()=>({data:undefined}),usePrefs:()=>({weeklyGoalSessions:3,cadencePauses:[]}),useProfile:()=>({data:{level:1,xp:0}}),
 useLogs:()=>{const log={id:'session-1',client_event_id:'event-1',sport:'yoga',date:new Date().toISOString().slice(0,10),duration:30,xp:0,syncStatus:mockStatus,details:{duration:30}};const logs=mockHasLog?[log]:[];return {logs,active:logs};},
 useAdventure:()=>({data:{owner:'owner-a',selected_world:'aube',level:1,xp:0,campaigns:mockActive?[{id:'aube',chapter:2,target:2,evidence:{days:1,source_ids:[mockSource]}}]:[]},isFetchedAfterMount:mockFresh,isFetching:false,isError:false})
}));
import { SessionResultScreen } from '../src/screens/session/SessionResultScreen';
const nav={navigate:jest.fn(),replace:jest.fn()} as never;
function show(params: Record<string, unknown> = {}){return render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><SessionResultScreen navigation={nav} route={{params:{eventId:'event-1', ...params}} as never}/></SafeAreaProvider>);}
beforeEach(()=>{mockFresh=true;mockStatus='confirmed';mockHeld=false;mockSource='session-1';mockActive=true;mockHasLog=true;jest.clearAllMocks();});
test('only fresh attributed evidence describes a confirmed chapter contribution',()=>{show();expect(screen.getByText(/Cette séance compte dans le chapitre 2 : 1\/2/)).toBeTruthy();expect(screen.getByLabelText('Avancée du chapitre confirmée')).toBeTruthy();expect(screen.getByText('Ta semaine')).toBeTruthy();expect(screen.getByText(/Encore 2 jours actifs pour tenir ta semaine/)).toBeTruthy();});
test('the week is visible at the moment of reward, without unfolding anything (AUD-17)',()=>{show();expect(screen.getByText('Ta semaine')).toBeTruthy();expect(screen.getByText('1/3 jours actifs')).toBeTruthy();expect(screen.queryByLabelText('Mes repères sportifs')).toBeNull();});
test.each(['pending','held','cached'])('%s awaits confirmation without a chapter claim',mode=>{mockStatus=mode==='pending'?'pending':'confirmed';mockHeld=mode==='held';mockFresh=mode!=='cached';show();expect(screen.getByText(/attend.*confirmation|attend.*vérification/i)).toBeTruthy();expect(screen.queryByLabelText('Avancée du chapitre confirmée')).toBeNull();});
test('unrelated evidence cannot be attributed to this session',()=>{mockSource='another-session';show();expect(screen.getByText(/n’attribue pas de nouvelle avancée/)).toBeTruthy();expect(screen.queryByLabelText('Avancée du chapitre confirmée')).toBeNull();});
test('no active world has an explicit next action',()=>{mockActive=false;show();expect(screen.getByText(/Aucun monde actif/)).toBeTruthy();fireEvent.press(screen.getByText('Découvrir les mondes'));expect((nav as any).navigate).toHaveBeenCalledWith('Tabs',{screen:'Adventure'});});

test('the locally stored effort remains visible before the journal refreshes', () => {
  mockHasLog = false;
  mockStatus = 'pending';
  show({ stored: { owner: 'owner-a', payload: { sport: 'yoga', category: 'training', val: 30, unit: 'min', date: new Date().toISOString(), details: { duration: 30, client_event_id: 'event-1' } } } });
  expect(screen.getByText('30 min')).toBeTruthy();
  expect(screen.getByText('Confirmation en attente')).toBeTruthy();
  expect(screen.queryByText('TITAN a confirmé')).toBeNull();
  fireEvent.press(screen.getByText('Voir les envois en attente'));
  expect((nav as any).replace).toHaveBeenCalledWith('Pending');
});

describe('result screen: effort → result → reward → next step (V1.3.1)', () => {
  const { resultNextStep } = require('../src/screens/session/SessionResultScreen');
  const week = { paused: false, remaining: 2 };
  const chapter = { number: 2, worldName: 'La vallée de l’Aube', ready: false, objectives: [{ id: 'days', remaining: 1 }, { id: 'effort', remaining: 45 }] };

  test('a held reward never borrows the "TITAN a confirmé" label, and says nothing is left to do', () => {
    mockHeld = true;
    show();
    expect(screen.queryByText('TITAN a confirmé')).toBeNull();
    expect(screen.getByText('Séance enregistrée · récompense en attente')).toBeTruthy();
    expect(within(screen.getByTestId('result-next')).getByText(/la récompense arrive d’elle-même/)).toBeTruthy();
  });
  test('a pending session announces no XP and no chapter progress', () => {
    mockStatus = 'pending';
    show();
    expect(screen.queryByText('TITAN a confirmé')).toBeNull();
    expect(screen.getByText('Confirmation en attente')).toBeTruthy();
    const next = within(screen.getByTestId('result-next'));
    expect(next.getByText(/part toute seule/)).toBeTruthy();
    expect(next.queryByText(/balise/)).toBeNull();
  });
  test('a confirmed session ends on one next step taken from the fresh chapter evidence', () => {
    show();
    expect(screen.getByText('TITAN a confirmé')).toBeTruthy();
    expect(within(screen.getByTestId('result-next')).getByText(/Encore 1 jour actif pour allumer la balise du chapitre 2/)).toBeTruthy();
  });
  test('the next step is honest for every state', () => {
    const base = { status: 'confirmed' as const, held: false, historical: false, chapterKnown: true, chapter, week };
    expect(resultNextStep(base)).toBe('Encore 1 jour actif et 45 min d’effort pour allumer la balise du chapitre 2. Un seul jour actif compte par jour, quel que soit le sport.');
    expect(resultNextStep({ ...base, chapter: { ...chapter, ready: true } })).toMatch(/La balise du chapitre 2 est prête : va l’allumer dans La vallée de l’Aube/);
    expect(resultNextStep({ ...base, chapter: null })).toMatch(/Choisis un monde/);
    // A stale or foreign snapshot never speaks of the chapter: the week is the fallback.
    expect(resultNextStep({ ...base, chapterKnown: false })).toBe('Encore 2 jours actifs pour tenir ta semaine.');
    expect(resultNextStep({ ...base, chapterKnown: false, week: { paused: false, remaining: 0 } })).toMatch(/Semaine tenue/);
    expect(resultNextStep({ ...base, status: 'error' })).toMatch(/envois en attente/);
    expect(resultNextStep({ ...base, status: 'pending' })).not.toMatch(/balise|chapitre/);
    expect(resultNextStep({ ...base, held: true })).not.toMatch(/balise|chapitre/);
    expect(resultNextStep({ ...base, historical: true })).toMatch(/30 jours/);
  });
});
