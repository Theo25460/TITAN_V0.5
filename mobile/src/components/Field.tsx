import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius, TOUCH } from "../theme/tokens";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

type Props = TextInputProps & { label?: string; hint?: string; error?: string | null; suffix?: string; secure?: boolean; compact?: boolean };

export const Field = forwardRef<TextInput, Props>(function Field({ label, hint, error, suffix, secure, compact, style, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ gap: 6, flex: compact ? 1 : undefined }}>
      {label ? (
        <T variant="caption" tone="muted">
          {label}
        </T>
      ) : null}
      <View style={[styles.box, focused && styles.focused, !!error && styles.error]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.tx4}
          selectionColor={colors.cy}
          cursorColor={colors.cy}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          accessibilityHint={error ?? hint}
          secureTextEntry={secure ? hidden : undefined}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, compact && styles.inputCompact, style]}
          {...rest}
        />
        {suffix ? (
          <T variant="caption" tone="faint" style={{ paddingRight: compact ? 10 : 14 }}>
            {suffix}
          </T>
        ) : null}
        {secure ? (
          <Tap onPress={() => setHidden((h) => !h)} accessibilityLabel={hidden ? "Afficher le mot de passe" : "Masquer le mot de passe"} style={styles.eye} haptics={false}>
            <Icon name="eye" size={20} color={colors.tx3} />
          </Tap>
        ) : null}
      </View>
      {error ? (
        <T variant="caption" tone="err" accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T variant="caption" tone="faint">
          {hint}
        </T>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", minHeight: TOUCH + 4, borderRadius: radius.r2, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.bg1 },
  focused: { borderColor: colors.cy },
  error: { borderColor: colors.err },
  input: { flex: 1, minWidth: 0, color: colors.tx, fontFamily: fonts.textSemi, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  inputCompact: { paddingHorizontal: 10 },
  eye: { width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center", borderRadius: TOUCH },
});
