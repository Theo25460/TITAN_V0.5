import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../lib/motion";
import { colors, radius, space } from "../theme/tokens";
import { Icon } from "./Icon";
import { Tap } from "./Pressable";
import { T } from "./Text";

/** Bottom sheet: closes with the Android back gesture, a tap outside or the close button. */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduced ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="height" style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" accessibilityRole="button">
          <View style={styles.scrim} />
        </Pressable>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.s4 }]} accessibilityViewIsModal>
          <View style={styles.grip} />
          <View style={styles.head}>
            {title ? (
              <T variant="h3" style={{ flex: 1 }}>
                {title}
              </T>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Tap onPress={onClose} accessibilityLabel="Fermer" style={styles.close} haptics={false}>
              <Icon name="close" size={20} color={colors.tx2} />
            </Tap>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.s4, paddingBottom: space.s2 }} style={{ maxHeight: "100%" }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingTop: space.s3 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: { maxHeight: "88%", backgroundColor: colors.bg2, borderTopLeftRadius: radius.r4, borderTopRightRadius: radius.r4, borderWidth: 1, borderColor: colors.line2, paddingHorizontal: space.s4 },
  grip: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line3, marginTop: 10 },
  head: { flexDirection: "row", alignItems: "center", paddingVertical: space.s2 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
