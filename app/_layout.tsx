import 'react-native-gesture-handler';
import Mapbox from '@rnmapbox/maps';
import {Stack} from 'expo-router';import {StatusBar} from 'expo-status-bar';import {ActivityIndicator,StyleSheet,View} from 'react-native';import {SafeAreaProvider} from 'react-native-safe-area-context';
import {BottomNav} from '@/components/BottomNav';import {NewGame} from '@/components/NewGame';import {colors} from '@/components/theme';import {useGameStore} from '@/store/gameStore';
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '');
export default function Layout(){const hydrated=useGameStore(s=>s.hydrated),started=useGameStore(s=>s.hasStarted);return <SafeAreaProvider><StatusBar style="light"/>{!hydrated?<View style={s.loading}><ActivityIndicator color={colors.primary}/></View>:!started?<NewGame/>:<><Stack screenOptions={{headerShown:false,animation:'fade'}}/><BottomNav/></>}</SafeAreaProvider>}
const s=StyleSheet.create({loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.bg}});
