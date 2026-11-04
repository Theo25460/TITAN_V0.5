import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useOwner } from "../data/auth";
import { dismiss, loadTour, peekTour, progressLabel, saveTour, shouldOffer, TOUR_STEPS, type TourState } from "../lib/tour";
import { Button } from "./Button";
import { Card } from "./Card";
import { T } from "./Text";

/** A quiet invitation on the QG until the tour is finished or dismissed: start, or resume where it stopped. Never a forced screen. */
export function TourCard() {
  const owner = useOwner();
  const navigation = useNavigation();
  const [tour, setTour] = useState<TourState | null>(() => peekTour(owner));
  useEffect(() => {
    let alive = true;
    loadTour(owner).then((s) => alive && setTour(s));
    return () => {
      alive = false;
    };
  }, [owner]);
  if (!tour || !shouldOffer(tour)) return null;
  const started = tour.step > 0;
  return (
    <Card tone="accent" style={{ gap: 8 }} testID="tour-card">
      <T variant="bodyStrong">{started ? "Reprendre la visite de TITAN" : "Découvrir TITAN en 2 minutes"}</T>
      <T variant="small" tone="muted">
        {started ? `${progressLabel(tour)} : on reprend où tu t’étais arrêté.` : `${TOUR_STEPS.length} étapes courtes sur les vrais écrans. Facultatif, tu peux l’arrêter quand tu veux.`}
      </T>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button small label={started ? "Reprendre" : "Commencer"} onPress={() => (navigation as unknown as { navigate: (n: string) => void }).navigate("Guide")} testID="tour-start" />
        <Button
          small
          kind="ghost"
          label="Plus tard"
          onPress={() => {
            const next = dismiss(tour);
            setTour(next);
            saveTour(owner, next);
          }}
          testID="tour-later"
        />
      </View>
    </Card>
  );
}
