import {fireEvent,render,screen} from '@testing-library/react-native';
const mockNavigate=jest.fn(),mockSync=jest.fn(async()=>{}),mockRefresh=jest.fn(async()=>{}),mockState:{value:any}={value:{}};
jest.mock('@react-navigation/native',()=>({useNavigation:()=>({navigate:mockNavigate})}));
jest.mock('../src/data/journey',()=>({useJourney:()=>mockState.value}));
jest.mock('../src/components/RewardReveal',()=>({RewardReveal:()=>null}));
const {JourneyCard,CareerMilestones}=require('../src/components/JourneyCard');
const at='2026-11-05T12:00:00Z';
const snapshot=()=>({version:1,owner:'owner-a',configVersion:1,totalSteps:12000,goal:30000000,today:{day:'2026-11-05',steps:4000,sources:['health_connect'],updatedAt:at},discoveries:[{id:'a',steps:10000,world:'aube',name:'La première trace',story:'La brume se lève.',kind:'milestone',earnedAt:at},{id:'b',steps:30000,world:'aube',name:'Le refuge',story:'Une lumière sur le chemin.',kind:'milestone',earnedAt:null}],career:{level:8,milestones:[{id:'c5',level:5,title:'Premier souvenir',description:'Tes premières séances.',earnedAt:at},{id:'c10',level:10,title:'Passeur',description:'Ton prochain souvenir.',earnedAt:null}]}});
beforeEach(()=>{mockNavigate.mockClear();mockSync.mockClear();mockState.value={snapshot:snapshot(),loading:false,error:null,busy:false,refresh:mockRefresh,sync:mockSync};});
test('confirmed source, next small objective and long horizon without automatic writes',()=>{render(<JourneyCard owner="owner-a"/>);expect(screen.getByText('Les Sentiers du Titan')).toBeTruthy();expect(screen.getByText(/18 000 pas vers/)).toBeTruthy();expect(screen.getByText(/30 000 000/)).toBeTruthy();expect(screen.getByText(/Santé Connect/)).toBeTruthy();expect(mockSync).not.toHaveBeenCalled();});
test('threshold is not acquired until explicit confirmation',()=>{mockState.value.snapshot.totalSteps=35000;render(<JourneyCard owner="owner-a"/>);fireEvent.press(screen.getByText('Révéler mes découvertes'));expect(mockSync).toHaveBeenCalledTimes(1);});
test('no data is honest and sensor absence leaves campaigns playable',()=>{mockState.value.snapshot.totalSteps=0;mockState.value.snapshot.today=null;render(<JourneyCard owner="owner-a"/>);expect(screen.getByText(/Pas de données de pas confirmées/)).toBeTruthy();fireEvent.press(screen.getByText('Mes sources de pas'));expect(mockNavigate).toHaveBeenCalledWith('Sources');});
test('observed steps are shown as an overview and cannot reveal a souvenir', () => {
  Object.assign(mockState.value.snapshot, {
    totalSteps: 0, today: null, observedSteps: 30000000, observedToday: snapshot().today,
  });
  render(<JourneyCard owner="owner-a" />);
  expect(screen.getByText('Aperçu des pas reçus')).toBeTruthy();
  expect(screen.getByText(/Santé Connect/)).toBeTruthy();
  expect(screen.queryByText('Révéler mes découvertes')).toBeNull();
});
test('changing owner hides stale journal immediately',()=>{render(<JourneyCard owner="owner-b"/>);expect(screen.queryByText('La première trace')).toBeNull();expect(screen.queryByText(/18 000 pas vers/)).toBeNull();});
test('career next milestone and earned origin are separate',()=>{render(<CareerMilestones owner="owner-a"/>);expect(screen.getByText(/Niveau 10.*Passeur/)).toBeTruthy();fireEvent.press(screen.getByText('Mes jalons de carrière'));expect(screen.getByText('Premier souvenir')).toBeTruthy();expect(screen.getByText(/Confirmé le/)).toBeTruthy();});
test('missing RPC leaves retry and no invented zeros',()=>{mockState.value.snapshot=null;mockState.value.error='Absent';render(<JourneyCard owner="owner-a"/>);expect(screen.getByText(/Tes campagnes restent disponibles/)).toBeTruthy();fireEvent.press(screen.getByText('Réessayer'));expect(mockRefresh).toHaveBeenCalled();});
