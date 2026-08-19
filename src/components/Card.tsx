import {PropsWithChildren} from 'react';import {StyleSheet,View,ViewStyle} from 'react-native';import {colors} from './theme';
export function Card({children,style}:PropsWithChildren<{style?:ViewStyle}>){return <View style={[s.card,style]}>{children}</View>}const s=StyleSheet.create({card:{backgroundColor:colors.card,borderRadius:20,borderWidth:1,borderColor:colors.border,padding:16}});
