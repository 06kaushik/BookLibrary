import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme';



export function Action({label, onPress, disabled = false, primary = false}) {

  
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        disabled,
      }}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.action,
        primary && styles.primary,
        (disabled || pressed) && styles.dim,
      ]}>
      <Text style={[styles.actionText, primary && styles.primaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}


export function Notice({text, warning = false}) {
  return (
    <View style={[styles.notice, warning && styles.warning]}>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.noticeText, warning && styles.warningText]}>
        {text}
      </Text>
    </View>
  );
}



const styles = StyleSheet.create({
  action: {
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primary: {
    backgroundColor: colors.green,
  },
  dim: {
    opacity: 0.48,
  },
  actionText: {
    color: colors.green,
    fontWeight: '700',
  },
  primaryText: {
    color: colors.white,
  },
  notice: {
    backgroundColor: colors.softGreen,
    borderRadius: 9,
    padding: 10,
  },
  warning: {
    backgroundColor: colors.warning,
  },
  noticeText: {
    color: colors.green,
    fontWeight: '600',
  },
  warningText: {
    color: colors.warningInk,
  },
});
